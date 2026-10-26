'use strict';

/**
 * Chaos / degradation suite (tier "chaos", REC-017, INV-2).
 *
 * ## The rule this suite enforces
 *
 * **A dependency outage must never be indistinguishable from an authorisation decision.**
 * Every case below removes one dependency and asserts three things:
 *
 *  1. the surface still answers — it does not hang, and it does not 500;
 *  2. the answer says what is missing (a documented degraded code, or a declared default);
 *  3. authority is not widened and not silently erased: `INV-2`'s super-admin path keeps
 *     working, and nobody gains a permission they did not hold.
 *
 * The fault injection is at the boundary that actually fails in production — the pool, the
 * RBAC store, the audit repository — not on internal helpers, so a case cannot pass by
 * bypassing the code it is supposed to stress.
 *
 * Run: NODE_ENV=test node --test test/chaos-resilience.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests, permissionsFor, isSuperAdmin } = require('../security/auth');
const rbac = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

const OUTAGE = () => Object.assign(new Error('chaos: dependency unavailable'), { code: 'ECONNREFUSED' });

/** RBAC store that answers reads from a literal and fails writes on demand. */
function rbacStore({ failReads = false, failWrites = false } = {}) {
  return {
    async listRoles() {
      if (failReads) throw OUTAGE();
      return [
        { name: 'SUPER_ADMIN', rank: 100, isSystem: true },
        { name: 'ADMIN', rank: 80, isSystem: true },
        { name: 'AUDITOR', rank: 60, isSystem: true },
      ];
    },
    async listRolePermissions() {
      if (failReads) throw OUTAGE();
      return [
        { role: 'SUPER_ADMIN', resource: '*', action: '*' },
        { role: 'ADMIN', resource: 'system.config', action: 'read' },
        { role: 'ADMIN', resource: 'system.config', action: 'write' },
        { role: 'AUDITOR', resource: 'audit', action: 'read' },
        { role: 'AUDITOR', resource: 'security', action: 'read' },
      ];
    },
    async listUserGrants() { if (failReads) throw OUTAGE(); return []; },
    async replaceRolePermissions() { if (failWrites) throw OUTAGE(); },
    async upsertGrant() { if (failWrites) throw OUTAGE(); },
    async listGrants() { if (failReads) throw OUTAGE(); return []; },
    async deleteGrant() { if (failWrites) throw OUTAGE(); return 1; },
  };
}

function authenticate() {
  setTokenVerifierForTests(async (token) => {
    const now = Math.floor(Date.now() / 1000);
    const role = String(token).toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(role)) throw new Error('Invalid token');
    return { uid: `chaos-${role}`, email: `${role.toLowerCase()}@chaos.test`, email_verified: true, role, permissions: [], auth_time: now };
  });
}

test.after(() => {
  rbac.setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

test('chaos: the RBAC store being down does not lock the platform out', async () => {
  rbac.setRbacStoreForTests(rbacStore({ failReads: true }));
  rbac.invalidateRbacCache();
  const result = await rbac.refreshRbacCache();
  assert.strictEqual(result.degraded, true, 'the cache must report that it is running on the literal');

  // INV-2: the super-admin path survives an authority-store outage. Without this, a
  // database incident would also be an unrecoverable-admin incident.
  const admin = { uid: 'u', claims: { role: 'ADMIN' } };
  assert.strictEqual(isSuperAdmin({ claims: { role: 'SUPER_ADMIN' }, uid: 'sa' }), true);
  assert.strictEqual(rbac.satisfies(permissionsFor(admin), 'system.config.read'), true,
    'the frozen vocabulary is the documented fallback and must still grant the documented bundle');

  const stranger = rbac.resolvePermissionSet({ claims: { role: 'NOT_A_ROLE' } });
  assert.deepStrictEqual([...stranger], [], 'degrading must not grant anything to an unknown role');
});

test('chaos: a configuration store outage serves declared defaults and says it is degraded', async () => {
  const store = createInMemoryConfigStore();
  store.failNext(OUTAGE());
  configService.setConfigPoolForTests(store.pool);
  try {
    const census = await configService.describeConfig();
    assert.strictEqual(census.authority.degraded, true);
    assert.ok(census.authority.reason.length > 0, 'a degraded response must carry a reason a human can act on');
    assert.strictEqual(census.entries.length, require('../config/registry').ENTRIES.length,
      'every entry is still reported: an outage must not look like an empty registry');
  } finally {
    configService.setConfigPoolForTests(null);
  }
});

test('chaos: a configuration write during an outage fails closed with a documented code', async () => {
  const store = createInMemoryConfigStore({ 'operations.queues.sampleSize': { value: 50, revision: 1 } });
  configService.setConfigPoolForTests(store.pool);
  authenticate();
  rbac.setRbacStoreForTests(rbacStore());
  await rbac.refreshRbacCache();
  setRepositoryForTests({ async recordAdminAuditLog(row) { return row; }, async getAdminAuditLogs() { return []; } });
  try {
    await configService.getConfigValue('operations.queues.sampleSize');
    store.failNext(OUTAGE());
    const app = require('../index');
    const response = await request(app)
      .put('/api/admin/config/operations.queues.sampleSize')
      .set({ Authorization: 'Bearer ADMIN' })
      .send({ value: 80, expectedRevision: 1 });
    assert.equal(response.status, 503, 'an unavailable store is a 503, not a 200 and not a 500');
    assert.equal(response.body.error.code, 'CONFIG_OPERATION_FAILED');
    assert.strictEqual(store.log.length, 0, 'a failed write must leave no change-log row');
  } finally {
    configService.setConfigPoolForTests(null);
  }
});

test('chaos: an audit repository outage does not fail the mutation, but the response admits the gap', async () => {
  const store = createInMemoryConfigStore({ 'operations.queues.sampleSize': { value: 50, revision: 1 } });
  configService.setConfigPoolForTests(store.pool);
  authenticate();
  rbac.setRbacStoreForTests(rbacStore());
  await rbac.refreshRbacCache();
  setRepositoryForTests({
    async recordAdminAuditLog() { throw Object.assign(new Error('audit store down'), { code: 'ECONNREFUSED' }); },
    async getAdminAuditLogs() { return []; },
  });
  try {
    const app = require('../index');
    const response = await request(app)
      .put('/api/admin/config/operations.queues.sampleSize')
      .set({ Authorization: 'Bearer ADMIN' })
      .send({ value: 90, expectedRevision: 1, reason: 'chaos drill: audit store unavailable' });

    // The value is written either way — refusing the change because the trail is down would
    // stop an operator during exactly the incident that broke the trail. What must not
    // happen is a response claiming the trail is complete.
    assert.ok([200, 503].includes(response.status), `unexpected ${response.status}`);
    if (response.status === 200) {
      assert.strictEqual(response.body.auditRecorded, false,
        'the response must say the audit row is missing rather than implying it exists');
    }
    assert.strictEqual(store.log.length, 1, 'the change log is the second, independent trail and still records the change');
  } finally {
    resetRepositoryCacheForTests();
    configService.setConfigPoolForTests(null);
  }
});

test('chaos: repeated capability reads under a degraded store stay bounded and consistent', async () => {
  rbac.setRbacStoreForTests(rbacStore({ failReads: true }));
  rbac.invalidateRbacCache();
  await rbac.refreshRbacCache();
  const app = require('../index');
  const { resolveCapabilities } = require('../routes/capabilities').__test;
  const first = resolveCapabilities({ claims: { role: 'ADMIN' } });
  for (let index = 0; index < 20; index += 1) {
    const next = resolveCapabilities({ claims: { role: 'ADMIN' } });
    assert.deepStrictEqual(next.tabs.map((tab) => tab.allowed), first.tabs.map((tab) => tab.allowed),
      'a degraded read must be deterministic: flapping tabs are indistinguishable from an attack');
  }
  const response = await request(app).get('/api/me/capabilities').set({ Authorization: 'Bearer ADMIN' });
  assert.equal(response.status, 200);
  assert.equal(response.body.authority.degraded, true, 'the client is told the authority source is the fallback');
});
