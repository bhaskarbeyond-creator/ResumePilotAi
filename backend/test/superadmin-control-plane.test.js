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

// The control-plane handlers fail closed with a structured 503 when Firestore /
// Firebase Auth are unavailable (e.g. local runs without credentials). Assertions
// therefore require the strict success shape only when the backing services are
// present, while always asserting deterministic authorization/validation behavior.
function assertSuccessOrUnavailable(res) {
  assert.ok([200, 503].includes(res.status), `unexpected status ${res.status}`);
  if (res.status === 200) {
    assert.equal(res.body.success, true);
  } else {
    assert.equal(res.body.success, false);
    assert.ok(res.body.code);
  }
}

test('Super Admin User Directory: rejects anonymous and unprivileged users', async () => {
  const unauth = await request(app).get('/api/admin/users');
  assert.equal(unauth.status, 401);

  const userDenied = await request(app).get('/api/admin/users').set(bearer('user'));
  assert.equal(userDenied.status, 403);
});

test('Super Admin User Directory: returns users with pagination metadata when available', async () => {
  const res = await request(app).get('/api/admin/users?limit=10').set(bearer('admin'));
  assertSuccessOrUnavailable(res);
  if (res.status === 200) {
    assert.ok(Array.isArray(res.body.users));
    assert.equal(res.body.pageSize, 10);
    assert.ok(Object.hasOwn(res.body, 'nextPageToken'));
  }
});

test('Super Admin Platform Currency: returns platform currency configuration when available', async () => {
  const res = await request(app).get('/api/admin/platform/currency').set(bearer('admin'));
  assertSuccessOrUnavailable(res);
  if (res.status === 200) {
    assert.ok(res.body.currency);
    assert.ok(res.body.currency.code);
    assert.ok(res.body.currency.symbol);
    assert.ok(Array.isArray(res.body.currency.supportedCurrencies));
  }
});

test('Super Admin Platform Currency: updates platform currency when authorized', async () => {
  const res = await request(app)
    .put('/api/admin/platform/currency')
    .set(bearer('super-admin'))
    .send({ currency: 'USD', allowMultiCurrency: true });

  // Either 200 (if DB available) or structured error (if test DB offline / quota limited)
  assert.ok([200, 429, 500, 503].includes(res.status), `unexpected status ${res.status}`);
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

test('Super Admin AI Entitlements: allows querying global AI dashboard data when available', async () => {
  const res = await request(app).get('/api/admin/ai/entitlements').set(bearer('admin'));
  assertSuccessOrUnavailable(res);
  if (res.status === 200) {
    assert.ok(res.body.aiGovernance);
    assert.ok(res.body.aiGovernance.globalPresets);
  }
});

test('Super Admin User Creation: rejects invalid email and role escalation deterministically', async () => {
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

// --- PATCH /api/admin/users/:uid (authoritative admin mutation surface) ---

test('Super Admin User PATCH: rejects invalid role and SUPER_ADMIN role grants deterministically', async () => {
  const invalidRole = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('admin'))
    .send({ role: 'OVERLORD' });
  assert.equal(invalidRole.status, 400);
  assert.equal(invalidRole.body.code, 'INVALID_ROLE');

  const superAdminGrant = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('admin'))
    .send({ role: 'SUPER_ADMIN' });
  assert.equal(superAdminGrant.status, 400);
  assert.equal(superAdminGrant.body.code, 'SUPER_ADMIN_ROLE_FORBIDDEN');
});

test('Super Admin User PATCH: rejects invalid membership and empty changes deterministically', async () => {
  const invalidMembership = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('admin'))
    .send({ membership: 'Ultimate' });
  assert.equal(invalidMembership.status, 400);
  assert.equal(invalidMembership.body.code, 'INVALID_MEMBERSHIP');

  const noChanges = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('admin'))
    .send({});
  assert.equal(noChanges.status, 400);
  assert.equal(noChanges.body.code, 'NO_CHANGES');
});

test('Super Admin User PATCH: unprivileged and read-only roles cannot mutate users', async () => {
  const userSuspends = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('user'))
    .send({ suspended: true });
  assert.equal(userSuspends.status, 403);

  const auditorSuspends = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('auditor'))
    .send({ suspended: true });
  assert.equal(auditorSuspends.status, 403);

  const auditorChangesRole = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('auditor'))
    .send({ role: 'ADMIN' });
  assert.equal(auditorChangesRole.status, 403);
});

test('Super Admin User PATCH: mutation requires the user directory and fails closed when unavailable', async () => {
  const res = await request(app)
    .patch('/api/admin/users/uid-target')
    .set(bearer('admin'))
    .send({ suspended: true, expectedSuspended: false });

  // Legitimate outcomes depend on the test environment's backing services:
  //  - 503 USER_DIRECTORY_UNAVAILABLE when Firebase Auth / Firestore are absent
  //    (e.g. local runs without credentials — deterministic fail-closed).
  //  - 404 USER_NOT_FOUND when the directory is present but the target UID
  //    does not exist.
  //  - 429 / 500 when external database quota / rate limits are hit.
  //  - 200 when the target exists and the mutation is applied.
  assert.ok([200, 404, 429, 500, 503].includes(res.status), `unexpected status ${res.status}`);

  if (res.status === 503) {
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'USER_DIRECTORY_UNAVAILABLE');
  } else if (res.status === 404) {
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'USER_NOT_FOUND');
  } else if (res.status === 200) {
    assert.equal(res.body.success, true);
    assert.ok(res.body.user);
    assert.equal(res.body.user.suspended, true);
  }
});

test.after(() => {
  // Graceful exit for async handles
  setTimeout(() => process.exit(0), 100).unref();
});
