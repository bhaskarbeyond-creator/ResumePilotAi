/**
 * DIR-064 — TRUE visual DOCX ↔ PDF parity, via LibreOffice.
 *
 * WHY THIS EXISTS
 * ---------------
 * DIR-063 delivered OOXML-level contract assertions (section order, typography,
 * bullet indent, dates, contact lines) and print-media emulation. That is a
 * *structural* proxy. The directive's actual ask — "100% PDF vs DOCX structural &
 * VISUAL parity" — needs the .docx to be RENDERED and compared against the PDF
 * image. `backend/test/docx-parity.test.js` even says so in its own limits.
 *
 * LibreOffice 26.8.1.1 is installed, so that is now possible:
 *
 *   DOCX (backend createResumeDocx)  --soffice-->  PDF  --soffice-->  PNG
 *   Lab page (Chromium print)        ---------->  PDF  --soffice-->  PNG
 *                                                                    |
 *                                                        pixel comparison
 *
 * BOTH rasters are produced by the SAME renderer (LibreOffice Draw's PNG export),
 * so the comparison is renderer-fair: any difference is a document difference, not
 * a rasteriser difference.
 *
 * BOTH sides are fed the SAME fixture (template-lab/fixtures.js), so a mismatch can
 * only come from the DOCX/PDF generators — never from different input data.
 *
 * Usage: node template-lab/docx-visual-parity.mjs [--templates Cv1,Cv2] [--limit 5]
 */
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import { FIXTURES, ALL_TEMPLATE_IDS } from './fixtures.js';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const { createResumeDocx } = require(path.join(ROOT, 'backend', 'services', 'docxExport.js'));

const SOFFICE = process.env.SOFFICE_PATH || 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
const WORK = path.join(os.tmpdir(), 'dir064-visual');
const PROFILE = 'file:///' + path.join(WORK, 'lo-profile').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'evidence', 'dir064');

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const templates = argOf('--templates', '').split(',').map((s) => s.trim()).filter(Boolean);
const limit = Number(argOf('--limit', '0')) || 0;
let list = templates.length ? templates : ALL_TEMPLATE_IDS;
if (limit) list = list.slice(0, limit);

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/** Locate the Playwright-bundled Chromium (same detection as run-probes.mjs). */
function findChromium() {
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
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
  return undefined; // let Playwright resolve its own default
}

/** Decode a PNG into {width,height,inkPct,meanLum,hash} in one pass. */
function analyse(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width, height, data } = png;
  let ink = 0, lumSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lumSum += lum;
    if (lum < 235) ink++;                       // non-white => ink
  }
  const px = width * height;
  // 8x8 average-hash over luminance, 64 bits.
  const gw = 8, gh = 8, cells = new Array(gw * gh).fill(0), counts = new Array(gw * gh).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const c = Math.min(gh - 1, Math.floor((y / height) * gh)) * gw + Math.min(gw - 1, Math.floor((x / width) * gw));
      cells[c] += lum; counts[c]++;
    }
  }
  const avg = cells.map((s, i) => (counts[i] ? s / counts[i] : 255));
  const mean = avg.reduce((a, b) => a + b, 0) / avg.length;
  const hash = avg.map((v) => (v < mean ? 1 : 0));
  return { width, height, inkPct: +((ink / px) * 100).toFixed(2), meanLum: +(lumSum / px).toFixed(1), hash };
}

const hamming = (a, b) => a.reduce((d, v, i) => d + (v === b[i] ? 0 : 1), 0);

/** A4 at ~96dpi is 794x1123; LibreOffice PNG export may differ slightly. */
const ASPECT_A4 = 794 / 1123;

async function main() {
  const chromiumPath = process.env.CHROMIUM_PATH || findChromium();
  const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1900 } });

  const vite = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
  const server = await vite.listen();
  const base = `http://127.0.0.1:${server.config.server.port}`;
  await (await fetch(`${base}/template-lab/index.html`)).text();   // warm vite

  const rows = [];
  let fails = 0;
  try {
    for (const id of list) {
      const row = { template: id };
      try {
        // 1. DOCX from the SAME fixture the lab renders.
        const fixture = FIXTURES.normal;
        const docxBuf = await createResumeDocx({ ...fixture, template: id });
        const docxPath = path.join(WORK, `${id}.docx`);
        fs.writeFileSync(docxPath, docxBuf);

        // 2. DOCX -> PDF -> PNG (LibreOffice).
        const docxPdf = await sofficeConvert(docxPath, 'pdf', path.join(WORK, 'docx-pdf'));
        const docxPng = await sofficeConvert(docxPdf, 'png', path.join(WORK, 'docx-png'));

        // 3. Lab page -> PDF (Chromium print) -> PNG (same LibreOffice rasteriser).
        const page = await ctx.newPage();
        await page.goto(`${base}/template-lab/index.html?template=${id}&fixture=normal&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('.smart-resume-page, [class*="-board"]', { timeout: 30000 });
        await page.emulateMedia({ media: 'print' });
        const webPdf = path.join(WORK, `${id}-web.pdf`);
        await page.pdf({ path: webPdf, format: 'A4', printBackground: true });
        await page.close();
        const webPng = await sofficeConvert(webPdf, 'png', path.join(WORK, 'web-png'));

        // 4. Compare.
        const a = analyse(docxPng);   // DOCX rendering
        const b = analyse(webPng);    // app/PDF rendering
        row.docxInk = a.inkPct; row.pdfInk = b.inkPct;
        row.inkDelta = +(a.inkPct - b.inkPct).toFixed(2);
        row.phashDistance = hamming(a.hash, b.hash);
        row.docxAspect = +(a.width / a.height).toFixed(3);
        row.pdfAspect = +(b.width / b.height).toFixed(3);
        row.a4 = Math.abs(a.width / a.height - ASPECT_A4) < 0.05 && Math.abs(b.width / b.height - ASPECT_A4) < 0.05;
        // PASS: both rasters are A4-ish, ink coverage within 8 points, phash within 20/64.
        row.pass = row.a4 && Math.abs(row.inkDelta) <= 8 && row.phashDistance <= 20;
        if (!row.pass) fails++;
      } catch (e) {
        row.error = String(e && e.message || e).slice(0, 200);
        fails++;
      }
      rows.push(row);
      const tag = row.error ? `ERROR ${row.error}` : `${row.pass ? 'PASS' : 'FAIL'} ink ${row.docxInk}% vs ${row.pdfInk}% (Δ${row.inkDelta}) phash ${row.phashDistance}/64`;
      console.log(`${id.padEnd(7)} ${tag}`);
    }
  } finally {
    await browser.close();
    await server.close().catch(() => {});
  }

  fs.writeFileSync(path.join(OUT, 'visual-parity.json'), JSON.stringify({ generatedAt: new Date().toISOString(), soffice: SOFFICE, rows }, null, 2));
  const passed = rows.length - fails;
  console.log(`\n${passed}/${rows.length} templates pass visual DOCX<->PDF parity`);
  console.log(`report: template-lab/evidence/dir064/visual-parity.json`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });

async function sofficeConvert(input, target, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  await execFileAsync(SOFFICE, [
    '--headless', '--norestore', '--nolockcheck', `-env:UserInstallation=${PROFILE}`,
    '--convert-to', target, '--outdir', outDir, input,
  ], { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const produced = path.join(outDir, path.basename(input).replace(/\.[^.]+$/, '') + '.' + target.split(':')[0]);
  if (!fs.existsSync(produced)) throw new Error(`LibreOffice produced no ${target} for ${path.basename(input)}`);
  return produced;
}
