// @ts-check
/**
 * DIR-047 -- cold-cache production build budget harness.
 *
 *   node scripts/dir047-build-budget.mjs [--runs 3]
 *
 * WHY THIS IS A SCRIPT AND NOT A `time npm run build`
 * The Lead rejected the DIR-046 build-budget evidence because one favourable
 * re-run had been presented as a pass. A single timing is therefore not evidence:
 * the machine is shared, the OS file cache is a first-class variable, and
 * `vite`'s own "built in Xs" line measures only the bundling phase, excluding
 * ~1.2s of node/npx startup. This harness measures the WALL CLOCK of the real
 * `npm run build` command that CI runs, from a genuinely cold cache
 * (node_modules/.vite and dist removed), and reports every run plus the
 * median -- so a pass has to be reproducible rather than lucky.
 *
 * EXIT CONTRACT: the process exits non-zero when the COLD median exceeds the
 * 4000ms bar, so this doubles as the CI gate for the [SWOT-S] build budget.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BUDGET_MS = 4000;
const RUNS = Number((process.argv.find((a) => a.startsWith('--runs=')) || '').split('=')[1] || 3);
const ROOT = process.cwd();
const REPORT = path.join(ROOT, '.bridge', 'evidence', 'dir047-build-budget.json');

/** Removes the Vite dep-optimizer cache and the output dir so the next build is COLD. */
function purgeCaches() {
    for (const dir of [path.join(ROOT, 'node_modules', '.vite'), path.join(ROOT, 'dist')]) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const runs = [];
for (let i = 1; i <= RUNS; i += 1) {
    purgeCaches();
    const started = process.hrtime.bigint();
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: process.platform === 'win32',
    });
    const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
    const combined = `${result.stdout || ''}${result.stderr || ''}`;
    const internal = combined.match(/built in ([\d.]+)s/);
    runs.push({
        run: i,
        wallMs: Math.round(wallMs),
        viteReportedMs: internal ? Math.round(Number(internal[1]) * 1000) : null,
        exitCode: result.status,
    });
    console.log(
        `run ${i}/${RUNS}  wall=${runs[i - 1].wallMs}ms  vite=${runs[i - 1].viteReportedMs}ms  exit=${result.status}`,
    );
}

const walls = runs.map((r) => r.wallMs).sort((a, b) => a - b);
const median = walls[Math.floor(walls.length / 2)];
const allPassed = runs.every((r) => r.exitCode === 0);
const underBudget = median < BUDGET_MS;

const report = {
    directive: 'DIR-047',
    generatedAt: new Date().toISOString(),
    method: 'wall clock of the real `npm run build`, cold cache (node_modules/.vite + dist purged before each run), median of N runs',
    budgetMs: BUDGET_MS,
    runs,
    medianWallMs: median,
    minWallMs: walls[0],
    maxWallMs: walls[walls.length - 1],
    allRunsExitedZero: allPassed,
    verdict: allPassed && underBudget ? 'PASS' : 'FAIL',
};
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
console.log(`\nmedian=${median}ms  budget=${BUDGET_MS}ms  verdict=${report.verdict}\nwritten -> ${REPORT}`);
process.exit(report.verdict === 'PASS' ? 0 : 1);