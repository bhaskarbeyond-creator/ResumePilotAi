import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-078 — Super Admin branding ingestion + top-whitespace elimination.
 *
 * Pins the branding read (with bundled fallback), the authentic logo <img>
 * rendering in the header/sidebar/drawer, the removal of the hardcoded star
 * placeholder, and the tightened top padding.
 */

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const CAND_SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const DIR048 = 'tests/dir048-shell-and-controls.test.mjs';
const DIR077 = 'tests/dir077-candidate-dashboard-overhaul.test.mjs';
const read = (p) => fs.readFile(p, 'utf8');

test('AC1: branding is ingested from getSystemSettings with a bundled fallback', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /import \{ getSystemSettings \} from '\.\.\/\.\.\/services\/api\/platform'/);
    assert.match(shell, /import bundledLogo from '\.\.\/\.\.\/assets\/logo\/logo\.png'/);
    assert.match(shell, /getSystemSettings\(\)/);
    assert.match(shell, /settings\?\.branding/);
    // Dark -> darkLogoUrl, else logoUrl, else the bundled asset.
    assert.match(shell, /if \(theme === 'dark' && branding\.darkLogoUrl\) return branding\.darkLogoUrl;/);
    assert.match(shell, /if \(branding\.logoUrl\) return branding\.logoUrl;/);
    assert.match(shell, /return bundledLogo;/);
    // The brand name falls back to IME365.
    assert.match(shell, /const brandName = branding\.brandName \|\| 'IME365';/);
});

test('AC2: a real <img> with alt text renders in the header, sidebar and drawer', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /data-testid="cuba-header-brand"/);
    assert.match(shell, /data-testid="cuba-sidebar-brand-mark"/);
    assert.match(shell, /data-testid="cuba-drawer-brand"/);
    assert.match(shell, /data-testid="cuba-mobile-drawer"/);
    // The mandated logo class string (DIR-079 supersedes the DIR-078 sizing).
    assert.match(shell, /className="h-10 md:h-11 w-auto max-w-\[185px\] object-contain shrink-0"/);
    // alt text bound to the brand name, plus graceful onError degradation.
    const altMatches = shell.match(/alt=\{brandName\}/g) || [];
    assert.ok(altMatches.length >= 3, `expected alt text on the header, sidebar and drawer logos, found ${altMatches.length}`);
    const onErrors = shell.match(/onError=\{\(\) => setLogoFailed\(true\)\}/g) || [];
    assert.ok(onErrors.length >= 3, 'every logo image must degrade gracefully');
});

test('AC3: zero hardcoded star placeholder boxes remain', async () => {
    const shell = await read(SHELL);
    assert.doesNotMatch(shell, /\u2726/);
    assert.doesNotMatch(shell, /IME365 AI/);
    assert.doesNotMatch(shell, /Executive Suite/);
    assert.doesNotMatch(shell, /IME365 Career Suite/);
});

test('AC4: the top padding is tightened on the container, breadcrumbs and shell', async () => {
    const [shell, cand] = await Promise.all([read(SHELL), read(CAND_SHELL)]);
    assert.match(shell, /max-w-\[1680px\] px-4 pt-2\.5 pb-24 sm:px-6 md:pt-3 md:pb-6 lg:px-8/);
    assert.match(shell, /mb-2\.5 hidden min-w-0 md:block" data-testid="cuba-main-breadcrumbs"/);
    assert.match(cand, /className="space-y-4 md:space-y-5"/);
    assert.doesNotMatch(shell, /px-4 py-6 pb-24/);
});

test('AC5: the dir048 and dir077 assertions track the tightened padding', async () => {
    const [dir048, dir077] = await Promise.all([read(DIR048), read(DIR077)]);
    // The pinned suites assert the escaped regex form (`pt-2\.5`).
    assert.ok(dir048.includes('px-4 pt-2\\.5 pb-24'), 'dir048 must assert the tightened cap');
    assert.ok(dir077.includes('px-4 pt-2\\.5 pb-24'), 'dir077 must assert the tightened cap');
});
