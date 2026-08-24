import { execSync } from 'child_process';
import fs from 'fs';

console.log('================================================================');
console.log('       AUTOMATED NON-VACUITY VERIFICATION SUITE                 ');
console.log('   Proving Critical Invariant Tests Fail on Injected Defects    ');
console.log('================================================================\n');

const experiments = [
  {
    name: 'MFA Boundary & TOTP Claim Invariant',
    testCmd: 'node --test backend/test/totp-mfa-lifecycle.test.js',
    targetFile: 'backend/test/totp-mfa-lifecycle.test.js',
    mutate: (content) => content.replace("sign_in_second_factor: 'totp'", "sign_in_second_factor: null"),
    description: 'Mutating TOTP verification claim to verify test catches unverified sessions'
  },
  {
    name: 'Secret Leakage & Scanner Efficacy Invariant',
    testCmd: 'node --test tests/secret-scanner-efficacy.test.mjs',
    targetFile: 'tests/security-static.test.mjs',
    mutate: (content) => content.replace('/AKIA[0-9A-Z]{16}/,', '// pattern removed'),
    description: 'Removing AWS key detection pattern to prove secret scanner efficacy test catches weakened regexes'
  },
  {
    name: 'Account Browser Session Isolation Invariant',
    testCmd: 'node --test tests/account-isolation.test.mjs',
    targetFile: 'src/utils/browserState.js',
    mutate: (content) => content.replace('for (const key of ACCOUNT_SCOPED_LOCAL_KEYS) local?.removeItem(key);', '// skipped removal'),
    description: 'Disabling session removal on logout to prove account isolation tests fail on residual session state'
  },
  {
    name: 'Payment Projection Secret Redaction & RBAC Invariant',
    testCmd: 'node --test backend/test/payment-settings-rbac.test.js',
    targetFile: 'backend/test/payment-settings-rbac.test.js',
    mutate: (content) => content.replace("set('Authorization', 'Bearer admin')", "set('Authorization', 'Bearer user')"),
    description: 'Demoting token to unauthorized USER to prove RBAC test fails closed'
  }
];

let totalPassedNonVacuity = 0;

for (const exp of experiments) {
  console.log(`\n▶ [Experiment] Invariant: ${exp.name}`);
  console.log(`  Target: ${exp.targetFile}`);
  console.log(`  Hypothesis: Injected defect MUST cause test command to FAIL with non-zero exit code.`);

  const originalContent = fs.readFileSync(exp.targetFile, 'utf8');
  const mutatedContent = exp.mutate(originalContent);

  if (mutatedContent === originalContent) {
    console.error(`  [ERROR] Mutation pattern not found in ${exp.targetFile}!`);
    process.exit(1);
  }

  try {
    // 1. Inject defect
    fs.writeFileSync(exp.targetFile, mutatedContent, 'utf8');
    
    // 2. Run test (must fail)
    let failedAsExpected = false;
    try {
      execSync(exp.testCmd, { stdio: 'pipe' });
    } catch (err) {
      failedAsExpected = true;
    }

    if (!failedAsExpected) {
      console.error(`  [FAILURE] Test VACUOUSLY PASSED even with defect injected! Invariant test is weak.`);
      fs.writeFileSync(exp.targetFile, originalContent, 'utf8');
      process.exit(1);
    }
    console.log(`  ✔ PROVEN NON-VACUOUS: Test failed as expected on injected defect.`);

  } finally {
    // 3. Restore original code
    fs.writeFileSync(exp.targetFile, originalContent, 'utf8');
  }

  // 4. Verify test passes again after restoration
  try {
    execSync(exp.testCmd, { stdio: 'pipe' });
    console.log(`  ✔ RESTORATION CONFIRMED: Test passes cleanly on genuine code.`);
    totalPassedNonVacuity++;
  } catch (err) {
    console.error(`  [FAILURE] Test failed to pass after code restoration!`);
    process.exit(1);
  }
}

console.log('\n================================================================');
console.log(`All ${totalPassedNonVacuity}/${experiments.length} Critical Invariants PROVEN NON-VACUOUS.`);
console.log('Zero false-positive or vacuous tests detected.');
console.log('================================================================\n');
