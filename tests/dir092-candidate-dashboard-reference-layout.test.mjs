// DIR-092 — Candidate Workspace reference layout transformation.
//
// DIR-092 re-issued DIR-091's deferred S2-S6 as seven areas. This suite pins the areas that are
// DELIVERED and asserts the honesty contract that governs the rest. It deliberately does NOT
// claim the undelivered areas are complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const CARD = 'src/components/cuba/CubaUpgradeCard.jsx';

test('DIR-092 AC1 (area 7): the sidebar "Upgrade to Pro" promo card exists and is wired in', async () => {
    const [shell, card] = await Promise.all([read(SHELL), read(CARD)]);

    // The reference anchors the promo at the FOOT of the left sidebar.
    assert.match(shell, /import CubaUpgradeCard from '\.\/CubaUpgradeCard'/);
    assert.match(shell, /<CubaUpgradeCard/);
    assert.match(card, /data-testid="cuba-upgrade-card"/);

    // It must sit AFTER the nav list, so it does not steal scroll from CubaNavGroups.
    const navIdx = shell.indexOf('<CubaNavGroups groups={groups} collapsed={railCollapsed}');
    const promoIdx = shell.indexOf('<CubaUpgradeCard');
    assert.ok(navIdx > -1 && promoIdx > navIdx, 'the promo card must render below the nav groups');
});

test('DIR-092 AC2 (area 7): the promo copy and CTA match the reference, with a real route', async () => {
    const card = await read(CARD);

    assert.match(card, /Upgrade to Pro/);
    assert.match(card, /Unlock advanced AI tools/);
    assert.match(card, /Upgrade Now/);
    assert.match(card, /bg-cuba-primary-fill/);
    // The arrow affordance the reference shows next to the CTA.
    assert.match(card, /FiArrowRight/);
    // A real plan route, not a dead button.
    assert.match(card, /planHref = '\/dashboard\/plans'/);
    assert.match(card, /data-testid="cuba-upgrade-cta"/);
});

test('DIR-092 AC3 (area 7): the card invents no account data and adapts to a real Pro state', async () => {
    const card = await read(CARD);

    // The one real input is the user's plan; when they are already Pro it does not upsell them.
    assert.match(card, /isPro = false/);
    assert.match(card, /isPro \? 'You are on Pro' : 'Upgrade to Pro'/);
    assert.match(card, /isPro\s*$|isPro \? 'Manage plan' : 'Upgrade Now'/m);

    // Zero fabricated telemetry on a promo card: no counts, no percentages, no prices.
    const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\$\d/, 'no hardcoded price');
    assert.doesNotMatch(code, /\b\d+%/, 'no invented percentage');
});

test('DIR-092 AC4 (area 7): the collapsed rail degrades gracefully and stays accessible', async () => {
    const card = await read(CARD);

    // The 72px collapsed rail has no room for copy, so it renders an icon-only affordance.
    assert.match(card, /if \(collapsed\) \{/);
    assert.match(card, /data-testid="cuba-upgrade-card-collapsed"/);
    // Icon-only means it MUST carry an accessible name and a tooltip.
    assert.match(card, /aria-label=\{isPro \? 'Your Pro plan' : 'Upgrade to Pro'\}/);
    assert.match(card, /title=\{isPro \? 'Your Pro plan' : 'Upgrade to Pro'\}/);
});

test('DIR-092 AC5 (area 7): Cuba design tokens only — no raw palette utilities or hex', async () => {
    const card = await read(CARD);

    assert.match(card, /border-cuba-line/);
    assert.match(card, /bg-cuba-primary/);
    assert.match(card, /text-cuba-ink-muted/);
    assert.match(card, /rounded-cuba-lg/);
    // The reference gradient is built from Cuba soft tokens, not literal hex.
    assert.match(card, /var\(--cuba-primary-soft\)/);

    assert.doesNotMatch(card, /#[0-9a-fA-F]{3,6}/, 'no hardcoded hex colours');
    assert.doesNotMatch(card, /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|green|blue|amber|yellow|indigo|purple|pink)-\d{2,3}\b/, 'no raw palette utilities');
});

test('DIR-092 AC6: the DIR-091 metric card baseline survives and the invariants hold', async () => {
    const pkg = JSON.parse(await read('package.json'));
    assert.ok(pkg.scripts['test:dir092'], 'test:dir092 must be registered');

    // DIR-091's deliverable must not be regressed by this directive.
    const hero = await read('src/components/Candidate/CubaCandidateHero.jsx');
    assert.match(hero, /<CubaMetricCardRow/);

    // No directive in this session may touch the frozen template set.
    const { execSync } = await import('node:child_process');
    const changed = execSync('git status --porcelain src/cv-templates', { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(changed, '', 'src/cv-templates must have a zero diff');
});
