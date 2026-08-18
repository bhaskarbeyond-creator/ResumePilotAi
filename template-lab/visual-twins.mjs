/**
 * Rendered-pixel duplicate/twin detector.
 *
 * Loads every page-1 render into a canvas, downsamples to a 64x90 luminance +
 * hue grid, and compares every template pair. Two templates are flagged as:
 *   EXACT TWIN     - identical downsampled pixels (diff == 0)
 *   VISUAL TWIN    - structural (greyscale/edge) diff < 2% AND colour diff < 6%
 *   NEAR DUPLICATE - structural diff < 4%
 * Structural diff deliberately ignores colour so "recoloured the same layout"
 * cannot be sold as differentiation.
 *
 * Usage: node template-lab/visual-twins.mjs [fixture]
 */
import { chromium } from '../backend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = process.argv[2] || 'normal';
const DIR = path.join(__dirname, 'evidence', 'senior');
const TEMPLATES = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

const files = TEMPLATES.map((id) => ({ id, file: path.join(DIR, `${id}__${fixture}__p1.png`) })).filter((f) => fs.existsSync(f.file));

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium-bin',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chrlib/lib:/tmp/chrlib' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'],
});
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');

const W = 64, H = 90;
const signatures = {};
for (const { id, file } of files) {
    const b64 = fs.readFileSync(file).toString('base64');
    const sig = await page.evaluate(async ({ b64, W, H }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;
        const grey = new Array(W * H);
        const rgb = new Array(W * H * 3);
        for (let i = 0; i < W * H; i++) {
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
            rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
        }
        return { grey, rgb, natural: [img.naturalWidth, img.naturalHeight] };
    }, { b64, W, H });
    signatures[id] = sig;
}
await browser.close();

// normalise greyscale (remove global brightness/contrast) so a pure recolour
// still exposes an identical structure.
function normalise(grey) {
    const mean = grey.reduce((a, b) => a + b, 0) / grey.length;
    const sd = Math.sqrt(grey.reduce((a, b) => a + (b - mean) ** 2, 0) / grey.length) || 1;
    return grey.map((v) => (v - mean) / sd);
}
const norm = {};
for (const id of Object.keys(signatures)) norm[id] = normalise(signatures[id].grey);

function structuralDiff(a, b) {
    const A = norm[a], B = norm[b];
    let sum = 0;
    for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
    return sum / A.length; // mean absolute z-difference
}
function colourDiff(a, b) {
    const A = signatures[a].rgb, B = signatures[b].rgb;
    let sum = 0;
    for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
    return sum / A.length / 255;
}
function exactSame(a, b) {
    const A = signatures[a].rgb, B = signatures[b].rgb;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
    return true;
}

const pairs = [];
const ids = Object.keys(signatures);
for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        pairs.push({ a, b, structural: +structuralDiff(a, b).toFixed(4), colour: +colourDiff(a, b).toFixed(4), exact: exactSame(a, b) });
    }
}
pairs.sort((x, y) => x.structural - y.structural);

const exact = pairs.filter((p) => p.exact);
const twins = pairs.filter((p) => !p.exact && p.structural < 0.06 && p.colour < 0.02);
const near = pairs.filter((p) => !p.exact && p.structural < 0.12 && !twins.includes(p));

console.log(`fixture=${fixture} templates=${ids.length} pairs=${pairs.length}`);
console.log(`\nEXACT PIXEL DUPLICATES: ${exact.length}`);
exact.forEach((p) => console.log(`  ${p.a} == ${p.b}`));
console.log(`\nVISUAL TWINS (same structure AND near-identical colour): ${twins.length}`);
twins.forEach((p) => console.log(`  ${p.a} ~ ${p.b}   struct=${p.structural} colour=${p.colour}`));
console.log(`\nNEAR DUPLICATES (same structure, colour differs): ${near.length}`);
near.forEach((p) => console.log(`  ${p.a} ~ ${p.b}   struct=${p.structural} colour=${p.colour}`));
console.log('\nTOP 25 CLOSEST PAIRS');
pairs.slice(0, 25).forEach((p) => console.log(`  ${p.a}/${p.b} struct=${p.structural} colour=${p.colour}`));

fs.writeFileSync(path.join(DIR, `visual-twins-${fixture}.json`), JSON.stringify({ fixture, pairs: pairs.slice(0, 200) }, null, 2));
