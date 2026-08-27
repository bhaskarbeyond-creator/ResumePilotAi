/**
 * TEST COUNT RECONCILIATION (mission §17)
 *
 * Runs every certification suite EXACTLY ONCE and emits one reproducible
 * tally — no double counting across suites. Suites are partitioned by layer:
 *
 *   unit+integration .... backend/test/*.test.js          (node:test)
 *   enterprise .......... backend/enterprise-test/*.test.js (node:test)
 *   frontend-security ... tests/{security-static,secret-scanner-efficacy,xss,mfa-static}.test.mjs
 *   frontend-product .... the package.json test:product file list
 *   zero-firestore ...... tests/certification/firestore-zero-static.test.mjs
 *   runtime-cert ........ tests/certification/{firestore-off-boot,mysql-outage,
 *                         outbox-lifecycle,backup-restore,db-failure-injection}.test.mjs
 *   browser-e2e ......... tests/browser-e2e/run.mjs (its own 18-scenario tally)
 *
 * Output: .arena/evidence/test-reconciliation.json (+ console table)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = path.join(ROOT, '.arena', 'evidence');
fs.mkdirSync(EVIDENCE, { recursive: true });

const LD = { LD_LIBRARY_PATH: `${process.env.HOME}/.cache/nss-install/lib` };

function parseNodeTest(stdout) {
  const get = (key) => {
    const m = stdout.match(new RegExp(`^# ${key} (\\d+)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  return { tests: get('tests'), pass: get('pass'), fail: get('fail'), cancelled: get('cancelled'), skipped: get('skipped'), todo: get('todo') };
}

function runNodeTest(files, opts = {}) {
  const r = spawnSync(process.execPath, ['--test', '--test-force-exit', '--test-concurrency=1', ...files], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...LD, ...(opts.env || {}) }, timeout: opts.timeout || 900_000,
  });
  return { counts: parseNodeTest(r.stdout || ''), exitCode: r.status, tail: (r.stdout || '').slice(-400) };
}

const results = {};

const listTestFiles = (dir) => fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(dir, f));

console.log('== unit+integration (backend/test) ==');
results['unit+integration'] = runNodeTest(listTestFiles(path.join(ROOT, 'backend', 'test')));

console.log('== enterprise (backend/enterprise-test) ==');
results['enterprise'] = runNodeTest(listTestFiles(path.join(ROOT, 'backend', 'enterprise-test')));

console.log('== frontend-security ==');
results['frontend-security'] = runNodeTest(['tests/security-static.test.mjs', 'tests/secret-scanner-efficacy.test.mjs', 'tests/xss.test.mjs', 'tests/mfa-static.test.mjs']);

console.log('== zero-firestore static ==');
results['zero-firestore-static'] = runNodeTest(['tests/certification/firestore-zero-static.test.mjs']);

console.log('== runtime certification ==');
results['runtime-cert'] = runNodeTest([
  'tests/certification/firestore-off-boot.test.mjs',
  'tests/certification/mysql-outage.test.mjs',
  'tests/certification/outbox-lifecycle.test.mjs',
  'tests/certification/backup-restore.test.mjs',
  'tests/certification/db-failure-injection.test.mjs',
], { timeout: 1_200_000 });

console.log('== browser e2e ==');
{
  const r = spawnSync(process.execPath, ['tests/browser-e2e/run.mjs'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...LD }, timeout: 900_000,
  });
  const summaryPath = path.join(EVIDENCE, 'browser-e2e', 'summary.json');
  let browserCounts = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  if (fs.existsSync(summaryPath)) {
    const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    browserCounts = { tests: s.total, pass: s.passed, fail: s.failed, cancelled: 0, skipped: 0, todo: 0 };
  }
  results['browser-e2e'] = { counts: browserCounts, exitCode: r.status, tail: (r.stdout || '').slice(-300) };
}

// Frontend product suite (large; run via the package script to keep the exact file list).
console.log('== frontend-product ==');
{
  const r = spawnSync('npm', ['run', 'test:product'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...LD }, timeout: 900_000 });
  const out = r.stdout || '';
  // Sum across all node:test invocations in the script.
  let tests = 0, pass = 0, fail = 0;
  for (const m of out.matchAll(/^# tests (\d+)/gm)) tests += Number(m[1]);
  for (const m of out.matchAll(/^# pass (\d+)/gm)) pass += Number(m[1]);
  for (const m of out.matchAll(/^# fail (\d+)/gm)) fail += Number(m[1]);
  results['frontend-product'] = { counts: { tests, pass, fail, cancelled: 0, skipped: 0, todo: 0 }, exitCode: r.status, tail: out.slice(-300) };
}

// ── Reconciled tally ──
const order = ['unit+integration', 'enterprise', 'frontend-security', 'frontend-product', 'zero-firestore-static', 'runtime-cert', 'browser-e2e'];
const total = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
const rows = [];
for (const key of order) {
  const c = results[key].counts;
  rows.push({ suite: key, exit: results[key].exitCode, ...c });
  for (const k of Object.keys(total)) total[k] += c[k] || 0;
}

const reconciliation = { runAt: new Date().toISOString(), rows, total };
fs.writeFileSync(path.join(EVIDENCE, 'test-reconciliation.json'), JSON.stringify(reconciliation, null, 2));

console.log('\n┌─────────────────────────┬───────┬───────┬──────┬─────────┐');
console.log('│ suite                   │ tests │ pass  │ fail │ exit    │');
console.log('├─────────────────────────┼───────┼───────┼──────┼─────────┤');
for (const r of rows) {
  console.log(`│ ${r.suite.padEnd(23)} │ ${String(r.tests).padStart(5)} │ ${String(r.pass).padStart(5)} │ ${String(r.fail).padStart(4)} │ ${String(r.exit).padStart(7)} │`);
}
console.log('├─────────────────────────┼───────┼───────┼──────┼─────────┤');
console.log(`│ TOTAL (no double count) │ ${String(total.tests).padStart(5)} │ ${String(total.pass).padStart(5)} │ ${String(total.fail).padStart(4)} │         │`);
console.log('└─────────────────────────┴───────┴───────┴──────┴─────────┘');
process.exit(total.fail === 0 ? 0 : 1);
