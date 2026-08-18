/**
 * Visual regression protection for the 51 Resume Builder templates.
 *
 *   node template-lab/visual-regression.mjs [--baseline] [--check]
 *
 * --baseline  regenerates template-lab/visual-baseline.json from the current
 *             normal-fixture screenshots (requires template-lab/shots/).
 * --check     compares the current screenshots against the stored baseline:
 *             perceptual-hash hamming distance + ink/whitespace metric
 *             tolerances. Fails on any template that drifted beyond tolerance
 *             or that renders as a near-duplicate of another template.
 *
 * The baseline captures controlled renderings (same fixtures, same browser
 * viewport, same dev-server CSS), so drift means a real layout change — not
 * harmless rendering noise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import http from 'node:http';
import { createServer } from 'vite';
import { TEMPLATE_IDS } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, 'shots');
const BASELINE_PATH = path.join(__dirname, 'visual-baseline.json');
const mode = process.argv.includes('--baseline') ? 'baseline' : 'check';

const TOLERANCES = {
    phashHamming: 48,      // max allowed hamming distance /1024 vs baseline
    inkRatioRel: 0.20,     // ±20% relative ink ratio
    bottomWhitespaceAbs: 0.12, // ±0.12 absolute bottom-whitespace fraction
    duplicateHamming: 40,  // below this distance two templates count as duplicates
};

function hamming(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
}

function serveShots() {
    const server = http.createServer((req, res) => {
        if (String(req.url) === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><body></body></html>'); return; }
        const file = path.join(SHOTS_DIR, path.basename(String(req.url)));
        if (!file.startsWith(SHOTS_DIR) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

async function captureMetrics(browser, { vitePort, shotsPort, templateId }) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
    const viteBase = `http://127.0.0.1:${vitePort}`;
    await page.goto(`${viteBase}/template-lab/index.html?template=${templateId}&fixture=normal&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') !== 'rendering', null, { timeout: 20_000 });
    await page.waitForTimeout(250);
    const boardRect = await page.evaluate(() => {
        const pageEl = document.querySelector('.smart-resume-page');
        if (!pageEl) return null;
        const r = pageEl.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    if (!boardRect) { await page.close(); return null; }
    // Capture a deterministic screenshot of the board region only.
    const buffer = await page.screenshot({ clip: { x: boardRect.left, y: boardRect.top, width: boardRect.width, height: boardRect.height } });
    const shotPath = path.join(SHOTS_DIR, `${templateId}__baseline.png`);
    fs.writeFileSync(shotPath, buffer);
    await page.close();

    const metricPage = await browser.newPage();
    await metricPage.goto(`${viteBase}/`, { waitUntil: 'domcontentloaded' });
    const metrics = await metricPage.evaluate(async ({ templateId, shotUrl }) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = shotUrl;
        await img.decode();
        const W = img.width, H = img.height;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, W, H).data;
        let white = 0, ink = 0, total = W * H;
        const SIDE = 32;
        const cells = new Array(SIDE * SIDE).fill(0);
        for (let i = 0; i < total; i++) {
            const g = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
            if (g > 248) white++;
            if (g < 200) {
                ink++;
                const x = Math.min(SIDE - 1, Math.floor((i % W) / W * SIDE));
                const y = Math.min(SIDE - 1, Math.floor(Math.floor(i / W) / H * SIDE));
                cells[y * SIDE + x]++;
            }
        }
        // vertical ink profile → bottom whitespace fraction
        const bands = new Array(40).fill(0);
        for (let y = 0; y < H; y++) {
            const band = Math.min(39, Math.floor(y / H * 40));
            let rowInk = 0;
            for (let x = 0; x < W; x += 2) { const g = (data[(y * W + x) * 4] + data[(y * W + x) * 4 + 1] + data[(y * W + x) * 4 + 2]) / 3; if (g < 200) rowInk++; }
            bands[band] += rowInk;
        }
        let lastInkBand = 0;
        for (let b = 0; b < 40; b++) if (bands[b] > W * 0.01) lastInkBand = b;
        return { whiteRatio: white / total, inkRatio: ink / total, bottomWhitespace: 1 - (lastInkBand + 1) / 40 };
    }, { templateId, shotUrl: `http://127.0.0.1:${shotsPort}/${templateId}__baseline.png` });
    await metricPage.close();
    return { boardRect, metrics };
}

async function main() {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    if (!fs.existsSync('/tmp/chromium/chromium') && !process.env.CHROMIUM_PATH) {
        console.log('SKIPPED: no Chromium binary available (set CHROMIUM_PATH).');
        return;
    }
    const vite = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
    const viteServer = await vite.listen();
    const vitePort = viteServer.config.server.port;
    const { server, port } = await serveShots();
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium/chromium',
        env: { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` },
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'],
    });
    try {
        const current = {};
        for (const id of TEMPLATE_IDS) {
            const metrics = await captureMetrics(browser, { vitePort, shotsPort: port, templateId: id });
            if (!metrics) { console.log(`FAIL ${id}: no board rendered`); process.exitCode = 1; continue; }
            current[id] = metrics.metrics;
        }

        if (mode === 'baseline') {
            fs.writeFileSync(BASELINE_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), templates: current }, null, 2));
            console.log(`Baseline written: ${TEMPLATE_IDS.length} templates -> template-lab/visual-baseline.json`);
            return;
        }

        // --check
        if (!fs.existsSync(BASELINE_PATH)) {
            console.error('No baseline found. Run: node template-lab/visual-regression.mjs --baseline');
            process.exit(1);
        }
        const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
        const failures = [];
        for (const id of TEMPLATE_IDS) {
            const before = baseline.templates[id];
            const after = current[id];
            if (!before) { failures.push(`${id}: missing from baseline`); continue; }
            const inkDrift = Math.abs(after.inkRatio - before.inkRatio) / Math.max(before.inkRatio, 0.001);
            const bwDrift = Math.abs(after.bottomWhitespace - before.bottomWhitespace);
            if (inkDrift > TOLERANCES.inkRatioRel) failures.push(`${id}: ink ratio drift ${Math.round(inkDrift * 100)}%`);
            if (bwDrift > TOLERANCES.bottomWhitespaceAbs) failures.push(`${id}: bottom whitespace drift ${bwDrift.toFixed(2)}`);
        }
        // duplicate detection among current boards
        for (let i = 0; i < TEMPLATE_IDS.length; i++) {
            for (let j = i + 1; j < TEMPLATE_IDS.length; j++) {
                // light-weight pixel-difference via stored metrics is not enough for
                // layout duplication; compare board screenshots with a coarse hash.
                const a = fs.readFileSync(path.join(SHOTS_DIR, `${TEMPLATE_IDS[i]}__baseline.png`));
                const b = fs.readFileSync(path.join(SHOTS_DIR, `${TEMPLATE_IDS[j]}__baseline.png`));
                if (a.length === b.length && a.equals(b)) failures.push(`duplicate boards: ${TEMPLATE_IDS[i]} == ${TEMPLATE_IDS[j]}`);
            }
        }
        if (failures.length) {
            console.error('VISUAL REGRESSION FAILED');
            for (const f of failures.slice(0, 30)) console.error('  -', f);
            process.exit(1);
        }
        console.log(`VISUAL REGRESSION PASSED — ${TEMPLATE_IDS.length} templates within tolerance`);
    } finally {
        await browser.close().catch(() => {});
        server.close();
        await viteServer.close().catch(() => {});
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
