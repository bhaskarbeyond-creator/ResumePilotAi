// DIR-091 — Candidate Workspace (/dashboard) reference mastery.
//
// The directive asks for a 100% match to the authoritative reference screenshot. This suite pins
// the part that is DELIVERED (S1: the welcome header surface and the four high-density metric
// cards with a real ATS donut) and asserts the honesty contract that governs the rest.
//
// It deliberately does NOT claim S2-S6 are complete — the directive's own evidence must state
// which steps landed, and this file only guards what exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');

const HERO = 'src/components/Candidate/CubaCandidateHero.jsx';
const CARDS = 'src/components/Candidate/CubaMetricCardRow.jsx';

test('DIR-091 AC1: the four high-density metric cards exist and are wired into the hero', async () => {
    const [hero, cards] = await Promise.all([read(HERO), read(CARDS)]);

    // The reference mandates a metric CARD row, not the retired DIR-085 capsule strip.
    assert.match(hero, /import CubaMetricCardRow from '\.\/CubaMetricCardRow'/);
    assert.match(hero, /<CubaMetricCardRow/);
    assert.doesNotMatch(hero, /CubaMetricCapsuleStrip/);

    // Exactly the four cards the reference specifies, in order.
    assert.match(cards, /data-testid="cuba-metric-cards"/);
    for (const id of ['cuba-metric-resumes', 'cuba-metric-ats', 'cuba-metric-applications', 'cuba-metric-coach']) {
        assert.ok(cards.includes(`testId="${id}"`), `the metric row must render the ${id} card`);
    }
    for (const label of ['Total Resumes', 'Avg. ATS Score', 'Job Applications', 'Interview Coach']) {
        assert.ok(cards.includes(`label="${label}"`), `the metric row must label the ${label} card`);
    }
});

test('DIR-091 AC2: the ATS card draws a REAL donut from the real score — no charting dependency', async () => {
    const cards = await read(CARDS);

    // A real SVG arc, geometry derived from the score, not a hardcoded percentage.
    assert.match(cards, /const AtsDonut = \(\{ score \}\) => \{/);
    assert.match(cards, /strokeDasharray=\{DONUT_CIRCUMFERENCE\}/);
    assert.match(cards, /strokeDashoffset=\{offset\}/);
    assert.match(cards, /const clamped = hasScore \? Math\.max\(0, Math\.min\(100, score\)\) : 0;/);
    assert.match(cards, /<AtsDonut score=\{dash \? null : bestScore\} \/>/);

    // The reference's 69% is illustrative and must never be baked in. Check the CODE only — the
    // file's comments legitimately cite the reference figure while explaining that contract.
    const code = cards.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b69\b/, 'the reference percentage must not be hardcoded');
    assert.doesNotMatch(code, /const DEFAULT_ATS|fallbackScore\s*=\s*\d/, 'no invented ATS fallback');
    // And no charting library was pulled in.
    assert.doesNotMatch(cards, /from 'recharts'|from 'chart\.js'|from 'd3'/);
});

test('DIR-091 AC3: every metric binds to a real platform read and never fabricates a zero', async () => {
    const [hero, cards] = await Promise.all([read(HERO), read(CARDS)]);

    // The hero still owns the real reads; the card row is a pure presenter.
    assert.match(hero, /getResumes/);
    assert.match(hero, /getStatesOfUser/);
    // DIR-093 S3 added optional `trends` and `onNavigate` props for the reference affordances.
    // The four REAL values are still the props that drive the cards, and they still default to
    // null, so an unresolved read renders an honest placeholder rather than a fabricated zero.
    assert.match(cards, /const CubaMetricCardRow = \(\{ loading = false, count = null, bestScore = null, applications = null, trends = null, onNavigate \}\)/);

    // An unresolved read renders an explicit placeholder, never a fake zero.
    assert.match(cards, /count === null \? '--' : String\(count\)/);
    assert.match(cards, /applications === null \? '--' : String\(applications\)/);
    assert.match(cards, /bestScore !== null \? `\$\{bestScore\}%` : 'Not scored'/);
    // DIR-092 supersedes the DIR-091 centred-donut-label pin: the ATS number now renders as a
    // bold headline value BESIDE the donut (matching Total Resumes / Job Applications / Interview
    // Coach) instead of living only inside the tiny centred donut label, so that retired
    // expression no longer exists. The real donut + its geometry are still asserted in AC2.
    assert.match(cards, /<span className="block text-lg font-bold leading-tight text-cuba-ink">\{value\}<\/span>/);
});

test('DIR-091 AC4: the cards use Cuba design tokens only — no raw palette utilities', async () => {
    const cards = await read(CARDS);

    assert.match(cards, /border-cuba-line/);
    assert.match(cards, /bg-cuba-card/);
    assert.match(cards, /text-cuba-ink-subtle/);
    assert.match(cards, /rounded-cuba-lg/);

    // Zero hardcoded hex colours and zero raw Tailwind palette utilities.
    assert.doesNotMatch(cards, /#[0-9a-fA-F]{3,6}/, 'no hardcoded hex colours');
    assert.doesNotMatch(cards, /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|green|blue|amber|yellow|indigo|purple|pink)-\d{2,3}\b/, 'no raw palette utilities');
});

test('DIR-091 AC5: the header surface is preserved and stays accessible', async () => {
    const [hero, cards] = await Promise.all([read(HERO), read(CARDS)]);

    // The reference header keeps the greeting, the quote and the three CTAs via the HUD. DIR-093
    // handed the HUD the candidate's REAL first name so it can render the greeting, and moved the
    // page's single h1 out of the hero's screen-reader-only element and into that visible greeting.
    // Both assertions follow the surface rather than being dropped, and the h1 count is still one.
    assert.match(hero, /<CopilotHeroHud insight=\{insight\} onNavigate=\{onNavigate\} displayName=\{displayName\} \/>/);
    const hud = await read('src/components/Candidate/CopilotHeroHud.jsx');
    assert.match(hud, /<h1 /);
    assert.doesNotMatch(hero, /<h1/);

    // The metric row is a labelled landmark, and the donut is decorative to AT because the
    // percentage is already in the card's text.
    assert.match(cards, /aria-label="Overview metrics"/);
    assert.match(cards, /aria-hidden="true"/);
});

test('DIR-091 AC6: the frozen CV template set and the XAMPP server policy are untouched', async () => {
    const pkg = JSON.parse(await read('package.json'));
    assert.ok(pkg.scripts['test:dir091'], 'test:dir091 must be registered');

    // No directive in this session may touch the frozen template set.
    const { execSync } = await import('node:child_process');
    const changed = execSync('git status --porcelain src/cv-templates', { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(changed, '', 'src/cv-templates must have a zero diff');
});

// ---------------------------------------------------------------------------------------------
// DIR-091 (two-page re-issue) — the BUILD RESUME half. Added under the Lead's ruling that the
// dashboard rail mount (S5) is SUPERSEDED by the already-frozen CandidateExecutiveRail, and that
// this suite must be EXTENDED rather than duplicated.
// ---------------------------------------------------------------------------------------------

const HEADING = 'src/components/BuildResume/steps/HeadingStep.jsx';
const STEPSHELL = 'src/components/BuildResume/components/StepShell.jsx';
const BUILDER = 'src/components/BuildResume/BuildResume.jsx';
const ASSISTANT = 'src/components/Candidate/CandidateCareerAssistant.jsx';

test('DIR-091 AC7: HeadingStep carries Auto Fill with AI and an inline-confirm Reset section', async () => {
    const heading = await read(HEADING);

    // Both reference header actions exist.
    assert.match(heading, /Auto Fill with AI/);
    assert.match(heading, /Reset section/);

    // Reset is an inline confirm driven by component state — never a native dialog.
    assert.match(heading, /resetConfirmOpen/);
    assert.match(heading, /const resetPersonalInformation = \(\) => \{/);
    assert.match(heading, /Clear all fields\?/);
    assert.doesNotMatch(heading, /window\.confirm\(/);

    // The section is retitled and labelled as required, per the reference.
    assert.match(heading, /'Personal information'/);
    assert.match(heading, /Personal &amp; contact details/);
    assert.match(heading, /Required \*/);

    // The component default is NOT sufficient: the i18n file OVERRIDES it, so the locale value must
    // match the reference too. This defect was found by the S8 live DOM capture, not by this suite.
    const en = JSON.parse(await read('src/locales/en/en.json'));
    assert.equal(en.HeadingStep?.title, 'Personal information', 'the en locale must render the reference title');
});

test('DIR-091 AC8: StepShell exposes the headerActions slot without regressing the guide rail', async () => {
    const shell = await read(STEPSHELL);

    assert.match(shell, /headerActions = null,/);
    assert.match(shell, /\{headerActions \? \(/);
    // The header must wrap rather than crush the actions at narrow widths.
    assert.match(shell, /flex flex-wrap items-center justify-between/);

    // The guide rail still receives the DERIVED atsSection. The patch's atsResult pass-through was
    // dropped as superseded, so no dead prop may reappear.
    assert.match(shell, /<StepGuide stepPath=\{stepPath\} gaps=\{gaps\} atsSection=\{atsSection\} candidateContext=\{candidateContext\}>/);
    assert.doesNotMatch(shell, /atsSection=\{atsSection\} atsResult=/);
});

test('DIR-091 AC9: the builder renders the four-level breadcrumb and shows Saved from xl', async () => {
    const builder = await read(BUILDER);

    assert.match(builder, /aria-label="Resume builder breadcrumb"/);

    // Exactly the four reference levels, in order.
    // Bound the slice to the nav element so the order check cannot be satisfied by text elsewhere.
    const navStart = builder.indexOf('aria-label="Resume builder breadcrumb"');
    const nav = builder.slice(navStart, builder.indexOf('</nav>', navStart));

    let cursor = -1;
    for (const label of ['Dashboard', 'Resumes &amp; Master CV', 'Build Resume']) {
        const idx = nav.indexOf(label);
        assert.ok(idx > cursor, `the breadcrumb must render "${label}" after the previous level`);
        cursor = idx;
    }

    // Every ancestor segment must be a real LINK back to its route ('/dashboard' x3), not a button.
    assert.equal((nav.match(/<Link to="\/dashboard"/g) || []).length, 3, 'all three ancestor segments must link to /dashboard');
    assert.doesNotMatch(nav, /<button/, 'breadcrumb ancestors must be links, not buttons');

    // The final level is the real resume title / candidate name, marked as the current page.
    assert.match(nav, /aria-current="page"/);
    assert.match(nav, /resumeData\?\.firstname/);

    // The whole breadcrumb must render from the xl breakpoint upward.
    assert.match(builder, /className="hidden xl:flex shrink-0 items-center gap-1 text-\[10px\] font-semibold text-\[var\(--cuba-ink-subtle\)\]"/);

    // The Saved status pill must be visible at the reference viewport (xl), not only 2xl.
    assert.match(builder, /role="status" aria-live="polite" className="hidden xl:flex items-center gap-1\.5 text-\[11px\] font-medium text-\[var\(--cuba-ink-subtle\)\] ml-1 shrink-0"/);
    assert.doesNotMatch(builder, /className="hidden 2xl:flex items-center gap-1\.5 text-\[11px\] font-medium text-\[var\(--cuba-ink-subtle\)\] ml-1 shrink-0"/);
});

test('DIR-091 AC10: the new surfaces are Cuba-tokenised and carry no fabricated metrics', async () => {
    const [assistant, heading] = await Promise.all([read(ASSISTANT), read(HEADING)]);

    const PALETTE = /(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;
    const HEX = /#[0-9a-fA-F]{3,6}\b/;

    // The career assistant is fully tokenised: no palette utilities, no raw hex colours.
    assert.doesNotMatch(assistant, PALETTE, 'CandidateCareerAssistant must use Cuba tokens');
    assert.doesNotMatch(assistant, HEX, 'CandidateCareerAssistant must not use raw hex colours');

    // It reads real platform APIs only, and never renders a fabricated zero.
    assert.match(assistant, /getActiveJobs/);
    assert.match(assistant, /getTrackedJobs/);
    assert.doesNotMatch(assistant, /\?\? 0/);
    assert.match(assistant, /jdMatch\?\.score == null \? '—'/);

    // The new HeadingStep header actions are token-based.
    assert.match(heading, /border-\[var\(--cuba-primary-line\)\]/);
    assert.match(heading, /bg-\[var\(--cuba-primary-soft\)\]/);
    assert.match(heading, /text-\[var\(--cuba-warning\)\]/);
});

test('DIR-091 AC11: the metric row renders an explicit placeholder, never a fabricated zero', async () => {
    const cards = await read('src/components/Candidate/CubaMetricCardRow.jsx');

    // Every numeric card defaults to null (unknown) rather than to 0.
    assert.match(cards, /count = null, bestScore = null, applications = null/);

    // An unresolved applications read renders the placeholder, not a zero.
    assert.match(cards, /applications === null \? '--' : String\(applications\)/);

    // No numeric card may be handed a literal zero.
    assert.doesNotMatch(cards, /value="0"/);
    assert.doesNotMatch(cards, /value=\{0\}/);

    // The Interview Coach card is a capability label ("Ready"), NOT a measured metric, so it must
    // not be presented as a count. Its value stays the reference's own string.
    assert.match(cards, /label="Interview Coach"/);
    assert.match(cards, /value="Ready"/);
});


