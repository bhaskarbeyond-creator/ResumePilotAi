// @ts-check
/**
 * DIR-047 -- build-budget ATTRIBUTION harness (cold cache, interleaved round-robin).
 *
 *   node scripts/dir047-build-attribution.mjs [--rounds 3]
 *
 * PURPOSE
 * The budget harness (dir047-build-budget.mjs) tells us the wall clock of `npm run build`
 * BREACHES the 4000ms bar. It cannot tell us WHY, and the two obvious suspects are measured
 * by completely different means:
 *
 *   - Vite's own work (transform + render + write), reported by the "built in Xs" line.
 *   - Everything AROUND vite: npm's own startup, reading/validating package.json, and on
 *     Windows the `vite` bin shim, which is a .cmd that spawns ANOTHER process.
 *
 * The prior evidence only ever recorded the sum, which is why the two candidate fixes could
 * not be told apart. This harness runs the variants INTERLEAVED (round-robin) with a cold
 * cache before every single build, so slow drift in machine load is shared across variants
 * instead of being charged entirely to whichever one happened to run first.
 *
 * EXIT CONTRACT: non-zero when the fastest variant's median still misses the bar, so this is
 * also the gate for "did the remediation actually work".
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BUDGET_MS = 4000;
const ROUNDS = Number((process.argv.find((a) => a.startsWith('--rounds=')) || '').split('=')[1] || 3);
const ROOT = process.cwd();
const REPORT = path.join(ROOT, '.bridge', 'evidence', 'dir047-build-attribution.json');

/**
 * Each variant is a REAL command a developer or CI could run, not a synthetic in-process
 * call, because the whole question is which layers of process startup are avoidable.
 *
 * `command` is spelled out per variant rather than assuming one launcher for all of them.
 * Driving `npm run build` through `process.execPath` (i.e. `node run build`) does not run
 * npm at all -- node resolves "run" as a module path and exits ~50ms later with
 * MODULE_NOT_FOUND. Because that failure is FAST, a naive "fastest variant wins" sort
 * happily elects the crashed process and reports a confident PASS from a build that never
 * happened. That is precisely the unfalsifiable evidence the Lead rejected in DIR-046, so
 * the selection below is gated on exit code rather than on speed alone.
 */
const VARIANTS = [
    { name: 'npm-run-build', command: process.platform === 'win32' ? 'npm.cmd' : 'npm', argv: ['run', 'build'], shell: process.platform === 'win32' },
    // What `npm run build` ends up executing: the shimmed bin. Measured separately so the
    // npm layer and the shim layer can be attributed independently.
    { name: 'vite-bin-direct', command: process.execPath, argv: [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build'], shell: false },
];

/** Removes the Vite dep-optimizer cache and the output dir so the next build is COLD. */
function purgeCaches() {
    for (const dir of [path.join(ROOT, 'node_modules', '.vite'), path.join(ROOT, 'dist')]) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const rounds = [];
for (let round = 1; round <= ROUNDS; round += 1) {
    const entry = {};
    for (const variant of VARIANTS) {
        purgeCaches();
        const started = process.hrtime.bigint();
        const result = spawnSync(variant.command, variant.argv, {
            cwd: ROOT,
            encoding: 'utf8',
            shell: variant.shell,
        });
        const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
        const combined = `${result.stdout || ''}${result.stderr || ''}`;
        const internal = combined.match(/built in ([\d.]+)s/);
        entry[variant.name] = {
            wallMs: Math.round(wallMs),
            viteReportedMs: internal ? Math.round(Number(internal[1]) * 1000) : null,
            exitCode: result.status,
        };
        console.log(
            `round ${round}/${ROUNDS}  ${variant.name.padEnd(16)} wall=${entry[variant.name].wallMs}ms  vite=${entry[variant.name].viteReportedMs}ms  exit=${result.status}`,
        );
        if (result.status !== 0) console.log(combined.slice(-2000));
    }
    rounds.push(entry);
}

const summary = {};
for (const variant of VARIANTS) {
    const walls = rounds.map((r) => r[variant.name].wallMs);
    const vites = rounds.map((r) => r[variant.name].viteReportedMs).filter((v) => typeof v === 'number');
    const exitCodes = rounds.map((r) => r[variant.name].exitCode);
    summary[variant.name] = {
        medianWallMs: median(walls),
        medianViteMs: vites.length ? median(vites) : null,
        walls,
        exitCodes,
        allRunsExitedZero: exitCodes.every((c) => c === 0),
    };
}

/**
 * A variant that never actually built is not a fast variant, it is a broken one. Ranking is
 * therefore over variants whose EVERY run exited zero, and a run that failed is reported as
 * the failure it is. Ranking a crashed run first is how a harness ends up certifying a
 * budget it never measured.
 */
const healthy = VARIANTS
    .filter((v) => summary[v.name].allRunsExitedZero)
    .map((v) => ({ name: v.name, ms: summary[v.name].medianWallMs }))
    .sort((a, b) => a.ms - b.ms);

if (healthy.length === 0) {
    console.error('\nFATAL: no variant completed a single successful build; the budget was never measured.');
}

const fastest = healthy[0] || null;
const broken = VARIANTS
    .filter((v) => !summary[v.name].allRunsExitedZero)
    .map((v) => ({ name: v.name, exitCodes: summary[v.name].exitCodes }));

const report = {
    directive: 'DIR-047',
    generatedAt: new Date().toISOString(),
    method: 'interleaved round-robin, cold cache (node_modules/.vite + dist purged) before every single build; medians compared across rounds so machine drift is shared',
    caveat: 'Vite-reported time covers transform/render/write only. The wall-clock difference between variants is process-startup overhead, which is the part this harness exists to attribute.',
    budgetMs: BUDGET_MS,
    rounds,
    summary,
    fastestVariant: fastest,
    /**
     * Startup overhead = wall clock minus the work vite itself reported. This is the number
     * that decides whether the remaining cost is worth attacking in application code or is
     * simply launcher overhead nobody can remove.
     */
    startupOverheadMs: Object.fromEntries(
        VARIANTS
            .filter((v) => summary[v.name].allRunsExitedZero)
            .map((v) => [v.name, summary[v.name].medianWallMs - (summary[v.name].medianViteMs ?? 0)]),
    ),
    brokenVariants: broken,
    verdict: fastest && fastest.ms < BUDGET_MS ? 'PASS' : 'FAIL',
};
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (!fastest) {
    console.error('no healthy variant; reporting FAIL and exiting non-zero');
} else {
    console.log(`\nfastest=${fastest.name}@${fastest.ms}ms  budget=${BUDGET_MS}ms  verdict=${report.verdict}`);
}
console.log(`startup overhead: ${JSON.stringify(report.startupOverheadMs)}`);
if (broken.length) console.log(`broken variants (excluded from ranking): ${JSON.stringify(broken)}`);
console.log(`written -> ${path.relative(ROOT, REPORT).replace(/\\/g, '/')}`);
process.exit(report.verdict === 'PASS' ? 0 : 1);
