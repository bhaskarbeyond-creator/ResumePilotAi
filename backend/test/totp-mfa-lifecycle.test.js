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

class MaintenanceMariaDbPool {
  constructor() { this.revision = 0; this.setting = null; this.auditLogs = []; }
  async query(sql) {
    if (/INSERT INTO admin_audit_logs/i.test(String(sql))) return [{ affectedRows: 1 }, []];
    throw new Error(`Unexpected maintenance SQL: ${String(sql).replace(/\s+/g, ' ')}`);
  }
  async getConnection() {
    const pool = this;
    return {
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        if (/^SELECT revision FROM system_settings WHERE category = 'maintenance' FOR UPDATE$/i.test(normalized)) {
          return [[pool.revision ? { revision: pool.revision } : null].filter(Boolean), []];
        }
        if (/^INSERT INTO system_settings /i.test(normalized)) {
          pool.setting = JSON.parse(params[0]); pool.revision = Number(params[1]);
          return [{ affectedRows: 1 }, []];
        }
        if (/^INSERT INTO admin_audit_logs /i.test(normalized)) {
          pool.auditLogs.push({ action: 'PLATFORM_MAINTENANCE_UPDATED', metadata: JSON.parse(params[4]) });
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected maintenance transaction SQL: ${normalized}`);
      },
    };
  }
  async end() {}
}

const maintenancePool = new MaintenanceMariaDbPool();
require('../database/mysql').setPoolForTests(maintenancePool);
const app = require('../index');

test('P0 TOTP MFA: Authenticated normal user CANNOT access Super Admin endpoints (AUTHENTICATED != MFA AUTHENTICATED)', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer normal-user')
    .send({ enabled: true, message: 'Maintenance', expectedRevision: 0 });

  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'FORBIDDEN');
});

test('P0 TOTP MFA: Super Admin WITHOUT second factor is REJECTED with SUPER_ADMIN_MFA_REQUIRED (RECENT AUTH != MFA VERIFIED)', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer superadmin-no-mfa')
    .send({ enabled: true, message: 'Maintenance', expectedRevision: 0 });

  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'SUPER_ADMIN_MFA_REQUIRED');
  assert.match(res.body.error?.message, /require a second authentication factor/i);
});

test('P0 TOTP MFA: Super Admin with MFA but STALE auth_time is REJECTED with RECENT_AUTH_REQUIRED', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer superadmin-stale-mfa')
    .send({ enabled: true, message: 'Maintenance', expectedRevision: 0 });

  assert.equal(res.status, 403);
  assert.equal(res.body.error?.code, 'RECENT_AUTH_REQUIRED');
});

test('P0 TOTP MFA: Super Admin WITH valid TOTP MFA and recent auth SUCCEEDS and records audit log', async () => {
  const res = await request(app)
    .post('/api/platform/maintenance')
    .set('Authorization', 'Bearer superadmin-mfa')
    .send({ enabled: true, message: 'Platform under maintenance', expectedRevision: 0 });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(maintenancePool.auditLogs.length > 0, true);
  assert.equal(maintenancePool.auditLogs.some(e => e.action === 'PLATFORM_MAINTENANCE_UPDATED'), true);
});
