'use strict';

process.env.NODE_ENV = 'test';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  deriveAction,
  deriveCategory,
  deriveSeverity,
  sanitizeAuditValue,
  recordAdminAuditLog,
} = require('../security/adminAudit');
const { isSuperAdmin, hasSecondFactor, superAdminMfaEnforced, setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('Super Admin & Platform Module: Sanitization protects secrets', () => {
  const sensitiveObj = {
    apiKey: 'sk-1234567890abcdef',
    password: 'SuperSecretPassword!',
    token: 'jwt.bearer.token',
    clientSecret: 'secret-xyz',
    normalField: 'hello-world',
    nested: {
      privateKey: '-----BEGIN RSA PRIVATE KEY-----',
      userEmail: 'admin@example.com',
      card: '4111222233334444',
    },
  };

  const sanitized = sanitizeAuditValue('root', sensitiveObj);
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.clientSecret, '[REDACTED]');
  assert.equal(sanitized.normalField, 'hello-world');
  assert.equal(sanitized.nested.privateKey, '[REDACTED]');
  assert.equal(sanitized.nested.card, '[REDACTED]');
  assert.equal(sanitized.nested.userEmail, 'admin@example.com');
});

test('Super Admin & Platform Module: Action & Category Derivation', () => {
  assert.equal(deriveAction('POST', '/api/admin/ai-settings'), 'POST_AI_SETTINGS');
  assert.equal(deriveAction('POST', '/api/admin/ai/test-provider'), 'TEST_AI_PROVIDER');
  assert.equal(deriveAction('DELETE', '/api/admin/users/12345'), 'DELETE_USER_PROFILE');
  assert.equal(deriveAction('POST', '/api/platform/maintenance'), 'POST_PLATFORM_MAINTENANCE');
  assert.equal(deriveAction('POST', '/api/platform/tenants'), 'POST_PLATFORM_TENANT');
  assert.equal(deriveAction('POST', '/api/platform/operators'), 'POST_PLATFORM_OPERATOR');
  assert.equal(deriveAction('DELETE', '/api/platform/announcements/ann-1'), 'DELETE_PLATFORM_ANNOUNCEMENT');
  assert.equal(deriveAction('GET', '/api/admin/health-summary'), 'READ_HEALTH_SUMMARY');

  assert.equal(deriveCategory('/api/admin/ai-settings'), 'ai.governance');
  assert.equal(deriveCategory('/api/admin/payment-settings'), 'billing.payments');
  assert.equal(deriveCategory('/api/admin/users/123'), 'iam.users');
  assert.equal(deriveCategory('/api/platform/health'), 'platform.health');
  assert.equal(deriveCategory('/api/admin/blog/posts'), 'content.media');
});

test('Super Admin & Platform Module: Severity derivation matches operational risk', () => {
  assert.equal(deriveSeverity('GET', '/api/admin/settings/general', 200), 'INFO');
  assert.equal(deriveSeverity('POST', '/api/admin/settings/general', 200), 'MEDIUM');
  assert.equal(deriveSeverity('DELETE', '/api/admin/users/test-uid', 200), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/admin/firebase-service-account', 200), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/admin/ai-settings', 500), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/admin/ai-settings', 403), 'MEDIUM');
  assert.equal(deriveSeverity('POST', '/api/platform/operators', 200), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/platform/tenants/abc/decommission', 200), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/platform/maintenance', 200), 'HIGH');
});

test('Super Admin & Platform Module: isSuperAdmin correctly identifies role & wildcard', () => {
  const superAdminUser = { uid: 'sa1', email: 'sa@example.com', claims: { role: 'SUPER_ADMIN' } };
  const adminUser = { uid: 'a1', email: 'admin@example.com', claims: { role: 'ADMIN' } };
  const wildcardUser = { uid: 'w1', email: 'w@example.com', claims: { permissions: ['*'] } };
  const regularUser = { uid: 'u1', email: 'user@example.com', claims: { role: 'USER' } };

  assert.equal(isSuperAdmin(superAdminUser), true);
  assert.equal(isSuperAdmin(wildcardUser), true);
  assert.equal(isSuperAdmin(adminUser), false);
  assert.equal(isSuperAdmin(regularUser), false);
  assert.equal(isSuperAdmin(null), false);
  assert.equal(hasSecondFactor({ claims: { firebase: { sign_in_second_factor: 'totp' } } }), true);
  assert.equal(hasSecondFactor(superAdminUser), false);
});

test('Super Admin & Platform Module: recordAdminAuditLog persists through the repository contract', async () => {
  const persisted = [];
  const repository = { async recordAdminAuditLog(event) { persisted.push(event); return event; } };
  const requestContext = { app: {}, repository, originalUrl: '/api/admin/ai-settings', headers: {} };
  const result = await recordAdminAuditLog(requestContext, {
    actorUid: 'admin-001',
    actorEmail: 'admin@domain.com',
    action: 'UPDATE_AI_SETTINGS',
    category: 'ai.governance',
    severity: 'MEDIUM',
    outcome: 'SUCCESS',
    method: 'POST',
    pathname: '/api/admin/ai-settings',
    statusCode: 200,
    durationMs: 45,
    metadata: { provider: 'nvidia', activeModel: 'meta/llama-3.2-11b' },
  });

  assert.ok(result);
  assert.equal(result.actorUid, 'admin-001');
  assert.equal(result.action, 'UPDATE_AI_SETTINGS');
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, result.id);
});

test('Platform API: /api/platform/health returns structured diagnostic data', async () => {
  const res = await request(app)
    .get('/api/platform/health')
    .set(bearer('admin'));

  assert.equal(res.status, 200);
  assert.ok(res.body.healthScore !== undefined);
  assert.ok(res.body.status);
  assert.ok(res.body.subsystems);
  assert.ok(res.body.subsystems.runtime);
  assert.ok(res.body.commitSha);
});

test('Platform API: /api/platform/health rejects unauthenticated & non-admin callers', async () => {
  const anon = await request(app).get('/api/platform/health');
  assert.equal(anon.status, 401);

  const user = await request(app).get('/api/platform/health').set(bearer('user'));
  assert.equal(user.status, 403);
});

test('Platform API: /api/platform/maintenance status is readable by Admin and editable only by Super Admin', async () => {
  const readRes = await request(app)
    .get('/api/platform/maintenance')
    .set(bearer('admin'));
  assert.ok([200, 503].includes(readRes.status));
  if (readRes.status === 200) {
    assert.equal(typeof readRes.body.enabled, 'boolean');
  } else {
    assert.equal(readRes.body.error?.code, 'MAINTENANCE_STATUS_UNAVAILABLE');
  }

  // Admin cannot toggle maintenance (Super Admin only)
  const adminToggle = await request(app)
    .post('/api/platform/maintenance')
    .set(bearer('admin'))
    .send({ enabled: true });
  assert.equal(adminToggle.status, 403);
  assert.equal(adminToggle.body.error.code, 'FORBIDDEN');
});

test('Platform API: command center returns telemetry or a controlled database failure, and rejects users', async () => {
  const res = await request(app).get('/api/platform/command-center').set(bearer('admin'));
  assert.ok([200, 503].includes(res.status));
  if (res.status === 200) {
    assert.ok(res.body.healthScore !== undefined);
    assert.ok(Array.isArray(res.body.recommendations));
    assert.ok(res.body.signals?.database);
    assert.ok(res.body.sources);
  } else {
    assert.equal(res.body.error?.code, 'COMMAND_CENTER_UNAVAILABLE');
  }

  const user = await request(app).get('/api/platform/command-center').set(bearer('user'));
  assert.equal(user.status, 403);
});

test('Platform API: encryption and observability are read-only control-plane views', async () => {
  const enc = await request(app).get('/api/platform/encryption').set(bearer('admin'));
  assert.equal(enc.status, 200);
  assert.ok(enc.body.encryption);
  assert.ok(enc.body.encryption.provider);

  const obs = await request(app).get('/api/platform/observability').set(bearer('admin'));
  assert.ok([200, 503].includes(obs.status));
  if (obs.status === 200) {
    assert.ok(obs.body.metrics);
    assert.equal(typeof obs.body.metrics.sampleCount, 'number');
  } else {
    assert.equal(obs.body.error?.code, 'OBSERVABILITY_UNAVAILABLE');
  }
});

test('Platform API: tenant decommission and announcements require Super Admin', async () => {
  const decommission = await request(app)
    .post('/api/platform/tenants/11111111-1111-4111-8111-111111111111/decommission')
    .set(bearer('admin'))
    .send({ reason: 'Need to retire this disposable tenant' });
  assert.equal(decommission.status, 403);

  const announce = await request(app)
    .post('/api/platform/announcements')
    .set(bearer('admin'))
    .send({ title: 'Hello', message: 'World announcement' });
  assert.equal(announce.status, 403);

  const invalid = await request(app)
    .post('/api/platform/tenants/11111111-1111-4111-8111-111111111111/decommission')
    .set(bearer('super-admin'))
    .send({ reason: 'short' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'REASON_REQUIRED');
});

test('Platform API: announcement delete and operator assignment require Super Admin', async () => {
  const del = await request(app).delete('/api/platform/announcements/ann-1').set(bearer('admin'));
  assert.equal(del.status, 403);

  const assign = await request(app).post('/api/platform/operators').set(bearer('admin')).send({ uid: 'user-1', role: 'SUPPORT' });
  assert.equal(assign.status, 403);

  const invalid = await request(app).post('/api/platform/operators').set(bearer('super-admin')).send({ uid: 'user-1', role: 'SUPER_ADMIN' });
  assert.equal(invalid.status, 400);
});

test('Platform API: attention and enterprise-queue are readable or fail closed for Admin', async () => {
  const attention = await request(app).get('/api/platform/attention').set(bearer('admin'));
  assert.ok([200, 503].includes(attention.status));
  if (attention.status === 200) assert.ok(Array.isArray(attention.body.items));
  else assert.equal(attention.body.error?.code, 'ATTENTION_SIGNALS_UNAVAILABLE');

  const queue = await request(app).get('/api/platform/enterprise-queue').set(bearer('admin'));
  assert.ok([200, 503].includes(queue.status));
  if (queue.status === 200) assert.ok(queue.body.queue);
  else assert.equal(queue.body.error?.code, 'ENTERPRISE_QUEUE_UNAVAILABLE');
});

test('Platform API: search rejects one-character queries', async () => {
  const empty = await request(app).get('/api/platform/search?q=a').set(bearer('admin'));
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.users, []);
  assert.deepEqual(empty.body.tenants, []);
});

test('Platform API: search executes the MariaDB SQL contract and escapes LIKE metacharacters', async () => {
  const { setPoolForTests, closePool } = require('../database/mysql');
  const calls = [];
  const query = 'ac%me_\\corp';
  const expectedLike = '%ac\\%me\\_\\\\corp%';

  setPoolForTests({
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM users')) {
        return [[{
          id: 'user-7',
          email: 'owner@acme.example',
          displayName: null,
          firstname: 'Acme',
          lastname: 'Owner',
          membership: 'Premium',
        }]];
      }
      if (sql.includes('FROM enterprise_tenants')) {
        return [[{
          id: 'tenant-7',
          slug: 'acme',
          displayName: 'Acme Careers',
          lifecycleState: 'ACTIVE',
          isolationTier: 'STANDARD',
        }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async end() {},
  });

  try {
    const res = await request(app)
      .get('/api/platform/search')
      .query({ q: query })
      .set(bearer('admin'));

    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'MARIADB');
    assert.equal(res.body.query, query);
    assert.deepEqual(res.body.users, [{
      id: 'user-7',
      email: 'owner@acme.example',
      displayName: 'Acme Owner',
      membership: 'Premium',
    }]);
    assert.equal(res.body.tenants[0].id, 'tenant-7');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      const escape = call.sql.match(/LIKE \? ESCAPE '([^']+)'/);
      assert.ok(escape, 'each wildcard predicate must declare an escape character');
      assert.equal(escape[1].length, 2, `MariaDB must receive an escaped backslash SQL literal; SQL=${JSON.stringify(call.sql)}`);
      assert.ok([...escape[1]].every(character => character === '\\'));
      assert.equal(call.params[0], expectedLike);
      assert.equal(call.params[1], expectedLike);
      assert.equal(call.params[2], query);
    }
  } finally {
    await closePool();
  }
});

test('Platform API: Super Admin mutations require MFA when SUPER_ADMIN_MFA_REQUIRED=true', async () => {
  process.env.SUPER_ADMIN_MFA_REQUIRED = 'true';
  try {
    assert.equal(superAdminMfaEnforced(), true);
    const res = await request(app).post('/api/platform/maintenance').set(bearer('super-admin')).send({ enabled: false });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'SUPER_ADMIN_MFA_REQUIRED');
  } finally {
    delete process.env.SUPER_ADMIN_MFA_REQUIRED;
  }
});

after(async () => {
  try {
    const { getPool } = require('../database/mysql');
    await getPool().end();
  } catch (_) {}
});
