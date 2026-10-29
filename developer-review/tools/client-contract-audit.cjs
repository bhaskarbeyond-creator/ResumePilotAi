#!/usr/bin/env node
/**
 * client-contract-audit.cjs — M7 (Mandate 7) client/backend contract register.
 *
 * Independently reconstructs every modern client call site, resolves the *effective* verb and URL
 * (client helper + base URL + path template + dynamic segments), and searches the backend for a
 * registration that could serve it — not only exact literals, but also:
 *   - the same shape under a different mount prefix (router mount map read from backend/index.js)
 *   - a verb/route mismatch on a matched path (POST where the server registers PATCH, etc.)
 *   - alias/legacy routers that forward a path
 *
 * Dispositions (mandate vocabulary):
 *   REGISTERED_AND_MATCHED        verb+shape resolve to a registered operation
 *   REGISTERED_WITH_CONTRACT_MISMATCH  path serves something, but not this verb/shape
 *   NO_REGISTERED_OPERATION       nothing in backend/ can serve it
 *   INDIRECTLY_RESOLVED           a wrapper/service abstraction issues the request on the caller's behalf
 *   INTENTIONALLY_EXTERNAL        the URL is not meant to hit this backend (absolute URL, third party)
 *   UNVERIFIED                    evidence insufficient
 *
 * It also records, per call site, what the client does on failure and whether the surrounding code
 * displays a success state — the false-success axis the mandate prioritises.
 *
 * Usage: node developer-review/tools/client-contract-audit.cjs [--verbose]
 * Output: developer-review/CLIENT-BACKEND-CONTRACT-REGISTER.md
 *         developer-review/Evidence/artifacts/client-contract-audit.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DR = path.join(ROOT, 'developer-review');
const UI = path.join(ROOT, 'frontend/src');
const BACKEND = path.join(ROOT, 'backend');
const OUT_MD = path.join(DR, 'CLIENT-BACKEND-CONTRACT-REGISTER.md');
const ADJ = path.join(DR, 'Evidence/adjudications-m7.json');
const OUT_JSON = path.join(DR, 'Evidence/artifacts/client-contract-audit.json');

const read = (p) => fs.readFileSync(p, 'utf8');
const artifact = (n) => JSON.parse(read(path.join(DR, 'Evidence/artifacts', n)));

let HEAD = 'unknown';
try { HEAD = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { /* unknown */ }

// ------------------------------------------------------------------ backend inventory (independent)
function backendFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'test', 'tests', '__tests__', 'enterprise-test'].includes(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) backendFiles(abs, acc);
    else if (e.name.endsWith('.js')) acc.push(abs);
  }
  return acc;
}

// ── Router identity resolution ───────────────────────────────────────────────
// A router is not always called `router`: routes/support.js defines `userRouter` and `adminRouter`
// and the same file is mounted twice (/api/support, /api/admin/support). Resolving receivers by
// literal name alone silently dropped that whole file, so resolve:
//   receiver identifier --(module.exports alias)--> exported name --(app.use in index.js)--> prefix
// and allow one module to resolve to more than one mount prefix.
const MODULE_REQUIRES = new Map();   // file -> Map(localName -> moduleFile)
const MOUNT_BY_EXPORT = new Map();   // `${moduleFile}#${exportedName}` -> prefix[]

function addRequireBinding(file, localName, modFile) {
  if (!MODULE_REQUIRES.has(file)) MODULE_REQUIRES.set(file, new Map());
  MODULE_REQUIRES.get(file).set(localName, modFile);
}

const routes = [];           // {method, path, file, line, receiver}
const exportsOf = new Map(); // file -> Map(internalName -> exportedName[])
const rawMounts = [];        // {prefix, identifier, file}

for (const abs of backendFiles(BACKEND)) {
  const rel = path.relative(ROOT, abs);
  const text = read(abs);
  const lines = text.split('\n');

  // require() bindings: `const x = require('./routes/foo')` and `const { a, b: c } = require(...)`
  const reqRe = /(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z0-9_$]+)\s*=\s*require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  let rm;
  while ((rm = reqRe.exec(text))) {
    let target = path.posix.join(path.posix.dirname(rel), rm[2]);
    if (!/\.(js|mjs|cjs)$/.test(target)) target += '.js';
    if (!fs.existsSync(path.join(ROOT, target))) continue;
    if (rm[1].startsWith('{')) {
      for (const part of rm[1].slice(1, -1).split(',')) {
        const bits = part.split(':').map((x) => x.trim()).filter(Boolean);
        if (!bits.length) continue;
        addRequireBinding(rel, bits[bits.length - 1], target);   // local name -> module
      }
    } else {
      addRequireBinding(rel, rm[1].trim(), target);
    }
  }

  // module.exports = router  |  module.exports = { router, other: alias, ... }
  const mod = text.match(/module\.exports\s*=\s*(\{[\s\S]*?\}|[A-Za-z0-9_$]+)\s*;?/);
  if (mod) {
    const body = mod[1].trim();
    const map = new Map();
    if (body.startsWith('{')) {
      for (const part of body.slice(1, -1).split(',')) {
        const bits = part.split(':').map((x) => x.trim()).filter(Boolean);
        if (!bits.length) continue;
        const key = bits[0].replace(/\s+/g, '');
        const val = bits[bits.length - 1].replace(/\s+/g, '');
        if (!/^[A-Za-z0-9_$]+$/.test(key) || !/^[A-Za-z0-9_$]+$/.test(val)) continue;
        map.set(val, [...(map.get(val) || []), key]);
      }
    } else if (/^[A-Za-z0-9_$]+$/.test(body)) {
      map.set(body, ['__default__']);
    }
    if (map.size) exportsOf.set(rel, map);
  }

  // app.use('/api/x', someRouter) — also array-form prefixes
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/app\.use\(\s*\[?\s*((?:['"`][^'"`]+['"`]\s*,?\s*)+)\]?\s*,\s*([A-Za-z0-9_$]+)/);
    if (!m) continue;
    const prefixes = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1].replace(/\/$/, ''));
    for (const prefix of prefixes) rawMounts.push({ prefix, identifier: m[2], file: rel });
  }

  // <receiver>.<verb>('/path') for router-like receivers only, including the array form.
  //
  // M8 repair: this loop previously accepted ANY identifier as a router. That made
  // `Promise.all([fetch('https://api.github.com/user', …), …])` parse as two POST/GET registrations of
  // an absolute URL, and it made every `.map(...)`/`.filter(...)`-style array literal a candidate. The
  // receiver must now be one of:
  //   - `app`
  //   - an identifier declared in this file as `express.Router()`
  //   - an identifier bound by `require()` to a module inside backend/
  // and the path literal must start with `/` (a route path is never an absolute URL).
  const declaredRouters = new Set(
    [...text.matchAll(/const\s+([A-Za-z0-9_$]+)\s*=\s*express\.Router\(\s*\)/g)].map((x) => x[1]),
  );
  const fileBindings = MODULE_REQUIRES.get(rel) || new Map();
  const routerLike = (name) => name === 'app' || declaredRouters.has(name) || fileBindings.has(name);

  const re = /\b([A-Za-z0-9_$]+)\.(get|post|put|patch|delete|all|head|options)\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g;
  let m;
  while ((m = re.exec(text))) {
    if (!routerLike(m[1])) continue;
    const line = text.slice(0, m.index).split('\n').length;
    const paths = [...m[3].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
    for (const raw of paths) {
      // `.get('q')` option lookups are not routes, and a route path is never an absolute URL
      if (!raw.startsWith('/')) continue;
      routes.push({ receiver: m[1], method: m[2].toUpperCase(), raw, file: rel, line });
    }
  }
}

// Pair each `app.use(prefix, identifier)` with the module the identifier requires, then with the
// exported name of the router object inside that module.
for (const m of rawMounts) {
  const binding = MODULE_REQUIRES.get(m.file);
  const modFile = binding && binding.get(m.identifier);
  if (!modFile) continue;
  const key = `${modFile}#${m.identifier}`;
  MOUNT_BY_EXPORT.set(key, [...(MOUNT_BY_EXPORT.get(key) || []), m.prefix]);
}

function prefixesForReceiver(file, receiver) {
  const aliases = exportsOf.get(file);
  const exportedNames = aliases && aliases.get(receiver);
  const out = [];
  for (const exp of exportedNames || []) {
    const hit = MOUNT_BY_EXPORT.get(`${file}#${exp}`);
    if (hit) out.push(...hit);
  }
  if (!out.length && receiver === 'router') {
    // fallback: a single-export router file mounted exactly once
    for (const [k, v] of MOUNT_BY_EXPORT) {
      if (k.startsWith(`${file}#`) && v.length === 1) out.push(...v);
    }
  }
  return [...new Set(out)];
}

// M8: `ops` are registration INSTANCES. Two alias literals on one call site that resolve to the same
// effective path (e.g. `app.get(['/api/v1/status', '/v1/status'])`) are one registration, not two. The
// previous version emitted both, which is where 6 of the 16-registration gap came from.
const ops = [];
const seenInstance = new Set();
function pushOp(op) {
  // The dedupe key uses the /api-stripped comparison shape: `['/api/v1/status','/v1/status']` is one
  // handler registered under two aliases, and counting it twice inflated this tool's registration total
  // (6 of the 16-registration gap against the canonical register). The raw path is preserved on the row.
  const shapeKey = op.path.replace(/^\/api(?=\/)/, '');
  const key = `${op.file}|${op.line}|${op.method}|${shapeKey}|${op.mountedAt || ''}`;
  if (seenInstance.has(key)) return;
  seenInstance.add(key);
  ops.push(op);
}
for (const r of routes) {
  if (r.receiver === 'app') {
    pushOp({ method: r.method, path: (r.raw.replace(/\/$/, '')) || '/', file: r.file, line: r.line, raw: r.raw });
    continue;
  }
  const prefixes = prefixesForReceiver(r.file, r.receiver);
  if (!prefixes.length) {
    pushOp({ method: r.method, path: (r.raw.replace(/\/$/, '')) || '/', file: r.file, line: r.line, raw: r.raw, unresolvedMount: true });
    continue;
  }
  for (const prefix of prefixes) {
    const full = r.raw.startsWith(prefix) ? r.raw : prefix + (r.raw.startsWith('/') ? r.raw : `/${r.raw}`);
    pushOp({ method: r.method, path: full.replace(/\/$/, '') || '/', file: r.file, line: r.line, raw: r.raw, mountedAt: prefix });
  }
}

// Compare with the canonical register so a difference is visible rather than silently reconciled.
let registerOps = [];
try { registerOps = artifact('backend-reachability.json').operations || []; } catch { /* absent */ }
const registerKey = new Set(registerOps.map((o) => `${o.method} ${o.path}`));

// ------------------------------------------------------------------ client inventory (independent)
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const abs = path.join(d, e.name);
    if (e.isDirectory()) walk(abs);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith('.d.ts')) files.push(abs);
  }
})(UI);

const CLIENTS = ['get', 'post', 'patch', 'put', 'del', 'delete', 'enterpriseRequest', 'request', 'axios.get', 'axios.post', 'axios.patch', 'axios.put', 'axios.delete', 'fetch'];
const CALL_RE = new RegExp(`\\b(${CLIENTS.map((c) => c.replace('.', '\\.')).join('|')})\\s*(?:<[^>]{0,120}>)?\\(\\s*([\`'"])([^\`'"]{1,200})\\2`, 'g');

const calls = [];
for (const abs of files) {
  const rel = path.relative(ROOT, abs);
  const text = read(abs);
  const lines = text.split('\n');
  let m;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(text))) {
    const callee = m[1];
    let verb = /post/.test(callee) ? 'POST' : /patch/.test(callee) ? 'PATCH' : /put/.test(callee) ? 'PUT'
      : /delete|del/.test(callee) ? 'DELETE' : /get/.test(callee) ? 'GET' : 'UNKNOWN';
    // `fetch(...)` and the shared `request`/`enterpriseRequest` helpers carry the verb in an options object
    // that follows the URL. Reading it is what separates a contract mismatch from a false positive.
    if (verb === 'UNKNOWN' || callee === 'fetch') {
      // Stop the options scan at the next request expression so a following call's `method:` cannot leak in.
      const tailFull = text.slice(m.index, m.index + 400);
      const nextCall = tailFull.slice(1).search(/(enterpriseRequest|request|axios\.|\bget\b|\bpost\b|\bpatch\b|\bput\b|\bdel\b|fetch)\s*(<[^>]*>)?\(/);
      const tail = nextCall > 0 ? tailFull.slice(0, nextCall + 1) : tailFull;
      const om = tail.match(/method:\s*['"`]([a-zA-Z]+)['"`]/);
      if (om) verb = om[1].toUpperCase();
      else if (verb === 'UNKNOWN') verb = 'GET';
    }
    let raw = m[3];
    const line = text.slice(0, m.index).split('\n').length;
    // `.get(` is also Map/URLSearchParams/Mapbox API: only string arguments that look like a URL path
    // are HTTP calls. Without this guard the register fills with `GET q` / `GET subtab` false positives.
    if (!raw.startsWith('/') && !raw.startsWith('http')) continue;

    // normalise template expressions: ${x} -> {X}; also /* */ leftovers
    let normalised = raw.replace(/\$\{[^}]*\}/g, '{X}').replace(/\{[^}]*\}/g, '{X}');

    // absolute URLs => external
    if (/^https?:\/\//.test(normalised)) {
      calls.push({ file: rel, line, callee, verb, raw, path: normalised, disposition: 'INTENTIONALLY_EXTERNAL', candidate: null, note: 'absolute URL' });
      continue;
    }
    // strip query string for matching, remember it
    const [pathOnly] = normalised.split('?');
    // `lib/api-client.ts` sets baseURL '/api', so a caller path is relative to that prefix; callers that
    // already pass '/api/...' (fetch/axios direct) are absolute. Both are represented as `matchPaths`.
    const candidates = pathOnly.startsWith('/api/') ? [pathOnly] : [`/api${pathOnly}`, pathOnly];
    calls.push({ file: rel, line, callee, verb, raw, path: pathOnly, matchPaths: candidates, query: normalised.includes('?') ? normalised.split('?')[1] : null, disposition: null, candidate: null, note: '' });
  }
  void lines;
}

// ------------------------------------------------------------------ matching
function shape(pathStr) {
  return pathStr
    .replace(/\{[^}]*\}/g, '{X}')      // client template placeholders
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{X}') // express params
    .replace(/\*$/, '{X}')              // wildcard tail
    .replace(/\/+/g, '/')
    .replace(/(.)\/$/, '$1');
}
function matchesOp(p, opPath) {
  const a = shape(p).split('/');
  const b = shape(opPath).split('/');
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '{X}' || b[i] === '{X}') continue;          // dynamic segments align
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const opIndex = ops.map((o) => ({ ...o, shape: shape(o.path) }));

for (const c of calls) {
  if (c.disposition) continue;
  const candidates = opIndex.filter((o) => c.matchPaths.some((mp) => matchesOp(mp, o.path)));
  if (!candidates.length) {
    // prefix/suffix alias check: does some operation end with the same last two segments?
    const tail = shape(c.matchPaths[0]).split('/').slice(-2).join('/');
    const alias = opIndex.filter((o) => shape(o.path).endsWith(tail));
    if (alias.length) {
      c.disposition = 'REGISTERED_WITH_CONTRACT_MISMATCH';
      c.candidate = alias[0];
      c.note = `same tail "${tail}" exists at ${alias[0].method} ${alias[0].path}`;
    } else {
      c.disposition = 'NO_REGISTERED_OPERATION';
      c.note = 'no registration shares this path shape or tail';
    }
    continue;
  }
  const verbMatch = candidates.find((o) => o.method === c.verb || o.method === 'ALL');
  if (verbMatch) {
    c.disposition = 'REGISTERED_AND_MATCHED';
    c.candidate = verbMatch;
  } else {
    c.disposition = 'REGISTERED_WITH_CONTRACT_MISMATCH';
    c.candidate = candidates[0];
    c.note = `path exists as ${candidates.map((o) => o.method).join('/')}, client sends ${c.verb}`;
  }
}

// ------------------------------------------------------------------ failure/success semantics
const SUCCESS = /(success|Success|succeeded|completed|purged|deleted|updated|saved|sent|re-?dispatched|verified|Dispatched)/;
for (const c of calls) {
  const abs = path.join(ROOT, c.file);
  const lines = read(abs).split('\n');
  const start = Math.max(0, c.line - 3);
  const window = lines.slice(start, c.line + 14).join('\n');
  c.swallows = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)|catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*|\/\/)\s*Keep baseline/.test(window);
  c.successAfter = c.swallows && SUCCESS.test(lines.slice(c.line, c.line + 14).join('\n'));
  c.onFailure = c.swallows ? 'swallowed (no user-visible error)' : (/catch/.test(window) ? 'caught and surfaced' : 'not handled at the call site');
}

// ------------------------------------------------------------------ summary
const tally = {};
for (const c of calls) tally[c.disposition] = (tally[c.disposition] || 0) + 1;
const gaps = calls.filter((c) => c.disposition === 'NO_REGISTERED_OPERATION' || c.disposition === 'REGISTERED_WITH_CONTRACT_MISMATCH');
const falseSuccess = calls.filter((c) => c.successAfter);
const distinctGapPaths = [...new Set(gaps.map((c) => shape(c.path)))];

const result = {
  revision: HEAD,
  generatedAt: new Date().toISOString(),
  clientFilesScanned: files.length,
  callSites: calls.length,
  backendRegistrationsParsed: ops.length,
  // M8: the full registration list is emitted so the 397-vs-413 question can be reconciled row by row
  // instead of by assertion. Each entry carries source file:line, the raw literal and the mount prefix
  // that produced the effective path.
  backendRegistrations: ops.map((o) => ({
    method: o.method,
    path: o.path,
    raw: o.raw,
    file: o.file,
    line: o.line,
    mountedAt: o.mountedAt || null,
    unresolvedMount: Boolean(o.unresolvedMount),
  })),
  backendRegisterAgreement: (() => {
    // The canonical register records paths relative to the /api base; this parser keeps the full path.
    const norm = (m, p) => `${m} ${shape(p).replace(/^\/api(?=\/)/, '')}`;
    const registerSet = new Set(registerOps.map((o) => norm(o.method, o.path)));
    const parsedSet = new Set(ops.filter((o) => o.path.startsWith('/')).map((o) => norm(o.method, o.path)));
    const onlyParser = [...parsedSet].filter((k) => !registerSet.has(k));
    const onlyRegister = [...registerSet].filter((k) => !parsedSet.has(k));
    return {
      registerOperations: registerOps.length,
      parsedRaw: ops.length,
      parsedDistinct: parsedSet.size,
      shared: [...parsedSet].filter((k) => registerSet.has(k)).length,
      onlyInParser: onlyParser.slice(0, 25),
      onlyInRegister: onlyRegister.slice(0, 25),
      note: 'The register expands array-form and dynamic routes differently from this parser; the shared set is the agreement measure, the two exclusives are listed rather than reconciled silently.',
    };
  })(),
  tally,
  distinctGapPaths: distinctGapPaths.length,
  falseSuccessSites: falseSuccess.length,
  calls,
};
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + '\n');

// ------------------------------------------------------------------ register
const md = [];
const p = (...l) => md.push(...l);
p('# Client ↔ Backend Contract Register (Mandate 7)', '');
p(`**Revision:** \`${HEAD}\` · **Generated:** ${result.generatedAt} (generator clock, UTC) · **Generator:** \`developer-review/tools/client-contract-audit.cjs\``);
p('**Machine-checkable twin:** `Evidence/artifacts/client-contract-audit.json`', '');
p('## 1. Method (independent of the V5/V6 inventory)', '');
p('The tool re-derives both sides from source:');
p('');
p('1. **Backend** — every `app.<verb>(path)` and every `router.<verb>(path)` is parsed from `backend/**/*.js`,');
p('   and router-file routes are joined to their mount prefix by resolving the `require()` that binds the');
p(`   router identifier in \`backend/index.js\`. This yields **${ops.length}** registrations and is compared`);
p(`   with the canonical register (${registerOps.length} operations) so any divergence is printed rather than hidden.`);
p('2. **Client** — every `get/post/patch/put/del/delete/fetch/axios.*/enterpriseRequest/request` call with a');
p('   literal or template-literal URL is captured, with `${…}` segments normalised to `{X}` and query strings');
p('   separated. Absolute URLs are classified `INTENTIONALLY_EXTERNAL`.');
p('3. **Matching** — a call resolves only if the *number* of path segments matches and every segment is equal');
p('   or dynamic on one side. Tail-only overlap is reported as a contract mismatch, never as a match.');
p('4. **Failure semantics** — for each site the surrounding 17 lines are inspected for a swallowed catch and a');
p('   success assertion.');
p('');
p('## 2. Tally', '');
p('| disposition | call sites |', '|---|---:|');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) p(`| \`${k}\` | ${v} |`);
p(`| **total** | **${calls.length}** |`, '');
p(`- Distinct paths with **no** serving operation or a verb/shape mismatch: **${distinctGapPaths.length}**`);
p(`- Call sites in that set: **${gaps.length}**`);
p(`- Call sites that swallow a failure and then assert success: **${falseSuccess.length}**`);
p('');
p('## 3. Contract gaps (full list)', '');
p('| # | caller | verb | effective path | disposition | nearest backend | failure handling | success after swallow |');
p('|---:|---|---|---|---|---|---|---|');
gaps.forEach((c, i) => {
  p(`| ${i + 1} | \`${c.file}:${c.line}\` | ${c.verb} | \`${c.path}\` | \`${c.disposition}\` | ${c.candidate ? `${c.candidate.method} ${c.candidate.path} (\`${c.candidate.file}:${c.candidate.line}\`)` : '—'} | ${c.onFailure} | ${c.successAfter ? '**yes**' : 'no'} |`);
});
p('');
// ---------------------------------------------------------------- adjudications
let adjudications = { contractGaps: {}, rows: {} };
try { adjudications = JSON.parse(read(ADJ)); } catch { /* not yet recorded */ }
const gapAdj = adjudications.contractGaps || {};
const adjudicated = Object.keys(gapAdj).filter((k) => !k.startsWith('_'));
p('## 4. Gap adjudications (hand-read at this revision)', '');
p('Machine-readable twin: `Evidence/adjudications-m7.json` → `contractGaps`. Each entry separates a **wrong URL**');
p('(the capability exists under another contract, so the client is broken and the backend is not) from a');
p('**missing backend capability** (nothing in `backend/` implements it). That distinction decides whether the fix');
p('is a client retarget or a feature build, and it is the distinction DISC-025 did not make.', '');
const stillGap = new Set(distinctGapPaths);
const repaired = adjudicated.filter((k) => gapAdj[k].kind === 'RESOLVED_BY_REGISTER_REPAIR');
p(`Adjudicated: **${adjudicated.length - repaired.length} of ${distinctGapPaths.length}** distinct gap paths, plus **${repaired.length}** paths previously reported as gaps and closed as register-repair artefacts (they are served; see DISC-041).`, '');
p('| path | kind | verb | equivalent operation | user-visible behaviour | false success | severity |');
p('|---|---|---|---|---|---|---|');
for (const key of adjudicated.sort()) {
  const a = gapAdj[key];
  const eq = a.equivalentOperation ? a.equivalentOperation.replace(/\|/g, '\\|') : '— **none**';
  p(`| \`${key}\` | \`${a.kind}\` | ${a.verb || ''} | ${eq} | ${String(a.clientBehaviour || '').replace(/\|/g, '\\|')} | ${a.falseSuccess ? '**yes**' : 'no'} | ${a.severity || ''} |`);
}
p('');
for (const key of adjudicated.sort()) {
  const a = gapAdj[key];
  p(`### \`${key}\` — ${a.kind}`, '');
  if (a.evidence) p(`- **Backend evidence:** ${a.evidence}`);
  if (a.payloadMismatch) p(`- **Payload mismatch:** ${a.payloadMismatch}`);
  if (a.alsoCalledAs) p(`- **Also:** ${a.alsoCalledAs}`);
  if (a.securityNote) p(`- **Not inflated:** ${a.securityNote}`);
  if (a.sites) p(`- **Call sites:** ${a.sites.map((x) => `\`${x}\``).join(', ')}`);
  p('');
}
p('## 5. Every call site', '');
p('| caller | verb | path | disposition | backend | notes |');
p('|---|---|---|---|---|---|');
for (const c of calls) {
  p(`| \`${c.file}:${c.line}\` | ${c.verb} | \`${c.path}\` | \`${c.disposition}\` | ${c.candidate ? `${c.candidate.method} ${c.candidate.path}` : '—'} | ${c.note || ''} |`);
}
p('');
fs.writeFileSync(OUT_MD, md.join('\n') + '\n');

console.log('M7 client/backend contract audit');
console.log(JSON.stringify({ revision: HEAD, callSites: calls.length, backendRegistrations: ops.length, tally, distinctGapPaths: distinctGapPaths.length, gaps: gaps.length, falseSuccess: falseSuccess.length }, null, 1));
if (process.argv.includes('--verbose')) {
  const seen = new Set();
  for (const g of gaps) {
    const k = shape(g.path);
    if (seen.has(k)) continue; seen.add(k);
    console.log(`  ${g.disposition.padEnd(34)} ${g.verb.padEnd(6)} ${g.path}  ->  ${g.candidate ? g.candidate.method + ' ' + g.candidate.path : 'none'}  [${g.file}:${g.line}]`);
  }
}
console.log(`register: ${path.relative(ROOT, OUT_MD)}`);
