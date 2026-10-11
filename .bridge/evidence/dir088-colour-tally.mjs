import fs from 'node:fs';
import { listBuilderFiles } from './dir088-builder-score.mjs';

/**
 * DIR-088 — colour-family tally for the Resume Builder.
 *
 * Classifies every legacy colour utility into NEUTRAL (structural), SEMANTIC (state-bearing)
 * or OTHER (needs a human decision), so the substitution is rule-based rather than guessed.
 */

const NEUTRAL = new Set(['slate', 'gray', 'grey', 'zinc', 'neutral', 'stone']);
const SEMANTIC = new Set([
    'blue', 'indigo', 'sky', 'cyan', 'purple', 'violet', 'fuchsia',
    'green', 'emerald', 'lime', 'teal',
    'amber', 'yellow', 'orange',
    'red', 'rose', 'pink',
]);

const RX = /\b(bg|text|border|from|to|via|ring|divide|placeholder|shadow|outline|fill|stroke|decoration|accent|caret)-([a-z]+)(?:-(\d{2,3}))?\b/g;

const tally = new Map();
for (const file of listBuilderFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(RX)) {
        const key = `${m[1]}-${m[2]}${m[3] ? `-${m[3]}` : ''}`;
        tally.set(key, (tally.get(key) || 0) + 1);
    }
}

const entries = [...tally.entries()].sort((a, b) => b[1] - a[1]);
const buckets = { neutral: 0, semantic: 0, other: 0 };
const others = [];
for (const [key, n] of entries) {
    const family = key.split('-')[1];
    if (NEUTRAL.has(family)) buckets.neutral += n;
    else if (SEMANTIC.has(family)) buckets.semantic += n;
    else {
        buckets.other += n;
        others.push(`${String(n).padStart(5)}  ${key}`);
    }
}

console.log(JSON.stringify(buckets));
console.log('--- OTHER (needs judgement) ---');
console.log(others.join('\n'));
console.log('--- top 25 ---');
console.log(entries.slice(0, 25).map(([k, n]) => `${String(n).padStart(5)}  ${k}`).join('\n'));
