#!/usr/bin/env node
/**
 * M8 §5 — independent parity revalidation.
 *
 * WHY THIS EXISTS
 *   The M7/FEATURE-PARITY-MATRIX rows were classified by a mix of file-heat scoring and
 *   hand reads; the classification of a row and the evidence behind it were never
 *   recomputed from a second direction. This tool ignores the published classification
 *   while it derives its own signals, then compares the two. It never writes a
 *   classification: disagreements are listed for a human read, and the human verdict is
 *   recorded in Evidence/adjudications-m8.json plus M8-PARITY-REVALIDATION.md.
 *
 * WHAT IT MEASURES PER ROW (independent of the row's own classification)
 *   paths         every cited path exists on disk; a row whose modern anchor is missing
 *                 cannot be at parity
 *   modernCalls   does any cited modern file contain a real call site (not a mention)?
 *   endpoints     every endpoint a row claims, looked up in the reachability register
 *   deadEndpoints endpoints registered but classified UNREACHABLE
 *   persistence   does the defining backend file contain a write (INSERT/UPDATE/DELETE,
 *                 saveX/updateX/createX style repository call)?
 *   gaps          does the row's endpoint set intersect a client contract gap (a path a
 *                 client calls that no operation serves)?
 *
 * FLAGS (each names the failure mode the mandate asks about)
 *   COMPONENT_VS_WORKFLOW   at parity, but no cited modern file calls anything
 *   ROUTE_VS_AUTHORIZED_OP  at parity, but every endpoint is UNREACHABLE from any client
 *   MOCK_VS_REAL            at parity, but no cited modern file reads or writes the backend
 *   CATALOG_VS_DESIGN       at parity, endpoints declared, none registered
 *   UI_VS_PERSISTED         at parity, no write anywhere behind the endpoints
 *   MISSING_EVIDENCE        classification claims presence but a cited path does not exist
 *   CONTRACT_GAP            row's endpoints overlap a known client->backend gap
 *
 * Output: Evidence/artifacts/m8-parity-revalidation.json  (stdout summary only)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DR = path.join(ROOT, 'developer-review');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DR, rel), 'utf8'));

const parity = readJson('Evidence/artifacts/feature-parity.json');
const reach = readJson('Evidence/artifacts/backend-reachability.json');
const contract = readJson('Evidence/artifacts/client-contract-audit.json');

const AT_PARITY = new Set(['FULL PARITY', 'REPLACED BY EQUIVALENT']);
const ABSENT = new Set(['MISSING', 'STATIC STUB']);
const CALL_RE = /(?:\b(?:get|post|patch|put|del|delete|fetch|request|apiRequest|apiJson|apiFetch|\w*[Rr]equest|apiClient\.(?:get|post|patch|put|delete)))\s*(?:<[^\n]{0,200}>)?\(\s*[`'"]\/[^`'"]{1,160}/;
const MENTION_ONLY_RE = /['"`]\/api\/[\w\-/{}.$:]+['"`]/;
const WRITE_RE = /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|save\w*\(|update\w*\(|create\w*\(|upsert\w*\(|patch\w*\()/;

function normalise(raw) {
  let v = raw.replace(/\$\{[^}]*\}/g, '{X}').replace(/:([A-Za-z0-9_]+)/g, '{X}');
  if (v.startsWith('/api/')) v = v.slice(4);
  return v.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
}

const opsByPath = new Map();
for (const op of reach.operations) {
  const key = normalise(op.path);
  if (!opsByPath.has(key)) opsByPath.set(key, []);
  opsByPath.get(key).push(op);
}
const gapPaths = new Set((contract.gaps || []).map((g) => normalise(typeof g === 'string' ? g : g.path)));

const filesCache = new Map();
function fileInfo(rel) {
  if (filesCache.has(rel)) return filesCache.get(rel);
  const abs = path.join(ROOT, rel);
  let info;
  try {
    const text = fs.readFileSync(abs, 'utf8');
    info = { exists: true, text, call: CALL_RE.test(text), mention: MENTION_ONLY_RE.test(text) };
  } catch {
    info = { exists: false, text: '', call: false, mention: false };
  }
  filesCache.set(rel, info);
  return info;
}

const rows = parity.capabilities.map((cap) => {
  const legacy = cap.legacyPaths || [];
  const modern = cap.modernPaths || [];
  const flags = [];

  const missingModern = modern.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  const missingLegacy = legacy.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (missingModern.length) flags.push('MISSING_EVIDENCE');

  // For a directory anchor, a "call" is any file under it that contains a call site.
  const expandsToFiles = (list) => list.flatMap((p) => {
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) return [p];
    const stat = fs.statSync(abs);
    if (stat.isFile()) return [p];
    const out = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(path.relative(ROOT, full));
      }
    };
    walk(abs);
    return out;
  });

  const modernFiles = expandsToFiles(modern);
  const legacyFiles = expandsToFiles(legacy);
  const modernCallFiles = modernFiles.filter((f) => fileInfo(f).call);
  const legacyCallFiles = legacyFiles.filter((f) => fileInfo(f).call);

  // One hop of client indirection: a component that imports a typed client module holds no
  // path literal, so a direct call search would report "the component calls nothing" and
  // manufacture a COMPONENT_VS_WORKFLOW flag out of the audit's own layering. Resolve '@/lib/*'
  // and relative imports of the cited files and look for call sites there.
  const clientModules = new Set();
  for (const file of modernFiles) {
    const info = fileInfo(file);
    if (!info.exists) continue;
    for (const m of info.text.matchAll(/from\s+['"](@\/lib\/[\w\-/]+|@\/hooks\/[\w\-/]+|\.{1,2}\/[\w\-./]+)['"]/g)) {
      const spec = m[1];
      let abs;
      if (spec.startsWith('@/')) abs = path.join(ROOT, 'frontend/src', spec.slice(2));
      else abs = path.resolve(path.dirname(path.join(ROOT, file)), spec);
      for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const candidate = abs + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          clientModules.add(path.relative(ROOT, candidate));
          break;
        }
      }
    }
  }
  const clientCallFiles = [...clientModules].filter((f) => fileInfo(f).call);

  const endpoints = (cap.endpoints || []).map(normalise);
  const resolved = [];
  const unregistered = [];
  for (const endpoint of endpoints) {
    const hits = opsByPath.get(endpoint) || [];
    if (!hits.length) { unregistered.push(endpoint); continue; }
    for (const op of hits) resolved.push({ endpoint, method: op.method, reachability: op.reachability, file: op.file });
  }
  const deadEndpoints = resolved.filter((r) => r.reachability === 'UNREACHABLE');
  const writes = [...new Set(resolved.map((r) => r.file))].map((file) => {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) return { file, write: false };
    return { file, write: WRITE_RE.test(fs.readFileSync(abs, 'utf8')) };
  });
  const anyWrite = writes.some((w) => w.write);
  const gapOverlap = endpoints.filter((e) => gapPaths.has(e));

  if (AT_PARITY.has(cap.classification)) {
    // A whole workflow counts as wired if either the component itself or the client module it
    // imports contains a call site.
    const wired = modernCallFiles.length || clientCallFiles.length;
    if (!wired) flags.push(modernFiles.length ? 'COMPONENT_VS_WORKFLOW' : 'MOCK_VS_REAL');
    if (endpoints.length && !resolved.length) flags.push('CATALOG_VS_DESIGN');
    else if (resolved.length && deadEndpoints.length === resolved.length) flags.push('ROUTE_VS_AUTHORIZED_OP');
    if (endpoints.length && resolved.length && !anyWrite) flags.push('UI_VS_PERSISTED');
  }
  if (gapOverlap.length) flags.push('CONTRACT_GAP');

  return {
    id: cap.id,
    classification: cap.classification,
    domain: cap.domain,
    legacyPaths: legacy.length,
    modernPaths: modern.length,
    missingLegacy,
    missingModern,
    modernCallFiles: modernCallFiles.slice(0, 6),
    modernCallFileCount: modernCallFiles.length,
    clientCallFiles: clientCallFiles.slice(0, 8),
    clientCallFileCount: clientCallFiles.length,
    legacyCallFileCount: legacyCallFiles.length,
    endpoints,
    unregistered,
    resolved,
    deadEndpoints: deadEndpoints.map((d) => `${d.method} ${d.endpoint}`),
    writes,
    gapOverlap,
    flags: [...new Set(flags)],
  };
});

const flagHistogram = {};
for (const row of rows) for (const flag of row.flags) flagHistogram[flag] = (flagHistogram[flag] || 0) + 1;

const contradictory = rows.filter((row) => AT_PARITY.has(row.classification) && row.flags.some((f) =>
  ['COMPONENT_VS_WORKFLOW', 'MOCK_VS_REAL', 'CATALOG_VS_DESIGN', 'ROUTE_VS_AUTHORIZED_OP', 'UI_VS_PERSISTED', 'MISSING_EVIDENCE'].includes(f)));

const absentWithModernWork = rows.filter((row) => ABSENT.has(row.classification) && (row.modernCallFileCount > 0 || row.clientCallFileCount > 0));

const payload = {
  revision: require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(),
  method: 'Derived independently of each row classification: existence of cited paths, presence of a call site (not a mention) in cited modern files, resolution of every declared endpoint against the reachability register, reachability of those endpoints, existence of a write behind the defining route file, overlap with known client contract gaps.',
  counts: {
    rows: rows.length,
    atParity: rows.filter((r) => AT_PARITY.has(r.classification)).length,
    absent: rows.filter((r) => ABSENT.has(r.classification)).length,
    withFlags: rows.filter((r) => r.flags.length).length,
    contradictoryAtParity: contradictory.length,
    absentButModernCalls: absentWithModernWork.length,
  },
  flagHistogram,
  rows,
  contradictions: contradictory.map((r) => ({ id: r.id, classification: r.classification, flags: r.flags })),
  absentWithModernWork: absentWithModernWork.map((r) => ({ id: r.id, classification: r.classification, modernCallFiles: r.modernCallFiles })),
};

fs.writeFileSync(path.join(DR, 'Evidence', 'artifacts', 'm8-parity-revalidation.json'), JSON.stringify(payload, null, 1) + '\n');

console.log('parity revalidation @', payload.revision.slice(0, 12));
console.log('rows                :', payload.counts.rows);
console.log('at parity           :', payload.counts.atParity);
console.log('rows with flags     :', payload.counts.withFlags);
console.log('contradictory@parity:', payload.counts.contradictoryAtParity);
console.log('absent + modern work:', payload.counts.absentButModernCalls);
for (const [flag, n] of Object.entries(flagHistogram).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + flag.padEnd(24) + n);
}
