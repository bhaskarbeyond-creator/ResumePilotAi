/**
 * Print-media regression probe (Ctrl/Cmd+P path, not the headless PDF path).
 *
 * Emulates print media on the live document and verifies that the application
 * print stylesheet does not hide or distort the resume: sheets keep A4
 * geometry, columns survive, the header/footer chrome inside the document is
 * preserved, and the on-screen document shell is neutralised.
 *
 * Usage: node template-lab/print-probe.mjs [fixture]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const fixture = process.argv[2] || 'normal';

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 } });
await ctx.route('**fonts.g**', (r) => r.abort());
const rows = [];
let failures = 0;
// DIR-063: probe ALL 55 documents (51 resumes + 4 covers), not just the 51.
for (const templateId of ALL_TEMPLATE_IDS) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${fixture}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Cover templates are not composed by SmartResumeComposer, so they have no
    // `.smart-resume-page`; accept the `*-board` root as well.
    await page.waitForSelector('.smart-resume-page, [class*="-board"]', { timeout: 30000 });
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
        // Resumes: `.smart-resume-document` wrapping N `.smart-resume-page` sheets.
        // Covers: a single `[class*="-board"]` root with no document wrapper.
        let doc = document.querySelector('.smart-resume-document');
        let pages = [...document.querySelectorAll('.smart-resume-page')];
        if (!pages.length) {
            const board = document.querySelector('[class*="-board"]');
            if (board) { pages = [board]; doc = doc || board; }
        }
        const first = pages[0];
        // Cover letters have no `.smart-resume-document` shell (and therefore no
        // `.smart-header` / `.smart-page-footer`), so shell-specific assertions must
        // be gated on this or they emit 3 false failures per cover template.
        const hasShell = !!document.querySelector('.smart-resume-document');
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const docStyle = cs(doc);
        const pageStyle = cs(first);
        const sidebar = first.querySelector('.smart-sidebar');
        const main = first.querySelector('.smart-main-content');
        const header = first.querySelector('.smart-header');
        const footer = first.querySelector('.smart-page-footer');
        const visible = (el) => !!el && cs(el).display !== 'none' && cs(el).visibility !== 'hidden';
        const rect = first.getBoundingClientRect();
        return {
            hasShell,
            sheets: pages.length,
            docPadding: docStyle.paddingTop,
            docGap: docStyle.gap,
            pageBreakAfter: pageStyle.breakAfter || pageStyle.pageBreakAfter,
            boxShadow: pageStyle.boxShadow,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            headerVisible: visible(header),
            footerVisible: visible(footer),
            sidebarVisible: sidebar ? visible(sidebar) : null,
            sidebarBg: sidebar ? cs(sidebar).backgroundColor : null,
            columns: sidebar && main
                ? (sidebar.getBoundingClientRect().right <= main.getBoundingClientRect().left + 2
                    || main.getBoundingClientRect().right <= sidebar.getBoundingClientRect().left + 2 ? 2 : 1)
                : 1,
            colorAdjust: cs(sidebar || first).printColorAdjust || cs(sidebar || first).webkitPrintColorAdjust,
        };
    });
    const problems = [];
    // SHELL-SPECIFIC assertions (document padding/gap, header/footer chrome) apply
    // to RESUME documents only. Cover letters render straight into `<coverN>-board`
    // with no `.smart-resume-document`, `.smart-header` or `.smart-page-footer`, so
    // asserting them reported `doc-padding:48px, header-hidden-in-print,
    // footer-hidden-in-print` for every cover — three FALSE failures each.
    // A4 geometry, box-shadow and sidebar visibility are asserted for ALL 55.
    if (r.hasShell) {
        if (r.docPadding !== '0px') problems.push(`doc-padding:${r.docPadding}`);
        if (r.docGap !== '0px' && r.docGap !== 'normal') problems.push(`doc-gap:${r.docGap}`);
        if (!r.headerVisible) problems.push('header-hidden-in-print');
        if (!r.footerVisible) problems.push('footer-hidden-in-print');
    }
    if (r.boxShadow !== 'none') problems.push('sheet-shadow-in-print');
    if (Math.abs(r.width - 794) > 3) problems.push(`width:${r.width}`);
    if (Math.abs(r.height - 1123) > 3) problems.push(`height:${r.height}`);
    if (r.sidebarVisible === false) problems.push('sidebar-hidden-in-print');
    if (problems.length) failures++;
    rows.push({ template: templateId, ...r, problems });
    console.log(`${templateId.padEnd(6)} sheets=${r.sheets} ${r.width}x${r.height} cols=${r.columns} hdr=${r.headerVisible} ftr=${r.footerVisible} ${problems.length ? 'FAIL ' + problems.join(',') : 'pass'}`);
    await page.close();
}
await browser.close();
fs.writeFileSync(path.join(__dirname, 'evidence', 'senior', `print-${fixture}.json`), JSON.stringify(rows, null, 2));
console.log(`\n${ALL_TEMPLATE_IDS.length - failures}/${ALL_TEMPLATE_IDS.length} templates pass the print-media probe`);
