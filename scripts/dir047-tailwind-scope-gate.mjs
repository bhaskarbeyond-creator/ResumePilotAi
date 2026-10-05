// @ts-check
/**
 * DIR-047 build-budget A/B gate (verification harness, not shipped code).
 *
 * VARIANT_UNDER_TEST: Tailwind v4 has no tailwind.config.js, so it AUTO-DETECTS
 * sources by walking the whole project tree. The CPU profile attributes ~35% of
 * the entire build to @tailwindcss/vite, and the repo holds tens of thousands of
 * non-src files (backend, dashboardTemplate, .bridge, crawl-artifacts) that can
 * never contribute a class to the production bundle, because
 * build.rollupOptions.input is the single index.html entry and its whole module
 * graph lives under src/.
 *
 * `source(none)` disables auto-detection; explicit @source directives re-register
 * exactly what the production graph (and the dev-server-served template-lab pages)
 * can reach. Nothing shipped can lose a utility; only utilities that were being
 * generated for never-published files disappear.
 *
 * The gate is deliberately CONJOINT:
 *   1. TIME   - median cold-cache wall clock must beat the 4000ms budget.
 *   2. PARITY - the emitted CSS must be byte-identical to the BASELINE emit.
 * Parity is what makes the speedup safe; without it this would be a silent
 * visual regression, which is exactly the failure mode the Lead forbade.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUDGET_MS = 4000;
const ROUNDS = Number(process.env.DIR047_ROUNDS || 3);

const VARIANTS = [
    { name: 'BASELINE', config: null, outDir: 'dist-base' },
    { name: 'SCOPED', config: 'vite.dir047probe7.config.js', outDir: 'dist-scoped' },
];

function coldPurge() {
    fs.rmSync(path.join(ROOT, 'node_modules', '.vite'), { recursive: true, force: true });
}

function build(variant) {
    coldPurge();
    fs.rmSync(path.join(ROOT, variant.outDir), { recursive: true, force: true });
    // `npx vite build`, not `npx exec vite build`: the latter resolves through
    // `npm exec exec`, which is not a valid invocation and exits 1 for BOTH
    // variants, which would silently poison the whole comparison.
    const args = ['vite', 'build', '--outDir', variant.outDir];
    if (variant.config) args.push('--config', variant.config);
    const started = process.hrtime.bigint();
    const res = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8', shell: true });
    const wallMs = Number((process.hrtime.bigint() - started) / 1000000n);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    const match = out.match(/built in\s+([\d.]+)s/);
    return { wallMs, viteMs: match ? Math.round(Number(match[1]) * 1000) : null, exit: res.status };
}

/** Normalised CSS fingerprint: every emitted .css asset, keyed by name. */
function cssFingerprint(outDir) {
    const assets = path.join(ROOT, outDir, 'assets');
    // A build that failed to emit leaves no assets dir. Report that as a failed
    // parity check instead of throwing, so the report still lands on disk and the
    // gate verdict stays explainable.
    if (!fs.existsSync(assets)) return { fileCount: 0, map: {}, missing: true };
    const files = fs.readdirSync(assets).filter((f) => f.endsWith('.css')).sort();
    const map = {};
    for (const f of files) map[f] = fs.readFileSync(path.join(assets, f), 'utf8');
    return { fileCount: files.length, map, missing: false };
}

const rounds = [];
for (let i = 1; i <= ROUNDS; i += 1) {
    const row = { round: i };
    for (const v of VARIANTS) {
        const r = build(v);
        row[v.name] = r;
        process.stdout.write(`round ${i}/${ROUNDS}  ${v.name.padEnd(10)} wall=${r.wallMs}ms vite=${r.viteMs}ms exit=${r.exit}\n`);
    }
    rounds.push(row);
}

function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

const summary = {};
for (const v of VARIANTS) {
    const rs = rounds.map((r) => r[v.name]);
    summary[v.name] = {
        medianWallMs: median(rs.map((r) => r.wallMs)),
        medianViteMs: median(rs.filter((r) => r.viteMs != null).map((r) => r.viteMs)),
        walls: rs.map((r) => r.wallMs),
        exitCodes: rs.map((r) => r.exit),
        allExitZero: rs.every((r) => r.exit === 0),
    };
}

const base = cssFingerprint(VARIANTS[0].outDir);
const test = cssFingerprint(VARIANTS[1].outDir);
const cssParity = {
    baselineFileCount: base.fileCount,
    scopedFileCount: test.fileCount,
    identical: base.fileCount === test.fileCount
        && Object.keys(base.map).every((k) => test.map[k] === base.map[k]),
};

const report = {
    directive: 'DIR-047',
    generatedAt: new Date().toISOString(),
    method: 'interleaved round-robin, cold cache (node_modules/.vite + outDir purged) before every single build',
    budgetMs: BUDGET_MS,
    rounds,
    summary,
    cssParity,
    deltaWallMs: summary.SCOPED.medianWallMs - summary.BASELINE.medianWallMs,
    verdict: summary.SCOPED.allExitZero && cssParity.identical && summary.SCOPED.medianWallMs < BUDGET_MS ? 'PASS' : 'FAIL',
};

fs.writeFileSync(path.join(ROOT, '.bridge/evidence/dir047-tailwind-scope-gate.json'), JSON.stringify(report, null, 2));
console.log('');
console.log(`BASELINE median=${summary.BASELINE.medianWallMs}ms`);
console.log(`SCOPED   median=${summary.SCOPED.medianWallMs}ms (${report.deltaWallMs >= 0 ? '+' : ''}${report.deltaWallMs}ms vs BASELINE)`);
console.log(`cssParity: identical=${cssParity.identical} (baseline ${cssParity.baselineFileCount} files, scoped ${cssParity.scopedFileCount} files)`);
console.log(`budget=${BUDGET_MS}ms  verdict=${report.verdict}`);
console.log('written -> .bridge/evidence/dir047-tailwind-scope-gate.json');