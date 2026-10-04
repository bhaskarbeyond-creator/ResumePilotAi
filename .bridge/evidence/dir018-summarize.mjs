import fs from 'node:fs';

const PASS_RE = /contrast breaches on the billing surface: (\[[\s\S]*?\])\s*\n/;
const FILE = process.argv[2] || '.bridge/evidence/dir018-results.json';
const TEXT = process.argv[3] || '.bridge/evidence/dir018-artifacts/dir018-raw.txt';
const r = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const specs = [];
(function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (Array.isArray(node.specs)) specs.push(...node.specs);
    for (const v of Object.values(node)) walk(v);
}(r));

for (const sp of specs) {
    for (const t of sp.tests || []) {
        const last = (t.results || [])[(t.results || []).length - 1] || {};
        const msg = (last.error && last.error.message) || '';
        const m = msg.match(PASS_RE);
        if (!m) continue;
        console.log(`--- FULL BREACH LIST: ${sp.title} ---`);
        const arr = JSON.parse(m[1]);
        for (const b of arr) {
            console.log(`  ratio=${b.ratio} need=${b.need} size=${b.size}px  "${b.text}"`);
        }
        console.log(`  TOTAL BREACHES REPORTED: ${arr.length}`);
        fs.writeFileSync(TEXT, m[1], 'utf8');
        console.log(`  written -> ${TEXT}`);
    }
}