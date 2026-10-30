'use strict';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_VERIFIER = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');
const { setTokenVerifierForTests } = require('../security/auth');

const adminUid = 'test_health_probe_admin';
const superAdminUid = 'test_health_probe_sa';

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === adminUid) {
    return {
      uid: adminUid,
      email: `${adminUid}@ime365.test`,
      email_verified: true,
      role: 'ADMIN',
      auth_time: now,
    };
  }
  if (token === superAdminUid) {
    return {
      uid: superAdminUid,
      email: `${superAdminUid}@ime365.test`,
      email_verified: true,
      role: 'SUPER_ADMIN',
      auth_time: now,
    };
  }
  if (token === 'regular_user_test') {
    return {
      uid: 'regular_user_test',
      email: 'user@test.com',
      role: 'USER',
      auth_time: now,
    };
  }
  return null;
});

function authHeaders(uid) {
  return {
    Authorization: `Bearer ${uid}`,
  };
}

test('FP-A04: /api/platform/health/probes returns api, database, authentication, and cache probes', async () => {
  const res = await request(app)
    .get('/api/platform/health/probes')
    .set(authHeaders(adminUid));

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.services), 'services must be an array');
  const ids = res.body.services.map(s => s.id);
  assert.ok(ids.includes('api'), 'must include api probe');
  assert.ok(ids.includes('database'), 'must include database probe');
  assert.ok(ids.includes('authentication'), 'must include authentication probe');
  assert.ok(ids.includes('cache'), 'must include cache probe');

  const cacheProbe = res.body.services.find(s => s.id === 'cache');
  assert.equal(cacheProbe.name, 'Memory Cache & Rate Limiter');
  assert.ok(['HEALTHY', 'DEGRADED'].includes(cacheProbe.state));
});

test('FP-A04: /api/platform/operational-status publishes cache-store with in-memory store metrics and zero Redis dependency', async () => {
  const res = await request(app)
    .get('/api/platform/operational-status')
    .set(authHeaders(superAdminUid));

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.services), 'services must be an array');
  const cacheStore = res.body.services.find(s => s.id === 'cache-store');
  assert.ok(cacheStore, 'cache-store service must be published in operational-status snapshot');
  assert.equal(cacheStore.name, 'Cache & Rate-Limit Store');
  assert.equal(cacheStore.state, 'OPERATIONAL');
  assert.equal(cacheStore.configuration, 'CONFIGURED');
  assert.equal(cacheStore.metrics.storeType, 'in-memory-lru');
  assert.equal(cacheStore.metrics.redisDependency, 'NONE');
  assert.ok(Number.isFinite(cacheStore.metrics.heapUsedMb));
});

test('FP-A04: /api/platform/operational-status/cache-store detail route returns 200 for SUPER_ADMIN', async () => {
  const res = await request(app)
    .get('/api/platform/operational-status/cache-store')
    .set(authHeaders(superAdminUid));

  assert.equal(res.status, 200);
  assert.equal(res.body.service.id, 'cache-store');
  assert.equal(res.body.service.state, 'OPERATIONAL');
  assert.match(res.body.service.reason, /zero Redis dependency/);
});

test('FP-A04: /api/platform/health/probes rejects unauthenticated callers with 401', async () => {
  const res = await request(app).get('/api/platform/health/probes');
  assert.equal(res.status, 401);
});

test('FP-A04: /api/platform/health/probes rejects non-privileged callers with 403', async () => {
  const res = await request(app)
    .get('/api/platform/health/probes')
    .set(authHeaders('regular_user_test'));

  assert.equal(res.status, 403);
});

test('FP-A04: /api/platform/operational-status sanitizes diagnostic details for standard ADMIN role', async () => {
  const res = await request(app)
    .get('/api/platform/operational-status')
    .set(authHeaders(adminUid));

  assert.equal(res.status, 200);
  assert.equal(res.body.elevated, false);
  const backendProcess = res.body.services.find(s => s.id === 'backend-process');
  assert.ok(backendProcess);
  assert.equal(backendProcess.metrics.pid, undefined, 'standard admin must not see process pid');
  assert.equal(backendProcess.metrics.host, undefined, 'standard admin must not see hostname');
});
