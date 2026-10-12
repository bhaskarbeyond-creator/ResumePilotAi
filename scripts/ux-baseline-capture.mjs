/**
 * DIR-098 — Baseline screenshot capture (XAMPP-served Playwright).
 *
 * Captures a baseline screenshot for every review unit at every mandated viewport and
 * records horizontal-overflow measurements. XAMPP Apache serves the app (no rogue
 * servers). Writes .bridge/evidence/dir098/baseline/ + baseline-manifest.json.
 *
 * Usage: node scripts/ux-baseline-capture.mjs [--max <n>] [--base <url>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INV = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'inventory.json');
const OUT_DIR = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'baseline');
const MANIFEST = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'baseline-manifest.json');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg('--max', '0')) || Infinity;
const BASE = (arg('--base', process.env.UX_BASE || 'http://localhost/IME365')).replace(/\/+$/, '');

const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
const units = inv.units.slice(0, MAX === Infinity ? inv.units.length : MAX);
const viewports = inv.viewports;

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const results = [];
for (const u of units) {
    const url = BASE + (u.route === '/' ? '' : u.route.replace(/\/\*$/, ''));
    let navOk = false;
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); navOk = true; } catch { /* record as nav-fail */ }
    for (const w of viewports) {
        await page.setViewportSize({ width: w, height: 900 });
        const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)).catch(() => null);
        const file = path.join(OUT_DIR, `${u.reviewId}-${w}.png`);
        try { await page.screenshot({ path: file, fullPage: false }); } catch { /* skip */ }
        results.push({ reviewId: u.reviewId, route: u.route, viewport: w, navOk, overflowX: overflow, screenshot: path.relative(ROOT, file) });
    }
}
await browser.close();

const manifest = {
    generatedAt: new Date().toISOString(),
    directive: 'DIR-098',
    base: BASE,
    unitsCaptured: units.length,
    viewports,
    screenshots: results.length,
    overflowViolations: results.filter((r) => (r.overflowX || 0) > 1).map((r) => `${r.reviewId}@${r.viewport}:${r.overflowX}`),
    results,
};
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Baseline captured: ${units.length} units x ${viewports.length} viewports = ${results.length} screenshots`);
console.log(`Overflow violations: ${manifest.overflowViolations.length}`);
console.log(`Manifest -> ${path.relative(ROOT, MANIFEST)}`);
