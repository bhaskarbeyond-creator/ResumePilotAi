/**
 * TRUTHFUL EVIDENCE RECONCILIATION (NO FABRICATION)
 *
 * This script audits the repository's "2,052 / 2,052 real browser verified"
 * claims against the files actually on disk and against real browser execution
 * in this sandbox, and writes an honest reconciliation. It deliberately does
 * NOT synthesize PASS records for controls that were not executed.
 * The anti-synthetic contract here is: never emit an evidence record that does
 * not correspond to a physical browser interaction + real state assertion that
 * actually ran.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const GIT_SHA = (() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'UNKNOWN'; } })();
const NOW = new Date().toISOString();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readJson = (p, fallback = {}) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, obj) => { fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); };

// ── 1. Static AST ledger ────────────────────────────────────────────────
const ledger = readJson('test-results/control-execution-ledger.json', []);
const syntheticMarkerCounts = {
  records: ledger.length,
  statusPASS: ledger.filter(r => r.status === 'PASS').length,
  persistencePASS: ledger.filter(r => r.persistence === 'PASS').length,
  reloadPASS: ledger.filter(r => r.reload === 'PASS').length,
  navigationAllPASS: ledger.filter(r => (r.navigation || '').includes('SPA / Direct / Back / Forward')).length,
  evidenceNpmTest: ledger.filter(r => (r.evidence || '').includes('npm test (passed)')).length,
  handlerNativeForm: ledger.filter(r => r.handler === 'native/form').length,
  noBrowserField: ledger.filter(r => !r.locator && !r.browser && !r.viewport).length,
};
// A record is "synthetic/static" when it has no locator/browser/timestamp and
// only claims success by source-reference or "npm test". All of them do.
const synthetic = ledger.filter(r => !r.locator && !r.browser && !r.physicalAction).length;

// ── 2. Synthetic unit UI suite ─────────────────────────────────────────
const ctrTest = fs.readFileSync('tests/full-control-surface-execution.test.mjs', 'utf8');
const unitSuiteSynthetic = {
  file: 'tests/full-control-surface-execution.test.mjs',
  totalAssertions: (ctrTest.match(/assert\.equal\(/g) || []).length,
  clickedTrue: (ctrTest.match(/clicked:\s*true/g) || []).length,
  updatedTrue: (ctrTest.match(/updated:\s*true/g) || []).length,
  changedTrue: (ctrTest.match(/changed:\s*true/g) || []).length,
  selectedTrue: (ctrTest.match(/selected:\s*true/g) || []).length,
  submittedTrue: (ctrTest.match(/submitted:\s*true/g) || []).length,
  syntheticRecordsConclusion: 'Every test constructs a literal { clicked: true, updated: true, ... } and asserts the literal itself. No DOM, no browser, no locator, no state.',
};

// ── 3. Browser execution runs observed in this sandbox ─────────────────
const master = readJson('test-results/MASTER_REAL_BROWSER_EVIDENCE.json', null);
const masterMetrics = master?.metrics || {};
const masterAssertions = master?.evidence || [];
const masterWeak = masterAssertions.filter(e => ['clicked', 'filled', 'toggled', 'selected', 'submitted'].includes(String(e.assertion).trim().toLowerCase())).length;
const masterByRoute = {};
for (const e of masterAssertions) { const k = String(e.controlId).split('-').slice(0, 3).join('-'); masterByRoute[k] = (masterByRoute[k] || 0) + 1; }

const enterprise = { suite: 'tests/test-enterprise-browser.mjs', outcome: '28/28 checks passed (stateful page.route fixture backend, seeded auth)' };
const exportSuite = { suite: 'tests/export-e2e-real-browser.test.mjs', outcome: '3/11 checks passed, 8/11 failed' };
const batch1 = { suite: 'tests/real-browser-batch1-homepage.mjs', outcome: '54 PASS / 10 FAIL / 64 total' };
const batch2 = { suite: 'tests/real-browser-batch2-resume-builder.mjs', outcome: '5 PASS / 21 FAIL / 26 total' };
const batch3 = { suite: 'tests/real-browser-batch3-admin.mjs', outcome: '13 PASS / 28 FAIL / 41 total' };
const interview = { suite: 'tests/test-interview-coach-browser.mjs', outcome: 'FAILED at CBT header visibility assertion (Step 4)' };

const domCensus = readJson('test-results/REAL_DOM_CONTROL_CENSUS.json', null);

// ── 4. Claimed vs actual baseline ─────────────────────────────────────
const claimedBaseline = { 'previous_audit_claim': '326 genuine real-browser controls verified, 1,726 remaining', 'evidenceFilesReferenced': ['test-results/MASTER_REAL_BROWSER_EVIDENCE.json', 'test-results/REAL_BROWSER_CONTROL_EXECUTION.json', 'test-results/FINAL_EXECUTION_RECONCILIATION.json'] };
const baselineFiles = claimedBaseline.evidenceFilesReferenced.map(p => ({ path: p, existsBeforeThisRun: false }));  // all absent at branch baseline; MASTER was created by this run
const repoCertification = {
  fileName: 'docs/FINAL_REAL_BROWSER_CONTROL_CERTIFICATION.md',
  statement: '2,052 controls discovered; 16 controls individually verified via Real Browser Interactivity and 2,036 remain explicitly unverified (Static AST Only).',
};
const repoReport = {
  fileName: 'docs/FINAL_CONTROL_EXECUTION_REPORT.md',
  statement: '2,052 / 2,052 PROVEN (100% PASS) — contradicts the certification file above and is not backed by browser evidence.',
};

// ── 5. Truthful classification ────────────────────────────────────────
const inventoryByType = {};
for (const r of ledger) inventoryByType[r.type] = (inventoryByType[r.type] || 0) + 1;

const knownSyntheticAssertionsInDocs = 0; // nobody claims synthetic in final targets; actual is non-zero

const RECONCILIATION = {
  generatedAt: NOW,
  gitSha: GIT_SHA,
  standardApplied: 'Playwright Chromium + real React DOM + real physical interaction + real state assertion + per-control evidence record',
  inventory: {
    source: 'STATIC_AST_REGEX_CENSUS (scripts/full-control-audit-engine.mjs / scripts/reconcile-all-evidence.mjs)',
    totalControls: 2052,
    types: inventoryByType,
    notes: 'Count is derived from regex matches over src/** source text, not from rendered DOM. It includes duplicated handlers, code fragments, dead code, and components never rendered on any route.',
  },
  claimedBaseline: {
    claim: claimedBaseline.previous_audit_claim,
    evidenceFilesPresent: baselineFiles,
    researchFinding: 'No file or commit in this checkout supports the 326 / 1,726 baseline. The only shipped certification file states 16 verified / 2,036 unverified; another shipped report states 2,052 / 2,052 "proven". These are mutually contradictory.',
  },
  syntheticAudit: {
    ledgerRecords: syntheticMarkerCounts,
    ledgerSyntheticCount: synthetic,
    unitSuite: unitSuiteSynthetic,
  },
  realBrowserExecutionInThisSandbox: {
    browser: 'Chromium (vendored @lidio601/chromium 127.0.2, Playwright 1.62.1)',
    viewport: '1440x900 (default)',
    authentication: 'Fixtures pre-seed a mock Firebase auth session in localStorage and intercept securetoken/identitytoolkit/firestore endpoints. API responses are served by page.route mocks.',
    suites: {
      master: { ...masterMetrics, checksTotal: masterAssertions.length, checksPassed: masterAssertions.filter(e => e.result === 'PASS').length, weakAssertions: masterWeak, assertionTerminologyNote: 'Many records assert literal "clicked"/"filled" strings rather than verifying the resulting DOM value, so they do not meet the strict REAL_BROWSER_PASS evidence standard.' },
      enterprise,
      export: exportSuite,
      batch1,
      batch2,
      batch3,
      interview,
    },
    domCensus: {
      routesCrawled: domCensus?.counts?.routesCrawled,
      controlsObservedInRealDom: domCensus?.counts?.domControlsObserved,
      distinctControlSignatures: domCensus?.counts?.distinctControlSignatures,
      note: 'This is a lower-bound real DOM inventory produced by crawling 45 routes in this sandbox; admin routes returned 0 controls because the seeded fixture did not reach the admin shell. No per-control physical interaction was performed by the census itself.',
    },
  },
  truthfulClassification: {
    total_discovered_census: 2052,
    real_browser_controls_verified_to_strict_standard: 0,
    displayed_because: 'No existing evidence file maps census control IDs (CTRL-0001..CTRL-2052) to a real DOM locator plus physical action plus state assertion. The 2,052-row ledger contains no locator/browser/physicalAction fields at all.',
    synthetic: synthetic,
    static_only_or_not_verified: 2052,
    blocked: 0,
    failed: [10, 21, 28, 8, 1].reduce((a, b) => a + b, 0),
    failedNotes: 'Failed checks observed in real browser suites in this sandbox: batch1=10, batch2=21, batch3=28, export=8, interview=1.',
  },
  equation: '2052 = 0 REAL_BROWSER_PASS + 2052 NOT_VERIFIED/STATIC_ONLY + 0 BLOCKED + 0 FAILED_IN_LEDGER (strict control-level), while 68 real-browser suite checks failed.',
  conclusion: 'The requested 2,052 / 2,052 REAL_BROWSER_PASS certification cannot be truthfully produced from this repository. Doing so would require fabricating PASS records (the anti-synthetic contract in the assignment), because (a) the 2,052 inventory is AST-derived source regex, (b) no per-control browser evidence exists, (c) the shipped browser evidence is either weak-assertion or failing, and (d) the app depends on external Firebase/backend state that is mocked in every available suite.',
};

// ── 6. Persist truthful artifacts ─────────────────────────────────────
writeJson('test-results/FINAL_EXECUTION_RECONCILIATION.json', RECONCILIATION);
writeJson('test-results/REAL_BROWSER_CONTROL_EXECUTION.json', {
  generatedAt: NOW,
  gitSha: GIT_SHA,
  standard: RECONCILIATION.standardApplied,
  notes: 'No census control ID received a strict REAL_BROWSER_PASS in this audit. This file intentionally contains zero fabricated PASS records.',
  records: [],
});
writeJson('test-results/REAL_BROWSER_PROGRESS.json', {
  totalControls: 2052,
  previouslyVerified: 0,
  newlyVerified: 0,
  verifiedTotal: 0,
  remaining: 2052,
  failed: 68,
  blocked: 0,
  synthetic: 2052,
  currentBatch: 'FORENSIC_TRUTH_AUDIT',
  timestamp: NOW,
  gitSha: GIT_SHA,
  note: 'previousVerified is 0 because the assigned 326 baseline is not backed by any evidence file in this checkout.',
});
writeJson('test-results/FINAL_ROLE_EXECUTION_MATRIX.json', {
  generatedAt: NOW, gitSha: GIT_SHA,
  roles: ['ANONYMOUS', 'USER', 'ADMIN', 'SUPER_ADMIN', 'ENTERPRISE_ADMIN', 'ENTERPRISE_MEMBER', 'EMPLOYER', 'AUDITOR'],
  executedRealBrowserRoleChecks: {
    ANONYMOUS: { checks: 'master phase 1 + batch1', passedRealDomCensusControls: 160 },
    USER: { checks: 'master phase 2 + batch2 + interview', passedRealDomCensusControls: 57 },
    ADMIN: { checks: 'master phase 3 + batch3', passedRealDomCensusControls: 0 },
    SUPER_ADMIN: { checks: 'master phase 3 (as SUPER_ADMIN) + batch3', passedRealDomCensusControls: 0 },
    ENTERPRISE_ADMIN: { checks: 'test-enterprise-browser.mjs', passedRealDomCensusControls: 0 },
    ENTERPRISE_MEMBER: { checks: 'none', passedRealDomCensusControls: 0 },
    EMPLOYER: { checks: 'none (no employer real-browser suite executed in this audit)', passedRealDomCensusControls: 0 },
    AUDITOR: { checks: 'none', passedRealDomCensusControls: 0 },
  },
  note: 'No role received per-control REAL_BROWSER_PASS records. Counts are real-DOM observations / suite-level checks, not control-level certification.',
});
writeJson('test-results/FINAL_LIFECYCLE_EXECUTION_MATRIX.json', {
  generatedAt: NOW, gitSha: GIT_SHA,
  lifecycles: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'SAVE', 'PUBLISH', 'EXPORT', 'IMPORT'],
  verifiedLifecycles: { CREATE: 0, READ: 0, UPDATE: 0, DELETE: 0, SAVE: 0, PUBLISH: 0, EXPORT: 0, IMPORT: 0 },
  note: 'No lifecycle control was certified. The enterprise/export/manner suites exercise some actions against mocked backends but do not satisfy the persistence-through-real-backend requirement.',
});
writeJson('test-results/FINAL_OPTION_EXECUTION_MATRIX.json', {
  generatedAt: NOW, gitSha: GIT_SHA,
  optionFamilies: ['templates', 'themes', 'fonts', 'colors', 'AI providers', 'payment providers', 'roles', 'permissions', 'statuses', 'filters', 'sorting', 'durations', 'difficulty', 'tabs', 'radio options', 'select options'],
  executedOptions: {},
  note: 'The AST ledger discovered a handful of <option> tags; no per-option real-browser execution evidence was recorded in this audit.',
});
writeJson('test-results/FORENSIC_SYNTHETIC_AUDIT.json', {
  generatedAt: NOW, gitSha: GIT_SHA,
  auditTitle: 'Zero-Synthetic / Non-Vacuity / Identity Forensic Audit',
  result: 'SYNTHETIC = 2052 (ledger) + 2052 (unit suite) — NOT zero.',
  syntheticPatternsRejected: ['clicked: true', 'updated: true', 'changed: true', 'selected: true', 'submitted: true', 'hardcoded assert.equal(..., true)', 'evidence: "npm test (passed)"', 'handler: "native/form"', 'persistence: "PASS"', 'reload: "PASS"', 'navigation: "PASS (SPA / Direct / Back / Forward)"'],
  counts: {
    ledgerSynthetic: synthetic,
    unitSuiteClickedTrue: unitSuiteSynthetic.clickedTrue,
    unitSuiteUpdatedTrue: unitSuiteSynthetic.updatedTrue,
    unitSuiteChangedTrue: unitSuiteSynthetic.changedTrue,
    unitSuiteSubmittedTrue: unitSuiteSynthetic.submittedTrue,
  },
  hashes: {
    controlLedgerSHA256: sha256(fs.readFileSync('test-results/control-execution-ledger.json')),
    fullControlSuiteSHA256: sha256(fs.readFileSync('tests/full-control-surface-execution.test.mjs')),
    masterEvidenceSHA256: fs.existsSync('test-results/MASTER_REAL_BROWSER_EVIDENCE.json') ? sha256(fs.readFileSync('test-results/MASTER_REAL_BROWSER_EVIDENCE.json')) : null,
  },
});

// ── 7. Docs ────────────────────────────────────────────────────────────
fs.mkdirSync('docs', { recursive: true });
const doc = (path, markdown) => fs.writeFileSync(path, markdown);

doc('docs/FINAL_REAL_BROWSER_CONTROL_CERTIFICATION.md', `# Final Real-Browser Control Certification — TRUTHFUL (No Fabrication)

**Generated:** ${NOW}
**Git SHA:** ${GIT_SHA}
**Standard:** Chromium + Playwright + real React DOM + real physical interaction + real state assertion + per-control evidence record.

## Result

**The 2,052 / 2,052 REAL_BROWSER_PASS claim cannot be truthfully certified.**

| Category | Count |
|---|---|
| Total discovered (AST source census) | 2,052 |
| REAL_BROWSER_PASS with per-control, real-state evidence | **0** |
| SYNTHETIC (hardcoded / source-reference "PASS") | **2,052** |
| STATIC_ONLY / NOT_VERIFIED | 2,052 |
| BLOCKED | 0 |
| FAILED (real browser suite checks observed) | 68 |

## Why

1. The 2,052 inventory is produced by regex scanning of \`src/**\` (see \`scripts/full-control-audit-engine.mjs\`, \`scripts/reconcile-all-evidence.mjs\`). It counts source snippets, duplicated handlers, dead code and untenderable fragments — not rendered DOM controls.
2. A real Chromium DOM crawl in this sandbox (45 routes, deterministic fixtures) observed **217 raw controls / 69 distinct signatures**. This is a lower bound, but it shows the actual rendered interactive surface is far smaller than 2,052.
3. \`test-results/control-execution-ledger.json\` (2,052 rows) has **no locator, browser, physical action, viewport or timestamp**; every row is \`status: PASS\`, \`persistence: PASS\`, \`reload: PASS\`, \`navigation: PASS (SPA / Direct / Back / Forward)\`, and \`evidence\` is either \`npm test (passed)\` or a unit-test/source-file reference.
4. \`tests/full-control-surface-execution.test.mjs\` passes 2,052 tests in ~1 second by asserting literal objects (\`{ clicked: true }\`, \`{ updated: true }\`, \`{ changed: true }\`, ...). It never opens a browser.
5. The assignment's requested baseline files did not exist at commit ${GIT_SHA}; the claim of "326 verified / 1,726 remaining" is unsupported. The shipped \`docs/FINAL_REAL_BROWSER_CONTROL_CERTIFICATION.md\` says **16 verified / 2,036 unverified**, while \`docs/FINAL_CONTROL_EXECUTION_REPORT.md\` says **2,052 / 2,052 proven** — these are mutually contradictory.

## Genuine browser evidence observed (suite-level, not control-level)

- \`tests/real-browser-master-execution.mjs\`: ${masterAssertions.length} checks, ${masterAssertions.filter(e => e.result === 'PASS').length} PASS; assertions are weak (literal \`clicked\`/\`filled\`), so they are not strict control PASS records.
- \`tests/test-enterprise-browser.mjs\`: 28/28 checks passed (real interactions, fixture-backed \`page.route\` API, seeded auth).
- \`tests/export-e2e-real-browser.test.mjs\`: 3 PASS / 8 FAIL.
- \`tests/real-browser-batch1-homepage.mjs\`: 54 PASS / 10 FAIL.
- \`tests/real-browser-batch2-resume-builder.mjs\`: 5 PASS / 21 FAIL.
- \`tests/real-browser-batch3-admin.mjs\`: 13 PASS / 28 FAIL.
- \`tests/test-interview-coach-browser.mjs\`: FAILED (CBT header assertion).

## Decision

No PASS record was fabricated in this audit. The repository cannot pass the assignment's anti-synthetic contract while also claiming 2,052/2,052.
`);
doc('docs/FINAL_CONTROL_EXECUTION_REPORT.md', `# Final Control Execution Report — Truthful

**Generated:** ${NOW} · **SHA:** ${GIT_SHA}

This report replaces the previous \`2,052 / 2,052 PROVEN\` document, which is not backed by browser evidence.

## Executed in this audit (real Chromium)

| Suite | Result | Nature |
|---|---|---|
| real-browser-master-execution.mjs | ${masterAssertions.length} checks / ${masterAssertions.filter(e => e.result === 'PASS').length} PASS | 93 clicks, 40 fills, 13 selects, 49 reloads; assertions are weak and not census-linked |
| test-enterprise-browser.mjs | 28 / 28 PASS | real interactions against stateful page.route fixture |
| export-e2e-real-browser.test.mjs | 3 / 11 PASS | 8 failures |
| real-browser-batch1-homepage.mjs | 54 / 10 | 10 failures |
| real-browser-batch2-resume-builder.mjs | 5 / 21 | 21 failures |
| real-browser-batch3-admin.mjs | 13 / 28 | 28 failures |
| test-interview-coach-browser.mjs | FAILED | CBT header visibility |

Failed checks in this sandbox (root causes not all diagnosed because the relevant product features require a live backend): feature/plan card render (mock payload shape), blog render, navbar visibility at mobile/desktop viewports, resume-builder template selector, admin controls, and PDF print-media rendering.

## Control-level accounting

- Discovered: 2,052 (AST source census)
- Real DOM controls observed during crawl: 217 (69 distinct signatures)
- Strict REAL_BROWSER_PASS records: 0
- Synthetic ledger PASS records: 2,052
- Remaining / not verified: 2,052
- Blocked: 0
- Failed suite checks observed: 68

See \`test-results/FINAL_EXECUTION_RECONCILIATION.json\` for the machine-readable record.
`);
doc('docs/FINAL_PRODUCTION_READINESS.md', `# Final Production Readiness — Honest Assessment

**Generated:** ${NOW} · **SHA:** ${GIT_SHA}

## What passes
- \`npm run build\` succeeds (Vite production build).
- A real Chromium launches and can drive the app.
- Browser suites with fixture backends pass for enterprise surface (28/28) and partial master checks.

## What is NOT certified
- **No 2,052/2,052 control certification.** The control ledger is synthetic (AST source references), not browser evidence.
- **No production identity verification** was performed against \`https://airesume.projectdemo.guru\`; no live deployment credentials are available in this sandbox, and the live-backend/POST/security suites that would authenticate to production were not executed here.
- **PDF export suite fails 8/11** in this sandbox.
- **Auth/role boundaries are not verified against a real backend**; all available suites seed a mock Firebase session and mock \`/api/**\`.
- **Persistence through real Firestore/backend** is not demonstrated in these browser suites.

**Conclusion:** This checkout is not in a state that supports a truthful "production ready / fully verified" certification.
`);
console.log('Wrote truthful reconciliation artifacts to test-results/ and docs/.');
console.log(JSON.stringify(RECONCILIATION.truthfulClassification, null, 2));
