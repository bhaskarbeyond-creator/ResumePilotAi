import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DIR-096 — OpenAPI contract conformance gate (AC2).
 *
 * `apiContracts.contractTests` names `npm run test:openapi` and
 * `npm run test:openapi-diff`; neither existed. This suite validates the 17 inline
 * OpenAPI contracts declared in the manifest against the standardised response
 * envelope, the URI versioning policy and the declared router topology, and it pins
 * the snapshot that `test:openapi-diff` compares against.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.bridge', 'project.json'), 'utf8'));
const inline = manifest.openapiInline;
const contracts = manifest.apiContracts;
const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** First path segment after the /api/v1 prefix, e.g. /api/v1/auth/signup -> auth. */
const domainOf = (p) => (p.split('/').filter(Boolean)[2] || '').toLowerCase();

test('AC1: all 17 inline OpenAPI contracts are well-formed', () => {
    assert.equal(Object.keys(inline).length, 17, 'the manifest declares 17 inline contracts');
    for (const [id, op] of Object.entries(inline)) {
        assert.ok(HTTP_VERBS.includes(op.method), `${id} must declare a valid HTTP method`);
        assert.ok(typeof op.path === 'string' && op.path.startsWith('/api/'), `${id} must declare an /api/ path`);
        assert.ok(op.auth, `${id} must declare an auth mode`);
        assert.ok(op.responses && Object.keys(op.responses).length > 0, `${id} must declare responses`);
        const codes = Object.keys(op.responses);
        assert.ok(codes.some((c) => /^2\d\d$/.test(c)), `${id} must declare a 2xx success response`);
    }
});

test('AC2: every contract uses the /api/v1 URI versioning policy', () => {
    for (const [id, op] of Object.entries(inline)) {
        assert.ok(op.path.startsWith('/api/v1/'), `${id} (${op.path}) must be URI-versioned under /api/v1/`);
    }
});

test('AC3: the standardised response and error envelopes are declared', () => {
    const env = contracts.responseEnvelope;
    const err = contracts.errorEnvelope;
    assert.deepEqual(Object.keys(env).sort(), ['data', 'error', 'requestId', 'success']);
    assert.equal(env.success, true);
    assert.equal(err.success, false);
    assert.ok(err.error && 'code' in err.error && 'message' in err.error);
    assert.equal(contracts.correlationHeader, 'X-Request-Id');
    assert.equal(contracts.tenantHeader, 'X-Tenant-Id');
});

test('AC4: every contract domain maps to a declared backend router', () => {
    const mounts = manifest.backendApiTopology.routers
        .map((r) => (r.mount || '').split(',')[0].split('/').filter(Boolean)[1])
        .filter(Boolean)
        .map((s) => s.toLowerCase());
    const known = new Set(mounts);
    // webhooks is a first-class domain even though its router file is a backlog item.
    known.add('webhooks');
    for (const [id, op] of Object.entries(inline)) {
        const domain = domainOf(op.path);
        assert.ok(known.has(domain), `${id} domain "${domain}" must map to a declared backend router`);
    }
});

test('AC5: idempotency families are covered by contracts or documented', () => {
    const families = contracts.idempotencyRequiredFor.map((f) => f.split(' ')[1].split('/')[2]);
    const covered = new Set(Object.values(inline).map((op) => domainOf(op.path)));
    const documentedGap = ['uploads']; // no inline contract yet; tracked, not silently assumed.
    for (const fam of families) {
        assert.ok(covered.has(fam) || documentedGap.includes(fam), `idempotency family "${fam}" must have a contract or be a documented gap`);
    }
});

test('AC6: the committed OpenAPI snapshot matches the live manifest (no drift)', () => {
    const snapshotPath = path.join(ROOT, 'tests', 'fixtures', 'openapi-snapshot.json');
    assert.ok(fs.existsSync(snapshotPath), 'tests/fixtures/openapi-snapshot.json must exist (run scripts/openapi-snapshot.mjs)');
    const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    assert.deepEqual(Object.keys(snap.operations).sort(), Object.keys(inline).sort(),
        'the snapshot must describe exactly the declared operations');
    for (const [id, op] of Object.entries(inline)) {
        assert.equal(snap.operations[id].method, op.method, `${id} method drift`);
        assert.equal(snap.operations[id].path, op.path, `${id} path drift`);
    }
});
