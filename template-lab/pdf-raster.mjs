/**
 * Rasterises real PDF bytes to PNG so the FINAL PDF (not a browser screenshot)
 * can be inspected visually. Uses pdf.js in Chromium — the PDF is decoded from
 * its own bytes, so what you see is what a PDF reader shows.
 *
 * Usage: node template-lab/pdf-raster.mjs <pdf-file> [...more] [--scale 1.4]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';
const argv = process.argv.slice(2);
const scaleIdx = argv.indexOf('--scale');
const scale = scaleIdx >= 0 ? argv[scaleIdx + 1] : '1.4';
const files = argv.filter((a, i) => !a.startsWith('--') && (scaleIdx < 0 || i !== scaleIdx + 1));

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });
for (const file of files) {
    const abs = path.resolve(file);
    const rel = path.relative(path.resolve(__dirname, '..'), abs).split(path.sep).join('/');
    await page.goto(`${BASE}/template-lab/pdf-raster.html?file=/${rel}&scale=${scale}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-pdf-state="ready"]', { timeout: 60000 });
    const count = Number(await page.getAttribute('html', 'data-pdf-pages'));
    for (let i = 1; i <= count; i++) {
        const target = abs.replace(/\.pdf$/i, `__pdfpage${i}.png`);
        await page.locator(`canvas[data-page="${i}"]`).screenshot({ path: target });
        console.log(`${path.basename(target)}`);
    }
}
await browser.close();
