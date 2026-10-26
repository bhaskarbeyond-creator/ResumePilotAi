'use strict';

/**
 * The configuration HTTP surface — REC-012 acceptance, INV-4, INV-6.
 *
 * The service suite proves resolution and the write transaction. This suite proves the
 * part that only exists at the edge: who may read the census, who may write, that the
 * revision echo is mandatory, that a read-only key refuses with its justification, and
 * that the audit row the response promises is actually written.
 *
 * The store is the only thing faked. `supertest` drives the real app, so the assertions
 * run through the real authentication, the real permission resolution and the real
 * `enforceApiPolicy` middleware — if the manifest rule for `/admin/config` were wrong,
 * these cases would fail rather than pass on a stub.
 *
 * Run: NODE_ENV=test node --test test/config-api.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

/** Audit rows captured from the injected repository. @type {object[]} */
let auditRows = [];
/** @type {ReturnType<typeof createInMemoryConfigStore>} */
let store;

/**
 * RBAC store with the permission bundles these cases need. ADMIN is granted
 * `system.config.read/write` explicitly rather than by wildcard, so a wildcard-only
 * implementation would fail here.
 */
function memoryRbacStore() {
  const roles = new Map(Object.entries({
    SUPER_ADMIN: [['*', '*']],
    ADMIN: [['system.config', 'read'], ['system.config', 'write'], ['users', 'read']],
    AUDITOR: [['audit', 'read']],
    USER: [['resumes', 'manage']],
  }));
  return {
    async listRoles() { return [...roles.keys()].map((name, index) => ({ name, rank: 100 - index, isSystem: true })); },
    async listRolePermissions() {
      const rows = [];
      for (const [role, pairs] of roles) for (const [resource, action] of pairs) rows.push({ role, resource, action });
      return rows;
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  };
}

function bearer(role) {
  return { Authorization: `Bearer ${role}`, 'X-Request-Id': `req-${role}-config` };
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  store = createInMemoryConfigStore({ 'operations.queues.sampleSize': { value: 50, revision: 2 } });
  configService.setConfigPoolForTests(store.pool);

  auditRows = [];
  setRbacStoreForTests(memoryRbacStore());
  await refreshRbacCache();
  setRepositoryForTests({
    async recordAdminAuditLog(row) { auditRows.push(row); return row; },
    async getAdminAuditLogs() { return auditRows.slice().reverse(); },
  });

  setTokenVerifierForTests(async token => {
    const now = Math.floor(Date.now() / 1000);
    const base = { email: `${token.toLowerCase()}@test`, email_verified: true, permissions: [], auth_time: now };
    if (token === 'SUPER_ADMIN') return { ...base, uid: 'sa-config', role: 'SUPER_ADMIN', permissions: ['*'] };
    if (token === 'ADMIN') return { ...base, uid: 'admin-config', role: 'ADMIN' };
    if (token === 'AUDITOR') return { ...base, uid: 'auditor-config', role: 'AUDITOR' };
    if (token === 'USER') return { ...base, uid: 'user-config', role: 'USER' };
    throw new Error('Invalid token');
  });
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

/* ── reads ───────────────────────────────────────────────────────────── */

test('INV-4: the census exposes every registered value with its origin and editability', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/admin/config').set(bearer('ADMIN'));
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.count >= 34, `expected the full registry, got ${response.body.count}`);
  assert.equal(response.body.authority.degraded, false);
  assert.equal(response.body.authority.privileged, true);
  const readOnly = response.body.entries.filter(entry => entry.editable === false);
  assert.ok(readOnly.length >= 8);
  for (const entry of readOnly) assert.ok(entry.readOnlyReason, `${entry.key} must carry its justification to the UI`);
});

test('INV-4: an auditor may read the census but elevated values are redacted', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/admin/config').set(bearer('AUDITOR'));
  assert.equal(response.status, 200, 'audit.read may see that a value exists');
  assert.equal(response.body.authority.privileged, false);
  const gst = response.body.entries.find(entry => entry.key === 'payments.tax.gstPercentage');
  assert.equal(gst.redacted, true);
  assert.equal(gst.value, null);
});

test('INV-5: an end user has no access to the configuration census at all', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/admin/config').set(bearer('USER'));
  assert.equal(response.status, 403);
});

test('the runtime subset is readable by any authenticated user and is an enumerated allowlist', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/config/runtime').set(bearer('USER'));
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body.values).sort(), [...response.body.keys].sort());
  assert.equal(response.body.values['payments.currency'], 'INR');
  const injected = await request(app).get('/api/config/runtime?keys=security.session.sensitiveActionMaxAgeMs').set(bearer('USER'));
  assert.equal(injected.status, 200);
  assert.equal(injected.body.values['security.session.sensitiveActionMaxAgeMs'], undefined,
    'the key list is the server\'s, never the caller\'s');
});

test('unauthenticated access is refused', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/admin/config');
  assert.ok([401, 403].includes(response.status), `expected 401/403, got ${response.status}`);
});

/* ── writes ──────────────────────────────────────────────────────────── */

test('INV-6: a write requires the revision the caller was shown', async () => {
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 75 });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'CONFIG_REVISION_REQUIRED');
  assert.equal(store.log.length, 0);
});

test('INV-6: an accepted write returns before/after and writes an audit row with actor, scope and reason', async () => {
  const app = require('../index');
  auditRows = [];
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 75, expectedRevision: 2, reason: 'backlog investigation' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.value, 75);
  assert.equal(response.body.before, 50);
  assert.equal(response.body.revision, 3);
  assert.equal(response.body.auditRecorded, true);

  assert.equal(auditRows.length, 1, 'exactly one audit row for one change');
  const row = auditRows[0];
  assert.equal(row.action, 'CONFIG_VALUE_UPDATED');
  assert.equal(row.actorUid, 'admin-config');
  assert.equal(row.resourceId, 'operations.queues.sampleSize');
  assert.equal(row.metadata.before, 50);
  assert.equal(row.metadata.after, 75);
  assert.equal(row.metadata.scope, 'PLATFORM');
  assert.equal(row.metadata.reason, 'backlog investigation');
  assert.equal(row.metadata.revisionBefore, 2);
  assert.equal(row.metadata.revisionAfter, 3);

  const history = await request(app).get('/api/admin/config/operations.queues.sampleSize/history').set(bearer('ADMIN'));
  assert.equal(history.status, 200);
  assert.equal(history.body.history.length, 1);
  assert.equal(history.body.history[0].after, 75);
  assert.equal(history.body.history[0].actor.uid, 'admin-config');
});

test('INV-6: a stale revision is a 409 that names the current revision, and nothing is written', async () => {
  const app = require('../index');
  const before = store.log.length;
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 90, expectedRevision: 1 });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'CONFIG_REVISION_CONFLICT');
  assert.equal(response.body.error.currentRevision, 3);
  assert.equal(store.log.length, before);
});

test('INV-4: a read-only key refuses the write and explains why (CFG-007)', async () => {
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/config/security.session.sensitiveActionMaxAgeMs')
    .set(bearer('ADMIN'))
    .send({ value: 3_600_000, expectedRevision: null, reason: 'make step-up last an hour' });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'CONFIG_READ_ONLY');
  assert.match(response.body.error.reason, /loosened/);
});

test('an elevated change without a reason is refused before anything is written', async () => {
  const app = require('../index');
  const before = store.log.length;
  const response = await request(app)
    .put('/api/admin/config/payments.tax.gstPercentage')
    .set(bearer('ADMIN'))
    .send({ value: 12, expectedRevision: null });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'CONFIG_REASON_REQUIRED');
  assert.equal(store.log.length, before);
});

test('an out-of-range value is a 400 that names the bound', async () => {
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 5000, expectedRevision: 3 });
  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /between 10 and 500/);
});

test('INV-5: a writer without system.config.write cannot use the endpoint', async () => {
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('AUDITOR'))
    .send({ value: 60, expectedRevision: 3, reason: 'attempted by an auditor' });
  assert.equal(response.status, 403);
});
