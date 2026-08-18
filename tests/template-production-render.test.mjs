/**
 * Production-path template contract tests.
 *
 * `template-render.test.mjs` renders `src/cv-templates/cvNN/CvNN.jsx` directly.
 * Those modules are NOT what production renders for a resume: `TemplateRenderer`
 * routes every `Cv\d+` id to `SmartResumeComposer`, so the legacy suite can be
 * fully green while the real engine is broken. This suite exercises the engine
 * that actually produces the browser preview, the PDF and (through the mirrored
 * theme registry) the DOCX.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

// The sanitizer used by the flow renderer needs a DOM window, exactly as the
// existing template render suite provides one.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Image = dom.window.Image;

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

// The engine is JSX and imports CSS, so it is loaded through Vite's SSR
// pipeline exactly like the browser build resolves it.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
after(async () => { await vite.close(); });

const { THEME_PRESETS, ARCHETYPES } = await vite.ssrLoadModule('/src/engine/hybrid/themePresets.js');
const { partitionResumeContent } = await vite.ssrLoadModule('/src/engine/hybrid/smartPartitioner.js');
const { default: SmartResumeComposer } = await vite.ssrLoadModule('/src/engine/hybrid/SmartResumeComposer.jsx');
const { TEMPLATE_CATALOG } = await vite.ssrLoadModule('/src/utils/templateCatalog.js');

const SINGLE_COLUMN = new Set([ARCHETYPES.MINIMAL_ATS, ARCHETYPES.COMPACT_EURO]);

const baseResume = {
    firstname: 'Bhaskar', lastname: 'రావు', occupation: 'Senior Platform Engineer',
    email: 'candidate@example.com', phone: '+91 98765 43210', city: 'Vijayawada', country: 'India',
    summary: '<p>Platform engineer building reliable systems.</p>',
    employments: [{ jobTitle: 'Staff Engineer', employer: 'Meridian Financial', begin: '2021', end: 'Present', description: '<p>Led the ledger rebuild.</p>' }],
    educations: [{ school: 'IIT Madras', degree: 'B.Tech', started: '2011', finished: '2015' }],
    skills: [{ name: 'Kubernetes', rating: 90 }, { name: 'Go', rating: 85 }],
    languages: [{ name: 'English', level: 'Fluent' }, { name: 'తెలుగు', level: 'Native' }],
    projects: [{ title: 'ResumePilot', description: 'Analytics toolkit.' }],
    certifications: [{ title: 'CKA', issuer: 'CNCF', date: '2022' }],
    achievements: [{ title: 'Excellence Award', description: 'Zero-downtime migration.' }],
    references: [{ name: 'Priya Nair', reference: 'VP Engineering' }],
    customSections: [{ id: 'patents', title: 'Patents', items: [{ title: 'Distributed Locking', description: 'Consensus method.' }] }],
};

/** A deliberately long profile: 14 roles, 32 skills, 10 certifications. */
const longResume = {
    ...baseResume,
    employments: Array.from({ length: 14 }, (_, i) => ({
        jobTitle: `Director of Engineering ${i + 1}`,
        employer: `Multinational Corporation ${String.fromCharCode(65 + i)}`,
        begin: `${2003 + i}`, end: `${2004 + i}`,
        description: `<p>${'Delivered measurable outcomes across global teams. '.repeat(8)}</p>`,
    })),
    educations: Array.from({ length: 5 }, (_, i) => ({ school: `University ${i + 1}`, degree: 'M.Eng.', started: '1990', finished: '1994' })),
    skills: Array.from({ length: 32 }, (_, i) => ({ name: `Enterprise Capability Domain ${i + 1} with Long Descriptive Name`, rating: 60 })),
    projects: Array.from({ length: 8 }, (_, i) => ({ title: `Programme ${i + 1}`, description: 'A long description used to test wrapping.' })),
    certifications: Array.from({ length: 10 }, (_, i) => ({ title: `Certification Number ${i + 1}`, issuer: 'Institute', date: `${2010 + i}` })),
    references: Array.from({ length: 3 }, (_, i) => ({ name: `Reference ${i + 1}`, reference: 'CTO' })),
};

const emptyish = { firstname: 'Noor', email: 'noor@example.com' };

function renderTemplate(templateId, values) {
    return renderToStaticMarkup(React.createElement(SmartResumeComposer, { templateId, language: 'en', values }));
}

test('every template renders through the production composer without invalid output', { timeout: 120_000 }, async () => {
    const failures = [];
    for (const id of CV_IDS) {
        for (const [name, values] of Object.entries({ base: baseResume, long: longResume, emptyish })) {
            try {
                const markup = renderTemplate(id, values);
                assert.ok(markup.includes('smart-resume-page'), `${id}/${name} produced no A4 sheet`);
                assert.doesNotMatch(markup, />\s*(?:undefined|NaN)\s*</, `${id}/${name} rendered invalid values`);
                if (name === 'base') {
                    assert.ok(markup.includes('Excellence Award'), `${id}/base lost achievements`);
                    assert.ok(markup.includes('Priya Nair'), `${id}/base lost references`);
                    assert.ok(markup.includes('Distributed Locking'), `${id}/base lost custom sections`);
                    assert.ok(markup.includes('ResumePilot'), `${id}/base lost projects`);
                    assert.ok(markup.includes('CKA'), `${id}/base lost certifications`);
                }
            } catch (error) {
                failures.push(`${id}/${name}: ${error.message}`);
            }
        }
    }
    assert.deepEqual(failures, []);
});

test('the rendered column structure matches the declared archetype for all 51 templates', { timeout: 120_000 }, async () => {
    const mismatches = [];
    for (const id of CV_IDS) {
        const markup = renderTemplate(id, baseResume);
        const hasSidebar = markup.includes('class="smart-sidebar"');
        const hasMain = markup.includes('smart-main-content');
        const expectSidebar = !SINGLE_COLUMN.has(THEME_PRESETS[id].archetype);
        if (hasSidebar !== expectSidebar) mismatches.push(`${id}: archetype=${THEME_PRESETS[id].archetype} sidebar=${hasSidebar}`);
        if (expectSidebar && !hasMain) mismatches.push(`${id}: two-column archetype without a main column`);
    }
    assert.deepEqual(mismatches, []);
});

test('a two-column template never collapses to one column when optional data is missing', { timeout: 120_000 }, async () => {
    const collapsed = [];
    const twoColumn = CV_IDS.filter((id) => !SINGLE_COLUMN.has(THEME_PRESETS[id].archetype));
    for (const id of twoColumn) {
        for (const values of [emptyish, { firstname: 'A' }, { ...baseResume, skills: [], languages: [], certifications: [] }]) {
            const markup = renderTemplate(id, values);
            if (!markup.includes('class="smart-sidebar"')) collapsed.push(id);
        }
    }
    assert.deepEqual([...new Set(collapsed)], []);
});

test('Cv50 is the reverse (right sidebar) split and no other template claims it', () => {
    const reversed = CV_IDS.filter((id) => THEME_PRESETS[id].sidebarPosition === 'right');
    assert.deepEqual(reversed, ['Cv50']);
});

test('Cv51 resolves to a single authoritative archetype everywhere', async () => {
    // Historic reports disagreed on whether Cv51 was COMPACT_EURO or MODERN_SPLIT.
    // The composer reads THEME_PRESETS, so that is the only authority.
    assert.equal(THEME_PRESETS.Cv51.archetype, ARCHETYPES.MODERN_SPLIT);
    const markup = renderTemplate('Cv51', baseResume);
    assert.ok(markup.includes('smart-layout--modern-split'), 'Cv51 must render the modern-split layout');
    assert.ok(markup.includes('class="smart-sidebar"'), 'Cv51 must render its sidebar');
    const cv40 = renderTemplate('Cv40', baseResume);
    assert.ok(cv40.includes('smart-layout--compact-euro'), 'Cv40 must render the compact-euro layout');
    assert.notEqual(THEME_PRESETS.Cv40.archetype, THEME_PRESETS.Cv51.archetype);
});

test('the partitioner paginates beyond two pages instead of clipping content', () => {
    // The previous implementation hard-capped at two pages and the A4 sheet
    // clips at `overflow:hidden`, so a 14-role resume silently lost content.
    for (const id of ['Cv1', 'Cv4', 'Cv8', 'Cv25', 'Cv40', 'Cv50', 'Cv51']) {
        const result = partitionResumeContent(longResume, THEME_PRESETS[id]);
        assert.ok(result.totalPages > 2, `${id}: long resume produced only ${result.totalPages} page(s)`);
        assert.equal(result.pages.length, result.totalPages);
        const placed = result.pages.reduce((sum, page) => sum + page.flowItems.length, 0);
        assert.ok(placed > 0, `${id}: no flow items placed`);
    }
});

test('no resume item is dropped by the partitioner', () => {
    for (const id of ['Cv1', 'Cv4', 'Cv40', 'Cv50']) {
        const result = partitionResumeContent(longResume, THEME_PRESETS[id]);
        const flat = result.pages.flatMap((page) => page.flowItems);
        const employmentItems = flat.filter((item) => item.type === 'experience').length;
        const projectItems = flat.filter((item) => item.type === 'project').length;
        const certItems = flat.filter((item) => item.type === 'certification').length;
        assert.equal(employmentItems, longResume.employments.length, `${id}: employment entries lost`);
        assert.equal(projectItems, longResume.projects.length, `${id}: project entries lost`);
        assert.equal(certItems, longResume.certifications.length, `${id}: certification entries lost`);

        // Skills either sit in the sidebar or are demoted into the main flow —
        // never dropped.
        const sidebarSkills = result.pages[0].sidebar?.skills?.length || 0;
        const flowSkills = flat.filter((item) => item.type === 'skills').reduce((sum, item) => sum + (item.items?.length || 0), 0);
        assert.equal(sidebarSkills + flowSkills, longResume.skills.length, `${id}: skills lost`);
    }
});

test('the Choose-Template catalog covers all 51 ids exactly once with distinct names', () => {
    assert.equal(TEMPLATE_CATALOG.length, 51);
    assert.deepEqual(TEMPLATE_CATALOG.map((entry) => entry.id), CV_IDS);
    const names = TEMPLATE_CATALOG.map((entry) => entry.name);
    assert.equal(new Set(names).size, 51, 'every Choose-Template card must have a distinct name');
    for (const entry of TEMPLATE_CATALOG) {
        assert.equal(entry.name, THEME_PRESETS[entry.id].name, `${entry.id} card name must match the rendered theme`);
        assert.ok(entry.description.length > 10, `${entry.id} needs an accessible description`);
    }
});
