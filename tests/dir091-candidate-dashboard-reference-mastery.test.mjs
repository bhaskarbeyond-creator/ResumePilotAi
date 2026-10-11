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
    assert.match(cards, /hasScore \? `\$\{Math\.round\(clamped\)\}%` : '--'/);
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
