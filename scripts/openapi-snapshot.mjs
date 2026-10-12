/**
 * DIR-096 — OpenAPI contract snapshot tool.
 *
 * The master manifest (.bridge/project.json) declares 17 inline OpenAPI contracts
 * under `openapiInline`. `apiContracts.contractTests` names two CI gates that did
 * not exist: `npm run test:openapi` and `npm run test:openapi-diff`.
 *
 * This tool projects `openapiInline` into a stable, sorted snapshot at
 * tests/fixtures/openapi-snapshot.json and can verify the live manifest against it,
 * which is what `test:openapi-diff` needs to detect contract drift.
 *
 * Usage:
 *   node scripts/openapi-snapshot.mjs          # (re)write the snapshot
 *   node scripts/openapi-snapshot.mjs --check  # verify, exit 1 on drift
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, '.bridge', 'project.json');
const SNAPSHOT = path.join(ROOT, 'tests', 'fixtures', 'openapi-snapshot.json');

/** Deterministic projection: operation ids sorted, keys ordered. */
const project = (manifest) => {
    const inline = manifest.openapiInline || {};
    const operations = {};
    for (const id of Object.keys(inline).sort()) {
        const op = inline[id];
        operations[id] = {
            method: op.method,
            path: op.path,
            auth: op.auth ?? null,
            requestKeys: op.request ? Object.keys(op.request).sort() : [],
            responseCodes: op.responses ? Object.keys(op.responses).sort() : [],
        };
    }
    return {
        versioning: manifest.apiContracts?.versioning ?? null,
        responseEnvelopeKeys: manifest.apiContracts?.responseEnvelope
            ? Object.keys(manifest.apiContracts.responseEnvelope).sort()
            : [],
        operations,
    };
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const check = process.argv.includes('--check');
const live = project(readJson(MANIFEST));

if (!check) {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(live, null, 2)}\n`, 'utf8');
    console.log(`OpenAPI snapshot written -> ${path.relative(ROOT, SNAPSHOT)} (${Object.keys(live.operations).length} operations)`);
    process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
    console.error('OpenAPI drift: snapshot missing at tests/fixtures/openapi-snapshot.json');
    process.exit(1);
}

const committed = readJson(SNAPSHOT);
const a = JSON.stringify(committed);
const b = JSON.stringify(live);
if (a !== b) {
    console.error('OpenAPI drift detected: live manifest openapiInline differs from the committed snapshot.');
    const committedIds = Object.keys(committed.operations || {});
    const liveIds = Object.keys(live.operations || {});
    for (const id of liveIds.filter((x) => !committedIds.includes(x))) console.error(`  + ${id} (new operation)`);
    for (const id of committedIds.filter((x) => !liveIds.includes(x))) console.error(`  - ${id} (removed operation)`);
    process.exit(1);
}
console.log(`OpenAPI diff clean: ${Object.keys(live.operations).length} operations match the snapshot.`);
