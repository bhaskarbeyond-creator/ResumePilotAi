'use strict';

/**
 * Rate-limit values as an in-memory snapshot (REC-012, CFG-004/005).
 *
 * ## Why not read configuration on the request path
 *
 * The first implementation called `configService.getConfigValue()` from the limiter's
 * `max()` callback. It worked, and it was wrong: `express-rate-limit` evaluates the limit
 * for *every* request, so each request could acquire a pool connection to answer a
 * question whose answer changes at most a few times a day. A query-budget test caught it
 * — the administrative directory went from one round trip to three under concurrent load
 * — which is exactly the class of regression a performance tier exists to catch.
 *
 * The snapshot inverts the dependency: the limiter reads three integers from memory, and
 * the snapshot is replaced when configuration *changes*. There is no polling timer, on
 * purpose — three separate reasons:
 *
 *  - a poll competes with request traffic for pool connections, which is the same
 *    amplification this module exists to remove;
 *  - a poll makes background database activity depend on nothing an operator did, so a
 *    query-budget assertion about one request becomes a measurement of whatever the timer
 *    happened to be doing;
 *  - the only supported way to change these values is the configuration API, which
 *    refreshes the snapshot in the same request that changed them.
 *
 * The consequence is stated plainly rather than hidden: a value edited by hand in SQL is
 * not picked up until the next process start or the next save through the API. Direct SQL
 * is outside the supported write path (the registry is that path), and an operator who
 * takes it is already doing something the audit trail cannot see.
 *
 * ## Failure posture
 *
 * If the store is unreachable, the previous values stay in force. A limiter must never be
 * disabled by an outage — "the database is down, so nothing is rate limited" is the
 * moment an attacker would choose.
 *
 * @module services/runtimeLimits
 */

/** Keys mirrored into the snapshot. */
const KEYS = Object.freeze({
  global: 'security.rateLimit.global',
  authHourly: 'security.rateLimit.authHourly',
  authBurst: 'security.rateLimit.authBurst',
});

/** @type {{global: number, authHourly: number, authBurst: number}} */
let snapshot = Object.freeze({ global: 2500, authHourly: 20, authBurst: 5 });

/** Last successful refresh, for diagnostics and the census. */
let lastRefresh = Object.freeze({ at: null, ok: false, error: null });

/**
 * The values currently in force. Synchronous by design — this is called on every request.
 * @returns {{global: number, authHourly: number, authBurst: number}}
 */
function currentLimits() {
  return snapshot;
}

/**
 * Read the three values from the configuration service and replace the snapshot.
 * A value that fails to read leaves its previous entry untouched.
 *
 * @returns {Promise<{ok: boolean, limits: {global: number, authHourly: number, authBurst: number}}>}
 */
async function refreshRuntimeLimits() {
  // Required lazily: `configService` pulls in the database module, and this module is
  // imported by `index.js` before the pool exists.
  const configService = require('./configService');
  const next = { ...snapshot };
  let ok = true;
  let error = null;
  for (const [field, key] of Object.entries(KEYS)) {
    try {
      const value = Number(await configService.getConfigValue(key, next[field]));
      if (Number.isFinite(value) && value > 0) next[field] = value;
    } catch (caught) {
      ok = false;
      error = String(caught?.message || caught);
    }
  }
  snapshot = Object.freeze(next);
  lastRefresh = Object.freeze({ at: new Date().toISOString(), ok, error });
  return { ok, limits: snapshot };
}

/**
 * Seed the snapshot with the values the process booted with.
 *
 * No database access: the boot values are exactly what the environment declared, which is
 * the same value every reader saw before the registry existed. A deployment that wants a
 * different limit either sets the variable or saves it through the dashboard.
 *
 * @param {{global?: number, authHourly?: number, authBurst?: number}} boot
 * @returns {void}
 */
function startRuntimeLimits(boot = {}) {
  snapshot = Object.freeze({
    global: Number(boot.global) || snapshot.global,
    authHourly: Number(boot.authHourly) || snapshot.authHourly,
    authBurst: Number(boot.authBurst) || snapshot.authBurst,
  });
}

/**
 * Kept for orderly shutdown and for tests that must prove no timer exists.
 * @returns {void}
 */
function stopRuntimeLimits() {
  lastRefresh = Object.freeze({ at: new Date().toISOString(), ok: true, error: null });
}

/** @returns {{at: string|null, ok: boolean, error: string|null}} */
function describeRuntimeLimits() {
  return { ...lastRefresh };
}

/**
 * Test seam: set the snapshot without a store.
 * @param {{global?: number, authHourly?: number, authBurst?: number}} values
 * @returns {void}
 */
function setRuntimeLimitsForTests(values = {}) {
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_TEST_AUTH_VERIFIER !== 'true') {
    throw new Error('Runtime limit injection is disabled outside tests');
  }
  snapshot = Object.freeze({ ...snapshot, ...values });
}

module.exports = {
  KEYS,
  currentLimits,
  refreshRuntimeLimits,
  startRuntimeLimits,
  stopRuntimeLimits,
  describeRuntimeLimits,
  setRuntimeLimitsForTests,
};
