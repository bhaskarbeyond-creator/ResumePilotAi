import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-079 — the top-left header brand block: authentic logo, the
 * GoSidebarCollapse/Expand toggle tile and the vertical divider.
 */

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const DIR048 = 'tests/dir048-shell-and-controls.test.mjs';
const DIR077 = 'tests/dir077-candidate-dashboard-overhaul.test.mjs';
const DIR078 = 'tests/dir078-branding-logo-and-top-whitespace.test.mjs';
const read = (p) => fs.readFile(p, 'utf8');

test('AC1: GoSidebarCollapse and GoSidebarExpand are imported and rendered', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /import \{ GoSidebarCollapse, GoSidebarExpand \} from 'react-icons\/go'/);
    assert.match(shell, /<GoSidebarCollapse className="w-4 h-4"/);
    assert.match(shell, /<GoSidebarExpand className="w-4 h-4"/);
});

test('AC2: the logo precedes the toggle inside the brand block', async () => {
    const shell = await read(SHELL);
    const blockIndex = shell.indexOf('data-testid="cuba-header-brand-block"');
    const logoIndex = shell.indexOf('data-testid="cuba-header-brand"');
    const toggleIndex = shell.indexOf('data-testid="cuba-sidebar-toggle"');
    assert.ok(blockIndex > -1, 'the brand block must exist');
    assert.ok(logoIndex > blockIndex, 'the logo must live inside the brand block');
    assert.ok(toggleIndex > logoIndex, 'the toggle must follow the logo');
});

test('AC3: the brand block carries border-r and the sidebar-width classes', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /'hidden h-full flex-none items-center border-r md:flex'/);
    assert.match(shell, /'w-\[var\(--cuba-sidebar-w-collapsed\)\] justify-center px-1'/);
    assert.match(shell, /'w-\[var\(--cuba-sidebar-w\)\] justify-between px-3\.5 sm:px-4'/);
});

test('AC4: the toggle tile uses the mandated class with min-[1025px] and a11y attributes', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-cuba-line dark:bg-cuba-card/);
    assert.match(shell, /aria-label=\{collapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/);
    assert.match(shell, /aria-pressed=\{collapsed\}/);
    assert.match(shell, /min-\[1025px\]:inline-flex/);
    // The retired FiChevronLeft control is gone.
    assert.doesNotMatch(shell, /FiChevronLeft/);
});

test('AC5: zero horizontal drift — the header keeps the search and right rail intact', async () => {
    const shell = await read(SHELL);
    assert.match(shell, /pl-3 pr-3 sm:gap-3 sm:pr-5 md:pl-0/);
    assert.match(shell, /md:w-auto md:flex-1/);
    assert.match(shell, /<MessagesNavBadge/);
    assert.match(shell, /<M3UserMenu/);
    assert.match(shell, /<M3NotificationCenter/);
    // The DIR-077 spacer is retired (the brand block now balances the left).
    assert.doesNotMatch(shell, /<div className="hidden min-w-0 flex-1 md:block" aria-hidden="true" \/>/);
});

test('AC6: the pinned suites track the new brand block', async () => {
    const [dir048, dir077, dir078] = await Promise.all([read(DIR048), read(DIR077), read(DIR078)]);
    assert.ok(dir048.includes('cuba-sidebar-toggle'), 'dir048 must pin the new toggle');
    assert.ok(dir077.includes('cuba-header-brand-block'), 'dir077 must pin the brand block');
    assert.ok(dir078.includes('max-w-\\[185px\\]'), 'dir078 must pin the new logo class');
});
