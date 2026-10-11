import fs from 'node:fs';
import path from 'node:path';

/**
 * DIR-087 Phase 1 — reproducible metric collector for the Candidate Page audit.
 *
 * Every number in the inventory and the scorecard is produced by THIS script, so the Lead
 * can re-derive each figure rather than trusting a hand-written table. Run with:
 *     node .bridge/evidence/dir087-metrics.mjs
 *
 * Method (mirrors DIR-081): measurable proxies only — Cuba token adoption versus legacy
 * colour utilities, responsive breakpoint coverage, Cuba primitive adoption, and the
 * presence of loading / empty / error guards. No score is hand-assigned.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// The candidate-facing surfaces, mapped to their REAL mounted route and serving file.
const PAGES = [
    { module: 'Overview', route: '/dashboard', file: 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx' },
    { module: 'Resume Builder (shell)', route: '/build-resume', file: 'src/components/BuildResume/BuildResume.jsx' },
    { module: 'Cover Letters', route: '/dashboard/cover-letters', file: 'src/components/CoverLetter/CoverLetter.jsx' },
    { module: 'Portfolios', route: '/dashboard/portfolios', file: 'src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx' },
    { module: 'Job Tracker', route: '/dashboard/job-tracker', file: 'src/components/AppliedJobs/JobTracker.jsx' },
    { module: 'Applied Jobs', route: '/dashboard/applied-jobs', file: 'src/components/AppliedJobs/AppliedJobs.jsx' },
    { module: 'Job Portal', route: '/dashboard/jobs/portal', file: 'src/components/JobsListings/MainJobListings.jsx' },
    { module: 'Job Search Bar', route: '/dashboard/jobs/browse', file: 'src/components/JobsListings/JobSearchBar.jsx' },
    { module: 'AI Interview Coach', route: '/dashboard/interview', file: 'src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx' },
    { module: 'Messages', route: '/dashboard/messages', file: 'src/components/Dashboard/DashboardMessages/DashboardMessages.jsx' },
    { module: 'Settings & 2FA', route: '/dashboard/settings', file: 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx' },
    { module: 'Support', route: '/dashboard/support', file: 'src/components/Dashboard/DashboardSupport/DashboardSupport.jsx' },
    { module: 'Executive Rail', route: '/dashboard (rail)', file: 'src/components/Candidate/CandidateExecutiveRail.jsx' },
    { module: 'Portfolio Gallery', route: '/dashboard/portfolios (gallery)', file: 'src/components/PortfolioGallery/PortfolioGallery.jsx' },
];

const LEGACY_COLOUR = /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|shadow|outline|fill|stroke|decoration|accent|caret)-(?:slate|gray|grey|zinc|neutral|stone|blue|indigo|rose|purple|violet|fuchsia|pink|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky)(?:-\d{2,3})?\b/g;
const CUBA_CLASS = /\bcuba-[a-z0-9-]+\b/g;
const BREAKPOINT = /\b(?:sm|md|lg|xl|2xl):/g;
const CUBA_PRIMITIVE_IMPORT = /from\s+'(?:\.\.\/)+cuba\/([A-Za-z0-9]+)'/g;

const countMatches = (source, re) => (source.match(re) || []).length;

const read = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, 'utf8');
};

const measure = (page) => {
    const source = read(page.file);
    if (source === null) return { ...page, missing: true };

    const breakpoints = new Set((source.match(BREAKPOINT) || []).map((b) => b.slice(0, -1)));
    const primitives = new Set([...source.matchAll(CUBA_PRIMITIVE_IMPORT)].map((m) => m[1]));

    return {
        module: page.module,
        route: page.route,
        file: page.file,
        lines: source.split('\n').length,
        cubaClasses: countMatches(source, CUBA_CLASS),
        legacyColours: countMatches(source, LEGACY_COLOUR),
        breakpoints: [...breakpoints].sort(),
        cubaPrimitives: [...primitives].sort(),
        // Guards are detected as RENDERED UI, not by keyword. An earlier draft matched the
        // component names CubaSkeleton / CubaEmptyState / CubaErrorState only, which
        // falsely reported DashboardMessages as unguarded even though it renders its own
        // bespoke loading and error states from isLoadingMessages / messagesError. These
        // patterns match what actually paints: a spinner/skeleton, a zero-length branch,
        // and an alert region.
        hasLoadingUi: /CubaSkeleton|animate-pulse|animate-spin/.test(source),
        hasEmptyUi: /CubaEmptyState|length\s*===\s*0|length\s*==\s*0|\bisEmpty\b/.test(source),
        hasErrorUi: /CubaErrorState|role="alert"|role='alert'/.test(source),
    };
};

const rows = PAGES.map(measure);

/**
 * Derived quality score (0-10) — DETERMINISTIC, never hand-assigned.
 *
 *   tokenAdoption = cubaClasses / (cubaClasses + legacyColours)   // is the body on tokens?
 *   responsive    = distinct breakpoints / 5 (sm, md, lg, xl, 2xl) // does it adapt?
 *   guards        = (skeleton + empty + error) / 3                 // is it honest when it fails?
 *
 *   score = 10 * (0.50 * tokenAdoption + 0.25 * responsive + 0.25 * guards)
 *
 * CAVEAT the scorecard must repeat: the breakpoint proxy can UNDER-rate a page that
 * legitimately delegates responsiveness to its shell or parent grid, and the legacy-colour
 * proxy is a SUPERSET of the DIR-082 counter (it also counts shadow/fill/stroke/decoration
 * prefixes and the zinc/neutral/stone/violet families), so these figures read HIGHER than
 * the DIR-082 ratchet and are NOT a regression against it.
 */
const score = (row) => {
    if (row.missing) return null;
    const tokenTotal = row.cubaClasses + row.legacyColours;
    const tokenAdoption = tokenTotal === 0 ? 0 : row.cubaClasses / tokenTotal;
    const responsive = Math.min(row.breakpoints.length, 5) / 5;
    const guards = ((row.hasLoadingUi ? 1 : 0) + (row.hasEmptyUi ? 1 : 0) + (row.hasErrorUi ? 1 : 0)) / 3;
    const value = 10 * (0.5 * tokenAdoption + 0.25 * responsive + 0.25 * guards);
    return {
        value: Math.round(value * 10) / 10,
        tokenAdoption: Math.round(tokenAdoption * 1000) / 1000,
        responsive: Math.round(responsive * 1000) / 1000,
        guards: Math.round(guards * 1000) / 1000,
        band: value >= 8 ? 'GOOD' : value >= 6 ? 'FAIR' : value >= 4 ? 'WEAK' : 'POOR',
    };
};

/** Blockers are DERIVED from the same metrics, so every finding is traceable to a count. */
const blockers = (row, s) => {
    const out = [];
    if (row.legacyColours >= 500) out.push({ severity: 'P0', reason: `legacy colour utilities ${row.legacyColours} in the page body` });
    if (s.guards === 0) out.push({ severity: 'P0', reason: 'no loading / empty / error guard detected' });
    if (row.legacyColours >= 100 && row.legacyColours < 500) out.push({ severity: 'P1', reason: `legacy colour utilities ${row.legacyColours} in the page body` });
    if (s.responsive < 0.6) out.push({ severity: 'P1', reason: `only ${row.breakpoints.length} distinct breakpoints` });
    if (s.guards > 0 && s.guards < 1) out.push({ severity: 'P1', reason: 'incomplete guard coverage (loading / empty / error)' });
    return out;
};

const scored = rows.map((row) => {
    const s = score(row);
    return { ...row, score: s, blockers: s ? blockers(row, s) : [] };
});

const ordered = [...scored].filter((r) => !r.missing).sort((a, b) => a.score.value - b.score.value);

// ---- Reproduction of the frozen baseline (cv1..cv51 + cover1..cover4 = 55 modules) ----
const templateDir = path.join(SRC, 'cv-templates');
const templateModules = fs.existsSync(templateDir)
    ? fs.readdirSync(templateDir).filter((n) => /^(cv\d+|cover\d+)$/.test(n))
    : [];

// ---- The scrollbar guard metric: the class may never appear in a className or a CSS file ----
const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, out);
        else if (/\.(jsx?|css)$/.test(entry.name)) out.push(abs);
    }
    return out;
};

const files = walk(SRC);
const classNameHits = [];
const cssHits = [];
for (const abs of files) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const source = fs.readFileSync(abs, 'utf8');
    if (/className\s*=\s*[^>]*\bscrollbar-none\b/.test(source)) classNameHits.push(rel);
    if (rel.endsWith('.css') && /\bscrollbar-none\b/.test(source)) cssHits.push(rel);
}

const report = {
    generatedAt: new Date().toISOString(),
    method: 'cuba-token vs legacy colour utilities, breakpoint coverage, Cuba primitive adoption, guard presence',
    scoringFormula: 'score = 10 * (0.50*tokenAdoption + 0.25*responsive + 0.25*guards)',
    pages: scored,
    ranked: ordered.map((r) => ({ module: r.module, score: r.score.value, band: r.score.band })),
    composite: ordered.length
        ? Math.round((ordered.reduce((n, r) => n + r.score.value, 0) / ordered.length) * 10) / 10
        : null,
    blockers: ordered.flatMap((r) => r.blockers.map((b) => ({ module: r.module, file: r.file, ...b }))),
    totals: {
        pagesAudited: rows.filter((r) => !r.missing).length,
        cubaClasses: rows.reduce((n, r) => n + (r.cubaClasses || 0), 0),
        legacyColours: rows.reduce((n, r) => n + (r.legacyColours || 0), 0),
        templateModules: templateModules.length,
        sourceFilesScanned: files.length,
    },
    scrollbarGuard: { classNameHits, cssHits },
};

console.log(JSON.stringify(report, null, 2));
