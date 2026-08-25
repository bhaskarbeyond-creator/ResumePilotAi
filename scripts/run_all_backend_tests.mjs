import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const testDir = path.join(process.cwd(), 'backend', 'test');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();

console.log(`Found ${files.length} test files in backend/test/`);

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
let totalTests = 0;
const failures = [];

for (const file of files) {
  const filePath = path.join(testDir, file);
  try {
    const output = execFileSync(process.execPath, ['--test', filePath], {
      cwd: path.join(process.cwd(), 'backend'),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', ALLOW_TEST_AUTH_VERIFIER: 'true' },
      timeout: 120000,
    });
    
    // Parse test count from output (ℹ tests X, ℹ pass Y)
    const testMatch = output.match(/ℹ tests (\d+)/);
    const passMatch = output.match(/ℹ pass (\d+)/);
    const failMatch = output.match(/ℹ fail (\d+)/);
    const skipMatch = output.match(/ℹ skipped (\d+)/);
    
    const count = testMatch ? parseInt(testMatch[1], 10) : 0;
    const passed = passMatch ? parseInt(passMatch[1], 10) : count;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
    
    totalTests += count;
    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;
    
    console.log(`  ✓ ${file}: ${passed}/${count} passed`);
  } catch (err) {
    console.error(`  ✗ ${file}: FAILED`);
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    console.error(stdout.slice(-500) || stderr.slice(-500) || err.message);
    totalFailed += 1;
    failures.push({ file, error: err.message });
  }
}

console.log('\n=== BACKEND TEST RESULTS ===');
console.log(`Files: ${files.length}`);
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${totalPassed}`);
console.log(`Failed: ${totalFailed}`);
console.log(`Skipped: ${totalSkipped}`);

if (failures.length > 0) {
  console.error('\nFailures:', failures);
  process.exit(1);
}
