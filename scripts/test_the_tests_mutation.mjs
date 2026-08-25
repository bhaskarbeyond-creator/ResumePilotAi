import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

console.log('====================================================');
console.log('MUTATION & NEGATIVE-CONTROL VERIFICATION (TEST THE TESTS)');
console.log('====================================================\n');

const results = [];

function runTest(testCommand, expectedToPass) {
  try {
    const parts = testCommand.split(' ');
    const output = execFileSync(parts[0], parts.slice(1), {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 30000,
    });
    return { passed: true, output };
  } catch (err) {
    return { passed: false, error: err.message, output: err.stdout || err.stderr };
  }
}

function verifyNegativeControl(name, targetFile, mutateFn, testCmd) {
  console.log(`[MUTATION PROOF] Testing: ${name}`);
  const originalCode = fs.readFileSync(targetFile, 'utf8');
  
  // 1. Mutate
  const mutatedCode = mutateFn(originalCode);
  fs.writeFileSync(targetFile, mutatedCode, 'utf8');
  
  // 2. Run test (must FAIL)
  const failedRun = runTest(testCmd, false);
  const mutationCaught = !failedRun.passed;
  console.log(`  Step 1: Controlled defect injected -> Test Failed? ${mutationCaught ? 'YES (Defect Caught ✓)' : 'NO (FAILED TO CATCH DEFECT ✗)'}`);
  
  // 3. Restore
  fs.writeFileSync(targetFile, originalCode, 'utf8');
  
  // 4. Re-run test (must PASS)
  const passRun = runTest(testCmd, true);
  const restoredPassed = passRun.passed;
  console.log(`  Step 2: Restored original code -> Test Passed? ${restoredPassed ? 'YES (Verified ✓)' : 'NO (BROKEN ✗)'}\n`);
  
  results.push({
    name,
    targetFile,
    mutationCaught,
    restoredPassed,
    verdict: (mutationCaught && restoredPassed) ? 'PROVEN' : 'FAILED'
  });
}

// 1. OAuth password behavior: Revert Card 2 to require Current Password for OAuth users
verifyNegativeControl(
  '1. OAuth Password Separation (Bypass current password for OAuth)',
  'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx',
  (code) => code.replace('if (usesPasswordProvider && (isEmailChanged || isPasswordChanged) && !accountPasswordState.currentPassword) {', 'if ((isEmailChanged || isPasswordChanged) && !accountPasswordState.currentPassword) {'),
  'node --test tests/oauth-password-security-ux.test.mjs'
);

// 2. Live Preview: Remove Live Preview menu item
verifyNegativeControl(
  '2. Live Preview Action in 3-Dots Menu',
  'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
  (code) => code.replace('Live Preview', 'Dead Preview'),
  'node --test tests/live-preview-forensic.test.mjs'
);

// 3. ESC Hierarchy: Break child modal Escape handler
verifyNegativeControl(
  '3. ESC Modal Keyboard Hierarchy & Dismissal',
  'src/components/BuildResume/TemplateSelectionModal.jsx',
  (code) => code.replace('if (previewTemplate) {', 'if (false && previewTemplate) {'),
  'node --test tests/modal-escape-keyboard-ux.test.mjs'
);

// 4. Double-submit protection: Break double submit disabled check
verifyNegativeControl(
  '4. Double-Submit Protection on Password Save',
  'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx',
  (code) => code.replaceAll('disabled={isSubmitting}', 'disabled={false}'),
  'node --test tests/oauth-password-security-ux.test.mjs'
);

// 5. Account Deletion: Force password requirement even for OAuth
verifyNegativeControl(
  '5. Account Deletion Keyword Gate for OAuth',
  'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx',
  (code) => code.replace("disabled={deleteInputText !== 'DELETE' || (usesPasswordProvider && !deletePassword) || isSubmitting}", "disabled={deleteInputText !== 'DELETE' || !deletePassword || isSubmitting}"),
  'node --test tests/oauth-password-security-ux.test.mjs'
);

// 6. 2FA Flow: Break TOTP MFA Lifecycle invariant
verifyNegativeControl(
  '6. TOTP MFA Lifecycle & Multi-Factor Security Gate',
  'backend/security/auth.js',
  (code) => code.replace("hasSecondFactor(req.user)", "true"),
  'node --test backend/test/totp-mfa-lifecycle.test.js'
);

// 7. Password Creation Terminology: Break OAuth security password terminology
verifyNegativeControl(
  '7. Transparent Terminology for OAuth Password Creation',
  'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx',
  (code) => code.replaceAll('Create Account Security Password', 'Change Account Password'),
  'node --test tests/oauth-password-security-ux.test.mjs'
);

// 8. Mobile / Global Modal Dismissal: Remove window-level keydown listener
verifyNegativeControl(
  '8. Global Window-Level Keydown Dismissal on Homepage',
  'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
  (code) => code.replace("window.addEventListener('keydown', this.handleGlobalKeyDown)", "// removed"),
  'node --test tests/modal-escape-keyboard-ux.test.mjs'
);

// Write results
fs.writeFileSync('test-results/NEGATIVE_CONTROL_MUTATION_REPORT.json', JSON.stringify(results, null, 2));

console.log('====================================================');
console.log('NEGATIVE-CONTROL MUTATION SUMMARY:');
console.log('====================================================');
let allProven = true;
for (const r of results) {
  console.log(`[${r.verdict}] ${r.name}`);
  if (r.verdict !== 'PROVEN') allProven = false;
}
console.log(`\nOVERALL MUTATION VERDICT: ${allProven ? 'ALL TESTS EMPIRICALLY PROVEN SENSITIVE TO DEFECTS' : 'SOME MUTATIONS FAILED'}`);
console.log('====================================================\n');
