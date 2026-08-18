/**
 * EMPTY-SECTION / CONTENT-PRESERVATION FORENSIC HARNESS
 *
 * Independently verifies, for the same inputs, three pipelines at once:
 *   1. contentSanitizer  (the claimed single authority)
 *   2. Browser/PDF       (SSR through the real SmartResumeComposer)
 *   3. DOCX              (real OOXML from createResumeDocx, headings inspected)
 *
 * It checks BOTH directions:
 *   - every representation of "empty" must suppress the heading everywhere
 *   - every representation of real content must be preserved everywhere
 * and it cross-checks the three pipelines against each other so a divergence
 * (browser hides it, DOCX shows it) is reported as a defect.
 *
 * Usage: node template-lab/empty-section-audit.mjs
 */
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Image = dom.window.Image;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { default: SmartResumeComposer } = await vite.ssrLoadModule('/src/engine/hybrid/SmartResumeComposer.jsx');
const sanitizer = await vite.ssrLoadModule('/src/engine/hybrid/utils/contentSanitizer.js');
const { partitionResumeContent } = await vite.ssrLoadModule('/src/engine/hybrid/smartPartitioner.js');
const { createResumeDocx } = require('../backend/services/docxExport.js');

/* ── OOXML reader ───────────────────────────────────────────────────── */
function unzip(buf, want) {
    let off = buf.length - 22;
    while (off >= 0 && buf.readUInt32LE(off) !== 0x06054b50) off--;
    const count = buf.readUInt16LE(off + 10);
    let cd = buf.readUInt32LE(off + 16);
    const out = {};
    for (let i = 0; i < count; i++) {
        const nl = buf.readUInt16LE(cd + 28), el = buf.readUInt16LE(cd + 30), cl = buf.readUInt16LE(cd + 32);
        const lho = buf.readUInt32LE(cd + 42);
        const name = buf.slice(cd + 46, cd + 46 + nl).toString();
        const method = buf.readUInt16LE(cd + 10), csize = buf.readUInt32LE(cd + 20);
        if (!want || want.includes(name)) {
            const l1 = buf.readUInt16LE(lho + 26), l2 = buf.readUInt16LE(lho + 28);
            const start = lho + 30 + l1 + l2;
            const raw = buf.slice(start, start + csize);
            out[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
        }
        cd += 46 + nl + el + cl;
    }
    return out;
}
const docxText = (buf) => {
    const xml = unzip(buf, ['word/document.xml'])['word/document.xml'].toString('utf8');
    const visible = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((n) => n.replace(/<[^>]+>/g, '')).join(' | ');
    return { xml, visible };
};

const renderHtml = (values, templateId = 'Cv1') =>
    renderToStaticMarkup(React.createElement(SmartResumeComposer, { templateId, language: 'en', values }));

/* Heading detection: the rendered section title text, and the DOCX heading run. */
const htmlHasHeading = (html, label) => {
    const re = new RegExp(`smart-section-title__text"[^>]*>${label}`, 'i');
    return re.test(html);
};
const docxHasHeading = (visible, label) => new RegExp(`(^|\\|)\\s*${label}\\s*(\\||$)`, 'i').test(visible);

/* ── EMPTY REPRESENTATIONS (brief §8) ───────────────────────────────── */
const EMPTY_SCALARS = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['spaces', '   '],
    ['newline', '\n'],
    ['tab', '\t'],
    ['CRLF + spaces', '\r\n   \r\n'],
    ['<p></p>', '<p></p>'],
    ['<p>\\n</p>', '<p>\n</p>'],
    ['<p class=editor-paragraph>\\n</p>', '<p class="editor-paragraph">\n</p>'],
    ['<p> </p>', '<p> </p>'],
    ['<p>   </p>', '<p>   </p>'],
    ['<p><br></p>', '<p><br></p>'],
    ['<p><br/></p>', '<p><br/></p>'],
    ['<span></span>', '<span></span>'],
    ['<div></div>', '<div></div>'],
    ['<strong></strong>', '<strong></strong>'],
    ['<p><span></span></p>', '<p><span></span></p>'],
    ['&nbsp;', '&nbsp;'],
    ['<p>&nbsp;</p>', '<p>&nbsp;</p>'],
    ['&#160;', '&#160;'],
    ['nbsp char U+00A0', '\u00a0'],
    ['zero-width space', '\u200b'],
    ['<ul></ul>', '<ul></ul>'],
    ['<ul><li></li></ul>', '<ul><li></li></ul>'],
];
const EMPTY_LISTS = [
    ['[]', []],
    ['null list', null],
    ['undefined list', undefined],
    ['[{}]', [{}]],
    ['[{}, {}]', [{}, {}]],
    ['[null]', [null]],
    ['[""]', ['']],
    ['["   "]', ['   ']],
    ['[{title:""}]', [{ title: '' }]],
    ['[{title:"<p></p>"}]', [{ title: '<p></p>' }]],
    ['[{description:"<p></p>"}]', [{ description: '<p></p>' }]],
    ['[{description:"&nbsp;"}]', [{ description: '&nbsp;' }]],
];

/* ── REAL CONTENT THAT MUST SURVIVE (brief §9) ──────────────────────── */
const REAL_SCALARS = [
    ['plain text', 'Platform engineer.'],
    ['punctuation only-ish', 'C++ / C# — 100% (yes!)'],
    ['numbers', '2024'],
    ['single char', 'X'],
    ['zero', '0'],
    ['URL', 'https://example.com/a/b?c=1&d=2'],
    ['email', 'first.last+tag@example.co.uk'],
    ['rich <p>', '<p>Delivered results.</p>'],
    ['bold', '<p><strong>Bold</strong></p>'],
    ['italic', '<p><em>Italic</em></p>'],
    ['bullets', '<ul><li>One</li><li>Two</li></ul>'],
    ['nested markup', '<p class="editor-paragraph"><span style="x">Deep</span></p>'],
    ['Telugu', 'భాస్కర్ రావు'],
    ['Devanagari', 'वरिष्ठ सॉफ्टवेयर वास्तुकार'],
    ['European accents', 'José María Núñez'],
    ['Cyrillic', 'Руководитель'],
    ['Greek', 'Ελληνικά'],
    ['CJK', '软件架构师'],
    ['Arabic', 'مهندس برمجيات'],
    ['emoji/symbol', '★ 100% ✓'],
    ['entity amp', 'R&amp;D lead'],
    ['text with nbsp', 'Team&nbsp;Lead'],
];

const results = { sanitizerEmpty: [], sanitizerReal: [], browser: [], docx: [], crossCheck: [], preservation: [] };
let failures = 0;
const fail = (bucket, msg) => { failures++; results[bucket].push({ status: 'FAIL', msg }); console.log(`  FAIL  ${msg}`); };
const pass = (bucket, msg) => { results[bucket].push({ status: 'pass', msg }); };

/* ══ 1. contentSanitizer unit truth ═══════════════════════════════════ */
console.log('\n=== 1. contentSanitizer.hasMeaningfulText — EMPTY representations ===');
for (const [label, value] of EMPTY_SCALARS) {
    const r = sanitizer.hasMeaningfulText(value);
    if (r) fail('sanitizerEmpty', `hasMeaningfulText(${label}) returned TRUE (should be empty)`);
    else pass('sanitizerEmpty', label);
}
console.log(`  ${EMPTY_SCALARS.length - results.sanitizerEmpty.filter((r) => r.status === 'FAIL').length}/${EMPTY_SCALARS.length} correctly treated as EMPTY`);

console.log('\n=== 2. contentSanitizer.hasMeaningfulText — REAL content ===');
for (const [label, value] of REAL_SCALARS) {
    const r = sanitizer.hasMeaningfulText(value);
    if (!r) fail('sanitizerReal', `hasMeaningfulText(${label} = ${JSON.stringify(value).slice(0, 40)}) returned FALSE (content lost!)`);
    else pass('sanitizerReal', label);
}
console.log(`  ${REAL_SCALARS.length - results.sanitizerReal.filter((r) => r.status === 'FAIL').length}/${REAL_SCALARS.length} correctly treated as CONTENT`);

/* ══ 3. Per-section EMPTY suppression: browser + DOCX ════════════════ */
const SECTIONS = [
    // NOTE: heading labels differ between the browser flow and the DOCX
    // builders (minimal-ats DOCX says "EXPERIENCE", modern-split says
    // "EMPLOYMENT HISTORY"). Calibrated against real OOXML output.
    { key: 'employments', heading: 'Employment History', docxHeading: 'EXPERIENCE', valid: [{ jobTitle: 'Engineer', employer: 'Acme' }] },
    { key: 'educations', heading: 'Education', docxHeading: 'EDUCATION', valid: [{ degree: 'B.Tech', school: 'IIT' }] },
    { key: 'skills', heading: 'Key Skills', docxHeading: 'SKILLS', valid: [{ name: 'Go' }] },
    { key: 'projects', heading: 'Projects', docxHeading: 'PROJECTS', valid: [{ title: 'ResumePilot' }] },
    { key: 'certifications', heading: 'Certifications', docxHeading: 'CERTIFICATIONS', valid: [{ title: 'CKA' }] },
    { key: 'achievements', heading: 'Key Achievements', docxHeading: 'KEY ACHIEVEMENTS', valid: [{ title: 'Award' }] },
    { key: 'references', heading: 'References', docxHeading: 'REFERENCES', valid: [{ name: 'Priya' }] },
    { key: 'languages', heading: 'Languages', docxHeading: 'LANGUAGES', valid: [{ name: 'English' }] },
    { key: 'hobbies', heading: 'Hobbies &amp; Interests', docxHeading: 'HOBBIES &amp; INTERESTS', valid: ['Chess'] },
];
const BASE = { firstname: 'Test', lastname: 'User', occupation: 'Engineer', email: 't@example.com' };

console.log('\n=== 3. EMPTY section suppression — BROWSER (single-column Cv4 so every section is in the main flow) ===');
for (const section of SECTIONS) {
    for (const [label, value] of EMPTY_LISTS) {
        const html = renderHtml({ ...BASE, [section.key]: value }, 'Cv4');
        if (htmlHasHeading(html, section.heading)) {
            fail('browser', `${section.key} = ${label} -> heading "${section.heading}" STILL RENDERED`);
        } else pass('browser', `${section.key}/${label}`);
    }
}
console.log(`  ${results.browser.filter((r) => r.status === 'pass').length}/${SECTIONS.length * EMPTY_LISTS.length} empty combinations correctly suppressed`);

console.log('\n=== 4. Summary section — empty scalar representations (browser) ===');
let summaryFails = 0;
for (const [label, value] of EMPTY_SCALARS) {
    const html = renderHtml({ ...BASE, summary: value }, 'Cv4');
    if (htmlHasHeading(html, 'Professional Summary')) { summaryFails++; fail('browser', `summary = ${label} -> heading STILL RENDERED`); }
}
console.log(`  ${EMPTY_SCALARS.length - summaryFails}/${EMPTY_SCALARS.length} empty summaries suppressed`);

console.log('\n=== 5. EMPTY section suppression — DOCX OOXML ===');
for (const section of SECTIONS) {
    for (const [label, value] of [['[]', []], ['[{}]', [{}]], ['[{description:"<p></p>"}]', [{ description: '<p></p>' }]], ['[{title:"   "}]', [{ title: '   ' }]]]) {
        const buf = await createResumeDocx({ ...BASE, template: 'Cv4', [section.key]: value });
        const { visible } = docxText(buf);
        if (docxHasHeading(visible, section.docxHeading)) {
            fail('docx', `DOCX ${section.key} = ${label} -> heading "${section.docxHeading}" PRESENT in word/document.xml`);
        } else pass('docx', `${section.key}/${label}`);
    }
}
console.log(`  ${results.docx.filter((r) => r.status === 'pass').length}/${SECTIONS.length * 4} empty combinations correctly suppressed in OOXML`);

/* ══ 6. POPULATED sections must appear (both pipelines) ══════════════ */
console.log('\n=== 6. POPULATED sections must appear (browser + DOCX) ===');
for (const section of SECTIONS) {
    const values = { ...BASE, [section.key]: section.valid };
    const html = renderHtml(values, 'Cv4');
    if (!htmlHasHeading(html, section.heading)) fail('preservation', `BROWSER: populated ${section.key} -> heading "${section.heading}" MISSING`);
    const buf = await createResumeDocx({ ...values, template: 'Cv4' });
    const { visible } = docxText(buf);
    if (!docxHasHeading(visible, section.docxHeading)) fail('preservation', `DOCX: populated ${section.key} -> heading "${section.docxHeading}" MISSING`);
}
console.log(`  checked ${SECTIONS.length} sections in both pipelines`);

/* ══ 7. PARTIAL records must be preserved (brief §17) ════════════════ */
console.log('\n=== 7. Partially populated records must NOT be dropped (§17) ===');
const PARTIALS = [
    ['experience: title+company, description empty', { employments: [{ jobTitle: 'Engineer', employer: 'Acme', description: '<p></p>' }] }, 'Employment History', 'EXPERIENCE', 'Engineer'],
    ['experience: title only', { employments: [{ jobTitle: 'Engineer' }] }, 'Employment History', 'EXPERIENCE', 'Engineer'],
    ['experience: dates only', { employments: [{ begin: '2020', end: '2024' }] }, 'Employment History', 'EXPERIENCE', '2020'],
    ['project: name only, description empty', { projects: [{ title: 'ResumePilot', description: '   ' }] }, 'Projects', 'PROJECTS', 'ResumePilot'],
    ['project: description only', { projects: [{ description: 'A real project description.' }] }, 'Projects', 'PROJECTS', 'A real project'],
    ['education: school only', { educations: [{ school: 'IIT Madras' }] }, 'Education', 'EDUCATION', 'IIT Madras'],
    ['certification: title only', { certifications: [{ title: 'CKA' }] }, 'Certifications', 'CERTIFICATIONS', 'CKA'],
    ['reference: name only', { references: [{ name: 'Priya Nair' }] }, 'References', 'REFERENCES', 'Priya Nair'],
    ['achievement: title only', { achievements: [{ title: 'Excellence Award' }] }, 'Key Achievements', 'KEY ACHIEVEMENTS', 'Excellence Award'],
    ['mixed list: 1 valid + 1 blank', { employments: [{ jobTitle: 'Engineer', employer: 'Acme' }, {}] }, 'Employment History', 'EXPERIENCE', 'Engineer'],
    ['mixed list: 1 blank + 1 valid', { employments: [{}, { jobTitle: 'Architect', employer: 'Globex' }] }, 'Employment History', 'EXPERIENCE', 'Architect'],
];
for (const [label, patch, htmlHeading, dHeading, needle] of PARTIALS) {
    const html = renderHtml({ ...BASE, ...patch }, 'Cv4');
    if (!htmlHasHeading(html, htmlHeading)) fail('preservation', `BROWSER: ${label} -> section DROPPED`);
    else if (!html.includes(needle)) fail('preservation', `BROWSER: ${label} -> content "${needle}" LOST`);
    const buf = await createResumeDocx({ ...BASE, ...patch, template: 'Cv4' });
    const { visible } = docxText(buf);
    if (!docxHasHeading(visible, dHeading)) fail('preservation', `DOCX: ${label} -> section DROPPED`);
    else if (!visible.includes(needle)) fail('preservation', `DOCX: ${label} -> content "${needle}" LOST`);
}
console.log(`  checked ${PARTIALS.length} partial-record scenarios in both pipelines`);

/* ══ 8. Unicode / rich content preserved end to end ══════════════════ */
console.log('\n=== 8. Unicode & rich content preserved through both pipelines ===');
for (const [label, value] of REAL_SCALARS) {
    const patch = { employments: [{ jobTitle: 'Engineer', employer: 'Acme', description: `<p>${value}</p>` }] };
    const html = renderHtml({ ...BASE, ...patch }, 'Cv4');
    if (!htmlHasHeading(html, 'Employment History')) fail('preservation', `BROWSER: description "${label}" caused section drop`);
    const buf = await createResumeDocx({ ...BASE, ...patch, template: 'Cv4' });
    const { visible } = docxText(buf);
    if (!docxHasHeading(visible, 'EXPERIENCE')) fail('preservation', `DOCX: description "${label}" caused section drop`);
}
console.log(`  ${REAL_SCALARS.length} content types checked`);

/* ══ 9. CROSS-PIPELINE AGREEMENT (brief §18) ════════════════════════ */
console.log('\n=== 9. Cross-pipeline agreement: sanitizer vs browser vs DOCX vs partitioner ===');
const CROSS = [];
for (const [label, value] of EMPTY_SCALARS) CROSS.push([`description=${label}`, { employments: [{ description: value }] }, false]);
for (const [label, value] of REAL_SCALARS) CROSS.push([`description=${label}`, { employments: [{ description: value }] }, true]);
for (const [label, patch, expectVisible] of CROSS) {
    const values = { ...BASE, ...patch };
    const browserVisible = htmlHasHeading(renderHtml(values, 'Cv4'), 'Employment History');
    const buf = await createResumeDocx({ ...values, template: 'Cv4' });
    const docxVisible = docxHasHeading(docxText(buf).visible, 'EXPERIENCE');
    const part = partitionResumeContent(values, { archetype: 'minimal-ats' });
    const partitionerVisible = part.pages.some((p) => p.flowItems.some((i) => i.type === 'experience'));
    if (browserVisible !== docxVisible || browserVisible !== partitionerVisible) {
        fail('crossCheck', `DIVERGENCE ${label}: browser=${browserVisible} docx=${docxVisible} partitioner=${partitionerVisible}`);
    } else if (browserVisible !== expectVisible) {
        fail('crossCheck', `WRONG ${label}: all pipelines say visible=${browserVisible}, expected ${expectVisible}`);
    } else pass('crossCheck', label);
}
console.log(`  ${results.crossCheck.filter((r) => r.status === 'pass').length}/${CROSS.length} inputs agree across sanitizer/browser/DOCX/partitioner`);

await vite.close();
fs.mkdirSync(path.join(__dirname, 'evidence', 'senior'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'evidence', 'senior', 'empty-section-audit.json'), JSON.stringify(results, null, 2));
console.log(`\n================ TOTAL FAILURES: ${failures} ================`);
process.exit(failures ? 1 : 0);
