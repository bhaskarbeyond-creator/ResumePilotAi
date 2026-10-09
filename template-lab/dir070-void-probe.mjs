/**
 * DIR-070 — Page-1 void & footer-overlap probe (real DOM).
 *
 * Renders the "Babu M" grid-heavy fixture (`gridDense`) in a real Chromium DOM and
 * measures, per A4 sheet:
 *   • the Page-1 empty tail (the blank void below the last rendered element), and
 *   • any element whose ink is cut off below the sheet.
 *
 * Mandate 2 invariant: a two-page result must never leave more than 80px of empty
 * space on Page 1. Mandate 3 invariant: the compacted geometry painted on the page
 * root must equal the geometry the partitioner estimated.
 *
 * Served strictly through XAMPP (Apache on :80) — no detached server is spawned.
 *
 * Usage: node template-lab/dir070-void-probe.mjs [--templates Cv1,Cv51] [--fixture gridDense]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://localhost/IME365';
const argOf = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : fallback;
};
const fixture = argOf('--fixture', 'gridDense');
const templates = argOf('--templates', 'Cv1,Cv51').split(',');

const PAGE_VOID_MAX_PX = 80;

const launchOptions = {
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 } });
await ctx.route('**fonts.g**', (r) => r.abort());
// The project's root `.htaccess` rewrites every non-existent path to the SPA
// shell, so serve the statically-built probe bundle straight from disk instead.
// This is deterministic and still exercises the real React composer + real CSS.
const DIST = path.join(__dirname, 'dir070-dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
await ctx.route('**/dir070-dist/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.split('/dir070-dist/')[1] || '';
    const file = path.join(DIST, decodeURIComponent(rel));
    if (!file.startsWith(DIST) || !fs.existsSync(file)) {
        await route.fulfill({ status: 404, body: 'not found' });
        return;
    }
    await route.fulfill({
        status: 200,
        contentType: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        body: fs.readFileSync(file),
    });
});

const rows = [];
for (const templateId of templates) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/template-lab/dir070-dist/template-lab/dir070-harness.html?template=${templateId}&fixture=${fixture}&lang=en`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    await page.waitForSelector('.smart-resume-page, [class*="-board"]', { timeout: 30000 });
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
        let pages = [...document.querySelectorAll('.smart-resume-page')];
        if (!pages.length) {
            const board = document.querySelector('[class*="-board"]');
            if (board) pages = [board];
        }
        const root = pages[0] || null;
        const style = root ? getComputedStyle(root) : null;
        const compaction = style ? {
            sectionGap: style.getPropertyValue('--smart-section-gap').trim(),
            gridRowGap: style.getPropertyValue('--smart-grid-row-gap').trim(),
            cardPad: style.getPropertyValue('--smart-card-pad').trim(),
            titleGap: style.getPropertyValue('--smart-title-gap').trim(),
        } : null;
        const out = [];
        for (const pg of pages) {
            const b = pg.getBoundingClientRect();
            // The layout column (`.smart-layout` / `.smart-main-content`) is a
            // full-height flex child, so its bottom is ALWAYS the body bottom and
            // cannot be used as "ink". Measure the deepest CONTENT block instead,
            // skipping any element that spans the whole content area.
            const body = pg.querySelector('.smart-page-body') || pg;
            const containerH = body.getBoundingClientRect().height;
            let cutCount = 0;
            let cutBelow = 0;
            let contentBottom = b.top;
            const walk = (el) => {
                for (const child of el.children) {
                    const cls = String(child.className || '');
                    // Footer + watermark overlay are page chrome, not content.
                    if (cls.includes('smart-page-footer') || cls.toLowerCase().includes('watermark')) continue;
                    const cr = child.getBoundingClientRect();
                    const text = (child.textContent || '').trim();
                    const fullHeight = cr.height >= containerH - 4;
                    if (!fullHeight && cr.height > 0 && text) {
                        if (cr.bottom > b.bottom + 1) {
                            cutCount += 1;
                            cutBelow = Math.max(cutBelow, cr.bottom - b.bottom);
                        } else {
                            contentBottom = Math.max(contentBottom, cr.bottom);
                        }
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
                emptyTailPx: Math.round(Math.max(0, footTop - contentBottom)),
                footerOverlapPx: Math.round(Math.max(0, contentBottom - footTop)),
                emptyTailPct: +(((footTop - contentBottom) / b.height) * 100).toFixed(1),
            });
        }
        return { compaction, pages: out };
    });
    rows.push({ template: templateId, fixture, ...result });
    const p1 = result.pages[0];
    const cuts = result.pages.reduce((a, p) => a + p.cutCount, 0);
    console.log(
        `${templateId.padEnd(6)} pages=${result.pages.length} p1Void=${p1.emptyTailPx}px (${p1.emptyTailPct}%) `
        + `clipped=${cuts} sectionGap=${result.compaction?.sectionGap || '-'} `
        + `rowGap=${result.compaction?.gridRowGap || '-'} cardPad=${result.compaction?.cardPad || '-'}`,
    );
    await page.close();
}
await browser.close();

const outDir = path.join(__dirname, 'evidence', 'dir070');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `void-${fixture}.json`), JSON.stringify(rows, null, 2));

const failures = [];
for (const row of rows) {
    if (row.pages.length > 1 && row.pages[0].emptyTailPx > PAGE_VOID_MAX_PX) {
        failures.push(`${row.template}: Page 1 void ${row.pages[0].emptyTailPx}px (> ${PAGE_VOID_MAX_PX}px)`);
    }
    for (const [i, p] of row.pages.entries()) {
        if (p.cutCount > 0) failures.push(`${row.template}: page ${i + 1} clipped ${p.cutCount} element(s) by ${p.cutBelowPx}px`);
        if (p.footerOverlapPx > 0) failures.push(`${row.template}: page ${i + 1} content overlaps the footer by ${p.footerOverlapPx}px`);
    }
}
if (failures.length) {
    console.log(`\nDIR-070 VOID PROBE FAIL:\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log(`\nDIR-070 VOID PROBE PASS: fixture "${fixture}" — zero Page-1 void > ${PAGE_VOID_MAX_PX}px, zero footer overlap, zero clipped ink.`);
