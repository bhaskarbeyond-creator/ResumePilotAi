'use strict';

/**
 * "What may I do?" — the endpoint that makes the authorisation engine visible
 * (REC-018, INV-1, INV-5).
 *
 * ## Why this is a self endpoint, not an admin one
 *
 * It answers a question about the *caller*: which console surfaces and which
 * actions within them are permitted. Any authenticated principal may ask it,
 * including one with no admin rights at all (the answer is then "no tabs"), and it
 * must never be gated by the very permissions it reports — that would be circular
 * and would hide the reason for a denial from the person who needs it.
 *
 * Mounted at `/api/me` in `index.js`; the global `/api` middleware already requires
 * authentication.
 *
 * ## Why the answer is computed, not cached in the token
 *
 * Authority changes at runtime (a grant, a role edit). A capability token or a
 * client-side role check would be stale until the next sign-in. This endpoint
 * resolves from `services/adminRbac` on every call, so a grant is visible on the
 * caller's next page load.
 *
 * ## What it deliberately does not return
 *
 * - The full role catalogue or other people's permissions: that is
 *   `/api/admin/rbac/*`, which is audit-gated.
 * - A "hidden because" string for capabilities the caller lacks in *another*
 *   domain: the reason is a permission name, nothing more.
 *
 * @module routes/capabilities
 */

const express = require('express');

const { permissionsFor } = require('../security/auth');
const { satisfies, describeResolution } = require('../services/adminRbac');
const { CAPABILITIES, DEFAULT_TAB, ACTIONS } = require('../security/capabilityMap');

const router = express.Router();

/**
 * Sorted, human-readable view of a resolved permission set.
 *
 * Drops the canonical `resource:action` duplicates (the resolver stores both
 * spellings so legacy handlers keep working) and the bare wildcard's expansion
 * noise, keeping `'*'` itself so a super-admin is recognisable.
 *
 * @param {Set<string>} permissions
 * @returns {string[]}
 */
function describePermissions(permissions) {
  const out = new Set();
  for (const permission of permissions) {
    if (permission.includes(':')) continue;
    out.add(permission);
  }
  return [...out].sort();
}

/**
 * Resolve the console capability set for a caller.
 *
 * @param {{uid?: string, claims?: object}|null} user
 * @returns {{
 *   tabs: Array<{id: string, label: string, group: string, allowed: boolean, superAdminOnly: boolean, missing: string[]}>,
 *   actions: Record<string, Record<string, boolean>>,
 *   defaultTab: string|null,
 *   permissions: string[],
 *   authority: {source: string, degraded: boolean, roles: number},
 * }}
 */
function resolveCapabilities(user) {
  const permissions = permissionsFor(user);

  const tabs = CAPABILITIES.map(entry => {
    const permissionAllowed = satisfies(permissions, entry.requires);
    // A super-admin-only tab is visible to its holder and to nobody else, so the
    // UI never renders a screen whose first write is guaranteed to 403.
    const wildcard = permissions.has('*');
    const allowed = entry.superAdminOnly ? wildcard : permissionAllowed;
    const required = Array.isArray(entry.requires) ? entry.requires : [entry.requires];
    // A hidden tab must always say *why*, because the UI shows the reason instead of
    // a dead end. Two distinct reasons exist and conflating them would mislead: a
    // missing permission (grantable) versus a role that is deliberately
    // super-admin-only (not grantable without becoming a super-admin).
    const reason = allowed
      ? null
      : entry.superAdminOnly && !wildcard && permissionAllowed
        ? 'super-admin-only'
        : 'missing-permission';
    return {
      id: entry.id,
      label: entry.label,
      group: entry.group,
      allowed,
      superAdminOnly: Boolean(entry.superAdminOnly),
      reason,
      missing: allowed
        ? []
        : reason === 'super-admin-only'
          ? ['*']
          : required.filter(permission => !satisfies(permissions, permission)),
    };
  });

  const actions = {};
  for (const [tab, mapping] of Object.entries(ACTIONS)) {
    actions[tab] = {};
    for (const [action, permission] of Object.entries(mapping)) {
      actions[tab][action] = satisfies(permissions, permission);
    }
  }

  const visible = tabs.filter(tab => tab.allowed);
  const preferred = visible.find(tab => tab.id === DEFAULT_TAB);
  return {
    tabs,
    actions,
    defaultTab: preferred ? preferred.id : (visible[0]?.id ?? null),
    permissions: describePermissions(permissions),
    authority: describeResolution(),
  };
}

/**
 * GET /api/me/capabilities
 *
 * `no-store` because authority changes at runtime and a cached answer would show a
 * revoked admin their old console for as long as the browser chose to keep it.
 */
router.get('/capabilities', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication is required' } });
  }
  const resolved = resolveCapabilities(req.user);
  return res.json({
    success: true,
    role: String(req.user.claims?.role || '').toUpperCase() || null,
    ...resolved,
  });
});

module.exports = router;
module.exports.__test = { resolveCapabilities, describePermissions };
