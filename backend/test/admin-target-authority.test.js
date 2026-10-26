'use strict';

/**
 * Privilege-escalation regression suite (RCA-005, RCA-006, REC-004, INV-2).
 *
 * ## What this suite proves
 *
 * Authorisation in the admin plane has two dimensions: the caller's authority
 * and the authority of the account being acted on. Before REC-004 only the
 * first existed, so an `ADMIN` could clear the second factor of a
 * `SUPER_ADMIN`. These tests pin the second dimension so that regression is
 * detectable in CI rather than in an incident review.
 *
 * ## Method
 *
 * The real Express app is mounted with `setTokenVerifierForTests`, and the
 * Firebase identity directory is stubbed on `app` (the same injection point
 * production uses via `req.app.get('firebaseAdmin')`). No network and no real
 * identity provider are required, which is what makes the matrix runnable in
 * CI on every commit.
 *
 * ## Interpretation
 *
 * `403` is a denial. Any other status proves the caller got past the
 * authorisation layers and reached business logic — the failure mode this
 * suite exists to prevent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { setTokenVerifierForTests } = require('../security/auth');
const {
  evaluateTargetAuthority,
  roleOf,
  rankOf,
  ROLE_RANK,
} = require('../security/targetAuthority');

const app = require('../index');

/* ── synthetic identities ─────────────────────────────────────────────── */

/**
 * The verifier receives the bearer string and returns a decoded-token shape.
 * Production tokens carry `role` at the top level; `resolveUser` then exposes it
 * as `req.user.claims.role`, which is what the permission resolver reads.
 */
setTokenVerifierForTests(async token => {
  const role = String(token || '').toUpperCase();
  return {
    uid: `uid-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.test`,
    role,
    // `resolveUser` reads Firebase's snake_case `email_verified` claim.
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_second_factor: role === 'SUPER_ADMIN' ? 'totp' : undefined },
  };
});

/* ── stub identity directory ──────────────────────────────────────────── */

/**
 * Build a Firebase-admin-shaped stub whose directory contains the given users.
 * @param {Record<string, string>} rolesByUid uid → role
 */
function stubIdentityDirectory(rolesByUid) {
  const calls = [];
  const directory = new Map();
  for (const [uid, role] of Object.entries(rolesByUid)) {
    directory.set(uid, {
      uid,
      email: `${uid}@example.test`,
      displayName: uid,
      disabled: false,
      customClaims: { role },
      multiFactor: { enrolledFactors: role === 'SUPER_ADMIN' ? [{ uid: 'factor-1', displayName: 'TOTP' }] : [] },
    });
  }
  const notFound = () => Object.assign(new Error('no user record'), { code: 'auth/user-not-found' });
  const handle = {
    auth: () => ({
      async getUser(uid) {
        calls.push({ op: 'getUser', uid });
        const found = directory.get(uid);
        if (!found) throw notFound();
        return found;
      },
      async getUserByEmail(email) {
        calls.push({ op: 'getUserByEmail', email });
        const found = [...directory.values()].find(item => item.email === email);
        if (!found) throw notFound();
        return found;
      },
      async updateUser(uid, patch) {
        calls.push({ op: 'updateUser', uid, patch });
        const found = directory.get(uid) || { uid, customClaims: {} };
        return { ...found, ...patch };
      },
      async revokeRefreshTokens(uid) {
        calls.push({ op: 'revokeRefreshTokens', uid });
        return undefined;
      },
      async generatePasswordResetLink(email) {
        calls.push({ op: 'generatePasswordResetLink', email });
        return `https://example.test/reset?email=${encodeURIComponent(email)}&token=stub`;
      },
      async deleteUser(uid) {
        calls.push({ op: 'deleteUser', uid });
        return undefined;
      },
      async setCustomUserClaims(uid, claims) {
        calls.push({ op: 'setCustomUserClaims', uid, claims });
        return undefined;
      },
    }),
  };
  return { handle, calls, directory };
}

/** Mount a stub directory for the duration of one test. */
function withIdentityDirectory(rolesByUid) {
  const stub = stubIdentityDirectory(rolesByUid);
  app.set('firebaseAdmin', stub.handle);
  return stub;
}

/* ── the six user-mutating operations under test ──────────────────────── */

const OPERATIONS = [
  { id: 'unenroll-mfa', method: 'post', path: uid => `/api/admin/users/${uid}/unenroll-mfa` },
  { id: 'revoke-sessions', method: 'post', path: uid => `/api/admin/users/${uid}/revoke-sessions` },
  { id: 'send-password-reset', method: 'post', path: uid => `/api/admin/users/${uid}/send-password-reset` },
  { id: 'ai-entitlement-put', method: 'put', path: uid => `/api/admin/users/${uid}/ai-entitlement` },
  { id: 'ai-quota-reset', method: 'post', path: uid => `/api/admin/users/${uid}/ai-quota-reset` },
  { id: 'patch-role', method: 'patch', path: uid => `/api/admin/users/${uid}` },
];

const TARGET_UID = 'uid-super_admin';
const ADMIN_TARGET_UID = 'uid-admin-peer';

function send(operation, callerRole, targetUid, body = {}) {
  const agent = request(app)[operation.method](operation.path(targetUid))
    .set('Authorization', `Bearer ${callerRole}`);
  return operation.id === 'ai-entitlement-put'
    ? agent.send({ dailyLimit: 50, maxTokens: 2048, ...body })
    : operation.id === 'patch-role'
      ? agent.send({ role: 'ADMIN', ...body })
      : agent.send(body);
}

/* ── unit level: the decision function itself ─────────────────────────── */

test('targetAuthority: role ranking is total and stable', () => {
  assert.ok(rankOf('SUPER_ADMIN') > rankOf('ADMIN'));
  assert.ok(rankOf('ADMIN') > rankOf('AUDITOR'));
  assert.equal(rankOf('AUDITOR'), rankOf('SUPPORT'));
  assert.ok(rankOf('SUPPORT') > rankOf('ENTERPRISE_ADMIN'));
  assert.ok(rankOf('ENTERPRISE_ADMIN') > rankOf('USER'));
  assert.equal(rankOf('NOT_A_ROLE'), 0);
  assert.equal(Object.keys(ROLE_RANK).length, 8);
});

test('targetAuthority: roleOf reads claims, customClaims and bare strings', () => {
  assert.equal(roleOf({ claims: { role: 'admin' } }), 'ADMIN');
  assert.equal(roleOf({ customClaims: { role: 'ADMIN' } }), 'ADMIN');
  assert.equal(roleOf({ role: 'AUDITOR' }), 'AUDITOR');
  assert.equal(roleOf('support'), 'SUPPORT');
  assert.equal(roleOf(null), '');
});

test('targetAuthority: ADMIN may never act on SUPER_ADMIN', () => {
  const decision = evaluateTargetAuthority({ claims: { role: 'ADMIN' } }, 'SUPER_ADMIN', 'unenroll-mfa');
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'TARGET_OUTRANKS_CALLER');
  assert.equal(decision.highRisk, true);
});

test('targetAuthority: SUPER_ADMIN → SUPER_ADMIN is permitted (INV-2 break-glass)', () => {
  const decision = evaluateTargetAuthority({ claims: { role: 'SUPER_ADMIN' } }, 'SUPER_ADMIN', 'unenroll-mfa');
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'SUPER_ADMIN_UNCONDITIONAL');
});

test('targetAuthority: peer ADMIN → ADMIN permitted, read-only roles never mutate', () => {
  assert.equal(evaluateTargetAuthority({ claims: { role: 'ADMIN' } }, 'ADMIN', 'revoke-sessions').allowed, true);
  for (const role of ['AUDITOR', 'SUPPORT']) {
    const decision = evaluateTargetAuthority({ claims: { role } }, 'USER', 'revoke-sessions');
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'READ_ONLY_ROLE');
  }
});

test('targetAuthority: unknown caller role fails closed', () => {
  const decision = evaluateTargetAuthority({ claims: {} }, 'USER', 'revoke-sessions');
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'CALLER_ROLE_UNKNOWN');
});

/* ── integration level: every handler, every caller/target pair ───────── */

for (const operation of OPERATIONS) {
  test(`${operation.id}: ADMIN against a SUPER_ADMIN target is denied`, async () => {
    const stub = withIdentityDirectory({ [TARGET_UID]: 'SUPER_ADMIN', [ADMIN_TARGET_UID]: 'ADMIN' });
    const response = await send(operation, 'ADMIN', TARGET_UID);
    assert.equal(response.status, 403, `${operation.id} returned ${response.status} — escalation still open`);
    assert.equal(response.body.code, 'TARGET_OUTRANKS_CALLER');
    // No mutation may have been attempted against the protected account.
    const mutations = stub.calls.filter(call =>
      ['updateUser', 'revokeRefreshTokens', 'deleteUser', 'setCustomUserClaims', 'generatePasswordResetLink'].includes(call.op));
    assert.deepEqual(mutations, [], `${operation.id} mutated the target before denying`);
  });

  test(`${operation.id}: AUDITOR and SUPPORT are denied against any target`, async () => {
    withIdentityDirectory({ [TARGET_UID]: 'SUPER_ADMIN', [ADMIN_TARGET_UID]: 'ADMIN' });
    for (const role of ['AUDITOR', 'SUPPORT']) {
      const response = await send(operation, role, ADMIN_TARGET_UID);
      assert.equal(response.status, 403, `${role} reached ${operation.id} (status ${response.status})`);
    }
  });

  test(`${operation.id}: SUPER_ADMIN passes the ceiling against a SUPER_ADMIN target`, async () => {
    withIdentityDirectory({ [TARGET_UID]: 'SUPER_ADMIN' });
    const response = await send(operation, 'SUPER_ADMIN', TARGET_UID);
    assert.notEqual(response.status, 403, `${operation.id} denied the super admin (${response.status})`);
  });
}

test('unenroll-mfa: ADMIN may still act on a peer ADMIN (no over-blocking)', async () => {
  const stub = withIdentityDirectory({ [ADMIN_TARGET_UID]: 'ADMIN' });
  const response = await send(OPERATIONS[0], 'ADMIN', ADMIN_TARGET_UID);
  assert.notEqual(response.status, 403, `peer-admin support regressed (${response.status})`);
  // The identity must have been resolved: that proves authorisation passed and
  // the handler ran. Whether the mutation completes depends on the audit store,
  // which is absent in CI (no MariaDB) by design.
  assert.ok(stub.calls.some(call => call.op === 'getUser'), 'expected the target identity to be resolved');
});

test('delete-user: ADMIN is denied at the super-admin step-up gate, never reaching the identity provider', async () => {
  const stub = withIdentityDirectory({ [TARGET_UID]: 'SUPER_ADMIN' });
  const response = await request(app)
    .post('/api/auth/purge-orphaned-auth')
    .set('Authorization', 'Bearer ADMIN')
    .send({ uid: TARGET_UID });
  assert.equal(response.status, 403);
  assert.equal(stub.calls.filter(call => call.op === 'deleteUser').length, 0);
});

test('delete-user: SUPER_ADMIN passes both gates and reaches the identity provider', async () => {
  const stub = withIdentityDirectory({ [TARGET_UID]: 'ADMIN' });
  const response = await request(app)
    .post('/api/auth/purge-orphaned-auth')
    .set('Authorization', 'Bearer SUPER_ADMIN')
    .send({ uid: TARGET_UID });
  assert.notEqual(response.status, 403, `super admin was denied (${response.status})`);
  assert.ok(stub.calls.some(call => call.op === 'getUser'), 'expected the target to be resolved');
});

test('unknown target identity resolves to 404, never to a silent allow', async () => {
  withIdentityDirectory({});
  const response = await send(OPERATIONS[0], 'ADMIN', 'uid-does-not-exist');
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'USER_NOT_FOUND');
});
