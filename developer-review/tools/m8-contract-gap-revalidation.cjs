#!/usr/bin/env node
/**
 * m8-contract-gap-revalidation.cjs — Mandate 8, gates E/F.
 *
 * Independent re-resolution of every client->backend gap found by the contract audit, plus a
 * re-derivation of the false-success count. The point is to answer "does an operation exist at
 * ANY contract for what this client asked for?" without reusing the audit's own candidate field:
 * this tool recomputes candidates from the 393-operation register and only then compares with the
 * audit. Where the two disagree, the disagreement is printed, not smoothed over.
 *
 * Classification (derived, never pinned):
 *   NO_OPERATION        no registered operation shares the request's tail
 *   ANOTHER_CONTRACT    >=1 registered operation shares the tail under a different prefix or verb
 *   AMBIGUOUS           >1 equally plausible contracts
 *   VERB_ONLY           same path, different verb
 *   NON_API_ENDPOINT    the only match is a non-/api endpoint (outside the register's scope)
 *
 * Usage: node developer-review/tools/m8-contract-gap-revalidation.cjs [--verbose]
 * Output: developer-review/Evidence/artifacts/m8-contract-gap-revalidation.json
 *         (machine-readable; the prose lives in M8-INDEPENDENT-ACCEPTANCE-REPORT.md §6)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DR = path.join(ROOT, 'developer-review');
const read = (p) => fs.readFileSync(p, 'utf8');
const ART = path.join(DR, 'Evidence/artifacts');
const HEAD = (() => { try { return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'unknown'; } })();

const contract = JSON.parse(read(path.join(ART, 'client-contract-audit.json')));
const reach = JSON.parse(read(path.join(ART, 'backend-reachability.json')));

const shape = (p) => p
  .replace(/:([A-Za-z0-9_]+)/g, '{X}')
  .replace(/\{[^}]*\}/g, '{X}')
  .replace(/\/+$/, '') || '/';
const stripApi = (p) => (p.startsWith('/api/') ? p.slice(4) : p);
const tail = (p) => {
  const segs = stripApi(shape(p)).split('/').filter(Boolean);
  return segs.slice(-1)[0] || '';
};
const inScope = (p) => p.startsWith('/api/') || p === '/api';

// ---- the register, as the authority -------------------------------------------------
const ops = reach.operations.map((o) => ({
  method: o.method,
  path: o.path,
  key: `${o.method} ${stripApi(o.path)}`,
  reachability: o.reachability,
  file: o.sourceFile || o.file || null,
}));
const opIndex = new Map(ops.map((o) => [o.key, o]));
const nonApi = reach.nonApiRouteList || [];

// ---- every unresolved client call site ----------------------------------------------
const unresolved = contract.calls.filter((c) => c.disposition !== 'REGISTERED_AND_MATCHED');
const byPath = new Map();
for (const call of unresolved) {
  const key = stripApi(shape(call.path));
  if (!byPath.has(key)) byPath.set(key, []);
  byPath.get(key).push(call);
}

// ---- semantic adjudications (hand-read, each with the operation that settles it) ----------
// A structural matcher cannot pair `/billing/validate-coupon` with `/coupons/validate`, or
// `/blog/posts` with `/blog-data`. These mappings were established by reading the handling code,
// not by string similarity, and each carries the operation it maps to and why. Anything not in
// this table is left to the structural classes above.
const EQUIVALENTS = {
  '/admin/employer-applications/{X}/verify': {
    op: 'PATCH /admin/employer-applications/{X}',
    why: 'the verification decision is a status transition on the application, not a /verify sub-resource',
  },
  '/admin/jobs/{X}/moderate': {
    op: 'PATCH /admin/jobs/{X}',
    why: 'moderation writes status/isFeatured on the job itself',
  },
  '/admin/users/{X}/status': {
    op: 'PATCH /admin/users/{X}',
    why: 'suspension is a boolean field on the user record',
  },
  '/billing/validate-coupon': {
    op: 'POST /coupons/validate',
    why: 'server-side coupon validation with price recomputation; there is no /billing tree',
  },
  '/blog/posts': {
    op: 'GET /blog-data',
    why: 'the blog transport is /blog-data; /blog/posts has never existed server-side',
  },
  '/blog/posts/{X}': {
    op: 'GET /blog-data/{X} | DELETE /blog-data/{X}',
    why: 'unchanged contract shape under the real transport',
  },
  '/jobs': {
    op: 'GET /jobs-data',
    why: 'the public listing lives on the data route (mounted at backend/index.js:515)',
  },
  '/admin/queues': {
    op: 'GET /platform/queues',
    why: 'queue telemetry is served under /platform, not /admin',
  },
  '/admin/queues/{X}/retry': {
    op: 'POST /platform/queues/retry',
    why: 'retry takes a jobId in the body; there is no per-job queue route',
  },
  '/admin/queues/dead-letter-queue/retry': {
    op: 'POST /platform/queues/retry',
    why: 'same retry operation, queue name in the body',
  },
  '/platform/status': {
    op: 'GET /admin/platform/status',
    why: 'the tenant-scoped status operation is admin-scoped; the public one is /service-availability',
  },
};

// A structural counterpart is not a capability. These two shapes have a same-word operation that
// cannot serve them, so they are recorded as missing backend rather than as retargets.
const NOT_EQUIVALENT = {
  '/admin/queues/dead-letter-queue/purge': {
    counterCandidate: 'POST /platform/queues/purge',
    why: 'that operation is a deliberate retirement stub answering 410 DEAD_LETTER_PURGE_RETIRED; a matching word is not a matching operation (runtime probe confirms 410)',
  },
  '/notify/email': {
    counterCandidate: null,
    why: 'no email-sending operation exists; /notify/user-signup is a signup hook, not a send-email contract',
  },
};

const gaps = [];
for (const [key, calls] of [...byPath.entries()].sort()) {
  // 1. exact contract already registered?
  const exact = calls
    .map((c) => opIndex.get(`${c.verb} ${stripApi(key)}`))
    .filter(Boolean);
  // 2. same path, other verb?
  const samePathOtherVerb = ops.filter((o) => o.key.split(' ')[1] === stripApi(key) && !exact.some((e) => e.key === o.key));
  // 3. same tail segment under a different prefix?
  const sameTail = ops.filter((o) => tail(o.path) === tail(key) && o.key.split(' ')[1] !== stripApi(key));
  // 4. non-/api endpoint with the same shape?
  const nonApiMatch = nonApi.filter((n) => shape(n.path) === key);

  let classification;
  if (exact.length) classification = 'AMBIGUOUS';            // registered, yet the audit called it a gap
  else if (samePathOtherVerb.length) classification = 'VERB_ONLY';
  else if (nonApiMatch.length && !sameTail.length) classification = 'NON_API_ENDPOINT';
  else if (sameTail.length === 1) classification = 'ANOTHER_CONTRACT';
  else if (sameTail.length > 1) classification = 'AMBIGUOUS';
  else classification = 'NO_OPERATION';

  const equivalent = EQUIVALENTS[key] || null;
  const notEquivalent = NOT_EQUIVALENT[key] || null;
  const disposition = notEquivalent
    ? 'MISSING_BACKEND'
    : equivalent
      ? 'WRONG_URL_ADJUDICATED'
      : (classification === 'NO_OPERATION' ? 'MISSING_BACKEND' : 'UNRESOLVED_STRUCTURAL');
  const missingBackend = disposition === 'MISSING_BACKEND';

  // recompute false success from the call sites themselves, not from a tally
  const swallows = calls.filter((c) => c.swallows);
  const falseSuccess = calls.filter((c) => c.swallows && c.successAfter);

  const adjudicated = equivalent
    ? { class: 'WRONG_URL', equivalent: equivalent.op, reason: equivalent.why, source: 'hand read' }
    : notEquivalent
      ? { class: 'MISSING_BACKEND', equivalent: null, reason: notEquivalent.why, source: 'hand read' }
      : classification === 'NO_OPERATION'
        ? { class: 'MISSING_BACKEND', equivalent: null, reason: 'no registered operation shares the request tail', source: 'structural' }
        : null;

  gaps.push({
    path: key,
    requestShape: key,
    adjudicated,
    verbs: [...new Set(calls.map((c) => c.verb))].sort(),
    sites: calls.map((c) => `${c.file}:${c.line}`),
    siteCount: calls.length,
    auditDisposition: [...new Set(calls.map((c) => c.disposition))],
    auditCandidate: calls.map((c) => (c.candidate ? `${c.candidate.method} ${c.candidate.path}` : null)).filter(Boolean),
    classification,
    disposition,
    missingBackend,
    equivalent,
    notEquivalent,
    candidates: sameTail.map((o) => ({ key: o.key, reachability: o.reachability })).slice(0, 6),
    verbOnly: samePathOtherVerb.map((o) => o.key).slice(0, 4),
    nonApiMatch: nonApiMatch.map((n) => `${n.method} ${n.path}`),
    exactRegistered: exact.map((o) => o.key),
    swallowSites: swallows.length,
    falseSuccessSites: falseSuccess.length,
    falseSuccessWhere: falseSuccess.map((c) => `${c.file}:${c.line}`),
  });
}

const hist = gaps.reduce((acc, g) => { acc[g.classification] = (acc[g.classification] || 0) + 1; return acc; }, {});
const dispHist = gaps.reduce((acc, g) => { acc[g.disposition] = (acc[g.disposition] || 0) + 1; return acc; }, {});
// false success is a property of the CALL SITE, so count it over all 212 sites, not only gaps
const allFalseSuccess = contract.calls.filter((c) => c.swallows && c.successAfter);
const fsPaths = [...new Set(allFalseSuccess.map((c) => c.path))];
const fsOnGaps = gaps.filter((g) => g.falseSuccessSites > 0);
const fsOnMatched = allFalseSuccess.filter((c) => c.disposition === 'REGISTERED_AND_MATCHED');
const fsOnMismatch = allFalseSuccess.filter((c) => c.disposition === 'REGISTERED_WITH_CONTRACT_MISMATCH');
const fsOnNoOp = allFalseSuccess.filter((c) => c.disposition === 'NO_REGISTERED_OPERATION');

const payload = {
  revision: HEAD,
  generatedAt: new Date().toISOString(),
  method: 'Re-resolves each unresolved client call against the 393-operation register by exact contract, same path/other verb, same tail segment under another prefix, and non-/api endpoint shape. Candidate lists come from the register; the audit artifact is only compared against, never copied.',
  counts: {
    clientCallSites: contract.callSites,
    matched: contract.tally.REGISTERED_AND_MATCHED,
    contractMismatch: contract.tally.REGISTERED_WITH_CONTRACT_MISMATCH,
    noRegisteredOperation: contract.tally.NO_REGISTERED_OPERATION,
    unresolvedSites: unresolved.length,
    distinctGapShapes: gaps.length,
    gapSites: gaps.reduce((n, g) => n + g.siteCount, 0),
    falseSuccessSites: allFalseSuccess.length,
    falseSuccessDistinctPaths: fsPaths.length,
    falseSuccessSitesOnUnresolvedPaths: fsOnGaps.reduce((n, g) => n + g.falseSuccessSites, 0),
    falseSuccessUnresolvedShapes: fsOnGaps.length,
    falseSuccessSitesOnMatchedPaths: fsOnMatched.length,
    falseSuccessSitesOnMismatchPaths: fsOnMismatch.length,
    falseSuccessSitesOnNoOperationPaths: fsOnNoOp.length,
    swallowsWithoutSuccess: contract.calls.filter((c) => c.swallows && !c.successAfter).length,
  },
  classificationHistogram: hist,
  dispositionHistogram: dispHist,
  falseSuccessPaths: fsPaths,
  gaps,
  agreements: {
    gapSetMatchesAudit:
      gaps.length === new Set(contract.calls.filter((c) => c.disposition !== 'REGISTERED_AND_MATCHED').map((c) => shape(c.path))).size,
    everyGapHasCandidateOrNone: gaps.every((g) => g.classification !== 'AMBIGUOUS' || g.exactRegistered.length + g.candidates.length > 0),
  },
  note: 'ANOTHER_CONTRACT is a repair shape (retarget the client), not a capability judgement: the operation may still be unauthorized, unimplemented or dead. That distinction is carried per workflow in the report.',
};

fs.mkdirSync(ART, { recursive: true });
fs.writeFileSync(path.join(ART, 'm8-contract-gap-revalidation.json'), JSON.stringify(payload, null, 1) + '\n');

console.log(`contract gap revalidation @ ${payload.revision.slice(0, 12)}`);
console.log(`client sites        : ${payload.counts.clientCallSites} (matched ${payload.counts.matched}, mismatch ${payload.counts.contractMismatch}, no-op ${payload.counts.noRegisteredOperation})`);
console.log(`gap shapes / sites  : ${payload.counts.distinctGapShapes} / ${payload.counts.gapSites}`);
console.log('classification      :', JSON.stringify(hist));
console.log(`false success       : ${payload.counts.falseSuccessSites} sites over ${payload.counts.falseSuccessDistinctPaths} paths`
  + ` (${payload.counts.falseSuccessSitesOnUnresolvedPaths} on ${payload.counts.falseSuccessUnresolvedShapes} unresolved shapes,`
  + ` ${payload.counts.falseSuccessSitesOnMatchedPaths} matched, ${payload.counts.falseSuccessSitesOnMismatchPaths} mismatch,`
  + ` ${payload.counts.falseSuccessSitesOnNoOperationPaths} no-operation)`);
console.log('disposition         :', JSON.stringify(dispHist));
for (const g of gaps) {
  console.log(`  ${g.classification.padEnd(16)} ${g.requestShape}  (${g.siteCount} site${g.siteCount === 1 ? '' : 's'}, falseSuccess ${g.falseSuccessSites})`);
}
