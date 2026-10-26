'use strict';

/**
 * REC-006 / INV-1 / INV-3 — one authorisation engine, and the route table proves
 * it covers itself.
 *
 * The old policy was two if-ladders keyed on path prefixes. The failure mode was
 * not that it was wrong in one place; it was that "no entry" and "restricted
 * entry" produced the same answer, so a missing entry looked like a deliberate
 * decision. These tests make the difference visible:
 *
 *  - every registered admin/platform route resolves to a *named* rule;
 *  - the number of routes falling through to a declared default is pinned, so a
 *    new route cannot quietly join the unnamed set;
 *  - every rule is used by at least one route, or is listed as intentionally
 *    unused — no dead policy;
 *  - the four corrections the audit demanded actually change behaviour end to end.
 *
 * The inventory fixture is the route table captured from `backend/` at commit
 * b106012. It is deliberately a fixture and not a live enumeration: Express 5
 * removed the route-walking internals the old audit script used, and a fixture
 * that a human must refresh when adding a route is a *feature* here — it forces
 * the manifest conversation at the moment the route is written.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { RULES, resolveRoutePermission, defaultRuleIds } = require('../security/routeManifest');
const { resolveAdminReadPermission, resolveAdminMutationPermission, enforceApiPolicy, isAdminPath } = require('../security/policy');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { routeInventory } = require('./fixtures/route-inventory-helpers');

const INVENTORY = routeInventory();

/**
 * Routes that live under `/api` but are not part of the admin or platform plane,
 * so `enforceApiPolicy`'s admin branch does not apply to them.
 * @param {string} pathname
 * @returns {boolean}
 */
const isAdminPlane = pathname => isAdminPath(pathname);

/**
 * Routes allowed to resolve to a declared default.
 *
 * Empty on purpose. Every route in the 146-row inventory — index.js, the admin
 * routers, platform, email and the help desk — resolves to a *named* rule, so the
 * catch-alls exist only as a fail-safe for routes registered somewhere this
 * fixture does not know about. The arrays below are the ratchet: if a new route
 * falls through, this test fails with the route's method and path and the fix is
 * to add a manifest rule (not to add an entry here).
 *
 * @type {string[]}
 */
const DECLARED_DEFAULTS = Object.freeze([]);

test('REC-006: every registered admin-plane route resolves to a manifest rule', () => {
  const unresolved = [];
  for (const route of INVENTORY) {
    if (!isAdminPlane(route.path)) continue;
    const resolved = resolveRoutePermission(route.path, route.method);
    if (!resolved) unresolved.push(`${route.method} ${route.path}`);
  }
  assert.deepEqual(unresolved, [], 'a registered admin route with no manifest rule would be unauthorisable');
});

test('REC-006: the set of routes on a declared default is pinned and cannot grow', () => {
  const onDefault = INVENTORY
    .filter(route => isAdminPlane(route.path))
    .map(route => ({ key: `${route.method} ${route.path}`, resolved: resolveRoutePermission(route.path, route.method) }))
    .filter(entry => entry.resolved?.isDefault)
    .map(entry => entry.key)
    .sort();

  assert.deepEqual(onDefault, [...DECLARED_DEFAULTS].sort(),
    'a route that newly falls through to a default must be named here and modelled in the manifest, not inherited silently');
});

test('REC-006: every manifest rule is used by a route, or is a default', () => {
  const used = new Set();
  for (const route of INVENTORY) {
    const resolved = resolveRoutePermission(route.path, route.method);
    if (resolved) used.add(resolved.ruleId);
  }
  const declaredDefaults = new Set(defaultRuleIds());
  // `ai-quota-limits-read` guards a GET that has no registered route yet: quota
  // limits are written (POST /admin/ai/quota-limits) but never read through the
  // policy, so the rule is forward-looking. Named here rather than deleted, so the
  // day the GET lands it is already confined.
  const forwardLooking = new Set(['ai-quota-limits-read']);

  const unused = RULES
    .filter(rule => !declaredDefaults.has(rule.id) && !forwardLooking.has(rule.id) && !used.has(rule.id))
    .map(rule => rule.id);
  assert.deepEqual(unused, [], 'a manifest rule no route reaches is dead policy — delete it or name it as forward-looking');
});

test('REC-006: the four audit corrections resolve to the corrected permission', () => {
  assert.equal(resolveAdminReadPermission('/admin/audit-logs'), 'audit.read',
    'the audit trail reads under audit.read, so an AUDITOR can read it');
  assert.equal(resolveAdminReadPermission('/admin/audit-logs/stats'), 'audit.read');
  assert.equal(resolveAdminReadPermission('/admin/pages'), 'content.manage');
  assert.equal(resolveAdminMutationPermission('/admin/pages/about'), 'content.manage');
  assert.equal(resolveAdminReadPermission('/admin/coupons'), 'payments.read');
  assert.equal(resolveAdminMutationPermission('/admin/coupons/SAVE20'), 'payments.manage');
  assert.equal(resolveAdminReadPermission('/admin/settings'), 'system.config.read');
  assert.equal(resolveAdminMutationPermission('/admin/settings/general'), 'system.config.write');
});

test('REC-006: reads and writes are decided independently, so a read rule cannot shadow a mutation rule', () => {
  // Same path, two answers — the property the ordered ladder could not express.
  assert.equal(resolveRoutePermission('/admin/users/123', 'GET').permission, 'users.read');
  assert.equal(resolveRoutePermission('/admin/users/123', 'DELETE').permission, 'users.update');
  assert.equal(resolveRoutePermission('/admin/coupons', 'GET').permission, 'payments.read');
  assert.equal(resolveRoutePermission('/admin/coupons', 'POST').permission, 'payments.manage');
  // HEAD and OPTIONS are reads.
  assert.equal(resolveRoutePermission('/admin/users/123', 'HEAD').permission, 'users.read');
  assert.equal(resolveRoutePermission('/admin/users/123', 'OPTIONS').permission, 'users.read');
});

test('REC-006: every permission the manifest names is held by some role', () => {
  const { PERMISSIONS } = require('../security/permissionVocabulary');
  const { legacyPermissionSet, satisfies } = require('../services/adminRbac');

  // A permission only SUPER_ADMIN holds because holding it would be an escalation.
  // The manifest may name these; it may not name anything else nobody holds.
  const SUPER_ADMIN_EXCLUSIVE = new Set(['secrets.manage']);

  const roles = Object.keys(PERMISSIONS).filter(role => role !== 'SUPER_ADMIN');
  const bundles = new Map(roles.map(role => [role, legacyPermissionSet(role)]));

  /** @param {unknown} permission */
  const isHeld = permission => permission === '*'
    || SUPER_ADMIN_EXCLUSIVE.has(permission)
    || roles.some(role => satisfies(bundles.get(role), permission));

  const unknown = [];
  for (const rule of RULES) {
    // `settings-surface`, `ai-settings` and `payment-webhooks` declare different
    // permissions for reads and writes, so both halves must be checked.
    const declared = rule.permission && typeof rule.permission === 'object' && !Array.isArray(rule.permission)
      ? Object.values(rule.permission)
      : [].concat(rule.permission);
    for (const permission of declared) {
      if (!isHeld(permission)) unknown.push(`${rule.id}: ${permission}`);
    }
  }

  assert.deepEqual(unknown, [],
    'a manifest rule naming a permission no role can hold would deny everyone but the wildcard, which is the defect REC-006 exists to remove');
});

/* ── behaviour through the real middleware ───────────────────────────── */

/**
 * Minimal Express doubles: `enforceApiPolicy` only reads `req.path`, `req.method`,
 * `req.user` and writes a JSON body with a status code.
 * @param {object} user
 * @param {string} method
 * @param {string} pathname
 * @returns {{status: number|null, body: unknown, forwarded: boolean}}
 */
function applyPolicy(user, method, pathname) {
  const result = { status: null, body: null, forwarded: false };
  const res = {
    locals: { requestId: 'req-test' },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  const req = { method, path: pathname, user, originalUrl: pathname, headers: {} };
  enforceApiPolicy(req, res, () => { result.forwarded = true; });
  return result;
}

test('REC-006: an AUDITOR reaches the audit trail and ADMIN reaches settings it may write', async () => {
  setRbacStoreForTests({
    async listRoles() { return []; },
    async listRolePermissions() { return []; },
    async listUserGrants() { return []; },
  });
  await refreshRbacCache();

  const auditor = { uid: 'aud-1', emailVerified: true, claims: { role: 'AUDITOR' } };
  const adminReads = applyPolicy(auditor, 'GET', '/admin/audit-logs');
  assert.equal(adminReads.forwarded, true, 'AUDITOR holds audit.read and must reach GET /admin/audit-logs');
  assert.equal(adminReads.status, null);

  const auditorSettings = applyPolicy(auditor, 'GET', '/admin/settings');
  assert.equal(auditorSettings.forwarded, false, 'AUDITOR does not hold system.config.read');
  assert.equal(auditorSettings.status, 403);

  const admin = { uid: 'adm-1', emailVerified: true, claims: { role: 'ADMIN' } };
  assert.equal(applyPolicy(admin, 'GET', '/admin/settings').forwarded, true,
    'ADMIN holds system.config:write, which satisfies the read gate through the hierarchy');
  assert.equal(applyPolicy(admin, 'GET', '/admin/audit-logs').forwarded, true, 'ADMIN holds audit.read outright');
  assert.equal(applyPolicy(admin, 'GET', '/admin/coupons').forwarded, true, 'ADMIN holds payments.read');
  assert.equal(applyPolicy(admin, 'POST', '/admin/coupons').forwarded, true, 'ADMIN holds payments.manage');

  const support = { uid: 'sup-1', emailVerified: true, claims: { role: 'SUPPORT' } };
  assert.equal(applyPolicy(support, 'GET', '/admin/audit-logs').forwarded, false, 'SUPPORT has no audit authority');
  assert.equal(applyPolicy(support, 'GET', '/admin/support/tickets').forwarded, true, 'SUPPORT owns the help desk');
  assert.equal(applyPolicy(support, 'DELETE', '/admin/users/uid-2').forwarded, false, 'SUPPORT cannot delete a user');

  const user = { uid: 'u-1', emailVerified: true, claims: { role: 'USER' } };
  assert.equal(applyPolicy(user, 'GET', '/admin/users').forwarded, false, 'an end user has no admin-plane access at all');

  setRbacStoreForTests(null);
});
