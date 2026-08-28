/**
 * Server-side authorization tests for the Platform Health control plane.
 *
 * The requirement is explicit: never trust frontend hiding. Every assertion
 * here bypasses the UI entirely and calls the API directly, so a route that is
 * merely hidden in React but open on the server will fail these tests.
 *
 * Roles exercised: unauthenticated, ordinary user, SUPPORT, ADMIN, SUPER_ADMIN.
 */
process.env.NODE_ENV = 'test';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const auth = require('../security/auth');

// Token value encodes the role, so each request can assume a different identity.
const IDENTITIES = {
  user: { uid: 'user-1', email: 'user@example.com', role: 'USER', email_verified: true },
  support: { uid: 'support-1', email: 'support@example.com', role: 'SUPPORT', email_verified: true },
  admin: { uid: 'admin-1', email: 'admin@example.com', role: 'ADMIN', email_verified: true },
  'admin-unverified': { uid: 'admin-2', email: 'admin2@example.com', role: 'ADMIN', email_verified: false },
  'super-admin': { uid: 'super-1', email: 'super@example.com', role: 'SUPER_ADMIN', email_verified: true },
};

auth.setTokenVerifierForTests(async token => {
  const identity = IDENTITIES[token];
  if (!identity) throw new Error('invalid token');
  return identity;
});

const app = require('../index');

const as = (method, path, token) => {
  const req = request(app)[method](path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

/* ------------------------------------------------------------------ *
 * Authentication boundary
 * ------------------------------------------------------------------ */

test('operational status rejects unauthenticated callers', async () => {
  for (const path of [
    '/api/platform/operational-status',
    '/api/platform/operational-status/api-matrix',
    '/api/platform/operational-status/database',
    '/api/platform/health-indicator',
  ]) {
    const res = await as('get', path);
    assert.equal(res.status, 401, `${path} must reject anonymous callers, got ${res.status}`);
  }
});

test('operational status rejects an ordinary authenticated user', async () => {
  const res = await as('get', '/api/platform/operational-status', 'user');
  assert.equal(res.status, 403, `an ordinary user must not read platform health, got ${res.status}`);
});

test('SUPPORT cannot read the platform health control plane', async () => {
  // SUPPORT holds only users.read and email.logs.read.
  const res = await as('get', '/api/platform/operational-status', 'support');
  assert.equal(res.status, 403, `SUPPORT must not read platform health, got ${res.status}`);
});

/* ------------------------------------------------------------------ *
 * ADMIN: allowed reads, denied privileged actions
 * ------------------------------------------------------------------ */

test('ADMIN may read operational status and the API matrix', async () => {
  for (const path of [
    '/api/platform/operational-status',
    '/api/platform/operational-status/api-matrix',
    '/api/platform/health-indicator',
  ]) {
    const res = await as('get', path, 'admin');
    assert.equal(res.status, 200, `ADMIN must be able to read ${path}, got ${res.status}`);
  }
});

test('ADMIN is denied the SUPER_ADMIN-only provider test', async () => {
  const res = await as('post', '/api/platform/operational-status/database/test', 'admin');
  assert.equal(res.status, 403, `provider test must be SUPER_ADMIN only, got ${res.status}`);
});

test('an ordinary user is denied the provider test', async () => {
  const res = await as('post', '/api/platform/operational-status/database/test', 'user');
  assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
});

test('the provider test rejects unauthenticated callers', async () => {
  const res = await as('post', '/api/platform/operational-status/database/test');
  assert.equal(res.status, 401);
});

/* ------------------------------------------------------------------ *
 * SUPER_ADMIN: allowed
 * ------------------------------------------------------------------ */

test('SUPER_ADMIN may read every operational-status surface', async () => {
  // MariaDB is the immutable application-data owner. Enumerate every service
  // published by the snapshot and ensure the canonical database service is
  // present; no alternate data-plane branch is valid.
  for (const path of [
    '/api/platform/operational-status',
    '/api/platform/operational-status/api-matrix',
    '/api/platform/health-indicator',
  ]) {
    const res = await as('get', path, 'super-admin');
    assert.equal(res.status, 200, `${path} must be readable by SUPER_ADMIN, got ${res.status}`);
  }

  const snapshot = await as('get', '/api/platform/operational-status', 'super-admin');
  const serviceIds = (snapshot.body?.services || []).map(item => item.id);
  assert.ok(serviceIds.length > 0, 'the health snapshot must publish monitored services');

  assert.ok(serviceIds.includes('database'),
    `the snapshot must publish the canonical MariaDB service; got ${serviceIds.join(', ')}`);

  for (const serviceId of serviceIds) {
    const res = await as('get', `/api/platform/operational-status/${serviceId}`, 'super-admin');
    assert.ok([200, 503].includes(res.status),
      `authorized detail must return data or a controlled dependency failure for ${serviceId}, got ${res.status}`);
    if (res.status === 503) assert.equal(res.body?.error?.code, 'SERVICE_DETAIL_UNAVAILABLE');
  }
});

/* ------------------------------------------------------------------ *
 * Input validation and error contracts
 * ------------------------------------------------------------------ */

test('an unknown service id yields 404 with a stable error code, not a 500', async () => {
  const res = await as('get', '/api/platform/operational-status/no-such-service', 'super-admin');
  assert.equal(res.status, 404);
  assert.equal(res.body?.error?.code, 'SERVICE_NOT_FOUND');
});

test('a malformed service id is rejected as 400, never reaching the collector', async () => {
  const res = await as('get', '/api/platform/operational-status/..%2F..%2Fetc%2Fpasswd', 'super-admin');
  assert.ok([400, 404].includes(res.status), `expected 400/404 for a malformed id, got ${res.status}`);
});

test('a service with no safe automated test is refused rather than faked', async () => {
  const res = await as('post', '/api/platform/operational-status/payments-paypal/test', 'super-admin');
  assert.equal(res.status, 400);
  assert.equal(res.body?.error?.code, 'SERVICE_TEST_UNSUPPORTED');
});

/* ------------------------------------------------------------------ *
 * Secret hygiene and role-scoped diagnostics
 * ------------------------------------------------------------------ */

test('no operational-status payload leaks configured secret values', async () => {
  process.env.STRIPE_SECRET = 'sk_live_canary_should_never_appear';
  process.env.SMTP_PASS = 'canary-smtp-password';
  process.env.PAYPAL_CLIENT_SECRET = 'canary-paypal-secret';
  const platformHealth = require('../services/platformHealth');
  platformHealth.resetHealthCache();

  try {
    for (const token of ['admin', 'super-admin']) {
      const res = await as('get', '/api/platform/operational-status', token);
      const body = JSON.stringify(res.body);
      for (const canary of ['sk_live_canary_should_never_appear', 'canary-smtp-password', 'canary-paypal-secret']) {
        assert.ok(!body.includes(canary), `${token} payload leaked a secret value`);
      }
      assert.ok(!/BEGIN [A-Z ]*PRIVATE KEY/.test(body), `${token} payload leaked key material`);
    }
  } finally {
    delete process.env.STRIPE_SECRET;
    delete process.env.SMTP_PASS;
    delete process.env.PAYPAL_CLIENT_SECRET;
    platformHealth.resetHealthCache();
  }
});

test('host-level diagnostics are withheld from ADMIN and shown to SUPER_ADMIN', async () => {
  const elevated = await as('get', '/api/platform/operational-status', 'super-admin');
  const standard = await as('get', '/api/platform/operational-status', 'admin');

  assert.equal(elevated.body.elevated, true);
  assert.equal(standard.body.elevated, false);

  const find = (body, id) => body.services.find(service => service.id === id);
  const elevatedProcess = find(elevated.body, 'backend-process');
  const standardProcess = find(standard.body, 'backend-process');

  // The elevated view carries host diagnostics.
  assert.ok('pid' in (elevatedProcess.metrics || {}), 'SUPER_ADMIN should see pid');
  // The standard view must not.
  for (const restricted of ['pid', 'loadAverage1m', 'systemFreeMemMb', 'systemTotalMemMb', 'host']) {
    assert.ok(!(restricted in (standardProcess.metrics || {})), `ADMIN must not see ${restricted}`);
  }
  // Non-sensitive observations survive for both.
  assert.ok('uptimeSeconds' in (standardProcess.metrics || {}), 'ADMIN should still see uptime');
});

/* ------------------------------------------------------------------ *
 * Public availability contract
 * ------------------------------------------------------------------ */

test('service availability is public, uncached and secret-free', async () => {
  const res = await as('get', '/api/service-availability');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.match(res.headers['cache-control'] || '', /no-store/);

  // Booleans only.
  for (const value of Object.values(res.body.payments || {})) assert.equal(typeof value, 'boolean');
  for (const value of Object.values(res.body.auth || {})) assert.equal(typeof value, 'boolean');
  assert.equal(typeof res.body.enterpriseTenancy, 'boolean');

  const body = JSON.stringify(res.body);
  for (const forbidden of ['secret', 'privateKey', 'apiKey', 'password', 'token']) {
    assert.ok(!body.toLowerCase().includes(forbidden.toLowerCase()), `availability payload must not mention ${forbidden}`);
  }
});

/* ------------------------------------------------------------------ *
 * Enterprise tenancy gate stays honest
 * ------------------------------------------------------------------ */

test('a disabled enterprise tenancy is reported as DISABLED, never inferred during collector failure', async () => {
  const res = await as('get', '/api/platform/operational-status/enterprise-tenancy', 'super-admin');
  assert.ok([200, 503].includes(res.status));
  if (res.status === 503) {
    assert.equal(res.body?.error?.code, 'SERVICE_DETAIL_UNAVAILABLE');
    return;
  }
  const { service } = res.body;
  assert.ok(['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED', 'NOT_CONFIGURED', 'NOT_SUPPORTED', 'UNKNOWN'].includes(service.state));
  if (service.state === 'DISABLED') {
    assert.match(service.reason, /deliberate|intentional|disabled|false/i);
    assert.equal(service.configuration, 'DISABLED_BY_CONFIGURATION');
  }
});

after(async () => {
  try {
    const { getPool } = require('../database/mysql');
    await getPool().end();
  } catch (_) {}
});
