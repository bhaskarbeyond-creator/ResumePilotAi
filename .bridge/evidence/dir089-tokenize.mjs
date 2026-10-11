import fs from 'node:fs';

/**
 * DIR-089 — Settings & 2FA tokenisation transformer.
 *
 * TWO TRAPS THIS TABLE EXISTS TO AVOID (both verified in src/styles/cuba-tokens.css):
 *   1. --cuba-primary-ink is #ffffff (WHITE). Mapping text-indigo-600 onto it would make dark
 *      accent text invisible on light surfaces. Accent TEXT must use --cuba-primary-ink-strong
 *      (#4b3ec4, a dark violet).
 *   2. --cuba-pill-*-fill are SOLID badges with WHITE ink (the DIR-088 lesson). Light tints
 *      must use the -soft variants, which are rgba at ~0.10-0.22 alpha.
 *
 * GRADIENT STOPS ARE DELIBERATELY DEFERRED. from-/via-/to- utilities are COMPOSITIONAL: each
 * stop only makes sense relative to the others, one of them is pinned by
 * tests/dashboard-settings-ux-10-10.test.mjs:22, and --cuba-primary-gradient is a 2-stop
 * linear-gradient that cannot replace a 3-stop indigo -> purple -> emerald ramp. Substituting
 * stops individually would flatten or invert the ramps, so they are reported, not guessed.
 *
 * Usage: node .bridge/evidence/dir089-tokenize.mjs [--apply]
 */

const FILE = 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx';

// neutral structural shades (proven in DIR-088) -----------------------------------------
const NEUTRAL = {
    'border-slate-100': '--cuba-line',
    'border-slate-200': '--cuba-line',
    'border-slate-300': '--cuba-line-strong',
    'text-slate-300': '--cuba-ink-subtle',
    'text-slate-400': '--cuba-ink-subtle',
    'text-slate-500': '--cuba-ink-subtle',
    'text-slate-600': '--cuba-ink-muted',
    'text-slate-700': '--cuba-ink-muted',
    'text-slate-800': '--cuba-ink',
    'text-slate-900': '--cuba-ink',
    'bg-slate-50': '--cuba-canvas',
    'bg-slate-100': '--cuba-canvas',
    'bg-slate-200': '--cuba-line',
    'bg-slate-800': '--cuba-ink',
    'bg-slate-900': '--cuba-ink',
};

// indigo is this app's PRIMARY ACCENT, not a state colour --------------------------------
const PRIMARY = {
    'bg-indigo-50': '--cuba-primary-soft',
    'bg-indigo-100': '--cuba-primary-soft',
    'bg-indigo-500': '--cuba-primary',
    'bg-indigo-600': '--cuba-primary',
    'bg-indigo-700': '--cuba-primary-strong',
    // TEXT uses ink-strong: --cuba-primary-ink is white and would vanish on light surfaces.
    'text-indigo-600': '--cuba-primary-ink-strong',
    'text-indigo-700': '--cuba-primary-ink-strong',
    'text-indigo-800': '--cuba-primary-ink-strong',
    'border-indigo-100': '--cuba-primary-line',
    'border-indigo-200': '--cuba-primary-line',
    'border-indigo-300': '--cuba-primary-line',
    'border-indigo-400': '--cuba-primary-line',
    'border-indigo-500': '--cuba-primary-line',
    'ring-indigo-100': '--cuba-primary-soft',
    'ring-indigo-500': '--cuba-primary-ring',
};

// semantic state families -> tint for fills, solid for text -------------------------------
const STATE = {
    'bg-emerald-50': '--cuba-success-soft',
    'bg-emerald-100': '--cuba-success-soft',
    'bg-emerald-500': '--cuba-success',
    'bg-emerald-600': '--cuba-success',
    'text-emerald-600': '--cuba-success',
    'text-emerald-700': '--cuba-success',
    'text-emerald-800': '--cuba-success',
    'text-emerald-900': '--cuba-success',
    'border-emerald-200': '--cuba-success-soft',

    'bg-red-50': '--cuba-danger-soft',
    'text-red-600': '--cuba-danger',
    'border-red-200': '--cuba-danger-soft',
    'border-red-500': '--cuba-danger',
    'text-rose-500': '--cuba-danger',

    'bg-amber-50': '--cuba-warning-soft',
    'bg-amber-500': '--cuba-warning',
    'bg-amber-800': '--cuba-warning',
    'text-amber-500': '--cuba-warning',
    'text-amber-700': '--cuba-warning',
    'text-amber-900': '--cuba-warning',
    'border-amber-200': '--cuba-warning-soft',

    'text-blue-600': '--cuba-info',
};

// remaining unambiguous keys surfaced by the dry-run residual report ----------------------
const EXTRA = {
    'bg-slate-300': '--cuba-line-strong',
    'bg-slate-400': '--cuba-line-strong',
    'bg-slate-950': '--cuba-ink',
    'border-slate-400': '--cuba-line-strong',
    'divide-slate-100': '--cuba-line',

    'bg-indigo-200': '--cuba-primary-soft',
    'border-indigo-600': '--cuba-primary-line',

    'bg-purple-50': '--cuba-primary-soft',
    'bg-purple-100': '--cuba-primary-soft',
    'bg-purple-600': '--cuba-primary',
    'bg-purple-700': '--cuba-primary-strong',
    'border-purple-100': '--cuba-primary-line',
    'border-purple-200': '--cuba-primary-line',
    'border-purple-300': '--cuba-primary-line',
    'border-purple-600': '--cuba-primary-line',

    'bg-emerald-200': '--cuba-success-soft',
    'bg-emerald-700': '--cuba-success',
    'border-emerald-400': '--cuba-success',

    'bg-red-100': '--cuba-danger-soft',
    'bg-red-500': '--cuba-danger',
    'bg-red-600': '--cuba-danger',
    'bg-red-700': '--cuba-danger',
    'bg-rose-50': '--cuba-danger-soft',
    'border-rose-200': '--cuba-danger-soft',

    'bg-amber-100': '--cuba-warning-soft',
    'bg-amber-400': '--cuba-warning',
    'bg-amber-600': '--cuba-warning',
    'bg-amber-700': '--cuba-warning',
    'bg-amber-900': '--cuba-warning',
    'border-amber-300': '--cuba-warning-soft',
    'border-amber-400': '--cuba-warning-soft',

    'bg-blue-50': '--cuba-info-soft',
    'bg-blue-600': '--cuba-info',
    'bg-blue-700': '--cuba-info',
    'border-blue-200': '--cuba-info-soft',
    'bg-sky-100': '--cuba-info-soft',
    'border-sky-200': '--cuba-info-soft',

    'ring-indigo-400': '--cuba-primary-ring',
    'ring-red-100': '--cuba-danger-soft',

    'text-amber-300': '--cuba-warning',
    'text-amber-400': '--cuba-warning',
    'text-amber-600': '--cuba-warning',
    'text-amber-800': '--cuba-warning',
    'text-blue-800': '--cuba-info',
    'text-blue-900': '--cuba-info',
    'text-blue-950': '--cuba-info',
    'text-emerald-500': '--cuba-success',
    // Light indigo text sits on dark fills, so it takes the inverse ink, not the accent ink.
    'text-indigo-100': '--cuba-ink-inverse',
    'text-indigo-300': '--cuba-ink-inverse',
    'text-indigo-400': '--cuba-primary-ink-strong',
    'text-indigo-500': '--cuba-primary-ink-strong',
    'text-indigo-950': '--cuba-primary-ink-strong',
    'text-purple-600': '--cuba-primary-ink-strong',
    'text-purple-700': '--cuba-primary-ink-strong',
    'text-purple-900': '--cuba-primary-ink-strong',
    'text-purple-950': '--cuba-primary-ink-strong',

    'text-red-400': '--cuba-danger',
    'text-red-500': '--cuba-danger',
    'text-red-700': '--cuba-danger',
    'text-red-900': '--cuba-danger',
    'text-red-950': '--cuba-danger',
    'text-rose-600': '--cuba-danger',
    'text-sky-800': '--cuba-info',
};

const MAP = { ...NEUTRAL, ...PRIMARY, ...STATE, ...EXTRA };

const toArbitrary = (legacy, token) => {
    const prefix = legacy.slice(0, legacy.indexOf('-'));
    if (prefix === 'placeholder') return `placeholder:text-[var(${token})]`;
    return `${prefix}-[var(${token})]`;
};

const apply = (source) => {
    let out = source;
    let replaced = 0;
    const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
    for (const legacy of keys) {
        const re = new RegExp(`(?<![\\w-])${legacy}(?![\\w-])`, 'g');
        const hits = (out.match(re) || []).length;
        if (hits) {
            out = out.replace(re, toArbitrary(legacy, MAP[legacy]));
            replaced += hits;
        }
    }
    return { out, replaced };
};

const source = fs.readFileSync(FILE, 'utf8');
const { out, replaced } = apply(source);

// Report what is left so the residual is stated, never hidden.
const ANY = /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|shadow|outline|fill|stroke|decoration|accent|caret)-(?:slate|gray|grey|zinc|neutral|stone|blue|indigo|sky|cyan|purple|violet|fuchsia|green|emerald|lime|teal|amber|yellow|orange|red|rose|pink)(?:-\d{2,3})?\b/g;
const before = (source.match(ANY) || []).length;
const after = (out.match(ANY) || []).length;

const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
if (mode === 'apply') fs.writeFileSync(FILE, out, 'utf8');

console.log(JSON.stringify({ mode, before, replaced, after }));
const residual = [...new Set(out.match(ANY) || [])].sort();
console.log('--- residual keys (deferred) ---');
console.log(residual.join('\n'));
