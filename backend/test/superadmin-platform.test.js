'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  deriveAction,
  deriveCategory,
  deriveSeverity,
  sanitizeAuditValue,
  recordAdminAuditLog,
} = require('../security/adminAudit');
const { isSuperAdmin, setTokenVerifierForTests } = require('../security/auth');

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
});

test('Super Admin & Platform Module: recordAdminAuditLog mock execution succeeds', async () => {
  const fakeDocs = {};
  const mockDb = {
    collection(name) {
      return {
        doc(id = 'generated-id') {
          return {
            async set(data) {
              fakeDocs[`${name}/${id}`] = data;
              return { writeTime: new Date() };
            },
          };
        },
      };
    },
  };
  const mockAdmin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date(),
      },
    },
  };

  const result = await recordAdminAuditLog(mockDb, mockAdmin, {
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
  assert.ok(fakeDocs[`admin_audit_logs/${result.id}`]);
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
  assert.equal(readRes.status, 200);
  assert.equal(typeof readRes.body.enabled, 'boolean');

  // Admin cannot toggle maintenance (Super Admin only)
  const adminToggle = await request(app)
    .post('/api/platform/maintenance')
    .set(bearer('admin'))
    .send({ enabled: true });
  assert.equal(adminToggle.status, 403);
  assert.equal(adminToggle.body.error.code, 'FORBIDDEN');
});
