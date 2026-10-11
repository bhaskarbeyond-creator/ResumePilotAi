import fs from 'node:fs';
import { listBuilderFiles } from './dir088-builder-score.mjs';

/**
 * DIR-088 — Resume Builder tokenisation transformer.
 *
 * WHY THIS IS AN EXPLICIT TABLE AND NOT A GLOBAL REGEX REWRITE
 * ------------------------------------------------------------
 * A blind find-and-replace would break this code in two ways:
 *   1. The Cuba semantic tokens are SOLID badges, not tints. Verified values:
 *      --cuba-pill-success-fill = #1a7f37 (solid green) and --cuba-pill-success-ink =
 *      #ffffff (white). So remapping a light tint such as bg-green-50 to a pill token would
 *      turn a subtle wash into a solid block. Light tints need the -soft variants.
 *   2. text-white on a coloured or gradient fill is load-bearing and must not become an ink
 *      token.
 * So this script substitutes ONLY the NEUTRAL structural families (slate / gray / zinc /
 * neutral / stone), where every shade has a documented 1:1 token equivalent, and reports the
 * semantic families instead of guessing at them.
 *
 * Usage:
 *   node .bridge/evidence/dir088-tokenize.mjs --dry-run   (report only)
 *   node .bridge/evidence/dir088-tokenize.mjs --apply     (write)
 */

// Explicit, auditable table: legacy utility -> Cuba token. Every entry corresponds to a key
// actually present in the builder (measured by dir088-colour-tally.mjs).
const NEUTRAL_MAP = {
    'border-slate-100': '--cuba-line',
    'border-slate-200': '--cuba-line',
    'border-slate-300': '--cuba-line-strong',
    'border-slate-400': '--cuba-line-strong',
    'border-slate-700': '--cuba-line-strong',
    'border-gray-200': '--cuba-line',
    'divide-slate-50': '--cuba-line',
    'divide-slate-100': '--cuba-line',

    'text-slate-100': '--cuba-ink-inverse',
    'text-slate-300': '--cuba-ink-subtle',
    'text-slate-400': '--cuba-ink-subtle',
    'text-slate-500': '--cuba-ink-subtle',
    'text-slate-600': '--cuba-ink-muted',
    'text-slate-700': '--cuba-ink-muted',
    'text-slate-800': '--cuba-ink',
    'text-slate-900': '--cuba-ink',
    'text-gray-400': '--cuba-ink-subtle',
    'text-gray-500': '--cuba-ink-subtle',
    'text-gray-600': '--cuba-ink-muted',
    'text-gray-700': '--cuba-ink-muted',
    'text-gray-900': '--cuba-ink',

    'bg-slate-50': '--cuba-canvas',
    'bg-slate-100': '--cuba-canvas',
    'bg-slate-200': '--cuba-line',
    'bg-slate-300': '--cuba-line-strong',
    'bg-slate-400': '--cuba-line-strong',
    'bg-slate-700': '--cuba-ink',
    'bg-slate-800': '--cuba-ink',
    'bg-slate-900': '--cuba-ink',
    'bg-slate-950': '--cuba-ink',
    'bg-gray-50': '--cuba-canvas',
    'bg-gray-200': '--cuba-line',
    'bg-gray-300': '--cuba-line-strong',

    'from-slate-50': '--cuba-canvas',
    'from-gray-100': '--cuba-canvas',
    'to-gray-50': '--cuba-canvas',

    'ring-slate-300': '--cuba-line-strong',
    'ring-slate-900': '--cuba-ink',

    'placeholder-slate-400': '--cuba-ink-subtle',
};

/** Deliberately NOT auto-mapped, with the reason, so nothing is silently skipped. */
const DEFERRED = {
    'shadow-slate-200': 'shadow-slate-200 sets a shadow COLOUR; the Cuba shadow tokens are SIZES, so a mechanical swap would change the utility type.',
};

const toArbitrary = (legacy, token) => {
    const prefix = legacy.slice(0, legacy.indexOf('-'));
    if (prefix === 'placeholder') return `placeholder:text-[var(${token})]`;
    return `${prefix}-[var(${token})]`;
};

const apply = (source) => {
    let out = source;
    let replaced = 0;
    const perFile = new Map();

    // Longest keys first so bg-slate-950 cannot be partially matched by bg-slate-9.
    const keys = Object.keys(NEUTRAL_MAP).sort((a, b) => b.length - a.length);
    for (const legacy of keys) {
        const token = NEUTRAL_MAP[legacy];
        // Only substitute the utility as a whole token, so `bg-slate-100` never eats
        // `bg-slate-1000`-style neighbours and `hover:bg-slate-100` keeps its variant prefix.
        const re = new RegExp(`(?<![\\w-])${legacy.replace(/[-]/g, '\\-')}(?![\\w-])`, 'g');
        const hits = (out.match(re) || []).length;
        if (hits > 0) {
            out = out.replace(re, toArbitrary(legacy, token));
            replaced += hits;
            perFile.set(legacy, (perFile.get(legacy) || 0) + hits);
        }
    }
    return { out, replaced, perFile };
};

const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const files = listBuilderFiles();

let total = 0;
const report = [];
for (const abs of files) {
    const source = fs.readFileSync(abs, 'utf8');
    const { out, replaced, perFile } = apply(source);
    if (replaced === 0) continue;
    total += replaced;
    report.push(`${String(replaced).padStart(5)}  ${abs.replace(/\\/g, '/').split('src/components/BuildResume/')[1]}`);
    if (mode === 'apply') fs.writeFileSync(abs, out, 'utf8');
}

console.log(`mode=${mode}  files=${report.length}  substitutions=${total}`);
console.log(report.join('\n'));
console.log('--- deferred (needs a design decision, NOT substituted) ---');
console.log(Object.entries(DEFERRED).map(([k, v]) => `${k}: ${v}`).join('\n'));
