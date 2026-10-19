#!/usr/bin/env node
/**
 * DIR-008 — release gate runner (R-40).
 *
 * Executes every DIR-008 suite that can run in this environment, plus the
 * TypeScript and production-build gates, and writes the *observed* results to
 * `docs/test-reports/DIR-008-release-gates.{json,md}`.
 *
 * The runner never invents a result: a suite that cannot be executed is listed
 * as BLOCKED with the reason, and any non-zero exit fails the whole gate.
 *
 * Usage: node scripts/dir008-run-release-gates.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'test-reports');

const SUITES = [
  { id: 'layout-engine', layer: 'unit', file: 'tests/dir008-layout-engine.test.mjs' },
  { id: 'template-evidence', layer: 'static', file: 'tests/dir008-template-evidence.test.mjs' },
  { id: 'field-robustness', layer: 'unit', file: 'tests/dir008-field-robustness.test.mjs' },
  { id: 'print-and-docx', layer: 'integration', file: 'tests/dir008-print-and-docx.test.mjs' },
  { id: 'template-deep-dives', layer: 'unit', file: 'tests/dir008-template-deep-dives.test.mjs' },
  { id: 'legacy-parity', layer: 'static', file: 'tests/dir008-legacy-parity.test.mjs' },
  { id: 'demo-data-guard', layer: 'static', file: 'tests/dir008-demo-data-guard.test.mjs' },
  { id: 'master-profile', layer: 'unit', file: 'tests/dir008-master-profile.test.mjs' },
  { id: 'dashboard-metrics', layer: 'unit', file: 'tests/dir008-dashboard-metrics.test.mjs' },
  { id: 'preview-modal-a11y', layer: 'static', file: 'tests/dir008-preview-modal-a11y.test.mjs' },
  { id: 'sharing-contract', layer: 'static', file: 'tests/dir008-sharing-contract.test.mjs' },
  { id: 'resume-crud-ui', layer: 'static', file: 'tests/dir008-resume-crud-ui.test.mjs' },
  { id: 'rich-text-and-dates', layer: 'unit', file: 'tests/dir008-rich-text-and-dates.test.mjs' },
  { id: 'employer-resume-access', layer: 'integration', file: 'tests/dir008-employer-resume-access.test.mjs' },
  { id: 'resumes-hub-ux', layer: 'static', file: 'tests/dir110-resumes-hub-ux.test.mjs' },
  { id: 'export-client', layer: 'unit', file: 'tests/export-client.test.mjs' },
  { id: 'xss', layer: 'static', file: 'tests/xss.test.mjs' },
  { id: 'backend-public-share', layer: 'backend', file: 'backend/test/dir008-public-share.test.js' },
  { id: 'backend-resume-crud', layer: 'backend', file: 'backend/test/dir008-resume-crud.test.js' },
  { id: 'backend-docx-export', layer: 'backend', file: 'backend/test/docx-export.test.js' },
  { id: 'backend-docx-parity', layer: 'backend', file: 'backend/test/docx-parity.test.js' },
  { id: 'backend-cross-app-share', layer: 'backend', file: 'backend/test/cross-app-download-share-audit.test.js' },
];

function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: options.cwd || ROOT, encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    status: result.status,
    durationMs: Date.now() - started,
    output,
    counts: {
      pass: Number(output.match(/^# pass (\d+)$/m)?.[1] ?? NaN),
      fail: Number(output.match(/^# fail (\d+)$/m)?.[1] ?? NaN),
      skipped: Number(output.match(/^# skipped (\d+)$/m)?.[1] ?? 0),
    },
  };
}

const results = [];
for (const suite of SUITES) {
  const execution = run(process.execPath, ['--test', suite.file]);
  const ok = execution.status === 0 && execution.counts.fail === 0;
  results.push({
    id: suite.id,
    layer: suite.layer,
    file: suite.file,
    status: ok ? 'PASS' : 'FAIL',
    exitCode: execution.status,
    tests: execution.counts.pass,
    failures: execution.counts.fail,
    skipped: execution.counts.skipped,
    durationMs: execution.durationMs,
    tail: ok ? null : execution.output.split('\n').filter(Boolean).slice(-25).join('\n'),
  });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${suite.id.padEnd(26)} ${execution.counts.pass} pass, ${execution.counts.fail} fail (${execution.durationMs} ms)\n`);
}

const typecheck = run('npx', ['tsc', '--noEmit'], { cwd: path.join(ROOT, 'frontend') });
results.push({
  id: 'typescript',
  layer: 'static',
  file: 'frontend (tsc --noEmit)',
  status: typecheck.status === 0 ? 'PASS' : 'FAIL',
  exitCode: typecheck.status,
  tests: null,
  failures: typecheck.status === 0 ? 0 : 1,
  skipped: 0,
  durationMs: typecheck.durationMs,
  tail: typecheck.status === 0 ? null : typecheck.output.slice(-2000),
});
process.stdout.write(`${typecheck.status === 0 ? 'PASS' : 'FAIL'}  typescript                 exit ${typecheck.status}\n`);

const build = run('npx', ['vite', 'build'], { cwd: path.join(ROOT, 'frontend') });
const buildSeconds = Number(build.output.match(/built in ([\d.]+)s/)?.[1] ?? NaN);
results.push({
  id: 'production-build',
  layer: 'build',
  file: 'frontend (vite build)',
  status: build.status === 0 ? 'PASS' : 'FAIL',
  exitCode: build.status,
  tests: null,
  failures: build.status === 0 ? 0 : 1,
  skipped: 0,
  durationMs: build.durationMs,
  buildSeconds: Number.isFinite(buildSeconds) ? buildSeconds : null,
  budgetSeconds: 3,
  tail: build.status === 0 ? null : build.output.slice(-2000),
});
process.stdout.write(`${build.status === 0 ? 'PASS' : 'FAIL'}  production-build           ${Number.isFinite(buildSeconds) ? `${buildSeconds}s` : 'n/a'}\n`);

const blocked = [
  { id: 'browser-e2e', reason: 'No browser binary: Playwright install fails (CDN ECONNRESET); Chromium bundle lacks libnspr4 in this image.' , requirement: 'R-41' },
  { id: 'visual-screenshots', reason: 'Depends on browser-e2e; template evidence therefore uses SSR markup + structural assertions.', requirement: 'R-41' },
  { id: 'server-pdf', reason: 'Puppeteer PDF requires the same missing Chromium; print CSS is verified, PDF bytes are not produced.', requirement: 'R-29' },
  { id: 'axe-wcag', reason: 'Automated axe audit requires a browser; static a11y contracts pass, AA contrast is unverified in situ.', requirement: 'R-34' },
];

const totals = results.reduce(
  (acc, row) => {
    if (row.status === 'PASS') acc.passed += 1;
    else acc.failed += 1;
    if (typeof row.tests === 'number') acc.tests += row.tests;
    if (typeof row.failures === 'number') acc.testFailures += row.failures;
    return acc;
  },
  { suites: results.length, passed: 0, failed: 0, tests: 0, testFailures: 0 }
);

const sha = run('git', ['rev-parse', 'HEAD']).output.trim();
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).output.trim();

const report = {
  directive: 'DIR-008',
  generatedAt: new Date().toISOString(),
  branch,
  commit: sha,
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  totals,
  results,
  blocked,
  note: 'Every PASS row is the observed exit status and test counts of the command in this environment. BLOCKED rows were not executed and are never reported as passing.',
};

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'DIR-008-release-gates.json'), `${JSON.stringify(report, null, 2)}\n`);

const md = [];
md.push('# DIR-008 — release gate report');
md.push('');
md.push(`Generated: ${report.generatedAt}`);
md.push(`Branch: \`${branch}\`  Commit: \`${sha}\``);
md.push(`Environment: Node ${report.node}, ${report.platform}`);
md.push('');
md.push(`**Totals:** ${totals.passed}/${totals.suites} suites passed, ${totals.tests} tests passed, ${totals.testFailures} failed.`);
md.push('');
md.push('| Suite | Layer | Tests | Failures | Exit | Duration | Status |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of results) {
  md.push(`| ${row.id} | ${row.layer} | ${row.tests ?? '—'} | ${row.failures ?? '—'} | ${row.exitCode} | ${(row.durationMs / 1000).toFixed(1)} s | ${row.status} |`);
}
md.push('');
md.push('## Blocked evidence (not executed)');
md.push('');
md.push('| Evidence | Requirement | Reason |');
md.push('| --- | --- | --- |');
for (const row of blocked) md.push(`| ${row.id} | ${row.requirement} | ${row.reason} |`);
md.push('');
md.push(report.note);
md.push('');
await fs.writeFile(path.join(OUT_DIR, 'DIR-008-release-gates.md'), md.join('\n'));

if (totals.failed > 0) {
  console.error(`\n${totals.failed} gate(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${totals.suites} gates passed (${totals.tests} tests).`);
