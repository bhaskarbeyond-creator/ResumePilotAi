/**
 * EVIDENCE ENGINE ANTI-FRAUD & INTEGRITY MUTATION TEST SUITE
 * 
 * Executes >= 10 negative adversarial mutation probes against RealBrowserEvidenceEngine
 * to prove it rejects fake clicks, synthetic objects, missing locators, fabricated assertions,
 * stale timestamps, and source-only entries.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RealBrowserEvidenceEngine } from './helpers/real-evidence-engine.mjs';

test.describe('Evidence Engine Anti-Fraud & Integrity Invariants', () => {
  const engine = new RealBrowserEvidenceEngine({ gitSha: '464436b18a786d3a0f5d14b8f545db5154a5cca0' });

  test('Probe 1: Rejects fake clicks ({ clicked: true })', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-01',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'state updated',
      actualResult: 'button clicked',
      clicked: true, // FRAUD: Mock object property
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Synthetic mock execution object/
    );
  });

  test('Probe 2: Rejects fake state changes ({ updated: true, submitted: true })', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-02',
      route: '/test',
      role: 'USER',
      locator: 'input',
      physicalAction: 'fill',
      expectedResult: 'input updated',
      actualResult: 'text changed',
      updated: true, // FRAUD
      submitted: true, // FRAUD
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Synthetic mock execution object/
    );
  });

  test('Probe 3: Rejects missing or empty controlId', () => {
    const fakeEvidence = {
      controlId: '', // FRAUD: empty ID
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'ok',
      actualResult: 'ok',
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Missing or empty controlId/
    );
  });

  test('Probe 4: Rejects missing or empty locator', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-04',
      route: '/test',
      role: 'USER',
      locator: '   ', // FRAUD: whitespace locator
      physicalAction: 'click',
      expectedResult: 'ok',
      actualResult: 'ok',
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Missing or empty Playwright locator/
    );
  });

  test('Probe 5: Rejects source-only AST findings without DOM verification', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-05',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'render',
      expectedResult: 'ok',
      actualResult: 'ok',
      sourceOnly: true, // FRAUD: AST regex finding only
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Source-only AST finding rejected/
    );
  });

  test('Probe 6: Rejects fabricated assertions referencing mock objects', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-06',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'ok',
      actualResult: 'assert.equal(mock.clicked, true)', // FRAUD: fabricated mock assertion
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Fabricated assertion referencing mock object/
    );
  });

  test('Probe 7: Rejects invalid or missing physicalAction', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-07',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'magicThoughtExperiment', // FRAUD: not a browser action
      expectedResult: 'ok',
      actualResult: 'ok',
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*does not represent a valid browser interaction/
    );
  });

  test('Probe 8: Rejects missing actualResult from DOM observation', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-08',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'button pressed',
      actualResult: '', // FRAUD: missing actual DOM verification
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Missing actualResult/
    );
  });

  test('Probe 9: Rejects stale timestamps (> 7 days old)', () => {
    const staleDate = new Date(Date.now() - 30 * 86400000).toISOString();
    const fakeEvidence = {
      controlId: 'TEST-CTRL-09',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'ok',
      actualResult: 'dom mutated',
      testFile: 'tests/test.mjs',
      timestamp: staleDate // FRAUD: Stale timestamp
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Stale evidence timestamp/
    );
  });

  test('Probe 10: Rejects missing testFile traceability', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-10',
      route: '/test',
      role: 'USER',
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'ok',
      actualResult: 'dom mutated',
      testFile: '', // FRAUD: missing test provenance
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Missing testFile provenance/
    );
  });

  test('Probe 11: Rejects missing route or role context', () => {
    const fakeEvidence = {
      controlId: 'TEST-CTRL-11',
      route: '', // FRAUD
      role: '',  // FRAUD
      locator: 'button',
      physicalAction: 'click',
      expectedResult: 'ok',
      actualResult: 'dom mutated',
      testFile: 'tests/test.mjs',
      timestamp: new Date().toISOString()
    };
    assert.throws(
      () => engine.recordExecution(fakeEvidence),
      /EVIDENCE_ENGINE_FRAUD_REJECTION.*Missing route or role context/
    );
  });

  test('Probe 12: Accepts authentic genuine browser execution and computes cryptographic hashes', () => {
    const validEvidence = {
      controlId: 'CTRL_DOM_VALID_01',
      stableKey: 'HOME_BUTTON_GET_STARTED',
      route: '/',
      role: 'ANONYMOUS',
      tagName: 'BUTTON',
      ariaRole: 'button',
      accessibleName: 'Create My Resume Now',
      label: 'Create My Resume Now',
      locator: 'role=button[name="Create My Resume Now"]',
      physicalAction: 'click -> navigate to /build-resume',
      expectedResult: 'URL transitions to /build-resume and heading renders',
      actualResult: 'Browser URL updated to /build-resume and resume step 1 mounted in DOM',
      result: 'PASS',
      viewport: '1440x900',
      timestamp: new Date().toISOString(),
      testFile: 'tests/real-control-execution.test.mjs',
      testName: 'Homepage Primary CTA Interaction',
      testFileSHA256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      executionDurationMs: 45
    };

    const record = engine.recordExecution(validEvidence);
    assert.equal(record.controlId, 'CTRL_DOM_VALID_01');
    assert.equal(record.result, 'PASS');
    assert.ok(record.actionSourceHash, 'actionSourceHash must be generated');
    assert.ok(record.assertionSourceHash, 'assertionSourceHash must be generated');
    assert.equal(record.actionSourceHash.length, 64, 'Must be valid SHA-256');
  });
});
