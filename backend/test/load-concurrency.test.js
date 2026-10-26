'use strict';

/**
 * Control-plane load test at the agreed concurrency (tier "performance").
 *
 * ## The agreement this encodes
 *
 * The product budget for the administrative console is: **50 concurrent
 * operators, p95 < 750 ms per control-plane read, zero errors**. 50 is not
 * arbitrary — it is 2× the documented peak concurrent-admin estimate in
 * `02-scope-and-method.md` §Operational assumptions, held flat so the budget
 * tightens rather than relaxes as the console grows. The p95 ceiling is the
 * in-process latency budget from `performance-budget.test.js` (120–200 ms
 * median single-user) multiplied by the queueing allowance at 50-way
 * concurrency on a shared pool (connectionLimit 15).
 *
 * This runs against the in-process app with the in-memory stores, exactly like
 * `performance-budget.test.js`: the number being protected is the code's cost
 * per request, not database latency. When this budget is missed, the cause is
 * the code — an N+1 that `mariadb-query-budget.test.js` catches per-request
 * shows up here as a latency cliff under concurrency.
 *
 * Run: NODE_ENV=test node --test test/load-concurrency.test.js
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

const CONCURRENCY = 50;
const P95_BUDGET_MS = 750;

function percentile(samples, fraction) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

test.before(async () => {
  configService.setConfigPoolForTests(createInMemoryConfigStore().pool);
  setRbacStoreForTests({
    async listRoles() { return [{ name: 'ADMIN', rank: 80, isSystem: true }]; },
    async listRolePermissions() {
      return [
        { role: 'ADMIN', resource: 'system.config', action: 'read' },
        { role: 'ADMIN', resource: 'system.config', action: 'write' },
        { role: 'ADMIN', resource: 'audit', action: 'read' },
      ];
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  await refreshRbacCache();
  setRepositoryForTests({
    async recordAdminAuditLog(row) { return row; },
    async getAdminAuditLogs() { return []; },
  });
  setTokenVerifierForTests(async () => ({
    uid: 'load-admin', email: 'load@test', email_verified: true, role: 'ADMIN',
    permissions: [], auth_time: Math.floor(Date.now() / 1000),
  }));
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

/** Fire `count` concurrent GETs and return per-request wall times + statuses. */
async function fire(app, path, count) {
  const timings = [];
  const statuses = [];
  await Promise.all(Array.from({ length: count }, async () => {
    const started = process.hrtime.bigint();
    const response = await request(app).get(path).set('Authorization', 'Bearer ADMIN');
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
    statuses.push(response.status);
  }));
  return { timings, statuses };
}

test(`load: ${CONCURRENCY} concurrent capability reads stay inside the p95 budget with zero errors`, async () => {
  const app = require('../index');
  // Warm the caches first: the budget is for the steady state an operator hits
  // after the first navigation, and a cold-cache miss is budgeted separately.
  await request(app).get('/api/me/capabilities').set('Authorization', 'Bearer ADMIN');

  const { timings, statuses } = await fire(app, '/api/me/capabilities', CONCURRENCY);
  assert.ok(statuses.every(status => status === 200), `every request must succeed, saw ${JSON.stringify(statuses)}`);
  const p95 = percentile(timings, 0.95);
  assert.ok(
    p95 <= P95_BUDGET_MS,
    `capabilities p95 ${p95.toFixed(1)}ms exceeds the ${P95_BUDGET_MS}ms budget at ${CONCURRENCY}-way concurrency ` +
    `(median ${percentile(timings, 0.5).toFixed(1)}ms)`,
  );
});

test(`load: ${CONCURRENCY} concurrent configuration census reads stay inside the p95 budget`, async () => {
  const app = require('../index');
  await request(app).get('/api/admin/config').set('Authorization', 'Bearer ADMIN');

  const { timings, statuses } = await fire(app, '/api/admin/config', CONCURRENCY);
  assert.ok(statuses.every(status => status === 200), `every request must succeed, saw ${JSON.stringify(statuses)}`);
  const p95 = percentile(timings, 0.95);
  assert.ok(
    p95 <= P95_BUDGET_MS,
    `config census p95 ${p95.toFixed(1)}ms exceeds the ${P95_BUDGET_MS}ms budget at ${CONCURRENCY}-way concurrency ` +
    `(median ${percentile(timings, 0.5).toFixed(1)}ms)`,
  );
});

test('load: the error budget is zero — a concurrency spike must not surface 5xx', async () => {
  const app = require('../index');
  const paths = ['/api/me/capabilities', '/api/admin/config', '/api/admin/audit-logs?limit=10'];
  const results = await Promise.all(paths.map(path => fire(app, path, 15)));
  for (const [index, { statuses }] of results.entries()) {
    const failures = statuses.filter(status => status >= 500);
    assert.deepStrictEqual(failures, [], `${paths[index]} returned ${failures.length} server errors under load`);
  }
});

test('load: concurrency does not amplify cache reads into store queries', async () => {
  // The cache contract (from performance-budget.test.js) must survive concurrency:
  // 50 parallel reads of the same key may not cost 50 store round trips.
  const store = createInMemoryConfigStore();
  let queries = 0;
  configService.setConfigPoolForTests({
    async query(...args) { queries += 1; return store.pool.query(...args); },
    async getConnection() { return store.pool.getConnection(); },
  });
  try {
    await configService.getConfigValue('operations.queues.sampleSize');
    const afterWarm = queries;
    await Promise.all(Array.from({ length: CONCURRENCY }, () =>
      configService.getConfigValue('operations.queues.sampleSize')));
    assert.equal(queries, afterWarm, `${CONCURRENCY} parallel reads of one key must not re-query the store`);
  } finally {
    configService.setConfigPoolForTests(null);
  }
});
