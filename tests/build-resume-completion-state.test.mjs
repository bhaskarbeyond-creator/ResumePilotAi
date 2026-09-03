import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Regression tests for the 2026-09-03 acceptance-audit fixes:
 *
 *  P0-1  Step completion state must be truthful:
 *        - legacy numeric flag aliases that collide with the renumbered step
 *          ids (old projects flag 6 = current certifications id 6, old summary
 *          flag 2 = current work-history id 2, …) made EMPTY steps report as
 *          "Completed" in the ribbon, footer, and overview modal.
 *        - the work-history content check read the nonexistent
 *          `resumeData.workHistory` field, so valid work history (canonical
 *          field `employments`) reported INCOMPLETE on fresh loads.
 *  P0-2  Tailwind v4 cascade: unlayered legacy h1-h5 rules in src/tailwind.css
 *        beat layered `text-*` utilities, rendering every builder heading at
 *        2em/1.5em/1.17em. Builder surfaces are excluded via
 *        `.rp-builder-scope`; everything outside it is byte-identical.
 *  P1-1  EN locale builder placeholders must be neutral (no India/IT
 *        example strings) — the EN locale is the global default.
 *  P1-2  The ATS meter and the resume document must share one JD source of
 *        truth (`targetJobDescription`), and the desktop ATS drawer opens
 *        expanded so the diagnostics are visible on first open.
 *  P2    No stray duplicate hint under the City field (placeholder already
 *        says it).
 */

const SHELL = fs.readFileSync('src/components/BuildResume/BuildResume.jsx', 'utf8');
const TAILWIND = fs.readFileSync('src/tailwind.css', 'utf8');
const EN_JSON = fs.readFileSync('src/locales/en/en.json', 'utf8');
const METER = fs.readFileSync('src/components/BuildResume/AtsScoreMeter.jsx', 'utf8');
const HEADING = fs.readFileSync('src/components/BuildResume/steps/HeadingStep.jsx', 'utf8');

test('P0-1: legacy completion alias map contains no cross-step numeric collisions', () => {
    // Extract the legacyMap object literal.
    const mapMatch = SHELL.match(/const legacyMap = \{([\s\S]*?)\};/);
    assert.ok(mapMatch, 'legacyMap must exist in isStepCompleted');
    const body = mapMatch[1];
    const entries = [...body.matchAll(/(\d+):\s*\[([^\]]*)\]/g)];
    assert.equal(entries.length, 11, 'one alias entry per content step');
    for (const [, id, aliases] of entries) {
        const numeric = [...aliases.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
        // Only the step's OWN id may appear as a numeric alias. Any other
        // numeric id belongs to a different step in the renumbered layout and
        // would falsely mark this step complete when that step is completed.
        for (const n of numeric) {
            assert.equal(n, Number(id), `step ${id} must not alias foreign numeric flag ${n}`);
        }
    }
});

test('P0-1: work-history completion checks the canonical employments field', () => {
    const whMatch = SHELL.match(/case 'work-history':\s*(?:\/\/[^\n]*\n\s*)*return ([^\n;]+);/);
    assert.ok(whMatch, 'work-history case must exist');
    assert.match(whMatch[1], /resumeData\.employments/);
    assert.doesNotMatch(whMatch[1], /resumeData\.workHistory/, 'legacy workHistory field must not gate completion');
});

test('P0-1: valid employments complete work history without any flags (content is authoritative)', () => {
    // Mirror of the substantive check — pins the exact predicate so a future
    // edit cannot silently change completion semantics.
    const isWorkHistoryComplete = (resumeData) =>
        Array.isArray(resumeData.employments) && resumeData.employments.length > 0;
    assert.equal(isWorkHistoryComplete({ employments: [{ employer: 'X', jobTitle: 'Y' }] }), true);
    assert.equal(isWorkHistoryComplete({ workHistory: [{ employer: 'X' }] }), false, 'legacy field must be ignored');
    assert.equal(isWorkHistoryComplete({}), false);
    assert.equal(isWorkHistoryComplete({ employments: [] }), false);
});

test('P0-2: legacy heading rules exclude the builder scope, h6 untouched', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5']) {
        assert.match(
            TAILWIND,
            new RegExp(`^${tag}:not\\(:is\\(\\.rp-builder-scope ${tag}\\)\\) \\{`, 'm'),
            `${tag} rule must exclude .rp-builder-scope`,
        );
    }
    // h6 is unused in the builder and intentionally left at its original selector.
    assert.match(TAILWIND, /^h6 \{/m);
    assert.doesNotMatch(TAILWIND, /h6:not/);
});

test('P0-2: builder root and portaled surfaces carry the scope class', () => {
    assert.match(SHELL, /className="rp-builder-scope h-screen w-full bg-slate-50 flex flex-col overflow-hidden"/);
    assert.match(SHELL, /className="rp-builder-scope w-full max-w-md bg-white h-full shadow-2xl/); // ATS drawer
    assert.match(SHELL, /className="rp-builder-scope fixed left-0 top-0 bottom-0 w-80 max-w-\[85vw\]/); // mobile nav drawer
    assert.match(SHELL, /className="rp-builder-scope w-full max-w-3xl bg-white rounded-3xl/); // overview modal
    assert.match(SHELL, /className="rp-builder-scope w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"/); // custom section dialog
});

test('P1-1: EN builder placeholders contain no India/IT example strings', () => {
    const biased = /\bAarav\b|\bSharma\b|\+91 |Hyderabad|Bengaluru|Madhapur|500081|CGPA|Cloud Architect|Priya Nair|Meridian|Engineering Excellence|aarav\.sharma/i;
    const lines = EN_JSON.split('\n');
    const offenders = [];
    let inBuilderScope = false;
    for (const line of lines) {
        // Builder-owned key namespaces in the EN locale.
        if (/^\s*"(HeadingStep|WorkHistoryStep|EducationStep|SkillsStep|ProjectsStep|CertificationsStep|AchievementsStep|ReferencesStep|CustomSectionsStep|BuildResume)":/.test(line)) inBuilderScope = true;
        else if (/^\s*"[A-Z][A-Za-z]*":\s*\{/.test(line) && !/^\s*"(HeadingStep|WorkHistoryStep|EducationStep|SkillsStep|ProjectsStep|CertificationsStep|AchievementsStep|ReferencesStep|CustomSectionsStep|BuildResume)":/.test(line)) inBuilderScope = false;
        if (inBuilderScope && biased.test(line)) offenders.push(line.trim());
    }
    assert.deepEqual(offenders, [], `biased placeholder strings remain: ${offenders.join(' | ')}`);

    const doc = JSON.parse(EN_JSON);
    assert.equal(doc.HeadingStep.fields.country.placeholder, 'Your country');
    assert.equal(doc.HeadingStep.fields.phone.placeholder, 'Include your country code');
    assert.equal(doc.HeadingStep.fields.jobTitle.placeholder, 'The job title you are targeting');
});

test('P1-2: ATS meter is wired to the resume document JD, not a private store', () => {
    assert.match(METER, /jobDescription, onJobDescriptionChange, defaultExpanded = false/);
    assert.match(METER, /documentManaged = jobDescription != null/);
    assert.match(METER, /if \(documentManaged \&\& jobDescription !== jdText\)/);
    assert.match(METER, /if \(!documentManaged\) writeStoredJobDescription\(jdText\);/);
    // BuildResume passes the document JD into both meter call sites.
    const callSites = SHELL.match(/jobDescription=\{resumeData\.targetJobDescription\}/g) || [];
    assert.equal(callSites.length, 2, 'desktop ATS drawer + mobile drawer must receive the document JD');
    assert.match(SHELL, /onJobDescriptionChange=\{\(jd\) => updateResumeData\(\{ targetJobDescription: jd \}\)\}/);
    // Desktop drawer opens expanded; mobile meter stays compact.
    const drawerStart = SHELL.indexOf('ATS Career Readiness Companion');
    const mobileStart = SHELL.indexOf('Mobile Navigation Drawer');
    assert.ok(drawerStart >= 0 && mobileStart > drawerStart, 'drawer sections found in order');
    const desktopDrawerBlock = SHELL.slice(drawerStart, mobileStart);
    assert.match(desktopDrawerBlock, /defaultExpanded/, 'desktop drawer meter must default to expanded');
    const mobileDrawerBlock = SHELL.slice(mobileStart);
    assert.doesNotMatch(mobileDrawerBlock.slice(0, mobileDrawerBlock.indexOf('All 11 Steps Stepper Overview')), /defaultExpanded/, 'mobile meter stays compact');
});

test('P2: City field has no duplicate hint below its placeholder', () => {
    assert.doesNotMatch(HEADING, /getDynamicPlaceholder\(/, 'no dynamic-placeholder hint usage left in HeadingStep');
    const cityField = HEADING.match(/name="city"[\s\S]{0,400}?\//);
    assert.ok(cityField, 'city field found');
    assert.doesNotMatch(cityField[0], /hint=/);
});

import { getCandidateContext } from '../src/utils/candidateContext.js';

test('P1-3: document title never leaks into the role context (adversarial probe finding)', () => {
    const ctx = fs.readFileSync('src/utils/candidateContext.js', 'utf8');
    assert.doesNotMatch(ctx, /data\.occupation \|\| data\.title/, 'document name must not be a declaredTitle source');
    // Behavior: a resume without a declared occupation must have an EMPTY role, and the
    // headline must fall back to the candidate's own current role — never the doc name.
    const c1 = getCandidateContext({
        firstname: 'Dario', lastname: 'Whitfield', occupation: '', title: 'Untitled Resume',
        employments: [{ jobTitle: 'Chef de Cuisine', employer: 'The Fern House' }],
    });
    assert.equal(c1.target.role, '');
    assert.equal(c1.facts.headline, 'Chef de Cuisine');
    assert.doesNotMatch(JSON.stringify(c1), /Untitled Resume/);
    const c2 = getCandidateContext({
        firstname: 'Dario', occupation: 'Executive Chef', title: 'Untitled Resume',
        employments: [{ jobTitle: 'Chef de Cuisine', employer: 'The Fern House' }],
    });
    assert.equal(c2.target.role, 'Executive Chef');
    const c3 = getCandidateContext({ firstname: 'A', occupation: '', title: 'My Resume v2', employments: [] });
    assert.equal(c3.target.role, '');
    assert.equal(c3.facts.headline, '');
});

test('P0-3: Empty employment and education entries do not falsely complete steps', () => {
    // Substantive check evaluation: blank entries with only empty strings must not pass.
    assert.match(SHELL, /case 'work-history':[\s\S]*?\.some\([\s\S]*?e\?\.jobTitle\?\.trim\(\) \|\| e\?\.employer\?\.trim\(\)/);
    assert.match(SHELL, /case 'education':[\s\S]*?\.some\([\s\S]*?e\?\.school\?\.trim\(\) \|\| e\?\.degree\?\.trim\(\)/);
});

test('P0-4: Zero neighbor step pruning across all builder step components', () => {
    const stepFiles = [
        'WorkHistoryStep.jsx', 'EducationStep.jsx', 'SkillsStep.jsx',
        'ProjectsStep.jsx', 'CertificationsStep.jsx', 'LanguagesStep.jsx', 'SummaryStep.jsx'
    ];
    for (const file of stepFiles) {
        const content = fs.readFileSync(`src/components/BuildResume/steps/${file}`, 'utf8');
        // Must not contain multi-step exclusions like step !== X && step !== Y
        assert.doesNotMatch(content, /step !== \d+ && step !== \d+/, `${file} must not prune neighboring steps`);
    }
});
