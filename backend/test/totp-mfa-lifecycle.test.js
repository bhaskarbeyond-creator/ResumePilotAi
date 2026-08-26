'use strict';

process.env.NODE_ENV = 'test';
process.env.SUPER_ADMIN_MFA_REQUIRED = 'true';
process.env.REQUIRE_RECENT_AUTH_IN_TEST = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

const nowSeconds = () => Math.floor(Date.now() / 1000);

// In-memory mock token verifier reflecting distinct auth states:
// 1. superadmin-no-mfa: Authenticated Super Admin, NO second factor
// 2. superadmin-mfa: Authenticated Super Admin, MFA Verified (sign_in_second_factor = 'totp')
// 3. superadmin-stale-mfa: Super Admin with MFA, but auth_time > 10 minutes ago
// 4. normal-user: Authenticated USER role, NO second factor
// 5. normal-user-mfa: Authenticated USER role, WITH second factor
setTokenVerifierForTests(async (token) => {
  const now = nowSeconds();
  if (token === 'superadmin-no-mfa') {
    return {
      uid: 'sa-01',
      email: 'superadmin@example.com',
      email_verified: true,
      role: 'SUPER_ADMIN',
      auth_time: now,
      firebase: { sign_in_second_factor: null },
    };
  }
  if (token === 'superadmin-mfa') {
    return {
      uid: 'sa-01',
      email: 'superadmin@example.com',
      email_verified: true,
      role: 'SUPER_ADMIN',
      auth_time: now,
      firebase: { sign_in_second_factor: 'totp' },
    };
  }
  if (token === 'superadmin-stale-mfa') {
    return {
      uid: 'sa-01',
      email: 'superadmin@example.com',
      email_verified: true,
      role: 'SUPER_ADMIN',
      auth_time: now - 3600, // 1 hour ago
      firebase: { sign_in_second_factor: 'totp' },
    };
  }
  if (token === 'normal-user') {
    return {
      uid: 'u-01',
      email: 'user@example.com',
      email_verified: true,
      role: 'USER',
      auth_time: now,
      firebase: { sign_in_second_factor: null },
    };
  }
  if (token === 'normal-user-mfa') {
    return {
      uid: 'u-01',
      email: 'user@example.com',
      email_verified: true,
      role: 'USER',
      auth_time: now,
      firebase: { sign_in_second_factor: 'totp' },
    };
  }
  throw new Error('INVALID_TOKEN');
});

function buildMockDb() {
  const auditLogs = [];
  const users = new Map([
    ['users/target-user', { uid: 'target-user', email: 'target@example.com', status: 'ACTIVE', role: 'USER' }],
  ]);
  const _tenants = new Map([
    ['enterprise_tenants/acme', { id: 'acme', displayName: 'Acme Corp', lifecycleState: 'ACTIVE' }],
  ]);

  return {
    auditLogs,
    collection(name) {
      if (name === 'security_audit_logs' || name === 'admin_audit_logs') {
        return {
          doc: () => ({
            set: async (entry) => { auditLogs.push(entry); },
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: (id) => ({
            get: async () => ({ exists: users.has(`users/${id}`), data: () => users.get(`users/${id}`) }),
            set: async (val, opt) => {
              const prev = users.get(`users/${id}`) || {};
              users.set(`users/${id}`, opt?.merge ? { ...prev, ...val } : val);
            },
            delete: async () => { users.delete(`users/${id}`); },
          }),
        };
      }
      return {
        doc: (_id) => ({
          get: async () => ({ exists: false, data: () => null }),
          set: async () => {},
        }),
      };
    },
    runTransaction: async (cb) => cb({
      get: async (ref) => ref.get(),
      set: (ref, val, opt) => ref.set(val, opt),
      delete: (ref) => ref.delete(),
    }),
  };
}

const app = require('../index');
const mockDb = buildMockDb();
app.set('db', mockDb);

test('P0 TOTP MFA: Authenticated normal user CANNOT access Super Admin endpoints (AUTHENTICATED != MFA AUTHENTICATED)', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer normal-user')
    .send({ enabled: true, message: 'Maintenance' });

  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'FORBIDDEN');
});

test('P0 TOTP MFA: Super Admin WITHOUT second factor is REJECTED with SUPER_ADMIN_MFA_REQUIRED (RECENT AUTH != MFA VERIFIED)', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer superadmin-no-mfa')
    .send({ enabled: true, message: 'Maintenance' });

  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'SUPER_ADMIN_MFA_REQUIRED');
  assert.match(res.body.error?.message, /require a second authentication factor/i);
});

test('P0 TOTP MFA: Super Admin with MFA but STALE auth_time is REJECTED with RECENT_AUTH_REQUIRED', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer superadmin-stale-mfa')
    .send({ enabled: true, message: 'Maintenance' });

  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'RECENT_AUTH_REQUIRED');
});

test('P0 TOTP MFA: Super Admin WITH valid TOTP MFA and recent auth SUCCEEDS and records audit log', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer superadmin-mfa')
    .send({ enabled: true, message: 'Platform under maintenance' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(mockDb.auditLogs.length > 0, true);
  assert.equal(mockDb.auditLogs.some(e => e.action === 'PLATFORM_MAINTENANCE_UPDATED'), true);
});
