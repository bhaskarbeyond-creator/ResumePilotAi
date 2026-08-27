'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  FLAG_DEFINITIONS,
  getFlagValue,
  getAllFlags,
  setFlagValue,
} = require('../services/featureFlagService');
const { enterpriseFeatureEnabled, enterpriseFeatureEnabledAsync } = require('../enterprise/featureFlags');
const { setTokenVerifierForTests } = require('../security/auth');
const { getPool } = require('../database/mysql');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

// Test isolation: flags live in MySQL system_settings; restore the category
// before and after this file so parallel suites see no cross-talk.
async function resetFlagStore() {
  try {
    await getPool().query("DELETE FROM system_settings WHERE category = 'feature_flags'");
  } catch (_e) { /* schema may not exist yet in degenerate environments */ }
}

test.before(async () => { await resetFlagStore(); });
test.after(async () => { await resetFlagStore(); try { await getPool().end(); } catch (_e) {} });

test('feature flags: definition contract and default values', () => {
  assert.ok(FLAG_DEFINITIONS.ENTERPRISE_TENANCY_ENABLED);
  assert.equal(FLAG_DEFINITIONS.ENTERPRISE_TENANCY_ENABLED.category, 'enterprise');
  assert.equal(FLAG_DEFINITIONS.ENTERPRISE_TENANCY_ENABLED.requiresRestart, false);
  assert.equal(FLAG_DEFINITIONS.ENTERPRISE_TENANCY_ENABLED.defaultValue, false);

  assert.ok(FLAG_DEFINITIONS.CMS_SCHEDULER_ENABLED);
  assert.equal(FLAG_DEFINITIONS.CMS_SCHEDULER_ENABLED.requiresRestart, true);

  assert.ok(FLAG_DEFINITIONS.NOTIFICATION_OUTBOX_WORKER_ENABLED);
  assert.equal(FLAG_DEFINITIONS.NOTIFICATION_OUTBOX_WORKER_ENABLED.requiresRestart, true);

  assert.ok(FLAG_DEFINITIONS.ENTERPRISE_OUTBOX_WORKER_ENABLED);
  assert.equal(FLAG_DEFINITIONS.ENTERPRISE_OUTBOX_WORKER_ENABLED.requiresRestart, true);
});

test('feature flags: getFlagValue priority resolution (MySQL > Env > Default)', async () => {
  // MySQL override wins: set via the audited writer (also invalidates cache).
  await setFlagValue(null, null, 'PDF_RENDERER_ISOLATED', true, 'super-1', 'req-priority');
  const valWithDb = await getFlagValue(null, 'PDF_RENDERER_ISOLATED');
  assert.equal(valWithDb, true);

  const prevEnv = process.env.CMS_SCHEDULER_ENABLED;
  try {
    process.env.CMS_SCHEDULER_ENABLED = 'true';
    const envVal = await getFlagValue(null, 'CMS_SCHEDULER_ENABLED');
    assert.equal(envVal, true);

    delete process.env.CMS_SCHEDULER_ENABLED;
    const defaultVal = await getFlagValue(null, 'CMS_SCHEDULER_ENABLED');
    assert.equal(defaultVal, false);
  } finally {
    if (prevEnv !== undefined) process.env.CMS_SCHEDULER_ENABLED = prevEnv;
    else delete process.env.CMS_SCHEDULER_ENABLED;
  }

  const unknown = await getFlagValue(null, 'NON_EXISTENT_FLAG');
  assert.equal(unknown, undefined);
});

test('feature flags: getAllFlags returns structured metadata and effective source', async () => {
  await setFlagValue(null, null, 'NOTIFICATION_OUTBOX_EXTERNAL_WORKER', true, 'super-admin-uid', 'req-meta');
  const all = await getAllFlags(null);
  assert.ok(all.NOTIFICATION_OUTBOX_EXTERNAL_WORKER);
  assert.equal(all.NOTIFICATION_OUTBOX_EXTERNAL_WORKER.value, true);
  assert.equal(all.NOTIFICATION_OUTBOX_EXTERNAL_WORKER.source, 'mysql');
  assert.equal(all.NOTIFICATION_OUTBOX_EXTERNAL_WORKER.lastChangedBy, 'super-admin-uid');
  assert.equal(all.NOTIFICATION_OUTBOX_EXTERNAL_WORKER.auditEvent, 'FEATURE_FLAG_CHANGED');
  assert.ok(all.NOTIFICATION_OUTBOX_EXTERNAL_WORKER.lastChangedAt, 'changedAt persisted as ISO timestamp');

  assert.ok(all.CMS_SCHEDULER_ENABLED);
  assert.equal(all.CMS_SCHEDULER_ENABLED.category, 'workers');
});

test('feature flags: setFlagValue validates parameters, persists to MySQL, and logs audit', async () => {
  // Validation errors
  await assert.rejects(
    () => setFlagValue(null, null, 'INVALID_FLAG_KEY', true, 'super-1', 'req-1'),
    { code: 'UNKNOWN_FEATURE_FLAG', status: 400 }
  );

  await assert.rejects(
    () => setFlagValue(null, null, 'ENTERPRISE_TENANCY_ENABLED', 'not-a-bool', 'super-1', 'req-1'),
    { code: 'INVALID_FLAG_VALUE', status: 400 }
  );

  await assert.rejects(
    () => setFlagValue(null, null, 'ENTERPRISE_TENANCY_ENABLED', true, null, 'req-1'),
    { code: 'AUTH_REQUIRED', status: 401 }
  );

  // Successful mutation — durable in MySQL with an audit row in the same transaction.
  const result = await setFlagValue(null, null, 'PDF_RENDERER_ISOLATED', false, 'super-1', 'req-test-123');
  assert.equal(result.flag, 'PDF_RENDERER_ISOLATED');
  assert.equal(result.value, false);
  assert.equal(result.auditEvent, 'FEATURE_FLAG_CHANGED');
  assert.equal(result.requiresRestart, false);

  const pool = getPool();
  const [rows] = await pool.query("SELECT data FROM system_settings WHERE category = 'feature_flags'");
  const stored = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  assert.equal(stored.PDF_RENDERER_ISOLATED.value, false);
  assert.equal(stored.PDF_RENDERER_ISOLATED.changedBy, 'super-1');

  const [auditRows] = await pool.query(
    "SELECT action, actor_uid, metadata, request_id FROM security_audit_logs WHERE action = 'FEATURE_FLAG_CHANGED' AND request_id = 'req-test-123'"
  );
  assert.equal(auditRows.length, 1);
  const meta = typeof auditRows[0].metadata === 'string' ? JSON.parse(auditRows[0].metadata) : auditRows[0].metadata;
  assert.equal(meta.flag, 'PDF_RENDERER_ISOLATED');
  assert.equal(meta.newValue, false);
  assert.equal(auditRows[0].actor_uid, 'super-1');

  // Cleanup so the enterprise gate below starts from a clean state.
  await pool.query("DELETE FROM security_audit_logs WHERE request_id = 'req-test-123'");
});

test('feature flags: enterpriseFeatureEnabled and enterpriseFeatureEnabledAsync helpers', async () => {
  assert.equal(enterpriseFeatureEnabled({ ENTERPRISE_TENANCY_ENABLED: 'true' }), true);
  assert.equal(enterpriseFeatureEnabled({ ENTERPRISE_TENANCY_ENABLED: 'false' }), false);
  assert.equal(enterpriseFeatureEnabled({}), false);

  // The async helper reads the MySQL-backed override. Restore the flag after
  // the assertion so parallel suites never observe an enabled enterprise plane.
  try {
    await setFlagValue(null, null, 'ENTERPRISE_TENANCY_ENABLED', true, 'super-1', 'req-ent-helper');
    const asyncVal = await enterpriseFeatureEnabledAsync(null);
    assert.equal(asyncVal, true);
  } finally {
    await setFlagValue(null, null, 'ENTERPRISE_TENANCY_ENABLED', false, 'super-1', 'req-ent-helper-off');
    const restored = await enterpriseFeatureEnabledAsync(null);
    assert.equal(restored, false);
  }
});

test('feature flags: Express API RBAC enforcement', async () => {
  // Anonymous -> 401
  const anon = await request(app).get('/api/platform/feature-flags');
  assert.equal(anon.status, 401);

  // User -> 403
  const userRes = await request(app)
    .get('/api/platform/feature-flags')
    .set(bearer('user'));
  assert.equal(userRes.status, 403);

  // Plain Admin -> 403 (Feature flags management is Super Admin only)
  const adminRes = await request(app)
    .get('/api/platform/feature-flags')
    .set(bearer('admin'));
  assert.equal(adminRes.status, 403);

  // Super Admin -> 200
  const superRes = await request(app)
    .get('/api/platform/feature-flags')
    .set(bearer('super-admin'));
  assert.equal(superRes.status, 200);
  assert.ok(superRes.body.flags);
  assert.ok(superRes.body.flags.ENTERPRISE_TENANCY_ENABLED);

  // Super Admin PUT invalid flag -> 400
  const badPut = await request(app)
    .put('/api/platform/feature-flags/UNKNOWN_FLAG')
    .set(bearer('super-admin'))
    .send({ value: true });
  assert.equal(badPut.status, 400);

  // Admin PUT -> 403
  const adminPut = await request(app)
    .put('/api/platform/feature-flags/ENTERPRISE_TENANCY_ENABLED')
    .set(bearer('admin'))
    .send({ value: true });
  assert.equal(adminPut.status, 403);

  // Super Admin PUT valid flag -> 200 and persisted in MySQL; reset afterwards.
  const goodPut = await request(app)
    .put('/api/platform/feature-flags/PDF_RENDERER_ISOLATED')
    .set(bearer('super-admin'))
    .send({ value: true });
  assert.equal(goodPut.status, 200);
  assert.equal(goodPut.body.success, true);
  const resetPut = await request(app)
    .put('/api/platform/feature-flags/PDF_RENDERER_ISOLATED')
    .set(bearer('super-admin'))
    .send({ value: false });
  assert.equal(resetPut.status, 200);
});
