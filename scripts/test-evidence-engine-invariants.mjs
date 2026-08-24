import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
import { validateAndDeriveEvidence } from './build-honest-evidence-ledger.mjs';

console.log('================================================================');
console.log('    10 ENGINE MUTATION INVARIANTS AUDIT (REAL ENGINE TESTING)   ');
console.log('    Injecting Defects into Engine Validator & Asserting Rejection');
console.log('================================================================\n');

let passed = 0;
const total = 10;

// Mutation A: Component-only declaration
try {
  console.log('[Mutation A] Testing rejection of component-only declaration without real action...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseConsole',
    targetSelector: 'EnterpriseConsole',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: 'const fake = renderComponentOnly();',
    assertion: 'expect(fake).toBeDefined();'
  });
  assert.equal(res.valid, false, 'Component-only declaration must be rejected');
  console.log('✔ PASS [Mutation A]: Component-only declaration rejected from receiving PASS.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation A]:', err.message);
}

// Mutation B: Label-only declaration
try {
  console.log('[Mutation B] Testing rejection of label-only declaration...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'NonExistentLabel',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: 'await page.click("button:has-text(\\"NonExistentLabel\\")");',
    assertion: 'check("non-existent", true);'
  });
  assert.equal(res.valid, false, 'Label-only declaration without exact action must be rejected');
  console.log('✔ PASS [Mutation B]: Label-only declaration rejected from receiving PASS.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation B]:', err.message);
}

// Mutation C: Generic input declaration (Real Engine Pipeline Invocation)
try {
  console.log('[Mutation C] Testing engine rejection of generic input selector...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'input: input',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: "await page.fill('#ws-name', 'APAC Operations');",
    assertion: "await page.waitForSelector('text=APAC Operations', { timeout: 10_000 });"
  });
  assert.equal(res.valid, false, 'Generic input selector must be rejected by the engine');
  assert.equal(res.reason.includes('Generic'), true, 'Rejection reason must explicitly state generic selector');
  console.log('✔ PASS [Mutation C]: Generic input declaration rejected by evidence engine pipeline.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation C]:', err.message);
}

// Mutation D: Generic dropdown declaration (Real Engine Pipeline Invocation)
try {
  console.log('[Mutation D] Testing engine rejection of generic dropdown selector...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'select: dropdown',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: "await page.selectOption('select[aria-label=\"Select tenant member to add\"]', 'browser-member');",
    assertion: "check('workspace member add is reflected in the drawer', (await page.locator('.enterprise-modal >> text=browser-member').count()) > 0);"
  });
  assert.equal(res.valid, false, 'Generic dropdown selector must be rejected by the engine');
  assert.equal(res.reason.includes('Generic'), true, 'Rejection reason must explicitly state generic selector');
  console.log('✔ PASS [Mutation D]: Generic dropdown declaration rejected by evidence engine pipeline.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation D]:', err.message);
}

// Mutation E: Generator self-reference
try {
  console.log('[Mutation E] Testing rejection of generator self-reference as testFile...');
  let caughtException = false;
  try {
    validateAndDeriveEvidence({
      targetComponent: 'EnterpriseWorkspacesTab',
      targetSelector: 'New Workspace',
      testFile: 'scripts/build-honest-evidence-ledger.mjs',
      testAction: 'await page.click("New Workspace")',
      assertion: 'check(true)'
    });
  } catch (e) {
    caughtException = e.message.includes('CRITICAL INTEGRITY VIOLATION');
  }
  assert.equal(caughtException, true, 'Generator script must throw a hard critical integrity violation');
  console.log('✔ PASS [Mutation E]: Generator self-reference threw critical integrity violation.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation E]:', err.message);
}

// Mutation F: Nonexistent action
try {
  console.log('[Mutation F] Testing rejection of nonexistent action in valid test file...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'New Workspace',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: 'await page.click("#totally-fabricated-action-button-id");',
    assertion: 'check("workspace creation lands in the workspace list", count > 0);'
  });
  assert.equal(res.valid, false, 'Nonexistent action must be rejected');
  console.log('✔ PASS [Mutation F]: Nonexistent action rejected from receiving PASS.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation F]:', err.message);
}

// Mutation G: Action not present in test file
try {
  console.log('[Mutation G] Testing rejection when testAction string has whitespace/content mismatch...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'New Workspace',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: 'page.click("wrong selector");',
    assertion: 'check("workspace creation lands in the workspace list", count > 0);'
  });
  assert.equal(res.valid, false, 'Action mismatch must be rejected');
  console.log('✔ PASS [Mutation G]: Action mismatch rejected from receiving PASS.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation G]:', err.message);
}

// Mutation H: Assertion not present in test file
try {
  console.log('[Mutation H] Testing rejection when assertion is fabricated...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'New Workspace',
    testFile: 'tests/test-enterprise-browser.mjs',
    testAction: "await page.click('button:has-text(\"New Workspace\")');",
    assertion: 'assert.equal(fabricatedAssertionState, "100% SUCCESS");'
  });
  assert.equal(res.valid, false, 'Fabricated assertion must be rejected');
  console.log('✔ PASS [Mutation H]: Fabricated assertion rejected from receiving PASS.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation H]:', err.message);
}

// Mutation I: False persistence declaration
try {
  console.log('[Mutation I] Testing that dimensions are derived, not accepted blindly (persistence)...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'AiSettings',
    targetSelector: 'testAdminAiProvider',
    testFile: 'tests/admin-ai-settings.test.mjs',
    testCase: 'AI provider test endpoint error propagation',
    testAction: "await assert.rejects(() => testAdminAiProvider({ provider: 'gemini', model: 'gemini-2.0-flash' }), error => error.code === 'AI_PROVIDER_TIMEOUT');",
    assertion: "assert.equal(calls[2].url, '/api/admin/ai/test-provider');"
  });
  assert.equal(res.valid, true);
  assert.equal(res.dimensions.reload, 'NOT_TESTED');
  assert.equal(res.dimensions.viewport, 'NOT_TESTED');
  console.log('✔ PASS [Mutation I]: Execution-derived dimensions correctly left unexercised dimensions as NOT_TESTED.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation I]:', err.message);
}

// Mutation J: False viewport/reload declaration
try {
  console.log('[Mutation J] Testing that reload is NOT_TESTED when reload is not called in test file...');
  const res = validateAndDeriveEvidence({
    targetComponent: 'EnterpriseWorkspacesTab',
    targetSelector: 'New Workspace',
    testFile: 'tests/test-enterprise-browser.mjs',
    testCase: 'Workspaces module: create a workspace (real fixture state change)',
    testAction: "await page.click('button:has-text(\"New Workspace\")');",
    assertion: "check('workspace creation lands in the workspace list', (await page.locator('text=APAC Operations').count()) > 0);"
  });
  assert.equal(res.valid, true);
  assert.equal(res.dimensions.reload, 'NOT_TESTED', 'Reload must remain NOT_TESTED when page.reload() is not called');
  console.log('✔ PASS [Mutation J]: False reload dimension correctly derived as NOT_TESTED.\n');
  passed++;
} catch (err) {
  console.error('✘ FAIL [Mutation J]:', err.message);
}

console.log('================================================================');
console.log(`REAL ENGINE MUTATION AUDIT: ${passed}/${total} PROVEN NON-VACUOUS`);
console.log('================================================================\n');

assert.equal(passed, total, 'All 10 Negative Invariants must pass 100%');
