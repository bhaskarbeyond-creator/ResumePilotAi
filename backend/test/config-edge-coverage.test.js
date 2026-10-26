'use strict';

/**
 * Edge branches on the configuration surface (OI-COV-1).
 *
 * `config-api.test.js` proves the contract a client depends on. This file exists because the
 * census route's *branches* were the weakest covered code in the remediation surface
 * (62.71 % when it was measured): the error mapper's driver-code whitelist, the read gate's
 * three ways in, the history route with and without a limit, and the write route's rejection
 * ladder had paths that only a hostile caller exercises. Coverage without assertions is a
 * number, so every case here states the behaviour it pins.
 *
 * Run: NODE_ENV=test node --test test/config-edge-coverage.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const configRoutes = require('../routes/config');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

/** @type {ReturnType<typeof createInMemoryConfigStore>} */
let store;
let auditRows = [];
let auditFailure = null;

/** ADMIN holds `system.config.read/write`; `CONFIG_READER` only the read half. */
function memoryRbacStore() {
  const roles = new Map(Object.entries({
    SUPER_ADMIN: [['*', '*']],
    ADMIN: [['system.config', 'read'], ['system.config', 'write']],
    CONFIG_READER: [['system.config', 'read']],
    USER: [['resumes', 'manage']],
    WILDCARD: [['*', '*']],
  }));
  return {
    async listRoles() { return [...roles.keys()].map((name, index) => ({ name, rank: 100 - index, isSystem: false })); },
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
  return { Authorization: `Bearer ${role}`, 'X-Request-Id': `req-${role}-edge` };
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  store = createInMemoryConfigStore({
    'operations.queues.sampleSize': { value: 50, revision: 2 },
    'security.rateLimit.authHourly': { value: 20, revision: 3 },
  });
  configService.setConfigPoolForTests(store.pool);
  setRbacStoreForTests(memoryRbacStore());
  await refreshRbacCache();
  auditRows = [];
  auditFailure = null;
  setRepositoryForTests({
    async recordAdminAuditLog(row) {
      if (auditFailure) throw auditFailure;
      auditRows.push(row);
      return row;
    },
    async getAdminAuditLogs() { return auditRows.slice().reverse(); },
  });
  setTokenVerifierForTests(async token => {
    const now = Math.floor(Date.now() / 1000);
    const base = { email: `${token.toLowerCase()}@edge`, email_verified: true, permissions: [], auth_time: now };
    if (token === 'SUPER_ADMIN') return { ...base, uid: 'sa-edge', role: 'SUPER_ADMIN', permissions: ['*'] };
    return { ...base, uid: `${token.toLowerCase()}-edge`, role: token };
  });
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

/* ── the read gate has three ways in, and each is tested ───────────────── */

test('read gate: a super admin reads without any granted permission', () => {
  const gate = configRoutes.__test.canReadConfig;
  assert.equal(gate({ user: { claims: { role: 'SUPER_ADMIN' } } }), true);
});

test('read gate: a wildcard holder reads', () => {
  const gate = configRoutes.__test.canReadConfig;
  assert.equal(gate({ user: { claims: { role: 'WILDCARD' } } }), true);
});

test('read gate: `system.config.read` is sufficient and nothing else is', () => {
  const gate = configRoutes.__test.canReadConfig;
  assert.equal(gate({ user: { claims: { role: 'CONFIG_READER' } } }), true);
  assert.equal(gate({ user: { claims: { role: 'USER' } } }), false);
  assert.equal(gate({}), false, 'an unauthenticated caller cannot read the census');
});

/* ── history ───────────────────────────────────────────────────────────── */

test('history: a key with changes returns them newest-first', async () => {
  const app = require('../index');
  const write = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 60, expectedRevision: 2, reason: 'edge coverage' });
  assert.equal(write.status, 200, JSON.stringify(write.body));

  const response = await request(app)
    .get('/api/admin/config/operations.queues.sampleSize/history')
    .set(bearer('ADMIN'));
  assert.equal(response.status, 200);
  assert.equal(response.body.key, 'operations.queues.sampleSize');
  assert.ok(Array.isArray(response.body.history));
  assert.ok(response.body.history.length >= 1);
});

test('history: an explicit limit is honoured and a non-numeric one is not fatal', async () => {
  const app = require('../index');
  const limited = await request(app)
    .get('/api/admin/config/operations.queues.sampleSize/history?limit=1')
    .set(bearer('ADMIN'));
  assert.equal(limited.status, 200);
  assert.ok(limited.body.history.length <= 1);

  const garbage = await request(app)
    .get('/api/admin/config/operations.queues.sampleSize/history?limit=not-a-number')
    .set(bearer('ADMIN'));
  // The service clamps; the route must not 500 on a query-string the caller controls.
  assert.ok([200].includes(garbage.status), `expected the limit to be clamped, got ${garbage.status}`);
});

test('history: a store outage is a 503 that names the operation, not a 500', async () => {
  const app = require('../index');
  store.failNext(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
  const response = await request(app)
    .get('/api/admin/config/operations.queues.sampleSize/history')
    .set(bearer('ADMIN'));
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'CONFIG_OPERATION_FAILED');
  assert.ok(response.body.error.requestId);
});

/* ── the write rejection ladder ────────────────────────────────────────── */

test('write: a body without `value` is refused before the store is touched', async () => {
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ expectedRevision: 2 });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'CONFIG_VALUE_REQUIRED');
});

test('write: `value: null` is accepted as a value, `absent` is not', async () => {
  const app = require('../index');
  const response = await request(app)
    .put('/api/admin/config/modules.enabled')
    .set(bearer('ADMIN'))
    .send({ value: null, expectedRevision: null, reason: 'clear the override' });
  // Either it is accepted (200) or the registry refuses that key as read-only (403); what it
  // must never do is treat `null` as "the field was missing".
  assert.ok([200, 400, 403].includes(response.status), `unexpected ${response.status}`);
  if (response.status === 400) assert.notEqual(response.body.error.code, 'CONFIG_VALUE_REQUIRED');
});

test('write: a missing expectedRevision is refused, and null is a deliberate sentinel', async () => {
  const app = require('../index');
  const missing = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 70 });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'CONFIG_REVISION_REQUIRED');

  // `null` means "I believe no value is stored". When one is stored this must be a conflict,
  // not a silent overwrite: accepting it would make the revision guard optional by sending
  // null, which is the last-write-wins hole REC-015 exists to close.
  const collides = await request(app)
    .put('/api/admin/config/security.rateLimit.authHourly')
    .set(bearer('ADMIN'))
    .send({ value: 30, expectedRevision: null, reason: 'create where a row exists' });
  assert.equal(collides.status, 409);
  assert.equal(collides.body.error.code, 'CONFIG_REVISION_CONFLICT');
  assert.ok(Number.isInteger(collides.body.error.currentRevision), 'the conflict names the revision to reload from');

  const creates = await request(app)
    .put('/api/admin/config/payments.tax.gstPercentage')
    .set(bearer('ADMIN'))
    .send({ value: 18, expectedRevision: null, reason: 'first explicit value for this key' });
  assert.equal(creates.status, 200, JSON.stringify(creates.body));
  assert.equal(creates.body.revision, 1);
});

test('write: an unknown key is a 404 and a malformed value is a 400 naming the rule', async () => {
  const app = require('../index');
  const unknown = await request(app)
    .put('/api/admin/config/not.a.real.key')
    .set(bearer('ADMIN'))
    .send({ value: 1, expectedRevision: null, reason: 'probe' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'CONFIG_KEY_UNKNOWN');

  const invalid = await request(app)
    .put('/api/admin/config/security.rateLimit.authHourly')
    .set(bearer('ADMIN'))
    .send({ value: 0, expectedRevision: 3, reason: 'out of range' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'CONFIG_INVALID');
});

test('write: a read-only key refuses with its justification, and names it', async () => {
  const app = require('../index');
  const entry = require('../config/registry.js').ENTRIES.find(item => item.restartRequired === true);
  assert.ok(entry, 'the registry must contain at least one boot-only key for this case to be meaningful');
  const response = await request(app)
    .put(`/api/admin/config/${entry.key}`)
    .set(bearer('ADMIN'))
    .send({ value: entry.defaultValue, expectedRevision: null, reason: 'attempt a boot-only write' });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'CONFIG_READ_ONLY');
  // The mapper forwards `error.reason` (why the key is read-only) as the message, because a
  // caller who cannot edit a value needs to know what would make it editable.
  assert.equal(response.body.error.reason, entry.readOnlyReason);
  assert.ok(response.body.error.message.length > 0);
});

test('write: a missing, empty or over-long reason is refused before the value is validated', async () => {
  const app = require('../index');
  // `security.rateLimit.global` is an ELEVATED key: its reason is mandatory (>= 10 chars) and
  // capped. Non-elevated keys accept an optional reason, which is a different code path and is
  // covered by the successful-write case below.
  const revision = (await request(app)
    .get('/api/admin/config/security.rateLimit.global')
    .set(bearer('ADMIN'))).body.entry?.revision ?? null;
  const cases = [
    { label: 'absent', reason: undefined, code: 'CONFIG_REASON_REQUIRED' },
    { label: 'empty', reason: '', code: 'CONFIG_REASON_REQUIRED' },
    { label: 'whitespace', reason: '    ', code: 'CONFIG_REASON_REQUIRED' },
    { label: 'too short', reason: 'short', code: 'CONFIG_REASON_REQUIRED' },
    { label: 'over-long', reason: 'x'.repeat(501), code: 'CONFIG_REASON_TOO_LONG' },
  ];
  for (const testCase of cases) {
    const response = await request(app)
      .put('/api/admin/config/security.rateLimit.global')
      .set(bearer('ADMIN'))
      .send({ value: 2400, expectedRevision: revision, ...(testCase.reason === undefined ? {} : { reason: testCase.reason }) });
    assert.equal(response.status, 400, `${testCase.label}: expected 400, got ${response.status} ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.code, testCase.code, testCase.label);
  }
});

test('write: a successful value change carries a before/after audit row with the actor', async () => {
  const app = require('../index');
  auditRows = [];
  const listing = await request(app).get('/api/admin/config').set(bearer('ADMIN'));
  const entry = listing.body.entries.find(item => item.key === 'operations.queues.sampleSize');
  const response = await request(app)
    .put('/api/admin/config/operations.queues.sampleSize')
    .set(bearer('ADMIN'))
    .send({ value: 80, expectedRevision: entry.revision, reason: 'queue depth doubled' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.auditRecorded, true);
  const row = auditRows.find(item => item.action === 'CONFIG_VALUE_UPDATED');
  assert.ok(row, 'the write must produce a CONFIG_VALUE_UPDATED row');
  assert.equal(row.metadata.after, 80);
  assert.equal(row.metadata.before, entry.value);
  assert.equal(row.metadata.revisionBefore, entry.revision);
  assert.equal(row.metadata.revisionAfter, response.body.revision);
  assert.equal(row.metadata.reason, 'queue depth doubled');
  assert.equal(row.actorUid, 'admin-edge');
});

test('write: an audit repository that throws fails the response closed instead of claiming a trail', async () => {
  const app = require('../index');
  const listing = await request(app).get('/api/admin/config').set(bearer('ADMIN'));
  const revision = listing.body.entries.find(item => item.key === 'operations.queues.sampleSize').revision;

  setRepositoryForTests({
    async recordAdminAuditLog() {
      throw Object.assign(new Error('audit table unavailable'), { code: 'AUDIT_WRITE_FAILED' });
    },
    async getAdminAuditLogs() { return []; },
  });
  try {
    const response = await request(app)
      .put('/api/admin/config/operations.queues.sampleSize')
      .set(bearer('ADMIN'))
      .send({ value: 91, expectedRevision: revision, reason: 'audit repository unavailable' });
    // The value write and the trail are two effects; when the trail cannot be written the
    // response must not read as a success. It is a 503 with no `auditRecorded: true` anywhere.
    assert.equal(response.status, 503, JSON.stringify(response.body));
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'CONFIG_OPERATION_FAILED');
    assert.equal(response.body.auditRecorded, undefined);
  } finally {
    setRepositoryForTests({
      async recordAdminAuditLog(row) { auditRows.push(row); return row; },
      async getAdminAuditLogs() { return auditRows.slice().reverse(); },
    });
  }
});

/* ── the error mapper ──────────────────────────────────────────────────── */

test('error mapper: a driver code becomes CONFIG_OPERATION_FAILED, a own code passes through', () => {
  const app = require('../index');
  const respond = configRoutes.__test.respondWithError;
  assert.equal(typeof respond, 'function', 'the mapper must be exported for this test');

  const capture = () => {
    const state = { status: 0, body: null };
    return {
      state,
      res: {
        status(code) { state.status = code; return this; },
        json(body) { state.body = body; return this; },
      },
    };
  };

  const driver = capture();
  respond(driver.res, Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }));
  assert.equal(driver.state.status, 500);
  assert.equal(driver.state.body.error.code, 'CONFIG_OPERATION_FAILED');
  assert.ok(!String(driver.state.body.error.message).includes('deadlock'), 'the driver message must not leak');

  const own = capture();
  respond(own.res, Object.assign(new Error('Range violated'), { code: 'CONFIG_INVALID', status: 400 }));
  assert.equal(own.state.status, 400);
  assert.equal(own.state.body.error.code, 'CONFIG_INVALID');

  const connection = capture();
  respond(connection.res, Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
  assert.equal(connection.state.status, 503, 'an unreachable store is a 503, not a 500');

  const noTable = capture();
  respond(noTable.res, Object.assign(new Error('no such table'), { code: 'ER_NO_SUCH_TABLE' }));
  assert.equal(noTable.state.status, 503, 'a missing table is a deployment fault, not a request fault');
});

/* ── the runtime subset ────────────────────────────────────────────────── */

test('runtime subset: a store outage still answers with declared defaults', async () => {
  const app = require('../index');
  store.failNext(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
  const response = await request(app).get('/api/config/runtime').set(bearer('USER'));
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  for (const key of response.body.keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(response.body.values, key), `${key} must have a default`);
  }
});
