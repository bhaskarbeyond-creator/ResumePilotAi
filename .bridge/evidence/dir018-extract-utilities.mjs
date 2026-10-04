/**
 * DIR-018 / AC-1 — exhaustive legacy colour-utility extractor.
 *
 * Scans every string literal that feeds a className and pulls out the complete
 * token set, then reports the HUE-NAMED subset (the "legacy styling" AC-1 targets).
 *
 * A token is written as:  [variants:]property[-modifier]:colour[/alpha]
 * e.g. `hover:bg-slate-100`, `dark:text-cuba-ink`, `bg-indigo-600/20`.
 *
 * Usage: node .bridge/evidence/dir018-extract-utilities.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = [
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Billing/Plans/Checkout.jsx',
    'src/components/Billing/Plans/PlansTable.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
];

const HUES = [
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
    'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
    'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];
const COLOUR_PROP = 'bg|text|border|ring|from|via|to|shadow|divide|outline|decoration|accent|caret|fill|stroke|placeholder';
const VARIANT = '(?:[a-z0-9-]+:)*';

/** A colour utility: variants, a colour property, then hue-{50..950} | white | black. */
const COLOUR_RE = new RegExp(
    `^${VARIANT}(${COLOUR_PROP})-(?:${HUES.join('|')}|[a-z]+)-(?:[0-9]{2,3})?(?:/[0-9]{1,3})?$`
);
/** Same, but the colour name is a raw hue token with no shade (`bg-white`). */
const BARE_RE = new RegExp(`^${VARIANT}(${COLOUR_PROP})-(?:white|black|transparent|current|inherit)(?:/[0-9]{1,3})?$`);

const isColourToken = (t) => COLOUR_RE.test(t) || BARE_RE.test(t);

/** Collect the contents of every quoted string that sits inside a className prop. */
const classNameStrings = (src) => {
    const out = [];
    const re = /className\s*=\s*(?:\{)?\s*(?:"([^"]*)"|'([^']*)'|`([\s\S]*?)`)/g;
    for (const m of src.matchAll(re)) {
        out.push(m[1] ?? m[2] ?? m[3] ?? '');
    }
    // Ternaries inside a template literal carry whole quoted class strings too.
    const tq = /'([^']*)'|"([^"]*)"/g;
    for (const s of out) {
        for (const m of s.matchAll(tq)) out.push(m[1] ?? m[2] ?? '');
    }
    return out;
};

const counts = new Map();
const perFile = [];

for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { perFile.push({ file: rel, missing: true }); continue; }
    const src = fs.readFileSync(abs, 'utf8');
    const fileTokens = new Set();
    for (const chunk of classNameStrings(src)) {
        // Drop `${...}` interpolation boundaries: we only want literal tokens.
        for (const raw of chunk.split(/[\s"'`]/)) {
            const t = raw.trim();
            if (!t) continue;
            if (isColourToken(t)) {
                counts.set(t, (counts.get(t) || 0) + 1);
                fileTokens.add(t);
            }
        }
    }
    perFile.push({ file: rel, colourTokens: fileTokens.size });
}

const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const out = {
    generatedAt: new Date().toISOString(),
    uniqueColourUtilities: sorted.length,
    totalColourUtilityHits: sorted.reduce((n, [, c]) => n + c, 0),
    perFile,
    tokens: Object.fromEntries(sorted),
};
fs.writeFileSync(path.join(ROOT, '.bridge/evidence/dir018-utilities.json'), JSON.stringify(out, null, 2));
console.log(`unique=${out.uniqueColourUtilities} hits=${out.totalColourUtilityHits}`);
for (const [t, c] of sorted) console.log(`${String(c).padStart(4)}  ${t}`);
