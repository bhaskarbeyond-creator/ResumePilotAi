// DIR-092 — Candidate Hero and Metric Cards Executive Enhancement.
//
// Scope: src/components/Candidate/CopilotHeroHud.jsx and
// src/components/Candidate/CubaMetricCardRow.jsx only.
//
// AC1 the greeting is never truncated; AC2 the quote never squeezes the greeting; AC3 the
// Avg. ATS Score card carries a bold headline value beside the real donut; AC4 Cuba glass
// polish with tokens only; AC5 the invariants (testids, honesty, frozen templates) hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');

const HUD = 'src/components/Candidate/CopilotHeroHud.jsx';
const CARDS = 'src/components/Candidate/CubaMetricCardRow.jsx';

test('DIR-092 AC1: the greeting is never truncated and stays fully visible', async () => {
    const hud = await read(HUD);

    // The clipping class is gone and the layout gives the greeting its own row on tight viewports.
    assert.doesNotMatch(hud, /<h1 className="truncate/, 'the greeting must not clip');
    assert.match(hud, /<h1 className="text-base font-bold/);
    assert.match(hud, /data-testid="cuba-welcome-greeting"/);

    // The greeting column can wrap instead of ellipsizing, and takes a full row below xl.
    assert.match(hud, /min-w-\[15rem\] flex-1 basis-full xl:basis-auto/);

    // The real name and the local clock still drive the greeting.
    assert.match(hud, /const greetingFor = \(date = new Date\(\)\) => \{/);
    assert.match(hud, /const firstName = String\(displayName \|\| 'Candidate'\)/);
});

test('DIR-092 AC2: the quote never squeezes the greeting and the CTAs stay unsquished', async () => {
    const hud = await read(HUD);

    // The quote and the CTA group are stacked, right-aligned; the CTA group stays flex-none.
    assert.match(hud, /Better resumes\. Brighter opportunities\./);
    assert.match(hud, /ml-auto flex max-w-full flex-none flex-col items-end gap-1\.5/);

    // The three reference CTAs and their real destinations survive untouched.
    assert.match(hud, /label: 'Create Resume'/);
    assert.match(hud, /label: 'Explore Jobs'/);
    assert.match(hud, /label: 'Mock Interview'/);
    assert.match(hud, /data-testid=\{`cuba-copilot-cta-\$\{id\}`\}/);

    // DIR-092b: the primary CTA is a SINGLE button — no chevron dropdown may survive.
    assert.doesNotMatch(hud, /cuba-copilot-create-toggle|CREATE_MENU|FiChevronDown|aria-haspopup="menu"/);
});

test('DIR-092 AC3: the Avg. ATS Score card carries a bold value beside the real donut', async () => {
    const cards = await read(CARDS);

    // The bold headline value is rendered for EVERY card, so the ATS score matches the hierarchy.
    assert.match(cards, /<span className="block text-lg font-bold leading-tight text-cuba-ink">\{value\}<\/span>/);

    // The real SVG donut is preserved (shape + geometry), and the reference 69% is NOT hardcoded.
    assert.match(cards, /const AtsDonut = \(\{ score \}\) => \{/);
    assert.match(cards, /<AtsDonut score=\{dash \? null : bestScore\} \/>/);
    const code = cards.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b69\b/, 'the reference percentage must not be hardcoded');

    // The tiny centred donut label is retired (the bold value now owns the number).
    assert.doesNotMatch(cards, /absolute text-\[11px\] font-bold text-cuba-ink/);
});

test('DIR-092 AC4: both surfaces use Cuba glass tokens only — no raw palette or hex', async () => {
    const [hud, cards] = await Promise.all([read(HUD), read(CARDS)]);
    const PALETTE = /(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;
    const HEX = /#[0-9a-fA-F]{3,6}\b/;

    for (const [name, src] of [[HUD, hud], [CARDS, cards]]) {
        assert.doesNotMatch(src, PALETTE, `${name} must use Cuba tokens`);
        assert.doesNotMatch(src, HEX, `${name} must not use raw hex colours`);
    }

    // Executive elevation + hover micro-interactions on both surfaces.
    assert.match(hud, /shadow-cuba-sm/);
    assert.match(hud, /hover:shadow-cuba-md/);
    assert.match(hud, /ease-cuba/);
    assert.match(cards, /shadow-cuba-sm/);
    assert.match(cards, /hover:shadow-cuba-md/);
    assert.match(cards, /hover:-translate-y-0\.5/);
    assert.match(cards, /ease-cuba/);
});

test('DIR-092 AC5: the invariants hold — testids preserved, honesty kept, frozen templates clean', async () => {
    const [hud, cards] = await Promise.all([read(HUD), read(CARDS)]);

    // Every certified data-testid survives.
    for (const id of ['cuba-copilot-hud', 'cuba-welcome-greeting', 'cuba-copilot-insight']) {
        assert.ok(hud.includes(`data-testid="${id}"`), `the HUD must keep ${id}`);
    }
    for (const id of ['cuba-metric-cards', 'cuba-metric-resumes', 'cuba-metric-ats', 'cuba-metric-applications', 'cuba-metric-coach']) {
        assert.ok(cards.includes(id), `the metric row must keep ${id}`);
    }

    // Honesty: an unresolved read is still an explicit placeholder, never a fabricated zero.
    assert.match(cards, /applications === null \? '--' : String\(applications\)/);
    assert.doesNotMatch(cards, /value=\{0\}|value="0"/);

    // The suite is registered.
    const pkg = JSON.parse(await read('package.json'));
    assert.ok(pkg.scripts['test:dir092-hero'], 'test:dir092-hero must be registered');

    // No directive in this session may touch the frozen template set.
    const changed = execSync('git status --porcelain src/cv-templates', { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(changed, '', 'src/cv-templates must have a zero diff');
});

test('DIR-092c: the resume workspace is a 4-column shell — a 3-column horizontal slider + an always-on Create column', async () => {
    const home = await read('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');

    // The workspace shell is a fixed 4-column grid in Cuba grid mode (no multi-row wrapping).
    assert.match(home, /"grid grid-cols-1 lg:grid-cols-4 gap-3\.5"/);

    // The resumes live in a SINGLE-ROW horizontal slider that spans 3 of the 4 columns.
    assert.match(home, /lg:col-span-3 min-w-0/);
    assert.match(home, /grid grid-flow-col auto-cols-\[85%\] sm:auto-cols-\[48%\] lg:auto-cols-\[32%\] gap-3\.5 overflow-x-auto snap-x snap-mandatory cuba-scrollbar pb-2/);

    // The 4th column is ALWAYS the Create a New Resume card.
    assert.match(home, /lg:col-span-1 min-w-0/);
    assert.match(home, /Create a New Resume/);

    // Resume cards snap to the slider and never wrap into multiple grid rows.
    assert.match(home, /group snap-start bg-white/);

    // list/legacy modes stay byte-identical via `display: contents` wrappers.
    assert.match(home, /: "contents"\}/);
});
