import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getCopilotActions, resolveActionHref, COPILOT_PORTALS } from '../src/components/cuba/copilotActions.js';

/**
 * DIR-086 — Candidate Overview polish.
 *
 * Covers the Quick-Pitch routing repair, the hidden scrollbar tracks, the streamlined
 * resume card and the de-duplicated rail.
 */

const read = (p) => fs.readFile(p, 'utf8');

const RAIL = 'src/components/Candidate/CandidateExecutiveRail.jsx';
const ACTIONS = 'src/components/cuba/copilotActions.js';
const HOMEPAGE = 'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx';

const candidateActions = () => getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname: '/dashboard' });
const actionById = (id) => candidateActions().find((action) => action.id === id);

test('AC1: every candidate Quick-Pitch resolves to its REAL destination, never /dashboard', () => {
    assert.equal(resolveActionHref(actionById('candidate-tailor-resume')), '/build-resume/heading');
    assert.equal(resolveActionHref(actionById('candidate-cover-letter')), '/dashboard/cover-letters');
    assert.equal(resolveActionHref(actionById('candidate-mock-interview')), '/dashboard/interview');

    // The bug: '/dashboard' was routes[0] for all three, so every click was a no-op.
    for (const action of candidateActions()) {
        assert.notEqual(resolveActionHref(action), '/dashboard', `${action.id} must not navigate to the page it is already on`);
    }
});

test('AC2: the resolver prefers navigateTo and otherwise the MOST SPECIFIC route', async () => {
    // navigateTo wins.
    assert.equal(resolveActionHref({ navigateTo: '/a/b', routes: ['/x'] }), '/a/b');
    // With no navigateTo the DEEPEST route wins, never routes[0].
    assert.equal(resolveActionHref({ routes: ['/dashboard', '/dashboard/interview'] }), '/dashboard/interview');
    assert.equal(resolveActionHref({ routes: ['/dashboard', '/build-resume'] }), '/build-resume');
    // Degenerate inputs stay honest.
    assert.equal(resolveActionHref(null), null);
    assert.equal(resolveActionHref({ routes: [] }), null);
    assert.equal(resolveActionHref({ routes: null }), null);
    // The rail must use the shared resolver, not routes[0].
    assert.doesNotMatch(await read(RAIL), /action\.routes\[0\]/);
});

test('AC3: the native scrollbar tracks are gone and the no-op class is retired', async () => {
    const home = await read(HOMEPAGE);
    // The category pill row hides its track with real Tailwind v4 arbitrary utilities.
    assert.match(home, /overflow-x-auto pb-1 md:pb-0 \[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/);
    // scrollbar-none generates NO CSS (tailwind v4, no scrollbar plugin), so it must be gone.
    for (const file of [HOMEPAGE, 'src/components/BuildResume/steps/EducationStep.jsx', 'src/components/BuildResume/steps/WorkHistoryStep.jsx']) {
        assert.doesNotMatch(await read(file), /\bscrollbar-none\b/, `${file} still relies on the no-op scrollbar-none class`);
    }
    // The repaired rows keep the real utilities.
    assert.match(await read('src/components/BuildResume/steps/EducationStep.jsx'), /\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/);
    assert.match(await read('src/components/BuildResume/steps/WorkHistoryStep.jsx'), /\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/);
});


test('AC4: the rail holds only the Quick-Pitch and no longer repeats the capsule strip', async () => {
    const rail = await read(RAIL);
    // The duplicated widgets are no longer RENDERED (a comment may still document their
    // removal, which is deliberate).
    assert.doesNotMatch(rail, /<WidgetCard title="ATS Keyword Strength"/);
    assert.doesNotMatch(rail, /<WidgetCard title="Application Milestones"/);
    assert.doesNotMatch(rail, /AtsRadialGauge|PipelineStepper/);
    // Only the Live Copilot Quick-Pitch remains, with its empty state intact.
    assert.match(rail, /title="Live Copilot Quick-Pitch"/);
    assert.match(rail, /CubaEmptyState compact title="No quick actions"/);
    const widgets = (rail.match(/<WidgetCard /g) || []).length;
    assert.equal(widgets, 1, `the rail must render exactly one widget, found ${widgets}`);
    // The orphaned reads (and their 4s retry loop) went with the widgets.
    assert.doesNotMatch(rail, /getTrackedJobs|getStatesOfUser|summariseResumes/);
    assert.doesNotMatch(rail, /setInterval/);
});

test('AC5: the resume card is streamlined to one primary action plus a compact row', async () => {
    const home = await read(HOMEPAGE);
    // The vertical stack became a wrapping row, and the 2x2 grid became one flex row.
    assert.match(home, /<div className="flex flex-wrap items-center gap-2 mt-auto">/);
    assert.match(home, /isCuba \? "flex items-center gap-2 flex-1 min-w-0" : "space-y-2\.5"/);
    // The primary Edit action claims its own full row.
    assert.match(home, /cuba-btn-primary flex-1 basis-full min-w-0 text-xs font-bold/);
    // The export and share actions share one compact row.
    assert.match(home, /cuba-btn-outline flex-1 min-w-0 text-xs font-semibold py-2 px-3 rounded-xl/);
    assert.match(home, /cuba-btn-outline flex-1 min-w-0 text-xs font-semibold py-2 px-4 rounded-xl/);
    // The overflow menu (which already carries Share / Rename / Delete) is still there.
    assert.match(home, /FaEllipsisH/);
    assert.match(home, /role="menuitem"/);
});

test('AC6: accessibility and the dependency budget hold', async () => {
    const [home, rail, actions] = await Promise.all([read(HOMEPAGE), read(RAIL), read(ACTIONS)]);
    // The card keeps real button semantics and labelled actions.
    assert.match(home, /DashboardHomepage\.actions\.editResume/);
    assert.match(home, /DashboardHomepage\.actions\.shareResume/);
    assert.match(home, /role="menuitem"/);
    assert.match(home, /aria-hidden="true"/);
    // The rail keeps its labelled landmark and focus affordance.
    assert.match(rail, /data-testid="cuba-executive-rail"/);
    assert.match(rail, /cuba-focusable/);
    assert.match(rail, /aria-hidden="true"/);
    // The routing fix adds no dependency: copilotActions stays dependency-free.
    for (const [, spec] of actions.matchAll(/from '([^']+)'/g)) {
        assert.ok(spec.startsWith('.'), `copilotActions must not import a package (found ${spec})`);
    }
    // No timer was introduced anywhere in the touched files.
    for (const [name, source] of [['rail', rail], ['actions', actions]]) {
        assert.doesNotMatch(source, /setInterval\(/, `${name} must not add a timer`);
    }
});
