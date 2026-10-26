'use strict';

/**
 * The validation half of RBAC administration (REC-005, INV-3).
 *
 * `admin-rbac-api.test.js` proves the happy path and the authority ceiling through HTTP.
 * This suite targets the refusals, because a permission editor's safety is the set of
 * things it will not write: a wildcard smuggled through a bundle, an unknown role, a
 * grant to yourself, an expiry in the past, a reason that is only whitespace.
 *
 * Run: NODE_ENV=test node --test test/admin-rbac-administration.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';

const administration = require('../services/adminRbacAdministration');
const rbac = require('../services/adminRbac');

const ACTOR = Object.freeze({ uid: 'sa-1', email: 'sa@test', role: 'SUPER_ADMIN' });

/**
 * Install a store with the given role bundles.
 * @param {Record<string, Array<[string, string]>>} seed
 */
function install(seed) {
  const roles = new Map(Object.entries(seed).map(([role, pairs]) => [role, pairs.map(([resource, action]) => ({ resource, action }))]));
  const grants = new Map();
  rbac.setRbacStoreForTests({
    async listRoles() { return [...roles.keys()].map((name, index) => ({ name, rank: 90 - index, isSystem: true })); },
    async listRolePermissions() {
      const rows = [];
      for (const [role, permissions] of roles) for (const permission of permissions) rows.push({ role, ...permission });
      return rows;
    },
    async listUserGrants(uid) {
      return [...(grants.get(String(uid)) || [])].flatMap(role => (roles.get(role) || []).map(permission => ({ role, ...permission })));
    },
    async replaceRolePermissions(roleName, permissions) {
      if (!roles.has(roleName)) throw Object.assign(new Error('Role not found'), { code: 'ROLE_NOT_FOUND' });
      roles.set(roleName, permissions.map(permission => ({ ...permission })));
    },
    async upsertGrant({ uid, role }) { grants.set(String(uid), [role]); },
    async listGrants() { return [...grants.entries()].map(([uid, list]) => ({ uid, role: list[0] })); },
    async deleteGrant() { return 1; },
  });
  return { roles, grants };
}

test.after(() => rbac.setRbacStoreForTests(null));

test('replaceRolePermissions refuses a non-array, an oversized bundle and a non-object entry', async () => {
  install({ ADMIN: [['users', 'read']] });
  await assert.rejects(() => administration.replaceRolePermissions({ role: 'ADMIN', permissions: 'users.read', reason: 'a valid reason', actor: ACTOR }), /must be an array/);
  await assert.rejects(
    () => administration.replaceRolePermissions({ role: 'ADMIN', permissions: Array.from({ length: 501 }, () => ({ resource: 'users', action: 'read' })), reason: 'a valid reason', actor: ACTOR }),
    /may not exceed/
  );
  await assert.rejects(() => administration.replaceRolePermissions({ role: 'ADMIN', permissions: ['users:read'], reason: 'a valid reason', actor: ACTOR }), /must be an object/);
});

test('replaceRolePermissions refuses a malformed resource or action name', async () => {
  install({ ADMIN: [['users', 'read']] });
  await assert.rejects(
    () => administration.replaceRolePermissions({ role: 'ADMIN', permissions: [{ resource: 'users table', action: 'read' }], reason: 'a valid reason', actor: ACTOR }),
    /invalid resource/
  );
  await assert.rejects(
    () => administration.replaceRolePermissions({ role: 'ADMIN', permissions: [{ resource: 'users', action: 'read write' }], reason: 'a valid reason', actor: ACTOR }),
    /unknown action/
  );
});

test('replaceRolePermissions requires a reason and refuses an unknown role', async () => {
  install({ ADMIN: [['users', 'read']] });
  await assert.rejects(() => administration.replaceRolePermissions({ role: 'ADMIN', permissions: [{ resource: 'users', action: 'read' }], reason: '   ', actor: ACTOR }), /reason/);
  await assert.rejects(
    () => administration.replaceRolePermissions({ role: 'GHOST', permissions: [{ resource: 'users', action: 'read' }], reason: 'a valid reason', actor: ACTOR }),
    error => error.status === 404 && error.code === 'ROLE_NOT_FOUND'
  );
});

test('replaceRolePermissions refuses to widen a role the actor holds, and allows a narrowing', async () => {
  install({ SUPER_ADMIN: [['*', '*']], AUDITOR: [['audit', 'read'], ['users', 'read']] });
  await assert.rejects(
    () => administration.replaceRolePermissions({
      role: 'AUDITOR',
      permissions: [{ resource: 'audit', action: 'read' }, { resource: 'users', action: 'read' }, { resource: 'payments', action: 'read' }],
      reason: 'give the auditor payments visibility',
      actor: { uid: 'u-auditor', role: 'AUDITOR' },
    }),
    error => error.code === 'SELF_ESCALATION_BLOCKED' || /Cannot widen/.test(error.message),
    'a holder of a role must not be able to add authority to it'
  );
  const narrowed = await administration.replaceRolePermissions({
    role: 'AUDITOR',
    permissions: [{ resource: 'audit', action: 'read' }],
    reason: 'audit read is enough for this reviewer',
    actor: { uid: 'u-auditor', role: 'AUDITOR' },
  });
  assert.strictEqual(narrowed.changed, true);
  // `removed` is reported as canonical `resource:action` keys, the vocabulary an audit
  // reader can paste into a permission check.
  assert.deepStrictEqual(narrowed.removed, ['users:read']);
});

test('grantRole refuses a self-grant, an unknown role and a past expiry', async () => {
  install({ SUPER_ADMIN: [['*', '*']], AUDITOR: [['audit', 'read']] });
  await assert.rejects(
    () => administration.grantRole({ uid: 'sa-1', role: 'AUDITOR', reason: 'review this quarter', actor: ACTOR }),
    error => error.status === 409 && error.code === 'SELF_ESCALATION_BLOCKED'
  );
  await assert.rejects(
    () => administration.grantRole({ uid: 'u-2', role: 'GHOST', reason: 'review this quarter', actor: ACTOR }),
    error => error.status === 404
  );
  await assert.rejects(
    () => administration.grantRole({ uid: 'u-2', role: 'AUDITOR', reason: 'review this quarter', expiresAt: '2020-01-01T00:00:00.000Z', actor: ACTOR }),
    /in the future/
  );
  await assert.rejects(
    () => administration.grantRole({ uid: 'u-2', role: 'AUDITOR', reason: 'review this quarter', expiresAt: 'not-a-date', actor: ACTOR }),
    /ISO timestamp/
  );
});

test('grantRole reports the before/after bundle a second administrator can review', async () => {
  install({ SUPER_ADMIN: [['*', '*']], AUDITOR: [['audit', 'read']] });
  const result = await administration.grantRole({
    uid: 'u-2', role: 'AUDITOR', reason: 'quarterly review access',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(), actor: ACTOR,
  });
  assert.strictEqual(result.uid, 'u-2');
  assert.strictEqual(result.role, 'AUDITOR');
  assert.deepStrictEqual(result.before, [], 'a first grant reports an empty prior bundle, not "unknown"');
  assert.strictEqual(result.changed, true);
  assert.ok(result.expiresAt, 'a time-boxed grant must report its expiry back to the caller');
});
