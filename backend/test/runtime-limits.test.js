'use strict';

/**
 * Rate-limit snapshot (REC-012, CFG-004/005, REC-020).
 *
 * Three claims are tested, and the third is the one that failed in an earlier
 * implementation:
 *
 *  1. the limiter reads a snapshot synchronously, and the snapshot is replaced when a
 *     configuration write changes it, so a change takes effect without a restart;
 *  2. an unavailable store leaves the previous values in force — an outage must not
 *     disable rate limiting;
 *  3. reading the limits costs **no** database round trip, because `express-rate-limit`
 *     evaluates the limit on every request.
 *
 * Run: NODE_ENV=test node --test test/runtime-limits.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';

const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');
const runtimeLimits = require('../services/runtimeLimits');

test.after(() => {
  runtimeLimits.stopRuntimeLimits();
  configService.setConfigPoolForTests(null);
});

test('the snapshot starts from the boot values and reads synchronously', () => {
  runtimeLimits.startRuntimeLimits({ global: 4200, authHourly: 30, authBurst: 6 });
  const limits = runtimeLimits.currentLimits();
  assert.deepStrictEqual(limits, { global: 4200, authHourly: 30, authBurst: 6 });
  assert.strictEqual(typeof limits.global, 'number');
});

test('a configuration override reaches the snapshot without a restart', async () => {
  const store = createInMemoryConfigStore({
    'security.rateLimit.global': { value: 9000, revision: 2 },
    'security.rateLimit.authHourly': { value: 40, revision: 1 },
    'security.rateLimit.authBurst': { value: 8, revision: 1 },
  });
  configService.setConfigPoolForTests(store.pool);
  try {
    await runtimeLimits.refreshRuntimeLimits();
    assert.deepStrictEqual(runtimeLimits.currentLimits(), { global: 9000, authHourly: 40, authBurst: 8 });
    const health = runtimeLimits.describeRuntimeLimits();
    assert.strictEqual(health.ok, true);
    assert.ok(health.at, 'the refresh timestamp is what makes "restart not required" auditable');
  } finally {
    configService.setConfigPoolForTests(null);
  }
});

test('a store outage leaves the previous limits in force', async () => {
  runtimeLimits.startRuntimeLimits({ global: 1234, authHourly: 22, authBurst: 4 });
  const store = createInMemoryConfigStore();
  configService.setConfigPoolForTests(store.pool);
  try {
    await runtimeLimits.refreshRuntimeLimits();
    const healthy = runtimeLimits.currentLimits();
    store.failNext(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    configService.invalidateConfigCache();
    const result = await runtimeLimits.refreshRuntimeLimits();
    assert.deepStrictEqual(runtimeLimits.currentLimits(), healthy,
      'an outage must not widen or disable a limit: the last known values stay in force');
    assert.ok([true, false].includes(result.ok), 'the refresh reports its outcome rather than throwing');
  } finally {
    configService.setConfigPoolForTests(null);
  }
});

test('reading the current limits performs no database work at all', async () => {
  let queries = 0;
  const store = createInMemoryConfigStore();
  const countingPool = {
    async query(...args) { queries += 1; return store.pool.query(...args); },
    async getConnection() { queries += 1; return store.pool.getConnection(); },
  };
  configService.setConfigPoolForTests(countingPool);
  try {
    await runtimeLimits.refreshRuntimeLimits();
    const baseline = queries;
    for (let index = 0; index < 500; index += 1) runtimeLimits.currentLimits();
    assert.strictEqual(queries, baseline,
      'five hundred limit evaluations (one page load) must cost zero round trips — this is the regression a query-budget test caught');
  } finally {
    configService.setConfigPoolForTests(null);
  }
});
