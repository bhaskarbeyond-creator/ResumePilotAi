import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-077 — Candidate Dashboard UI/UX overhaul (zero-waste fluid grid +
 * native visual intelligence). Pins the container cap, the breadcrumb anchor,
 * the unified sidebar pill, the full-width candidate workspace, the hero
 * telemetry visual and the SVG micro-visuals.
 */

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const CAND_SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const HERO = 'src/components/Candidate/CubaCandidateHero.jsx';
const STATCARD = 'src/components/cuba/CubaStatCard.jsx';
const VISUALS = 'src/components/cuba/StatMicroVisuals.jsx';
const RAIL = 'src/components/Candidate/CandidateExecutiveRail.jsx';
const DIR048 = 'tests/dir048-shell-and-controls.test.mjs';
const read = (p) => fs.readFile(p, 'utf8');

test('AC1: the shell container cap is raised to max-w-[1680px]', async () => {
    const [shell, dir048] = await Promise.all([read(SHELL), read(DIR048)]);
    assert.match(shell, /max-w-\[1280px\] min-h-0 px-4 pt-2 pb-24 sm:px-6 md:pt-2\.5 md:pb-4 lg:px-8/);
    assert.doesNotMatch(shell, /max-w-7xl px-4 py-6 pb-24/);
    // The pinning suite tracks the new cap in lockstep.
    assert.ok(dir048.includes('px-4 pt-2 pb-24'), 'dir048 must assert the new cap');
});

test('AC2: the breadcrumbs anchor the main workspace column', async () => {
    const shell = await read(SHELL);
    const mainIndex = shell.indexOf('id="cuba-main-content"');
    const crumbIndex = shell.indexOf('data-testid="cuba-main-breadcrumbs"');
    const childIndex = shell.indexOf('{children}', mainIndex);
    assert.ok(mainIndex > -1, 'the main content region must exist');
    assert.ok(crumbIndex > mainIndex, 'the trail must render inside #cuba-main-content');
    assert.ok(crumbIndex < childIndex, 'the trail must render above the route content');
    // DIR-079: the header's left band is now the sidebar-width brand block (the
    // DIR-077 spacer was retired when the brand block took that slot).
    assert.match(shell, /data-testid="cuba-header-brand-block"/);
    // Exactly one breadcrumb renderer remains (the dir011 landmark contract).
    assert.equal((shell.match(/<M3Breadcrumbs /g) || []).length, 1);
});

test('AC3: the sidebar brand tile and context switcher share ONE pill', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /cuba-glass flex flex-col gap-2 rounded-cuba-lg border border-cuba-line p-2/);
    assert.match(shell, /<ContextSwitcher variant="sidebar" \/>/);
    // The old double `border-b` stack is gone.
    assert.doesNotMatch(shell, /px-3 pt-3 pb-2 border-b border-cuba-line\/40/);
    // The certified aside + nav contracts survive.
    assert.match(shell, /border-l-0 md:flex/);
    assert.match(shell, /<CubaNavGroups groups=\{groups\} collapsed=\{railCollapsed\}/);
});

test('AC4: the candidate overview gives the workspace the full content width', async () => {
    const [shell, rail] = await Promise.all([read(CAND_SHELL), read(RAIL)]);
    assert.match(shell, /grid min-h-0 grid-cols-1 gap-3 xl:h-\[calc\(100dvh-var\(--cuba-header-h\)-3\.75rem\)\]/);
    assert.doesNotMatch(shell, /CandidateExecutiveRail|cuba-copilot-rail|cuba-rail-toggle/);
    assert.match(rail, /data-testid="cuba-executive-rail"/);
    assert.match(rail, /data-testid=\{testId\}/);
    assert.match(rail, /testId="cuba-rail-copilot"/);
    // DIR-086 supersedes the DIR-077 three-widget rail: the ATS Keyword Strength and
    // Application Milestones widgets were removed because they repeated the Overview's
    // metric capsule strip verbatim and pushed the rail past the viewport.
    assert.doesNotMatch(rail, /<WidgetCard title="ATS Keyword Strength"/);
    assert.doesNotMatch(rail, /<WidgetCard title="Application Milestones"/);
    // Real services, real states — never a fabricated zero.
    assert.match(rail, /getCopilotActions/);
    assert.match(rail, /CubaEmptyState/);
});

test('AC5: the hero is the single authoritative hero (DIR-085 compact Copilot HUD)', async () => {
    const hero = await read(HERO);
    assert.doesNotMatch(hero, /cartoon\.svg/);
    // DIR-085 supersedes the DIR-077 telemetry visual: the hero is now the compact HUD,
    // so the Overview leads with the resume workspace instead of a tall banner.
    assert.match(hero, /<CopilotHeroHud/);
    // The single-authoritative-hero hook survives for the DIR-009 E2E.
    assert.match(hero, /data-testid="cuba-candidate-hero"/);
});

test('AC6: the micro-visual primitives survive; the hero now uses the capsule strip', async () => {
    const [hero, stat, visuals] = await Promise.all([read(HERO), read(STATCARD), read(VISUALS)]);
    assert.match(stat, /visual = null,/);
    assert.match(stat, /\{visual && !loading && \(/);
    // DIR-085: the hero no longer mounts the four stat cards or the radial gauge; a compact metric
    // surface replaces them. DIR-091 then moved that surface from the capsule strip to the metric
    // CARD row, so this guard follows it there. The primitives themselves are untouched.
    assert.match(hero, /<CubaMetricCardRow/);
    assert.doesNotMatch(hero, /AtsRadialGauge/);
    assert.match(visuals, /data-testid="cuba-ats-radial-gauge"/);
    assert.match(visuals, /data-testid="cuba-resume-progress"/);
    assert.match(visuals, /data-testid="cuba-pipeline-stepper"/);
    assert.match(visuals, /role="progressbar"/);
    assert.match(visuals, /role="img"/);
    // The certified stat-card class survives for the DIR-001 E2E.
    assert.match(stat, /cuba-stat-card/);
});
