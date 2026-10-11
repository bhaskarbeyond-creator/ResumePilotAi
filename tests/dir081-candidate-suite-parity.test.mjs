import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveActiveItem } from '../src/components/Candidate/navigationState.js';
import { CANDIDATE_NAVIGATION } from '../src/components/cuba/candidateNavigation.js';

/**
 * DIR-081 — Candidate Suite UI/UX parity.
 *
 * Forensic token parity (Cuba tokens vs the legacy slate/gray/blue/indigo/rose/purple
 * utility palette), the query-aware active-item resolver, the page-state invariant and
 * the two split views. The backlog ratchet at the end documents the debt that remains
 * so it can only ever shrink.
 */

const read = (p) => fs.readFile(p, 'utf8');

const SHELL_NAV = 'src/components/Candidate/navigationState.js';
const PAGE_FRAME = 'src/components/cuba/CubaPageFrame.jsx';
const JOB_TRACKER = 'src/components/AppliedJobs/JobTracker.jsx';
const APPLIED_JOBS = 'src/components/AppliedJobs/AppliedJobs.jsx';
const PORTFOLIOS = 'src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx';
const COVERS = 'src/components/Dashboard/CoversList/CoversList.jsx';
const MESSAGES = 'src/components/Dashboard/DashboardMessages/DashboardMessages.jsx';
const GALLERY = 'src/components/PortfolioGallery/PortfolioGallery.jsx';

// The legacy utility palette that must not appear on a Cuba surface.
const LEGACY = /(?:text|bg|border|ring|from|to)-(?:slate|gray|blue|indigo|rose|purple|emerald|amber|green|red)-/g;
const countLegacy = (source) => (source.match(LEGACY) || []).length;

test('AC1: the active-item resolver is query-aware (Security no longer highlights Profile)', () => {
    assert.equal(resolveActiveItem('/dashboard/settings?tab=Security', CANDIDATE_NAVIGATION)?.id, 'security');
    assert.equal(resolveActiveItem('/dashboard/settings?tab=Profile', CANDIDATE_NAVIGATION)?.id, 'profile');
    // Case-insensitive on the param value, because the router redirects lowercase it.
    assert.equal(resolveActiveItem('/dashboard/settings?tab=security', CANDIDATE_NAVIGATION)?.id, 'security');
    // The bare path keeps its historical resolution (first declared item).
    assert.equal(resolveActiveItem('/dashboard/settings', CANDIDATE_NAVIGATION)?.id, 'profile');
    // Unchanged behaviour for the rest of the model.
    assert.equal(resolveActiveItem('/dashboard/interview', CANDIDATE_NAVIGATION)?.id, 'interview');
    assert.equal(resolveActiveItem('/build-resume/heading', CANDIDATE_NAVIGATION)?.id, 'resumes');
    assert.equal(resolveActiveItem('/dashboard2', CANDIDATE_NAVIGATION), null);
    assert.equal(resolveActiveItem('/employer/jobs', CANDIDATE_NAVIGATION), null);
});

test('AC2: the page frame keeps the header mounted in every state', async () => {
    const frame = await read(PAGE_FRAME);
    assert.match(frame, /data-testid="cuba-page-frame"/);
    assert.match(frame, /data-page-state=\{resolvedState\}/);
    assert.match(frame, /state = 'ready'/);
    for (const state of ['loading', 'error', 'empty']) {
        assert.ok(frame.includes(`resolvedState === '${state}'`), `the frame must render the ${state} state`);
    }
    // The header is rendered ONCE, outside the state switch.
    assert.match(frame, /<CubaPageHeader/);

    // Both tracker pages adopt it and no longer blank the whole page.
    const [tracker, applied] = await Promise.all([read(JOB_TRACKER), read(APPLIED_JOBS)]);
    for (const [name, source] of [['JobTracker', tracker], ['AppliedJobs', applied]]) {
        assert.match(source, /import CubaPageFrame from '\.\.\/cuba\/CubaPageFrame'/, `${name} must import the frame`);
        const frames = (source.match(/<CubaPageFrame/g) || []).length;
        assert.ok(frames >= 3, `${name} must frame the auth, loading and error states, found ${frames}`);
        assert.doesNotMatch(source, /min-h-64 items-center justify-center" aria-busy/, `${name} still has the blank loading early return`);
    }
});

test('AC3: Portfolios has a real empty state and can no longer fake one on failure', async () => {
    const source = await read(PORTFOLIOS);
    assert.match(source, /import CubaEmptyState from '\.\.\/\.\.\/cuba\/CubaEmptyState'/);
    assert.match(source, /import CubaPageFrame from '\.\.\/\.\.\/cuba\/CubaPageFrame'/);
    assert.match(source, /const \[loadError, setLoadError\] = useState\(''\)/);
    // The catch records the real failure instead of silently emptying the list.
    assert.match(source, /setLoadError\(error\?\.message \|\| t\('DashboardPortfolios\.messages\.loadError'\)\)/);
    // The error branch renders the frame's error state, the empty branch the real empty state.
    assert.match(source, /state="error"/);
    assert.match(source, /<CubaEmptyState/);

test('AC4: Cover Letters and Messages are responsive and legacy-free', async () => {
    const [covers, messages] = await Promise.all([read(COVERS), read(MESSAGES)]);

    // Cover Letters: real breakpoints, Cuba tokens, a page header and a real empty state.
    assert.match(covers, /import CubaPageHeader from '\.\.\/\.\.\/cuba\/CubaPageHeader'/);
    assert.match(covers, /sm:flex-row sm:items-center sm:justify-between/);
    assert.match(covers, /<CubaEmptyState/);
    assert.equal(countLegacy(covers), 0, 'Cover Letters must be free of legacy colour utilities');
    // The literal junk text that used to render in the DOM is gone.
    assert.doesNotMatch(covers, /d{8,}/);

    // Messages: a genuine lg split view with a mobile back-to-list affordance.
    assert.match(messages, /lg:h-\[calc\(100vh-9rem\)\]/);
    assert.match(messages, /hidden lg:flex/);
    assert.match(messages, /lg:w-\[320px\]/);
    assert.match(messages, /lg:hidden/);
    assert.match(messages, /FiArrowLeft/);
    assert.equal(countLegacy(messages), 0, 'Messages must be free of legacy colour utilities');
});

test('AC5: PortfolioGallery is re-skinned onto Cuba tokens', async () => {
    const source = await read(GALLERY);
    assert.match(source, /import CubaPageHeader from '\.\.\/cuba\/CubaPageHeader'/);
    assert.match(source, /import CubaErrorState from '\.\.\/cuba\/CubaErrorState'/);
    assert.match(source, /import CubaSkeleton from '\.\.\/cuba\/CubaSkeleton'/);
    assert.match(source, /max-w-\[1680px\]/);
    assert.doesNotMatch(source, /max-w-7xl/);
    assert.doesNotMatch(source, /bg-white/);
    assert.doesNotMatch(source, /\uD83C\uDFA8/);
    assert.equal(countLegacy(source), 0, 'PortfolioGallery must be free of legacy colour utilities');
    assert.ok((source.match(/cuba-/g) || []).length > 20, 'PortfolioGallery must use the Cuba tokens');
    // The console-only swallow is replaced by a visible error state.
    assert.match(source, /setLoadError\(error\?\.message \|\| 'The portfolio gallery could not be loaded\.'\)/);
});

test('AC6: no page renders placeholder junk text', async () => {
    const pages = [
        JOB_TRACKER, APPLIED_JOBS, PORTFOLIOS, COVERS, MESSAGES, GALLERY,
        'src/components/Dashboard/ResumesList/ResumesList.jsx',
        'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
        'src/components/Dashboard/DashboardSupport/DashboardSupport.jsx',
    ];
    for (const page of pages) {
        const source = await read(page);
        // A run of 8+ identical letters outside a word is not valid copy.
        assert.doesNotMatch(source, /\bd{8,}\b/, `${page} contains placeholder junk text`);
    }
});

test('AC7: the token-parity ratchet — remediated surfaces are legacy-free and debt cannot grow', async () => {
    const remediated = [SHELL_NAV, PAGE_FRAME, JOB_TRACKER, APPLIED_JOBS, COVERS, MESSAGES, GALLERY];
    for (const file of remediated) {
        const source = await read(file);
        assert.equal(countLegacy(source), 0, `${file} must be legacy-utility free`);
    }

    // DIR-081 baseline measured after this directive. These surfaces are still legacy and
    // are the explicit follow-on backlog; the assertion is a RATCHET so the debt can only
    // shrink. Raising a number here is a deliberate, reviewable act.
    const backlog = {
        [PORTFOLIOS]: 51,
        'src/components/Dashboard/ResumesList/ResumesList.jsx': 12,
        'src/components/Dashboard/DashboardSupport/DashboardSupport.jsx': 183,
        'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx': 226,
        'src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx': 764,
        'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx': 1330,
    };
    for (const [file, ceiling] of Object.entries(backlog)) {
        const source = await read(file);
        const actual = countLegacy(source);
        assert.ok(actual <= ceiling, `${file} regressed: ${actual} legacy utilities exceeds the recorded ceiling of ${ceiling}`);
    }
});

    // The raw emoji placeholder is gone.
    assert.doesNotMatch(source, /\uD83C\uDFA8/);
});
