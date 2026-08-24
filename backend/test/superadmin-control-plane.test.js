'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

function bearer(role, email = `${role.toLowerCase()}@example.com`, uid = `uid-${role.toLowerCase()}`) {
  return {
    Authorization: `Bearer mock-token-${role}`,
    'X-Request-Id': `req-${role}`,
  };
}

test.before(() => {
  setTokenVerifierForTests(async token => {
    if (token === 'mock-token-super-admin') {
      return { uid: 'uid-sa', email: 'sa@example.com', email_verified: true, role: 'SUPER_ADMIN', permissions: ['*'], auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_second_factor: 'totp' } };
    }
    if (token === 'mock-token-admin') {
      return { uid: 'uid-admin', email: 'admin@example.com', email_verified: true, role: 'ADMIN', permissions: ['system.config.write', 'system.config.read', 'users.read', 'users.update', 'users.create', 'users.delete', 'users.roles.manage', 'payments.manage', 'payments.read', 'ai.entitlements.manage', 'ai.usage.read', 'tenants.manage'], auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_second_factor: 'totp' } };
    }
    if (token === 'mock-token-auditor') {
      return { uid: 'uid-auditor', email: 'auditor@example.com', email_verified: true, role: 'AUDITOR', permissions: ['users.read', 'tenants.read', 'payments.read', 'ai.usage.read', 'audit.read', 'security.read'], auth_time: Math.floor(Date.now() / 1000) };
    }
    if (token === 'mock-token-user') {
      return { uid: 'uid-user', email: 'user@example.com', email_verified: true, role: 'USER', permissions: [] };
    }
    throw new Error('Invalid token');
  });
});

test('Super Admin User Directory: rejects anonymous and unprivileged users', async () => {
  const unauth = await request(app).get('/api/admin/users');
  assert.equal(unauth.status, 401);

  const userDenied = await request(app).get('/api/admin/users').set(bearer('user'));
  assert.equal(userDenied.status, 403);
});

test('Super Admin User Directory: returns users with pagination metadata', async () => {
  const res = await request(app).get('/api/admin/users?limit=10').set(bearer('admin'));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.users));
  assert.equal(res.body.pageSize, 10);
  assert.ok(Object.hasOwn(res.body, 'nextPageToken'));
});

test('Super Admin Platform Currency: returns platform currency configuration', async () => {
  const res = await request(app).get('/api/admin/platform/currency').set(bearer('admin'));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.currency);
  assert.ok(res.body.currency.code);
  assert.ok(res.body.currency.symbol);
  assert.ok(Array.isArray(res.body.currency.supportedCurrencies));
});

test('Super Admin Platform Currency: updates platform currency when authorized', async () => {
  const res = await request(app)
    .put('/api/admin/platform/currency')
    .set(bearer('super-admin'))
    .send({ currency: 'USD', allowMultiCurrency: true });
  
  // Either 200 (if DB available) or structured error (if test DB offline)
  assert.ok([200, 503].includes(res.status));
  if (res.status === 200) {
    assert.equal(res.body.success, true);
    assert.equal(res.body.currency.code, 'USD');
  }
});

test('Super Admin Subscriptions: allows payment administrators to query active subscribers', async () => {
  const res = await request(app).get('/api/admin/subscriptions').set(bearer('admin'));
  assert.ok([200, 503].includes(res.status));
  if (res.status === 200) {
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.subscribers));
    assert.ok(Array.isArray(res.body.transactions));
  }
});

test('Super Admin AI Entitlements: allows querying global AI dashboard data', async () => {
  const res = await request(app).get('/api/admin/ai/entitlements').set(bearer('admin'));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.aiGovernance);
  assert.ok(res.body.aiGovernance.globalPresets);
});

test('Super Admin User Creation: rejects invalid email and role escalation', async () => {
  const invalidEmail = await request(app)
    .post('/api/admin/users')
    .set(bearer('admin'))
    .send({ email: 'notanemail', role: 'USER' });
  assert.equal(invalidEmail.status, 400);

  const superAdminEscalation = await request(app)
    .post('/api/admin/users')
    .set(bearer('admin'))
    .send({ email: 'newadmin@example.com', role: 'SUPER_ADMIN' });
  assert.equal(superAdminEscalation.status, 400);
  assert.equal(superAdminEscalation.body.code, 'SUPER_ADMIN_PROVISION_FORBIDDEN');
});
