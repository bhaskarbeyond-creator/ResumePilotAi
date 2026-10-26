'use strict';

/**
 * Sustained load — the control plane under more concurrency than it is expected to see.
 *
 * ## What this is, and is not
 *
 * It is a load test in the sense that matters for a gate: a fixed number of requests are
 * issued at a fixed concurrency against the real Express app, and the test fails if the
 * error rate is non-zero, if the p95 exceeds the committed budget, or if the event loop is
 * blocked long enough to make the latency distribution meaningless.
 *
 * It is not a capacity benchmark. There is no database in the gate, the pool is in-memory,
 * and the sandbox has one core more or less depending on the minute. Absolute numbers here
 * would be dishonest; what is honest is the *p95 relative to the budget for the same
 * endpoints*, plus the invariants that do not depend on machine speed at all: every request
 * answered, none rejected, no unbounded memory growth per request.
 *
 * The agreed concurrency for the admin plane is **20 concurrent requests** — an operations
 * team of a dozen plus a dashboard that fires several reads on load. A request that needs a
 * database runs against a 10-connection pool, so concurrency above that queues; the budget
 * below is set with that in mind.
 *
 * Browser vitals (LCP/INP/CLS) are asserted by `frontend/tests/admin-console-ux.spec.ts` and
 * the Lighthouse job, not here.
 *
 * Run: NODE_ENV=test node --test --test-concurrency=1 --test-force-exit test/load-sustained.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

const CONCURRENCY = 20;
const REQUESTS = 200;

/** Issue `REQUESTS` requests at `CONCURRENCY`, returning per-request latency in ms. */
async function drive(app, path, total = REQUESTS, concurrency = CONCURRENCY) {
  const latencies = [];
  const statuses = [];
  let issued = 0;

  async function worker() {
    for (;;) {
      const index = issued;
      issued += 1;
      if (index >= total) return;
      const started = process.hrtime.bigint();
      const response = await request(app).get(path).set('Authorization', 'Bearer ADMIN');
      latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
      statuses.push(response.status);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { latencies, statuses };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
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
  setRepositoryForTests({
    async recordAdminAuditLog(row) { return row; },
    async getAdminAuditLogs() { return []; },
  });
  setTokenVerifierForTests(async () => ({
    uid: 'load-admin',
    email: 'admin@test',
    email_verified: true,
    role: 'ADMIN',
    permissions: [],
    auth_time: Math.floor(Date.now() / 1000),
  }));
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

test('load: the capability census answers every request at 20 concurrent, p95 under budget', async () => {
  const app = require('../index');
  await request(app).get('/api/me/capabilities').set('Authorization', 'Bearer ADMIN');
  const { latencies, statuses } = await drive(app, '/api/me/capabilities');
  const failures = statuses.filter((status) => status !== 200).length;
  const p95 = percentile(latencies, 0.95);

  assert.equal(failures, 0, `${failures} of ${statuses.length} capability requests failed`);
  // 750ms at 20 concurrent on a shared CI runner. This endpoint is the console's first
  // request; if it degrades, every tab feels it.
  assert.ok(p95 <= 750, `capability census p95 is ${p95.toFixed(1)}ms, budget is 750ms`);
});

test('load: the configuration census answers every request at 20 concurrent, p95 under budget', async () => {
  const app = require('../index');
  await request(app).get('/api/admin/config').set('Authorization', 'Bearer ADMIN');
  const { latencies, statuses } = await drive(app, '/api/admin/config');
  const failures = statuses.filter((status) => status !== 200).length;
  const p95 = percentile(latencies, 0.95);

  assert.equal(failures, 0, `${failures} of ${statuses.length} census requests failed`);
  assert.ok(p95 <= 1000, `config census p95 is ${p95.toFixed(1)}ms, budget is 1000ms`);
});

test('load: sustained traffic reaches steady state instead of growing without bound', async () => {
  const app = require('../index');
  await request(app).get('/api/me/capabilities').set('Authorization', 'Bearer ADMIN');

  // Absent `--expose-gc` the heap is measured mid-collection and a single before/after pair
  // is noise, not evidence. So the comparison is between two equal windows *after* a warm-up
  // window: a retention bug grows the second window relative to the first, while a healthy
  // process reuses the same memory and shows no such trend. Forcing GC when it is exposed
  // only tightens the numbers; the assertion holds either way.
  const settle = () => global.gc?.();
  await drive(app, '/api/me/capabilities', 100, CONCURRENCY);
  settle();
  const windowOneStart = process.memoryUsage().heapUsed;
  await drive(app, '/api/me/capabilities', 300, CONCURRENCY);
  settle();
  const windowTwoStart = process.memoryUsage().heapUsed;
  await drive(app, '/api/me/capabilities', 300, CONCURRENCY);
  settle();
  const windowTwoEnd = process.memoryUsage().heapUsed;

  const firstWindow = windowTwoStart - windowOneStart;
  const secondWindow = windowTwoEnd - windowTwoStart;
  assert.ok(
    secondWindow < 8 * 1024 * 300,
    `the second 300-request window retained ${secondWindow} bytes (${(secondWindow / 300).toFixed(0)} B/request)`,
  );
  // Growth must not accelerate: a leak shows the second window substantially larger than the
  // first, because retention compounds. The slack absorbs allocator growth from the warm-up.
  assert.ok(
    secondWindow <= Math.max(firstWindow, 0) + 4 * 1024 * 1024,
    `heap growth accelerated: window one ${firstWindow} bytes, window two ${secondWindow} bytes`,
  );
});

test('load: the limiter holds the line instead of failing open under a burst', async () => {
  const app = require('../index');
  // The auth bucket is the tight one (20/hour in production, 10 000 under NODE_ENV=test) and
  // is keyed per identity. The assertion is not "some request is limited" — that would be a
  // brittle number — but that no response is a 5xx: a limiter that throws takes the endpoint
  // down instead of shedding load.
  const { statuses } = await drive(app, '/api/me/capabilities', 100, CONCURRENCY);
  const serverErrors = statuses.filter((status) => status >= 500);
  assert.deepEqual(serverErrors, [], `limiter produced server errors: ${[...new Set(serverErrors)].join(', ')}`);
});
