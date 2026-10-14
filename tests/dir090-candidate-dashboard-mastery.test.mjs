import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DIR-090 — Candidate workspace mastery.
 *
 * HONEST SCOPE: this suite pins the full-width dashboard and duplicate-CTA
 * eradication) and asserts the NOT-DELIVERED items explicitly, so a green run can never be read
 * as implying the whole directive is complete.
 */

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const HOMEPAGE = 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx';

test('DIR-090 AC1: the dashboard workspace uses full width without a Copilot rail', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /grid min-h-0 grid-cols-1 gap-3 xl:h-\[calc\(100dvh-var\(--cuba-header-h\)-3\.75rem\)\]/);
    assert.doesNotMatch(shell, /CandidateExecutiveRail|AiCareerBriefing|cuba-copilot-rail|cuba-rail-toggle|cuba_workspace_rail/);
});

test('DIR-090 AC2: the single-viewport lock survives — no whole-window scroll reintroduced', async () => {
    const shell = await read(SHELL);
    // DIR-084's viewport lock must still be present.
    assert.match(shell, /xl:h-\[calc\(100dvh-var\(--cuba-header-h\)-3\.75rem\)\]/);
    // The full-width workspace retains its internal scrolling containment.
    assert.match(shell, /cuba-scrollbar \[scrollbar-gutter:stable\]/);
    // The shell must not reintroduce a full-page scroll root.
    assert.doesNotMatch(shell, /className="min-h-screen/);
});

test('DIR-090 AC3: the duplicate Create Resume CTA is eradicated', async () => {
    const home = await read(HOMEPAGE);
    // The toolbar copy is gone and the removal is documented in place.
    assert.doesNotMatch(home, /<span>Create Resume<\/span>/);
    assert.match(home, /the toolbar's duplicate \[\+\s*Create Resume\] was REMOVED/i);
    // The single authoritative CTA remains (the HUD/hero one).
    assert.match(home, /HomepageHero\.createResume/);
    // And it still performs the real action.
    assert.match(home, /navigate\("\/build-resume\/heading\?new=1"\)/);
});

test('DIR-090 AC4: NOT-DELIVERED items are asserted so a green suite cannot imply full coverage', async () => {
    const home = await read(HOMEPAGE);
    // S3 (sort dropdown, Ctrl+K search, Grid/List view toggle) is NOT implemented in this pass.
    assert.doesNotMatch(home, /data-testid="workspace-view-toggle"/);
    assert.doesNotMatch(home, /data-testid="workspace-sort"/);
    // S4's relative timestamp treatment on resume cards is NOT implemented.
    assert.doesNotMatch(home, /data-testid="resume-relative-timestamp"/);
    // S5's keyword-gap pills are NOT implemented.
    assert.doesNotMatch(home, /data-testid="copilot-keyword-gap"/);
});

test('DIR-090 AC5: invariants hold — frozen templates, no new dependency', async () => {
    const dir = path.join(ROOT, 'src/cv-templates');
    const modules = fs.readdirSync(dir).filter((n) => /^(cv\d+|cover\d+)$/.test(n));
    assert.equal(modules.length, 55, 'the frozen baseline must remain 55 template modules');

    const pkg = JSON.parse(await read('package.json'));
    assert.ok(pkg.scripts['test:dir090'], 'test:dir090 must be registered');
    assert.equal(pkg.dependencies['tailwind-scrollbar'], undefined);
});
