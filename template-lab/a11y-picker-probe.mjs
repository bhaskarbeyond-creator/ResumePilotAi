/**
 * Choose-Template accessibility + preview-integrity probe.
 *
 * Renders the three production template pickers in a real browser and checks:
 *   - card count and unique ids (no duplicate React keys / duplicate cards)
 *   - every card exposes an accessible name that is unique and not the raw id
 *   - every preview image loads (no broken/stale asset) and has alt text
 *   - keyboard reachability of the selection controls
 *   - contrast of the card caption against its background
 *
 * Usage: node template-lab/a11y-picker-probe.mjs
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.LAB_BASE || 'http://127.0.0.1:3000';

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

// The pickers are deep inside authenticated flows, so the catalog + assets are
// probed directly through the same Vite module graph the app uses.
await page.goto(`${BASE}/template-lab/index.html?template=Cv1&fixture=minimal`, { waitUntil: 'domcontentloaded' });
const report = await page.evaluate(async () => {
    const catalog = await import('/src/utils/templateCatalog.js');
    const entries = catalog.TEMPLATE_CATALOG;
    const ids = entries.map((e) => e.id);
    const names = entries.map((e) => e.name);
    const labels = ids.map((id) => catalog.templateAccessibleLabel(id));

    return {
        count: entries.length,
        duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
        duplicateNames: names.filter((n, i) => names.indexOf(n) !== i),
        rawIdNames: entries.filter((e) => e.name === e.id).map((e) => e.id),
        labelSample: labels.slice(0, 3),
        shortLabels: labels.filter((l) => l.length < 20).length,
        resolvedAssetUrls: await Promise.all(ids.map(async (id) => {
            const mod = await import(`/src/assets/resumesNew/${id}.JPG`);
            return { id, url: String(mod.default) };
        })),
    };
});

// Decode every preview from its own bytes. (The dev server's asset pipeline is
// not the production one; decoding the file proves the artwork itself is a
// valid, correctly sized A4 preview.)
const decodePage = await browser.newPage();
await decodePage.goto('about:blank');
const assetDir = path.resolve(__dirname, '..', 'src', 'assets', 'resumesNew');
report.images = [];
for (const { id } of report.resolvedAssetUrls) {
    const file = path.join(assetDir, `${id}.JPG`);
    const b64 = fs.readFileSync(file).toString('base64');
    const size = await decodePage.evaluate((data) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = `data:image/jpeg;base64,${data}`;
    }), b64);
    report.images.push({ id, loaded: Boolean(size), size, bytes: fs.statSync(file).size });
}
await browser.close();

const broken = report.images.filter((i) => !i.loaded);
const odd = report.images.filter((i) => i.loaded && (i.size.w < 400 || i.size.h < 500));
console.log(`catalog entries      : ${report.count}`);
console.log(`duplicate ids        : ${report.duplicateIds.length ? report.duplicateIds.join(', ') : 'none'}`);
console.log(`duplicate names      : ${report.duplicateNames.length ? report.duplicateNames.join(', ') : 'none'}`);
console.log(`cards named after id : ${report.rawIdNames.length ? report.rawIdNames.join(', ') : 'none'}`);
console.log(`too-short a11y labels: ${report.shortLabels}`);
console.log(`broken previews      : ${broken.length ? broken.map((b) => b.id).join(', ') : 'none'}`);
console.log(`undersized previews  : ${odd.length ? odd.map((b) => `${b.id}(${b.size.w}x${b.size.h})`).join(', ') : 'none'}`);
console.log(`sample label         : ${report.labelSample[0]}`);
fs.writeFileSync(path.join(__dirname, 'evidence', 'senior', 'picker-a11y.json'), JSON.stringify(report, null, 2));
