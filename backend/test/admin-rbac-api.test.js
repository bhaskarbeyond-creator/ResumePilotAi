'use strict';

/**
 * REC-005 acceptance 2 + INV-3 + INV-6 — authority changes are a first-class,
 * audited, server-computed operation.
 *
 * These tests drive the real HTTP surface (`/api/admin/rbac/*`) with an injected
 * RBAC store and an injected audit repository, so they assert the whole chain:
 * middleware → validation → store write → audit row → cache invalidation →
 * the next authorisation decision. The store is the only thing faked; if the
 * wiring were wrong, one of those links would fail here.
 *
 * The audit repository is injected through `setRepositoryForTests`, which is the
 * same seam the audit suite uses — so "the audit row was written" is proven
 * against the repository contract the product actually calls, not against a
 * console log.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests, permissionsFor } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache, invalidateRbacCache, satisfies } = (() => {
  const rbac = require('../services/adminRbac');
  return { ...rbac, setRbacStoreForTests: rbac.setRbacStoreForTests, refreshRbacCache: rbac.refreshRbacCache, invalidateRbacCache: rbac.invalidateRbacCache, satisfies: rbac.satisfies };
})();
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');

/* ── fixtures ────────────────────────────────────────────────────────── */

/**
 * In-memory implementation of the RBAC store contract.
 * @param {Record<string, Array<[string, string]>>} seed role → [resource, action]
 */
function memoryStore(seed) {
  /** @type {Map<string, Array<{resource: string, action: string}>>} */
  const roles = new Map();
  for (const [role, pairs] of Object.entries(seed)) {
    roles.set(role, pairs.map(([resource, action]) => ({ resource, action })));
  }
  /** @type {Map<string, Array<{uid: string, role: string, grantedBy: string, reason: string, expiresAt: string|null, grantedAt: string}>>} */
  const grants = new Map();
  return {
    roles,
    grants,
    async listRoles() {
      return [...roles.keys()].map((name, index) => ({ name, rank: 100 - index, isSystem: true }));
    },
    async listRolePermissions() {
      const rows = [];
      for (const [role, permissions] of roles) {
        for (const permission of permissions) rows.push({ role, ...permission });
      }
      return rows;
    },
    async listUserGrants(uid) {
      const sets = [];
      for (const grant of grants.get(String(uid)) || []) {
        for (const permission of roles.get(grant.role) || []) sets.push({ role: grant.role, ...permission });
      }
      return sets;
    },
    async replaceRolePermissions(roleName, permissions) {
      if (!roles.has(roleName)) throw Object.assign(new Error('Role not found'), { code: 'ROLE_NOT_FOUND' });
      roles.set(roleName, permissions.map(permission => ({ ...permission })));
    },
    async upsertGrant({ uid, role, grantedBy, reason, expiresAt }) {
      if (!roles.has(role)) throw Object.assign(new Error('Role not found'), { code: 'ROLE_NOT_FOUND' });
      const list = grants.get(String(uid)) || [];
      const without = list.filter(grant => grant.role !== role);
      without.push({
        uid: String(uid),
        role,
        grantedBy,
        reason,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        grantedAt: new Date().toISOString(),
      });
      grants.set(String(uid), without);
    },
    async listGrants() {
      return [...grants.values()].flat();
    },
    async deleteGrant(uid, role) {
      const list = grants.get(String(uid)) || [];
      const next = list.filter(grant => grant.role !== role);
      if (next.length === list.length) return 0;
      grants.set(String(uid), next);
      return 1;
    },
  };
}

/** Audit rows captured from the injected repository. @type {object[]} */
let auditRows = [];

function installFixtures(store) {
  auditRows = [];
  setRbacStoreForTests(store);
  setRepositoryForTests({
    async recordAdminAuditLog(row) { auditRows.push(row); return row; },
    async getAdminAuditLogs() { return auditRows.slice().reverse(); },
  });
}

function bearer(role) {
  return { Authorization: `Bearer ${role}`, 'X-Request-Id': `req-${role}-rbac` };
}

test.before(() => {
  process.env.NODE_ENV = 'test';
  setTokenVerifierForTests(async token => {
    const now = Math.floor(Date.now() / 1000);
    if (token === 'SUPER_ADMIN') {
      return { uid: 'sa-rbac', email: 'sa@test', email_verified: true, role: 'SUPER_ADMIN', permissions: ['*'], auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
    }
    if (token === 'ADMIN') {
      return { uid: 'admin-rbac', email: 'admin@test', email_verified: true, role: 'ADMIN', permissions: [], auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
    }
    if (token === 'AUDITOR') {
      return { uid: 'auditor-rbac', email: 'auditor@test', email_verified: true, role: 'AUDITOR', permissions: [], auth_time: now };
    }
    throw new Error('Invalid token');
  });
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
});

const SEED = Object.freeze({
  SUPER_ADMIN: [['*', '*']],
  ADMIN: [['users', 'read'], ['users', 'write'], ['system.config', 'write']],
  AUDITOR: [['audit', 'read'], ['users', 'read']],
  SUPPORT: [['users', 'read']],
  USER: [['resumes', 'manage']],
});

/* ── reads ───────────────────────────────────────────────────────────── */

test('INV-3: an auditor can read who-may-do-what; an end user cannot', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  const auditorRead = await request(app).get('/api/admin/rbac/roles').set(bearer('AUDITOR'));
  assert.equal(auditorRead.status, 200, 'audit.read must be enough to inspect role bundles');
  assert.equal(auditorRead.body.success, true);
  const names = auditorRead.body.roles.map(role => role.name);
  assert.ok(names.includes('ADMIN') && names.includes('SUPER_ADMIN'));
  assert.equal(auditorRead.body.roles.find(role => role.name === 'USER').editable, false,
    'platform-managed roles must be reported as non-editable, not merely rejected on write');

  const endUser = await request(app).get('/api/admin/rbac/roles').set(bearer('ADMIN'));
  assert.equal(endUser.status, 403, 'ADMIN is not an auditor; role bundles are compliance data');
});

test('INV-3: a role bundle is readable as stored (not hierarchy-expanded)', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app).get('/api/admin/rbac/roles/ADMIN/permissions').set(bearer('AUDITOR'));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.permissions, [
    { resource: 'system.config', action: 'write' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'write' },
  ]);
});

/* ── writes: authorisation ───────────────────────────────────────────── */

test('INV-2/INV-3: only SUPER_ADMIN may change authority, and only with a recent sign-in', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  for (const role of ['ADMIN', 'AUDITOR']) {
    const denied = await request(app)
      .put('/api/admin/rbac/roles/SUPPORT/permissions')
      .set(bearer(role))
      .send({ permissions: [{ resource: 'users', action: 'read' }], reason: 'attempted escalation by a non-super-admin' });
    assert.equal(denied.status, 403, `${role} must not be able to re-bundle roles`);
  }

  // Step-up: with recent-auth enforced, a stale sign-in is refused.
  const previous = process.env.REQUIRE_RECENT_AUTH_IN_TEST;
  process.env.REQUIRE_RECENT_AUTH_IN_TEST = 'true';
  try {
    setTokenVerifierForTests(async token => {
      if (token === 'STALE_SUPER_ADMIN') {
        return { uid: 'sa-rbac', email: 'sa@test', email_verified: true, role: 'SUPER_ADMIN', permissions: ['*'], auth_time: Math.floor(Date.now() / 1000) - 3600, firebase: { sign_in_second_factor: 'totp' } };
      }
      if (token === 'SUPER_ADMIN') {
        return { uid: 'sa-rbac', email: 'sa@test', email_verified: true, role: 'SUPER_ADMIN', permissions: ['*'], auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_second_factor: 'totp' } };
      }
      throw new Error('Invalid token');
    });
    const stale = await request(app)
      .put('/api/admin/rbac/roles/SUPPORT/permissions')
      .set(bearer('STALE_SUPER_ADMIN'))
      .send({ permissions: [{ resource: 'users', action: 'read' }], reason: 'a stale session must not reshape authority' });
    assert.equal(stale.status, 403);
    assert.equal(stale.body.error.code, 'RECENT_AUTH_REQUIRED');
  } finally {
    if (previous === undefined) delete process.env.REQUIRE_RECENT_AUTH_IN_TEST;
    else process.env.REQUIRE_RECENT_AUTH_IN_TEST = previous;
    setTokenVerifierForTests(async token => {
      const now = Math.floor(Date.now() / 1000);
      if (token === 'SUPER_ADMIN') return { uid: 'sa-rbac', email: 'sa@test', email_verified: true, role: 'SUPER_ADMIN', permissions: ['*'], auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
      if (token === 'ADMIN') return { uid: 'admin-rbac', email: 'admin@test', email_verified: true, role: 'ADMIN', permissions: [], auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
      if (token === 'AUDITOR') return { uid: 'auditor-rbac', email: 'auditor@test', email_verified: true, role: 'AUDITOR', permissions: [], auth_time: now };
      throw new Error('Invalid token');
    });
  }
});

/* ── writes: the happy path, and the audit trail ─────────────────────── */

test('REC-005 (acceptance 2) / INV-6: granting a permission takes effect immediately and is audited with before/after', async () => {
  const store = memoryStore(SEED);
  installFixtures(store);
  await refreshRbacCache();
  const app = require('../index');

  const auditorBefore = permissionsFor({ uid: 'auditor-rbac', claims: { role: 'AUDITOR' } });
  assert.equal(satisfies(auditorBefore, 'system.config.read'), false, 'precondition: AUDITOR cannot read config');

  const response = await request(app)
    .put('/api/admin/rbac/roles/AUDITOR/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({
      permissions: [
        { resource: 'audit', action: 'read' },
        { resource: 'users', action: 'read' },
        { resource: 'system.config', action: 'read' },
      ],
      reason: 'Compliance review requires read-only access to platform configuration',
    });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.changed, true);
  assert.deepEqual(response.body.added, ['system.config:read']);
  assert.deepEqual(response.body.removed, []);
  assert.equal(response.body.auditRecorded, true);

  // The cache was invalidated, so the very next authorisation decision reflects it.
  const auditorAfter = permissionsFor({ uid: 'auditor-rbac', claims: { role: 'AUDITOR' } });
  assert.equal(satisfies(auditorAfter, 'system.config.read'), true, 'the new grant must apply without a restart');

  // The audit row carries actor, scope, reason and server-computed before/after.
  assert.equal(auditRows.length, 1);
  const row = auditRows[0];
  assert.equal(row.action, 'UPDATE_ROLE_PERMISSIONS');
  assert.equal(row.category, 'iam.rbac');
  assert.equal(row.severity, 'HIGH');
  assert.equal(row.actorUid, 'sa-rbac');
  assert.equal(row.actorEmail, 'sa@test');
  assert.equal(row.outcome, 'SUCCESS');
  assert.equal(row.metadata.scope, 'role:AUDITOR');
  assert.equal(row.metadata.reason, 'Compliance review requires read-only access to platform configuration');
  assert.deepEqual(row.metadata.before, ['audit:read', 'users:read']);
  assert.deepEqual(row.metadata.after, ['audit:read', 'system.config:read', 'users:read']);
  assert.deepEqual(row.metadata.added, ['system.config:read']);
  assert.ok(row.occurredAt, 'the audit row must carry a timestamp');
});

test('INV-6: a no-op change writes no audit row, because nothing changed', async () => {
  const store = memoryStore(SEED);
  installFixtures(store);
  await refreshRbacCache();
  const app = require('../index');

  const response = await request(app)
    .put('/api/admin/rbac/roles/AUDITOR/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({
      permissions: [{ resource: 'audit', action: 'read' }, { resource: 'users', action: 'read' }],
      reason: 'Re-applying the current bundle to confirm it is unchanged',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.changed, false);
  assert.equal(auditRows.length, 0, 'an unchanged bundle is not a configuration change');
});

/* ── writes: the guards ──────────────────────────────────────────────── */

test('INV-2: the break-glass wildcard cannot be removed from SUPER_ADMIN', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  const response = await request(app)
    .put('/api/admin/rbac/roles/SUPER_ADMIN/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read' }], reason: 'trying to narrow the break-glass role' });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'BREAK_GLASS_REMOVAL_BLOCKED');
  assert.equal(auditRows.length, 0, 'a rejected change must not leave an audit row claiming success');
});

test('INV-3: an operator cannot widen a role they hold themselves', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  // A SUPER_ADMIN adding a specific permission to SUPER_ADMIN is an addition (the
  // role currently holds only the wildcard), so it is a self-widening attempt.
  const response = await request(app)
    .put('/api/admin/rbac/roles/SUPER_ADMIN/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({
      permissions: [{ resource: '*', action: '*' }, { resource: 'payments', action: 'manage' }],
      reason: 'granting myself an extra permission to test the guard',
    });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'SELF_ESCALATION_BLOCKED');
});

test('INV-3: platform-managed roles cannot be re-bundled from the admin plane', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  const response = await request(app)
    .put('/api/admin/rbac/roles/USER/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'resumes', action: 'read' }], reason: 'trying to edit an enterprise-managed role' });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'PLATFORM_MANAGED_ROLE');
});

test('INV-6: every rejection reason is specific, and validation rejects malformed permissions', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  const noReason = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read' }] });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.error.field, 'reason');

  const badAction = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'sudo' }], reason: 'attempting an invented action name' });
  assert.equal(badAction.status, 400);
  assert.match(badAction.body.error.message, /unknown action/);

  const badResource = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users; DROP TABLE admin_roles', action: 'read' }], reason: 'attempting a resource injection' });
  assert.equal(badResource.status, 400);

  const wildcardMisuse = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: '*' }], reason: 'attempting a wildcard action on a real resource' });
  assert.equal(wildcardMisuse.status, 400);

  const unknownRole = await request(app)
    .put('/api/admin/rbac/roles/NOT_A_ROLE/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read' }], reason: 'targeting a role that does not exist' });
  assert.equal(unknownRole.status, 404);
  assert.equal(unknownRole.body.error.code, 'ROLE_NOT_FOUND');
});

/* ── grants ──────────────────────────────────────────────────────────── */

test('INV-3/INV-6: a persisted grant confers authority and a revocation removes it', async () => {
  const store = memoryStore(SEED);
  installFixtures(store);
  await refreshRbacCache();
  const app = require('../index');

  const granted = await request(app)
    .post('/api/admin/rbac/grants')
    .set(bearer('SUPER_ADMIN'))
    .send({ uid: 'support-rbac', role: 'ADMIN', reason: 'Covering the on-call rota until Friday', expiresAt: null });

  assert.equal(granted.status, 201, JSON.stringify(granted.body));
  assert.deepEqual(granted.body.before, []);
  assert.deepEqual(store.grants.get('support-rbac').map(grant => grant.role), ['ADMIN']);

  // The grant is visible to the resolver after one refresh cycle.
  await refreshRbacCache();
  const grantedSet = permissionsFor({ uid: 'support-rbac', claims: { role: 'SUPPORT' } });
  assert.equal(satisfies(grantedSet, 'users.read'), true);
  assert.equal(satisfies(grantedSet, 'system.config.write'), true, 'the granted ADMIN bundle applies to this uid');

  const audit = auditRows.find(row => row.action === 'GRANT_ROLE');
  assert.ok(audit, 'a grant must be audited');
  assert.deepEqual(audit.metadata.after, ['ADMIN']);
  assert.equal(audit.metadata.scope, 'uid:support-rbac');

  const revoked = await request(app)
    .delete('/api/admin/rbac/grants/support-rbac/ADMIN')
    .set(bearer('SUPER_ADMIN'))
    .send({ reason: 'On-call cover ended; revoking the temporary admin role' });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  assert.deepEqual(revoked.body.after, []);

  const auditRevoke = auditRows.find(row => row.action === 'REVOKE_ROLE');
  assert.ok(auditRevoke);
  assert.deepEqual(auditRevoke.metadata.before, ['ADMIN']);

  const revokedAgain = await request(app)
    .delete('/api/admin/rbac/grants/support-rbac/ADMIN')
    .set(bearer('SUPER_ADMIN'))
    .send({ reason: 'Revoking a grant that has already been removed' });
  assert.equal(revokedAgain.status, 404);
  assert.equal(revokedAgain.body.error.code, 'GRANT_NOT_FOUND');
});

test('INV-3: an operator cannot grant themselves a role', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');

  const response = await request(app)
    .post('/api/admin/rbac/grants')
    .set(bearer('SUPER_ADMIN'))
    .send({ uid: 'sa-rbac', role: 'ADMIN', reason: 'self-granting a second role for convenience' });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'SELF_ESCALATION_BLOCKED');
});

/* ── failure behaviour ───────────────────────────────────────────────── */

test('INV-6: an unreachable store is a 503 failure, never a silent success', async () => {
  const broken = {
    async listRoles() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async listRolePermissions() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async listUserGrants() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async replaceRolePermissions() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async upsertGrant() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async listGrants() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async deleteGrant() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
  };
  installFixtures(broken);
  invalidateRbacCache();
  const app = require('../index');

  const response = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read' }], reason: 'writing while the store is unreachable' });

  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(auditRows.length, 0, 'a failed write must not produce a success audit row');
});

/* ── refusal envelopes ───────────────────────────────────────────────── */

test('INV-3: invalid authority payloads are refused with a field, and nothing is written', async () => {
  const store = memoryStore(SEED);
  installFixtures(store);
  await refreshRbacCache();
  const app = require('../index');

  const notAnArray = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: 'users.read', reason: 'a reason long enough to pass the reason check' });
  assert.equal(notAnArray.status, 400);
  assert.equal(notAnArray.body.error.field, 'permissions');

  const badAction = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read write' }], reason: 'a reason long enough to pass the reason check' });
  assert.equal(badAction.status, 400);
  assert.match(badAction.body.error.message, /unknown action/);

  const unknownRole = await request(app)
    .put('/api/admin/rbac/roles/GHOST/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read' }], reason: 'a reason long enough to pass the reason check' });
  assert.equal(unknownRole.status, 404);
  assert.equal(unknownRole.body.error.code, 'ROLE_NOT_FOUND');
  // Captured before the refusals, so the assertion is about *this* run rather than about
  // a seed count a future edit to SEED could invalidate.
  assert.deepEqual(store.roles.get('SUPPORT'), [{ resource: 'users', action: 'read' }],
    'a refused write must leave the bundle untouched');
});

test('INV-6: a grant to yourself is a 409 that names the second-approver rule', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app)
    .post('/api/admin/rbac/grants')
    .set(bearer('SUPER_ADMIN'))
    .send({ uid: 'sa-rbac', role: 'AUDITOR', reason: 'give myself an audit role for the review' });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'SELF_ESCALATION_BLOCKED');
});

test('INV-6: revoking a grant that is not held is a 404, not a silent success', async () => {
  installFixtures(memoryStore(SEED));
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app)
    .delete('/api/admin/rbac/grants/uid-unknown/AUDITOR')
    .query({ reason: 'cleanup of a grant that was never issued' })
    .set(bearer('SUPER_ADMIN'));
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'GRANT_NOT_FOUND');
});

test('INV-6: a store failure while re-bundling is a 503, never a 500 that reads as "maybe it saved"', async () => {
  const store = memoryStore(SEED);
  store.replaceRolePermissions = async () => { throw Object.assign(new Error('store down'), { code: 'ECONNREFUSED' }); };
  installFixtures(store);
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/rbac/roles/SUPPORT/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({ permissions: [{ resource: 'users', action: 'read' }, { resource: 'tickets', action: 'manage' }], reason: 'a reason long enough to pass the reason check' });
  assert.equal(response.status, 503, 'a genuinely different bundle must reach the store, and fail there');
  assert.equal(response.body.success, false);
});
