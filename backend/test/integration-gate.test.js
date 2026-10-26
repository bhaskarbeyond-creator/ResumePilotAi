'use strict';

/**
 * Decision 2 — the database tiers are opt-in locally, mandatory in CI, and loud when either
 * rule is broken.
 *
 * A skipped test is the only test result that can be *wrong in the safe direction*: it reads
 * as "not applicable" while the thing it would have caught ships. So the gate that decides is
 * itself tested, three ways:
 *
 *  1. **The decision table** — every combination of (CI, flag) mapped to run / skip / fail,
 *     tested as data so there is no environment manipulation in the assertions.
 *  2. **The throw** — `gate()` must raise, not return a skip, in CI without the flag. A
 *     returned `{ skip: '…' }` would be honoured by `node:test` and the tier would be green.
 *  3. **A real sub-process** — the previous two test the function; this one proves the whole
 *     pipeline. A child process runs a fixture suite that calls `gate()` with `CI=true` and no
 *     flag, and the assertion is that the *process exit code is non-zero*. That is the
 *     property CI relies on; everything above it is a detail.
 *
 * The same sub-process technique proves the local case still skips, so the fix cannot silently
 * make the tier mandatory on a laptop and unusable.
 *
 * Run: NODE_ENV=test node --test test/integration-gate.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gate = require('../test-support/integrationGate');

const OPTIONS = Object.freeze({
  flag: 'RUN_MARIADB_INTEGRATION',
  tier: 'EXPLAIN layer',
  hint: 'RUN_MARIADB_INTEGRATION=true DB_HOST=127.0.0.1 npm run test:query-plan',
});

/** A minimal child environment: only what the gate reads, so a developer shell cannot leak in. */
function childEnv(overrides) {
  const base = { PATH: process.env.PATH, NODE_ENV: 'test' };
  return { ...base, ...overrides };
}

/**
 * Run a fixture suite in a child process and return `{ status, output }` without throwing.
 * @param {string} source fixture file contents
 * @param {Record<string,string>} env
 */
function runFixture(source, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const file = path.join(dir, 'fixture.test.js');
  // The fixture is generated next to the module it requires, by absolute path, so the child
  // does not depend on the cwd or on module resolution from a temp directory.
  const gatePath = path.join(__dirname, '..', 'test-support', 'integrationGate.js');
  fs.writeFileSync(file, source.replace('__GATE__', gatePath), 'utf8');
  try {
    const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', file], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout || ''}${error.stderr || ''}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ── 1. the decision table ───────────────────────────────────────────── */

test('locally, with the flag, the tier runs', () => {
  const decision = gate.decide({ ...OPTIONS, env: { RUN_MARIADB_INTEGRATION: 'true' } });
  assert.deepEqual(decision, { run: true, ci: false });
});

test('locally, without the flag, the tier skips and says exactly what to run', () => {
  const decision = gate.decide({ ...OPTIONS, env: {} });
  assert.equal(decision.run, false);
  assert.equal(decision.failLoud, false, 'a laptop must not be forced to have a database');
  assert.match(decision.reason, /needs a disposable MariaDB/);
  assert.match(decision.reason, /RUN_MARIADB_INTEGRATION=true/, 'the skip text carries the command, not just the flag name');
  assert.match(decision.reason, /EXPLAIN layer/, 'the skip names the tier it belongs to');
});

test('in CI, without the flag, the decision is a failure rather than a skip', () => {
  const decision = gate.decide({ ...OPTIONS, env: { CI: 'true' } });
  assert.equal(decision.run, false);
  assert.equal(decision.failLoud, true, 'failLoud is what turns a silent skip into a red build');
  assert.match(decision.reason, /skipped in CI/);
  assert.match(decision.reason, /RUN_MARIADB_INTEGRATION/);
});

test('in CI, with the flag, the tier runs — the fix does not make CI unpassable', () => {
  const decision = gate.decide({ ...OPTIONS, env: { CI: 'true', RUN_MARIADB_INTEGRATION: 'true' } });
  assert.deepEqual(decision, { run: true, ci: true });
});

test('every CI provider this repository could run on is recognised', () => {
  for (const key of gate.CI_ENV_KEYS) {
    assert.equal(gate.isCI({ [key]: 'true' }), true, `${key} must be treated as CI`);
  }
  assert.equal(gate.isCI({ CI: '0' }), false, 'CI=0 is the convention for "not CI" and must not lock a laptop out');
  assert.equal(gate.isCI({ CI: '' }), false);
  assert.equal(gate.isCI({}), false);
});

test('the flag accepts the spellings people actually type, and nothing else', () => {
  for (const value of ['true', 'TRUE', '1', 'yes', 'on', ' True ']) {
    assert.equal(gate.isEnabled(OPTIONS.flag, { RUN_MARIADB_INTEGRATION: value }), true, `${JSON.stringify(value)} should enable`);
  }
  for (const value of ['', 'false', '0', 'no', 'off', 'y', 'enabled']) {
    assert.equal(gate.isEnabled(OPTIONS.flag, { RUN_MARIADB_INTEGRATION: value }), false, `${JSON.stringify(value)} should not enable`);
  }
});

/* ── 2. the throw ────────────────────────────────────────────────────── */

test('gate() throws in CI instead of returning a skip object node:test would honour', () => {
  const previous = { CI: process.env.CI, RUN_MARIADB_INTEGRATION: process.env.RUN_MARIADB_INTEGRATION };
  process.env.CI = 'true';
  delete process.env.RUN_MARIADB_INTEGRATION;
  try {
    assert.throws(
      () => gate.gate(OPTIONS),
      error => {
        assert.equal(error.name, 'IntegrationGateError');
        assert.equal(error.code, 'INTEGRATION_GATE_CLOSED');
        assert.equal(error.detail.flag, 'RUN_MARIADB_INTEGRATION');
        assert.equal(error.detail.tier, 'EXPLAIN layer');
        assert.match(error.message, /skipped in CI/);
        return true;
      },
    );
  } finally {
    if (previous.CI === undefined) delete process.env.CI; else process.env.CI = previous.CI;
    if (previous.RUN_MARIADB_INTEGRATION === undefined) delete process.env.RUN_MARIADB_INTEGRATION;
    else process.env.RUN_MARIADB_INTEGRATION = previous.RUN_MARIADB_INTEGRATION;
  }
});

test('gate() returns a skip (not false) locally, so the reason survives into the report', () => {
  const previous = { CI: process.env.CI, RUN_MARIADB_INTEGRATION: process.env.RUN_MARIADB_INTEGRATION };
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
  delete process.env.RUN_MARIADB_INTEGRATION;
  try {
    const options = gate.gate(OPTIONS);
    assert.equal(typeof options.skip, 'string');
    assert.match(options.skip, /RUN_MARIADB_INTEGRATION=true/);
  } finally {
    if (previous.CI === undefined) delete process.env.CI; else process.env.CI = previous.CI;
    if (previous.RUN_MARIADB_INTEGRATION !== undefined) process.env.RUN_MARIADB_INTEGRATION = previous.RUN_MARIADB_INTEGRATION;
  }
});

test('gate() with the flag returns run, in both environments', () => {
  const previous = { CI: process.env.CI };
  delete process.env.GITHUB_ACTIONS;
  delete process.env.GITLAB_CI;
  try {
    for (const ci of [undefined, 'true']) {
      if (ci === undefined) delete process.env.CI; else process.env.CI = ci;
      process.env.RUN_MARIADB_INTEGRATION = 'true';
      assert.deepEqual(gate.gate(OPTIONS), { skip: false }, `CI=${ci} with the flag must run`);
    }
  } finally {
    delete process.env.RUN_MARIADB_INTEGRATION;
    if (previous.CI === undefined) delete process.env.CI; else process.env.CI = previous.CI;
  }
});

/* ── 3. the real pipeline, in a child process ────────────────────────── */

const FIXTURE = `
'use strict';
const test = require('node:test');
const gate = require('__GATE__');
const OPTIONS = { flag: 'RUN_MARIADB_INTEGRATION', tier: 'fixture tier', hint: 'RUN_MARIADB_INTEGRATION=true npm run whatever' };
test('fixture: the gated tier', gate.gate(OPTIONS), async () => {
  // Reached only when the gate let it run.
});
`;

test('end to end: CI without the flag fails the process, with a non-zero exit code', () => {
  const { status, output } = runFixture(FIXTURE, childEnv({ CI: 'true' }));
  assert.notEqual(status, 0, `a CI run without the flag must exit non-zero, got ${status}\n${output}`);
  assert.match(output, /INTEGRATION_GATE_CLOSED|skipped in CI/, 'the failure must name the gate, not a mysterious assertion');
});

test('end to end: a laptop without the flag skips and still exits zero', () => {
  const { status, output } = runFixture(FIXTURE, childEnv({}));
  assert.equal(status, 0, `a local run without a database must not fail, got ${status}\n${output}`);
  assert.match(output, /SKIP|skip/i, 'the tier must report as skipped, not as passed-with-no-tests');
  assert.match(output, /RUN_MARIADB_INTEGRATION=true/, 'the skip advice must be actionable');
});

test('end to end: CI with the flag runs the tier and exits zero', () => {
  const { status } = runFixture(FIXTURE, childEnv({ CI: 'true', RUN_MARIADB_INTEGRATION: 'true' }));
  assert.equal(status, 0);
});

/* ── 4. the shipped suites actually use it ───────────────────────────── */

test('every MariaDB-backed suite routes its skip decision through the gate', () => {
  const directory = path.join(__dirname);
  // This file is excluded: it names the flag in its own assertions and fixtures, so a textual
  // check would either fail on itself or need an exemption that hides a real one later.
  const files = fs.readdirSync(directory)
    .filter(name => name.endsWith('.test.js') && name !== 'integration-gate.test.js');
  const gated = [];
  for (const name of files) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8');
    if (!source.includes('RUN_MARIADB_INTEGRATION')) continue;
    gated.push(name);
    assert.match(
      source,
      /integrationGate\.(gate|decide)\(/,
      `${name} reads RUN_MARIADB_INTEGRATION directly; a direct read cannot distinguish a local skip from a CI misconfiguration`,
    );
    assert.doesNotMatch(
      source,
      /skip:\s*(ENABLED|RUN_MARIADB_INTEGRATION)\s*\?/,
      `${name} still builds its own skip condition`,
    );
  }
  assert.ok(gated.length >= 4, `expected the database tiers to be gated, found ${gated.length}: ${gated.join(', ')}`);
});

test('the CI workflow sets the flag for the job that owns these tiers', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'quality-gate.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('migration-drill:'));
  assert.ok(job.length > 0, 'the migration-drill job must exist');
  assert.match(job, /RUN_MARIADB_INTEGRATION:\s*'true'/, 'the job must set the flag it requires, or the gate will (correctly) fail it');
});
