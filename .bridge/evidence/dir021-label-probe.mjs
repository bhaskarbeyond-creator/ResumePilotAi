import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/cuba/CubaCommandPalette.jsx', 'utf8');
const lines = src.split('\n');
const re = /label:\s*['"`]/g;
let match;
let found = 0;
while ((match = re.exec(src)) !== null) {
    found += 1;
    const line = src.slice(0, match.index).split('\n').length;
    console.log(`MATCH line ${line}: ${lines[line - 1].trim()}`);
}
console.log(`total matches: ${found}`);