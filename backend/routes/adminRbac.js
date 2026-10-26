'use strict';

/**
 * Platform RBAC administration API (REC-005, INV-3, INV-6).
 *
 * This is the surface an operator uses to change what a role may do, and to grant
 * a role to a person without a deploy. Every mutation here:
 *
 *  - requires SUPER_ADMIN (the router-level `requireSuperAdmin`);
 *  - requires a recent sign-in (`requireRecentAdminAuthentication`), because a
 *    stolen long-lived session must not be enough to reshape authority;
 *  - requires a typed reason;
 *  - writes an audit row whose `before`/`after` are computed server-side;
 *  - invalidates the in-process RBAC cache so the change takes effect on the next
 *    request rather than on the next deploy or restart (REC-005 acceptance 2).
 *
 * Reads are available to anyone who may audit (`audit.read`) or read security
 * state (`security.read`), because "who can do what" is compliance information.
 *
 * Mounted at `/api/admin/rbac` in `index.js`.
 *
 * @module routes/adminRbac
 */

const express = require('express');

const { requireAuth, requireSuperAdmin, requirePermission, requireRecentAdminAuthentication } = require('../security/auth');
const { recordAdminAuditLog, sanitizeAuditValue } = require('../security/adminAudit');
const metrics = require('../services/operationalMetrics');
const administration = require('../services/adminRbacAdministration');
const rbac = require('../services/adminRbac');

const router = express.Router();

/**
 * Turn a service error into the project's error envelope.
 *
 * Domain errors carry `status` and `code`; anything else is a store failure and
 * must be reported as 503 rather than 500, because a 500 on an authority change
 * reads as "maybe it worked", which is the worst possible answer.
 *
 * @param {import('express').Response} res
 * @param {unknown} error
 */
function respondWithError(res, error) {
  const status = Number(error?.status) || (error?.code === 'ECONNREFUSED' || error?.code === 'ER_NO_SUCH_TABLE' ? 503 : 500);
  const code = error?.code && /^[A-Z_]+$/.test(String(error.code)) ? String(error.code) : 'RBAC_OPERATION_FAILED';
  const message = status === 500 ? 'The authority change could not be completed' : String(error?.message || 'The authority change could not be completed');
  // One place to count a lost trail: every path in this module funnels here, and a failed
  // audit write is the one 503 that must raise an alarm rather than a retry.
  if (code === 'AUDIT_WRITE_FAILED') metrics.recordAuditWriteFailure('route');
  if (status >= 500) {
    console.error('[AdminRBAC] rbac.write_failed', JSON.stringify({ code, message: String(error?.message || error) }));
  }
  const field = typeof error?.field === 'string' ? error.field : undefined;
  return res.status(status).json({ success: false, error: { code, message, ...(field ? { field } : {}), requestId: res.locals?.requestId } });
}

/**
 * Persist the audit row for an authority mutation.
 *
 * Awaited: the response is only a success if the trail contains the change. A
 * fire-and-forget audit is how an authority change ends up with no trace.
 *
 * The `before`/`after` values come from the service (which read them from the
 * store), never from the request body — a client-supplied "before" would let a
 * caller author a flattering history.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} event action, scope, reason, before, after, and change detail
 * @returns {Promise<object|null>} the audit record, when the repository returns one
 */
async function auditAuthorityChange(req, res, event) {
  const { action, ...detail } = event;
  return recordAdminAuditLog(req, {
    actorUid: req.user?.uid || 'unknown',
    actorEmail: req.user?.email || null,
    actorRole: String(req.user?.claims?.role || '').toUpperCase() || null,
    action,
    category: 'iam.rbac',
    severity: 'HIGH',
    outcome: 'SUCCESS',
    method: req.method,
    pathname: req.originalUrl || req.path,
    statusCode: res.statusCode,
    requestId: res.locals?.requestId || null,
    metadata: sanitizeAuditValue('metadata', detail),
  });
}

/* ── reads ───────────────────────────────────────────────────────────── */

router.get('/roles', requirePermission(['audit.read', 'security.read']), async (_req, res) => {
  const store = rbac.__storeForAdministration();
  try {
    const roles = await store.listRoles();
    const permissions = await store.listRolePermissions();
    const counts = new Map();
    for (const row of permissions) {
      counts.set(row.role, (counts.get(row.role) || 0) + 1);
    }
    return res.json({
      success: true,
      source: rbac.describeResolution(),
      roles: roles
        .map(role => ({
          name: role.name,
          rank: role.rank,
          isSystem: Boolean(role.isSystem),
          editable: !administration.PLATFORM_MANAGED_ROLES.includes(role.name),
          storedPermissionCount: counts.get(role.name) || 0,
        }))
        .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return respondWithError(res, error);
  }
});

router.get('/roles/:role/permissions', requirePermission(['audit.read', 'security.read']), async (req, res) => {
  try {
    const role = administration.normaliseRole(req.params.role);
    const stored = await rbac.listStoredRolePermissions(role);
    return res.json({ success: true, role, permissions: stored, editable: !administration.PLATFORM_MANAGED_ROLES.includes(role) });
  } catch (error) {
    return respondWithError(res, error);
  }
});

router.get('/grants', requirePermission(['audit.read', 'security.read']), async (_req, res) => {
  try {
    const store = rbac.__storeForAdministration();
    return res.json({ success: true, grants: await store.listGrants() });
  } catch (error) {
    return respondWithError(res, error);
  }
});

/* ── writes ──────────────────────────────────────────────────────────── */

router.put(
  '/roles/:role/permissions',
  requireSuperAdmin,
  requireRecentAdminAuthentication,
  async (req, res) => {
    try {
      const result = await administration.replaceRolePermissions({
        role: req.params.role,
        permissions: req.body?.permissions,
        reason: req.body?.reason,
        actor: { uid: req.user?.uid, email: req.user?.email, role: req.user?.claims?.role },
      });
      // A no-op re-send is not a configuration change; auditing it would make the
      // trail claim an authority change happened when nothing moved (INV-6).
      const audit = !result.changed ? null : await auditAuthorityChange(req, res, {
        action: 'UPDATE_ROLE_PERMISSIONS',
        scope: `role:${result.role}`,
        reason: result.reason,
        before: result.before.map(permission => `${permission.resource}:${permission.action}`),
        after: result.after.map(permission => `${permission.resource}:${permission.action}`),
        added: result.added,
        removed: result.removed,
        changed: result.changed,
      });
      return res.json({ success: true, ...result, auditRecorded: Boolean(audit) });
    } catch (error) {
      return respondWithError(res, error);
    }
  },
);

router.post('/grants', requireSuperAdmin, requireRecentAdminAuthentication, async (req, res) => {
  try {
    const result = await administration.grantRole({
      uid: req.body?.uid,
      role: req.body?.role,
      reason: req.body?.reason,
      expiresAt: req.body?.expiresAt,
      actor: { uid: req.user?.uid, role: req.user?.claims?.role },
    });
    const audit = await auditAuthorityChange(req, res, {
      action: 'GRANT_ROLE',
      scope: `uid:${result.uid}`,
      reason: result.reason,
      before: result.before,
      after: [...result.before, result.role].sort(),
      role: result.role,
      expiresAt: result.expiresAt,
    });
    return res.status(201).json({ success: true, ...result, auditRecorded: Boolean(audit) });
  } catch (error) {
    return respondWithError(res, error);
  }
});

router.delete('/grants/:uid/:role', requireSuperAdmin, requireRecentAdminAuthentication, async (req, res) => {
  try {
    // DELETE carries its justification in the body; some proxies drop it, so the
    // query string is accepted as a fallback and the audit row records which was used.
    const reason = req.body?.reason ?? req.query?.reason;
    const result = await administration.revokeRole({
      uid: req.params.uid,
      role: req.params.role,
      reason,
      actor: { uid: req.user?.uid },
    });
    const audit = await auditAuthorityChange(req, res, {
      action: 'REVOKE_ROLE',
      scope: `uid:${result.uid}`,
      reason: result.reason,
      before: result.before,
      after: result.after,
      role: result.role,
      reasonSource: req.body?.reason ? 'body' : 'query',
    });
    return res.json({ success: true, ...result, auditRecorded: Boolean(audit) });
  } catch (error) {
    return respondWithError(res, error);
  }
});

module.exports = router;
module.exports.__test = { respondWithError };
