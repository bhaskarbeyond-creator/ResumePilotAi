#!/usr/bin/env node
/**
 * BACKEND OPERATION REACHABILITY REGISTER (audit-only, V4 reconciliation).
 *
 * Supersedes the binary "consumed / not consumed" split in backend-ui-coverage.cjs.
 * The V4 mandate requires seven reachability classes and an explicit rule per class,
 * because an operation that no browser calls is not automatically orphaned (webhooks,
 * scheduled jobs, M2M clients, health probes).
 *
 * Counting units are kept separate and reported separately:
 *   - route REGISTRATIONS   : literal `router.<verb>(...)` / `app.<verb>(...)` call sites
 *   - unique METHOD+path    : after mount-prefix resolution, normalisation and de-dup
 *   - handlers              : distinct (file, verb, path) handlers — 1 per unique operation here
 *   - DB operations         : NOT counted (see report §limitations)
 *
 * Rules, evaluated in order, first match wins (documented in the report):
 *   R1 UI-REACHABLE          path referenced from frontend/src outside the dead-hook file
 *   R2 INDIRECTLY-REACHABLE  path referenced only via a hook/wrapper that itself has a consumer
 *   R3 EXTERNAL-CALLER       provider webhook/callback, M2M, agent API (v1/mcp), OG image, health probe
 *   R4 SERVER-ONLY           referenced by backend code outside its own defining file
 *   R5 INTENTIONALLY-UNEXPOSED explicitly machine-scoped route (m2m / service-account guarded)
 *   R6 UNREACHABLE           no reference outside its defining file (tests count as non-callers)
 *   R7 UNVERIFIED            evidence is ambiguous (e.g. only a doc mentions it)
 *
 * Output:
 *   developer-review/Evidence/artifacts/backend-reachability.json
 *   developer-review/Evidence/artifacts/backend-operations.tsv
 *   developer-review/Evidence/logs/backend-reachability.log
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DR = path.join(ROOT, 'developer-review');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite', 'playwright-report', 'test-results']);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.htaccess') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (full === DR) continue;                 // never self-reference audit documents
      walk(full, out);
    } else if (/\.(js|jsx|ts|tsx|mjs|cjs|json|html|php|md|yml|yaml|sh|conf)$/.test(entry.name)) {
      if (entry.name.endsWith('package-lock.json')) continue;
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT, []);
const corpus = files.map(file => ({
  abs: file,
  rel: path.relative(ROOT, file).replace(/\\/g, '/'),
  text: fs.readFileSync(file, 'utf8'),
}));

function treeOf(rel) {
  if (rel.startsWith('frontend/src/')) return 'modern-ui';
  if (rel.startsWith('frontend/tests/') || rel.startsWith('frontend/playwright')) return 'modern-test';
  if (rel.startsWith('frontend/public/') || rel.startsWith('frontend/index.html')) return 'modern-public';
  if (rel.startsWith('src/')) return 'legacy-ui';
  // backend tests live in backend/test/ and backend/enterprise-test/; *.test.js anywhere counts
  if (rel.startsWith('backend/test/') || /\/enterprise-test\//.test(rel) || /\.test\.js$/.test(rel)) return 'backend-test';
  if (rel.startsWith('backend/')) return 'backend';
  if (rel.startsWith('scripts/') || rel.startsWith('deploy/') || rel.startsWith('docs/')) return 'tooling';
  if (rel.endsWith('.md')) return 'docs';
  return 'other';
}

// ---------------------------------------------------------------- route harvest
const idx = fs.readFileSync(path.join(ROOT, 'backend/index.js'), 'utf8');

const mounts = {};
for (const m of idx.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g)) {
  if (m[2] === 'express') continue;
  (mounts[m[2]] ??= []).push(m[1]);
}

const imports = {};
for (const m of idx.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(['"]\.\/(routes\/[\w-]+)['"]\)/g)) {
  for (const name of m[1].split(',').map(v => v.trim().split(':').pop().trim())) if (name) imports[name] = `backend/${m[2]}.js`;
}
for (const m of idx.matchAll(/const\s+(\w+)\s*=\s*require\(['"]\.\/(routes\/[\w-]+)['"]\)/g)) imports[m[1]] = `backend/${m[2]}.js`;
for (const m of idx.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/(routes\/[\w-]+)(?:\.js)?['"]/g)) imports[m[1]] = `backend/${m[2]}.js`;

function normalise(p) {
  let v = p.replace(/\/:([A-Za-z0-9_]+)/g, '/{X}').replace(/\$\{[^}]*\}/g, '{X}');
  if (v.startsWith('/api/')) v = v.slice(4);
  if (v === '/api') v = '/';
  return (v.replace(/\/+/g, '/').replace(/(.)\/$/, '$1') || '/');
}

let registrations = 0;
const operations = [];

const routeFiles = fs.readdirSync(path.join(ROOT, 'backend/routes')).filter(f => f.endsWith('.js'));
for (const file of routeFiles) {
  const rel = `backend/routes/${file}`;
  const varName = Object.keys(imports).find(k => imports[k] === rel);
  const prefixes = (varName && mounts[varName]) || [null];
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const prefix of prefixes) {
    for (const m of src.matchAll(/\brouter\.(get|post|put|patch|delete|options|head|all)\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`)/g)) {
      registrations += 1;
      const literals = m[2].match(/['"`]([^'"`]+)['"`]/g) || [];
      for (const lit of literals) {
        const routePath = lit.slice(1, -1);
        const full = prefix ? `${prefix}${routePath === '/' ? '' : routePath}` : routePath;
        operations.push({ method: m[1].toUpperCase(), path: normalise(full), file: rel, mounted: Boolean(prefix) });
      }
    }
  }
}

// direct app.<verb> handlers in index.js
for (const m of idx.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
  for (const lit of (m[2].match(/['"]([^'"]+)['"]/g) || [])) {
    const routePath = lit.slice(1, -1);
    if (!routePath.startsWith('/api')) continue;
    registrations += 1;
    operations.push({ method: m[1].toUpperCase(), path: normalise(routePath), file: 'backend/index.js', mounted: true });
  }
}

// de-duplicate on METHOD+path, remembering every defining site
const byKey = new Map();
for (const op of operations) {
  const key = `${op.method} ${op.path}`;
  const existing = byKey.get(key);
  if (existing) { existing.alsoDefinedIn.push(op.file); continue; }
  byKey.set(key, { ...op, alsoDefinedIn: [] });
}
const uniq = [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

// ---------------------------------------------------------------- reference scan
// A path appearing in a file is NOT evidence of a caller: admin health tables list
// API paths as display metadata (`affectedApis: ['/api/admin/audit-logs']`). A real
// caller must appear in call context — `get(`/`post(`/`fetch(`/`apiClient.get(` etc.
const CALL_SITE_RE = /(?:\b(?:get|post|patch|put|del|delete|fetch|request|apiRequest|apiClient\.(?:get|post|patch|put|delete)))\s*(?:<[^\n]{0,200}?>)?\(\s*(?:[`'"])(\/[^`'"]{1,160})/g;

function normaliseClientPath(raw) {
  let v = raw.replace(/\$\{[^}]*\}/g, '{X}').replace(/\/:([A-Za-z0-9_]+)/g, '/{X}');
  if (v.startsWith('/api/')) v = v.slice(4);
  return v.replace(/\/+$/, '') || '/';
}

const calledByFile = new Map();   // rel -> Set(endpoint)
const mentionedByFile = new Map(); // rel -> Set(endpoint) (string mention, not a call)
// A file that REGISTERS a route must never be treated as a caller of that same route
// (backend/index.js defines many routes it also appears to "call").
const definedByFile = new Map();  // rel -> Set(endpoint)
const DEFINE_RE = /\b(?:app|router)\.(?:get|post|put|patch|delete|options|head|all)\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`)/g;
for (const file of corpus) {
  const defined = new Set();
  DEFINE_RE.lastIndex = 0;
  let d;
  while ((d = DEFINE_RE.exec(file.text)) !== null) {
    for (const lit of d[1].match(/['"`]([^'"`]+)['"`]/g) || []) defined.add(normaliseClientPath(lit.slice(1, -1)));
  }
  definedByFile.set(file.rel, defined);
}
for (const file of corpus) {
  const calls = new Set();
  CALL_SITE_RE.lastIndex = 0;
  let m;
  while ((m = CALL_SITE_RE.exec(file.text)) !== null) {
    // `app.delete('/api/admin/ads/:id')` matches the `delete(` alternative but is a
    // route REGISTRATION, not a call. Look back for the express receiver.
    const prefix = file.text.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(?:app|router)\.\s*$/.test(prefix)) continue;
    calls.add(normaliseClientPath(m[1]));
  }
  calledByFile.set(file.rel, calls);
}
for (const op of uniq) {
  const needle = op.path;
  if (!needle || needle.length < 4) continue;
  for (const file of corpus) {
    if (file.rel === op.file) continue;
    if (!file.text.includes(needle)) continue;
    (mentionedByFile.get(file.rel) ?? mentionedByFile.set(file.rel, new Set()).get(file.rel)).add(needle);
  }
}

// does any file in `treeFilter` actually CALL this operation (either direction of prefix)?
function callers(opPath, treeFilter) {
  const hits = [];
  for (const [rel, calls] of calledByFile) {
    const tree = treeOf(rel);
    if (!treeFilter(tree)) continue;
    const definesIt = (definedByFile.get(rel) || new Set()).has(opPath);
    if (definesIt) continue;
    for (const call of calls) {
      // exact match, or a prefix match only across a dynamic segment ('{X}').
      // Loose prefix matching falsely promotes '/auth' to a caller of '/auth/login'.
      const exact = call === opPath;
      const dynamicChild = opPath.endsWith('{X}') && call.startsWith(opPath.replace(/\{X\}$/, ''));
      const dynamicParent = call.endsWith('{X}') && opPath.startsWith(call.replace(/\{X\}$/, ''));
      if (exact || dynamicChild || dynamicParent) { hits.push(rel); break; }
    }
  }
  return hits;
}

// A child endpoint being called does not prove the parent is called, and it prevents a
// confident UNREACHABLE verdict. Used by rule R7.
function childCalledFromModern(opPath) {
  for (const [rel, calls] of calledByFile) {
    if (treeOf(rel) !== 'modern-ui') continue;
    if ((definedByFile.get(rel) || new Set()).has(opPath)) continue;
    for (const call of calls) {
      if (call !== opPath && call.startsWith(opPath + '/')) return call;
    }
  }
  return null;
}

const EXTERNAL_PATTERNS = [
  /\/webhook/i,                     // provider -> us
  /\/callback/i,                    // OAuth / payment provider redirect
  /paypal\/verify/i, /razorpay\/verify-payment/i, /paytm\//i, /phonepe\//i, /stripe/i,
  /\/m2m/i,                          // machine-to-machine API
  /^\/v1\//,                         // agent/LLM-compatible API surface
  /^\/mcp/, /og\.png$/,
  /^\/readyz$/, /^\/healthz$/, /^\/health$/,
  /^\/public\//, /\.json$/,
];

const MACHINE_SCOPED = [/\/m2m/i, /service-account/i, /support-grant/i];

// Backend modules that require a routes module and invoke it in-process. These are
// genuine server-side callers that never emit an HTTP path string, so path scanning
// alone cannot see them.
// platformHealth.js is excluded on purpose: it enumerates router modules to probe
// their existence, it does not invoke handlers.
const MODULE_REUSE_EXCLUDE = new Set(['backend/services/platformHealth.js']);
const moduleReusedBy = new Map();   // routes file -> [reusing files]
for (const file of corpus) {
  if (!file.rel.startsWith('backend/') || file.rel === 'backend/index.js') continue;
  if (file.rel.startsWith('backend/test/') || /\/enterprise-test\//.test(file.rel) || /\.test\.js$/.test(file.rel)) continue;
  if (MODULE_REUSE_EXCLUDE.has(file.rel)) continue;
  for (const m of file.text.matchAll(/require\(['"]\.\.\/routes\/([\w-]+)['"]\)/g)) {
    const target = `backend/routes/${m[1]}.js`;
    (moduleReusedBy.get(target) ?? moduleReusedBy.set(target, []).get(target)).push(file.rel);
  }
}

const DEAD_HOOK_FILE = 'frontend/src/hooks/use-api-hooks.ts';

// ---- hook-consumer analysis -------------------------------------------------
// The single shared hook file defines N hooks. An endpoint referenced only there is
// INDIRECTLY-REACHABLE when at least one hook that calls it has a real consumer,
// and UNREACHABLE when every hook touching it is dead.
const hookSource = corpus.find(f => f.rel === DEAD_HOOK_FILE);
const hookEndpoints = new Map();   // endpoint -> [hook names]
const hookConsumers = new Map();   // hook name -> consumer count

if (hookSource) {
  const lines = hookSource.text.split('\n');
  let currentHook = null;
  for (const line of lines) {
    const decl = line.match(/export function (use\w+)\s*\(/);
    if (decl) { currentHook = decl[1]; continue; }
    if (!currentHook) continue;
    const call = line.match(/(?:get|post|patch|put|del)(?:<[^>]*>)?\(\s*[`'"](\/[^`'"]*)[`'"]/);
    if (!call) continue;
    const raw = call[1].replace(/\$\{[^}]*\}/g, '{X}');
    const endpoint = raw.replace(/^\/api\//, '/').replace(/\/+$/, '');
    (hookEndpoints.get(endpoint) ?? hookEndpoints.set(endpoint, []).get(endpoint)).push(currentHook);
  }
  for (const hook of new Set([...hookEndpoints.values()].flat())) {
    let consumers = 0;
    for (const file of corpus) {
      if (file.rel === DEAD_HOOK_FILE) continue;
      if (!file.rel.startsWith('frontend/src/')) continue;
      if (new RegExp(`\\b${hook}\\b`).test(file.text)) consumers += 1;
    }
    hookConsumers.set(hook, consumers);
  }
}

function hookVerdict(opPath) {
  const hooks = hookEndpoints.get(opPath) || [];
  if (!hooks.length) return null;
  const live = hooks.filter(h => (hookConsumers.get(h) || 0) > 0);
  return { hooks, live, dead: hooks.filter(h => !live.includes(h)) };
}

function classify(op) {
  const modernCalls = callers(op.path, t => t === 'modern-ui');
  const modernLive = modernCalls.filter(r => r !== DEAD_HOOK_FILE);
  const modernDeadHook = modernCalls.filter(r => r === DEAD_HOOK_FILE);
  const legacyCalls = callers(op.path, t => t === 'legacy-ui');
  const backendCalls = callers(op.path, t => t === 'backend');
  const modernTests = callers(op.path, t => t === 'modern-test');
  const backendTests = callers(op.path, t => t === 'backend-test');
  const mentionedModern = [...(mentionedByFile.get('frontend/src/hooks/use-api-hooks.ts') || [])].includes(op.path)
    || corpus.some(f => f.rel.startsWith('frontend/src/') && (mentionedByFile.get(f.rel) || new Set()).has(op.path));
  const external = EXTERNAL_PATTERNS.some(re => re.test(op.path));

  const base = {
    id: null,
    method: op.method,
    path: op.path,
    file: op.file,
    alsoDefinedIn: op.alsoDefinedIn,
    modernUiRefs: modernCalls.slice(0, 6),
    backendRefs: backendCalls.slice(0, 6),
    legacyUiRefs: legacyCalls.length,
    testRefs: [...modernTests, ...backendTests].slice(0, 4),
    mentionedOnlyInModern: modernCalls.length === 0 && mentionedModern,
  };

  // R1 — a real modern call site exists
  if (modernLive.length) {
    return { ...base, reachability: 'UI-REACHABLE', rule: 'R1', reason: `called from ${modernLive.length} modern source file(s)` };
  }
  // R2 — only the shared hook file calls it: live hook or dead hook?
  if (modernDeadHook.length) {
    const verdict = hookVerdict(op.path);
    if (verdict && verdict.live.length) {
      return {
        ...base,
        reachability: 'INDIRECTLY-REACHABLE',
        rule: 'R2',
        reason: `reached through hook(s) ${verdict.live.join(', ')} with consumer(s)`,
      };
    }
    return {
      ...base,
      reachability: 'UNREACHABLE',
      rule: 'R2',
      reason: verdict
        ? `only dead hook(s) ${verdict.dead.join(', ')} call it — 0 consumers`
        : 'called only from hooks/use-api-hooks.ts with no resolvable hook binding',
    };
  }
  // R7 — an exact call site is absent, but a child resource of this operation is
  // called from modern code. Static analysis cannot decide parent reachability.
  const childCall = childCalledFromModern(op.path);
  if (childCall) {
    return {
      ...base,
      reachability: 'UNVERIFIED',
      rule: 'R7',
      reason: `no direct call site, but a child path (${childCall}) is called from modern code; parent reachability not determinable statically`,
    };
  }
  // R3 — external caller
  if (external) {
    return { ...base, reachability: 'EXTERNAL-CALLER', rule: 'R3', reason: 'provider webhook/callback/M2M/agent-API/OG-image/health-probe surface' };
  }
  // R5 — explicitly machine-scoped
  if (MACHINE_SCOPED.some(re => re.test(op.path))) {
    return { ...base, reachability: 'INTENTIONALLY-UNEXPOSED', rule: 'R5', reason: 'machine/service-account scoped route' };
  }
  // R4 — backend calls it itself, over HTTP or by importing the router module
  const reused = moduleReusedBy.get(op.file) || [];
  if (backendCalls.length) {
    return { ...base, reachability: 'SERVER-ONLY', rule: 'R4', reason: `called by backend module(s): ${backendCalls.slice(0, 3).join(', ')}` };
  }
  if (reused.length) {
    return { ...base, reachability: 'SERVER-ONLY', rule: 'R4', reason: `router module reused in-process by ${reused.slice(0, 3).join(', ')}` };
  }
  // R6 — nothing but the defining file
  if (!legacyCalls.length && !modernTests.length && !backendTests.length) {
    return {
      ...base,
      reachability: 'UNREACHABLE',
      rule: 'R6',
      reason: base.mentionedOnlyInModern
        ? 'mentioned only as display metadata in modern code; never called'
        : 'no call site anywhere outside its defining route file',
    };
  }
  if (!legacyCalls.length) {
    return { ...base, reachability: 'UNREACHABLE', rule: 'R6', reason: 'called only by tests, never by a client' };
  }
  return {
    ...base,
    reachability: 'UNREACHABLE',
    rule: 'R6',
    reason: `legacy UI called it in ${legacyCalls.length} file(s); no modern client does`,
  };
}

const rows = uniq.map((op, index) => {
  const result = classify(op);
  return { ...result, id: `OP-${String(index + 1).padStart(4, '0')}` };
});

const CLASSES = ['UI-REACHABLE', 'INDIRECTLY-REACHABLE', 'EXTERNAL-CALLER', 'SERVER-ONLY', 'INTENTIONALLY-UNEXPOSED', 'UNREACHABLE', 'UNVERIFIED'];
const counts = Object.fromEntries(CLASSES.map(c => [c, rows.filter(r => r.reachability === c).length]));

const payload = {
  revision: require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(),
  units: {
    routeRegistrations: registrations,
    uniqueMethodPath: uniq.length,
    duplicateRegistrations: registrations - uniq.length,
    handlers: uniq.length,
    databaseOperations: null,
    databaseOperationsNote: 'not counted: database operations are not enumerable from route declarations; see DATABASE-INVENTORY.md',
  },
  classes: counts,
  total: rows.length,
  percentages: Object.fromEntries(CLASSES.map(c => [c, rows.length ? +(100 * counts[c] / rows.length).toFixed(1) : 0])),
  rules: {
    R1: 'UI-REACHABLE: referenced from frontend/src outside the dead-hook file',
    R2: 'dead-hook reference only -> UNREACHABLE (no consumer)',
    R3: 'EXTERNAL-CALLER: webhook/callback/M2M/agent-API/OG-image/health-probe',
    R5: 'INTENTIONALLY-UNEXPOSED: machine/service-account scoped',
    R4: 'SERVER-ONLY: referenced by backend code outside its defining file',
    R6: 'UNREACHABLE: no reference outside the defining file (tests are not callers)',
    R7: 'UNVERIFIED: ambiguous evidence',
  },
  operations: rows,
};

fs.mkdirSync(path.join(DR, 'Evidence', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(DR, 'Evidence', 'artifacts', 'backend-reachability.json'), JSON.stringify(payload, null, 1));

const tsv = ['op_id\tmethod\tpath\treachability\trule\treason\tmodern_refs\tlegacy_refs\ttest_refs\tdefined_in'];
for (const r of rows) {
  tsv.push([r.id, r.method, r.path, r.reachability, r.rule, r.reason.replace(/\t/g, ' '),
    r.modernUiRefs.length, r.legacyUiRefs, r.testRefs.length, r.file].join('\t'));
}
fs.writeFileSync(path.join(DR, 'Evidence', 'artifacts', 'backend-operations.tsv'), tsv.join('\n') + '\n');

const lines = [
  `revision                 : ${payload.revision.slice(0, 12)}`,
  `route registrations      : ${registrations}`,
  `unique METHOD+path       : ${uniq.length}`,
  `duplicate registrations  : ${registrations - uniq.length}`,
  '',
  'reachability classes (numerator / denominator = unique METHOD+path):',
  ...CLASSES.map(c => `  ${c.padEnd(24)} ${String(counts[c]).padStart(4)}  (${payload.percentages[c]}%)`),
];
fs.writeFileSync(path.join(DR, 'Evidence', 'logs', 'backend-reachability.log'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
