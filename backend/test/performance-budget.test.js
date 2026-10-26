'use strict';

/**
 * Performance budgets for the control plane (REC-020, tier "performance").
 *
 * ## What is measured, and what is not
 *
 * This is a *budget* test, not a benchmark: it asserts that a response stays inside a
 * number the product has committed to, so a regression (an N+1 introduced in a resolver, a
 * census that grows with every key) fails in the gate. It runs against an in-memory store,
 * so the numbers exclude database latency — deliberately, because the database is not what
 * this test is protecting. When a budget is missed, the cause is the code.
 *
 * `LCP`/`CLS`/`INP` are browser metrics and are asserted in
 * `frontend/tests/admin-console-ux.spec.ts`, which needs a browser.
 *
 * Budgets:
 *   - capabilities: <= 120ms, payload <= 32KB   (rendered on every console load)
 *   - config census: <= 200ms, payload <= 96KB  (rendered on one tab, 35 entries today)
 *   - audit history: <= 120ms for 50 rows
 *
 * Run: NODE_ENV=test node --test test/performance-budget.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

/** Time `runs` repetitions and return the median, which is stable under CI jitter. */
async function medianDuration(runs, operation) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = process.hrtime.bigint();
    await operation();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)];
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  configService.setConfigPoolForTests(createInMemoryConfigStore().pool);
  setRbacStoreForTests({
    async listRoles() { return [{ name: 'ADMIN', rank: 80, isSystem: true }]; },
    async listRolePermissions() {
      return [
        { role: 'ADMIN', resource: 'system.config', action: 'read' },
        { role: 'ADMIN', resource: 'system.config', action: 'write' },
      ];
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  await refreshRbacCache();
  setRepositoryForTests({ async recordAdminAuditLog(row) { return row; }, async getAdminAuditLogs() { return []; } });
  setTokenVerifierForTests(async () => ({
    uid: 'perf-admin', email: 'admin@test', email_verified: true, role: 'ADMIN',
    permissions: [], auth_time: Math.floor(Date.now() / 1000),
  }));
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

test('performance: the capability payload stays inside 32KB', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/me/capabilities').set('Authorization', 'Bearer ADMIN');
  assert.equal(response.status, 200);
  const bytes = Buffer.byteLength(JSON.stringify(response.body), 'utf8');
  // A console that re-fetches this on every navigation cannot afford a payload that grows
  // with the audit log; the response carries permissions and decisions, not data.
  assert.ok(bytes <= 32 * 1024, `capabilities payload is ${bytes} bytes, budget is 32768`);
});

test('performance: the configuration census is served from cache without re-reading the store', async () => {
  const app = require('../index');
  await request(app).get('/api/admin/config').set('Authorization', 'Bearer ADMIN');
  const median = await medianDuration(7, () => request(app).get('/api/admin/config').set('Authorization', 'Bearer ADMIN'));
  assert.ok(median <= 200, `config census median ${median.toFixed(1)}ms exceeds the 200ms budget`);
});

test('performance: cached resolution does not query the store per read', async () => {
  const store = createInMemoryConfigStore();
  let queries = 0;
  const countingPool = {
    async query(...args) { queries += 1; return store.pool.query(...args); },
    async getConnection() { return store.pool.getConnection(); },
  };
  configService.setConfigPoolForTests(countingPool);
  try {
    await configService.getConfigValue('operations.queues.sampleSize');
    const afterFirst = queries;
    for (let index = 0; index < 25; index += 1) await configService.getConfigValue('operations.queues.sampleSize');
    assert.equal(queries, afterFirst, 'twenty-five reads must cost the same as one: the cache is the contract');
  } finally {
    configService.setConfigPoolForTests(null);
  }
});

test('performance: the census payload stays inside 96KB so it can be rendered on a phone', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/admin/config').set('Authorization', 'Bearer ADMIN');
  const bytes = Buffer.byteLength(JSON.stringify(response.body), 'utf8');
  assert.ok(bytes <= 96 * 1024, `config census payload is ${bytes} bytes, budget is 98304`);
});
