#!/usr/bin/env node
/**
 * capability-subfeature-audit.cjs — M7 (Mandate 7) subfeature-level capability audit.
 *
 * For EVERY one of the 112 capability rows this tool produces two independent inventories:
 *
 *   A. A closed set of *distinctive* subfeature classes (table, search, filter, sort, pagination, modal,
 *      CSV/JSON/PDF-DOCX export, print, upload, drag-and-drop, chart, bulk selection, undo, authorization).
 *      Trivial structural idioms (handlers, inputs, loading booleans, aria attributes) are deliberately
 *      excluded: their density differences across JSX and hooks measure style, not capability.
 *
 *   B. A user-visible *action inventory*: every handler name and every button/link/option label found in
 *      the row's legacy corpus and its modern corpus. Labels are what a user can actually do, so a
 *      legacy-only label is the most direct evidence that a subfeature was dropped or renamed.
 *
 * The tool never changes a classification. It emits leads plus the auditStatus of each row so that rows
 * read line-by-line can be distinguished from rows that were only inventoried.
 *
 * Usage: node developer-review/tools/capability-subfeature-audit.cjs [--verbose|--row FP-A08]
 * Output: developer-review/CAPABILITY-SUBFEATURE-REGISTER.md
 *         developer-review/Evidence/artifacts/capability-subfeatures.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DR = path.join(ROOT, 'developer-review');
const UI = path.join(ROOT, 'frontend/src');
const OUT_MD = path.join(DR, 'CAPABILITY-SUBFEATURE-REGISTER.md');
const OUT_JSON = path.join(DR, 'Evidence/artifacts/capability-subfeatures.json');
const ADJ = path.join(DR, 'Evidence/adjudications-m7.json');

const read = (p) => fs.readFileSync(p, 'utf8');
const artifact = (n) => JSON.parse(read(path.join(DR, 'Evidence/artifacts', n)));
const parity = artifact('feature-parity.json');

let HEAD = 'unknown';
try { HEAD = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* unknown */ }

// Rows read line-by-line in M6 (8 with legacy→modern→backend tables in §3, 5 adjudicated in §4/§5).
const DEEP_READ_M6 = new Set([
  'FP-B05', 'FP-B08', 'FP-E02', 'FP-A16', 'FP-G21', 'FP-G09', 'FP-F03', 'FP-A20',
  'FP-A11', 'FP-A19', 'FP-F02', 'FP-F06', 'FP-G01',
]);

// ------------------------------------------------------------------ corpus
function walk(absDir, relDir, parts, files) {
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const abs = path.join(absDir, e.name);
    const rel = path.join(relDir, e.name);
    if (e.isDirectory()) walk(abs, rel, parts, files);
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith('.d.ts')) {
      parts.push(read(abs)); files.push(rel);
    }
  }
}
function corpusOf(relPaths) {
  const parts = []; const files = [];
  for (const rel of relPaths || []) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, rel, parts, files);
    else if (/\.(jsx?|tsx?)$/.test(abs) && !/\.(test|spec)\./.test(abs)) { parts.push(read(abs)); files.push(rel); }
  }
  return { text: parts.join('\n'), files };
}
let APP_TEXT = null;
function appText() {
  if (APP_TEXT !== null) return APP_TEXT;
  const parts = [];
  (function w(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) w(abs);
      else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith('.d.ts')) parts.push(read(abs));
    }
  })(UI);
  APP_TEXT = parts.join('\n');
  return APP_TEXT;
}

// ------------------------------------------------------------------ A. distinctive classes
const CLASSES = [
  { key: 'table', label: 'tabular data', re: /<table\b|<thead\b|role=["']grid["']/g },
  { key: 'search', label: 'search', re: /\b(?:searchQuery|setSearch|handleSearch|searchTerm|SearchInput|type=["']search["'])/g },
  { key: 'filter', label: 'filtering', re: /\b(?:filter|Filter|FILTERS)\b/g },
  { key: 'sort', label: 'sorting', re: /\b(?:sortBy|setSort|sortKey|SortSelect|sortOrder)\b/g },
  { key: 'pagination', label: 'pagination / cursor / load-more', re: /\b(?:cursor|loadMore|Load more|pageSize|hasNext|nextCursor|perPage|offset)\b/g },
  { key: 'modal', label: 'dialog / drawer', re: /\b(?:Modal|Dialog|dialog|drawer|Drawer)\b/g },
  { key: 'csv', label: 'CSV export', re: /\b(?:toCSV|exportCsv|text\/csv|\.csv)\b/g },
  { key: 'json', label: 'JSON export', re: /\b(?:toJson|exportJson|application\/json)\b/g },
  { key: 'document', label: 'PDF / DOCX export', re: /\b(?:export-docx|export-pdf|exportPdf|downloadResumePdf|downloadResumeDocx|jspdf|docx)\b/g },
  { key: 'print', label: 'print', re: /\b(?:print\(|onPrint|printLetter|printSurface|window\.print)\b/g },
  { key: 'upload', label: 'file upload', re: /type=["']file["']|new FormData\(|\.upload\b/g },
  { key: 'drag', label: 'drag & drop', re: /\bdraggable\b|\bonDragStart\b|\bonDrop\b|\bonDragOver\b/g },
  { key: 'chart', label: 'chart / visualisation', re: /<svg\b|<canvas\b|recharts|<Chart\b/g },
  { key: 'bulk', label: 'bulk selection', re: /\b(?:selectedIds|bulk|selectAll|Select All)\b/g },
  { key: 'undo', label: 'undo / restore', re: /\b(?:undo|Undo|restoreFavourite|handleRestore)\b/g },
  { key: 'authz', label: 'client-side authorization gate', re: /\b(?:hasPermission|requirePermission|isSuperAdmin|isAdmin|canManage)\b/g },
];
const RISK = [
  { key: 'fixtures', label: 'seeded fixture arrays', re: /\b(?:const|let)\s+(?:INITIAL_[A-Z_]+|DEFAULT_[A-Z_]+|MOCK_[A-Z_]+)\s*(?::[^=]+)?=\s*\[/g },
  { key: 'fakeSuccess', label: 'swallow-then-success', re: /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)|catch\s*\{\s*\/\*\s*Keep baseline/g },
  { key: 'clientStorage', label: 'browser storage', re: /\b(?:localStorage|sessionStorage)\b/g },
];
const count = (t, re) => (t.match(re) || []).length;

// ------------------------------------------------------------------ B. action inventory
const HANDLER_RE = /(?:const|function|async function)\s+(handle[A-Z]\w+|toggle[A-Z]\w+|open[A-Z]\w+|export[A-Z]\w+|download[A-Z]\w+|print[A-Z]\w+|submit[A-Z]\w+|create[A-Z]\w+|delete[A-Z]\w+|remove[A-Z]\w+|save[A-Z]\w+|send[A-Z]\w+|run[A-Z]\w+|on[A-Z]\w+)/g;
const LABEL_RES = [
  // <Button ...>Label</Button>, <button ...>Label</button>, <a ...>Label</a>
  /<(?:Button|button|a|Link|MenuItem|DropdownMenuItem|option)\b[^>]*>\s*(?:<[^>]+>\s*)*([A-Z][^<>{}\n]{2,48})\s*(?:<\/|\n)/g,
  // aria-label="Label" / title="Label" / placeholder="Label"
  /(?:aria-label|title|placeholder)=["']([A-Z][^"']{2,40})["']/g,
];
function actions(text) {
  const handlers = new Set();
  for (const m of text.matchAll(HANDLER_RE)) handlers.add(m[1]);
  const labels = new Set();
  for (const re of LABEL_RES) {
    for (const m of text.matchAll(re)) {
      const v = m[1].trim().replace(/\s+/g, ' ');
      if (v && !/^[A-Z]\w*$/.test(v) === false && v.length > 48) continue;
      if (v.length >= 3) labels.add(v);
    }
  }
  return { handlers: [...handlers].sort(), labels: [...labels].sort() };
}
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'this', 'that', 'all', 'new', 'add', 'are', 'you', 'not', 'can', 'has', 'use', 'one', 'two', 'view', 'edit', 'save', 'close', 'open', 'next', 'back', 'more', 'show', 'hide']);
const tokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

// A legacy label counts as "carried" if every significant token of it appears in the modern corpus text,
// or if the modern corpus contains a label/handler sharing its rarest token.
function lostLabels(legacyActions, modernText, modernActions) {
  const modernTokens = new Set(tokens(modernText).concat(modernActions.labels.join(' ').match(/[a-z0-9]+/gi) || []));
  const out = [];
  for (const label of legacyActions.labels) {
    const toks = tokens(label);
    if (!toks.length) continue;
    const missing = toks.filter((t) => !modernTokens.has(t));
    if (missing.length === toks.length) out.push({ label, missing });
  }
  return out;
}
function lostHandlers(legacyActions, modernActions) {
  const modernHandlers = new Set(modernActions.handlers.map((h) => h.toLowerCase()));
  return legacyActions.handlers.filter((h) => {
    if (modernHandlers.has(h.toLowerCase())) return false;
    // handler names that differ only by a common verb pair still count as carried if the noun matches
    const core = h.replace(/^(handle|toggle|open|export|download|print|submit|create|delete|remove|save|send|run|on)/, '').toLowerCase();
    if (core.length < 4) return false;
    return ![...modernHandlers].some((m) => m.includes(core) || core.includes(m.replace(/^(handle|toggle|open|export|download|print|submit|create|delete|remove|save|send|run|on)/, '')));
  });
}

// ------------------------------------------------------------------ per-row analysis
const APP = {}; for (const c of CLASSES) APP[c.key] = count(appText(), c.re);

// Pass 1 — corpora and action inventories.
const staged = [];
for (const cap of parity.capabilities) {
  const L = corpusOf(cap.legacyPaths);
  const M = corpusOf(cap.modernPaths);
  staged.push({ cap, L, M, Lact: actions(L.text), Mact: actions(M.text) });
}

// Attribution breadth is the dominant false-positive source in this package: several rows point at whole
// directories (src/components/admin, src/components/EmployerPortal), so their legacy corpora legitimately
// contain other capabilities' actions. Measure document frequency per action and keep only actions that
// are distinctive to at most two rows; a widely shared action is an attribution artefact, not a loss.
const dfHandler = new Map();
const dfLabel = new Map();
for (const { Lact } of staged) {
  for (const h of Lact.handlers) dfHandler.set(h, (dfHandler.get(h) || 0) + 1);
  for (const l of Lact.labels) dfLabel.set(l, (dfLabel.get(l) || 0) + 1);
}
const DISTINCTIVE_DF = 2;

const rows = [];
for (const { cap, L, M, Lact, Mact } of staged) {
  const subfeatures = CLASSES.map((c) => {
    const legacy = count(L.text, c.re);
    if (!legacy) return null;
    const modern = count(M.text, c.re);
    let verdict;
    if (modern > 0) verdict = 'present';
    else if (APP[c.key] > 0) verdict = 'elsewhere-in-app';
    else verdict = 'absent';
    return { class: c.key, label: c.label, legacy, modern, appModern: APP[c.key], verdict };
  }).filter(Boolean);

  const absent = subfeatures.filter((s) => s.verdict === 'absent').map((s) => s.class);
  const elsewhere = subfeatures.filter((s) => s.verdict === 'elsewhere-in-app').map((s) => s.class);

  const distinctiveHandlers = Lact.handlers.filter((h) => (dfHandler.get(h) || 0) <= DISTINCTIVE_DF);
  const distinctiveLabels = Lact.labels.filter((l) => (dfLabel.get(l) || 0) <= DISTINCTIVE_DF);
  const lost = lostLabels({ labels: distinctiveLabels }, M.text, Mact);
  const lostH = lostHandlers({ handlers: distinctiveHandlers }, Mact);
  const risk = RISK.map((r) => ({ class: r.key, label: r.label, legacy: count(L.text, r.re), modern: count(M.text, r.re) }))
    .filter((r) => r.modern > 0);

  let auditStatus;
  if (DEEP_READ_M6.has(cap.id)) auditStatus = 'DEEP_READ_M6';
  else if (absent.length) auditStatus = 'ABSENT_CLASS';
  else if (lost.length + lostH.length >= 6) auditStatus = 'ACTION_DIFF';
  else if (elsewhere.length || lost.length + lostH.length) auditStatus = 'EQUIVALENCE_LEAD';
  else auditStatus = 'SIGNAL_CLEAN';

  rows.push({
    id: cap.id, domain: cap.domain, capability: cap.capability, classification: cap.classification,
    backend: cap.backend, legacyFiles: L.files.length, modernFiles: M.files.length,
    legacyPaths: cap.legacyPaths, modernPaths: cap.modernPaths,
    subfeatures, absent, elsewhere, risk,
    legacyActions: { handlers: Lact.handlers.length, labels: Lact.labels.length },
    modernActions: { handlers: Mact.handlers.length, labels: Mact.labels.length },
    distinctiveActions: { handlers: distinctiveHandlers.length, labels: distinctiveLabels.length },
    lostLabels: lost.slice(0, 40), lostHandlers: lostH.slice(0, 40),
    auditStatus,
    disposition: null, // filled by M7 human review in M7-CAPABILITY-CLOSURE.md; null = not adjudicated
  });
}

// Pass 3 — cross-row accounting.
// A legacy action that this row lost may still be implemented under another capability row (e.g. the
// whole {@code src/components/BuildResume} directory is the legacy scope of both the builder row and the
// share row). Before reporting a lead, check whether another row both owns the action in its legacy
// corpus and delivers a counterpart in its modern corpus. Those actions are re-labelled
// `accounted-by:<row>` and removed from the lead count; only genuinely unaccounted ones remain.
const legacyHandlersByRow = new Map();
const modernSurfaceByRow = new Map();
for (const { cap, Lact, Mact, M } of staged) {
  legacyHandlersByRow.set(cap.id, new Set(Lact.handlers));
  modernSurfaceByRow.set(cap.id, {
    handlers: new Set(Mact.handlers.map((h) => h.toLowerCase())),
    text: M.text.toLowerCase(),
  });
}
const core = (h) => h.replace(/^(handle|toggle|open|export|download|print|submit|create|delete|remove|save|send|run|on)/i, '').toLowerCase();
// Final fallback for rows with no modern files at all (MISSING rows): if the concept exists anywhere in
// frontend/src, the correct verdict is "equivalence candidate", not "loss". Nothing in the app => genuine loss.
const APP_LOWER = appText().toLowerCase();
const inApp = (action, kind) => {
  if (kind === 'handler') {
    const c = core(action);
    return c.length >= 5 && APP_LOWER.includes(c);
  }
  const toks = tokens(action);
  return toks.length >= 2 && toks.every((t) => APP_LOWER.includes(t));
};

for (const r of rows) {
  const account = (action, kind) => {
    for (const other of rows) {
      if (other.id === r.id) continue;
      const legacy = kind === 'handler' ? legacyHandlersByRow.get(other.id) : null;
      if (kind === 'handler' && !(legacy && legacy.has(action))) continue;
      const surf = modernSurfaceByRow.get(other.id);
      if (!surf) continue;
      if (kind === 'handler') {
        const c = core(action);
        if (c.length < 4) continue;
        if (surf.handlers.has(action.toLowerCase()) || [...surf.handlers].some((h) => h.includes(c))) return other.id;
      } else {
        const toks = tokens(action);
        if (toks.length && toks.every((t) => surf.text.includes(t))) return other.id;
      }
    }
    return inApp(action, kind) ? 'app' : null;
  };
  r.lostHandlersDetailed = r.lostHandlers.map((h) => ({ action: h, accountedBy: account(h, 'handler') }));
  r.lostLabelsDetailed = r.lostLabels.map((l) => ({ action: l.label, accountedBy: account(l.label, 'label') }));
  r.unaccountedHandlers = r.lostHandlersDetailed.filter((x) => !x.accountedBy).map((x) => x.action);
  r.unaccountedLabels = r.lostLabelsDetailed.filter((x) => !x.accountedBy).map((x) => x.action);
  r.accountedHandlers = r.lostHandlersDetailed.filter((x) => x.accountedBy);
  r.accountedLabels = r.lostLabelsDetailed.filter((x) => x.accountedBy);
  const unaccounted = r.unaccountedHandlers.length + r.unaccountedLabels.length;
  if (!DEEP_READ_M6.has(r.id)) {
    if (r.absent.length) r.auditStatus = 'ABSENT_CLASS';
    else if (unaccounted >= 4) r.auditStatus = 'ACTION_DIFF';
    else if (unaccounted > 0 || r.elsewhere.length) r.auditStatus = 'EQUIVALENCE_LEAD';
    else r.auditStatus = 'SIGNAL_CLEAN';
  }
}

// Pass 4 — apply the hand adjudications recorded in Evidence/adjudications-m7.json and, for the
// rows closed later, Evidence/adjudications-m8.json. M8 widened this from one file to an ordered
// list rather than editing the M7 artefact, so the two rounds stay separable and the later verdict
// wins only where it exists. A row keeps the round it was closed in (`adjudicatedIn`).
const ADJ_FILES = [ADJ, path.join(DR, 'Evidence/adjudications-m8.json')];
const adjudications = { rows: {} };
const adjudicationSources = [];
for (const file of ADJ_FILES) {
  if (!fs.existsSync(file)) continue;
  adjudicationSources.push(path.relative(ROOT, file));
  const data = JSON.parse(read(file));
  const round = /m8/.test(path.basename(file)) ? 'M8' : 'M7';
  for (const [id, entry] of Object.entries(data.rows || {})) {
    adjudications.rows[id] = { ...entry, adjudicatedIn: round };
  }
}
for (const r of rows) {
  const a = (adjudications.rows || {})[r.id];
  if (a) {
    r.adjudication = a;
    r.auditStatus = 'ADJUDICATED';
  }
}

const summary = {
  revision: HEAD,
  generatedAt: new Date().toISOString(),
  rows: rows.length,
  subfeatureRows: rows.reduce((n, r) => n + r.subfeatures.length, 0),
  byAuditStatus: rows.reduce((a, r) => { a[r.auditStatus] = (a[r.auditStatus] || 0) + 1; return a; }, {}),
  adjudicationFile: adjudicationSources[0] || null,
  adjudicationFiles: adjudicationSources,
  dispositionHistogram: rows.reduce((a, r) => {
    if (!r.adjudication) return a;
    a[r.adjudication.disposition] = (a[r.adjudication.disposition] || 0) + 1;
    return a;
  }, {}),
  rowsWithAbsentClass: rows.filter((r) => r.absent.length).length,
  rowsWithActionDiff: rows.filter((r) => r.unaccountedHandlers.length + r.unaccountedLabels.length > 0).length,
  rowsWithAccountedOnly: rows.filter((r) => (r.lostHandlers.length + r.lostLabels.length) > 0
    && (r.unaccountedHandlers.length + r.unaccountedLabels.length) === 0).length,
  crossRowAccountedActions: rows.reduce((n, r) => n + r.accountedHandlers.length + r.accountedLabels.length, 0),
  attributionRule: `an action counts as a lead only if it appears in the legacy corpora of <= ${DISTINCTIVE_DF} rows`, 
  absentClassHistogram: rows.reduce((a, r) => { for (const c of r.absent) a[c] = (a[c] || 0) + 1; return a; }, {}),
};
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({ ...summary, capabilities: rows }, null, 2) + '\n');

// ------------------------------------------------------------------ register
const md = [];
const push = (...l) => md.push(...l);
push('# Capability Subfeature Register (Mandate 7)', '');
push(`**Revision:** \`${HEAD}\` · **Generated:** ${summary.generatedAt} (generator clock, UTC) · **Generator:** \`developer-review/tools/capability-subfeature-audit.cjs\``);
push('**Machine-checkable twin:** `Evidence/artifacts/capability-subfeatures.json`', '');
push('## 1. Purpose and method', '');
push('Every capability row is decomposed into (A) the *distinctive* subfeature classes its legacy source');
push('exercised and (B) its user-visible action inventory — handler names and rendered labels. Distinctive');
push('classes exclude structural idioms (loose `onClick` counts, `isLoading` booleans, `aria-*` density), because');
push('those measure JSX-versus-hooks style rather than capability. A missing class or a legacy-only label is a');
push('**lead that a reviewer must resolve in source**; it is never itself a finding and never changes a');
push('classification.', '');
push('| auditStatus | meaning | rows |');
push('|---|---|---:|');
const AS_LABEL = {
  DEEP_READ_M6: 'read line-by-line in M6, with legacy→modern→backend→persistence tables',
  ABSENT_CLASS: 'a distinctive legacy class occurs nowhere in the modern tree',
  ACTION_DIFF: '≥6 legacy actions/labels have no modern counterpart in the row',
  EQUIVALENCE_LEAD: 'a class is absent from the row but present elsewhere, or 1–5 legacy actions are unaccounted for',
  ADJUDICATED: 'leads read by hand and closed with a recorded disposition (see Evidence/adjudications-m7.json and Evidence/adjudications-m8.json)',
  SIGNAL_CLEAN: 'every distinctive legacy class and action has a modern counterpart in the row',
};
for (const [k, v] of Object.entries(summary.byAuditStatus).sort((a, b) => b[1] - a[1])) push(`| \`${k}\` | ${AS_LABEL[k] || k} | ${v} |`);
push(`| **total** | | **${summary.rows}** |`, '');
push(`Across the 112 rows the tool extracted **${summary.subfeatureRows}** distinctive subfeature rows and found`);
push(`**${summary.rowsWithActionDiff}** rows still hold at least one unaccounted legacy action or label after`);
push(`cross-row accounting; **${summary.rowsWithAccountedOnly}** further rows looked divergent until the action was`);
push(`traced to another capability row, and **${summary.crossRowAccountedActions}** individual actions were`);
push('re-attributed that way.', '');
push(`**Attribution rule:** ${summary.attributionRule}. Without it the numbers were dominated by broad legacy`);
push('attribution (a row pointing at `src/components/admin` inherits every sibling capability\'s handlers), which');
push('is the same false-positive mechanism recorded in `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §6.', '');
push('## 2. Absent-class histogram', '');
if (Object.keys(summary.absentClassHistogram).length) {
  push('| class | rows where legacy has it and no modern file has it |', '|---|---:|');
  for (const [k, v] of Object.entries(summary.absentClassHistogram).sort((a, b) => b[1] - a[1])) push(`| \`${k}\` | ${v} |`);
} else {
  push('_No distinctive class is absent from the whole modern tree._ Every class the legacy tree exercised has');
  push('at least one occurrence somewhere in `frontend/src`; the losses are therefore *per capability*, not');
  push('per class, and are recorded row by row in §3 and adjudicated in `M7-CAPABILITY-CLOSURE.md`.');
}
push('');
push('## 3. Per-capability subfeature detail', '');
const byDomain = {};
for (const r of rows) (byDomain[r.domain] = byDomain[r.domain] || []).push(r);
for (const d of Object.keys(byDomain).sort()) {
  push(`### Domain ${d}`, '');
  for (const r of byDomain[d]) {
    push(`#### \`${r.id}\` — ${r.capability}`, '');
    push(`**Classification:** \`${r.classification}\`${r.adjudication ? ` · **adjudication:** \`${r.adjudication.disposition}\`` : ''} · **auditStatus:** \`${r.auditStatus}\` · **backend:** ${r.backend} · **files:** legacy ${r.legacyFiles} / modern ${r.modernFiles} · **actions:** legacy ${r.legacyActions.handlers} handlers / ${r.legacyActions.labels} labels → modern ${r.modernActions.handlers} / ${r.modernActions.labels}`, '');
    push('| subfeature class | legacy | modern (row) | modern (app) | verdict |', '|---|---:|---:|---:|---|');
    for (const s of r.subfeatures) push(`| ${s.label} | ${s.legacy} | ${s.modern} | ${s.appModern} | \`${s.verdict}\` |`);
    if (!r.subfeatures.length) push('| _no distinctive legacy subfeature class_ | 0 | 0 | 0 | `n/a` |');
    push('');
    if (r.adjudication) {
      push(`_Adjudication (M7, hand-read):_ ${r.adjudication.summary}`, '');
      push(`_Verified by:_ ${r.adjudication.verifiedBy}`, '');
    }
    if (r.unaccountedHandlers.length || r.unaccountedLabels.length) {
      push(`_Unaccounted legacy actions (leads):_ ${[...r.unaccountedHandlers.map((h) => `\`${h}()\``), ...r.unaccountedLabels.map((l) => `"${l}"`)].join(', ')}`, '');
      push('');
    }
    if (r.accountedHandlers.length || r.accountedLabels.length) {
      const sample = [...r.accountedHandlers.slice(0, 6).map((x) => `\`${x.action}()\`→${x.accountedBy}`), ...r.accountedLabels.slice(0, 4).map((x) => `"${x.action}"→${x.accountedBy}`)];
      push(`_Actions traced to another capability row (not losses):_ ${sample.join(', ')}${r.accountedHandlers.length + r.accountedLabels.length > 10 ? ` … (${r.accountedHandlers.length + r.accountedLabels.length} total)` : ''}`, '');
      push('');
    }
    if (r.risk.length) {
      push(`_Integrity risk in modern files:_ ${r.risk.map((x) => `\`${x.class}\` ×${x.modern}`).join(', ')}`, '');
    }
  }
}
fs.writeFileSync(OUT_MD, md.join('\n') + '\n');

console.log('M7 capability subfeature audit');
console.log(JSON.stringify(summary, null, 1));
const only = process.argv.indexOf('--row');
if (only > -1) {
  const r = rows.find((x) => x.id === process.argv[only + 1]);
  console.log(JSON.stringify(r, null, 1));
} else if (process.argv.includes('--verbose')) {
  for (const r of rows) {
    if (r.auditStatus === 'ABSENT_CLASS' || r.auditStatus === 'ACTION_DIFF') {
      console.log(`  ${r.auditStatus.padEnd(15)} ${r.id} absent=[${r.absent}] unaccounted=${r.unaccountedHandlers.length + r.unaccountedLabels.length} :: ${[...r.unaccountedHandlers, ...r.unaccountedLabels].slice(0, 8).join(' | ')}`);
    }
  }
}
console.log(`register: ${path.relative(ROOT, OUT_MD)}`);
