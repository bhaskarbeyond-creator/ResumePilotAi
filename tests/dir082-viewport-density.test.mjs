import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-082 — viewport-dense architecture, increment 1: the primitives.
 *
 * This suite asserts ONLY what has actually landed. The per-page migrations
 * (S4-S11) and the token sweep (S3) are still pending, so the legacy-utility
 * ceilings from DIR-081 are carried forward UNCHANGED as a ratchet rather than
 * being silently relaxed.
 */

const read = (p) => fs.readFile(p, 'utf8');
const CUBA = 'src/components/cuba';
const PRIMITIVES = {
    CubaViewport: `${CUBA}/CubaViewport.jsx`,
    CubaSplitView: `${CUBA}/CubaSplitView.jsx`,
    CubaStickyRail: `${CUBA}/CubaStickyRail.jsx`,
    CubaHud: `${CUBA}/CubaHud.jsx`,
    CubaToolbar: `${CUBA}/CubaToolbar.jsx`,
    CubaDensityProvider: `${CUBA}/CubaDensityProvider.jsx`,
};
const FRAME = `${CUBA}/CubaPageFrame.jsx`;

const LEGACY = /(?:text|bg|border|ring|from|to)-(?:slate|gray|blue|indigo|rose|purple|emerald|amber|green|red)-/g;
const countLegacy = (source) => (source.match(LEGACY) || []).length;

test('AC1: the five viewport-dense primitives and the density provider exist', async () => {
    for (const [name, path] of Object.entries(PRIMITIVES)) {
        const source = await read(path);
        assert.match(source, new RegExp(`export default ${name};`), `${name} must be the default export`);
        // The provider renders no DOM of its own, so only the visual primitives
        // need a crawlable testid.
        if (name !== 'CubaDensityProvider') {
            assert.ok(source.includes('data-testid'), `${name} must expose a testid for the DOM crawl`);
        }
    }
    const density = await read(PRIMITIVES.CubaDensityProvider);
    assert.match(density, /export const CUBA_DENSITIES = Object\.freeze\(\['comfortable', 'compact'\]\)/);
    assert.match(density, /export const useCubaDensity = \(\) => useContext\(CubaDensityContext\)/);
    assert.match(density, /document\.documentElement\.setAttribute\('data-cuba-density', density\)/);
    // The preference is persisted, and an unknown stored value can never be trusted.
    assert.match(density, /CUBA_DENSITIES\.includes\(saved\) \? saved : 'comfortable'/);
});

test('AC2: CubaPageFrame v2 adds density without weakening the DIR-081 contract', async () => {
    const frame = await read(FRAME);
    // The DIR-081 invariants must survive verbatim.
    assert.match(frame, /data-testid="cuba-page-frame"/);
    assert.match(frame, /data-page-state=\{resolvedState\}/);
    assert.match(frame, /state = 'ready'/);
    for (const state of ['loading', 'error', 'empty']) {
        assert.ok(frame.includes(`resolvedState === '${state}'`), `the frame must still render the ${state} state`);
    }
    assert.match(frame, /<CubaPageHeader/);
    // DIR-082 additions.
    assert.match(frame, /import CubaViewport from '\.\/CubaViewport'/);
    assert.match(frame, /dense = false/);
    assert.match(frame, /data-cuba-dense=\{dense \? 'true' : 'false'\}/);
    assert.match(frame, /hud = null/);
    assert.match(frame, /toolbar = null/);
    // Dense mode pins the header and scrolls only the body.
    assert.match(frame, /<CubaViewport className=\{contentClassName\}>\{body\}<\/CubaViewport>/);
});

test('AC3: the primitives bound themselves to the shell header height', async () => {
    const [viewport, rail, split, hud] = await Promise.all([
        read(PRIMITIVES.CubaViewport),
        read(PRIMITIVES.CubaStickyRail),
        read(PRIMITIVES.CubaSplitView),
        read(PRIMITIVES.CubaHud),
    ]);
    // The viewport owns the scroll and is bounded by the shell header token.
    assert.match(viewport, /h-\[calc\(100vh-var\(--cuba-header-h\)\)\]/);
    assert.match(viewport, /overflow-y-auto/);
    assert.match(viewport, /cuba-scrollbar/);
    // The rail sticks BELOW the header, never under it.
    assert.match(rail, /md:sticky md:top-\[calc\(var\(--cuba-header-h\)\+0\.75rem\)\]/);
    // The split view is single-pane below lg and two-pane from lg.
    assert.match(split, /data-testid="cuba-split-view"/);
    assert.match(split, /lg:flex-row/);
    assert.match(split, /hidden lg:block/);
    assert.match(split, /lg:hidden/);
    // The HUD renders nothing when it has nothing real to show.
    assert.match(hud, /if \(!items\.length\) return null;/);
});

test('AC4: the primitives are accessible by construction', async () => {
    const [rail, split, toolbar, viewport] = await Promise.all([
        read(PRIMITIVES.CubaStickyRail),
        read(PRIMITIVES.CubaSplitView),
        read(PRIMITIVES.CubaToolbar),
        read(PRIMITIVES.CubaViewport),
    ]);
    // Labelled landmarks rather than anonymous divs.
    assert.match(rail, /aria-label=\{label\}/);
    assert.match(split, /aria-label=\{listLabel\}/);
    assert.match(split, /aria-label=\{detailLabel\}/);
    assert.match(toolbar, /role="toolbar"/);
    assert.match(toolbar, /aria-label=\{label\}/);
    // The density control is a labelled radiogroup, not an unlabelled icon toggle.
    assert.match(toolbar, /role="radiogroup"/);
    assert.match(toolbar, /aria-label="Display density"/);
    assert.match(toolbar, /role="radio"/);
    assert.match(toolbar, /aria-checked=\{density === option\}/);
    // Focus affordances are added, never removed.
    assert.match(toolbar, /cuba-focusable/);
    assert.match(split, /cuba-focusable/);
    assert.match(viewport, /cuba-scrollbar/);
});

test('AC5: the primitives add no dependency, timer or simulated latency', async () => {
    const allow = new Set(['react', 'react-icons/fi', './CubaDensityProvider']);
    for (const path of Object.values(PRIMITIVES)) {
        const source = await read(path);
        for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
            assert.ok(allow.has(spec), `${path} imports ${spec}, which is outside the primitive allowlist`);
        }
        assert.doesNotMatch(source, /setTimeout|setInterval/, `${path} must not introduce a timer`);
    }
    const frame = await read(FRAME);
    for (const [, spec] of frame.matchAll(/from '([^']+)'/g)) {
        assert.ok(
            allow.has(spec) || spec.startsWith('./'),
            `${FRAME} imports ${spec}, which is outside the allowlist`,
        );
    }
});

test('AC6: the DIR-081 legacy ceiling is carried forward unchanged (sweep still pending)', async () => {
    // These are the DIR-081 baselines. S3 has not run yet, so the ratchet must be
    // identical — if any of these DROPPED, this assertion still passes (the debt only
    // shrinks), but it can never grow.
    const backlog = {
        'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx': 1330,
        'src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx': 764,
        'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx': 226,
        // DIR-094 Wave 4 swept DashboardSupport onto Cuba tokens: 183 -> 14. The ratchet is
        // tightened to the post-sweep reality so the removed utilities cannot creep back.
        // The 14 that remain are neutral fills (bg-slate-100, hover:bg-slate-50/100) and one
        // shadow tint, for which the Cuba system ships no exact equivalent token.
        'src/components/Dashboard/DashboardSupport/DashboardSupport.jsx': 14,
        'src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx': 51,
        'src/components/Dashboard/ResumesList/ResumesList.jsx': 12,
    };
    for (const [file, ceiling] of Object.entries(backlog)) {
        const actual = countLegacy(await read(file));
        assert.ok(actual <= ceiling, `${file} regressed: ${actual} legacy utilities exceeds the DIR-081 ceiling of ${ceiling}`);
    }
    // The new primitives themselves must be Cuba-token clean.
    for (const path of [...Object.values(PRIMITIVES), FRAME]) {
        assert.equal(countLegacy(await read(path)), 0, `${path} must be free of legacy colour utilities`);
    }
});

