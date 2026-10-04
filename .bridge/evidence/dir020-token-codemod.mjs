// DIR-020 AC-1: ordered, auditable palette -> Cuba Executive token codemod.
// Run: node .bridge/evidence/dir020-token-codemod.mjs
//
// The map is ORDERED on purpose. Two rules make it safe:
//
//  1. Only Tailwind colour utilities are touched. Layout/typography utilities
//     (p-4, text-xs, rounded-lg, grid-cols-4, ...) are never matched because
//     every pattern below requires an explicit colour name plus its shade
//     number, e.g. `slate-900`.
//  2. Every replacement resolves to a real `--color-cuba-*` entry registered by
//     the `@theme inline` block in src/styles/cuba-tokens.css. `text-sm` is
//     untouched while `text-slate-600` becomes `text-cuba-ink-muted`.
//
// Longest keys run first so `slate-50` can never partially shadow `slate-500`,
// and prefixed variants (hover:, focus:, placeholder:, border-t:) are listed
// before their bare counterparts for the same reason.
import fs from 'node:fs/promises';

const FILE = 'src/components/AppliedJobs/AppliedJobs.jsx';

const MAP = [
    // Focus / interaction states first: these carry the keyboard affordance.
    ['focus-visible:outline-slate-700', 'focus-visible:outline-cuba-primary'],
    ['focus:border-slate-400', 'focus:border-cuba-primary'],
    ['focus:ring-slate-400', 'focus:ring-cuba-primary'],
    ['placeholder-slate-400', 'placeholder-cuba-ink-subtle'],
    ['hover:border-slate-300', 'hover:border-cuba-line-strong'],
    ['hover:bg-slate-50', 'hover:bg-cuba-canvas'],
    ['hover:text-slate-700', 'hover:text-cuba-ink'],
    // Status + accent chips.
    ['text-orange-700', 'text-cuba-warning'],
    ['bg-orange-50', 'bg-cuba-warning-soft'],
    ['border-orange-200', 'border-cuba-warning'],
    ['text-amber-600', 'text-cuba-warning'],
    ['bg-amber-50', 'bg-cuba-warning-soft'],
    ['text-indigo-700', 'text-cuba-primary-ink-strong'],
    ['bg-indigo-50', 'bg-cuba-primary-soft'],
    ['border-indigo-200', 'border-cuba-primary'],
    ['text-blue-600', 'text-cuba-primary'],
    ['bg-blue-50', 'bg-cuba-primary-soft'],
    ['text-teal-700', 'text-cuba-success'],
    ['bg-teal-50', 'bg-cuba-success-soft'],
    ['border-teal-200', 'border-cuba-success'],
    ['text-emerald-600', 'text-cuba-success'],
    ['bg-emerald-50', 'bg-cuba-success-soft'],
    // Neutral surfaces. slate-100 is the raised chip surface (--cuba-elevated),
    // slate-50 the recessed panel (--cuba-canvas), white the card itself.
    ['bg-slate-100', 'bg-cuba-elevated'],
    ['bg-slate-50', 'bg-cuba-canvas'],
    ['bg-white', 'bg-cuba-card'],
    // Text ramp, darkest first so slate-500/50 cannot shadow each other.
    ['text-slate-900', 'text-cuba-ink'],
    ['text-slate-700', 'text-cuba-ink'],
    ['text-slate-600', 'text-cuba-ink-muted'],
    ['text-slate-500', 'text-cuba-ink-muted'],
    ['text-slate-400', 'text-cuba-ink-subtle'],
    ['text-stone-600', 'text-cuba-ink-muted'],
    // Borders / dividers.
    ['border-slate-300', 'border-cuba-line-strong'],
    ['border-slate-200', 'border-cuba-line'],
    ['border-stone-200', 'border-cuba-line'],
    ['bg-stone-50', 'bg-cuba-canvas'],
];

// Guard against a typo silently producing a class Tailwind cannot compile:
// every RHS colour name must exist in the registered @theme namespace.
const theme = await fs.readFile('src/styles/cuba-tokens.css', 'utf8');
const registered = new Set(
    [...theme.matchAll(/--color-cuba-[a-z0-9-]+:/g)].map((match) => match[0].slice(0, -1)),
);
for (const [, replacement] of MAP) {
    const name = replacement.match(/-cuba-[a-z0-9-]+/)?.[0];
    if (!name || !registered.has(`--color${name}`)) {
        throw new Error(`Refusing to write unregistered token: ${replacement}`);
    }
}

const before = await fs.readFile(FILE, 'utf8');
const counts = new Map();
const after = MAP.reduce((text, [from, to]) => {
    const matches = text.split(from).length - 1;
    if (matches > 0) counts.set(`${from} -> ${to}`, matches);
    return text.split(from).join(to);
}, before);

const leftover = [...after.matchAll(/\b(?:bg|text|border|ring|from|to|via|fill|stroke|placeholder|outline|divide|decoration)-(?:slate|stone|amber|orange|emerald|teal|indigo|blue|red|green|gray)-\d{2,3}\b/g)]
    .map((match) => match[0]);

await fs.writeFile(FILE, after, 'utf8');

for (const [change, count] of counts) console.log(`${String(count).padStart(3)}x  ${change}`);
console.log(`\nRewrote ${FILE}`);
console.log(`Residual legacy palette classes: ${leftover.length ? [...new Set(leftover)].join(', ') : 'none'}`);