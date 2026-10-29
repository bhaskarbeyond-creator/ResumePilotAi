#!/usr/bin/env node
/**
 * parity-depth-checks.cjs — V6 feature-depth detectors (mandate §13).
 *
 * These are *discovery* checks, not proofs. Each emits REVIEW items with a file:line so a human can
 * verify. The output separates:
 *   FAIL  — a contradiction that is decidable from the artifacts (e.g. a doc still claiming FULL
 *           PARITY for a row the register no longer classifies FULL)
 *   LEAD  — a source pattern that frequently indicates hollowing-out, requiring manual confirmation
 *   PASS  — checked and clean
 *
 * Checks:
 *   1  matrix↔docs classification contradiction        (FAIL/clean)
 *   2  swallowed failure followed by a success state    (LEAD)
 *   3  hardcoded operational baseline retained on error (LEAD)
 *   4  localStorage used alongside an API client        (LEAD)
 *   5  `file:line` evidence refs that do not resolve    (FAIL/clean)
 *   6  runtime claims with no log on disk               (FAIL/clean)
 *   7  FULL/PARTIAL rows whose modern files never call the backend they claim (FAIL/clean)
 *   8  FULL rows whose legacy source has subfeature signals the modern row has no trace of (LEAD)
 *   9  client call sites whose path is not a registered backend operation       (LEAD)
 *  10  legacy export/edit/preview capability with no recorded disposition      (LEAD)
 *
 * Known false-positive limits (documented, not hidden — see FEATURE-DEPTH-EVIDENCE-REGISTER.md §6):
 *   - 1 skips lines carrying past-tense/historical markers ("was FULL", "previously", V4/V5), because this
 *     package deliberately keeps history. A contradiction stated in the present tense is still reported.
 *   - 2 matches a catch-with-no-op near success wording; a no-op catch followed by a *failure* notice
 *     (e.g. favourites restore) is not hollowing-out and must be adjudicated by reading the block.
 *   - 3 flags any INITIAL_/DEFAULT_ object array, including empty ones used as loading state; only rows
 *     with invented records are real (see the adjudication table in the register).
 *   - 7 originally fired on 25 rows because the modern component imports a helper (enterprise-api.ts) that
 *     issues the request. It now resolves two local import hops before declaring a row uncalled.
 *   - 8 keys on vocabulary (export/filter/preview/...). A keyword hit means "look here", not "missing":
 *     the same capability can be spelled differently (e.g. "Load more" vs "cursor").
 *   - 9 is a contractual mismatch detector. An unregistered client path can mean either a dead call or a
 *     renamed backend route; both need a human read, so it reports leads, never findings.
 *   - 10 treats textual disposition as evidence of a decision only; it cannot tell an intentional
 *     retirement from an oversight, so a silent drop is reported as an unrecorded disposition.
 *
 * Usage: node developer-review/tools/parity-depth-checks.cjs [--verbose]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DR = path.join(ROOT, 'developer-review');
const UI = path.join(ROOT, 'frontend/src');
const OUT = path.join(DR, 'Evidence/artifacts/parity-depth-checks.json');

const read = (p) => fs.readFileSync(p, 'utf8');
const artifact = (n) => JSON.parse(read(path.join(DR, 'Evidence/artifacts', n)));

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'dist', 'build', 'coverage'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(f);
  }
  return acc;
}

const files = walk(UI).map((f) => ({ abs: f, rel: path.relative(ROOT, f), text: read(f) }));
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

const results = [];
const add = (check, status, detail) => results.push({ check, status, ...detail });

// ---------------------------------------------------------------- 1. doc/matrix contradictions
function checkDocContradictions() {
  const parity = artifact('feature-parity.json');
  const current = new Map(parity.capabilities.map((c) => [c.id, c.classification]));
  const docs = fs.readdirSync(DR).filter((f) => f.endsWith('.md')).map((f) => ({ f, t: read(path.join(DR, f)) }));
  const hits = [];
  for (const { f, t } of docs) {
    if (f === 'FEATURE-PARITY-MATRIX.md' || f === 'DISCREPANCY-LOG.md' || f === 'AUDIT-CHANGE-HISTORY.md') continue;
    const lines = t.split('\n');
    lines.forEach((line, i) => {
      if (/\b(was|were|previously|formerly|historically|superseded|earlier|pre-V6|V4|V5|moved|upgraded|downgraded|reclassified|corrected|retained)\b/.test(line)) return;
      if (line.includes('→')) return;                     // a recorded transition, not a live claim
      // V7: the generated subfeature register carries a hand-written adjudication block whose prose
      // can quote a classification ("which is why FULL PARITY stands"). Only the structured
      // `**Classification:** \`X\`` marker on the line is a claim; prose next to it is not.
      if (/^_?(Adjudication|Verified by)/.test(line.trim())) return;
      if (/^\|\s*`?FULL PARITY`?\s*\|/.test(line.trim())) return;  // a quantity row, not a row claim
      for (const m of line.matchAll(/FP-[A-G]\d{2}/g)) {
        const id = m[0];
        const cls = current.get(id);
        if (!cls) continue;
        // a line that pairs the id with a classification, in a table cell or prose
        const full = /FULL PARITY|full parity/i.test(line);
        const markdownTableFull = /\|\s*FULL PARITY\s*\|/.test(line);
        if ((full || markdownTableFull) && cls !== 'FULL PARITY') {
          hits.push({ doc: f, line: i + 1, id, docSays: 'FULL PARITY', registerSays: cls, text: line.trim().slice(0, 120) });
        }
      }
    });
  }
  add('1. doc/matrix classification contradiction', hits.length ? 'FAIL' : 'PASS', { findings: hits });
}

// ---------------------------------------------------------------- 2. swallow + success
function checkSwallowSuccess() {
  const SUCCESS = /(success|Success|succeeded|completed|purged|deleted|updated|saved|sent|re-?dispatched|verified)/;
  const leads = [];
  for (const f of files) {
    const swallow = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)|catch\s*\{\s*\/\//g;
    let m;
    while ((m = swallow.exec(f.text))) {
      const after = f.text.slice(m.index, m.index + 900);
      const line = lineOf(f.text, m.index);
      const s = after.split('\n').slice(1, 14).join('\n');
      if (SUCCESS.test(s)) {
        const msg = (s.match(/['"`]([^'"`]{12,90})['"`]/) || [])[1] || '';
        leads.push({ file: f.rel, line, successHint: msg.slice(0, 80) });
      }
    }
  }
  add('2. swallowed failure followed by success state', leads.length ? 'LEAD' : 'PASS', { leads });
}

// ---------------------------------------------------------------- 3. hardcoded operational baseline
function checkHardcodedBaseline() {
  const leads = [];
  for (const f of files) {
    const decl = /\b(?:const|let)\s+(INITIAL_[A-Z_]+|DEFAULT_[A-Z_]+|FALLBACK_[A-Z_]+|MOCK_[A-Z_]+)\s*(?::[^=]+)?=\s*\[/g;
    let m;
    while ((m = decl.exec(f.text))) {
      const line = lineOf(f.text, m.index);
      const window = f.text.slice(m.index, m.index + 4000);
      const isObjectArray = /\{\s*\n?\s*(id|name|queue|recipient|email|candidate|title)\s*:/.test(window);
      const retainedOnError = /catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*)?(?:\/\/\s*Keep baseline|[^}]{0,120}Keep)/.test(f.text.slice(m.index, m.index + 12000))
        || /catch\s*\{\s*\n\s*\/\/\s*Keep baseline/.test(f.text);
      if (isObjectArray) leads.push({ file: f.rel, line, name: m[1], retainsOnFailure: retainedOnError });
    }
  }
  add('3. hardcoded operational baseline in a live view', leads.length ? 'LEAD' : 'PASS', { leads });
}

// ---------------------------------------------------------------- 4. localStorage beside an API
function checkLocalOnlyPersistence() {
  const leads = [];
  for (const f of files) {
    if (!/localStorage|sessionStorage/.test(f.text)) continue;
    const apiCalls = (f.text.match(/\b(?:get|post|patch|put|del|delete|enterpriseRequest|apiClient\.\w+)\s*(?:<[^>]*>)?\(\s*[`'"]\//g) || []).length;
    if (apiCalls > 0) {
      leads.push({ file: f.rel, storage: /localStorage/.test(f.text) ? 'localStorage' : 'sessionStorage', apiCalls });
    }
  }
  add('4. browser storage alongside a server client', leads.length ? 'LEAD' : 'PASS', { leads });
}

// ---------------------------------------------------------------- 5. evidence refs resolve
function checkEvidenceRefs() {
  const parity = artifact('feature-parity.json');
  const allDocs = fs.readdirSync(DR).filter((f) => f.endsWith('.md'));
  const refs = [];
  for (const c of parity.capabilities) {
    for (const m of String(c.evidence || '').matchAll(/((?:src|frontend|backend)\/[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|js|scss|json))(?::(\d+))?/g)) {
      refs.push({ id: c.id, file: m[1], line: m[2] ? Number(m[2]) : null });
    }
  }
  for (const f of allDocs) {
    const t = read(path.join(DR, f));
    for (const m of t.matchAll(/((?:src|frontend|backend)\/[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|js|scss))(?::(\d+))/g)) {
      refs.push({ id: f, file: m[1], line: Number(m[2]) });
    }
  }
  const badPath = [];
  const badLine = [];
  const cache = new Map();
  for (const r of refs) {
    const abs = path.join(ROOT, r.file);
    if (!fs.existsSync(abs)) { badPath.push(r); continue; }
    if (!r.line) continue;
    if (!cache.has(abs)) cache.set(abs, read(abs).split('\n').length);
    if (r.line > cache.get(abs)) badLine.push({ ...r, fileLines: cache.get(abs) });
  }
  add('5. evidence file:line refs resolve', badPath.length || badLine.length ? 'FAIL' : 'PASS', {
    totalRefs: refs.length, badPath: badPath.slice(0, 40), badLine: badLine.slice(0, 40),
    counts: { refs: refs.length, badPath: badPath.length, badLine: badLine.length },
  });
}

// ---------------------------------------------------------------- 6. runtime claims have logs
function checkRuntimeClaims() {
  const doc = read(path.join(DR, 'RUNTIME-VERIFICATION-V4.md'));
  const claimed = new Set();
  for (const m of doc.matchAll(/Evidence\/logs\/[a-z0-9/_.-]+\.(?:log|md)/g)) claimed.add(m[0]);
  const missing = [...claimed].filter((p) => !fs.existsSync(path.join(DR, p)));
  add('6. runtime claims are backed by a log', missing.length ? 'FAIL' : 'PASS', { claimed: claimed.size, missing });
}

// ---------------------------------------------------------------- 7. FULL/PARTIAL rows with a declared backend
const callFiles = new Set(artifact('client-call-existence.json').calls.map((c) => c.file));

function resolveImport(fromRel, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(UI, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(path.join(ROOT, fromRel)), spec);
  else return null;
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
    const cand = base + ext;
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return path.relative(ROOT, cand);
  }
  return null;
}

function callsWithinHops(relFile, hops) {
  const seen = new Set([relFile]);
  let frontier = [relFile];
  for (let d = 0; d < hops; d += 1) {
    const next = [];
    for (const f of frontier) {
      const abs = path.join(ROOT, f);
      if (!fs.existsSync(abs)) continue;
      const text = read(abs);
      for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const r = resolveImport(f, m[1]);
        if (r && !seen.has(r)) { seen.add(r); next.push(r); }
      }
    }
    frontier = next;
  }
  return [...seen];
}

function checkDeclaredBackendIsCalled() {
  const parity = artifact('feature-parity.json');
  const leads = [];
  for (const c of parity.capabilities) {
    if (!['FULL PARITY', 'PARTIAL PARITY'].includes(c.classification)) continue;
    if (c.backend !== 'yes') continue;
    const modern = (c.modernPaths || []).filter((p) => /\.(ts|tsx)$/.test(p));
    if (!modern.length) continue;
    const resolved = new Set();
    for (const p of modern) callsWithinHops(p, 2).forEach((f) => resolved.add(f));
    const callers = [...resolved].filter((f) => callFiles.has(f));
    if (!callers.length) {
      leads.push({ id: c.id, classification: c.classification, modernFiles: modern.length,
        note: 'declares backend:yes but neither the row nor its local imports (2 hops) issues an HTTP call' });
    } else if (!modern.some((p) => callFiles.has(p))) {
      leads.push({ id: c.id, classification: c.classification, modernFiles: modern.length, viaImport: callers.slice(0, 3),
        note: 'row file does not call directly; a helper it imports does' });
    }
  }
  const strict = leads.filter((l) => !l.viaImport);
  add('7. declared backend is actually called by the row', strict.length ? 'FAIL' : 'PASS', {
    leads, counts: { uncalled: strict.length, viaImport: leads.length - strict.length },
  });
}

// ---------------------------------------------------------------- 8. legacy subfeature signals missing from a FULL row
const SUBFEATURES = {
  export: /\b(export[A-Z_]\w*|handleExport|toCSV|toJson|Blob\(|download\s*=|createObjectURL|XLSX|jspdf|docx)/,
  import: /\b(import[A-Z_]\w*|handleImport|readAsText|FileReader|upload\(|uploadFile)/,
  filter: /\b(filter[A-Z]\w*|setFilter|activeFilter|filterBy|FilterBar)/,
  search: /\b(searchQuery|setSearch|handleSearch|SearchInput|searchTerm)/,
  pagination: /\b(cursor|loadMore|load-more|pageSize|hasNext|nextCursor|perPage|offset)/,
  preview: /\b(preview[A-Z]\w*|PreviewModal|DevicePreview|showPreview|PrintPreview)/,
  bulk: /\b(selectedIds|bulk[A-Z]\w*|selectAll|Select All|bulkAction)/,
  undo: /\b(undo|Undo|restore[A-Z]\w*|Restore)/,
  upload: /\b(input\s+type=\{?\s*['"]file|<input[^>]*file|accept=\.[a-z])/,
  sort: /\b(sortBy|setSort|sortKey|SortSelect)/,
  a11y: /\baria-label|role=\{?['"]dialog|aria-live|focus-visible|tabIndex/,
  drag: /\b(draggable|onDragStart|onDrop|dragOver|dnd)/,
};

const legacyCache = new Map();
function legacyText(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  if (fs.statSync(abs).isDirectory()) {
    if (!legacyCache.has(relPath)) {
      const parts = [];
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        if (e.isFile() && /\.(jsx?|tsx?)$/.test(e.name)) parts.push(read(path.join(abs, e.name)));
        else if (e.isDirectory()) parts.push(legacyText(path.join(relPath, e.name)));
      }
      legacyCache.set(relPath, parts.join('\n'));
    }
    return legacyCache.get(relPath);
  }
  if (!legacyCache.has(relPath)) legacyCache.set(relPath, read(abs));
  return legacyCache.get(relPath);
}

function checkLegacySubfeatures() {
  const parity = artifact('feature-parity.json');
  const leads = [];
  for (const c of parity.capabilities) {
    if (c.classification !== 'FULL PARITY') continue;
    const legacy = (c.legacyPaths || []).map(legacyText).join('\n');
    if (!legacy) continue;
    const modern = (c.modernPaths || []).filter((p) => /\.(tsx?|jsx?)$/.test(p)).map((p) => legacyText(p)).join('\n');
    const missing = [];
    for (const [name, re] of Object.entries(SUBFEATURES)) {
      if (re.test(legacy) && !re.test(modern)) missing.push(name);
    }
    if (missing.length >= 2) leads.push({ id: c.id, capability: c.capability, missing, legacyLines: c.legacyLines, modernLines: c.modernLines });
  }
  add('8. FULL rows with legacy subfeature signals absent from modern', leads.length ? 'LEAD' : 'PASS', { leads });
}

// ---------------------------------------------------------------- 9. client calls to unregistered paths
function checkClientCallsResolve() {
  const reg = artifact('backend-reachability.json');
  const ops = reg.operations || reg;
  const known = new Set(ops.map((o) => (o.method ? o.method.toUpperCase() + ' ' : '') + o.path));
  const paths = new Set(ops.map((o) => o.path));
  const calls = artifact('client-call-existence.json').calls;
  const dead = [];
  for (const c of calls) {
    if (!c.status || !/MISSING/.test(c.status)) continue;
    const p = c.path || c.normalized || '';
    if (!p.startsWith('/')) continue;
    const matched = paths.has(p) || [...paths].some((q) => {
      const re = new RegExp('^' + q.replace(/\{[^}]+\}/g, '[^/]+') + '$');
      return re.test(p);
    });
    if (!matched) dead.push({ file: c.file, line: c.line, method: c.method || '', path: p });
  }
  add('9. client call sites resolve to a registered operation', dead.length ? 'LEAD' : 'PASS', { leads: dead, counts: { dead: dead.length, callSites: calls.length } });
}

// ---------------------------------------------------------------- 10. legacy export/edit with no disposition
const DISPOSITION = /(removed|retired|dropped|no modern|not carried|absent|intentionally|superseded|replaced by|export is|export-only|downgraded)/i;
const EXPORT_SYMBOL = /\b(export[A-Z_]\w*|handleExport|toCSV|toJson|download[A-Z]\w*|createObjectURL|XLSX|jspdf|docx|print[A-Z]\w*)/g;

function checkExportDisposition() {
  const parity = artifact('feature-parity.json');
  const inv = artifact('legacy-modern-inventory.json').files.legacy;
  const byDomain = new Map();
  for (const f of inv) {
    const d = String(f.domain || '').charAt(0);
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(f.path);
  }
  const leads = [];
  for (const c of parity.capabilities) {
    // only rows that claim the capability is present; MISSING already records the loss
    if (!['FULL PARITY', 'PARTIAL PARITY', 'REPLACED BY EQUIVALENT'].includes(c.classification)) continue;
    const scope = byDomain.get(c.domain) || [];
    const inScope = (c.legacyPaths || []).filter((p) => scope.some((q) => q === p || q.startsWith(p + '/')));
    const legacy = inScope.map(legacyText).join('\n');
    if (!legacy) continue;
    const symbols = new Set((legacy.match(EXPORT_SYMBOL) || []));
    if (symbols.size < 2) continue;
    const modern = (c.modernPaths || []).filter((p) => /\.(tsx?|jsx?)$/.test(p)).map((p) => legacyText(p)).join('\n');
    const modernExport = /\b(export[A-Z_]\w*|handleExport|toCSV|toJson|download[A-Z]\w*|createObjectURL|XLSX|jspdf|docx|print[A-Z]\w*|print\()/.test(modern);
    const text = String(c.evidence || '') + ' ' + String(c.note || '');
    if (!modernExport && !DISPOSITION.test(text)) {
      leads.push({ id: c.id, classification: c.classification, capability: c.capability,
        legacySymbols: [...symbols].slice(0, 6), note: 'legacy exports/downloads; modern has none and no disposition recorded' });
    }
  }
  add('10. legacy export/edit capability has a recorded disposition', leads.length ? 'LEAD' : 'PASS', { leads });
}

for (const fn of [checkDocContradictions, checkSwallowSuccess, checkHardcodedBaseline,
  checkLocalOnlyPersistence, checkEvidenceRefs, checkRuntimeClaims, checkDeclaredBackendIsCalled,
  checkLegacySubfeatures, checkClientCallsResolve, checkExportDisposition]) {
  try { fn(); } catch (err) { add(fn.name, 'ERROR', { error: String(err && err.message) }); }
}

const summary = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2) + '\n');

console.log('V6 parity-depth checks');
console.log(JSON.stringify(summary));
for (const r of results) {
  const n = r.findings ? r.findings.length : r.leads ? r.leads.length : r.missing ? r.missing.length : r.badPath ? r.badPath.length + r.badLine.length : 0;
  console.log(`  ${r.status.padEnd(5)} ${r.check}${n ? ` — ${n} item(s)` : ''}`);
}
if (process.argv.includes('--verbose')) {
  for (const r of results) {
    const items = r.findings || r.leads || r.missing || [];
    for (const it of items.slice(0, 40)) console.log(`    [${r.check}] ${JSON.stringify(it)}`);
    for (const it of (r.badPath || []).slice(0, 20)) console.log(`    [${r.check}] missing path ${JSON.stringify(it)}`);
    for (const it of (r.badLine || []).slice(0, 20)) console.log(`    [${r.check}] bad line ${JSON.stringify(it)}`);
  }
}
console.log(`artifact: ${path.relative(ROOT, OUT)}`);
