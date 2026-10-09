/**
 * DIR-070 — smart gap filling & partitioner polish.
 *
 * Pins the Page-1 void prevention invariant, the multi-tier adaptive
 * micro-compaction and the balanced 2-page distribution.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PARTITIONER = 'src/engine/hybrid/smartPartitioner.js';

const { partitionResumeContent } = await import(
    new URL('../src/engine/hybrid/smartPartitioner.js', import.meta.url).href
);
const { FIXTURES } = await import(new URL('../template-lab/fixtures.js', import.meta.url).href);

test('DIR-070 S1: a three-tier compaction table drives the section geometry', () => {
    const src = read(PARTITIONER);
    assert.match(src, /const COMPACTION_TIERS = \[/, 'the tier table must exist');
    const tiers = (src.match(/\{ id: \d, sectionGapPx:/g) || []).length;
    assert.equal(tiers, 3, `expected 3 compaction tiers, found ${tiers}`);
    assert.match(src, /gridRowGapPx: 5, cardPadPx: 5, titleMarginPx: TITLE_MARGIN_PX - TITLE_GAP_PX, titleGapPx: 0/,
        'tier 2 must tighten the row gap, card padding and title margin');
    assert.match(src, /const buildSections = \(tier\) =>/, 'the section building must be tier-aware');
    assert.match(src, /const packSections = \(sectionsArg, sectionGapPx\) =>/, 'the packer must take the tier sections');
});

test('DIR-070 S2: the Page-1 void prevention invariant is enforced', () => {
    const src = read(PARTITIONER);
    assert.match(src, /const PAGE_VOID_MAX_PX = 80/, 'the 80px void ceiling must exist');
    assert.match(src, /const PAGE_VOID_MAX_FRACTION = 0\.10/, 'the 10 percent void ceiling must exist');
    assert.match(src, /const donorVoid = capacityFor\(q\) - heightOfPage\(next\[q\], sectionGapPx\)/,
        'the guard must measure the donor page void');
    assert.match(src, /if \(donorVoid > voidLimit\) return buckets/, 'a big void must forbid the move');
});

test('DIR-070 S3: the compaction descriptor is returned and painted', () => {
    const src = read(PARTITIONER);
    assert.match(src, /compaction: \{/, 'the descriptor must be returned');
    assert.match(src, /tier: activeTier\.id/, 'the descriptor must carry the tier id');
    for (const field of ['sectionGapPx', 'gridRowGapPx', 'cardPadPx', 'titleMarginPx', 'titleGapPx']) {
        assert.match(src, new RegExp(`${field}: activeTier\\.${field}`), `the descriptor must carry ${field}`);
    }
    const css = read('src/engine/hybrid/smartEngine.css');
    assert.match(css, /gap: var\(--smart-grid-row-gap, 7px\) 10px/, 'the grid row gap must be a variable');
    assert.match(css, /padding: var\(--smart-card-pad, 7px\) 9px/, 'the project card padding must be a variable');
    assert.match(css, /padding: var\(--smart-card-pad, 6px\) 9px/, 'the cert card padding must be a variable');
    assert.match(css, /margin: 0 0 var\(--smart-title-gap, 3px\)/, 'the title margin must be a variable');
    const composer = read('src/engine/hybrid/SmartResumeComposer.jsx');
    for (const v of ['--smart-section-gap', '--smart-grid-row-gap', '--smart-card-pad', '--smart-title-gap']) {
        assert.match(composer, new RegExp(`'${v}'`), `the composer must set ${v}`);
    }
});

// ── Functional proofs over a deterministic profile space ─────────────────────

const GRID = FIXTURES.gridDense;

function* profileSpace() {
    for (const archetype of ['minimal-ats', 'modern-split']) {
        for (let e = 0; e <= 6; e += 1) {
            for (let p = 0; p <= 7; p += 1) {
                for (let c = 0; c <= 8; c += 1) {
                    yield {
                        archetype,
                        values: {
                            ...GRID,
                            employments: GRID.employments.slice(0, e),
                            projects: GRID.projects.slice(0, p),
                            certifications: GRID.certifications.slice(0, c),
                        },
                    };
                }
            }
        }
    }
}

/** Rendered height of a packed page: content + the inter-section gaps. */
function pageHeight(page, gapPx) {
    const content = page.flowItems.reduce((sum, item) => sum + (item.estHeight || 0), 0);
    let groups = 0;
    let previous = null;
    for (const item of page.flowItems) {
        if (item.type !== previous) { groups += 1; previous = item.type; }
    }
    return content + Math.max(0, groups - 1) * gapPx;
}

const P1_CAPACITY = 860; // 900 - the 40px footer safety clearance

test('DIR-070 F1: Page 1 is never left half-empty by the orphan guard', () => {
    let twoPage = 0;
    let worstVoid = 0;
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.totalPages !== 2) continue;
        twoPage += 1;
        const voidPx = P1_CAPACITY - pageHeight(result.pages[0], result.sectionGapPx);
        worstVoid = Math.max(worstVoid, voidPx);
        assert.ok(voidPx <= 80, `${archetype}: Page 1 void was ${Math.round(voidPx)}px (> 80px)`);
    }
    assert.ok(twoPage > 0, 'the sweep must exercise two-page results');
    assert.ok(worstVoid <= 80, `worst Page 1 void was ${Math.round(worstVoid)}px`);
});

test('DIR-070 F2: a two-page result fills Page 1 to at least 85 percent', () => {
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.totalPages !== 2) continue;
        const fill = pageHeight(result.pages[0], result.sectionGapPx) / P1_CAPACITY;
        assert.ok(fill >= 0.85, `${archetype}: Page 1 fill was ${(fill * 100).toFixed(1)}% (< 85%)`);
    }
});

test('DIR-070 F3: multi-tier compaction fits profiles that tier 0 cannot', () => {
    let compactedToOne = 0;
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.totalPages === 1 && result.compaction.tier > 0) compactedToOne += 1;
    }
    assert.ok(compactedToOne >= 5, `expected a meaningful number of compaction-driven single pages, got ${compactedToOne}`);
});

test('DIR-070 F4: compaction only ever tightens, never loosens', () => {
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        const c = result.compaction;
        assert.ok(c.sectionGapPx <= 14, `${archetype}: section gap must not exceed the default`);
        assert.ok(c.gridRowGapPx <= 7, `${archetype}: grid row gap must not exceed the default`);
        assert.ok(c.cardPadPx <= 7, `${archetype}: card padding must not exceed the default`);
        assert.ok(c.titleGapPx <= 3, `${archetype}: title gap must not exceed the default`);
    }
});

