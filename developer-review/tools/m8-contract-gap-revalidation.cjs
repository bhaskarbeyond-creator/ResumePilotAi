#!/usr/bin/env node
/**
 * M8 §6 — independent revalidation of every client contract gap.
 *
 * The client-contract-audit parser and the route register are two different instruments. This
 * tool does not read the audit's dispositions; it takes only the (method, path) pairs the audit
 * says are unresolved, then asks the REGISTER whether an operation exists at that shape, at a
 * sibling shape (same segment count, dynamic-vs-dynamic), or nowhere. It also records, per gap,
 * whether any client call site swallows the failure and still shows success — the input to the
 * false-success gate.
 *
 * Disposition vocabulary (the six classes the mandate names):
 *   MISSING_BACKEND          no operation exists at any compatible shape
 *   WRONG_URL                an operation exists at a sibling shape only
 *   SIBLING_RESOURCE         a narrower/child operation exists but not the requested one
 *   NON_API_SCOPE            the path is a real endpoint outside the /api register (health/JSON/etc.)
 *   AMBIGUOUS                more than one candidate shape, static analysis cannot choose
 *   UNRESOLVED               neither instrument can decide
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DR = path.join(ROOT, 'developer-review');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DR, rel), 'utf8'));

const contract = readJson('Evidence/artifacts/client-contract-audit.json');
const reach = readJson('Evidence/artifacts/backend-reachability.json');

const normalise = (raw) => {
  let v = raw.replace(/\$\{[^}]*\}/g, '{X}').replace(/:([A-Za-z0-9_]+)/g, '{X}');
  if (v.startsWith('/api/')) v = v.slice(4);
  return v.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
};
const segments = (p) => p.split('/').filter(Boolean);
const shapeCompatible = (a, b) => {
  const x = segments(a); const y = segments(b);
  if (x.length !== y.length) return false;
  return x.every((s, i) => s === y[i] || s === '{X}' || y[i] === '{X}');
};

const opsByKey = new Map();
for (const op of reach.operations) {
  const key = normalise(op.path);
  if (!opsByKey.has(key)) opsByKey.set(key, []);
  opsByKey.get(key).push(op);
}
const registeredShapes = [...opsByKey.keys()];
const nonApi = new Set((reach.nonApiRouteList || []).map((r) => normalise(r.path)));

// Adjudicated semantic equivalents. The structural matcher above can only see shapes; a client
// that calls /billing/validate-coupon when the server serves /coupons/validate is structurally
// unrelated and semantically the same operation. Each entry below was read in source at this
// revision; the citation is the line that decides it. Entries never invent an operation: where
// nothing equivalent exists the class stays MISSING_BACKEND.
const ADJUDICATED = {
  '/admin/employer-applications/{X}/verify': {
    class: 'WRONG_URL',
    equivalent: 'PATCH /admin/employer-applications/:uid with { status: approved|rejected, expectedStatus, reason }',
    evidence: 'backend/index.js:6440-6475 (optimistic concurrency 409 ADMIN_TARGET_CHANGED, self-review block, audit action EMPLOYER_APPLICATION_REVIEWED)',
    limitation: 'client sends POST {decision}; the operation is PATCH with {status}',
  },
  '/admin/jobs/{X}/moderate': {
    class: 'WRONG_URL',
    equivalent: 'PATCH /admin/jobs/:jobId with exactly one of { status } or { isFeatured }',
    evidence: 'backend/index.js:6886-6908 (status allow-list active|pending|inactive|archived, resilientMutations.moderateJob, 409 on stale expectedStatus)',
    limitation: 'one change per request; the client posts a moderation action, not a status patch',
  },
  '/admin/users/{X}/status': {
    class: 'WRONG_URL',
    equivalent: 'PATCH /admin/users/:uid with { suspended: boolean, expectedSuspended }',
    evidence: 'backend/routes/adminUsers.js:673-710 (role/suspended/membership branches, permission check for account status)',
    limitation: 'client posts a status verb; the operation is PATCH with a boolean field and a CAS expectation',
  },
  '/billing/validate-coupon': {
    class: 'WRONG_URL',
    equivalent: 'POST /coupons/validate',
    evidence: 'backend/index.js:4597 (registered GET /coupons/active and POST /coupons/validate; both UNREACHABLE from modern code)',
    limitation: 'coupon validation is unreachable from any client, so the discount workflow is dead even under the correct URL',
  },
  '/blog/posts': {
    class: 'WRONG_URL',
    equivalent: 'GET /blog-data (public list) / POST /admin/blog/posts (authoring)',
    evidence: 'backend/routes/blogData.js:35-47 (public list with publishedOnly), mounted /api/blog-data at backend/index.js:517',
    limitation: 'read and write do not live under one contract; the admin surface uses /admin/blog/posts',
  },
  '/blog/posts/{X}': {
    class: 'WRONG_URL',
    equivalent: 'GET /blog-data/:id (read), PATCH /admin/blog/posts/:id (edit), DELETE /admin/blog/posts/:id (delete)',
    evidence: 'backend/routes/blogData.js:85-105 (read); backend/index.js:3388 PATCH /api/admin/blog/posts/:postId and :3408 DELETE (edit/delete)',
    limitation: 'the modern editor calls PUT where the server has PATCH, and no route accepts the editor payload',
  },
  '/jobs': {
    class: 'WRONG_URL',
    equivalent: 'GET /jobs-data',
    evidence: 'backend/routes/jobsData.js:159 (public-only projection) mounted at /api/jobs-data (backend/index.js:515)',
    limitation: 'even under the right URL the repository honours only publicOnly/status/employerId/limit, so q/location/type are ignored (FP-F07)',
  },
  '/admin/queues': {
    class: 'WRONG_URL',
    equivalent: 'GET /platform/queues',
    evidence: 'backend/routes/platform.js:465 GET /queues, mounted under /api/platform; UI-REACHABLE from the admin console',
    limitation: 'admin console and client disagree on the namespace',
  },
  '/admin/queues/{X}/retry': {
    class: 'WRONG_URL',
    equivalent: 'POST /platform/queues/retry { jobId, queue: "notification" }',
    evidence: 'backend/routes/platform.js:504-520 (single notification dead-letter job only)',
    limitation: 'the client retries a whole queue; the server retries one job and rejects any queue but notification',
  },
  '/admin/queues/dead-letter-queue/retry': {
    class: 'WRONG_URL',
    equivalent: 'POST /platform/queues/retry { jobId, queue: "notification" }',
    evidence: 'backend/routes/platform.js:504-511',
    limitation: 'no bulk retry exists',
  },
  '/admin/queues/dead-letter-queue/purge': {
    class: 'MISSING_BACKEND',
    equivalent: null,
    evidence: 'backend/routes/platform.js:543 POST /queues/purge is a RETIRED stub that answers 410 GONE; it looks like an equivalent operation in the register but executes nothing',
    limitation: 'no purge exists at any shape: the one route that matches the word is deliberately dead',
  },
  '/platform/status': {
    class: 'WRONG_URL',
    equivalent: 'GET /admin/platform/status (admin scope, requirePermission system.config.read + recent admin auth) and GET /service-availability (public boolean projection)',
    evidence: 'backend/routes/adminPlatformOperations.js:533 (mounted at /api/admin, backend/index.js:6927) and backend/index.js:5398 (public availability)',
    limitation: 'the client asks the public namespace for an admin-only projection',
  },
  '/notify/email': {
    class: 'MISSING_BACKEND',
    equivalent: null,
    evidence: 'register has only POST /notify/user-signup; no generic transactional-email operation exists',
    limitation: 'no operation exists at any shape or scope',
  },
  '/admin/operations/backup': {
    class: 'MISSING_BACKEND',
    equivalent: null,
    evidence: 'register has GET /platform/backup-status (read-only, UNREACHABLE); no backup-trigger operation exists',
    limitation: 'status can be read; the backup cannot be started through the API',
  },
  '/admin/operations/cache-clear': {
    class: 'MISSING_BACKEND',
    equivalent: null,
    evidence: 'no operation whose path contains cache or purge-cache exists in the register',
    limitation: 'no operation exists at any shape or scope',
  },
};

const unresolved = contract.calls.filter((c) => c.disposition !== 'REGISTERED_AND_MATCHED');
const byPath = new Map();
for (const call of unresolved) {
  const key = normalise(call.path);
  if (!byPath.has(key)) byPath.set(key, []);
  byPath.get(key).push(call);
}

const gaps = [];
for (const [p, calls] of [...byPath.entries()].sort()) {
  const exact = opsByKey.get(p) || [];
  const siblings = registeredShapes.filter((shape) => shape !== p && shapeCompatible(shape, p));
  const prefixMatches = registeredShapes.filter((shape) => shape.startsWith(p + '/') || p.startsWith(shape + '/'));
  let disposition;
  if (exact.length) disposition = 'AMBIGUOUS';
  else if (siblings.length === 1) disposition = 'WRONG_URL';
  else if (siblings.length > 1) disposition = 'AMBIGUOUS';
  else if (prefixMatches.length) disposition = 'SIBLING_RESOURCE';
  else if (nonApi.has(p)) disposition = 'NON_API_SCOPE';
  else disposition = 'MISSING_BACKEND';

  const adjudicated = ADJUDICATED[p];
  if (adjudicated) disposition = adjudicated.class;
  gaps.push({
    path: p,
    adjudicated: adjudicated || null,
    verbs: [...new Set(calls.map((c) => c.verb))],
    sites: calls.map((c) => `${c.file}:${c.line}`),
    siteCount: calls.length,
    parserDisposition: [...new Set(calls.map((c) => c.disposition))],
    swallowsFailure: calls.some((c) => c.swallows),
    claimsSuccessOnFailure: calls.some((c) => c.swallows && c.successAfter),
    disposition,
    siblingOperations: siblings.slice(0, 4),
    prefixOperations: disposition === 'SIBLING_RESOURCE' ? prefixMatches.slice(0, 4) : [],
    exactOperations: exact.map((o) => ({ method: o.method, reachability: o.reachability })),
  });
}

const classes = {};
for (const gap of gaps) classes[gap.disposition] = (classes[gap.disposition] || 0) + 1;
const falseSuccess = gaps.filter((g) => g.claimsSuccessOnFailure);

const payload = {
  revision: require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(),
  method: 'Takes the unresolved client call sites from client-contract-audit.json, normalises each to a METHOD-agnostic shape, and re-resolves it against the 393-operation register by exact shape, sibling shape (same segment count, dynamic segments either side) and prefix relationship. False-success is a property of the call site (failure swallowed AND success shown), not of the route.',
  counts: {
    clientCallSites: contract.callSites,
    matched: contract.tally.REGISTERED_AND_MATCHED,
    contractMismatch: contract.tally.REGISTERED_WITH_CONTRACT_MISMATCH,
    unresolvedSites: unresolved.length,
    distinctGapPaths: gaps.length,
    gapsWithFalseSuccess: falseSuccess.length,
    falseSuccessSites: contract.falseSuccessSites,
  },
  classes,
  gaps,
  note: 'MISSING_BACKEND means no operation at any compatible shape. It does not by itself prove the workflow is impossible: the capability may exist under a different contract (see siblingOperations) or the call may be dead code. Each such judgement is carried in the workflow traces of M8-INDEPENDENT-ACCEPTANCE-REPORT.md.',
};

fs.writeFileSync(path.join(DR, 'Evidence', 'artifacts', 'm8-contract-gap-revalidation.json'), JSON.stringify(payload, null, 1) + '\n');

console.log('gap revalidation @', payload.revision.slice(0, 12));
console.log('unresolved sites    :', payload.counts.unresolvedSites);
console.log('distinct gap paths  :', payload.counts.distinctGapPaths);
console.log('false-success paths :', payload.counts.gapsWithFalseSuccess, `(${payload.counts.falseSuccessSites} sites)`);
console.log('classes             :', JSON.stringify(classes));
