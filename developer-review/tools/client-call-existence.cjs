#!/usr/bin/env node
/**
 * client-call-existence.cjs — Mandate 5 (e): the missing direction.
 *
 * backend-reachability.cjs answers "is this registered operation called?". It cannot answer
 * "does every path the client calls actually exist?", and that blind spot hid a broken feature:
 * the modern blog pages call `/blog/posts` while the backend only registers `/blog-data`.
 *
 * This tool walks frontend/src, extracts every HTTP path literal passed to a call helper
 * (`get(`, `post(`, `patch(`, `del(`, `fetch(`, `enterpriseRequest(`, `api.get(` …), normalises
 * `:param` and `${…}`, and tests it against the register. It also attributes each call to hook
 * function ranges so a call inside a hook with zero consumers is reported separately from a
 * call in live component code.
 *
 * Classification per call:
 *   EXACT            path is a registered operation path
 *   METHOD-MISMATCH  path is registered but not with this verb
 *   DYNAMIC-TAIL     caller path ends in a template var and a registered path is a child of it
 *   MISSING          nothing in the register matches  -> dead call at runtime (404)
 *   NAVIGATION       `<Link to=`, `href=`, `navigate(` — not an API call, excluded
 *
 * Usage: node developer-review/tools/client-call-existence.cjs [--verbose]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const UI_ROOT = path.join(ROOT, 'frontend/src');
const REACH = path.join(ROOT, 'developer-review/Evidence/artifacts/backend-reachability.json');
const OUT = path.join(ROOT, 'developer-review/Evidence/artifacts/client-call-existence.json');

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__tests__', 'test-results']);

// callee name -> HTTP verb; `del(` is the repo's delete helper (frontend/src/lib/favourites.ts:71)
const VERBS = {
  get: 'GET', fetch: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  del: 'DELETE', delete: 'DELETE', remove: 'DELETE',
};
const GENERIC = /(?:\w*[Rr]equest|apiClient\.\w+|api\.get|api\.post|api\.patch|api\.delete)$/;

// two stages: find the callee + opening quote, then read the literal. A single regex that also
// requires the closing paren silently drops calls whose argument list runs beyond ~160 chars,
// which under-counted this scan to 192 sites on the first attempt.
// A TypeScript generic may itself contain `;`, `{`, `}` and newlines
// (`post<{ success?: boolean; cover?: Record<string, unknown> }>(`) — an earlier `[^\n;]` class
// rejected those and silently under-counted 202 of 212 call sites. Match the callee, then parse
// the generic/argument head out of the following window.
const CALLEE = /(?<![\w.$])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*(?=[<(])/g;
const HEAD = /^(?:\s*<[\s\S]{0,300}?>\s*)?\(\s*([`'"])/;
// Read the literal that starts at `start`. A template literal may contain `${…}` with quotes and
// braces inside (`/enterprise/queue/jobs${status && status !== 'x' ? '?status=' + status : ''}`),
// so scan to the matching backtick instead of stopping at the first quote character.
function readLiteral(text, start) {
  const open = text[start];
  if (open !== '`' && open !== "'" && open !== '"') return null;
  let i = start + 1;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { i += 2; continue; }
    if (open === '`') {
      if (ch === '$' && text[i + 1] === '{') { depth += 1; i += 2; continue; }
      if (depth > 0 && ch === '}') { depth -= 1; i += 1; continue; }
      if (ch === '`' && depth === 0) return { value: text.slice(start + 1, i), end: i };
    } else if (ch === open) {
      return { value: text.slice(start + 1, i), end: i };
    }
    i += 1;
  }
  return null;
}

const norm = (p) =>
  '/' + p.replace(/[?#][\s\S]*$/, '').replace(/^\/api\//, '/').replace(/\$\{[^}]*\}/g, '{X}').replace(/\/:([A-Za-z0-9_]+)/g, '/{X}')
    .split('/').filter(Boolean).join('/');

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (EXT.has(path.extname(entry.name)) && !/\.(test|spec)\./.test(entry.name) && !entry.name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

// Namespaces that really are HTTP clients. A dotted call such as `searchParams.get('tab')`,
// `map.get(id)` or `headers.get('x')` is NOT an API call — an earlier revision treated any
// `.get(` as HTTP and produced ~30 phantom "dead endpoints".
const CLIENT_NS = new Set(['api', 'apiClient', 'http', 'client', 'axios', 'fetcher', 'request']);

function verbFor(callee, tail) {
  const base = callee.split('.').pop();
  // `fetch('/api/export-docx', { method: 'POST' })` — an explicit method in the options wins.
  // Ignoring it reported five POST calls as GET and produced five phantom METHOD-MISMATCHes.
  const explicit = /\bmethod\s*:\s*['"]([A-Za-z]+)['"]/.exec(tail || '');
  if (callee.includes('.')) {
    const ns = callee.slice(0, callee.lastIndexOf('.'));
    if (!CLIENT_NS.has(ns)) return null;
    return (explicit && explicit[1].toUpperCase()) || VERBS[base] || (base === 'request' ? 'GET' : null);
  }
  if (callee === 'fetch' && explicit) return explicit[1].toUpperCase();
  if (VERBS[base]) return VERBS[base];
  if (callee === 'window.open') return 'NAVIGATION';
  if (GENERIC.test(callee)) {
    const m = /method\s*:\s*['"]([A-Za-z]+)['"]/.exec(tail || '');
    return m ? m[1].toUpperCase() : 'GET';
  }
  return null;
}

function main() {
  const reach = JSON.parse(fs.readFileSync(REACH, 'utf8'));
  const ops = new Map(); // path -> Set(method)
  for (const op of reach.operations) {
    const key = norm(op.path);
    if (!ops.has(key)) ops.set(key, new Set());
    ops.get(key).add(op.method);
  }
  const paths = [...ops.keys()];

  const files = walk(UI_ROOT, []);
  const calls = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    // hook function ranges, so a call inside `useX` with 0 consumers is not "live UI"
    const decls = [];
    const declRe = /(?:export\s+)?function\s+(use\w+)\s*\(/g;
    let d;
    while ((d = declRe.exec(text))) decls.push({ name: d[1], index: d.index });
    const hooksInFile = new Set(decls.map((x) => x.name));

    let m;
    CALLEE.lastIndex = 0;
    while ((m = CALLEE.exec(text))) {
      const callee = m[1];
      const afterCallee = m.index + m[0].length;
      const head = HEAD.exec(text.slice(afterCallee, afterCallee + 400));
      if (!head) continue;
      const litStart = afterCallee + head[0].length - 1; // position of the opening quote
      const literal = readLiteral(text, litStart);
      if (literal === null) continue;
      const rawPath = literal.value;
      // Bound the options tail to THIS call's argument list. A fixed 240-char window ran past
      // the closing `)` and picked up the next call's `method: 'POST'`, inventing mismatches.
      let tailEnd = literal.end + 1;
      let depth = 1;
      let quote = null;
      for (let i = literal.end + 1; i < Math.min(text.length, literal.end + 1200); i += 1) {
        const ch = text[i];
        if (quote) { if (ch === '\\') i += 1; else if (ch === quote) quote = null; continue; }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; if (depth === 0) { tailEnd = i; break; } }
      }
      const tail = text.slice(litStart, tailEnd);
      if (/^\.\.?\//.test(rawPath)) continue; // relative asset/import path, not an endpoint
      const verb = verbFor(callee, tail);
      if (!verb) continue;
      const p = norm(rawPath);
      if (rel.endsWith('ai-settings/utils/snippets.ts')) continue; // example code strings, not calls
      if (p === '/' || /\s/.test(p) || /^\/(assets|static|images|fonts|favicon)/.test(p)) continue;
      // a bare word such as `/tab` is a query-param key, not an endpoint
      if (!p.includes('/', 1) && !ops.has(p)) continue;

      if (verb === 'NAVIGATION') {
        calls.push({ file: rel, line: text.slice(0, m.index).split('\n').length, callee, verb: 'GET', path: p, status: 'NAVIGATION', detail: 'window.open — client-side route, not an API call', hook: null });
        continue;
      }
      const declared = ops.get(p);
      let status;
      let detail = '';
      if (declared && (declared.has(verb) || declared.has('ALL'))) status = 'EXACT';
      else if (declared) { status = 'METHOD-MISMATCH'; detail = `registered: ${[...declared].sort().join(',')}`; }
      else {
        // a literal such as `/admin/settings/branding` legitimately matches the registered
        // pattern `/admin/settings/{X}` (Express `:key`) — same length, `{X}` matches any segment.
        const dyn = paths.find((cand) => {
          const cs = cand.split('/').filter(Boolean);
          const ps = p.split('/').filter(Boolean);
          return cs.length === ps.length && cs.every((seg, i) => seg === ps[i] || seg === '{X}');
        });
        if (dyn) { status = 'DYNAMIC-MATCH'; detail = dyn; }
        else {
        const child = paths.find((cand) => cand.startsWith(p.replace(/\/$/, '') + '/'));
        if (p.endsWith('{X}') && child) { status = 'DYNAMIC-TAIL'; detail = child; }
        else status = 'MISSING';
        }
      }

      const owner = [...decls].reverse().find((x) => x.index < m.index);
      const rest = text.slice(m.index);
      const ownerEnd = owner ? text.indexOf('\nexport function', owner.index + 1) : -1;
      const inHook = owner && (ownerEnd === -1 || m.index < ownerEnd) ? owner.name : null;
      calls.push({ file: rel, line: text.slice(0, m.index).split('\n').length, callee, verb, path: p, status, detail, hook: inHook });
    }
    void hooksInFile;
  }

  // hook consumer counts (any reference to the hook name outside its own file)
  const consumerCount = new Map();
  for (const hook of new Set(calls.map((c) => c.hook).filter(Boolean))) {
    let n = 0;
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel.endsWith('use-api-hooks.ts') || rel.endsWith('hooks/index.ts')) continue;
      if (new RegExp(`\\b${hook}\\b`).test(fs.readFileSync(file, 'utf8'))) n += 1;
    }
    consumerCount.set(hook, n);
  }
  for (const c of calls) if (c.hook) c.hookConsumers = consumerCount.get(c.hook) || 0;

  const tally = {};
  for (const c of calls) tally[c.status] = (tally[c.status] || 0) + 1;

  const missing = calls.filter((c) => c.status === 'MISSING');
  const mismatch = calls.filter((c) => c.status === 'METHOD-MISMATCH');
  // distinct dead endpoints, with the live/dead status of their hook
  const deadMap = new Map();
  for (const c of missing) {
    const key = `${c.verb} ${c.path}`;
    if (!deadMap.has(key)) deadMap.set(key, { endpoint: key, sites: [] });
    deadMap.get(key).sites.push(`${c.file}:${c.line}${c.hook ? ` [${c.hook} consumers=${c.hookConsumers}]` : ''}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    revision: reach.revision,
    method:
      'Every HTTP path literal passed to a call helper in frontend/src (tests, .d.ts, navigation excluded) ' +
      'tested against the routed register. MISSING = the client calls a path with no registered operation, ' +
      'i.e. a 404 at runtime (or a dead fallback branch).',
    filesScanned: files.length,
    callSites: calls.length,
    tally,
    distinctMissingEndpoints: [...deadMap.values()],
    methodMismatches: mismatch.map((c) => ({ site: `${c.file}:${c.line}`, call: `${c.verb} ${c.path}`, detail: c.detail })),
    calls,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  console.log(`files scanned        : ${files.length}`);
  console.log(`call sites           : ${calls.length}`);
  console.log(`tally                : ${JSON.stringify(tally)}`);
  console.log(`distinct dead paths  : ${deadMap.size}`);
  console.log('');
  for (const { endpoint, sites } of deadMap.values()) {
    console.log(`MISSING  ${endpoint}`);
    for (const s of sites.slice(0, 4)) console.log(`         ${s}`);
  }
  if (mismatch.length) {
    console.log('\nMETHOD-MISMATCH:');
    for (const c of mismatch.slice(0, 20)) console.log(`  ${c.call.padEnd(46)} ${c.site} (${c.detail})`);
  }
  console.log(`\nartifact: ${path.relative(ROOT, OUT)}`);
}

main();
