import fs from 'node:fs';

/**
 * DIR-089 — colour-family tally for DashboardSettings.jsx.
 *
 * The DIR-088 lesson: neutral structural shades map 1:1 to Cuba tokens and are safe to
 * automate, but semantic state colours (red/green/amber/blue) need shade-aware mapping because
 * the --cuba-pill-* tokens are SOLID badges with WHITE ink, not tints. This script classifies
 * the target file so the plan can state how much is automatable BEFORE any edit.
 */

const FILE = process.argv[2] || 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx';

const NEUTRAL = new Set(['slate', 'gray', 'grey', 'zinc', 'neutral', 'stone']);
const SEMANTIC = new Set([
    'blue', 'indigo', 'sky', 'cyan', 'purple', 'violet', 'fuchsia',
    'green', 'emerald', 'lime', 'teal',
    'amber', 'yellow', 'orange',
    'red', 'rose', 'pink',
]);

const RX = /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|shadow|outline|fill|stroke|decoration|accent|caret)-(slate|gray|grey|zinc|neutral|stone|blue|indigo|sky|cyan|purple|violet|fuchsia|green|emerald|lime|teal|amber|yellow|orange|red|rose|pink)(?:-(\d{2,3}))?\b/g;

const source = fs.readFileSync(FILE, 'utf8');
const tally = new Map();
for (const m of source.matchAll(RX)) {
    const key = `${m[0]}`;
    tally.set(key, (tally.get(key) || 0) + 1);
}

const entries = [...tally.entries()].sort((a, b) => b[1] - a[1]);
const buckets = { neutral: 0, semantic: 0 };
for (const [key, n] of entries) {
    const family = key.replace(/^[a-z]+-/, '').replace(/-\d+$/, '');
    if (NEUTRAL.has(family)) buckets.neutral += n;
    else if (SEMANTIC.has(family)) buckets.semantic += n;
}

const total = buckets.neutral + buckets.semantic;
console.log(JSON.stringify({ file: FILE, lines: source.split('\n').length, total, ...buckets }));
console.log(`neutral ${buckets.neutral}/${total} = ${((buckets.neutral / total) * 100).toFixed(1)}%`);
console.log('--- top 30 ---');
console.log(entries.slice(0, 30).map(([k, n]) => `${String(n).padStart(5)}  ${k}`).join('\n'));
