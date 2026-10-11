import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * DIR-087 — MASTER CANDIDATE_PAGES Phase 1.
 *
 * Covers the escalated scrollbar fix, the repo-wide guard that replaces DIR-086 AC3's three
 * hard-coded files, the verified route inventory, the frozen baseline, and the two audit
 * deliverables.
 */

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const SEARCH_BAR = 'src/components/JobsListings/JobSearchBar.jsx';
// The router is split: public top-level routes live in main.jsx, the /dashboard children in
// DashboardMain.jsx, and the /build-resume children in BuildResume.jsx. An audit that reads
// only main.jsx would miss every dashboard route — which is how my first inventory draft
// got the jobs paths wrong.
const ROUTER = 'src/main.jsx';
const DASHBOARD_ROUTES = 'src/components/Dashboard/DashboardMain/DashboardMain.jsx';
const BUILDER_ROUTES = 'src/components/BuildResume/BuildResume.jsx';
const METRICS = '.bridge/evidence/dir087-metrics.mjs';
const INVENTORY = '.bridge/evidence/dir087-candidate-page-inventory.md';
const SCORECARD = '.bridge/evidence/dir087-baseline-quality-scorecard.md';

const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, out);
        else if (/\.(jsx?|css)$/.test(entry.name)) out.push(abs);
    }
    return out;
};

test('DIR-087 AC1: the escalated JobSearchBar no-op class is fixed', async () => {
    const src = await read(SEARCH_BAR);
    // The real, plugin-free Tailwind v4 utilities replaced the no-op class.
    assert.match(src, /\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/);
    // And the class is gone from every className in this file.
    assert.doesNotMatch(src, /className\s*=\s*[^>]*\bscrollbar-none\b/);
    // The strip stays scrollable and keyboard reachable.
    assert.match(src, /overflow-x-auto/);
});

test('DIR-087 AC2: repo-wide guard — scrollbar-none can never return', async () => {
    const files = walk(path.join(ROOT, 'src'));
    assert.ok(files.length > 500, `expected to scan the whole src tree, saw ${files.length} files`);

    const offenders = [];
    for (const abs of files) {
        const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
        const src = fs.readFileSync(abs, 'utf8');
        // A className is where the class can actually do harm.
        if (/className\s*=\s*[^>]*\bscrollbar-none\b/.test(src)) offenders.push(`${rel} (className)`);
        // A stylesheet could also define or use it.
        if (rel.endsWith('.css') && /\bscrollbar-none\b/.test(src)) offenders.push(`${rel} (css)`);
    }
    assert.deepEqual(offenders, [], `scrollbar-none must not appear in any className or CSS: ${offenders.join(', ')}`);
});

test('DIR-087 AC3: the route inventory corrections hold against the real router', async () => {
    const router = await read(ROUTER);
    // The jobs family is declared with ABSOLUTE paths and is auth-aware: a guest gets
    // MainJobListings in place, a signed-in candidate is redirected into /dashboard/jobs.
    assert.match(router, /path="\/jobs\/portal"\s+element=\{<JobsPortalRoute user=\{user\} \/>\}/);
    assert.match(router, /path="\/jobs\/browse"\s+element=\{<JobsBrowseRoute user=\{user\} \/>\}/);
    assert.match(router, /path="\/jobs\/category\/:catName"\s+element=\{<JobsBrowseRoute/);
    // The dispatchers redirect signed-in users into the dashboard.
    assert.match(router, /const target = subpath \? `\/dashboard\/jobs\/portal\/\$\{subpath\}` : '\/dashboard\/jobs'/);
    assert.match(router, /location\.pathname\.replace\(\/\^\\\/jobs\/, '\/dashboard\/jobs'\)/);
    // ...while guests render the listings in place.
    assert.match(router, /return <MainJobListings key="guest" \/>/);
    // /dashboard/plans is served by Billing, not a DashboardPlans module.
    const dashboardRoutes = await read(DASHBOARD_ROUTES);
    assert.match(dashboardRoutes, /path="plans"\s+element=\{<Billing/);
    assert.ok(!exists('src/components/Dashboard/DashboardPlans'), 'there must be no DashboardPlans module');
    // Favorites is served by DashboardFavourites (British spelling).
    assert.match(dashboardRoutes, /path="favorites"\s+element=\{<DashboardFavourites/);
    assert.match(dashboardRoutes, /path="cover-letters"\s+element=\{<CoverLetter/);
    // profile and security are redirects into settings tabs, not pages.
    assert.match(dashboardRoutes, /path="profile"\s+element=\{<Navigate to="\/dashboard\/settings\?tab=profile"/);
    assert.match(dashboardRoutes, /path="security"\s+element=\{<Navigate to="\/dashboard\/settings\?tab=security"/);
    // The builder mounts THIRTEEN children, not ten.
    const builderRoutes = await read(BUILDER_ROUTES);
    for (const step of ['heading', 'work-history', 'education', 'skills', 'languages', 'summary', 'projects', 'certifications', 'achievements', 'references', 'custom', 'review']) {
        assert.match(builderRoutes, new RegExp(`path="${step}"`), `the builder must mount the ${step} step`);
    }
});
test('DIR-087 AC4: the frozen 55-template baseline is intact', async () => {
    const dir = path.join(ROOT, 'src/cv-templates');
    const modules = fs.readdirSync(dir).filter((n) => /^(cv\d+|cover\d+)$/.test(n));
    assert.equal(modules.length, 55, `the frozen baseline is 55 modules (cv1..cv51 + cover1..cover4), saw ${modules.length}`);
    assert.equal(modules.filter((n) => /^cv\d+$/.test(n)).length, 51);
    assert.equal(modules.filter((n) => /^cover\d+$/.test(n)).length, 4);
});

test('DIR-087 AC5: the audit pipeline is reproducible and self-consistent', async () => {
    // The collector must run and emit the shape the two deliverables quote.
    const raw = execFileSync(process.execPath, [METRICS], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const report = JSON.parse(raw);

    assert.equal(report.totals.pagesAudited, 14, 'all 14 candidate surfaces must be measured');
    assert.equal(report.totals.templateModules, 55, 'the collector must agree with the frozen baseline');
    assert.ok(report.totals.sourceFilesScanned > 500);
    assert.equal(report.scrollbarGuard.classNameHits.length, 0, 'the guard must report zero className hits');
    assert.equal(report.scrollbarGuard.cssHits.length, 0, 'the guard must report zero CSS hits');

    // Scores are derived, in range, and the composite is their mean.
    assert.equal(report.ranked.length, 14);
    for (const row of report.ranked) {
        assert.ok(row.score >= 0 && row.score <= 10, `${row.module} scored ${row.score}, outside 0-10`);
    }
    const mean = report.ranked.reduce((n, r) => n + r.score, 0) / report.ranked.length;
    assert.equal(report.composite, Math.round(mean * 10) / 10, 'the composite must be the mean of the ranked scores');

    // Blocker severities are from the documented set only.
    for (const b of report.blockers) {
        assert.ok(['P0', 'P1'].includes(b.severity), `unexpected severity ${b.severity}`);
        assert.ok(b.file && b.reason, 'every blocker must name its file and reason');
    }
});

test('DIR-087 AC6: both deliverables exist and quote the measured figures', async () => {
    assert.ok(exists(INVENTORY), 'the Candidate Page Inventory must exist');
    assert.ok(exists(SCORECARD), 'the Baseline Quality Scorecard must exist');

    const inventory = await read(INVENTORY);
    const scorecard = await read(SCORECARD);

    // The inventory records the verified corrections rather than the brief's assumptions.
    assert.match(inventory, /\/dashboard\/jobs\/portal/);
    assert.match(inventory, /Billing/);
    assert.match(inventory, /DashboardFavourites/);
    assert.match(inventory, /55 template modules/);

    // The scorecard states its formula and its caveats.
    assert.match(scorecard, /score = 10 \* \(0\.50 \* tokenAdoption \+ 0\.25 \* responsive \+ 0\.25 \* guards\)/);
    assert.match(scorecard, /5\.7 \/ 10/);
    assert.match(scorecard, /not a live independent product/i);
    // It must not claim a regression it cannot support.
    assert.match(scorecard, /not\s+regressions/i);
    assert.match(scorecard, /superset/i);
});
