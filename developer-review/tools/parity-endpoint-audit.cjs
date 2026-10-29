#!/usr/bin/env node
/**
 * parity-endpoint-audit.cjs — Mandate 5 (d): challenge every `FULL PARITY` row.
 *
 * A capability row claims parity AND (via `endpoints` + `invoke: yes`) that the modern UI
 * actually exercises the backend. A route definition is not parity, and a declared endpoint
 * that is absent from, or unreachable in, the routed register cannot support the claim.
 *
 * For each FULL PARITY row this tool resolves every declared endpoint against the
 * authoritative register (Evidence/artifacts/backend-reachability.json):
 *
 *   EXACT              the declared path is a registered operation path
 *   MOUNT-PREFIX       not registered as written, but exactly one registered path ends with it
 *                      at a segment boundary (capability rows list paths without mount prefix)
 *   AMBIGUOUS          several registered paths could be meant — manual resolution required
 *   ABSENT             nothing in the register resembles it
 *
 * Then the row is graded:
 *   SUPPORTED                     every endpoint resolved and every resolved op is reachable
 *   SUPPORTED-AFTER-PREFIX        same, but at least one endpoint needed prefix resolution
 *   UNSUPPORTED-REACHABILITY      every endpoint resolves, but >=1 op is UNREACHABLE/UNVERIFIED
 *   UNSUPPORTED-ENDPOINT          >=1 endpoint is ABSENT, or AMBIGUOUS (unresolved evidence)
 *   MIXED                         some supported, some not
 *
 * Reachable classes: UI-REACHABLE, INDIRECTLY-REACHABLE, EXTERNAL-CALLER.
 * This is a *static* check. It cannot see runtime wiring, and it does not re-derive the
 * classification itself — it consumes the register produced by backend-reachability.cjs.
 *
 * Usage: node developer-review/tools/parity-endpoint-audit.cjs [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PARITY = path.join(ROOT, 'developer-review/Evidence/artifacts/feature-parity.json');
const REACH = path.join(ROOT, 'developer-review/Evidence/artifacts/backend-reachability.json');
const OUT = path.join(ROOT, 'developer-review/Evidence/artifacts/parity-endpoint-audit.json');

const REACHABLE = new Set(['UI-REACHABLE', 'INDIRECTLY-REACHABLE', 'EXTERNAL-CALLER']);

const norm = (p) => '/' + p.replace(/^\/api\//, '/').split('/').filter(Boolean).join('/');
const segs = (p) => p.split('/').filter(Boolean);

function main() {
  const parity = JSON.parse(fs.readFileSync(PARITY, 'utf8'));
  const reach = JSON.parse(fs.readFileSync(REACH, 'utf8'));

  // path -> { methods:Set, classes:Set, ids:[] }
  const byPath = new Map();
  for (const op of reach.operations) {
    const key = norm(op.path);
    if (!byPath.has(key)) byPath.set(key, { methods: new Set(), classes: new Set(), ids: [] });
    const entry = byPath.get(key);
    entry.methods.add(op.method);
    entry.classes.add(op.reachability);
    entry.ids.push(op.id);
  }
  const paths = [...byPath.keys()];

  const resolve = (raw) => {
    const ep = norm(raw);
    if (byPath.has(ep)) return { status: 'EXACT', path: ep };
    const candidates = paths.filter((p) => {
      const s = segs(p);
      const e = segs(ep);
      if (e.length > s.length) return false;
      return e.every((seg, i) => s[s.length - e.length + i] === seg);
    });
    const unique = new Set(candidates.map((c) => norm(c)));
    if (unique.size === 1) return { status: 'MOUNT-PREFIX', path: [...unique][0] };
    if (unique.size > 1) return { status: 'AMBIGUOUS', candidates: [...unique].sort() };
    // last-resort stem match, reported for manual resolution only
    const stem = (s) => {
      const last = s[s.length - 1].replace(/\{X\}$/, '');
      return last.replace(/s$/, '');
    };
    const stemHits = paths.filter((p) => stem(segs(p)) === stem(segs(ep)));
    if (stemHits.length) return { status: 'AMBIGUOUS', candidates: [...new Set(stemHits)].sort() };
    return { status: 'ABSENT' };
  };

  const rows = [];
  const allRows = [];
  for (const cap of parity.capabilities) {
    const endpoints = (cap.endpoints || []).map((raw) => {
      const r = resolve(raw);
      const entry = r.path ? byPath.get(r.path) : null;
      return {
        declared: raw,
        ...r,
        methods: entry ? [...entry.methods].sort() : [],
        classes: entry ? [...entry.classes].sort() : [],
        opIds: entry ? entry.ids : [],
        reachable: entry ? [...entry.classes].every((c) => REACHABLE.has(c)) : false,
      };
    });
    const absent = endpoints.filter((e) => e.status === 'ABSENT');
    const ambiguous = endpoints.filter((e) => e.status === 'AMBIGUOUS');
    const unreachable = endpoints.filter((e) => e.status !== 'ABSENT' && e.status !== 'AMBIGUOUS' && !e.reachable);
    const ok = endpoints.filter((e) => e.status !== 'ABSENT' && e.status !== 'AMBIGUOUS' && e.reachable);
    const prefixed = ok.some((e) => e.status === 'MOUNT-PREFIX');

    let grade;
    if (absent.length || ambiguous.length) grade = ok.length || unreachable.length ? 'MIXED' : 'UNSUPPORTED-ENDPOINT';
    else if (unreachable.length) grade = ok.length ? 'MIXED' : 'UNSUPPORTED-REACHABILITY';
    else grade = prefixed ? 'SUPPORTED-AFTER-PREFIX' : 'SUPPORTED';

    const record = {
      id: cap.id,
      capability: cap.capability,
      declaredInvoke: cap.invoke,
      grade,
      endpoints,
      counts: { ok: ok.length, unreachable: unreachable.length, absent: absent.length, ambiguous: ambiguous.length },
    };
    allRows.push(record);
    if (cap.classification === 'FULL PARITY') rows.push(record);
  }

  const tally = {};
  for (const r of rows) tally[r.grade] = (tally[r.grade] || 0) + 1;

  const out = {
    generatedAt: new Date().toISOString(),
    revision: (() => { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '..', '..') }).toString().trim(); } catch { return reach.revision; } })(),
    registerRevision: reach.revision,
    method:
      'Every FULL PARITY row\'s declared endpoints resolved against the routed register; ' +
      'capability rows omit mount prefixes so a unique segment-boundary suffix match is accepted as ' +
      'MOUNT-PREFIX, ambiguity is never accepted, and route-definition-only endpoints are not evidence.',
    reachableClasses: [...REACHABLE],
    fullParityRows: rows.length,
    tally,
    rows,
    // V5: the same endpoint resolution applied to EVERY capability row, so requirement (d) can state
    // how many of the 112 rows cite an endpoint that no registered operation serves — not just the
    // FULL rows that were downgraded.
    allRowsChecked: allRows.length,
    allRows: allRows.map((r) => ({ ...r, classification: parity.capabilities.find((c) => c.id === r.id).classification })),
    allRowsSummary: {
      withUnsupportedEndpoint: allRows.filter((r) => r.counts.absent || r.counts.ambiguous).length,
      withUnreachableEndpoint: allRows.filter((r) => r.counts.unreachable).length,
      fullySupported: allRows.filter((r) => !r.counts.absent && !r.counts.ambiguous && !r.counts.unreachable).length,
      rowsWithNoDeclaredEndpoint: allRows.filter((r) => r.endpoints.length === 0).length,
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`FULL PARITY rows audited : ${rows.length}`);
  console.log(`tally                    : ${JSON.stringify(tally)}`);
  console.log('');
  for (const r of rows) {
    const flag = r.grade === 'SUPPORTED' || r.grade === 'SUPPORTED-AFTER-PREFIX' ? ' ' : '!';
    console.log(`${flag} ${r.id}  ${r.grade.padEnd(24)} ${r.capability.slice(0, 46)}`);
    for (const e of r.endpoints) {
      if (e.status === 'ABSENT' || e.status === 'AMBIGUOUS' || !e.reachable) {
        const detail = e.status === 'AMBIGUOUS' ? ` -> ${e.candidates.join(' | ')}` : e.path ? ` -> ${e.classes.join(',')}` : '';
        console.log(`      ${e.status.padEnd(13)} ${e.declared}${detail}`);
      }
    }
  }
  console.log(`\nartifact: ${path.relative(ROOT, OUT)}`);
}

main();
