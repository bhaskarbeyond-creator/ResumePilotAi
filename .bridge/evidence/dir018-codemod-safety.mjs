/**
 * DIR-018 codemod SAFETY probe.
 *
 * A blind regex rewrite of colour utilities is only safe if no className is
 * built dynamically. These patterns would defeat or corrupt such a rewrite, so
 * each one is an explicit stop sign.
 */
import fs from 'node:fs';

const FILES = [
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Billing/Plans/Checkout.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
];

/** Template interpolation INSIDE a class string, e.g. `bg-${hue}-500`. */
const DYNAMIC = /(className|class)\s*=\s*(?:\{)?`[^`]*\$\{/g;
/** Ternary/conditional palette choice, e.g. `'bg-emerald-600' : 'bg-rose-600'`. */
const TERNARY_PALETTE = /[\"'`][^\"'`]*\b(?:bg|text|border|ring|from|via|to|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-[0-9]{2,3}(?:\/[0-9]{1,3})?[\"'`]/g;

let stopSigns = 0;

for (const f of FILES) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');

    const dyn = [...src.matchAll(DYNAMIC)];
    const tern = [...src.matchAll(TERNARY_PALETTE)];

    const lineOf = (idx) => src.slice(0, idx).split('\n').length;

    console.log(`\n### ${f}`);
    console.log(`  dynamic className interpolations: ${dyn.length}`);
    for (const m of dyn.slice(0, 40)) {
        console.log(`    L${lineOf(m.index)}: ${m[0].slice(0, 120)}`);
    }
    if (dyn.length > 40) console.log(`    ... ${dyn.length - 40} more`);

    console.log(`  string-literal palette classes: ${tern.length}`);

    // A ternary over palettes keeps a CLASS STRING intact either way, so it is
    // safe to rewrite -- but it must be reported so the mapping can be checked
    // for semantic sense (a 'selected' branch must not collapse onto 'muted').
    const ternLines = new Set(tern.map((m) => lineOf(m.index)));
    for (const ln of [...ternLines].sort((a, b) => a - b).slice(0, 30)) {
        console.log(`    L${ln}: ${lines[ln - 1].trim().slice(0, 130)}`);
    }
    stopSigns += dyn.length;
}

console.log(`\nTOTAL dynamic interpolations (hard stop for regex codemod): ${stopSigns}`);