'use strict';

/**
 * The one place that decides whether a database-backed tier runs, skips, or fails.
 *
 * ## The problem this solves
 *
 * Six suites in this repository need a disposable MariaDB. Before this module each of them
 * carried its own `const ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true'` followed by
 * `skip: ENABLED ? false : '…'`. That reads as "optional tier", and it has two failures that
 * only appear in CI:
 *
 *  1. **A forgotten flag is indistinguishable from a pass.** If the environment stops
 *     providing `RUN_MARIADB_INTEGRATION` — a renamed variable, a job copied without its `env`
 *     block, a service that failed to start before the step ran — every one of those suites
 *     exits 0 having asserted nothing. The gate reports green and proves nothing, which is
 *     worse than reporting red.
 *  2. **The reason lives in six places.** A developer who sees `# SKIP` gets one line of
 *     advice per file, none of which says which flag, which database, or whether the skip is
 *     legitimate.
 *
 * ## The rule
 *
 * | Environment | Flag | Outcome |
 * |---|---|---|
 * | CI (`CI` / `GITHUB_ACTIONS` / `GITLAB_CI` / `BUILDKITE` / `TF_BUILD` set) | `true` | **run** |
 * | CI | unset or `false` | **fail** — `IntegrationGateError`, naming the flag and the job |
 * | Local | `true` | **run** |
 * | Local | unset or `false` | **skip**, with the exact command to run it |
 * | never | `1` / `yes` / `TRUE` | accepted — a flag doorman that rejects `1` teaches people to lie |
 *
 * "Fail" is spelled `assert.fail` by the caller's `skip`-replacement: `decide()` returns
 * `{ run: false, reason }` and `gate()` throws, because a `node:test` skip is the one thing
 * that can silently turn a broken tier green.
 *
 * ## What is deliberately not here
 *
 * It does not check that the database is reachable. Reachability is the test's own assertion:
 * a configured CI job with a dead database must fail with the driver's error, not skip with a
 * friendly message. Conflating "not configured" with "not reachable" is how a tier becomes
 * optional again.
 *
 * @module test-support/integrationGate
 */

/** Environment variables that mean "this process is CI", across the providers in use. */
const CI_ENV_KEYS = Object.freeze(['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'TF_BUILD', 'CIRCLECI', 'JENKINS_URL']);

/** Values that mean "on". Anything else, including a typo, means off. */
const TRUTHY = Object.freeze(['true', '1', 'yes', 'on']);

/** Raised when a CI run is missing the flag that makes a tier meaningful. */
class IntegrationGateError extends Error {
  /**
   * @param {string} message operator-facing sentence
   * @param {{flag: string, tier: string, hint: string}} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = 'IntegrationGateError';
    this.code = 'INTEGRATION_GATE_CLOSED';
    this.detail = detail;
  }
}

/**
 * Is this process running in CI?
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isCI(env = process.env) {
  return CI_ENV_KEYS.some(key => String(env[key] ?? '').trim() !== '' && String(env[key]).trim() !== '0');
}

/**
 * Is a gate flag switched on?
 * @param {string} flag
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isEnabled(flag, env = process.env) {
  return TRUTHY.includes(String(env[flag] ?? '').trim().toLowerCase());
}

/**
 * The decision, as data — so it can be tested without spawning a process.
 *
 * @param {object} options
 * @param {string} options.flag environment variable that enables the tier
 * @param {string} options.tier human name, used in the failure message
 * @param {string} options.hint the command a developer runs to enable it locally
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {{run: true, ci: boolean} | {run: false, ci: boolean, reason: string, failLoud: boolean}}
 */
function decide({ flag, tier, hint, env = process.env }) {
  const ci = isCI(env);
  if (isEnabled(flag, env)) return { run: true, ci };
  if (ci) {
    return {
      run: false,
      ci,
      failLoud: true,
      reason: `${tier} was skipped in CI because ${flag} is unset. A database tier that silently skips is a gate that always passes: set ${flag}=true in the job environment and make the service a declared dependency. (${hint})`,
    };
  }
  return {
    run: false,
    ci,
    failLoud: false,
    reason: `${tier} needs a disposable MariaDB. Locally: ${hint}`,
  };
}

/**
 * Resolve the options object `node:test` expects, throwing in CI when the flag is missing.
 *
 * ```js
 * test('…', integrationGate.gate({ flag: 'RUN_MARIADB_INTEGRATION', tier: 'EXPLAIN', hint }), async () => …)
 * ```
 *
 * @param {{flag: string, tier: string, hint: string, env?: NodeJS.ProcessEnv}} options
 * @returns {{skip: false | string}}
 */
function gate(options) {
  const decision = decide(options);
  if (decision.run) return { skip: false };
  if (decision.failLoud) {
    throw new IntegrationGateError(decision.reason, {
      flag: options.flag,
      tier: options.tier,
      hint: options.hint,
    });
  }
  return { skip: decision.reason };
}

module.exports = {
  CI_ENV_KEYS,
  TRUTHY,
  IntegrationGateError,
  isCI,
  isEnabled,
  decide,
  gate,
};
