/**
 * DIR-066 — template thumbnail freshness probe.
 *
 * WHY THIS EXISTS
 *   Refreshing the 51 catalog thumbnails is only half the guarantee. Nothing
 *   stopped them silently drifting out of date again the next time the layout
 *   engine changes, and a stale gallery is exactly the defect the directive
 *   names. This probe re-renders each template's LIVE page 1 in headless
 *   Chromium, downscales BOTH the live sheet and the stored CvN.JPG to the same
 *   16x16 grayscale signature, and asserts the mean absolute difference between
 *   them is small — i.e. the shipped thumbnail really is a snapshot of the
 *   current adaptive layout engine.
 *
 *   It runs against an in-process vite server supplied by run-probes.mjs
 *   (`LAB_BASE`) and the Playwright-bundled Chromium (`CHROMIUM_PATH`), so no
 *   detached or background server is ever spawned (XAMPP invariant).
 *
 * Usage: node template-lab/freshness-probe.mjs [fixture]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
// The thumbnails are generated with the canonical `normal` profile, so the live
// comparison must use the same profile regardless of the runner's fixture arg.
const FIXTURE = process.env.PREVIEW_FIXTURE || 'normal';
// The stored image is a metadata-stripped baseline JPEG; a 16x16 grayscale
// signature of the same sheet lands well inside this band (measured ~2-5).
const MAX_MAD = 14;

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote', '--font-render-hinting=none'],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 }, deviceScaleFactor: 1.25 });
await ctx.route('**fonts.g**', (r) => r.abort());

const rows = [];
for (const templateId of TEMPLATE_IDS) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${FIXTURE}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.smart-resume-page', { timeout: 30_000 });
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(400);
    const sheet = page.locator('.smart-resume-page').first();
    const liveShot = await sheet.screenshot({ type: 'jpeg', quality: 70 });
    const liveDataUrl = `data:image/jpeg;base64,${liveShot.toString('base64')}`;
    const thumbUrl = `/src/assets/resumesNew/${templateId}.JPG`;

    const result = await page.evaluate(async ({ liveSrc, storedSrc }) => {
        const load = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`image failed to load: ${src.slice(0, 60)}`));
            img.src = src;
        });
        const signature = (img) => {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            const c = canvas.getContext('2d', { willReadFrequently: true });
            c.drawImage(img, 0, 0, 16, 16);
            const d = c.getImageData(0, 0, 16, 16).data;
            const out = [];
            for (let i = 0; i < d.length; i += 4) {
                out.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            }
            return out;
        };
        const [live, stored] = await Promise.all([load(liveSrc), load(storedSrc)]);
        const a = signature(live);
        const b = signature(stored);
        let sum = 0;
        for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
        return { mad: +(sum / a.length).toFixed(2) };
    }, { liveSrc: liveDataUrl, storedSrc: thumbUrl });

    const stale = result.mad > MAX_MAD;
    rows.push({ template: templateId, mad: result.mad, stale });
    console.log(`${templateId.padEnd(6)} mad=${String(result.mad).padStart(6)}  ${stale ? 'STALE' : 'fresh'}`);
    await page.close();
}
await browser.close();

const outDir = path.join(__dirname, 'evidence', 'dir066');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'thumbnail-freshness.json'), JSON.stringify({ fixture: FIXTURE, maxMad: MAX_MAD, rows }, null, 2));

const stale = rows.filter((r) => r.stale);
if (stale.length) {
    console.error(`\nFRESHNESS FAIL: ${stale.length} thumbnail(s) no longer match the live engine (mad > ${MAX_MAD}):`);
    for (const s of stale) console.error(`  ${s.template}: mad=${s.mad}`);
    process.exit(1);
}
console.log(`\nFRESHNESS PASS: all ${rows.length} thumbnails match the live adaptive engine (max mad ${Math.max(...rows.map((r) => r.mad))}).`);
