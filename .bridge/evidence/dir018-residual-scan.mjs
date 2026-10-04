/**
 * DIR-018 / AC-1 — POST-CODEMOD residual scanner (independent of the mapper).
 *
 * Deliberately does NOT import the token map. It re-derives the legacy palette
 * surface straight from the source with a regex, so a bug in mapToken that
 * silently skipped a token cannot hide here. It also scans the WHOLE file, not
 * just className props, so tokens hiding in a ternary, an array or a styled
 * block are still reported.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Billing/Plans/Checkout.jsx',
    'src/components/Billing/Plans/PlansTable.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
];

const HUES = [
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
    'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
    'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'white', 'black',
];
const PROPS = 'bg|text|border|ring|from|via|to|shadow|divide|outline|decoration|accent|caret|fill|stroke|placeholder';

/** Class-token boundary characters: whitespace, quotes, backtick, template braces, JSX/punct. */
const BOUNDS = ['\\s', '"', "'", '`', '\\{', '\\}', '\\(', '\\)', '=', ',', '\\]'];
const BOUND_CLASS = BOUNDS.join('');
const BOUND_ASSERT = `[${BOUND_CLASS}]`;

const RE = new RegExp(
    `(?<=^|${BOUND_ASSERT})((?:[a-z0-9-]+:)*)(${PROPS})-((?:${HUES.join('|')}))(-[0-9]{2,3})?(/[0-9]{1,3})?(?=${BOUND_ASSERT})`,
    'g'
);

const counts = new Map();
let totalHits = 0;

for (const rel of FILES) {
    const abs = path.join(process.cwd(), rel);
    if (!fs.existsSync(abs)) { console.log(`\n### ${rel}  (MISSING)`); continue; }
    const src = fs.readFileSync(abs, 'utf8');
    const lines = src.split('\n');
    const lineOf = (i) => src.slice(0, i).split('\n').length;

    const hits = [...src.matchAll(RE)];
    totalHits += hits.length;
    console.log(`\n### ${rel}: ${hits.length} residual legacy colour utilities`);
    for (const m of hits.slice(0, 40)) {
        const tok = m[0].trim();
        counts.set(tok, (counts.get(tok) || 0) + 1);
        console.log(`  L${lineOf(m.index)}: ${tok}`);
    }
    if (hits.length > 40) console.log(`  ... ${hits.length - 40} more`);

    // Hardcoded hex inside the component is also legacy styling under AC-1.
    const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)];
    if (hexes.length) {
        console.log(`  HARDCODED HEX (${hexes.length}):`);
        const byHex = new Map();
        for (const h of hexes) {
            if (!byHex.has(h[0])) byHex.set(h[0], []);
            byHex.get(h[0]).push(lineOf(h.index));
        }
        for (const [hex, lines] of [...byHex.entries()].slice(0, 25)) {
            console.log(`    ${hex.padEnd(10)} x${String(lines.length).padStart(3)}  @L${[...new Set(lines)].slice(0, 6).join(',L')}`);
        }

        // Classify the CONTEXT of each hex so the AC-1 scope is judged on facts,
        // not on a raw count. An inline `style={{}}` object is a different surface
        // from a CSS class, and the two need different remedies.
        const ctx = { inlineStyle: 0, cssRule: 0, other: 0 };
        for (const h of hexes) {
            const start = src.lastIndexOf('{', h.index);
            const open = src.lastIndexOf('style=', start);
            const line = src.slice(src.lastIndexOf('\n', h.index) + 1, h.index);
            if (/style=\{\{/.test(line) || /\bstyle\s*:\s*\{\{?/.test(src.slice(Math.max(0, h.index - 60), h.index))) ctx.inlineStyle++;
            else if (open !== -1 && open > start - 400) ctx.cssRule++;
            else ctx.other++;
        }
        console.log(`    CONTEXT: inline-style=${ctx.inlineStyle}  cssRule=${ctx.cssRule}  other=${ctx.other}`);
    }
}

console.log(`\nTOTAL RESIDUAL LEGACY UTILITIES: ${totalHits}`);
if (counts.size) {
    console.log('BY TOKEN:');
    for (const [t, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(c).padStart(4)}  ${t}`);
    }
}
console.log(totalHits === 0 ? '\nAC-1 RESIDUAL SWEEP: CLEAN' : '\nAC-1 RESIDUAL SWEEP: LEGACY UTILITIES REMAIN');