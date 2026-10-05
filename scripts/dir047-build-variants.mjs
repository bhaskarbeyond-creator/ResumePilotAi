// @ts-check
/**
 * DIR-047 -- INTERLEAVED cold-cache build-budget variant harness.
 *
 *   node scripts/dir047-build-variants.mjs --rounds=3
 *
 * WHY INTERLEAVED AND NOT SEQUENTIAL
 * The Lead rejected the first DIR-047 budget submission because a sequential
 * "variant A then variant B" run let ordinary machine drift masquerade as a
 * real improvement: the same config measured 3803ms in one session and 4284ms in
 * the next. That drift is ~500ms, which is larger than most of the effects
 * being measured, so a sequential A/B is not evidence.
 *
 * This harness therefore ROUND-ROBINS the variants: within round N every variant
 * is built exactly once, cold, back to back. Drift is then shared almost equally
 * by all variants, and the comparison of MEDIANS across rounds is meaningful
 * even though no single absolute number is trustworthy to better than ~±300ms.
 *
 * Each variant is run through `vite build --config <variant>` directly rather
 * than `npm run build`. That is deliberate and it is a CONSERVATION, not a
 * convenience: `npm run build` adds a fixed ~0.7-1.0s of npm/npx process
 * startup to every sample. Measuring `vite` alone isolates the bundling work
 * this harness is trying to attribute, and the npm wrapper is then accounted
 * for ONCE, separately, by scripts/dir047-build-budget.mjs against the real
 * 4000ms bar. Numbers from this file must never be quoted as the budget.
 *
 * EXIT CONTRACT: non-zero if the BASELINE variant's median exceeds the bar,
 * so this also serves as a regression gate.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BUDGET_MS = 4000;
const ROUNDS = Number((process.argv.find((a) => a.startsWith('--rounds=')) || '').split('=')[1] || 3);
const ROOT = process.cwd();
const REPORT = path.join(ROOT, '.bridge', 'evidence', 'dir047-build-variants.json');

const VARIANTS = [
    { name: 'BASELINE', config: 'vite.config.js' },
    { name: 'ESNEXT', config: 'vite.dir047probe.config.js' },
    { name: 'LIGHTNING_CSS', config: 'vite.dir047v1.config.js' },
    { name: 'ESNEXT_PLUS_LIGHTNING', config: 'vite.dir047v2.config.js' },
    { name: 'LOCALE_STUB', config: 'vite.dir047probe4.config.js' },
];

function purgeCaches() {
    for (const dir of [path.join(ROOT, 'node_modules', '.vite'), path.join(ROOT, 'dist')]) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const rounds = [];
for (let r = 1; r <= ROUNDS; r += 1) {
    const row = {};
    for (const v of VARIANTS) {
        purgeCaches();
        const started = process.hrtime.bigint();
        const res = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', v.config], {
            cwd: ROOT,
            encoding: 'utf8',
            shell: false,
        });
        const wallMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
        const combined = `${res.stdout || ''}${res.stderr || ''}`;
        const internal = combined.match(/built in ([\d.]+)s/);
        row[v.name] = {
            wallMs,
            viteReportedMs: internal ? Math.round(Number(internal[1]) * 1000) : null,
            exitCode: res.status,
        };
        process.stdout.write(`round ${r} ${v.name.padEnd(15)} wall=${wallMs}ms vite=${row[v.name].viteReportedMs}ms exit=${res.status}\n`);
    }
    rounds.push(row);
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

const summary = {};
for (const v of VARIANTS) {
    const walls = rounds.map((r) => r[v.name].wallMs);
    summary[v.name] = {
        medianWallMs: median(walls),
        medianViteMs: median(rounds.map((r) => r[v.name].viteReportedMs || 0)),
        minWallMs: Math.min(...walls),
        maxWallMs: Math.max(...walls),
        walls,
        exitCodes: rounds.map((r) => r[v.name].exitCode),
    };
}

const base = summary.BASELINE.medianWallMs;
for (const v of VARIANTS) {
    if (v.name === 'BASELINE') continue;
    summary[v.name].deltaVsBaselineMs = summary[v.name].medianWallMs - base;
}

const report = {
    directive: 'DIR-047',
    generatedAt: new Date().toISOString(),
    method: 'interleaved round-robin, cold cache (node_modules/.vite + dist purged) before every single build; medians compared across rounds so machine drift is shared',
    caveat: 'These are `vite build` timings WITHOUT the npm/npx wrapper. They attribute cost only. The 4000ms budget is measured separately by scripts/dir047-build-budget.mjs against real `npm run build`.',
    rounds,
    summary,
    budgetMs: BUDGET_MS,
    baselineMedianWallMs: base,
};

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
for (const v of VARIANTS) {
    const s = summary[v.name];
    const delta = v.name === 'BASELINE' ? '' : `  (${s.deltaVsBaselineMs >= 0 ? '+' : ''}${s.deltaVsBaselineMs}ms vs BASELINE)`;
    process.stdout.write(`${v.name.padEnd(15)} median=${s.medianWallMs}ms${delta}\n`);
}
process.stdout.write(`written -> ${REPORT}\n`);
process.exit(base <= BUDGET_MS ? 0 : 1);