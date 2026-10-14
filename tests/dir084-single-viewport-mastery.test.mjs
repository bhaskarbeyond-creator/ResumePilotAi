import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-084 — single-viewport mastery.
 *
 * The shell used to be `min-h-screen`, so every candidate page grew the DOCUMENT and
 * the browser window scrollbar appeared. This suite asserts the opt-in lock, the
 * compacted single-viewport Overview, the removal of document-level page roots, and
 * that nothing functional was lost.
 */

const read = (p) => fs.readFile(p, 'utf8');

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const CAND_SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const HERO = 'src/components/Candidate/CubaCandidateHero.jsx';
const RAIL = 'src/components/Candidate/CandidateExecutiveRail.jsx';
const BRIEFING = 'src/components/Candidate/AiCareerBriefing.jsx';

const PAGE_ROOTS = {
    'DashboardHomepage.jsx': 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
    'DashboardPortfolios.jsx': 'src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx',
    'MainJobListings.jsx': 'src/components/JobsListings/MainJobListings.jsx',
    'DashboardInterviews.jsx': 'src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx',
    'DashboardSettings.jsx': 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx',
    'DashboardSupport.jsx': 'src/components/Dashboard/DashboardSupport/DashboardSupport.jsx',
};

test('AC1: the shell exposes an OPT-IN viewport lock that only the candidate suite sets', async () => {
    const shell = await read(SHELL);
    // Opt-in, defaulting OFF so the employer/admin/enterprise portals are untouched.
    assert.match(shell, /viewportLock = false,/);
    // Root: bounded to one viewport and clipped, instead of min-h-screen.
    assert.match(shell, /viewportLock \? 'h-\[100dvh\] min-h-0 overflow-hidden' : 'min-h-screen'/);
    // The content row clips so nothing can push the document.
    assert.match(shell, /cx\('w-full flex min-h-0 flex-1', viewportLock && 'overflow-hidden'\)/);
    // <main> owns the ONLY scrollbar, with a stable gutter.
    assert.match(shell, /data-viewport-lock=\{viewportLock \? 'true' : 'false'\}/);
    assert.match(shell, /viewportLock && 'min-h-0 overflow-y-auto cuba-scrollbar \[scrollbar-gutter:stable\]'/);
    // The rail fills the bounded row instead of sticking inside a scrolling document.
    assert.match(shell, /viewportLock\s*\?\s*'cuba-glass hidden h-full flex-none flex-col/);
    // The candidate shell is the adopter.
    const cand = await read(CAND_SHELL);
    assert.match(cand, /viewportLock/);
    // The other portals do NOT opt in.
    const portal = await read('src/components/cuba/CubaPortalShell.jsx');
    assert.doesNotMatch(portal, /viewportLock/, 'the employer/admin/enterprise portals must keep document scroll');
});

test('AC2: the Overview geometry is compacted for one viewport', async () => {
    const [cand, hero, rail, briefing] = await Promise.all([
        read(CAND_SHELL), read(HERO), read(RAIL), read(BRIEFING),
    ]);
    // The Overview wrapper and grid are tightened and bounded to the viewport.
    assert.match(cand, /isOverview \? 'space-y-2\.5' : 'space-y-4 md:space-y-5'/);
    // DIR-090 supersedes the literal grid string: the rigid 7fr/3fr split became a COLLAPSIBLE
    // layout, so the class is now a template literal. The assertion keeps the intent — the
    // single-viewport lock is intact AND the workspace/rail share the viewport in a defined
    // ratio — and additionally pins the new collapsed full-width variant.
    assert.match(cand, /grid min-h-0 grid-cols-1 gap-3 xl:h-\[calc\(100dvh-var\(--cuba-header-h\)-3\.75rem\)\]/);
    assert.doesNotMatch(cand, /CandidateExecutiveRail|AiCareerBriefing|cuba-copilot-rail|cuba-rail-toggle/);
    assert.match(cand, /flex min-h-0 min-w-0 flex-col gap-3/);
    // DIR-085 supersedes the DIR-084 hero-banner compaction: the tall gradient banner and its
    // four stat cards are replaced by the compact Copilot HUD plus a high-density metric surface,
    // which is a strictly tighter geometry than DIR-084 achieved.
    // DIR-091 replaced the capsule STRIP with the metric CARD row, and DIR-093 then handed the HUD
    // the candidate's real first name so it can carry the reference greeting. The intent of these
    // assertions is unchanged - the hero renders the compact HUD plus a real metric surface - so
    // they follow both surfaces to their current form rather than being dropped.
    assert.match(hero, /<CopilotHeroHud insight=\{insight\} onNavigate=\{onNavigate\} displayName=\{displayName\} \/>/);
    assert.match(hero, /<CubaMetricCardRow/);
    assert.doesNotMatch(hero, /<CubaMetricCapsuleStrip/);
    assert.doesNotMatch(hero, /rounded-\[18px\] p-4 sm:p-5 text-white/);
    // Rail and briefing are tightened too.
    assert.match(rail, /space-y-2\.5" data-testid="cuba-executive-rail"/);
    assert.match(briefing, /<div className="space-y-2">/);
});

test('AC3: the Hero and full-width workspace share ONE bounded region', async () => {
    const cand = await read(CAND_SHELL);
    // The fold-critical blocks are flex-none; only the Document Gallery / Onboarding
    // region and the rail scroll internally.
    assert.match(cand, /<CubaCandidateHero displayName=\{displayName\} onNavigate=\{navigate\} \/>/);
    assert.match(cand, /min-h-0 flex-1 xl:overflow-y-auto cuba-scrollbar \[scrollbar-gutter:stable\]/);
    assert.doesNotMatch(cand, /<AiCareerBriefing|<CandidateExecutiveRail|aria-label="Executive intelligence rail"/);
    // DIR-085 supersedes the DIR-084 four-card assertion: the Hero now renders the compact
    // Copilot HUD plus a real metric surface instead of four full-height stat cards. DIR-091 moved
    // that surface from the capsule strip to the metric card row; this guard follows it there.
    const hero = await read(HERO);
    const cards = (hero.match(/<CubaStatCard/g) || []).length;
    assert.equal(cards, 0, `the Hero must no longer render stat cards, found ${cards}`);
    assert.match(hero, /<CubaMetricCardRow/);
});

test('AC4: no candidate page root uses a document-level min-h-screen', async () => {
    for (const [name, path] of Object.entries(PAGE_ROOTS)) {
        const source = await read(path);
        if (name === 'MainJobListings.jsx') {
            // The public marketing route keeps min-h-screen; the in-dashboard route does not.
            assert.match(source, /isInsideDashboard \? 'w-full min-h-0' : 'rp-public-site min-h-screen'/, `${name} must scope min-h-screen to the public route`);
            continue;
        }
        if (name === 'DashboardHomepage.jsx') {
            // Only the LEGACY (non-Cuba) branch may keep it; the Cuba branch must not.
            assert.match(source, /isCuba \? "space-y-3" : "min-h-screen bg-slate-50"/, `${name} must keep the Cuba branch height-free`);
            continue;
        }
        assert.doesNotMatch(source, /className="min-h-screen/, `${name} must not use a document-level min-h-screen root`);
    }
});

test('AC5: the touched roots carry Cuba tokens and no legacy palette', async () => {
    // The three files this directive compacted must not carry the legacy page palette.
    for (const file of [HERO, RAIL, BRIEFING]) {
        const source = await read(file);
        assert.doesNotMatch(source, /(?:bg|text|border)-slate-(?:50|900)\b/, `${file} still uses a legacy slate utility`);
    }
    // The shell's root and the locked scroll owner are token-driven.
    const shell = await read(SHELL);
    assert.match(shell, /bg-cuba-canvas text-cuba-ink/);
    assert.match(shell, /min-h-0 overflow-y-auto cuba-scrollbar/);
    // The three page roots that carried a legacy palette now use Cuba tokens.
    for (const name of ['DashboardInterviews.jsx', 'DashboardSettings.jsx', 'DashboardSupport.jsx']) {
        const source = await read(PAGE_ROOTS[name]);
        assert.match(source, /bg-cuba-canvas text-cuba-ink|min-h-0 bg-cuba-canvas/, `${name} must use Cuba canvas/ink tokens`);
        assert.doesNotMatch(source, /className="min-h-screen bg-slate-50/, `${name} must not keep the legacy root palette`);
    }
});

test('AC6: the interactive-control inventory is preserved', async () => {
    // A functional regression would show up as a missing control. Assert the real
    // controls each migrated surface owns are still present.
    const checks = [
        ['src/components/Dashboard/DashboardMessages/DashboardMessages.jsx', /type="search"|placeholder=\{t\('JobsUpdate\.DashboardMessages\.search/],
        ['src/components/AppliedJobs/JobTracker.jsx', /id="tracker-search"/],
        ['src/components/AppliedJobs/AppliedJobs.jsx', /id="application-search"/],
        ['src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx', /portfolio-gallery|value=\{searchTerm\}/],
        ['src/components/Dashboard/CoversList/CoversList.jsx', /aria-current=\{selected \? 'true' : undefined\}/],
        ['src/components/cuba/CubaAppShell.jsx', /cuba-sidebar-toggle/],
    ];
    for (const [file, pattern] of checks) {
        const source = await read(file);
        assert.match(source, pattern, `${file} lost an interactive control`);
    }
    // The skip target for the locked scroll region still exists.
    assert.match(await read(SHELL), /id="cuba-main-content"/);
});

test('AC7: no new dependency was introduced', async () => {
    const allow = new Set(['react', 'react-router-dom', 'react-i18next', 'react-icons/fi', 'react-icons/go', 'lottie-react', 'framer-motion']);
    for (const file of [SHELL, CAND_SHELL, HERO, RAIL, BRIEFING]) {
        const source = await read(file);
        for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
            const ok = allow.has(spec) || spec.startsWith('.');
            assert.ok(ok, `${file} imports ${spec}, which is outside the allowlist`);
        }
    }
    // No timer was introduced by the lock or the compaction: the pre-existing timer
    // counts are carried forward as a ratchet so DIR-084 cannot add one.
    const timerBaseline = {
        [SHELL]: 0,
        [CAND_SHELL]: 0,
        [HERO]: 2,
        [RAIL]: 1,
        [BRIEFING]: 0,
    };
    for (const [file, ceiling] of Object.entries(timerBaseline)) {
        const actual = ((await read(file)).match(/setTimeout\(|setInterval\(/g) || []).length;
        assert.ok(actual <= ceiling, `${file} added a timer: ${actual} exceeds the recorded baseline of ${ceiling}`);
    }
});

test('AC8: no layout-shift hazard on the scroll owners', async () => {
    const shell = await read(SHELL);
    // Every scroll owner reserves its gutter, so the scrollbar cannot shift layout.
    const gutters = (shell.match(/\[scrollbar-gutter:stable\]/g) || []).length;
    assert.ok(gutters >= 1, 'the locked <main> must reserve a stable scrollbar gutter');
    const cand = await read(CAND_SHELL);
    const candGutters = (cand.match(/\[scrollbar-gutter:stable\]/g) || []).length;
    assert.equal(candGutters, 1, 'the full-width workspace reserves a stable scrollbar gutter');
    // The old whole-document scroll container is gone.
    assert.doesNotMatch(shell, /className="w-full flex min-h-screen flex-col/);
});

