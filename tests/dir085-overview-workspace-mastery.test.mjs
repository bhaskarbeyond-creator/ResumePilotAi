import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-085 — Candidate Overview unified command centre.
 *
 * The Overview previously spent ~500px on a tall gradient banner plus four full-height
 * stat cards that duplicated the right rail, pushing the candidate's own resumes into a
 * cut-off bottom sliver. This suite asserts the compact HUD, the capsule strip, the
 * above-the-fold workspace, the de-duplication rule and the accessibility contract.
 */

const read = (p) => fs.readFile(p, 'utf8');

const HERO = 'src/components/Candidate/CubaCandidateHero.jsx';
const HUD = 'src/components/Candidate/CopilotHeroHud.jsx';
const MASCOT = 'src/components/cuba/CubaCopilotMascot.jsx';
const CAPSULE = 'src/components/cuba/CubaMetricCapsule.jsx';
const SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const RAIL = 'src/components/Candidate/CandidateExecutiveRail.jsx';

test('AC1: the compact HUD and capsule strip exist and the heavy hero pieces are gone', async () => {
    const [hero, hud, capsule] = await Promise.all([read(HERO), read(HUD), read(CAPSULE)]);

    // The new compact surface is present.
    assert.match(hero, /import CopilotHeroHud from '\.\/CopilotHeroHud'/);
    // DIR-091 supersedes the DIR-085 capsule strip: the authoritative reference restores a
    // high-density METRIC CARD row as the headline surface, now carrying a real ATS donut. The
    // intent of these assertions is unchanged — the hero must expose a real metric surface bound
    // to the platform's own reads — so they are retargeted rather than deleted.
    assert.match(hero, /import CubaMetricCardRow from '\.\/CubaMetricCardRow'/);
    assert.match(hero, /<CubaMetricCardRow/);
    assert.match(hero, /bestScore=\{bestScore\}/);
    assert.match(hero, /applications=\{applications\}/);

    // The four full-height stat cards and the cold radial gauge are retired.
    assert.doesNotMatch(hero, /import CubaStatCard/);
    assert.doesNotMatch(hero, /AtsRadialGauge|ResumeProgressBar|PipelineStepper/);
    assert.doesNotMatch(hero, /<CubaStatCard/);
    assert.doesNotMatch(hero, /Average ATS Score|Active Resumes/);

    // The HUD is one horizontal row, not a tall banner.
    assert.match(hud, /data-testid="cuba-copilot-hud"/);
    assert.match(hud, /cuba-glass flex flex-wrap items-center gap-3 rounded-cuba-lg border border-cuba-line px-3 py-2\.5/);
    assert.match(hud, /data-testid="cuba-copilot-insight"/);
    assert.match(hud, /data-testid=\{`cuba-copilot-cta-\$\{id\}`\}/);
    for (const cta of ['new-resume', 'explore-jobs', 'mock-drill']) {
        assert.ok(hud.includes(`id: '${cta}'`), `the HUD must expose the ${cta} CTA`);
    }

    // The capsule strip is a compact labelled list with real-value slots.
    assert.match(capsule, /data-testid="cuba-metric-capsules"/);
    assert.match(capsule, /data-testid="cuba-metric-capsule"/);
    assert.match(capsule, /export const CubaMetricCapsule = \(/);
    assert.match(capsule, /export const CubaMetricCapsuleStrip = \(/);
    assert.match(capsule, /aria-label=\{label\}/);
});

test('AC2: the workspace leads the main column and the briefing lives in the rail', async () => {
    const shell = await read(SHELL);
    const heroIdx = shell.indexOf('<CubaCandidateHero displayName={displayName} onNavigate={navigate} />');
    const childrenIdx = shell.indexOf('{children}');
    const asideIdx = shell.indexOf('aria-label="Executive intelligence rail"');
    const briefingIdx = shell.indexOf('<AiCareerBriefing />');

    assert.ok(heroIdx > -1, 'the compact hero must render');
    assert.ok(childrenIdx > heroIdx, 'the resume workspace must follow the compact hero in the main column');
    assert.ok(asideIdx > -1 && briefingIdx > asideIdx, 'the AI Career Briefing must live inside the right rail aside');
    // The briefing no longer sits in the main column ahead of the workspace.
    const mainColumnEnd = shell.indexOf('</div>', childrenIdx);
    assert.ok(mainColumnEnd > -1, 'the main column must close after the workspace region');

test('AC3: the de-duplication rule holds — no headline metric is printed twice', async () => {
    const [hero, rail] = await Promise.all([read(HERO), read(RAIL)]);
    // DIR-091 supersedes the DIR-085 capsule strip as the sole headline surface: the reference
    // mandates a metric CARD row. The hero still renders no CubaStatCard, so that guard stands.
    assert.doesNotMatch(hero, /<CubaStatCard/);
    assert.match(hero, /<CubaMetricCardRow/);
    // DIR-086 supersedes the DIR-085 two-widget rail: the ATS Keyword Strength and
    // Application Milestones widgets were removed because they duplicated the capsule
    // strip, so the rail now holds ONLY the Live Copilot Quick-Pitch and fits the viewport.
    assert.doesNotMatch(rail, /<WidgetCard title="ATS Keyword Strength"/);
    assert.doesNotMatch(rail, /<WidgetCard title="Application Milestones"/);
    assert.match(rail, /title="Live Copilot Quick-Pitch"/);
    // DIR-091: the headline labels moved into the metric card row, so the assertion follows them
    // there rather than being dropped. The intent is unchanged: four real headline metrics exist.
    const cardRow = await read('src/components/Candidate/CubaMetricCardRow.jsx');
    for (const label of ['Total Resumes', 'Avg. ATS Score', 'Job Applications', 'Interview Coach']) {
        assert.ok(cardRow.includes(`label="${label}"`), `the metric card row must own the ${label} headline`);
    }
});

test('AC4: zero whole-window scroll — the DIR-084 lock and the bounded Overview survive', async () => {
    const shell = await read(SHELL);
    // The Overview grid is still bounded to one viewport at 2xl.
    assert.match(shell, /2xl:h-\[calc\(100dvh-var\(--cuba-header-h\)-3\.75rem\)\]/);
    // The workspace region still owns its own scroll with a stable gutter.
    assert.match(shell, /min-h-0 flex-1 2xl:overflow-y-auto cuba-scrollbar \[scrollbar-gutter:stable\]/);
    // The shell-level lock from DIR-084 is untouched.
    const appShell = await read('src/components/cuba/CubaAppShell.jsx');
    assert.match(appShell, /viewportLock \? 'h-\[100dvh\] min-h-0 overflow-hidden' : 'min-h-screen'/);
});

test('AC5: the new surfaces stay accessible', async () => {
    const [hud, mascot, capsule] = await Promise.all([read(HUD), read(MASCOT), read(CAPSULE)]);
    // The mascot is decoration with a real accessible name, and its glyph is hidden so a
    // screen reader announces ONE label rather than the individual shapes.
    assert.match(mascot, /role="img"/);
    assert.match(mascot, /aria-label=\{label\}/);
    assert.match(mascot, /aria-hidden="true"/);
    // The pulse respects prefers-reduced-motion.
    assert.match(mascot, /motion-reduce:animate-none/);
    // The status pill is real text, and every CTA keeps an accessible name.
    assert.match(hud, /PilotAI Copilot Active/);
    assert.match(hud, /aria-label="AI Copilot"/);
    assert.match(hud, /cuba-focusable/);
    // The capsule strip is a labelled list.
    assert.match(capsule, /<ul/);
    assert.match(capsule, /aria-label=\{label\}/);
    assert.match(capsule, /aria-hidden="true"/);
    // The page still exposes exactly one h1 even though the tall banner is gone.
    const hero = await read(HERO);
    assert.match(hero, /<h1 className="sr-only">/);
});

test('AC6: no new dependency, no new binary asset and no fabricated telemetry', async () => {
    const allow = new Set(['react', 'react-icons/fi']);
    for (const file of [HUD, MASCOT, CAPSULE]) {
        const source = await read(file);
        for (const [, spec] of source.matchAll(/from '([^']+)'/g)) {
            const ok = allow.has(spec) || spec.startsWith('.');
            assert.ok(ok, `${file} imports ${spec}, which is outside the allowlist`);
        }
    }
    // The mascot is INLINE SVG: it must not pull a binary asset in.
    const mascot = await read(MASCOT);
    assert.match(mascot, /<svg/);
    assert.doesNotMatch(mascot, /from '\.\.\/\.\.\/assets\//, 'the mascot must not import a binary asset');

    // Honesty: an unresolved read renders an explicit placeholder, never a fake zero. DIR-091
    // moved this contract into the metric card row, so the assertion follows it there.
    const cardRow = await read('src/components/Candidate/CubaMetricCardRow.jsx');
    assert.match(cardRow, /count === null \? '--' : String\(count\)/);
    assert.match(cardRow, /applications === null \? '--' : String\(applications\)/);
    const hero = await read(HERO);
    // The insight line is derived from real values and is omitted when unknown.
    assert.match(hero, /const insight = loading\s*\?\s*''/);
    assert.doesNotMatch(hero, /mockTelemetry|fakeMetric|sampleData/i);
});

    assert.ok(!(briefingIdx < childrenIdx), 'the briefing must not precede the workspace in the main column');
});
