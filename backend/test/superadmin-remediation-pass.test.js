'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

function bearer(role, uid = `uid-${role.toLowerCase()}`) {
  return {
    Authorization: `Bearer mock-token-${role}`,
    'X-Request-Id': `req-${role}`,
  };
}

test.before(() => {
  setTokenVerifierForTests(async token => {
    if (token === 'mock-token-super-admin') {
      return {
        uid: 'sa-audit-uid',
        email: 'sa@resumepilot.test',
        email_verified: true,
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_second_factor: 'totp' },
      };
    }
    if (token === 'mock-token-admin') {
      return {
        uid: 'admin-audit-uid',
        email: 'admin@resumepilot.test',
        email_verified: true,
        role: 'ADMIN',
        permissions: ['users.read', 'users.update', 'users.create', 'system.config.read', 'system.config.write', 'tenants.manage'],
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_second_factor: 'totp' },
      };
    }
    if (token === 'mock-token-user') {
      return { uid: 'user-audit-uid', email: 'user@test.com', email_verified: true, role: 'USER', permissions: [] };
    }
    throw new Error('Invalid token');
  });
});

test('Super Admin Bulk Operations: rejects unauthorized callers and self-modification', async () => {
  const unauth = await request(app).post('/api/admin/users/bulk').send({ uids: ['uid-1'], action: 'suspend' });
  assert.equal(unauth.status, 401);

  const userDenied = await request(app)
    .post('/api/admin/users/bulk')
    .set(bearer('user'))
    .send({ uids: ['uid-1'], action: 'suspend' });
  assert.equal(userDenied.status, 403);

  const selfMod = await request(app)
    .post('/api/admin/users/bulk')
    .set(bearer('admin'))
    .send({ uids: ['admin-audit-uid'], action: 'suspend' });
  assert.equal(selfMod.status, 200);
  assert.equal(selfMod.body.success, false);
  assert.equal(selfMod.body.results.failed.length, 1);
  assert.match(selfMod.body.results.failed[0].error, /own account/i);
});

test('Super Admin Bulk Operations: validates action parameter and uid bounds', async () => {
  const badAction = await request(app)
    .post('/api/admin/users/bulk')
    .set(bearer('admin'))
    .send({ uids: ['uid-1'], action: 'invalid-action' });
  assert.equal(badAction.status, 400);

  const emptyUids = await request(app)
    .post('/api/admin/users/bulk')
    .set(bearer('admin'))
    .send({ uids: [], action: 'suspend' });
  assert.equal(emptyUids.status, 400);
});

test('Super Admin Command Center: returns extended telemetry with growth and subscription metrics', async () => {
  const res = await request(app)
    .get('/api/platform/command-center')
    .set(bearer('super-admin'));

  assert.ok([200, 503].includes(res.status));
  if (res.status === 200) {
    assert.ok(res.body.kpis);
    assert.ok(Object.hasOwn(res.body.kpis, 'newUsers7d'));
    assert.ok(Object.hasOwn(res.body.kpis, 'newUsers30d'));
    assert.ok(Object.hasOwn(res.body.kpis, 'activeSubscriptions'));
    assert.ok(typeof res.body.kpis.totalUsers === 'number');
    assert.ok(typeof res.body.kpis.resumesCreated === 'number');
  }
});

test('Super Admin Global Search: returns multi-entity search results including orders and tickets', async () => {
  const res = await request(app)
    .get('/api/platform/search?q=test')
    .set(bearer('admin'));

  assert.ok([200, 503].includes(res.status));
  if (res.status === 200) {
    assert.equal(res.body.source, 'MARIADB');
    assert.ok(Array.isArray(res.body.users));
    assert.ok(Array.isArray(res.body.tenants));
    assert.ok(Array.isArray(res.body.orders));
    assert.ok(Array.isArray(res.body.tickets));
  }
});

test('Payment Webhooks Diagnostic: returns sanitized events stream and rejects unauthorized callers', async () => {
  const unauth = await request(app).get('/api/platform/payment-webhooks');
  assert.equal(unauth.status, 401);

  const userDenied = await request(app)
    .get('/api/platform/payment-webhooks')
    .set(bearer('user'));
  assert.equal(userDenied.status, 403);

  const res = await request(app)
    .get('/api/platform/payment-webhooks')
    .set(bearer('admin'));

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.events));
  assert.equal(res.body.source, 'payment_webhook_events');
  assert.ok(Array.isArray(res.body.providers));
});

test('Payment Webhooks Replay: requires SuperAdmin authorization and validates event ID', async () => {
  const adminForbidden = await request(app)
    .post('/api/platform/payment-webhooks/ev_non_existent/replay')
    .set(bearer('admin'));
  assert.equal(adminForbidden.status, 403);

  const notFound = await request(app)
    .post('/api/platform/payment-webhooks/ev_non_existent_12345/replay')
    .set(bearer('super-admin'));
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'WEBHOOK_EVENT_NOT_FOUND');
});

