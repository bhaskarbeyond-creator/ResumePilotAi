/**
 * Master UI/UX Transformation — Phase One discovery: build the review-unit inventory.
 *
 * Enumerates every in-scope route + dashboard surface from the real repository and
 * emits .bridge/evidence/dir098/inventory.json as the authoritative completeness source.
 * No fabrication: every review unit is derived from src/main.jsx and the real component tree.
 *
 * Usage: node scripts/ux-inventory.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'inventory.json');

const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.jsx'), 'utf8');
const routes = [...new Set([...mainSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
    // The global catch-all "*" is a router fallback, not a page; it is not a review unit.
    .filter((r) => r !== '*')
    .sort();

const PORTALS = [
    { key: 'candidate', prefixes: ['/dashboard', '/build-resume', '/resume', '/resumes', '/coverletter', '/portfolios', '/portfolio'] },
    { key: 'employer', prefixes: ['/employer', '/jobs/portal'] },
    { key: 'enterprise', prefixes: ['/enterprise', '/org'] },
    { key: 'admin', prefixes: ['/admin', '/adm', '/platform', '/blog-editor'] },
    { key: 'public', prefixes: ['/', '/about', '/features', '/pricing', '/plans', '/billing', '/jobs', '/blog', '/contact', '/faq', '/career', '/templates', '/terms', '/privacy', '/cookies'] },
];
const portalOf = (r) => (PORTALS.find((p) => p.prefixes.some((x) => r === x || r.startsWith(x === '/' ? '/x' : x))) || { key: 'system' }).key;

const countDirs = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
};

const surfaces = {
    candidate: countDirs('src/components/Dashboard'),
    employer: countDirs('src/components/EmployerPortal'),
    enterprise: countDirs('src/enterprise/components'),
    admin: countDirs('src/components/admin'),
};

const testSuites = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'));

const VIEWPORTS = [320, 375, 768, 1024, 1280, 1440, 1920];
const STATES = ['initial', 'scrolled', 'expanded-sidebar', 'collapsed-sidebar', 'menu-open', 'dialog-open', 'form-valid', 'form-error', 'loading', 'empty', 'populated', 'error', 'permission-denied'];

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const prevByRoute = new Map(((prev && prev.units) || []).map((u) => [u.route, u]));

const units = routes.map((route, i) => {
    const base = {
        reviewId: `RU-${String(i + 1).padStart(3, '0')}`,
        route,
        portal: portalOf(route),
        device: 'desktop-1440',
        viewports: VIEWPORTS,
        states: STATES,
        baselineScreenshot: null,
        defects: [],
        tests: [],
        score: null,
        status: 'INVENTORIED',
        acceptance: 'PENDING',
    };
    // Preserve prior audit results (score/defects/acceptance) so regenerating the
    // inventory never destroys measured evidence.
    const p = prevByRoute.get(route);
    return p ? { ...base, ...p, reviewId: base.reviewId, route, portal: base.portal, viewports: base.viewports, states: base.states } : base;
});

const inventory = {
    generatedAt: new Date().toISOString(),
    directive: 'DIR-098',
    phase: 'one-discovery',
    source: 'src/main.jsx + component tree (derived, no fabrication)',
    summary: {
        routes: routes.length,
        reviewUnits: units.length,
        viewports: VIEWPORTS.length,
        stateCategories: STATES.length,
        testSuites: testSuites.length,
        surfaces: Object.fromEntries(Object.entries(surfaces).map(([k, v]) => [k, v.length])),
    },
    viewports: VIEWPORTS,
    stateCategories: STATES,
    surfaces,
    testSuites,
    units,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
console.log(`Inventory written -> ${path.relative(ROOT, OUT)}`);
console.log(`  routes=${routes.length} reviewUnits=${units.length} viewports=${VIEWPORTS.length} states=${STATES.length}`);
console.log(`  surfaces=${JSON.stringify(inventory.summary.surfaces)} testSuites=${testSuites.length}`);
