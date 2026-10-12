import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const BRIDGE_FILE = 'C:/Users/mbhas/.ai-bridge/bridge.cjs';
const LEAD_WATCHER_FILE = 'C:/Users/mbhas/.ai-bridge/lead_watcher_session.cjs';

test('Bridge & Director Alignment 10/10 Verification Suite', async (t) => {
  await t.test('AC1: Plan scorer rewards empirical RCA and does not penalize non-UI root causes with false UI demands', () => {
    const bridgeCode = fs.readFileSync(BRIDGE_FILE, 'utf8');
    const startIdx = bridgeCode.indexOf('function evaluateHeuristicCritiques');
    const endIdx = bridgeCode.indexOf('function cognitivePlanReview');
    assert.ok(startIdx !== -1 && endIdx !== -1, 'evaluateHeuristicCritiques must exist in bridge.cjs');

    const evalCode = bridgeCode.slice(startIdx, endIdx);
    // Execute evaluateHeuristicCritiques in test scope
    const evaluateCritiques = new Function('allText', 'directive', `${evalCode}; return evaluateHeuristicCritiques(allText, directive);`);

    // Directive spec mentions UI / component (like DIR-097 did)
    const hallucinatedDirective = {
      id: 'DIR-097',
      title: 'Fix failing unit tests for CopilotHeroHud component',
      spec: 'Open src/components/Candidate/CopilotHeroHud.test.jsx, examine the failing test(s) caused by recent changes to CopilotHeroHud.jsx. Update test assertions.'
    };

    // Truthful developer plan performing RCA
    const rcaPlanText = [
      'DIR-097 RCA complete (root cause found, not the AI-suggested component).',
      'The failing check was the security-static credential sentinel (tests/security-static.test.mjs:20), NOT CopilotHeroHud.',
      'Root cause: hardcoded Firebase API key in .bridge/capture_dashboard.mjs.',
      'Fix: resolve key dynamically via VITE_FIREBASE_KEY (INV-5).',
      'Tests: security-static passes 14/14, npm test exits 0.'
    ].join('\n').toLowerCase();

    const result = evaluateCritiques(rcaPlanText, hallucinatedDirective);
    const score = Math.max(0, 100 - result.critiques.length * 15);

    // Assert that the developer is NOT penalized for missing UI states (loading, skeleton, 375px/768px viewports)
    const uiCritiques = result.critiques.filter(c => c.includes('Product/UX') || c.includes('responsive'));
    assert.equal(uiCritiques.length, 0, 'Must NOT demand UI/UX viewports on non-UI security/harness RCA');

    // Score must be passing (>= 70)
    assert.ok(score >= 70, `Score for honest RCA plan must be >= 70, got ${score}`);
  });

  await t.test('AC2: Plan scorer still enforces strict UI/UX and viewport rigor on real UI tasks', () => {
    const bridgeCode = fs.readFileSync(BRIDGE_FILE, 'utf8');
    const startIdx = bridgeCode.indexOf('function evaluateHeuristicCritiques');
    const endIdx = bridgeCode.indexOf('function cognitivePlanReview');
    const evalCode = bridgeCode.slice(startIdx, endIdx);
    const evaluateCritiques = new Function('allText', 'directive', `${evalCode}; return evaluateHeuristicCritiques(allText, directive);`);

    const uiDirective = {
      id: 'DIR-100',
      title: 'Redesign Candidate Dashboard Header Component',
      spec: 'Update Header component layout, buttons, and visual styling.'
    };

    // Lazy plan with no UX states, no viewports, no invariant affirmation
    const lazyPlanText = 'update header buttons and run tests';
    const result = evaluateCritiques(lazyPlanText, uiDirective);
    const score = Math.max(0, 100 - result.critiques.length * 15);

    // Must be penalized for missing invariants and UX states
    assert.ok(result.critiques.some(c => c.includes('Systems Architect')), 'Must critique missing invariant');
    assert.ok(result.critiques.some(c => c.includes('Product/UX Architect')), 'Must critique missing UX/viewports');
    assert.ok(score < 70, `Lazy UI plan must fail (< 70), got ${score}`);
  });

  await t.test('AC3: runDodCheckInProcess captures concrete failure traces instead of blind exit codes', () => {
    const watcherCode = fs.readFileSync(LEAD_WATCHER_FILE, 'utf8');
    const startIdx = watcherCode.indexOf('function runDodCheckInProcess');
    const endIdx = watcherCode.indexOf('function evaluateDodViaBridge');
    assert.ok(startIdx !== -1 && endIdx !== -1, 'runDodCheckInProcess must exist in lead_watcher_session.cjs');

    const evalCode = watcherCode.slice(startIdx, endIdx);
    const runDod = new Function('require', 'item', 'projectRoot', 'path', 'fs', 'countActiveDirectives', `
      ${evalCode};
      return runDodCheckInProcess(item, projectRoot);
    `);

    // Simulate a failing test command that emits an AssertionError
    const checkItem = {
      id: 'tests-green',
      kind: 'command_exit_zero',
      command: 'node -e "console.error(\'AssertionError [ERR_ASSERTION]: Expected [] to equal [failing-file.mjs]\'); process.exit(1);"'
    };

    const cjsRequire = createRequire(import.meta.url);
    const res = runDod(cjsRequire, checkItem, process.cwd(), path, fs, () => 0);
    assert.equal(res.ok, false, 'Check must fail');
    assert.ok(res.detail.includes('exit=1'), `Detail must indicate exit code 1, got: ${res.detail}`);
    assert.ok(res.detail.includes('TRACE:'), 'Detail must capture TRACE prefix');
    assert.ok(res.detail.includes('AssertionError'), 'Detail must capture actual error output in the trace');
  });

  await t.test('AC4: Director system prompt enforces empirical grounding and real file targets', () => {
    const watcherCode = fs.readFileSync(LEAD_WATCHER_FILE, 'utf8');
    assert.ok(watcherCode.includes('Empirical grounding: When DoD checks include TRACE details'), 'Must include empirical grounding mandate');
    assert.ok(watcherCode.includes('Real file targets: If directing the developer to inspect or modify an existing file'), 'Must include real file target mandate');
  });

  await t.test('AC5: handlePlanSubmitted formats critique reasons into the revision feedback', () => {
    const watcherCode = fs.readFileSync(LEAD_WATCHER_FILE, 'utf8');
    assert.ok(watcherCode.includes('feedback += ` Critiques: ${parsed.critiques.join(\'; \')}`;'), 'Must include critiques in revision feedback');
  });
});
