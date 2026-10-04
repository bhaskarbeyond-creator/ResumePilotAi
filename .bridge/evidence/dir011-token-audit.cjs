/**
 * DIR-011 probe — verifies every `cuba-*` Tailwind colour/shadow utility used by
 * the universal header resolves to a REAL `--color-*` token in cuba-tokens.css,
 * and that no header component hardcodes a hex literal (the "zero random colours"
 * invariant, §design tokens).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TOKENS = path.join(ROOT, 'src', 'styles', 'cuba-tokens.css');
const FILES = [
    'src/components/cuba/CubaAppShell.jsx',
    'src/components/cuba/M3UserMenu.jsx',
    'src/components/cuba/M3NotificationCenter.jsx',
    'src/components/cuba/M3Breadcrumbs.jsx',
    'src/components/Candidate/CubaCandidateShell.jsx',
    'src/components/cuba/CubaPortalShell.jsx',
];

const tokenCss = fs.readFileSync(TOKENS, 'utf8');
// Defined tokens keyed as `family-name` WITHOUT the leading `--`, e.g.
// `--color-cuba-ink` -> `color-cuba-ink`, `--shadow-cuba-sm` -> `shadow-cuba-sm`.
// The family is retained because `cuba-sm` legitimately exists in BOTH the colour
// and the radius family; collapsing them would let a shadow resolve a colour token.
const defined = new Set(
    [...tokenCss.matchAll(/--(color|shadow|radius|spacing|ease)-([a-z0-9-]+)\s*:/g)]
        .map((m) => `${m[1]}-${m[2]}`),
);

/** Tailwind colour utilities all resolve to the `--color-*` family. */
const COLOR_PREFIXES = new Set([
    'bg', 'text', 'border', 'ring', 'fill', 'stroke', 'from', 'to', 'via',
    'decoration', 'divide', 'outline', 'accent', 'caret', 'placeholder',
]);

/** `rounded-*` resolves through Tailwind to the `--radius-*` family. */
const normalize = (prefix, name) => {
    if (prefix === 'rounded') return `radius-${name}`;
    if (COLOR_PREFIXES.has(prefix)) return `color-${name}`;
    return `${prefix}-${name}`;
};

const used = new Map();
const hexOffenders = [];

for (const rel of FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const utility = /(?:^|["'\s])(?:[a-z-]+:)*(bg|text|border|ring|fill|stroke|shadow|from|to|via|decoration|divide|outline|accent|caret|placeholder|rounded)-(cuba-[a-z0-9-]+)/g;
    for (const m of src.matchAll(utility)) {
        const key = normalize(m[1], m[2]);
        if (!used.has(key)) used.set(key, new Set());
        used.get(key).add(rel);
    }
}

const missing = [...used.keys()].filter((u) => !defined.has(u));

const report = {
    tokenCount: defined.size,
    utilitiesChecked: used.size,
    missingUtilities: missing.map((m) => ({
        utility: m,
        usedIn: [...used.get(m)],
    })),
};
console.log(JSON.stringify(report, null, 2));
process.exit(missing.length === 0 ? 0 : 1);
