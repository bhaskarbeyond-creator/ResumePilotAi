import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DIR-098 — Master UI/UX Transformation acceptance gates (Phase One scaffolding).
 *
 * Machine-checkable gates that every later phase reconciles against. These assert the
 * completeness + acceptance invariants of the transformation programme, derived from
 * the real repository (no fabrication).
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const INV = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'inventory.json');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const inventory = () => JSON.parse(fs.readFileSync(INV, 'utf8'));

test('UX-AC1: the inventory covers 100% of discovered routes (no omissions)', () => {
    const inv = inventory();
    const routes = [...new Set([...read('src/main.jsx').matchAll(/path="([^"]+)"/g)].map((m) => m[1]))].filter((r) => r !== '*' && !/:\w/.test(r));
    assert.equal(inv.units.length, routes.length, 'exactly one review unit per discovered route');
    const have = new Set(inv.units.map((u) => u.route));
    const missing = routes.filter((r) => !have.has(r));
    assert.deepEqual(missing, [], `un-inventoried routes: ${missing.join(', ')}`);
});

test('UX-AC2: the mandated 7-viewport responsive matrix is declared on every unit', () => {
    const inv = inventory();
    assert.deepEqual(inv.viewports, [320, 375, 768, 1024, 1280, 1440, 1920]);
    assert.ok(inv.units.every((u) => u.viewports.length === 7), 'every unit carries the 7-viewport matrix');
});

test('UX-AC3: the mandated interaction-state matrix is declared', () => {
    const inv = inventory();
    for (const s of ['initial', 'loading', 'empty', 'populated', 'error', 'permission-denied']) {
        assert.ok(inv.stateCategories.includes(s), `state "${s}" must be in the matrix`);
    }
});

test('UX-AC4: no review unit is accepted without an evidence-backed score >= 98', () => {
    const inv = inventory();
    const offenders = inv.units.filter((u) => u.acceptance === 'ACCEPTED' && !(typeof u.score === 'number' && u.score >= 98));
    assert.deepEqual(offenders.map((u) => u.reviewId), [], 'no unit may be ACCEPTED below 98/100');
});

test('UX-AC5: every review unit records a route, portal and status', () => {
    const inv = inventory();
    for (const u of inv.units) {
        assert.ok(u.reviewId && u.route && u.portal && u.status, `unit ${u.reviewId} must be fully described`);
    }
});

test('UX-AC6: the baseline screenshot set covers every unit x viewport', () => {
    const mPath = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'baseline-manifest.json');
    assert.ok(fs.existsSync(mPath), 'baseline-manifest.json must exist (run scripts/ux-baseline-capture.mjs)');
    const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    const inv = inventory();
    assert.equal(m.unitsCaptured, inv.units.length, 'every review unit must be baselined');
    assert.deepEqual(m.viewports, inv.viewports);
    assert.equal(m.screenshots, inv.units.length * inv.viewports.length, 'screenshots = units x viewports');
    for (const r of m.results) assert.ok(fs.existsSync(path.join(ROOT, r.screenshot)), `missing screenshot ${r.screenshot}`);
});

