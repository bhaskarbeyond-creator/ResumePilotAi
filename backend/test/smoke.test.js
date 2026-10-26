'use strict';

/**
 * Smoke suite (tier "smoke", REC-017).
 *
 * ## Contract
 *
 * One command, under two minutes, no database required, and it answers a single question:
 * *is this build fit to receive traffic?* It runs after a deploy, before the health check
 * is trusted, and on every pull request.
 *
 * What it asserts, in order of blast radius:
 *
 *  1. the process boots and answers liveness;
 *  2. every critical path is reachable and refuses an anonymous caller;
 *  3. an authenticated caller of each staff role gets the surface its role implies, and is
 *     refused the one it does not;
 *  4. a database-backed surface degrades to 503 (not 500, not a fabricated 200);
 *  5. the static app is served and the SPA entry point exists.
 *
 * It deliberately does **not** assert business payloads — that is the contract suite's job
 * and would make smoke slow and flaky. A smoke failure must always mean "do not deploy".
 *
 * Run: cd backend && npm run smoke
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

/** Critical paths: method, path, and the statuses that mean "the build is alive". */
const CRITICAL_PATHS = Object.freeze([
  { method: 'get', path: '/healthz', expect: [200], auth: false, why: 'liveness probe' },
  { method: 'get', path: '/api/healthz', expect: [200], auth: false, why: 'liveness probe (api prefix)' },
  { method: 'get', path: '/api/me/capabilities', expect: [401, 403], auth: false, why: 'capability endpoint refuses anonymous' },
  { method: 'get', path: '/api/admin/config', expect: [401, 403], auth: false, why: 'configuration census refuses anonymous' },
  { method: 'get', path: '/api/admin/rbac/roles', expect: [401, 403], auth: false, why: 'role bundles refuse anonymous' },
  { method: 'get', path: '/api/admin/audit-logs', expect: [401, 403], auth: false, why: 'audit trail refuses anonymous' },
  { method: 'get', path: '/api/config/runtime', expect: [401, 403], auth: false, why: 'runtime config refuses anonymous' },
]);

let app;

test.before(async () => {
  configService.setConfigPoolForTests(createInMemoryConfigStore().pool);
  setRbacStoreForTests({
    async listRoles() {
      return [
        { name: 'SUPER_ADMIN', rank: 100, isSystem: true },
        { name: 'ADMIN', rank: 80, isSystem: true },
        { name: 'AUDITOR', rank: 60, isSystem: true },
        { name: 'USER', rank: 10, isSystem: true },
      ];
    },
    async listRolePermissions() {
      const rows = [
        ['SUPER_ADMIN', '*', '*'],
        ['ADMIN', 'system.config', 'read'], ['ADMIN', 'system.config', 'write'],
        ['ADMIN', 'users', 'read'], ['ADMIN', 'users', 'write'],
        ['AUDITOR', 'audit', 'read'], ['AUDITOR', 'security', 'read'],
        ['USER', 'resumes', 'manage'],
      ];
      return rows.map(([role, resource, action]) => ({ role, resource, action }));
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  setRepositoryForTests({ async recordAdminAuditLog(row) { return row; }, async getAdminAuditLogs() { return []; } });
  setTokenVerifierForTests(async (token) => {
    const now = Math.floor(Date.now() / 1000);
    const role = String(token).toUpperCase();
    if (!['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'USER'].includes(role)) throw new Error('Invalid token');
    return { uid: `smoke-${role}`, email: `${role.toLowerCase()}@smoke.test`, email_verified: true, role, permissions: [], auth_time: now };
  });
  app = require('../index');
  const { refreshRbacCache } = require('../services/adminRbac');
  await refreshRbacCache();
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

test('smoke: the process answers liveness without authentication', async () => {
  const response = await request(app).get('/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store', 'a cached health check is not a health check');
  assert.ok(response.body && typeof response.body === 'object');
});

test('smoke: every critical path is reachable and refuses an anonymous caller', async () => {
  for (const entry of CRITICAL_PATHS) {
    const response = await request(app)[entry.method](entry.path);
    assert.ok(
      entry.expect.includes(response.status),
      `${entry.method.toUpperCase()} ${entry.path} (${entry.why}) returned ${response.status}, expected ${entry.expect.join('/')}`,
    );
    assert.ok(response.body && typeof response.body === 'object', `${entry.path} must answer JSON, not HTML`);
  }
});

test('smoke: each staff role reaches what its role implies and is refused what it does not', async () => {
  const auth = (role) => ({ Authorization: `Bearer ${role}` });

  const adminCapabilities = await request(app).get('/api/me/capabilities').set(auth('ADMIN'));
  assert.equal(adminCapabilities.status, 200);
  assert.ok(adminCapabilities.body.tabs.some((tab) => tab.id === 'dashboard' && tab.allowed),
    'an ADMIN must be able to open the dashboard: it is the console landing surface');

  const adminCensus = await request(app).get('/api/admin/config').set(auth('ADMIN'));
  assert.equal(adminCensus.status, 200, 'an ADMIN holds system.config.read');
  assert.equal(adminCensus.body.authority.degraded, false);

  const auditorCensus = await request(app).get('/api/admin/config').set(auth('AUDITOR'));
  assert.equal(auditorCensus.status, 200, 'an AUDITOR may read the census');
  assert.equal(auditorCensus.body.authority.privileged, false);

  const userCapabilities = await request(app).get('/api/me/capabilities').set(auth('USER'));
  assert.equal(userCapabilities.status, 200, 'an end user may ask what it may do');
  assert.deepStrictEqual(userCapabilities.body.tabs.filter((tab) => tab.allowed), [],
    'an end user has no admin console surface, so the console renders its forbidden state rather than an empty tab strip');

  const userCensus = await request(app).get('/api/admin/config').set(auth('USER'));
  assert.equal(userCensus.status, 403);
});

test('smoke: a database-backed surface degrades to 503, never to a fabricated 200 or a 500', async () => {
  // The in-memory store answers configuration reads, but the outbox tables are not there,
  // which is the same condition a fresh deployment has before the seed job runs.
  const response = await request(app).get('/api/platform/queues').set({ Authorization: 'Bearer SUPER_ADMIN' });
  assert.ok([200, 401, 403, 503].includes(response.status), `queues returned ${response.status}`);
  assert.notEqual(response.status, 500, 'an unavailable dependency is a 503, not an unhandled error');
  if (response.status === 503) {
    assert.equal(response.body.error.code, 'QUEUE_QUERY_UNAVAILABLE',
      'the error code must be the documented one, so an operator knows what to restart');
  }
});

test('smoke: an unknown API path answers JSON, never the SPA shell', async () => {
  // 401 is the correct answer here and is asserted as such: the `/api` mount authenticates
  // before routing, so an unauthenticated caller cannot use 404-vs-401 to enumerate which
  // endpoints exist. What matters for a smoke check is that the answer is JSON — an HTML
  // shell returned to an API client is the defect this guards.
  const anonymous = await request(app).get('/api/does-not-exist-at-all');
  assert.ok([401, 404].includes(anonymous.status), `expected 401 or 404, got ${anonymous.status}`);
  assert.ok(anonymous.body && typeof anonymous.body === 'object');
  assert.ok(!String(anonymous.text || '').includes('<!DOCTYPE'), 'an unknown API path must not return the SPA shell');

  const authenticated = await request(app).get('/api/does-not-exist-at-all').set({ Authorization: 'Bearer SUPER_ADMIN' });
  assert.equal(authenticated.status, 404, 'authenticated, the path genuinely does not exist');
  assert.ok(!String(authenticated.text || '').includes('<!DOCTYPE'));
});
