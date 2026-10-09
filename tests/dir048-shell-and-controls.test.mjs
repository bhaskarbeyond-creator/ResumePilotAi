import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DIR-048 S8–S10 source guards.
 *
 * The behaviours these assert are visual/responsive, so the live proof is the
 * Playwright suite; these assertions exist so a future edit cannot silently
 * regress the STRUCTURE the suite depends on (a handler that vanishes, a
 * bottom bar that loses its touch targets, a gutter that drifts).
 */
const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const DRAWER = 'src/components/cuba/CubaDrawer.jsx';
const APPS_MODAL = 'src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx';
const EMPLOYER_DASH = 'src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx';

test('S8: the Download Resume control is wired to a real export handler', () => {
    const modal = read(APPS_MODAL);
    // The control carries a handler…
    assert.match(modal, /onClick=\{\(\) => handleDownloadResume\(application\)\}/);
    // …the handler exists and uses the REAL authorised endpoint…
    assert.match(modal, /const handleDownloadResume = async \(application\)/);
    assert.match(modal, /getEmployerApplicationResume\(job\.id, application\.id\)/);
    // …downloads through the genuine render pipeline with PDF validation (DIR-064:
    // the %PDF- validation is owned by the centralized downloader).
    assert.match(modal, /\/api\/public-export/);
    assert.match(modal, /downloadResumePdf/);
    // …and never fabricates a file: the no-copy case is stated honestly.
    assert.match(modal, /has not published a downloadable copy/);
    // The control reports its own in-flight state and cannot double-fire.
    assert.match(modal, /disabled=\{Boolean\(downloadingResumeId\)\}/);
    assert.match(modal, /if \(downloadingResumeId\) return;/);
});

test('S8: a narrowed applicant pipeline can always be restored to the full list', () => {
    const modal = read(APPS_MODAL);
    assert.match(modal, /const filtersActive = searchTerm\.trim\(\)\.length > 0 \|\| statusFilter !== 'all';/);
    assert.match(modal, /const clearFilters = \(\) => \{/);
    // Two surfaces: the filter bar and the dead-end empty state.
    const clearButtons = modal.match(/onClick=\{clearFilters\}/g) || [];
    assert.ok(clearButtons.length >= 2, `expected the reset on both surfaces, found ${clearButtons.length}`);
});

test('S9: the shell owns one responsive gutter for every portal', () => {
    const shell = read(SHELL);
    assert.match(shell, /max-w-7xl px-4 py-6 pb-24 sm:px-6 md:pb-6 lg:px-8/);
    assert.doesNotMatch(shell, /max-w-\[1400px\]/, 'the ad-hoc 1400px cap is retired');
});

test('S9: portal pages defer the gutter to the Cuba shell without regressing legacy', () => {
    const dash = read(EMPLOYER_DASH);
    assert.match(dash, /isCubaShellEnabled/);
    const cubaAware = dash.match(/isCuba \? 'w-full' : /g) || [];
    assert.ok(cubaAware.length >= 2, 'both the loading and loaded containers must be Cuba-aware');
});

test('S10 tablet: the rail appears at md and is always compact in the tablet band', () => {
    const shell = read(SHELL);
    assert.match(shell, /TABLET_RAIL_QUERY = '\(min-width: 768px\) and \(max-width: 1024px\)'/);
    assert.match(shell, /const railCollapsed = collapsed \|\| tabletRail;/);
    // The collapse toggle is offered only ABOVE the tablet band: inside it the
    // rail is forced compact, so a toggle there would be a dead control.
    assert.match(shell, /hover:bg-cuba-primary-soft min-\[1025px\]:inline-flex/);
    // The sidebar is visible from md up, and the drawer/hamburger hand over there.
    assert.match(shell, /border-l-0 md:flex/);
    assert.match(shell, /hover:bg-cuba-primary-soft md:hidden/);
    assert.match(shell, /fixed inset-0 md:hidden/);
    // The rail consumes the collapsed presentation.
    assert.match(shell, /<CubaNavGroups groups=\{groups\} collapsed=\{railCollapsed\}/);
});

test('S10 mobile: a bottom tab bar is derived from the real navigation model', () => {
    const shell = read(SHELL);
    assert.match(shell, /const bottomNavItems = useMemo/);
    // Only REAL internal destinations from the supplied model qualify…
    assert.match(shell, /if \(!href\.startsWith\('\/'\) \|\| href\.startsWith\('\/\/'\)\) continue;/);
    // …the bar renders as its own labelled landmark with a drawer escape hatch…
    assert.match(shell, /aria-label="Primary mobile navigation"/);
    assert.match(shell, /data-testid="cuba-bottom-nav"/);
    assert.match(shell, /aria-label="More navigation options"/);
    // …every target clears the 44px touch minimum…
    const targets = shell.match(/min-h-\[44px\]/g) || [];
    assert.ok(targets.length >= 2, `tab links and the More control need >=44px targets, found ${targets.length}`);
    // …it respects the home-indicator inset…
    assert.match(shell, /env\(safe-area-inset-bottom, 0px\)/);
    // …and it can never double as a second landmark from md up.
    assert.match(shell, /bottom-0 z-40 flex items-stretch border-x-0 border-b-0 md:hidden/);
});

test('S10 sheets: drawers present as bottom sheets below 640px', () => {
    const drawer = read(DRAWER);
    assert.match(drawer, /max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-auto max-sm:max-h-\[85vh\]/);
    assert.match(drawer, /\$\{MOBILE_SHEET\}`/);
});
