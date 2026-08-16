/**
 * Builds contact sheets from the audit screenshots so a human reviewer can
 * visually inspect every template in a handful of images.
 * Usage: node template-lab/contact-sheets.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, 'shots');
const SHEETS_DIR = path.join(__dirname, 'sheets');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/tmp/chromium/chromium';
const PER_SHEET = 17;
const COLS = 3;

const TEMPLATES = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

function serveShots() {
  const server = http.createServer((req, res) => {
    const file = path.join(SHOTS_DIR, path.basename(String(req.url)));
    if (!file.startsWith(SHOTS_DIR) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  fs.mkdirSync(SHEETS_DIR, { recursive: true });
  const { server, port } = await serveShots();
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    env: { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` },
    args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'],
  });
  const page = await browser.newPage();
  const missing = [];
  for (let sheet = 0; sheet < Math.ceil(TEMPLATES.length / PER_SHEET); sheet++) {
    const ids = TEMPLATES.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
    const cards = ids.map((id) => {
      const file = path.join(SHOTS_DIR, `${id}__normal.png`);
      if (!fs.existsSync(file)) { missing.push(id); return `<div class="card"><div class="name">${id} MISSING</div></div>`; }
      return `<div class="card"><div class="name">${id}</div><img src="http://127.0.0.1:${port}/${id}__normal.png" /></div>`;
    }).join('');
    const html = `<!doctype html><html><head><style>
      body { margin: 0; padding: 12px; background: #e2e8f0; font-family: sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr); gap: 10px; }
      .card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
      .name { font-size: 14px; font-weight: 700; padding: 4px 8px; background: #1e293b; color: #fff; }
      img { width: 100%; display: block; }
    </style></head><body><div class="grid">${cards}</div></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    });
    await page.waitForTimeout(400);
    const out = path.join(SHEETS_DIR, `sheet-${String(sheet + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log('wrote', out);
  }
  if (missing.length) console.log('MISSING SHOTS:', missing.join(','));
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
