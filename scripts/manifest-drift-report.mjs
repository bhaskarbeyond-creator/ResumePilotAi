/**
 * DIR-096 — Manifest Drift Report (root-cause-analysis, read-only).
 *
 * WHY THIS SCRIPT EXISTS.
 * The master manifest (.bridge/project.json, schema 4.2.0) is declared the single
 * source of truth for counts, routes, routers, tables, tests and contracts, and
 * manifestGovernance.countValidation declares a CI gate
 * (`npm run test:manifest-consistency`) that must keep those counts honest.
 *
 * That gate did not exist, so the manifest had silently drifted away from the
 * physical codebase. This script measures the drift WITHOUT mutating anything and
 * emits a machine-readable RCA bundle to .bridge/evidence/dir096-manifest-drift.json.
 * It is a diagnostic: the enforcing assertions live in tests/manifest-consistency.test.mjs.
 *
 * Usage: node scripts/manifest-drift-report.mjs [--out <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, '.bridge', 'project.json');

const outFlag = process.argv.indexOf('--out');
const OUT_PATH = outFlag !== -1 && process.argv[outFlag + 1]
    ? path.resolve(ROOT, process.argv[outFlag + 1])
    : path.join(ROOT, '.bridge', 'evidence', 'dir096-manifest-drift.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const count = (dir, filter) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return null;
    return fs.readdirSync(abs).filter(filter).length;
};

const manifest = readJson(MANIFEST_PATH);

// ---- Discovered (physical) values -----------------------------------------
const discovered = {};

// Routes: literal <Route ... path=... in the master router.
const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.jsx'), 'utf8');
discovered.routesInMainJsx = (mainSrc.match(/<Route\s+[^>]*path=/g) || []).length;
discovered.routeInventoryTotal = manifest.routeInventory?.total ?? null;
discovered.routeInventoryPartsSum = manifest.routeInventory
    ? ['publicMarketing', 'candidatePortal', 'employerPortal', 'enterpriseConsole', 'adminConsole', 'systemUtility']
        .reduce((sum, k) => sum + (manifest.routeInventory[k] || 0), 0)
    : null;

// Routers: declared vs physical files.
const declaredRouters = manifest.backendApiTopology?.routers || [];
discovered.routersDeclared = manifest.backendApiTopology?.totalRouters ?? null;
discovered.routersArrayLength = declaredRouters.length;
discovered.routersPhysicalFiles = count('backend/routes', (f) => f.endsWith('.js'));
discovered.routersMissingFiles = declaredRouters
    .map((r) => r.file)
    .filter((f) => f && !exists(f));

// Tables: declared total vs canonical inline DDL definitions.
discovered.tablesDeclared = manifest.databaseSchema?.totalTables ?? null;
discovered.ddlInlineDefined = manifest.ddlInline ? Object.keys(manifest.ddlInline).length : null;
discovered.functionalDomains = manifest.databaseSchema?.functionalDomains
    ? Object.values(manifest.databaseSchema.functionalDomains).reduce((s, arr) => s + arr.length, 0)
    : null;

// Templates: frozen 51-template studio.
discovered.templatesDeclared = manifest.resumeStudioAndTemplates?.totalCount ?? null;
discovered.templatesCatalogLength = manifest.resumeStudioAndTemplates?.templatesCatalog?.length ?? null;
discovered.templatesPhysicalDirs = count('src/cv-templates', (f) => /^cv\d+$/.test(f));
discovered.coversPhysicalDirs = count('src/cv-templates', (f) => /^cover\d+$/.test(f));

// Tests: declared pyramid size vs discovered suites.
discovered.testSuitesDeclared = manifest.qualityAssuranceAndTesting?.totalTestSuites ?? null;
const frontTests = count('tests', (f) => f.endsWith('.test.mjs'));
const backendTests = count('backend/test', (f) => f.endsWith('.test.js'));
const e2eSpecs = count('tests/e2e', (f) => f.endsWith('.spec.js'));
discovered.testSuitesDiscovered = (frontTests || 0) + (backendTests || 0) + (e2eSpecs || 0);
discovered.testBreakdown = { frontTests, backendTests, e2eSpecs };

// UI components: manifest declares src/components/ui/*.jsx, physical dir is src/components/cuba.
const declaredUiDir = 'src/components/ui';
discovered.componentInventoryLength = manifest.uiuxSystem?.componentInventory?.length ?? null;
discovered.componentUiDirExists = exists(declaredUiDir);
discovered.componentCubaDirCount = count('src/components/cuba', (f) => f.endsWith('.jsx'));

// Build task graph artifacts.
discovered.taskGraphDeclared = manifest.buildSpecification?.totalTasks ?? null;
discovered.tasksJsonExists = exists('docs/build/tasks.json');
discovered.contractsManifestExists = exists('docs/contracts/manifest.json');
discovered.contractsOpenapiExists = exists('docs/contracts/openapi.yaml');
discovered.contractsSchemaSqlExists = exists('docs/contracts/schema.sql');

// ---- Rule evaluation -------------------------------------------------------
const rule = (id, declared, actual, note) => ({
    id,
    declared,
    discovered: actual,
    status: declared === undefined || declared === null
        ? 'UNDEFINED_FIELD'
        : declared === actual
            ? 'PASS'
            : 'DRIFT',
    note,
});

const rules = [
    rule('routeInventory.parts === routeInventory.total',
        discovered.routeInventoryPartsSum, discovered.routeInventoryTotal,
        'manifest is internally consistent for the route inventory'),
    rule('backendApiTopology.totalRouters === routers.length',
        discovered.routersDeclared, discovered.routersArrayLength,
        'manifest is internally consistent for the router topology'),
    rule('resumeStudioAndTemplates.totalCount === templatesCatalog.length',
        discovered.templatesDeclared, discovered.templatesCatalogLength,
        'manifest is internally consistent for the template catalog'),
    rule('databaseSchema.totalTables === ddlInline count',
        discovered.tablesDeclared, discovered.ddlInlineDefined,
        'governance rule compares total tables against the 26 canonical inline DDL definitions; the rule is mis-specified'),
    rule('qualityAssuranceAndTesting.totalTestSuites === discovered test files',
        discovered.testSuitesDeclared, discovered.testSuitesDiscovered,
        'declared vs discovered (tests/*.test.mjs + backend/test/*.test.js + tests/e2e/*.spec.js)'),
    rule('uiuxSystem.componentInventory length === src/components/ui/*.jsx count',
        discovered.componentInventoryLength, discovered.componentCubaDirCount,
        'manifest references src/components/ui/*.jsx which does not exist; physical components live in src/components/cuba/*.jsx'),
    rule('buildSpecification.taskGraph.length === docs/build/tasks.json length',
        discovered.taskGraphDeclared, discovered.tasksJsonExists ? 'present' : null,
        'docs/build/tasks.json is absent; the task graph is declared but not materialised'),
];

const drifts = rules.filter((r) => r.status !== 'PASS');
const report = {
    generatedAt: new Date().toISOString(),
    directive: 'DIR-096',
    manifestPath: '.bridge/project.json',
    manifestSchemaVersion: manifest.manifestGovernance?.schemaVersion ?? null,
    summary: {
        rulesEvaluated: rules.length,
        pass: rules.filter((r) => r.status === 'PASS').length,
        drift: rules.filter((r) => r.status === 'DRIFT').length,
        undefinedField: rules.filter((r) => r.status === 'UNDEFINED_FIELD').length,
    },
    discovered,
    rules,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

// Human-readable summary to stdout.
console.log(`DIR-096 manifest drift report -> ${path.relative(ROOT, OUT_PATH)}`);
console.log(`  rules: ${report.summary.rulesEvaluated} | pass: ${report.summary.pass} | drift: ${report.summary.drift} | undefined: ${report.summary.undefinedField}`);
for (const r of drifts) {
    console.log(`  [${r.status}] ${r.id} :: declared=${JSON.stringify(r.declared)} discovered=${JSON.stringify(r.discovered)}`);
}
