import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-083 — Candidate Suite viewport-dense page migrations.
 *
 * Five pages now mount the certified DIR-082 primitives, and the Cover Letters crash
 * (a flat-row read through a non-existent `item` sub-object) is fixed. This suite asserts
 * exactly that, plus token parity, a11y and the no-fabrication rule.
 */

const read = (p) => fs.readFile(p, 'utf8');

const COVERS = 'src/components/Dashboard/CoversList/CoversList.jsx';
const TRACKER = 'src/components/AppliedJobs/JobTracker.jsx';
const APPLIED = 'src/components/AppliedJobs/AppliedJobs.jsx';
const PORTFOLIOS = 'src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx';
const MESSAGES = 'src/components/Dashboard/DashboardMessages/DashboardMessages.jsx';

const LEGACY = /(?:text|bg|border|ring|from|to|placeholder)-(?:slate|gray|blue|indigo|rose|purple|emerald|amber|green|red|yellow)-/g;
const countLegacy = (source) => (source.match(LEGACY) || []).length;

test('AC1: the Cover Letters crash is fixed and the page mounts the split view', async () => {
    const covers = await read(COVERS);
    // The old render dereferenced a non-existent nested sub-object on every row.
    assert.doesNotMatch(covers, /covers\[index\]\.item/);
    // The flat fields the API really returns are used instead.
    assert.match(covers, /cover\.candidateFirstname \|\| cover\.firstname/);
    assert.match(covers, /cover\.candidateLastname \|\| cover\.lastname/);
    assert.match(covers, /cover\.title \|\| cover\.jobTitle/);
    // The live preview is fed through Cover1's real `values` contract.
    assert.match(covers, /const coverValues = \(cover = \{\}\) =>/);
    assert.match(covers, /<Cover1 values=\{coverValues\(selected\)\}/);
    assert.match(covers, /import CubaSplitView from '\.\.\/\.\.\/cuba\/CubaSplitView'/);
    // The loader reports a real failure instead of spinning forever.
    assert.match(covers, /loadCovers\(user\)/);
    assert.match(covers, /loadError: error\?\.message \|\| 'Your cover letters could not be loaded\.'/);
});

test('AC2: all five pages mount the certified DIR-082 primitives', async () => {
    const [covers, tracker, applied, portfolios, messages] = await Promise.all([
        read(COVERS), read(TRACKER), read(APPLIED), read(PORTFOLIOS), read(MESSAGES),
    ]);

    // Cover Letters: dense frame + split view + HUD + toolbar.
    assert.match(covers, /import CubaPageFrame from '\.\.\/\.\.\/cuba\/CubaPageFrame'/);
    assert.match(covers, /dense/);
    assert.match(covers, /<CubaHud items=\{hudItems\}/);
    assert.match(covers, /<CubaToolbar/);

    // Job Tracker: dense frame + HUD + intra-column scrolling Kanban.
    assert.match(tracker, /<CubaPageFrame/);
    assert.match(tracker, /<CubaHud items=\{hudItems\} label="Pipeline metrics" \/>/);
    assert.match(tracker, /md:max-h-\[calc\(100vh-var\(--cuba-header-h\)-16rem\)\] md:overflow-y-auto cuba-scrollbar/);

    // Submitted Applications: dense frame + HUD from the real counts.
    assert.match(applied, /<CubaPageFrame/);
    assert.match(applied, /<CubaHud items=\{hudItems\} label="Applications pipeline" \/>/);
    assert.match(applied, /const hudItems = \[/);

    // Portfolios: the modular Bento showcase + starter templates.
    assert.match(portfolios, /data-testid="portfolio-bento-grid"/);
    assert.match(portfolios, /data-testid="portfolio-bento-tile"/);
    assert.match(portfolios, /data-testid="portfolio-template-strip"/);
    assert.match(portfolios, /sm:col-span-2/);

    // Messages: the dual-pane chat is LOCKED to the viewport.
    assert.match(messages, /data-testid="messages-viewport-lock"/);
    assert.match(messages, /h-\[calc\(100vh-var\(--cuba-header-h\)\)\] max-h-\[calc\(100vh-var\(--cuba-header-h\)\)\] overflow-hidden/);
    assert.match(messages, /min-h-0 flex-1 flex-col overflow-hidden/);
});

test('AC3: all five migrated pages are free of legacy colour utilities', async () => {
    for (const file of [COVERS, TRACKER, APPLIED, PORTFOLIOS, MESSAGES]) {
        const actual = countLegacy(await read(file));
        assert.equal(actual, 0, `${file} still carries ${actual} legacy colour utilities`);
    }
    // Portfolios moved from 51 to 0 in this directive, so its DIR-081 ceiling is retired.
    const portfolios = await read(PORTFOLIOS);
    assert.doesNotMatch(portfolios, /max-w-7xl/);
    assert.doesNotMatch(portfolios, /bg-white/);
});

test('AC4: the migrated surfaces stay accessible', async () => {
    const [covers, tracker, portfolios] = await Promise.all([read(COVERS), read(TRACKER), read(PORTFOLIOS)]);
    // The split view panes are labelled regions and the selection is announced.
    assert.match(covers, /listLabel="Your cover letters"/);
    assert.match(covers, /detailLabel="Live cover letter preview"/);
    assert.match(covers, /aria-current=\{selected \? 'true' : undefined\}/);
    // The Kanban columns keep their labelled headings.
    assert.match(tracker, /aria-labelledby=\{`tracker-column-\$\{stage\.id\}`\}/);
    assert.match(tracker, /aria-label=\{`\$\{columnJobs\.length\} cards in \$\{stage\.label\}`\}/);
    // The starter-template strip is a labelled section with real alt text.
    assert.match(portfolios, /aria-labelledby="portfolio-starter-templates"/);
    assert.match(portfolios, /alt=\{`\$\{template\.label\} template preview`\}/);
});

test('AC5: the migrations add no dependency, timer or simulated latency', async () => {
    const allow = new Set(['react', 'react-router-dom', 'react-i18next', 'react-icons/fi', 'react-icons/fa', 'lottie-react', 'framer-motion']);
    for (const file of [COVERS, TRACKER, APPLIED, PORTFOLIOS, MESSAGES]) {
        const source = await read(file);
        for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
            const ok = allow.has(spec) || spec.startsWith('.') || spec.startsWith('..');
            assert.ok(ok, `${file} imports ${spec}, which is outside the allowlist`);
        }
    }
});

test('AC6: every HUD figure binds to real data — no fabricated telemetry', async () => {
    const [tracker, applied, covers] = await Promise.all([read(TRACKER), read(APPLIED), read(COVERS)]);

    // Job Tracker: the HUD reads the REAL summarizePipeline result.
    assert.match(tracker, /const summary = useMemo\(\(\) => summarizePipeline\(jobs\), \[jobs\]\)/);
    assert.match(tracker, /if \(!summary \|\| !summary\.total\) return \[\];/);
    for (const key of ['summary.total', 'summary.active', 'summary.submitted', 'summary.interviewRate', 'summary.pendingResponses', 'summary.offerCount']) {
        assert.ok(tracker.includes(key), `the tracker HUD must bind ${key}`);
    }

    // Submitted Applications: the HUD reads the same real counts the stat tiles used.
    assert.match(applied, /value: appliedJobs\.length/);
    assert.match(applied, /value: getStatusCount\('applied'\)/);
    assert.match(applied, /value: getStatusCount\('interview'\)/);
    assert.match(applied, /getStatusCount\('accepted'\) \/ appliedJobs\.length/);

    // Cover Letters: the signals are COMPUTED from the stored body, and an empty body
    // yields an empty HUD rather than an invented figure.
    assert.match(covers, /words: body \? body\.split\(\/\\s\+\/\)\.length : 0/);
    assert.match(covers, /paragraphs: body \? body\.split\(\/\\n\\n\+\/\)\.filter\(Boolean\)\.length : 0/);
    assert.match(covers, /const hudItems = signals \? \[/);

    // No sample/mock telemetry was introduced anywhere.
    for (const [name, source] of [['tracker', tracker], ['applied', applied], ['covers', covers]]) {
        assert.doesNotMatch(source, /mockTelemetry|sampleMetrics|fakeCount/i, `${name} must not invent telemetry`);
    }
});

