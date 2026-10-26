'use strict';

/**
 * Configuration control-plane API (REC-012, INV-4, INV-6).
 *
 * Five endpoints, and each one exists to make a claim in the report checkable rather
 * than merely stated:
 *
 *  - `GET  /api/admin/config` — the census. Every registered value, its effective
 *    value, where that value came from (`database` / `env` / `default`), whether it is
 *    editable, and why not when it is not. INV-4 says every business-affecting value
 *    is either dashboard-configurable with validation/default/audit or justified in
 *    code; this response is that sentence as data.
 *  - `GET  /api/admin/config/:key/history` — the before/after trail for one key (INV-6).
 *  - `PUT  /api/admin/config/:key` — write one value. `system.config.write`, recent
 *    sign-in, a typed reason for elevated keys, and an echo of the revision the caller
 *    was shown.
 *  - `GET  /api/config/runtime` — the subset that affects front-end behaviour, readable
 *    by any authenticated user, because a client cannot render a limit it cannot see.
 *  - Read-only keys are visible in the census with their justification and are
 *    rejected with 403 and the same justification on write.
 *
 * Mounted at `/api/admin/config` and `/api/config` in `index.js`.
 *
 * @module routes/config
 */

const express = require('express');

const { requireAuth, requirePermission, requireRecentAuthentication, permissionsFor, isSuperAdmin } = require('../security/auth');
const { recordAdminAuditLog, sanitizeAuditValue } = require('../security/adminAudit');
const configService = require('../services/configService');
const runtimeLimits = require('../services/runtimeLimits');
const registry = require('../config/registry');

const router = express.Router();

/**
 * Error envelope for this API. Domain errors carry `status` and `code`; a store
 * failure is a 503, never a 500, because a 500 on a value write reads as "it may have
 * saved" and would invite a second, conflicting write.
 *
 * @param {import('express').Response} res
 * @param {unknown} error
 */
function respondWithError(res, error) {
  // Store-level faults are 503, never 500. A 500 on a write reads as "it may have saved",
  // which invites a second, conflicting attempt; 503 says "nothing took effect, try later".
  // `AUDIT_WRITE_FAILED` belongs here: the value write and the audit row are two effects of
  // one request, and a trail that could not be written leaves the request in the same
  // retryable, no-false-success state as an unreachable database.
  const STORE_FAILURE_CODES = new Set(['ECONNREFUSED', 'ER_NO_SUCH_TABLE', 'POOL_CLOSED', 'AUDIT_WRITE_FAILED']);
  const status = Number(error?.status)
    || (STORE_FAILURE_CODES.has(String(error?.code || '')) ? 503 : 500);
  // Only this module's own codes reach the client. A driver code (`ECONNREFUSED`,
  // `ER_LOCK_DEADLOCK`) describes the store, not the request, and is not in the
  // documented error table — a caller cannot act on it and should not have to learn it.
  const rawCode = String(error?.code || '');
  const code = /^CONFIG_[A-Z_]+$/.test(rawCode) ? rawCode : 'CONFIG_OPERATION_FAILED';
  const message = status === 500
    ? 'The configuration change could not be completed'
    : String(error?.message || 'The configuration change could not be completed');
  if (status >= 500) {
    console.error('[Config] config.write_failed', JSON.stringify({ code, message: String(error?.message || error) }));
  }
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(error?.reason ? { reason: error.reason } : {}),
      ...(error?.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}),
      requestId: res.locals?.requestId,
    },
  });
}

/**
 * Route a census read to the permission that guards the values it can expose.
 *
 * `system.config.read` holders see everything. An `audit.read` holder sees the census
 * with elevated values redacted — knowing that the GST rate is configured is different
 * from knowing what it is, and the register treats tax and quota values as sensitive.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function canReadConfig(req) {
  if (isSuperAdmin(req)) return true;
  // `permissionsFor` returns a Set of canonical `resource:action` keys plus the legacy
  // dotted aliases, and `'*'` for a wildcard holder — so membership is a Set lookup,
  // not an array scan.
  const held = permissionsFor(req.user);
  return held.has('*') || held.has('system.config.read');
}

/* ── reads ───────────────────────────────────────────────────────────── */

router.get('/', requirePermission(['system.config.read', 'audit.read', 'security.read']), async (req, res) => {
  try {
    const privileged = canReadConfig(req);
    const { entries, authority } = await configService.describeConfig({
      actorPermissions: permission => privileged && permission === 'system.config.read',
    });
    return res.json({
      success: true,
      authority: { ...authority, privileged },
      count: entries.length,
      scopes: Object.values(registry.SCOPE),
      entries,
    });
  } catch (error) {
    return respondWithError(res, error);
  }
});

router.get('/:key/history', requirePermission(['system.config.read', 'audit.read', 'security.read']), async (req, res) => {
  try {
    const limit = req.query?.limit;
    const history = await configService.configHistory(req.params.key, { limit });
    return res.json({ success: true, key: String(req.params.key), history });
  } catch (error) {
    return respondWithError(res, error);
  }
});

/* ── writes ──────────────────────────────────────────────────────────── */

// `requireRecentAuthentication`, not `requireRecentAdminAuthentication`: freshness is the
// requirement here, and the latter also demands SUPER_ADMIN, which would make
// `system.config.write` an unassignable grant (RCA-011).
router.put('/:key', requirePermission(['system.config.write']), requireRecentAuthentication, async (req, res) => {
  try {
    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, 'value')) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFIG_VALUE_REQUIRED', message: 'A `value` field is required (it may be null or empty, but must be present)', requestId: res.locals?.requestId },
      });
    }
    const expectedRevision = Object.prototype.hasOwnProperty.call(body, 'expectedRevision')
      ? (body.expectedRevision === null ? null : Number(body.expectedRevision))
      : undefined;
    if (expectedRevision === undefined) {
      // Not a convenience check: without the revision the write is last-write-wins,
      // and REC-015 exists precisely because a settings form silently overwrote a
      // concurrent edit in the legacy console.
      return res.status(400).json({
        success: false,
        error: { code: 'CONFIG_REVISION_REQUIRED', message: 'expectedRevision is required; send null to create a value that has no stored row', requestId: res.locals?.requestId },
      });
    }

    const actor = { uid: req.user?.uid, email: req.user?.email, role: String(req.user?.claims?.role || '').toUpperCase() || null };
    const result = await configService.writeConfigValue({
      key: req.params.key,
      value: body.value,
      expectedRevision,
      actor,
      reason: body.reason,
      requestId: res.locals?.requestId,
    });

    const entry = registry.findEntry(result.key);
    // A limiter value must take effect on the next request, not on the next restart. The
    // registry declares `restartRequired: false` for these keys, and that claim is only
    // true because of this line.
    if (String(result.key).startsWith('security.rateLimit.')) {
      await runtimeLimits.refreshRuntimeLimits();
    }
    const audit = await recordAdminAuditLog(req, {
      actorUid: actor.uid || 'unknown',
      actorEmail: actor.email || null,
      actorRole: actor.role || null,
      action: 'CONFIG_VALUE_UPDATED',
      category: 'platform.configuration',
      severity: entry?.audit === registry.AUDIT.ELEVATED ? 'HIGH' : 'INFO',
      outcome: 'SUCCESS',
      method: req.method,
      pathname: req.originalUrl || req.path,
      statusCode: res.statusCode,
      requestId: res.locals?.requestId || null,
      resourceType: 'config_key',
      resourceId: result.key,
      metadata: sanitizeAuditValue('metadata', {
        key: result.key,
        scope: entry?.scope || null,
        before: result.before,
        after: result.value,
        revisionBefore: result.beforeRevision,
        revisionAfter: result.revision,
        reason: String(body.reason || '').trim() || null,
      }),
    });

    return res.json({
      success: true,
      key: result.key,
      value: result.value,
      revision: result.revision,
      before: result.before,
      revisionBefore: result.beforeRevision,
      restartRequired: Boolean(entry?.restartRequired),
      auditRecorded: Boolean(audit),
    });
  } catch (error) {
    return respondWithError(res, error);
  }
});

/* ── user-facing runtime subset ──────────────────────────────────────── */

/** Values the browser must know, with the reason each one is exposed. */
const RUNTIME_KEYS = Object.freeze([
  'ai.quota.plan.basic.dailyRequests',
  'ai.quota.plan.enterprise.dailyRequests',
  'ai.quota.maxTokensCeiling',
  'content.templates.disabled',
  'content.announcements.defaultTtlHours',
  'content.announcements.maxActive',
  'payments.currency',
  'payments.tax.gstPercentage',
  'operations.maintenance.enabled',
  'modules.enabled',
]);

const publicRouter = express.Router();

publicRouter.get('/runtime', requireAuth, async (_req, res) => {
  try {
    const values = await configService.getConfigValues(RUNTIME_KEYS);
    return res.json({ success: true, values, keys: RUNTIME_KEYS });
  } catch (error) {
    return respondWithError(res, error);
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
module.exports.__test = { RUNTIME_KEYS, canReadConfig, respondWithError };
