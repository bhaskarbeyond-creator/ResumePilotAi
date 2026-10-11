import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-080 — enlarge the brand logo across every chrome surface (header band,
 * compact rail marks, mobile drawer) for high-impact visual presence.
 */

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const read = (p) => fs.readFile(p, 'utf8');

test('AC1: the expanded header logo is enlarged to the mandated DIR-080 sizing', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /data-testid="cuba-header-brand"/);
    assert.match(shell, /className="h-12 md:h-\[50px\] w-auto max-w-\[200px\] object-contain shrink-0"/);
    // The superseded DIR-079 sizing is gone.
    assert.doesNotMatch(shell, /max-w-\[185px\]/);
    assert.doesNotMatch(shell, /h-10 md:h-11 w-auto/);
});

test('AC2: the brand block padding frees width for the logo inside the 260px band', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /'w-\[var\(--cuba-sidebar-w\)\] justify-between pl-3 pr-2 sm:pl-3\.5 sm:pr-2\.5'/);
    // The compact branch keeps its centred px-1 padding.
    assert.match(shell, /'w-\[var\(--cuba-sidebar-w-collapsed\)\] justify-center px-1'/);
    // The superseded symmetric padding is gone.
    assert.doesNotMatch(shell, /justify-between px-3\.5 sm:px-4/);
});

test('AC3: the mobile drawer logo is enlarged', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /data-testid="cuba-drawer-brand"/);
    assert.match(shell, /className="h-10 w-auto max-w-\[160px\] object-contain shrink-0"/);
    assert.doesNotMatch(shell, /max-w-\[130px\]/);
    // The drawer monogram fallback matches the enlarged logo height.
    assert.match(shell, /className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-cuba-primary text-white text-xs font-black"/);
});

test('AC4: both compact rail marks scale from h-8 w-8 to h-9 w-9', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /data-testid="cuba-header-brand-mark"/);
    assert.match(shell, /data-testid="cuba-sidebar-brand-mark"/);
    const marks = shell.match(/className="h-9 w-9 object-contain shrink-0"/g) || [];
    assert.equal(marks.length, 2, `both compact rail marks must be h-9 w-9, found ${marks.length}`);
    // The two compact monogram fallback tiles match the enlarged marks.
    const tiles = shell.match(/className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-cuba-primary text-white text-xs font-black"/g) || [];
    assert.equal(tiles.length, 3, `the expanded and both compact monogram tiles must be h-9 w-9, found ${tiles.length}`);
    // No legacy compact sizing survives.
    assert.doesNotMatch(shell, /h-8 w-8/);
});

test('AC5: the sidebar toggle tile is unchanged and stays keyboard accessible', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /data-testid="cuba-sidebar-toggle"/);
    assert.match(shell, /hidden w-9 h-9 flex-none rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-cuba-line dark:bg-cuba-card/);
    assert.match(shell, /aria-label=\{collapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/);
    assert.match(shell, /aria-pressed=\{collapsed\}/);
    assert.match(shell, /min-\[1025px\]:inline-flex/);
    // The retired FiChevronLeft control stays absent.
    assert.doesNotMatch(shell, /FiChevronLeft/);
});

test('AC6: every enlarged logo keeps its accessible name and graceful degradation', async () => {
    const shell = await read(SHELL);
    const alts = shell.match(/alt=\{brandName\}/g) || [];
    assert.ok(alts.length >= 3, `expected alt text on the header, rail and drawer logos, found ${alts.length}`);
    const onErrors = shell.match(/onError=\{\(\) => setLogoFailed\(true\)\}/g) || [];
    assert.ok(onErrors.length >= 3, 'every logo image must degrade gracefully');
    // Each logo still lives inside a labelled, focusable anchor.
    const anchors = shell.match(/aria-label=\{`\$\{brandName\} home`\}/g) || [];
    assert.ok(anchors.length >= 3, `every logo anchor must be labelled, found ${anchors.length}`);
    assert.match(shell, /cuba-focusable flex items-center justify-center/);
});
