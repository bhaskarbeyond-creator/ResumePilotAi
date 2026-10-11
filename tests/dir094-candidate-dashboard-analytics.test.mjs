import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-094 — Candidate Workspace (/dashboard) reference parity, Part B:
 * the bottom three-column analytics band (Application Progress, Top Job Matches, Your Next Steps).
 *
 * The suite deliberately does TWO different things:
 *   1. Unit-exercises the REAL arithmetic in `analyticsLogic.js` — the month window, the
 *      bucket placement and the recency label — instead of only pattern-matching JSX.
 *   2. Pins the honesty contracts that make this band trustworthy: no invented series,
 *      no invented match percentage, and no fabricated zeros.
 *
 * The single most important assertion in this file is AC3. The reference screenshot shows
 * per-job match badges (92% / 86% / 78%) and NO SUCH VALUE EXISTS in this platform. AC3
 * exists to fail loudly if anyone later hardcodes those numbers to "match the design".
 */

const CHART = 'src/components/Candidate/CubaApplicationProgressChart.jsx';
const MATCHES = 'src/components/Candidate/CubaTopJobMatches.jsx';
const STEPS = 'src/components/Candidate/CubaNextSteps.jsx';
const LOGIC = 'src/components/Candidate/analyticsLogic.js';
const HOMEPAGE = 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx';

const read = (p) => fs.readFile(p, 'utf8');

const {
    WINDOW_MONTHS, MATCH_LIMIT, PROGRESS_SERIES,
    monthWindow, bucketTrackedJobs, postedLabel, favouriteJobId, completionPercent,
} = await import('../src/components/Candidate/analyticsLogic.js');

/* ── AC1: column 1 is a real read, with no charting dependency ─────────────── */

test('DIR-094 AC1: Application Progress binds to the real tracker read and adds no charting dependency', async () => {
    const [chart, logic, pkg] = await Promise.all([read(CHART), read(LOGIC), read('package.json')]);

    // The real owner-scoped read (GET /api/jobs-data/tracker), not a sample array.
    assert.match(chart, /import \{ getTrackedJobs \} from '\.\.\/\.\.\/services\/api\/platform'/);
    assert.match(chart, /getTrackedJobs\(\)/);

    // The arithmetic lives in the shared module and is reused, not re-implemented.
    assert.match(chart, /import \{ PROGRESS_SERIES, bucketTrackedJobs \} from '\.\/analyticsLogic'/);

    // The bars are hand-built SVG — no charting library was added to the bundle.
    assert.match(chart, /<svg viewBox=\{`0 0 \$\{VIEW\.w\} \$\{VIEW\.h\}`\}/);
    assert.match(chart, /<rect/);
    for (const banned of ['recharts', 'chart.js', 'chartjs', 'apexcharts', 'd3', 'visx']) {
        assert.doesNotMatch(pkg, new RegExp(`"${banned.replace('.', '\\.')}"`), `${banned} must not be a dependency`);
    }

    // The three progress series are the real pipeline stages.
    assert.deepEqual(PROGRESS_SERIES.map((s) => s.id), ['applied', 'interview', 'offer']);
    assert.equal(WINDOW_MONTHS, 6);
});

test('DIR-094 AC1b: the month window and bucket arithmetic are real and timezone-safe', () => {
    // A fixed local "now" keeps this deterministic on any machine and any timezone.
    const now = new Date(2026, 9, 15); // 15 Oct 2026, local time

    const months = monthWindow(now);
    assert.equal(months.length, 6);
    assert.equal(months[0].key, '2026-05');
    assert.equal(months[5].key, '2026-10');
    assert.equal(months[0].label, 'May');
    assert.equal(months[5].label, 'Oct');

    // Year rollover: a January window must reach back into the previous year.
    const january = monthWindow(new Date(2026, 0, 10));
    assert.equal(january[0].key, '2025-08');
    assert.equal(january[5].key, '2026-01');

    // Mid-month dates are used so no timezone offset can shift the month.
    const { months: bucketed, undated, total } = bucketTrackedJobs([
        { status: 'offer', dateApplied: '2026-05-15' },
        { status: 'interview', dateApplied: '2026-06-15' },
        { status: 'applied', createdAt: '2026-10-15T00:00:00' },
        { status: 'wishlist', dateApplied: '2026-10-15' }, // saved, not an application
        { status: 'rejected', dateApplied: '2026-10-15' }, // archived, not progress
        { status: 'applied' },                             // no date at all
        { status: 'applied', dateApplied: '2020-01-15' },   // outside the window
    ], now);

    assert.equal(bucketed[0].counts.offer, 1, 'May holds the offer');
    assert.equal(bucketed[1].counts.interview, 1, 'June holds the interview');
    assert.equal(bucketed[5].counts.applied, 1, 'October holds the applied role');
    assert.equal(undated, 1, 'the undated row is excluded, not folded into the current month');
    assert.equal(total, 3, 'wishlist, archived and out-of-window rows are not counted');

    // An absent pipeline is an honest empty result, never a fabricated series.
    assert.deepEqual(bucketTrackedJobs(null, now).total, 0);
    assert.equal(bucketTrackedJobs(undefined, now).months.length, 6);
});

/**
 * Removes comments before a NEGATIVE assertion, so a deliberate "we must not do X"
 * note can neither satisfy nor break the check. The `[^:]` guard keeps `https://` intact.
 */
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── AC3: column 2 is real, and NEVER invents a match percentage ───────────── */

test('DIR-094 AC3: Top Job Matches shows REAL jobs and never invents a match percentage', async () => {
    const matches = await read(MATCHES);
    const code = stripComments(matches);

    // The real public listing read (GET /api/jobs-data, MariaDB-backed).
    assert.match(matches, /import \{ getJobs \} from '\.\.\/\.\.\/services\/api\/jobs'/);
    assert.match(matches, /getJobs\(\)/);

    // Only real columns from the `jobs` table are rendered.
    assert.match(matches, /job\?\.title/);
    assert.match(matches, /job\?\.company_name/);
    assert.match(matches, /job\?\.location/);
    assert.match(matches, /job\?\.created_at/);

    // THE CRITICAL ASSERTION: no match percentage token exists in the rendered code.
    assert.doesNotMatch(code, /matchPercent|matchScore|match_score|matchPercentage/i);

    // The reference's illustrative badge values must never be hardcoded.
    assert.doesNotMatch(code, /9[0-9]\s*%|8[0-9]\s*%|7[0-9]\s*%/);

    // Nor may the reference's illustrative companies be baked in.
    for (const company of ['Google', 'Accenture', 'Infosys']) {
        assert.doesNotMatch(code, new RegExp(company, 'i'), `${company} must not be hardcoded`);
    }

    // And the file records WHY, so this cannot be mistaken for an oversight later.
    assert.match(matches, /NO SUCH VALUE EXISTS IN THIS PLATFORM/);
    assert.equal(MATCH_LIMIT, 5);
});

test('DIR-094 AC4: the save action is a real owner-scoped write, not local-state theatre', async () => {
    const matches = await read(MATCHES);
    const code = stripComments(matches);

    assert.match(matches, /import \{ getJobFavourites, toggleJobFavourite \} from '\.\.\/\.\.\/services\/api\/platform'/);
    assert.match(matches, /import \{ AuthContext \} from '\.\.\/\.\.\/context\/AuthContext'/);
    assert.match(matches, /const userId = auth\?\.user\?\.uid \|\| ''/);
    assert.match(matches, /await toggleJobFavourite\(userId, jobId\)/);

    // The control is genuinely disabled without an identity, and reflects the real state.
    assert.match(matches, /disabled=\{!userId \|\| busy\}/);
    assert.match(matches, /aria-pressed=\{saved\}/);

    // A failed write must not flip the star — no optimistic lie.
    assert.match(matches, /No optimistic lie is shown on failure/);
    assert.doesNotMatch(code, /localStorage/);
});

/* ── AC5: column 3 fixes a real defect — it renders orphaned real state ────── */

test('DIR-094 AC5: Your Next Steps renders the previously-ORPHANED real checklist state', async () => {
    const [steps, homepage] = await Promise.all([read(STEPS), read(HOMEPAGE)]);

    // The band hands the presenter DashboardHomepage's OWN measured state and handler.
    assert.match(homepage, /<CubaNextSteps steps=\{this\.state\.onboardingSteps\} onStepClick=\{this\.handleStepClick\} \/>/);

    // The four real DIR-058 steps and their real derivation still exist.
    for (const key of ['profile', 'resume', 'cover', 'application']) {
        assert.match(homepage, new RegExp(`key: "${key}"`));
    }
    assert.match(homepage, /applyOnboardingProgress\(measured\) \{/);
    assert.match(homepage, /profile: measured\.profileComplete === true/);
    assert.match(homepage, /resume: measured\.resumes > 0/);
    assert.match(homepage, /cover: measured\.coverLetters > 0/);
    assert.match(homepage, /application: measured\.applications > 0/);

    // The presenter is pure: it owns no state, fetches nothing, and hardcodes no steps.
    const stepsCode = stripComments(steps);
    assert.doesNotMatch(stepsCode, /useState|useEffect|fetch\(/);
    for (const title of ['Complete your profile', 'Create your first resume', 'Write a cover letter', 'Apply to your first job']) {
        assert.doesNotMatch(stepsCode, new RegExp(title, 'i'), `${title} must come from real state, never be hardcoded here`);
    }

    // Every step deep-links through the real handler, and progress is the real count.
    assert.match(steps, /onClick=\{\(\) => go\(step\)\}/);
    assert.match(steps, /onStepClick\(step\.id\)/);
    assert.match(steps, /`\$\{completed\} of \$\{total\} complete`/);
});

/* ── AC6: the band is really mounted in the Cuba Overview ─────────────────── */

test('DIR-094 AC6: the band is mounted as a real 3-column row in the Cuba Overview', async () => {
    const homepage = await read(HOMEPAGE);

    assert.match(homepage, /data-testid="cuba-candidate-analytics"/);
    assert.match(homepage, /className="mt-4 grid grid-cols-1 gap-2\.5 lg:grid-cols-3"/);

    // All three columns are mounted together, in the reference order.
    assert.match(homepage, /<CubaApplicationProgressChart \/>/);
    assert.match(homepage, /<CubaTopJobMatches onNavigate=\{this\.props\.navigate\} \/>/);
    assert.match(homepage, /<CubaNextSteps steps=\{this\.state\.onboardingSteps\} onStepClick=\{this\.handleStepClick\} \/>/);

    // Gated on the Cuba shell so the preserved legacy chrome (the rollback target) is untouched.
    assert.match(homepage, /\{isCubaShellEnabled\(\) && \(/);

    // The three components come from the real Candidate module.
    assert.match(homepage, /import CubaApplicationProgressChart from "\.\.\/\.\.\/Candidate\/CubaApplicationProgressChart"/);
    assert.match(homepage, /import CubaTopJobMatches from "\.\.\/\.\.\/Candidate\/CubaTopJobMatches"/);
    assert.match(homepage, /import CubaNextSteps from "\.\.\/\.\.\/Candidate\/CubaNextSteps"/);

    // The band sits AFTER the resume grid's pagination, closing the Overview as the reference shows.
    const pagination = homepage.indexOf('{/* Pagination */}');
    const band = homepage.indexOf('data-testid="cuba-candidate-analytics"');
    assert.ok(pagination > 0 && band > pagination, 'the band must follow the resume grid pagination');
});

/* ── AC7: honesty contracts — explicit states, never fabricated zeros ──────── */

test('DIR-094 AC7: unresolved reads render explicit states, never fabricated zeros', async () => {
    const [chart, steps] = await Promise.all([read(CHART), read(STEPS)]);
    const code = stripComments(chart);

    // Every non-happy path is explicit and labelled.
    assert.match(chart, /data-testid="cuba-application-progress-loading"/);
    assert.match(chart, /data-testid="cuba-application-progress-unavailable"/);
    assert.match(chart, /data-testid="cuba-application-progress-empty"/);

    // A failed read returns the state to null — it is never coerced into an empty success.
    assert.match(chart, /setJobs\(null\);\s*\n\s*setFailed\(true\);/);
    assert.match(chart, /const loading = jobs === null && !failed;/);

    // The y-scale is derived from the REAL maximum, so no bar can imply absent data.
    assert.match(chart, /const max = months\.reduce\(/);

    // The accessible summary is real text and admits the snapshot limitation.
    assert.match(chart, /snapshot of current stage, not a transition history/);
    assert.match(chart, /className="sr-only"/);

    // The checklist's progress bar reports the REAL percentage, and its own empty state exists.
    assert.match(steps, /role="progressbar"/);
    assert.match(steps, /aria-valuenow=\{percent\}/);
    assert.match(steps, /data-testid="cuba-next-steps-empty"/);

    // No randomiser, mock or seed anywhere in the rendered code.
    assert.doesNotMatch(code, /Math\.random|faker|seed/i);
});

test('DIR-094 AC8: the shared helpers return explicit unknowns rather than guesses', () => {
    // An absent or unparseable timestamp is '' — never "Just posted".
    assert.equal(postedLabel(null), '');
    assert.equal(postedLabel(undefined), '');
    assert.equal(postedLabel(''), '');
    assert.equal(postedLabel('not-a-date'), '');

    // A real timestamp yields a truthful relative label.
    assert.equal(postedLabel('2026-10-15T10:00:00Z', new Date('2026-10-15T12:00:00Z')), '2h ago');
    assert.equal(postedLabel('2026-10-15T11:30:00Z', new Date('2026-10-15T12:00:00Z')), '30m ago');
    assert.equal(postedLabel('2026-10-15T11:59:30Z', new Date('2026-10-15T12:00:00Z')), 'Just posted');
    // A future stamp is not described as "ago".
    assert.equal(postedLabel('2026-10-15T13:00:00Z', new Date('2026-10-15T12:00:00Z')), '');

    // Real favourite rows key the job as `itemId`; other stored shapes still resolve.
    assert.equal(favouriteJobId({ itemId: 'job-1' }), 'job-1');
    assert.equal(favouriteJobId({ item_id: 'job-2' }), 'job-2');
    assert.equal(favouriteJobId({ id: 'job-3' }), 'job-3');
    assert.equal(favouriteJobId(null), '');

    // Progress is the real count; an unmeasured workspace is 0%, never complete.
    assert.equal(completionPercent([]), 0);
    assert.equal(completionPercent(null), 0);
    assert.equal(completionPercent([{ completed: true }, { completed: false }]), 50);
    assert.equal(completionPercent([{ completed: true }, { completed: true }]), 100);
    // A missing flag is "pending", not "done".
    assert.equal(completionPercent([{}, {}]), 0);
});


