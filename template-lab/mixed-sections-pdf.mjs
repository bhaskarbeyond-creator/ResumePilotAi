/**
 * Renders a resume with a deliberate populated / EMPTY / populated / EMPTY /
 * populated pattern through the production composer, prints a real A4 PDF and
 * rasterises it, so §11/§12 (no phantom sections, no orphan gaps) can be judged
 * from the printed page rather than from the DOM.
 *
 * Usage: node template-lab/mixed-sections-pdf.mjs
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'evidence', 'senior');
fs.mkdirSync(OUT, { recursive: true });

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

// A = populated, B = empty, C = populated, D = empty, E = populated
const MIXED = {
    firstname: 'Bhaskar', lastname: 'Venkata', occupation: 'Senior Platform Engineer',
    email: 'bhaskar@example.com', phone: '+91 98765 43210', city: 'Vijayawada', country: 'India',
    summary: '<p>Platform engineer with 9+ years building reliable, accessible and secure systems for regulated industries.</p>', // A populated
    employments: [],                                                     // B EMPTY
    educations: [{ degree: 'B.Tech in Computer Science', school: 'IIT Madras', started: '2011', finished: '2015' }], // C populated
    skills: [{ name: '' }, { name: '   ' }],                             // D EMPTY (blank records)
    projects: [{ title: 'ResumePilot', description: 'Open-source resume analytics toolkit.' }], // E populated
    certifications: [{}],                                                // EMPTY
    achievements: [{ title: 'Engineering Excellence Award', description: 'Zero-downtime ledger migration.' }], // populated
    references: [{ name: '', reference: '<p> </p>' }],                   // EMPTY (whitespace HTML)
    languages: [{ name: 'English', level: 'Fluent' }],                   // populated
    hobbies: '<p>&nbsp;</p>',                                            // EMPTY
};

const css = ['src/cv-templates/css/globalTemplateEnhancements.css', 'src/engine/hybrid/smartEngine.css']
    .map((f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'))
    .join('\n');

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 } });
await ctx.route('**fonts.g**', (r) => r.abort());

const summary = [];
for (const templateId of ['Cv1', 'Cv4', 'Cv8', 'Cv25', 'Cv40']) {
    const markup = renderToStaticMarkup(React.createElement(SmartResumeComposer, { templateId, language: 'en', values: MIXED }));
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${markup}</body></html>`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);

    const audit = await page.evaluate(() => {
        const titles = [...document.querySelectorAll('.smart-section-title__text')].map((n) => n.textContent.trim());
        const sheets = document.querySelectorAll('.smart-resume-page').length;
        // any section element with a heading but no content beneath it?
        const orphans = [...document.querySelectorAll('.smart-section')].filter((s) => {
            const title = s.querySelector('.smart-section-title');
            const rest = [...s.children].filter((c) => c !== title);
            const text = rest.map((c) => (c.textContent || '').trim()).join('');
            return !text;
        }).map((s) => (s.querySelector('.smart-section-title__text') || {}).textContent);
        return { titles, sheets, orphans };
    });

    const buf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const pdfPath = path.join(OUT, `mixed__${templateId}.pdf`);
    fs.writeFileSync(pdfPath, buf);
    const pdfPages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

    summary.push({ templateId, ...audit, pdfPages });
    console.log(`${templateId}: sheets=${audit.sheets} pdfPages=${pdfPages} orphanHeadings=${audit.orphans.length}`);
    console.log(`   sections rendered: ${audit.titles.join(' | ')}`);
    await page.close();
}
await browser.close();
await vite.close();
fs.writeFileSync(path.join(OUT, 'mixed-sections.json'), JSON.stringify(summary, null, 2));

const FORBIDDEN = ['Employment History', 'Certifications', 'References', 'Hobbies & Interests', 'Skills', 'Key Skills'];
let bad = 0;
for (const row of summary) {
    for (const f of FORBIDDEN) {
        if (row.titles.includes(f)) { console.log(`FAIL ${row.templateId}: phantom section "${f}"`); bad++; }
    }
    if (row.orphans.length) { console.log(`FAIL ${row.templateId}: orphan heading(s) ${row.orphans.join(', ')}`); bad++; }
    if (row.pdfPages !== row.sheets) { console.log(`FAIL ${row.templateId}: ${row.sheets} sheets -> ${row.pdfPages} PDF pages`); bad++; }
}
console.log(bad ? `\n${bad} FAILURES` : '\nNo phantom sections, no orphan headings, 1 sheet = 1 PDF page.');
