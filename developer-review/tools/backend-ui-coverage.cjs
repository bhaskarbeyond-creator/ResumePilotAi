#!/usr/bin/env node
/**
 * BACKEND ↔ FRONTEND COVERAGE (audit-only).
 *
 * Answers two questions the re-audit directive requires explicitly:
 *   1. Which backend endpoints exist but no modern frontend code references
 *      ("backend without UI")?
 *   2. Which endpoints the legacy tree used are still unreachable (legacy-only)?
 *
 * Method, deliberately conservative:
 *   - router file -> mount prefix resolved from backend/index.js imports,
 *   - ':param' and '${x}' both normalised to '{X}',
 *   - a route counts as CONSUMED only if the modern tree references the same
 *     normalised path (any method), otherwise it is listed with its methods.
 *
 * Output: Evidence/artifacts/backend-ui-coverage.json
 *         Evidence/logs/backend-ui-coverage.log
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const INV = JSON.parse(fs.readFileSync(path.join(ROOT, 'developer-review/Evidence/artifacts/legacy-modern-inventory.json'), 'utf8'));

const idx = fs.readFileSync(path.join(ROOT, 'backend/index.js'), 'utf8');

// router variable -> mount prefix
const mounts = {};
for (const m of idx.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g)) {
  if (m[2] === 'express') continue;
  (mounts[m[2]] ??= []).push(m[1]);
}

// variable -> routes module file. CJS repo: `const { a, b } = require('./routes/x')`
// and `const x = require('./routes/x')`; ESM imports also handled.
const imports = {};
for (const m of idx.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(['"]\.\/(routes\/[\w-]+)['"]\)/g)) {
  for (const name of m[1].split(',').map(v => v.trim().split(':').pop().trim())) {
    if (name) imports[name] = `backend/${m[2]}.js`;
  }
}
for (const m of idx.matchAll(/const\s+(\w+)\s*=\s*require\(['"]\.\/(routes\/[\w-]+)['"]\)/g)) {
  imports[m[1]] = `backend/${m[2]}.js`;
}
for (const m of idx.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/(routes\/[\w-]+)(?:\.js)?['"]/g)) {
  imports[m[1]] = `backend/${m[2]}.js`;
}

function normalise(p) {
  let v = p.replace(/\/:([A-Za-z0-9_]+)/g, '/{X}');
  v = v.replace(/\$\{[^}]*\}/g, '{X}');
  if (v.startsWith('/api/')) v = v.slice(4);
  if (v === '/api') v = '/';
  v = v.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
  return v || '/';
}

const routes = [];
const files = fs.readdirSync(path.join(ROOT, 'backend/routes')).filter(f => f.endsWith('.js'));

for (const file of files) {
  const varName = Object.keys(imports).find(k => imports[k].endsWith(`routes/${file}`));
  const prefixes = (varName && mounts[varName]) || [null];
  const src = fs.readFileSync(path.join(ROOT, 'backend/routes', file), 'utf8');
  for (const prefix of prefixes) {
    for (const m of src.matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
      const method = m[1].toUpperCase();
      for (const lit of m[2].match(/['"]([^'"]+)['"]/g) || []) {
        const routePath = lit.slice(1, -1);
        const full = prefix ? `${prefix}${routePath === '/' ? '' : routePath}` : routePath;
        routes.push({
          file: `backend/routes/${file}`,
          method,
          path: normalise(full),
          mountResolved: Boolean(prefix),
        });
      }
    }
  }
}

// index.js direct app.<method> handlers that are not behind a router
for (const m of idx.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
  for (const lit of m[2].match(/['"]([^'"]+)['"]/g) || []) {
    const routePath = lit.slice(1, -1);
    if (!routePath.startsWith('/api')) continue;
    routes.push({ file: 'backend/index.js', method: m[1].toUpperCase(), path: normalise(routePath), mountResolved: true });
  }
}

const modernEndpoints = new Set(INV.endpointOverlap.shared.concat(INV.endpointOverlap.modernOnly));
const legacyEndpoints = new Set(INV.endpointOverlap.shared.concat(INV.endpointOverlap.legacyOnly));

// A modern reference may include a query suffix or be deeper; match exact, then
// match by removing a trailing segment (client may append an id it builds in JS).
function consumedBy(p, set) {
  if (set.has(p)) return true;
  for (const e of set) {
    if (e.startsWith(p + '/') || p.startsWith(e + '/')) return true;
  }
  return false;
}

const seen = new Map();
for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) continue;
  seen.set(key, r);
}
const uniq = [...seen.values()];

const resolved = uniq.filter(r => r.mountResolved);
const unresolved = uniq.filter(r => !r.mountResolved);
const backendOnly = resolved.filter(r => !consumedBy(r.path, modernEndpoints));
const consumed = resolved.filter(r => consumedBy(r.path, modernEndpoints));
const orphanedEverywhere = backendOnly.filter(r => !consumedBy(r.path, legacyEndpoints));

const group = {};
for (const r of backendOnly) {
  const bucket = r.path.split('/')[1] || '/';
  (group[bucket] ??= []).push(r);
}

const payload = {
  revision: INV.revision,
  generatedAt: new Date().toISOString(),
  counts: {
    routeDeclarations: routes.length,
    uniqueMethodPaths: uniq.length,
    consumedByModern: consumed.length,
    backendWithoutModernUi: backendOnly.length,
    backendWithoutAnyUi: orphanedEverywhere.length,
    unresolvedMount: unresolved.length,
    note: 'Only routes whose mount prefix resolved from backend/index.js are asserted; unresolved ones are excluded, not guessed.',
  },
  backendWithoutModernUi: backendOnly
    .map(r => ({ method: r.method, path: r.path, file: r.file }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
  backendWithoutAnyUi: orphanedEverywhere
    .map(r => ({ method: r.method, path: r.path, file: r.file }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
  byPrefix: Object.fromEntries(Object.entries(group).map(([k, v]) => [k, v.length])),
};

fs.writeFileSync(path.join(ROOT, 'developer-review/Evidence/artifacts/backend-ui-coverage.json'), JSON.stringify(payload, null, 1));

const lines = [
  `revision                     : ${payload.revision.slice(0, 12)}`,
  `route declarations           : ${payload.counts.routeDeclarations}`,
  `unique METHOD+path           : ${payload.counts.uniqueMethodPaths}`,
  `consumed by modern frontend  : ${payload.counts.consumedByModern}`,
  `backend WITHOUT modern UI    : ${payload.counts.backendWithoutModernUi}`,
  `backend WITHOUT any UI       : ${payload.counts.backendWithoutAnyUi}`,
  `unresolved mount (excluded)  : ${payload.counts.unresolvedMount}`,
  '',
  'backend-without-modern-UI by first path segment:',
  ...Object.entries(payload.byPrefix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${String(v).padStart(4)}  /${k}`),
  '',
  'backend-without-any-UI (never referenced by either frontend):',
  ...payload.backendWithoutAnyUi.map(r => `  ${r.method.padEnd(6)} ${r.path}   (${r.file})`),
];
fs.writeFileSync(path.join(ROOT, 'developer-review/Evidence/logs/backend-ui-coverage.log'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
