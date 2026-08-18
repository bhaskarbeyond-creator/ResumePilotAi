/**
 * Regenerates the 51 Choose-Template preview images from the REAL production
 * render path (TemplateRenderer -> SmartResumeComposer) in Chromium.
 *
 * Every preview is a screenshot of page 1 of the actual A4 sheet the engine
 * paints for a shared reference resume, so the Choose-Template card, the
 * browser preview, the PDF and the DOCX all describe the same design.
 *
 * Requires the dev server (npm run dev) and a Chromium binary.
 * Usage: node template-lab/regenerate-previews.mjs [--templates Cv1,Cv2]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, '..', 'src', 'assets', 'resumesNew');
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const FIXTURE = process.env.PREVIEW_FIXTURE || 'normal';
const tIdx = process.argv.indexOf('--templates');
const templates = tIdx >= 0 ? process.argv[tIdx + 1].split(',') : TEMPLATE_IDS;

// The preview gate requires 50 KB < size < 400 KB authentic JPEG. We aim well
// below the ceiling: the Choose-Template grid loads 51 of these, so every
// avoidable kilobyte is 51 kB of page weight.
const MIN_BYTES = 60_000;
const MAX_BYTES = 145_000;

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote', '--font-render-hinting=none'],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 }, deviceScaleFactor: 1.25 });

for (const templateId of templates) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=${FIXTURE}&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.smart-resume-page', { timeout: 30_000 });
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(500);
    const sheet = page.locator('.smart-resume-page').first();

    let buffer = null;
    for (const quality of [82, 74, 68, 62, 56, 50, 44]) {
        buffer = await sheet.screenshot({ type: 'jpeg', quality });
        if (buffer.length <= MAX_BYTES) break;
    }
    if (buffer.length < MIN_BYTES) {
        // Very sparse layouts compress below the gate floor; raise fidelity.
        for (const quality of [90, 95, 98]) {
            buffer = await sheet.screenshot({ type: 'jpeg', quality });
            if (buffer.length > MIN_BYTES) break;
        }
    }
    const target = path.join(ASSETS, `${templateId}.JPG`);
    fs.writeFileSync(target, buffer);
    const ok = buffer[0] === 0xff && buffer[1] === 0xd8;
    console.log(`${templateId.padEnd(6)} ${String(buffer.length).padStart(7)} bytes  jpeg=${ok}  ${buffer.length > MIN_BYTES && buffer.length < MAX_BYTES ? 'in-gate' : 'OUT-OF-GATE'}`);
    await page.close();
}
await browser.close();
