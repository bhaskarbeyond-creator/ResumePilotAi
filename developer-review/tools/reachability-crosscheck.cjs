#!/usr/bin/env node
/**
 * Independent reachability cross-check (V5).
 *
 * This tool deliberately does NOT reuse `tools/backend-reachability.cjs`. It re-derives the
 * modern-call-site question with a different method so that a shared bug cannot hide:
 *
 *   register tool : normalises `${x}` -> {X}, matches a *call-site regex* with generic
 *                   type arguments, skips files that merely register routes, and applies
 *                   rule precedence R1..R6.
 *   this tool     : builds a literal-then-wildcard regex from the path, scans every
 *                   frontend/src file line by line, and requires the line to contain an
 *                   HTTP verb function OR a fetch/axios call. It applies no rule precedence —
 *                   it only answers "is there a line that looks like a call to this path".
 *
 * Output: agreements, disagreements (both directions), and the raw lines behind each
 * disagreement so a human can adjudicate instead of trusting either tool.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DR = path.join(ROOT, 'developer-review');
const TSV = path.join(DR, 'Evidence', 'artifacts', 'backend-operations.tsv');
const OUT = path.join(DR, 'Evidence', 'artifacts', 'reachability-crosscheck.json');

const CALLISH = /\b(?:get|post|put|patch|delete|del|fetch|axios(?:\.\w+)?|apiClient\.\w+|\w*[Rr]equest)\s*(?:<[^\n]{0,160}?>)?\s*\(|\.open\s*\(/;
const NAVIGATION = /<Link\s+to=|<NavLink\s+to=|href=/;

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', 'tests', '__snapshots__'].includes(entry.name)) continue;
      walk(full, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const frontendFiles = walk(path.join(ROOT, 'frontend', 'src')).map((file) => ({
  rel: path.relative(ROOT, file).replace(/\\/g, '/'),
  lines: fs.readFileSync(file, 'utf8').split('\n'),
}));

const hookFile = 'frontend/src/hooks/use-api-hooks.ts';
const hookText = frontendFiles.find((f) => f.rel === hookFile)?.lines || [];
// map each line to its enclosing hook, then decide liveness by consumer search
const hookRanges = [];
hookText.forEach((line, index) => {
  const match = line.match(/export function (\w+)/);
  if (match) hookRanges.push({ name: match[1], start: index });
});
hookRanges.forEach((range, i) => {
  range.end = i + 1 < hookRanges.length ? hookRanges[i + 1].start : hookText.length;
  range.live = frontendFiles.some(
    (f) => f.rel !== hookFile && f.lines.some((line) => new RegExp(`\\b${range.name}\\b`).test(line)),
  );
});
function hooksForLine(index) {
  return hookRanges.filter((r) => index >= r.start && index < r.end);
}

function pathRegex(p) {
  const parts = p.split('/').filter(Boolean).map((seg) => {
    if (/^\{X\}$/.test(seg)) return '[^/\'"`\\s]+';
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp('/' + parts.join('/') + '(?![/\\w-])');
}

function literalsIn(window) {
  const out = [];
  const re = /['"`]([^'"`\n]{1,200})['"`]/g;
  let m;
  while ((m = re.exec(window))) {
    let value = m[1];
    if (!value.startsWith('/')) continue;
    value = value.replace(/\$\{[^}]*\}/g, '{X}').replace(/^\/api\//, '/');
    out.push(value);
  }
  return out;
}

function scan(p) {
  const hits = [];
  for (const file of frontendFiles) {
    for (let i = 0; i < file.lines.length; i += 1) {
      const line = file.lines[i];
      if (!line.includes(p.split('/').filter(Boolean).slice(-1)[0].slice(0, 12))) {
        // cheap pre-filter on the last literal segment; dynamic ops skip it
        if (!p.endsWith('{X}')) continue;
      }
      const window = [file.lines[i - 2], file.lines[i - 1], line, file.lines[i + 1], file.lines[i + 2]].join(' ');
      if (NAVIGATION.test(line)) continue;
      if (!CALLISH.test(window)) continue;
      // exact literal equality (or dynamic-tail equality with the same shape) — never a
      // substring test, which produced false hits inside /email/admin/settings and /account/export
      const match = literalsIn(line).some((value) => value === p || (p.endsWith('{X}') && value.split('/').length === p.split('/').length && value.startsWith(p.replace(/\{X\}$/, ''))));
      if (!match) continue;
      hits.push({ file: file.rel, line: i + 1, text: line.trim().slice(0, 160) });
    }
  }
  return hits;
}

const rows = fs.readFileSync(TSV, 'utf8').trim().split('\n').slice(1).map((line) => {
  const [op_id, method, p, reachability, rule, reason, modern_refs, legacy_refs, test_refs, defined_in] = line.split('\t');
  return { op_id, method, path: p, reachability, rule, reason, modern_refs: Number(modern_refs), legacy_refs: Number(legacy_refs), test_refs: Number(test_refs), defined_in };
});

const report = { generatedAt: new Date().toISOString(), unit: 'unique METHOD+path', total: rows.length, agreements: 0, disagreements: [] };

for (const row of rows) {
  const hits = scan(row.path);
  const hookOnly = hits.length > 0 && hits.every((h) => h.file === hookFile);
  const live = hits.filter((h) => h.file !== hookFile);
  let independent;
  if (live.length) independent = 'CALL-SITE-PRESENT';
  else if (hookOnly) {
    const lineIndex = hookText.findIndex((line) => pathRegex(row.path).test(line));
    const owners = lineIndex >= 0 ? hooksForLine(lineIndex) : [];
    independent = owners.some((r) => r.live) ? 'HOOK-LIVE' : 'HOOK-DEAD';
  } else independent = 'NO-CALL-SITE';

  const registerSaysUi = row.reachability === 'UI-REACHABLE';
  const registerSaysIndirect = row.reachability === 'INDIRECTLY-REACHABLE';
  const agrees =
    (registerSaysUi && independent === 'CALL-SITE-PRESENT') ||
    (registerSaysIndirect && independent === 'HOOK-LIVE') ||
    (!registerSaysUi && !registerSaysIndirect && independent !== 'CALL-SITE-PRESENT' && independent !== 'HOOK-LIVE');

  if (agrees) report.agreements += 1;
  else {
    report.disagreements.push({
      op_id: row.op_id, method: row.method, path: row.path,
      register: `${row.reachability} (${row.rule})`, independent, hits: hits.slice(0, 4),
    });
  }
}

// Independent enumeration check: count unique METHOD+path literals found in route files.
function enumerate() {
  const dirs = [path.join(ROOT, 'backend', 'routes')];
  const files = [path.join(ROOT, 'backend', 'index.js')];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) if (name.endsWith('.js')) files.push(path.join(dir, name));
  }
  const seen = new Set();
  const verb = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = verb.exec(text))) seen.add(`${m[1].toUpperCase()} ${m[2].replace(/\$\{[^}]*\}/g, '{X}')}`);
  }
  return seen;
}
const raw = enumerate();
report.enumeration = {
  method: 'independent regex over app|router.<verb>(literal) in backend/index.js and backend/routes/*.js, no mount-prefix expansion',
  rawDistinct: raw.size,
  note: 'the register applies mount-prefix expansion and de-duplication; this count is expected to differ and is reported only as a sanity band, not as a correction',
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(`operations checked : ${report.total}`);
console.log(`agreements         : ${report.agreements}`);
console.log(`disagreements      : ${report.disagreements.length}`);
for (const d of report.disagreements.slice(0, 20)) console.log(`  ${d.op_id} ${d.method} ${d.path} | register=${d.register} | independent=${d.independent}`);
console.log(`raw route literals (independent, pre-expansion): ${raw.size}`);
