import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const results = [];
function run(name, command, args = []) {
  console.log(`\n===== ${name} =====`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const status = result.status === 0 ? 'PASS' : 'FAIL';
  results.push({ name, status, exitCode: result.status });
  return status === 'PASS';
}
function blocked(name, reason) {
  console.log(`\n===== ${name}: NOT EXECUTED / ENVIRONMENT BLOCKED =====\n${reason}`);
  results.push({ name, status: 'NOT_EXECUTED', reason });
}

run('Root lockfile consistency', 'npm', ['ci', '--ignore-scripts', '--dry-run']);
run('Backend lockfile consistency', 'npm', ['--prefix', 'backend', 'ci', '--ignore-scripts', '--dry-run']);
run('Product, AI, Resume, Portfolio, CMS, Admin, Profile, Job Tracker, i18n and analytics/privacy', 'npm', ['run', 'test:product']);
run('Security and backend integration', 'npm', ['run', 'test:security']);
run('AI settings regression', 'npm', ['run', 'test:ai-settings']);
run('Templates', 'npm', ['run', 'test:templates']);
run('Production build', 'npm', ['run', 'build']);
run('ESLint', 'npm', ['run', 'lint']);
run('Production dependency audit', 'npm', ['run', 'audit:production']);
run('Full dependency audit', 'npm', ['run', 'audit:all']);

run('Zero-Firestore static and outage certification', 'npm', ['run', 'certify:zero-firestore']);

const chromiumCandidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
if (!chromiumCandidates.some(candidate => fs.existsSync(candidate))) blocked('Browser and live PDF journeys', 'No Chromium executable is installed. Static render tests still ran above.');
else blocked('Browser and live PDF journeys', 'A browser exists, but authenticated staging fixtures and provider accounts are not configured for this local command.');

console.log('\n===== RELEASE CANDIDATE SUMMARY =====');
for (const result of results) console.log(`${result.status.padEnd(14)} ${result.name}${result.reason ? ` — ${result.reason}` : ''}`);
const failed = results.filter(result => result.status === 'FAIL');
if (failed.length) {
  console.error(`\nRelease candidate FAILED: ${failed.length} locally executable step(s) failed.`);
  process.exit(1);
}
console.log('\nAll locally executable release-candidate steps passed. Blocked steps are listed explicitly and are not certified.');
