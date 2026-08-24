import fs from 'fs';
import path from 'crypto';

console.log('--- FORENSIC LEGACY EVIDENCE QUARANTINE ---');

const quarantineRegistry = [
  {
    file: 'tests/full-control-surface-execution.test.mjs',
    reason: 'Synthetically generated test file creating mock objects { clicked: true, updated: true, submitted: true } and asserting mock properties in memory. No real browser or DOM execution occurred.',
    classification: 'LEGACY_INVALID / SYNTHETIC',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'test-results/REAL_BROWSER_CONTROL_EXECUTION.json (Playwright Chromium Real-DOM Suite)'
  },
  {
    file: 'scripts/generate-full-surface-tests.mjs',
    reason: 'Generator script that constructed synthetic assert.equal(mock.clicked, true) test blocks from AST/regex findings.',
    classification: 'LEGACY_INVALID / SYNTHETIC_GENERATOR',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Real DOM crawler & Playwright browser test harness'
  },
  {
    file: 'scripts/full-control-audit-engine.mjs',
    reason: 'Source-level regex scraper matching <button>, <input>, etc. in JSX source code (yielding 2,052 findings), conflating dead code, unmounted components, and source fragments with rendered interactive UI controls.',
    classification: 'LEGACY_INVALID / SOURCE_AST_FINDING_SCRAPER',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Real DOM crawler in Chromium runtime'
  },
  {
    file: 'scripts/reconcile-all-evidence.mjs',
    reason: 'Fabricated 2,052 PASS certification by equating AST regex counts to executed controls.',
    classification: 'LEGACY_INVALID / SYNTHETIC_RECONCILER',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Deterministic Real-DOM Census Reconciler (FINAL_EXECUTION_RECONCILIATION.json)'
  },
  {
    file: 'scripts/build-honest-evidence-ledger.mjs',
    reason: 'Indexed synthetic test file full-control-surface-execution.test.mjs and hashed mock objects to create a false impression of 2,052 unit test proofs.',
    classification: 'LEGACY_INVALID / SYNTHETIC_EVIDENCE_INDEXER',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Authoritative Real Browser Evidence Engine (EVIDENCE_ENGINE_INTEGRITY.json)'
  },
  {
    file: 'test-results/FINAL_CONTROL_EXECUTION_LEDGER.json',
    reason: 'Contained 2,052 records with synthetic execution proofs (e.g. CTRL-0001 from unrendered src/App.jsx).',
    classification: 'LEGACY_INVALID / SYNTHETIC_LEDGER',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'test-results/REAL_BROWSER_CONTROL_EXECUTION.json'
  },
  {
    file: 'test-results/FINAL_ROLE_CONTROL_MATRIX.json',
    reason: 'Synthetic role mappings based on 2,052 source AST findings rather than actual role-authenticated browser sessions.',
    classification: 'LEGACY_INVALID / SYNTHETIC_ROLE_MATRIX',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Real-DOM multi-role browser audit across 8 roles'
  },
  {
    file: 'test-results/FINAL_USER_JOURNEY_MATRIX.json',
    reason: 'Synthetic mapping of 2,052 AST findings into theoretical user journeys.',
    classification: 'LEGACY_INVALID / SYNTHETIC_JOURNEY_MATRIX',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Real Playwright journey execution flows'
  },
  {
    file: 'test-results/FINAL_LIFECYCLE_MATRIX.json',
    reason: 'Synthetic lifecycle matrix mapping 2,052 AST controls.',
    classification: 'LEGACY_INVALID / SYNTHETIC_LIFECYCLE_MATRIX',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Real DOM state verification matrix (fill -> save -> reload -> verify)'
  },
  {
    file: 'test-results/ROLE_CONTROL_EXECUTION.json',
    reason: 'Legacy role control execution claiming 2,052 controls.',
    classification: 'LEGACY_INVALID / SYNTHETIC_ROLE_MATRIX',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'Role-authenticated browser execution logs'
  },
  {
    file: 'test-results/system-capability-census.json',
    reason: 'Regex-based source census claiming 2,052 controls without DOM verification.',
    classification: 'LEGACY_INVALID / SOURCE_AST_CENSUS',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'test-results/REAL_DOM_CONTROL_CENSUS.json'
  },
  {
    file: 'test-results/inventory-census.json',
    reason: 'AST regex inventory claiming 2,052 controls.',
    classification: 'LEGACY_INVALID / SOURCE_AST_CENSUS',
    whetherUsableForCertification: false,
    replacementEvidenceSource: 'test-results/REAL_DOM_CONTROL_CENSUS.json'
  }
];

if (!fs.existsSync('test-results')) {
  fs.mkdirSync('test-results', { recursive: true });
}

fs.writeFileSync(
  'test-results/LEGACY_EVIDENCE_QUARANTINE.json',
  JSON.stringify(quarantineRegistry, null, 2),
  'utf8'
);

const forensicSyntheticAudit = {
  auditTimestamp: new Date().toISOString(),
  forensicBaselineSHA: 'f5faf02',
  quarantinedArtifactCount: quarantineRegistry.length,
  findings: {
    astRegexFindings: 2052,
    syntheticPassClaims: 2052,
    verdict: 'ALL 2,052 LEGACY PASS RECORDS STRIPPED AND QUARANTINED. ZERO CONTRIBUTION TO CERTIFICATION ALLOWED.',
    rootCauses: [
      'Source-level regex matching counted unrendered components (e.g. src/App.jsx count button)',
      'Synthetic test generator produced mock objects { clicked: true } instead of browser actions',
      'Evidence ledger treated mock object string hashing as proof of execution',
      'No state persistence or DOM mutation was checked for 2,052 controls'
    ]
  },
  quarantinedFiles: quarantineRegistry
};

fs.writeFileSync(
  'test-results/FORENSIC_SYNTHETIC_AUDIT.json',
  JSON.stringify(forensicSyntheticAudit, null, 2),
  'utf8'
);

console.log(`[Quarantine] Successfully quarantined ${quarantineRegistry.length} legacy artifacts into test-results/LEGACY_EVIDENCE_QUARANTINE.json`);
console.log(`[Quarantine] Generated test-results/FORENSIC_SYNTHETIC_AUDIT.json`);
