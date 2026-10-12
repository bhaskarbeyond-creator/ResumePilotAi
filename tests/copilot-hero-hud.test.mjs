import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-097 — CopilotHeroHud unit coverage.
 *
 * The component had NO dedicated test, so the DIRECTOR's "failing CopilotHeroHud unit
 * test" premise could not be verified. This suite pins the certified contract that the
 * DIR-085/086/092/093 directives established, so the component can never silently
 * regress its testids, its accessible name, its truthful greeting, or its CTA routes.
 *
 * It is a source-contract test (the repository's convention for component guards): the
 * .jsx module cannot be imported by node:test, so the contract is asserted against the
 * source, exactly as tests/dir095-candidate-dashboard-data-lineage.test.mjs does.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = 'src/components/Candidate/CopilotHeroHud.jsx';
const ROUTER = 'src/main.jsx';

const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');

test('AC1: the DIR-085/093 certified contract is preserved verbatim', async () => {
    const src = await read(SRC);
    assert.match(src, /data-testid="cuba-copilot-hud"/);
    assert.match(src, /aria-label="AI Copilot"/);
    assert.match(src, /data-testid="cuba-copilot-insight"/);
    assert.match(src, /data-testid=\{`cuba-copilot-cta-\$\{id\}`\}/);
});

test('AC2: the greeting is pure and clock-derived, never a placeholder persona', async () => {
    const src = await read(SRC);
    assert.match(src, /const greetingFor = \(date = new Date\(\)\)/);
    assert.match(src, /hour < 12.*Good morning/s);
    assert.match(src, /hour < 18.*Good afternoon/s);
    assert.match(src, /Good evening/);
    // The name is the real authenticated first name, not a hardcoded persona.
    assert.match(src, /displayName = 'Candidate'/);
    assert.doesNotMatch(src, /\bBabu\b/);
});

test('AC3: every CTA keeps cuba-focusable and targets a mounted route', async () => {
    const src = await read(SRC);
    assert.match(src, /cuba-focusable/);
    const router = await read(ROUTER);
    for (const to of ['/build-resume/heading', '/dashboard/jobs', '/dashboard/interview']) {
        assert.ok(src.includes(to), `CTA destination ${to} must be declared in the component`);
        // The destination must be reachable through a wildcard/mounted route.
        const seg = to.split('/')[1];
        assert.ok(router.includes(`/${seg}/*`) || router.includes(`path="${to}"`),
            `destination ${to} must resolve to a mounted route in src/main.jsx`);
    }
});

test('AC4: the insight line is truthful (omitted copy falls back, never invented)', async () => {
    const src = await read(SRC);
    // The insight renders the caller's real briefing, with an honest fallback only.
    assert.match(src, /\{insight \|\| 'Copilot active'\}/);
    assert.doesNotMatch(src, /\b69\b/); // no reference-screenshot decorative numbers
});
