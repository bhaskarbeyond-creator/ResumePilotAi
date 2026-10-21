'use strict';

// Self-service sensitive operations used by the candidate Settings page.
//
// The app below mirrors index.js: requireAuth for /api, then the route policy
// (security/policy.js), then the users-data router. Identity tokens come from
// the test verifier and carry Firebase's verified `auth_time` (the time of the
// last real sign-in), never `iat` (the time the token was minted/refreshed).

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const auth = require('../security/auth');
const { enforceApiPolicy } = require('../security/policy');
const { usersDataRouter } = require('../routes/usersData');

const nowSeconds = () => Math.floor(Date.now() / 1000);
const identityFor = {
  fresh: () => ({ uid: 'casey', email: 'casey@example.com', email_verified: true, role: 'USER', auth_time: nowSeconds() - 60 }),
  // Signed in an hour ago; the token itself may have been refreshed seconds ago.
  stale: () => ({ uid: 'casey', email: 'casey@example.com', email_verified: true, role: 'USER', auth_time: nowSeconds() - 3600, iat: nowSeconds() - 5 }),
};

function auditRepository() {
  const audit = [];
  return {
    audit,
    async getUser(uid) { return { id: uid, email: 'casey@example.com', revision: 1 }; },
    async recordSecurityAuditLog(entry) { audit.push(entry.action); },
  };
}

function identityAdminDouble({ failWith = null, factors = [] } = {}) {
  const calls = [];
  const fail = async () => { throw failWith; };
  return {
    calls,
    auth: () => ({
      getUser: failWith ? fail : async (uid) => { calls.push(['getUser', uid]); return { uid, multiFactor: { enrolledFactors: factors } }; },
      updateUser: async (uid, patch) => { calls.push(['updateUser', uid, patch]); },
      revokeRefreshTokens: async (uid) => { calls.push(['revokeRefreshTokens', uid]); },
    }),
  };
}

function appFor({ repo, identityAdmin }) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.repository = repo; res.locals.requestId = 'test-request'; next(); });
  app.use('/api', auth.requireAuth, (req, res, next) => enforceApiPolicy(req, res, next));
  app.set('firebaseAdmin', identityAdmin);
  app.use('/api/users-data', usersDataRouter);
  return app;
}

test.before(() => {
  auth.setTokenVerifierForTests(async (token) => {
    const make = identityFor[token];
    if (!make) throw new Error('unknown test token');
    return make();
  });
});

test('MFA unenrolment requires a recent sign-in (auth_time), like account deletion', async () => {
  const repo = auditRepository();
  const identityAdmin = identityAdminDouble({ factors: [{ uid: 'f1' }] });
  const response = await request(appFor({ repo, identityAdmin }))
    .post('/api/users-data/mfa/disable').set({ Authorization: 'Bearer stale' }).send({});
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'RECENT_AUTH_REQUIRED');
  assert.deepEqual(identityAdmin.calls, [], 'no identity-provider call may run for a stale session');
  assert.deepEqual(repo.audit, []);
});

test('the route policy keeps account deletion behind the same recent sign-in rule', () => {
  for (const [path, token, expectNext] of [
    ['/account/delete', 'stale', false],
    ['/account/delete', 'fresh', true],
    ['/users-data/mfa/disable', 'stale', false],
    ['/users-data/mfa/disable', 'fresh', true],
    // Ordinary reads and profile saves are not sensitive operations.
    ['/users-data/profile', 'stale', true],
    ['/account/export', 'stale', true],
  ]) {
    const decoded = identityFor[token]();
    const req = { method: 'POST', path, user: { uid: decoded.uid, emailVerified: true, claims: decoded } };
    const res = {
      locals: { requestId: 'test-request' }, statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    let next = false;
    enforceApiPolicy(req, res, () => { next = true; });
    assert.equal(next, expectNext, `${token} ${path}`);
    if (!expectNext) assert.equal(res.body.error.code, 'RECENT_AUTH_REQUIRED', path);
  }
});

test('a fresh session unenrols every factor, revokes sessions and audits both steps', async () => {
  const repo = auditRepository();
  const identityAdmin = identityAdminDouble({ factors: [{ uid: 'f1' }, { uid: 'f2' }] });
  const response = await request(appFor({ repo, identityAdmin }))
    .post('/api/users-data/mfa/disable').set({ Authorization: 'Bearer fresh' }).send({});
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, mfaEnabled: false, removedFactorCount: 2 });
  assert.deepEqual(identityAdmin.calls.map(([name]) => name), ['getUser', 'updateUser', 'revokeRefreshTokens']);
  assert.deepEqual(identityAdmin.calls[1][2], { multiFactor: { enrolledFactors: [] } });
  assert.deepEqual(repo.audit, ['USER_MFA_UNENROLL_REQUESTED', 'USER_MFA_UNENROLLED']);
});

test('identity-provider failures are reported as a controlled outage without provider internals', async () => {
  const providerError = Object.assign(
    new Error('Credential implementation provided to initializeApp() via the "credential" property failed to fetch a valid Google OAuth2 access token'),
    { code: 'app/invalid-credential' },
  );
  const repo = auditRepository();
  const response = await request(appFor({ repo, identityAdmin: identityAdminDouble({ failWith: providerError }) }))
    .post('/api/users-data/mfa/disable').set({ Authorization: 'Bearer fresh' }).send({});
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'IDENTITY_DIRECTORY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(response.body), /credential|OAuth2|initializeApp/i);
  assert.match(response.body.error, /identity service/i);
  assert.deepEqual(repo.audit, [], 'nothing was changed, so nothing is audited as unenrolled');
});

test('an account without an identity-provider record gets a precise 404, not an outage', async () => {
  const notFound = Object.assign(new Error('There is no user record corresponding to the provided identifier.'), { code: 'auth/user-not-found' });
  const response = await request(appFor({ repo: auditRepository(), identityAdmin: identityAdminDouble({ failWith: notFound }) }))
    .post('/api/users-data/mfa/disable').set({ Authorization: 'Bearer fresh' }).send({});
  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'IDENTITY_NOT_FOUND');
});
