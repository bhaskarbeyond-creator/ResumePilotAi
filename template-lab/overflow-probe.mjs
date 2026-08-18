/**
 * Visible-content overflow probe.
 *
 * `innerText` still returns text that is clipped by `overflow:hidden`, so a
 * text-coverage probe cannot prove a resume is actually READABLE. This probe
 * measures, per page, whether any rendered element's box extends past the
 * bottom of its A4 sheet (i.e. the ink is cut off in print/PDF) and how much
 * of page 1 is wasted whitespace.
 *
 * Usage: node template-lab/overflow-probe.mjs [fixture] [--templates Cv1,Cv2]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const fixture = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'long';
const tIdx = process.argv.indexOf('--templates');
const templates = tIdx >= 0 ? process.argv[tIdx + 1].split(',') : TEMPLATE_IDS;

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
    await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${fixture}&lang=en`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.smart-resume-page', { timeout: 30000 });
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
        const pages = [...document.querySelectorAll('.smart-resume-page')];
        const out = [];
        for (const pg of pages) {
            const b = pg.getBoundingClientRect();
            let cutBelow = 0, cutCount = 0, lowestInk = b.top, cutSample = null;
            const walk = (el) => {
                for (const child of el.children) {
                    const cr = child.getBoundingClientRect();
                    const text = (child.textContent || '').trim();
                    if (cr.height > 0 && text) {
                        if (cr.bottom > b.bottom + 1) {
                            cutCount++;
                            cutBelow = Math.max(cutBelow, cr.bottom - b.bottom);
                            if (!cutSample) cutSample = text.slice(0, 60);
                        }
                        if (cr.bottom <= b.bottom + 1) lowestInk = Math.max(lowestInk, cr.bottom);
                    }
                    walk(child);
                }
            };
            walk(pg);
            const footer = pg.querySelector('.smart-page-footer');
            const footTop = footer ? footer.getBoundingClientRect().top : b.bottom;
            out.push({
                height: Math.round(b.height),
                cutCount,
                cutBelowPx: Math.round(cutBelow),
                cutSample,
                inkBottomPct: +(((lowestInk - b.top) / b.height) * 100).toFixed(1),
                emptyTailPct: +(((footTop - lowestInk) / b.height) * 100).toFixed(1),
            });
        }
        return out;
    });
    rows.push({ template: templateId, pages: r });
    const worst = r.reduce((a, p) => Math.max(a, p.cutBelowPx), 0);
    const p1 = r[0];
    console.log(`${templateId.padEnd(6)} pages=${r.length} clippedElems=${r.reduce((a, p) => a + p.cutCount, 0)} maxCut=${worst}px p1Ink=${p1.inkBottomPct}% p1EmptyTail=${p1.emptyTailPct}%${p1.cutSample ? ' sample="' + p1.cutSample + '"' : ''}`);
    await page.close();
}
await browser.close();
fs.writeFileSync(path.join(__dirname, 'evidence', 'senior', `overflow-${fixture}.json`), JSON.stringify(rows, null, 2));
const clipped = rows.filter((r) => r.pages.some((p) => p.cutCount > 0));
console.log(`\n${clipped.length}/${rows.length} templates clip visible content with fixture "${fixture}"`);
const wasted = rows.filter((r) => r.pages.length > 1 && r.pages[0].emptyTailPct > 12);
console.log(`${wasted.length}/${rows.length} templates waste >12% of page 1 while spilling to page 2`);
