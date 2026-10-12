/**
 * Tier 2 — build the parameterised ROUTE TEMPLATE inventory (the routes Tier 1 deduped).
 * Usage: node scripts/ux-template-inventory.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'templates.json');
const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.jsx'), 'utf8');

const all = [...new Set([...mainSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))].sort();
const templates = all.filter((r) => /:\w/.test(r) || r === '*');

// The real data each template needs to be auditable.
const DATA_NEED = {
    '/blog/:slug': 'a published blog post slug',
    '/blog-editor/:postId': 'a real blog post id',
    '/jobs/portal/:jobId': 'a real job id',
    '/jobs/category/:catName': 'a real job category',
    '/jobs/city/:slug': 'a real job city',
    '/jobs/in/:slug': 'a real job location',
    '/org/:slug/*': 'a real organization slug',
    '/p/:custompage': 'a custom page (collection empty)',
    '/portfolio/:slug': 'a portfolio (collection empty)',
    '/resume/:step': 'an authenticated resume (auth-gated)',
    '/shared/:resumeId': 'a shared resume record',
    '*': 'router catch-all (not a page)',
};

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const prevByRoute = new Map(((prev && prev.units) || []).map((u) => [u.route, u]));

const units = templates.map((route, i) => {
    const base = { reviewId: `T-${String(i + 1).padStart(2, '0')}`, route, needs: DATA_NEED[route] || 'real record data', defects: [], score: null, status: 'INVENTORIED', acceptance: 'PENDING' };
    const p = prevByRoute.get(route);
    return p ? { ...base, ...p, reviewId: base.reviewId, route } : base;
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), tier: 2, units }, null, 2)}\n`, 'utf8');
console.log(`Tier 2 template inventory -> ${path.relative(ROOT, OUT)} (${units.length} templates)`);
