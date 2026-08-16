/**
 * Computational visual-quality metrics for the 51 Resume Builder templates.
 * Without human eyes in the loop, this measures objective proxies:
 *   A. DOM-side (per template, normal fixture):
 *      - WCAG contrast violations (text vs effective background)
 *      - typography histogram (font sizes/families) & consistency score
 *      - ink density per horizontal band (page-balance) and bottom whitespace
 *      - left/right column balance
 *   B. Pixel-side (from the normal-fixture screenshots):
 *      - % pure-white / blank rows, vertical ink profile → page breaks
 *      - horizontal ink profile → column detection
 *   C. Cross-template: perceptual-hash similarity → near-duplicate clusters
 *
 * Usage: node template-lab/visual-metrics.mjs
 * Writes template-lab/visual-metrics.json
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, 'shots');
const BASE = process.env.LAB_BASE_URL || 'http://localhost:3000';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/tmp/chromium/chromium';
const TEMPLATES = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

function serveShots() {
  const server = http.createServer((req, res) => {
    if (String(req.url) === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><body></body></html>'); return; }
    const file = path.join(SHOTS_DIR, path.basename(String(req.url)));
    if (!file.startsWith(SHOTS_DIR) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const launchArgs = ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'];

async function domMetrics(page, templateId) {
  await page.goto(`${BASE}/template-lab/index.html?template=${templateId}&fixture=normal&lang=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') !== 'rendering', null, { timeout: 20_000 });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const board = document.querySelector('#resumen') || document.querySelector('[class*="board"], [class*="Board"]');
    const boardRect = board.getBoundingClientRect();

    // --- WCAG contrast audit ------------------------------------------------
    const lum = (c) => {
      let m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) {
        const a = m[4] === undefined ? 1 : Number(m[4]);
        const chan = (v) => { const s = Number(v) / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return { r: chan(m[1]), g: chan(m[2]), b: chan(m[3]), a };
      }
      m = String(c).match(/^#([0-9a-f]{6})$/i) || String(c).match(/^#([0-9a-f]{3})$/i);
      if (m) {
        const hex = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
        const chan = (v) => { const s = parseInt(v, 16) / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return { r: chan(hex.slice(0, 2)), g: chan(hex.slice(2, 4)), b: chan(hex.slice(4, 6)), a: 1 };
      }
      return null;
    };
    const ratio = (fg, bg) => {
      const l1 = 0.2126 * fg.r + 0.7152 * fg.g + 0.0722 * fg.b;
      const l2 = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (hi + 0.05) / (lo + 0.05);
    };
    const solidify = (color, base) => {
      const fg = lum(color), bg = lum(base);
      if (!fg || !bg) return null;
      if (fg.a < 1) {
        const mix = (f, b) => f * fg.a + b * (1 - fg.a);
        return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
      }
      return { ...fg, a: 1 };
    };
    const contrastViolations = [];
    const unverifiable = [];
    const walkers = [...board.querySelectorAll('*')];
    let checked = 0;
    for (const el of walkers) {
      if (checked++ > 2500) break;
      const direct = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!direct) continue;
      const fg = solidify(getComputedStyle(el).color, '#ffffff');
      if (!fg) continue;
      let bg = null;
      let gradientHit = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') { gradientHit = true; break; }
        const c = lum(cs.backgroundColor);
        if (c && c.a > 0.5) { bg = { ...c, a: 1 }; break; }
      }
      if (gradientHit) { unverifiable.push(String(el.className).slice(0, 40)); continue; }
      if (!bg) bg = { r: 1, g: 1, b: 1, a: 1 };
      const r = ratio(fg, bg);
      const size = parseFloat(getComputedStyle(el).fontSize) || 14;
      const threshold = size >= 24 || (size >= 18.66 && Number(getComputedStyle(el).fontWeight) >= 700) ? 3 : 4.5;
      if (r < threshold) {
        contrastViolations.push({
          cls: String(el.className).slice(0, 40) || el.tagName.toLowerCase(),
          fg: getComputedStyle(el).color,
          bg: bg ? `rgb(${Math.round(bg.r * 255)}, ${Math.round(bg.g * 255)}, ${Math.round(bg.b * 255)})` : 'rgb(255, 255, 255)',
          ratio: Math.round(r * 100) / 100, size: Math.round(size * 10) / 10,
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    }

    // --- Typography histogram ----------------------------------------------
    const sizes = {}, families = {};
    for (const el of walkers) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = Math.round(parseFloat(getComputedStyle(el).fontSize) || 0);
      if (s > 0) sizes[s] = (sizes[s] || 0) + 1;
      const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '');
      families[f] = (families[f] || 0) + 1;
    }

    // --- Ink density bands (text coverage) ---------------------------------
    const treeWalker = document.createTreeWalker(board, NodeFilter.SHOW_TEXT);
    const rows = new Array(30).fill(0);
    let node;
    let textArea = 0;
    let minY = Infinity, maxY = -Infinity;
    while ((node = treeWalker.nextNode())) {
      const txt = node.textContent.trim();
      if (!txt) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()];
      for (const rect of rects) {
        if (rect.width < 2 || rect.height < 2) continue;
        const top = (rect.top - boardRect.top) / boardRect.height;
        const bottom = (rect.bottom - boardRect.top) / boardRect.height;
        if (top >= 1 || bottom <= 0) continue;
        const band0 = Math.max(0, Math.min(29, Math.floor(top * 30)));
        const band1 = Math.max(0, Math.min(29, Math.floor(bottom * 30)));
        for (let b = band0; b <= band1; b++) rows[b] += rect.width * Math.min(rect.bottom, (b + 1) * boardRect.height / 30 + boardRect.top) - Math.max(rect.top, b * boardRect.height / 30 + boardRect.top);
        textArea += rect.width * rect.height;
        minY = Math.min(minY, top);
        maxY = Math.max(maxY, bottom);
      }
    }
    const boardArea = boardRect.width * boardRect.height;
    const inkRatio = textArea / boardArea;
    const bottomWhitespace = Math.max(0, 1 - maxY);

    // --- Left/right balance --------------------------------------------------
    let leftInk = 0, rightInk = 0;
    const centerX = boardRect.left + boardRect.width / 2;
    treeWalker.currentNode = board;
    const walker2 = document.createTreeWalker(board, NodeFilter.SHOW_TEXT);
    while ((node = walker2.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of [...range.getClientRects()]) {
        if (rect.width < 2) continue;
        if (rect.left + rect.width / 2 < centerX) leftInk += rect.width * rect.height; else rightInk += rect.width * rect.height;
      }
    }
    const lrBalance = leftInk + rightInk === 0 ? 1 : Math.abs(leftInk - rightInk) / (leftInk + rightInk);

    return {
      contrast: { violations: contrastViolations.slice(0, 8), total: contrastViolations.length, unverifiableGradientCount: unverifiable.length },
      typography: { sizes: Object.fromEntries(Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 10)), distinctSizeCount: Object.keys(sizes).length, distinctFamilyCount: Object.keys(families).length, families: Object.entries(families).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f) },
      density: { inkRatio: Math.round(inkRatio * 1000) / 1000, bottomWhitespace: Math.round(bottomWhitespace * 1000) / 1000, bands: rows.map((r) => Math.round(r)) },
      balance: { lrBalance: Math.round(lrBalance * 1000) / 1000, leftInk: Math.round(leftInk), rightInk: Math.round(rightInk) },
      boardH: Math.round(boardRect.height),
    };
  });
}

async function pixelMetrics(page, { origin, shotUrl, boardRect }) {
  await page.goto(`${origin}/`);
  const stats = await page.evaluate(async ({ shotUrl, boardRect }) => {
    const img = new Image();
    img.src = shotUrl;
    await img.decode();
    const crop = {
      x0: Math.max(0, Math.round((boardRect?.left ?? 0) - 4)),
      y0: Math.max(0, Math.round((boardRect?.top ?? 0) - 4)),
      x1: Math.min(img.width, Math.round((boardRect?.left ?? 0) + (boardRect?.width ?? img.width) + 4)),
      y1: Math.min(img.height, Math.round((boardRect?.top ?? 0) + (boardRect?.height ?? img.height) + 4)),
    };
    const W = crop.x1 - crop.x0, H = crop.y1 - crop.y0;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, crop.x0, crop.y0, W, H, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const H_BANDS = 40;
    const rows = new Array(H_BANDS).fill(0);
    const cols = new Array(40).fill(0);
    let whitePixels = 0, totalPixels = W * H;
    const gray = new Float32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const gv = (r + g + b) / 3;
      gray[i] = gv;
      if (gv > 248) whitePixels++;
      const band = Math.min(H_BANDS - 1, Math.floor((i / W) / H * H_BANDS));
      rows[band] += gv < 200 ? 1 : 0;
      const col = Math.floor((i % W) / W * 40);
      cols[col] += gv < 200 ? 1 : 0;
    }
    // perceptual hash (32x32 downsampled grayscale, median threshold)
    const SIDE = 32;
    const hash = new Array(SIDE * SIDE);
    for (let gy = 0; gy < SIDE; gy++) {
      for (let gx = 0; gx < SIDE; gx++) {
        let sum = 0, count = 0;
        const x0 = Math.floor(gx * W / SIDE), x1 = Math.floor((gx + 1) * W / SIDE);
        const y0 = Math.floor(gy * H / SIDE), y1 = Math.floor((gy + 1) * H / SIDE);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += gray[y * W + x]; count++; }
        hash[gy * SIDE + gx] = sum / Math.max(1, count);
      }
    }
    // Fixed threshold: a cell is "ink" when its mean gray is below 250.
    // (Median thresholding collapses on sparse white documents.)
    const bits = hash.map((v) => (v < 250 ? '1' : '0')).join('');
    return {
      whiteRatio: Math.round(whitePixels / totalPixels * 1000) / 1000,
      inkRows: rows,
      inkCols: cols,
      phash: bits,
      dims: { W, H },
    };
  }, { shotUrl, boardRect });
  return stats;
}

async function main() {
  const { server, port } = await serveShots();
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, env: { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` }, args: launchArgs });
  const out = { generatedAt: new Date().toISOString(), templates: {} };
  try {
    for (const id of TEMPLATES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1900 } });
      let dom = null;
      try {
        dom = await domMetrics(page, id);
      } catch (e) {
        dom = { error: String(e.message) };
      }
      const origin = `http://127.0.0.1:${port}`;
      const shot = `${origin}/${id}__normal.png`;
      let px = null;
      try {
        // Re-derive the board rect the same way the lab audit does.
        const boardRect = await page.evaluate(() => {
          const board = document.querySelector('#resumen') || document.querySelector('[class*="board"], [class*="Board"]');
          if (!board) return null;
          const r = board.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        });
        px = await pixelMetrics(page, { origin, shotUrl: shot, boardRect });
      } catch (e) {
        px = { error: String(e.message) };
      }
      out.templates[id] = { dom, pixel: px };
      await page.close();
      process.stdout.write('.');
    }
    // duplicate clusters
    const hashes = Object.entries(out.templates).filter(([, t]) => t.pixel?.phash);
    const clusters = [];
    const used = new Set();
    for (let i = 0; i < hashes.length; i++) {
      if (used.has(hashes[i][0])) continue;
      const group = [hashes[i][0]];
      used.add(hashes[i][0]);
      for (let j = i + 1; j < hashes.length; j++) {
        if (used.has(hashes[j][0])) continue;
        const a = hashes[i][1].pixel.phash, b = hashes[j][1].pixel.phash;
        let diff = 0;
        for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diff++;
        if (diff <= 96) { group.push(hashes[j][0]); used.add(hashes[j][0]); }
      }
      if (group.length > 1) clusters.push(group);
    }
    out.duplicateClusters = clusters;
    console.log('\nDuplicate clusters:', clusters.length ? clusters.map((c) => c.join(',')).join(' | ') : 'none');
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(__dirname, 'visual-metrics.json'), JSON.stringify(out, null, 2));
  console.log('wrote template-lab/visual-metrics.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
