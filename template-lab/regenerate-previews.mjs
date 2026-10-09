/**
 * Regenerates the 51 Choose-Template preview images from the REAL production
 * render path (TemplateRenderer -> SmartResumeComposer) in Chromium.
 *
 * Every preview is a screenshot of page 1 of the actual A4 sheet the engine
 * paints for a shared reference resume, so the Choose-Template card, the
 * browser preview, the PDF and the DOCX all describe the same design.
 *
 * DIR-066 — fully automated and cross-platform: hosts vite IN-PROCESS when
 * LAB_BASE is unset (no detached/background server — XAMPP invariant) and
 * auto-detects the Playwright-bundled Chromium instead of a hardcoded Linux
 * path, with an optional guarded `sharp` metadata-strip/baseline-JPEG pass.
 *
 * Usage: node template-lab/regenerate-previews.mjs [--templates Cv1,Cv2]
 */
import { createServer } from 'vite';
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS = path.resolve(PROJECT_ROOT, 'src', 'assets', 'resumesNew');
const FIXTURE = process.env.PREVIEW_FIXTURE || 'normal';
const tIdx = process.argv.indexOf('--templates');
const templates = tIdx >= 0 ? process.argv[tIdx + 1].split(',') : TEMPLATE_IDS;

// The preview gate requires 50 KB < size < 400 KB authentic JPEG. We aim well
// below the ceiling: the Choose-Template grid loads 51 of these, so every
// avoidable kilobyte is 51 kB of page weight.
const MIN_BYTES = 60_000;
const MAX_BYTES = 145_000;

/** Locate the Playwright-bundled Chromium without a hardcoded platform path. */
function findChromium() {
    if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
    const roots = [
        path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
        path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
        path.join(os.homedir(), '.cache', 'ms-playwright'),
    ];
    for (const root of roots) {
        if (!root || !fs.existsSync(root)) continue;
        const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
        for (const d of dirs) {
            for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) {
                const exe = path.join(root, d, rel);
                if (fs.existsSync(exe)) return exe;
            }
        }
    }
    return null;
}

const chromiumPath = findChromium();
if (!chromiumPath) {
    console.error('[regenerate-previews] No Chromium found. Set CHROMIUM_PATH to a chrome binary.');
    process.exit(2);
}
console.log(`[regenerate-previews] Chromium: ${chromiumPath}`);

// Optional sharp post-pass — strips metadata and re-encodes a baseline JPEG.
// Loaded dynamically so the refresh still works where sharp is not installed.
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { sharp = null; }
console.log(`[regenerate-previews] sharp: ${sharp ? 'available' : 'not installed (post-pass skipped)'}`);

// IN-PROCESS vite when LAB_BASE is unset. Closed in a finally so it can never
// outlive this run and no detached/background server is ever spawned.
let server = null;
let BASE = process.env.LAB_BASE;
if (!BASE) {
    const vite = await createServer({ root: PROJECT_ROOT, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
    server = await vite.listen();
    BASE = `http://127.0.0.1:${server.config.server.port}`;
    try { const res = await fetch(`${BASE}/template-lab/index.html`); await res.text(); } catch { /* warm-up is best-effort */ }
    console.log(`[regenerate-previews] vite in-process on ${BASE}`);
} else {
    console.log(`[regenerate-previews] using external LAB_BASE ${BASE}`);
}

let outOfGate = 0;
try {
    const browser = await chromium.launch({
        executablePath: chromiumPath,
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

        // Optional optimize pass: strip metadata + baseline JPEG, but only when
        // the re-encoded buffer stays inside the gate and keeps its JPEG magic.
        if (sharp) {
            try {
                const optimized = await sharp(buffer).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
                if (optimized.length >= MIN_BYTES && optimized.length <= MAX_BYTES
                    && optimized[0] === 0xff && optimized[1] === 0xd8) {
                    buffer = optimized;
                }
            } catch { /* keep the raw screenshot on any sharp failure */ }
        }

        const target = path.join(ASSETS, `${templateId}.JPG`);
        fs.writeFileSync(target, buffer);
        const ok = buffer[0] === 0xff && buffer[1] === 0xd8;
        const inGate = buffer.length > MIN_BYTES && buffer.length < MAX_BYTES;
        if (!inGate) outOfGate += 1;
        console.log(`${templateId.padEnd(6)} ${String(buffer.length).padStart(7)} bytes  jpeg=${ok}  ${inGate ? 'in-gate' : 'OUT-OF-GATE'}`);
        await page.close();
    }
    await browser.close();
} finally {
    if (server) await server.close().catch(() => {});
}

if (outOfGate) {
    console.error(`[regenerate-previews] ${outOfGate} image(s) outside the gate.`);
    process.exit(1);
}
console.log(`[regenerate-previews] done. ${templates.length} image(s) refreshed.`);
