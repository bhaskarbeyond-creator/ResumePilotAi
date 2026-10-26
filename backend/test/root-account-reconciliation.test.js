'use strict';

/**
 * REC-026 — root authority is attested, not assumed.
 *
 * `SUPER_ADMIN` exists in two stores at once: the identity provider's custom claims (what a
 * token says) and `admin_user_roles` (what this platform can revoke). Neither observes the
 * other, so the interesting cases are the disagreements — and every one of them is a security
 * event rather than an error, which is why none of them shows up in a log.
 *
 * The pure function is tested directly; the route is tested for the two properties that matter
 * operationally: it refuses to report when it cannot see both halves (a false incident is worse
 * than no report), and it is SUPER_ADMIN-only.
 *
 * Run: NODE_ENV=test node --test test/root-account-reconciliation.test.js
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { MISMATCH, attest } = require('../services/rootAccountReconciliation');
const auth = require('../security/auth');
const metrics = require('../services/operationalMetrics');

const NOW = new Date('2026-10-26T09:00:00.000Z');

const root = (overrides = {}) => ({
  uid: 'root-1', email: 'root@example.com', role: 'SUPER_ADMIN',
  mfaEnrolled: true, emailVerified: true, suspended: false, ...overrides,
});

/* ── the pure comparison ─────────────────────────────────────────────── */

test('an aligned root account produces no mismatch at all', () => {
  const report = attest({
    claims: [root()],
    grants: [{ uid: 'root-1', role: 'SUPER_ADMIN' }],
    now: NOW,
  });
  assert.deepEqual(report.mismatches, []);
  assert.equal(report.summary.roots, 1);
  assert.equal(report.summary.mismatched, 0);
  assert.equal(report.checkedAt, NOW.toISOString());
  assert.deepEqual(report.roots[0], {
    uid: 'root-1', email: 'root@example.com', claimRole: 'SUPER_ADMIN',
    grantRoles: ['SUPER_ADMIN'], mfaEnrolled: true, emailVerified: true, suspended: false,
    findings: [], presentInIdentity: true,
  });
});

test('a claim the platform cannot revoke is named, with the action that fixes it', () => {
  const report = attest({ claims: [root()], grants: [], now: NOW });
  assert.equal(report.mismatches.length, 1);
  const [mismatch] = report.mismatches;
  assert.equal(mismatch.kind, MISMATCH.CLAIM_WITHOUT_GRANT);
  assert.match(mismatch.detail, /root-1 carries the SUPER_ADMIN claim/);
  assert.match(mismatch.remediation, /POST \/api\/admin\/rbac\/grants/, 'the remediation points at the audited API, not at a manual edit');
  assert.equal(report.summary.byKind[MISMATCH.CLAIM_WITHOUT_GRANT], 1);
});

test('a grant the identity provider does not back is named in the other direction', () => {
  const report = attest({
    claims: [{ uid: 'ghost-root', email: null, role: '', mfaEnrolled: true, emailVerified: true, suspended: false }],
    grants: [{ uid: 'ghost-root', role: 'SUPER_ADMIN' }],
    now: NOW,
  });
  assert.deepEqual(report.mismatches.map(mismatch => mismatch.kind), [MISMATCH.GRANT_WITHOUT_CLAIM]);
  assert.equal(report.roots[0].presentInIdentity, true);
  assert.equal(report.roots[0].claimRole, '', 'the claim is present but carries no role');
  assert.equal(report.roots[0].mfaEnrolled, true, 'the identity facts are reported even when the claim is empty');
});

test('a root the identity provider has never heard of is reported, not treated as fine', () => {
  const report = attest({ claims: [], grants: [{ uid: 'orphan-grant', role: 'SUPER_ADMIN' }], now: NOW });
  assert.equal(report.roots[0].presentInIdentity, false);
  assert.equal(report.roots[0].email, null);
  assert.equal(report.mismatches[0].kind, MISMATCH.GRANT_WITHOUT_CLAIM);
});

test('the three identity properties that make a root dangerous are each a finding', () => {
  const report = attest({
    claims: [
      root({ uid: 'no-mfa', mfaEnrolled: false }),
      root({ uid: 'unverified', emailVerified: false }),
      root({ uid: 'suspended-root', suspended: true }),
    ],
    grants: [
      { uid: 'no-mfa', role: 'SUPER_ADMIN' },
      { uid: 'unverified', role: 'SUPER_ADMIN' },
      { uid: 'suspended-root', role: 'SUPER_ADMIN' },
    ],
    now: NOW,
  });
  const byKind = report.summary.byKind;
  assert.equal(byKind[MISMATCH.ROOT_WITHOUT_MFA], 1);
  assert.equal(byKind[MISMATCH.ROOT_UNVERIFIED_EMAIL], 1);
  assert.equal(byKind[MISMATCH.ROOT_SUSPENDED], 1);
  assert.equal(report.summary.mismatched, 3, 'three accounts, three findings — the count is per account');
});

test('identity properties are checked only for root: an ADMIN without MFA is not a root finding', () => {
  const report = attest({
    claims: [{ uid: 'admin-1', email: 'a@example.com', role: 'ADMIN', mfaEnrolled: false, emailVerified: false, suspended: false }],
    grants: [{ uid: 'admin-1', role: 'ADMIN' }],
    now: NOW,
  });
  assert.deepEqual(report.mismatches, []);
  assert.equal(report.summary.roots, 0, 'a non-root account is not in the root population');
});

test('an account that is both claim-root and grant-root with a finding is counted once in `mismatched`', () => {
  const report = attest({
    claims: [root({ mfaEnrolled: false })],
    grants: [{ uid: 'root-1', role: 'SUPER_ADMIN' }],
    now: NOW,
  });
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.summary.mismatched, 1);
  assert.equal(report.summary.roots, 1);
});

test('malformed rows are skipped rather than counted as empty-unit accounts', () => {
  const report = attest({
    claims: [{ uid: '', role: 'SUPER_ADMIN' }, { role: 'SUPER_ADMIN' }, root()],
    grants: [{ uid: 'root-1', role: '' }, { uid: 'root-1', role: 'SUPER_ADMIN' }],
    now: NOW,
  });
  assert.equal(report.summary.claims, 1, 'a claim with no uid cannot be attested and is not counted');
  assert.equal(report.summary.grants, 1);
  assert.deepEqual(report.mismatches, []);
});

test('role comparison is case- and whitespace-insensitive in both stores', () => {
  const report = attest({
    claims: [root({ role: ' super_admin ' })],
    grants: [{ uid: 'root-1', role: 'Super_Admin' }],
    now: NOW,
  });
  assert.deepEqual(report.mismatches, [], 'a case difference is not a security event');
});

test('the summary always carries every mismatch kind, so a dashboard panel never goes blank', () => {
  const report = attest({ claims: [], grants: [], now: NOW });
  assert.deepEqual(Object.keys(report.summary.byKind).sort(), Object.values(MISMATCH).sort());
  assert.ok(Object.values(report.summary.byKind).every(count => count === 0));
});

/* ── the route ───────────────────────────────────────────────────────── */

auth.setTokenVerifierForTests(async token => {
  const identities = {
    admin: { uid: 'admin-1', email: 'a@example.com', role: 'ADMIN', email_verified: true },
    'super-admin': { uid: 'super-1', email: 's@example.com', role: 'SUPER_ADMIN', email_verified: true },
    support: { uid: 'support-1', email: 's@example.com', role: 'SUPPORT', email_verified: true },
  };
  const identity = identities[token];
  if (!identity) throw new Error('invalid token');
  return identity;
});

const app = require('../index');

test.after(() => {
  auth.setTokenVerifierForTests(null);
  metrics.resetForTests();
});

const as = (path, token) => {
  const req = request(app).get(path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

test('the attestation is SUPER_ADMIN-only, by the manifest rule rather than the handler', async () => {
  const anonymous = await as('/api/platform/operators/attestation');
  assert.equal(anonymous.status, 401);

  for (const token of ['admin', 'support']) {
    const res = await as('/api/platform/operators/attestation', token);
    assert.equal(res.status, 403, `${token} must not read a map of the root accounts, got ${res.status}`);
  }
});

test('with no identity provider it refuses, rather than attesting against fixtures', async () => {
  const res = await as('/api/platform/operators/attestation', 'super-admin');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'IDENTITY_UNAVAILABLE');
  assert.equal(
    metrics.snapshot().counters.find(entry => entry.name === 'admin_root_account_mismatches_total').series.length,
    0,
    'an unavailable directory must not be reported as a mismatch count'
  );
});

/* ── the metric ──────────────────────────────────────────────────────── */

test('an attestation run publishes one observation per mismatch kind found', () => {
  metrics.resetForTests();
  metrics.recordRootMismatches({ [MISMATCH.CLAIM_WITHOUT_GRANT]: 2, [MISMATCH.ROOT_WITHOUT_MFA]: 1, [MISMATCH.ROOT_SUSPENDED]: 0 });
  const counter = metrics.snapshot().counters.find(entry => entry.name === 'admin_root_account_mismatches_total');
  assert.deepEqual(
    counter.series.map(series => [series.labels.kind, series.value]).sort(),
    [[MISMATCH.CLAIM_WITHOUT_GRANT, 2], [MISMATCH.ROOT_WITHOUT_MFA, 1]],
    'a zero count creates no series: "none found" is the absence of an observation, not an observation of zero'
  );
});
