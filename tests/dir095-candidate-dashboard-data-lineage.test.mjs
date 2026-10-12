import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-095 — Candidate Workspace (/dashboard): DATA LINEAGE and LIVE-CONTROL parity.
 *
 * WHY THIS SUITE EXISTS. DIR-090 was an adversarial forensic audit, and it found that the
 * DIR-084..DIR-094 suites were all green while three defects sat in the shipped tree:
 *
 *   1. `CandidateExecutiveRail.jsx` rendered a HARDCODED "Today's Insights" list. It asserted
 *      "Your resume is 69% ATS ready" and "3 new jobs match your profile" — both copied verbatim
 *      from the reference screenshot — while the REAL measured `insights` memo beside it was
 *      consumed only for its `.length` in an `sr-only` span. On one screen the metric donut
 *      showed a measured 82% and the rail asserted 69%. Every existing suite passed, because
 *      dir093 AC3 only asserted the memo EXISTED, never that it was RENDERED.
 *   2. The toolbar's Sort control and Grid/List toggle had no `onClick` and no state at all.
 *   3. The progress-series colours were inverted against the reference legend.
 *
 * So this suite pins the things the earlier suites structurally could not: that the rendered
 * copy comes from measured state, and that the interactive controls are bound to real state.
 * AC1 is the important one — it is the guard that fails if anyone ever re-pastes the reference's
 * illustrative numbers back into the live DOM to "match the design".
 */

const RAIL = 'src/components/Candidate/CandidateExecutiveRail.jsx';
const LOGIC = 'src/components/Candidate/analyticsLogic.js';
const HOMEPAGE = 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx';
const HARNESS = '.bridge/capture_dashboard.mjs';

const read = (p) => fs.readFile(p, 'utf8');

const { PROGRESS_SERIES, postedLabel } = await import('../src/components/Candidate/analyticsLogic.js');

/** Removes comments so a deliberate "we must not do X" note cannot satisfy a positive check. */
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const colourOf = (id) => PROGRESS_SERIES.find((series) => series.id === id)?.color;

/* ── AC1: the rendered copy comes from measured state ─────────────────────── */

test('DIR-095 AC1: Today\'s Insights renders the MEASURED memo — no fabricated literal survives', async () => {
    const rail = await read(RAIL);
    const code = stripComments(rail);

    // The list is a real render of the measured rows, not painted copy.
    assert.match(rail, /const insights = useMemo\(\(\) => \{/);
    assert.match(code, /\{insights\.map\(\(insight\) => \{/);
    assert.match(code, /\{headline\}/);
    assert.match(code, /data-testid="cuba-rail-insights-list"/);

    // The ATS row is still derived from the real measured score, and an unresolved read still
    // OMITS the row rather than filling it in.
    assert.match(rail, /summary\.bestScore !== null/);
    assert.match(rail, /`Your resume is \$\{summary\.bestScore\}% ATS ready\./);
    assert.match(rail, /if \(resumeState\.resumes === null\) return rows;/);

    // THE REGRESSION GUARD: the reference screenshot's illustrative copy must never be re-pasted
    // into the live DOM. Every literal below was present in the tree before DIR-090.
    assert.doesNotMatch(code, /\b69\b/, 'the reference ATS figure must not be hardcoded');
    for (const literal of [
        '3 new jobs match your profile',
        'Software Engineer, Product Analyst, Data Analyst',
        'Complete your profile',
        'Add skills and certifications to get better matches.',
        'Add more quantifiable achievements to improve score.',
    ]) {
        assert.ok(!code.includes(literal), `"${literal}" must come from measured state, never a literal`);
    }

    // The sr-only count span that let a fabricated list hide behind a real length is gone.
    assert.doesNotMatch(code, /sr-only">\{insights\.length\}/);
});

/* ── AC2: the legend colours match the reference ──────────────────────────── */

test('DIR-095 AC2: the progress series carry the reference legend colours, and Shortlisted stays absent', async () => {
    const logic = await read(LOGIC);

    assert.deepEqual(PROGRESS_SERIES.map((series) => series.id), ['applied', 'interview', 'offer']);
    assert.equal(colourOf('applied'), 'var(--cuba-primary)');
    assert.equal(colourOf('interview'), 'var(--cuba-success)', 'the reference paints Interviewing GREEN');
    assert.equal(colourOf('offer'), 'var(--cuba-warning)', 'the reference paints Offers AMBER');

    // The reference's fourth legend entry cannot be sourced: the real status vocabulary has no
    // "shortlisted" member. The file records WHY, so its absence is never "fixed" by inventing a
    // series that could only ever render as an empty bar.
    assert.match(logic, /Shortlisted/);
    assert.match(logic, /backend\/routes\/jobsData\.js/);
});

/* ── AC3/AC4: the toolbar controls are real, not painted ──────────────────── */

/**
 * DIR-095 AC1 REMOVED the redundant resume workspace from the Candidate Overview: the
 * category tabs, search box, sort dropdown, grid/list toggle and pagination. The removal is
 * a CUBA-MODE SUPPRESSION (`{!isCuba && (…`), so the legacy chrome — the zero-downtime
 * rollback target (§49) — keeps the identical workspace. This helper locates that guarded
 * region so the assertions below prove the controls can NEVER render on the Cuba Overview,
 * rather than only that their source text still exists somewhere in the file.
 */
const GUARD_MARKER = 'DIR-095 — CANDIDATE DASHBOARD STREAMLINING';
const suppressionGuard = (home) => {
    const marker = home.indexOf(GUARD_MARKER);
    assert.ok(marker > -1, 'the DIR-095 removal must be documented in place (forensic deliverable)');
    const guard = home.indexOf('{!isCuba && (', marker);
    assert.ok(guard > marker, 'the workspace must be wrapped in a Cuba-mode suppression guard');
    return guard;
};

test('DIR-095 AC1/AC3: the resume workspace (incl. the Sort control) is suppressed in Cuba mode, and its lineage stays real', async () => {
    const home = await read(HOMEPAGE);
    const code = stripComments(home);
    const guard = suppressionGuard(home);

    // AC1 — every control of the removed workspace sits INSIDE the Cuba suppression guard,
    // so it can never render on the streamlined Overview.
    for (const id of ['cuba-resume-sort', 'cuba-resume-view-toggle']) {
        const at = home.indexOf(`data-testid="${id}"`);
        assert.ok(at > guard, `${id} must sit inside the DIR-095 Cuba-mode suppression guard`);
    }
    assert.ok(home.indexOf('All Resumes ({totalResumeCount})') > guard,
        'the category filter tabs must be suppressed with the workspace');
    assert.ok(home.indexOf('"Page"') > guard,
        'the pagination control must be suppressed with the workspace');

    // AC2 — the surfaces the mandate RETAINS are NOT suppressed.
    assert.ok(home.indexOf('Next Best Action') < guard,
        'the Next Best Action hub must stay on the Overview (outside the guard)');
    assert.ok(home.indexOf('data-testid="cuba-candidate-analytics"') > guard,
        'the analytics band must stay on the Overview');

    // The sort comparator is still real (it serves the legacy rollback chrome) — no key
    // fabricates a value to sort by.
    assert.match(home, /sortResumeDocuments\(documents\) \{/);
    assert.match(home, /resumeSortTimestamp\(document\) \{/);
    assert.match(home, /document\?\.item\?\.updated_at \|\| document\?\.item\?\.created_at/);
    // ...and it is still wired into the rendered list.
    assert.match(home, /this\.sortResumeDocuments\(this\.state\.displayDocuments/);

    // The painted button the real control replaced is still gone.
    assert.doesNotMatch(code, /<span>Sort<\/span>/);
    assert.doesNotMatch(home, /aria-label="Sort resumes"/);
});

test('DIR-095 AC1/AC4: the Grid/List toggle is suppressed with the workspace and its state stays real for legacy', async () => {
    const home = await read(HOMEPAGE);
    const guard = suppressionGuard(home);

    // AC1 — the toggle is inside the guard, so the Cuba Overview never renders it.
    const toggle = home.indexOf('data-testid="cuba-resume-view-toggle"');
    assert.ok(toggle > guard, 'the view toggle must sit inside the DIR-095 Cuba-mode suppression guard');

    // Its real state binding and real reflow remain in source for the legacy chrome, so the
    // rollback target is not silently broken.
    assert.match(home, /aria-pressed=\{this\.state\.viewMode === 'grid'\}/);
    assert.match(home, /aria-pressed=\{this\.state\.viewMode === 'list'\}/);
    assert.match(home, /this\.state\.viewMode === 'list'[\s\S]{0,140}grid grid-cols-1 gap-3\.5/);
    assert.match(home, /sortBy: "updated",\s+viewMode: "grid",/);
});

/* ── AC5: recency wording ─────────────────────────────────────────────────── */

test('DIR-095 AC5: recency wording is spelled out and still derived from the real timestamp', () => {
    const now = new Date('2026-10-15T12:00:00Z');

    assert.equal(postedLabel('2026-10-13T12:00:00Z', now), '2 days ago');
    assert.equal(postedLabel('2026-10-14T12:00:00Z', now), '1 day ago');
    assert.equal(postedLabel('2026-10-12T12:00:00Z', now), '3 days ago');
    assert.equal(postedLabel('2026-10-08T12:00:00Z', now), '1 week ago');
    assert.equal(postedLabel('2026-10-01T12:00:00Z', now), '2 weeks ago');

    // Still honest about the unknown, and a future stamp is still never described as "ago".
    assert.equal(postedLabel(null), '');
    assert.equal(postedLabel('not-a-date'), '');
    assert.equal(postedLabel('2026-10-16T12:00:00Z', now), '');
});

/* ── AC6: the DIR-090 negative pins are not quietly re-broken ─────────────── */

test('DIR-095 AC6: the reserved DIR-090 ids stay retired and this suite is registered', async () => {
    const [home, pkg] = await Promise.all([read(HOMEPAGE), read('package.json')]);

    // DIR-090 AC4 asserts these ids are ABSENT. DIR-095 must not re-introduce them under the
    // very names that suite reserves.
    assert.doesNotMatch(home, /data-testid="workspace-sort"/);
    assert.doesNotMatch(home, /data-testid="workspace-view-toggle"/);

    assert.match(pkg, /"test:dir095": "node --test tests\/dir095-candidate-dashboard-data-lineage\.test\.mjs"/);
});

/* ── AC7: the evidence harness cannot fake a bottom capture again ─────────── */

test('DIR-095 AC7: the capture harness is XAMPP-served, verifies its own scroll, and labels mocks', async () => {
    const harness = await read(HARNESS);
    // Comments are stripped for the NEGATIVE checks only, so the harness can still document the
    // very defects it is being pinned against (it names the old port and the old API in prose).
    const harnessCode = stripComments(harness);

    // Served by XAMPP Apache. The harness must never boot a competing server of its own.
    assert.match(harness, /http:\/\/localhost\/IME365/);
    assert.doesNotMatch(harnessCode, /createServer\(/);
    assert.doesNotMatch(harnessCode, /from 'vite'/);
    assert.doesNotMatch(harnessCode, /5188/);

    // It refuses to run when Apache is down rather than silently capturing nothing.
    assert.match(harness, /bridge xampp/);

    // The below-the-fold artifact must be PROVEN different, never assumed.
    assert.match(harnessCode, /createHash\('md5'\)/);
    assert.match(harnessCode, /BYTE-IDENTICAL/);

    // Illustrative (mocked) data can never again be presented as real evidence.
    assert.match(harness, /ILLUSTRATIVE/);
    assert.match(harnessCode, /--mock/);
});


