#!/usr/bin/env node
/**
 * Strip console.log / console.debug debug statements from src/.
 * Preserves console.error, console.warn, console.info.
 * Safe: only removes standalone console.log(...) or console.debug(...) statements
 * (whole-line expressions). Comments console.log lines (commented form) are left
 * alone. Writes files back in place. Reports how many were removed per file.
 *
 * Usage: node scripts/strip-console-logs.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

const SCAN_DIRS = ['src'];
const SKIP = new Set(['node_modules','dist','build','.git']);
const LOG_PATTERNS = [
  /^\s*console\.log\s*\(/,            // console.log(
  /^\s*console\.debug\s*\(/,          // console.debug(
];

function walk(dir, rel, files) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(p, r, files);
    else if (/\.(js|jsx|cjs|mjs)$/.test(e.name) && !/\.test\./.test(e.name) && !/.spec\./.test(e.name)) files.push({abs: p, rel: r});
  }
}

let totalRemoved = 0;
const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), '', files);
const changedFiles = [];

for (const f of files) {
  const src = fs.readFileSync(f.abs, 'utf8');
  const lines = src.split('\n');
  const out = [];
  let removed = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isLogLine = LOG_PATTERNS.some(re => re.test(line)) && !/^\s*\/\//.test(line);
    if (isLogLine) {
      // Determine how many lines the statement spans (parenthesis balance)
      let depth = 0;
      let started = false;
      let end = i;
      for (let j = i; j < lines.length; j++) {
        const ln = lines[j];
        for (const ch of ln) {
          if (ch === '(') { depth++; started = true; }
          else if (ch === ')') depth--;
        }
        if (started && depth <= 0) { end = j; break; }
      }
      // Replace the statement with nothing
      removed += (end - i + 1);
      i = end + 1;
      continue;
    }
    out.push(line);
    i++;
  }
  if (removed > 0) {
    totalRemoved += removed;
    changedFiles.push({ file: f.rel, removed });
    if (WRITE) fs.writeFileSync(f.abs, out.join('\n'));
  }
}

console.log(`${WRITE ? 'Stripped' : 'Would strip'} ${totalRemoved} console.log/debug statement(s) from ${changedFiles.length} file(s):`);
for (const f of changedFiles) console.log(`  ${f.removed} in ${f.file}`);
