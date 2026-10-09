/**
 * DIR-065 — grid-card DOM census.
 *
 * WHY THIS EXISTS
 *   The adaptive partitioner estimates card heights BEFORE the browser lays the
 *   grid out, so the only way to prove the estimate is honest is to measure the
 *   real DOM. This probe renders the `gridDense` fixture (5 projects + 5
 *   certifications — the Babu M profile) and, per A4 sheet, compares every
 *   `.smart-card-item` / `.smart-cert-item` box against the `.smart-page-footer`
 *   top edge. Any card that crosses the footer is a FAIL.
 *
 *   It runs against an in-process vite server supplied by run-probes.mjs
 *   (`LAB_BASE`) and the Playwright-bundled Chromium (`CHROMIUM_PATH`), so no
 *   detached or background server is ever spawned (XAMPP invariant preserved).
 *
 * Usage: node template-lab/census-probe.mjs [fixture] [--templates Cv1,Cv4]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const fixture = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'gridDense';
const tIdx = process.argv.indexOf('--templates');
const templates = tIdx >= 0 ? process.argv[tIdx + 1].split(',') : ALL_TEMPLATE_IDS;

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 } });
await ctx.route('**fonts.g**', (r) => r.abort());
const rows = [];
for (const templateId of templates) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${fixture}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.smart-resume-page, [class*="-board"]', { timeout: 30000 });
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
        const pages = [...document.querySelectorAll('.smart-resume-page')];
        const out = [];
        for (const pg of pages) {
            const b = pg.getBoundingClientRect();
            const footer = pg.querySelector('.smart-page-footer');
            const footerTop = footer ? footer.getBoundingClientRect().top : b.bottom;
            const cards = [...pg.querySelectorAll('.smart-card-item, .smart-cert-item')];
            let worstOverlap = 0;
            let worstLabel = null;
            let belowPage = 0;
            for (const card of cards) {
                const cr = card.getBoundingClientRect();
                const overlap = cr.bottom - footerTop;
                if (overlap > worstOverlap) {
                    worstOverlap = overlap;
                    worstLabel = (card.textContent || '').trim().slice(0, 50);
                }
                if (cr.bottom > b.bottom + 1) belowPage += 1;
            }
            out.push({
                cards: cards.length,
                footerTopPx: Math.round(footerTop - b.top),
                worstOverlapPx: Math.round(Math.max(0, worstOverlap)),
                belowPage,
                worstLabel,
            });
        }
        return out;
    });
    const overlap = r.reduce((max, p) => Math.max(max, p.worstOverlapPx), 0);
    rows.push({ template: templateId, pages: r, worstOverlapPx: overlap });
    const sample = (r.find((p) => p.worstLabel) || {}).worstLabel;
    console.log(`${templateId.padEnd(6)} pages=${r.length} cards=${r.reduce((a, p) => a + p.cards, 0)} worstOverlap=${overlap}px${sample ? ` sample="${sample}"` : ''}`);
    await page.close();
}
await browser.close();

const outDir = path.join(__dirname, 'evidence', 'dir065');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `census-${fixture}.json`), JSON.stringify(rows, null, 2));

const offenders = rows.filter((row) => row.worstOverlapPx > 1);
if (offenders.length) {
    console.error(`\nCENSUS FAIL: ${offenders.length} template(s) have a grid card overlapping the page footer:`);
    for (const o of offenders) console.error(`  ${o.template}: ${o.worstOverlapPx}px`);
    process.exit(1);
}
console.log(`\nCENSUS PASS: no grid card overlaps the page footer across ${rows.length} template(s).`);
