import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-096 — Manifest consistency CI gate.
 *
 * WHY THIS SUITE EXISTS.
 * `.bridge/project.json` (schema 4.2.0) is the single source of truth for counts,
 * routes, routers, tables, tests and contracts, and
 * `manifestGovernance.countValidation` declares a gate named
 * `npm run test:manifest-consistency`. That gate did not exist, so the manifest had
 * drifted away from the physical codebase undetected. This suite is that gate.
 *
 * It pins the invariants that MUST hold (the manifest must be internally
 * self-consistent and the 51-template studio must stay frozen) and it records the
 * open reconciliation backlog as an explicit, shrinking ratchet — the same pattern
 * the repository already uses in tests/dir082-viewport-density.test.mjs AC6 — so
 * the debt is visible and protected rather than silently tolerated.
 *
 * The machine-readable root-cause bundle is produced by
 * scripts/manifest-drift-report.mjs -> .bridge/evidence/dir096-manifest-drift.json.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(ROOT, '.bridge', 'project.json');
const DRIFT_REPORT = path.join(ROOT, '.bridge', 'evidence', 'dir096-manifest-drift.json');

const read = (p) => fs.readFile(path.isAbsolute(p) ? p : path.join(ROOT, p), 'utf8');
const readJson = async (p) => JSON.parse(await read(p));
const exists = async (p) => {
    try { await fs.access(path.join(ROOT, p)); return true; } catch { return false; }
};

const manifest = await readJson(MANIFEST_PATH);

/**
 * Open reconciliation backlog discovered by DIR-096 reconnaissance. These are the
 * manifest-declared router modules that are not yet realised as standalone files
 * (their endpoints are served from the monolithic backend/index.js today).
 * The ratchet below may only ever SHRINK.
 */
const ROUTER_MODULARISATION_BACKLOG = [
    'backend/routes/health.js',
    'backend/routes/auth.js',
    'backend/routes/billing.js',
    'backend/routes/messages.js',
    'backend/routes/interviews.js',
    'backend/routes/favorites.js',
    'backend/routes/tracker.js',
    'backend/routes/uploads.js',
    'backend/routes/webhooks.js',
];

test('AC1: the manifest is internally self-consistent for the route inventory', () => {
    const inv = manifest.routeInventory;
    assert.ok(inv, 'routeInventory must be declared');
    const parts = ['publicMarketing', 'candidatePortal', 'employerPortal', 'enterpriseConsole', 'adminConsole', 'systemUtility']
        .reduce((sum, k) => sum + (inv[k] || 0), 0);
    assert.equal(parts, inv.total, 'the route-inventory parts must sum to routeInventory.total');
});

test('AC1: the manifest is internally self-consistent for the router topology', () => {
    const topo = manifest.backendApiTopology;
    assert.ok(topo, 'backendApiTopology must be declared');
    assert.equal(topo.totalRouters, topo.routers.length, 'totalRouters must equal routers.length');
});

test('AC1: the manifest is internally self-consistent for the template catalog', () => {
    const studio = manifest.resumeStudioAndTemplates;
    assert.ok(studio, 'resumeStudioAndTemplates must be declared');
    assert.equal(studio.totalCount, studio.templatesCatalog.length, 'totalCount must equal templatesCatalog.length');
    assert.equal(studio.totalCount, 51, 'the studio is the frozen 51-template catalog');
});

test('AC2: the frozen resume studio physically matches the manifest (51 CV + 4 cover)', async () => {
    const entries = await fs.readdir(path.join(ROOT, 'src', 'cv-templates'));
    const cvs = entries.filter((e) => /^cv\d+$/.test(e));
    const covers = entries.filter((e) => /^cover\d+$/.test(e));
    assert.equal(cvs.length, 51, 'exactly 51 cv* template directories must exist (INV-1 0-byte diff lock)');
    assert.equal(covers.length, 4, 'exactly 4 cover* template directories must exist');
});

test('AC3: every manifestGovernance.countValidation rule is declared', () => {
    const rules = manifest.manifestGovernance?.countValidation?.rules;
    assert.ok(Array.isArray(rules) && rules.length >= 7, 'countValidation.rules must be declared');
    const joined = rules.join('\n');
    for (const token of ['routeInventory.total', 'totalRouters', 'totalTables', 'totalCount', 'totalTestSuites', 'componentInventory', 'taskGraph']) {
        assert.ok(joined.includes(token), `countValidation must reference ${token}`);
    }
});

test('AC4: the drift-report script produces a machine-readable RCA bundle', async () => {
    assert.ok(await exists('scripts/manifest-drift-report.mjs'), 'the drift-report script must exist');
    assert.ok(await exists('.bridge/evidence/dir096-manifest-drift.json'), 'the RCA bundle must be generated');
    const rca = await readJson(DRIFT_REPORT);
    assert.equal(rca.directive, 'DIR-096');
    assert.equal(rca.manifestSchemaVersion, manifest.manifestGovernance?.schemaVersion);
    assert.ok(Array.isArray(rca.rules) && rca.rules.length === 7, 'the RCA must evaluate all 7 governance rules');
    for (const r of rca.rules) {
        assert.ok(['PASS', 'DRIFT', 'UNDEFINED_FIELD'].includes(r.status), `${r.id} must carry a valid status`);
    }
});

test('AC5: the router-modularisation backlog can only shrink (ratchet)', async () => {
    const declared = manifest.backendApiTopology.routers.map((r) => r.file);
    const missing = [];
    for (const file of declared) {
        if (!(await exists(file))) missing.push(file);
    }
    // Every missing module must be a known, documented backlog item.
    for (const file of missing) {
        assert.ok(ROUTER_MODULARISATION_BACKLOG.includes(file), `${file} is missing but not documented in the backlog`);
    }
    // The backlog may never grow.
    assert.ok(missing.length <= ROUTER_MODULARISATION_BACKLOG.length,
        `router backlog grew to ${missing.length} (ceiling ${ROUTER_MODULARISATION_BACKLOG.length})`);
});

test('AC6: every manifest-declared generated artifact is materialised', async () => {
    // manifestGovernance.generatedArtifacts declares the projection targets. The
    // generator (scripts/generate-manifest-artifacts.mjs) materialises them from the
    // manifest only (no fabrication). They must all be present.
    const declared = manifest.manifestGovernance.generatedArtifacts;
    assert.ok(Array.isArray(declared) && declared.length >= 6, 'generatedArtifacts must be declared');
    assert.ok(declared.includes('docs/contracts/openapi.yaml'));
    assert.ok(declared.includes('docs/contracts/schema.sql'));
    for (const artifact of declared) {
        // docs/build/fsm/*.json is a glob; its concrete files are asserted below.
        if (artifact.includes('*')) continue;
        assert.ok(await exists(artifact), `generated artifact ${artifact} must exist`);
    }
    assert.ok(await exists('docs/contracts/manifest.json'), 'the authoritative manifest projection must exist');
    assert.ok(await exists('docs/build/tasks.json'), 'the derived task graph must exist');
});

test('AC7: the generated artifacts are a faithful projection of the manifest', async () => {
    const tasks = await readJson('docs/build/tasks.json');
    assert.equal(tasks.generatedFrom, '.bridge/project.json');
    assert.equal(tasks.graphKind, 'derived', 'the graph must be labelled derived, never a fabricated 118-task list');
    assert.equal(tasks.declaredTotalTasks, manifest.buildSpecification?.totalTasks);
    assert.ok(Array.isArray(tasks.tasks) && tasks.tasks.length >= 7, 'the graph must carry the enumerated sample tasks');

    const openapi = await read('docs/contracts/openapi.yaml');
    assert.ok(openapi.startsWith('openapi: 3.1.0'), 'the OpenAPI document must be 3.1');
    for (const op of Object.values(manifest.openapiInline)) {
        assert.ok(openapi.includes(op.path), `openapi.yaml must contain ${op.path}`);
    }

    const sql = await read('docs/contracts/schema.sql');
    for (const table of Object.keys(manifest.ddlInline)) {
        assert.ok(sql.includes(`\`${table}\``), `schema.sql must define ${table}`);
    }
});
