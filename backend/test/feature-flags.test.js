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

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

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

test('feature flags: getFlagValue priority resolution (Firestore > Env > Default)', async () => {
  const mockDb = {
    doc(path) {
      assert.equal(path, 'settings/feature_flags');
      return {
        async get() {
          return {
            exists: true,
            data: () => ({
              ENTERPRISE_TENANCY_ENABLED: { value: true, changedBy: 'admin-sa' },
            }),
          };
        },
      };
    },
  };

  const valWithDb = await getFlagValue(mockDb, 'ENTERPRISE_TENANCY_ENABLED');
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
  const mockDb = {
    doc(_path) {
      return {
        async get() {
          return {
            exists: true,
            data: () => ({
              ENTERPRISE_TENANCY_ENABLED: { value: true, changedBy: 'super-admin-uid', changedAt: new Date('2026-08-20T10:00:00Z') },
            }),
          };
        },
      };
    },
  };

  const all = await getAllFlags(mockDb);
  assert.ok(all.ENTERPRISE_TENANCY_ENABLED);
  assert.equal(all.ENTERPRISE_TENANCY_ENABLED.value, true);
  assert.equal(all.ENTERPRISE_TENANCY_ENABLED.source, 'firestore');
  assert.equal(all.ENTERPRISE_TENANCY_ENABLED.lastChangedBy, 'super-admin-uid');
  assert.equal(all.ENTERPRISE_TENANCY_ENABLED.auditEvent, 'FEATURE_FLAG_CHANGED');
  assert.equal(all.ENTERPRISE_TENANCY_ENABLED.requiresRestart, false);

  assert.ok(all.CMS_SCHEDULER_ENABLED);
  assert.equal(all.CMS_SCHEDULER_ENABLED.category, 'workers');
});

test('feature flags: setFlagValue validates parameters, updates Firestore, and logs audit', async () => {
  const transactionLogs = [];
  const storedData = {};
  const mockAdmin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date('2026-08-23T12:00:00Z'),
      },
    },
  };

  const mockDb = {
    doc(path) {
      return {
        path,
        async get() {
          return { exists: Boolean(storedData[path]), data: () => storedData[path] || {} };
        },
      };
    },
    collection(name) {
      return {
        doc() {
          return { path: `${name}/audit-doc-id` };
        },
      };
    },
    async runTransaction(updateFunction) {
      const transaction = {
        async get(ref) {
          return ref.get();
        },
        set(ref, data, options) {
          transactionLogs.push({ ref: ref.path, data, options });
          if (ref.path === 'settings/feature_flags') {
            storedData[ref.path] = { ...(storedData[ref.path] || {}), ...data };
          }
        },
      };
      return updateFunction(transaction);
    },
  };

  // Validation errors
  await assert.rejects(
    () => setFlagValue(mockDb, mockAdmin, 'INVALID_FLAG_KEY', true, 'super-1', 'req-1'),
    { code: 'UNKNOWN_FEATURE_FLAG', status: 400 }
  );

  await assert.rejects(
    () => setFlagValue(mockDb, mockAdmin, 'ENTERPRISE_TENANCY_ENABLED', 'not-a-bool', 'super-1', 'req-1'),
    { code: 'INVALID_FLAG_VALUE', status: 400 }
  );

  await assert.rejects(
    () => setFlagValue(mockDb, mockAdmin, 'ENTERPRISE_TENANCY_ENABLED', true, null, 'req-1'),
    { code: 'AUTH_REQUIRED', status: 401 }
  );

  await assert.rejects(
    () => setFlagValue(null, mockAdmin, 'ENTERPRISE_TENANCY_ENABLED', true, 'super-1', 'req-1'),
    { code: 'FEATURE_FLAGS_UNAVAILABLE', status: 503 }
  );

  // Successful mutation
  const result = await setFlagValue(mockDb, mockAdmin, 'ENTERPRISE_TENANCY_ENABLED', true, 'super-1', 'req-test-123');
  assert.equal(result.flag, 'ENTERPRISE_TENANCY_ENABLED');
  assert.equal(result.value, true);
  assert.equal(result.auditEvent, 'FEATURE_FLAG_CHANGED');
  assert.equal(result.requiresRestart, false);

  assert.equal(transactionLogs.length, 2);
  const flagWrite = transactionLogs.find(log => log.ref === 'settings/feature_flags');
  assert.ok(flagWrite);
  assert.equal(flagWrite.data.ENTERPRISE_TENANCY_ENABLED.value, true);
  assert.equal(flagWrite.data.ENTERPRISE_TENANCY_ENABLED.changedBy, 'super-1');

  const auditWrite = transactionLogs.find(log => log.ref.startsWith('security_audit_logs/'));
  assert.ok(auditWrite);
  assert.equal(auditWrite.data.action, 'FEATURE_FLAG_CHANGED');
  assert.equal(auditWrite.data.flag, 'ENTERPRISE_TENANCY_ENABLED');
  assert.equal(auditWrite.data.newValue, true);
  assert.equal(auditWrite.data.actorUid, 'super-1');
  assert.equal(auditWrite.data.requestId, 'req-test-123');
});

test('feature flags: enterpriseFeatureEnabled and enterpriseFeatureEnabledAsync helpers', async () => {
  assert.equal(enterpriseFeatureEnabled({ ENTERPRISE_TENANCY_ENABLED: 'true' }), true);
  assert.equal(enterpriseFeatureEnabled({ ENTERPRISE_TENANCY_ENABLED: 'false' }), false);
  assert.equal(enterpriseFeatureEnabled({}), false);

  const mockDb = {
    doc(_path) {
      return {
        async get() {
          return {
            exists: true,
            data: () => ({
              ENTERPRISE_TENANCY_ENABLED: { value: true },
            }),
          };
        },
      };
    },
  };
  const asyncVal = await enterpriseFeatureEnabledAsync(mockDb);
  assert.equal(asyncVal, true);
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
});
