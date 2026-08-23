'use strict';

process.env.NODE_ENV = 'test';
process.env.SUPER_ADMIN_MFA_REQUIRED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

/**
 * REGRESSION COVERAGE — MFA enforcement across the real HTTP boundary (P0).
 *
 * These tests drive the actual Express application. They prove the destructive
 * Super Admin routes deny unverified sessions, and that the denial payload is
 * machine-readable enough for the console to explain itself instead of looping
 * a reauthentication prompt that cannot succeed.
 */

const nowSeconds = () => Math.floor(Date.now() / 1000);

setTokenVerifierForTests(async token => {
  const base = { email_verified: true, auth_time: nowSeconds() };
  if (token === 'super-no-mfa') return { ...base, uid: 'super-1', email: 'super@example.com', role: 'SUPER_ADMIN' };
  if (token === 'super-with-mfa') return { ...base, uid: 'super-2', email: 'mfa@example.com', role: 'SUPER_ADMIN', firebase: { sign_in_second_factor: 'totp' } };
  if (token === 'super-enrolled-not-challenged') {
    return { ...base, uid: 'super-3', email: 'enrolled@example.com', role: 'SUPER_ADMIN', firebase: { identities: { second_factor: ['factor-1'] } } };
  }
  if (token === 'super-fake-claim') {
    // A forged/derived custom claim must never be accepted as MFA proof.
    return { ...base, uid: 'super-4', email: 'forged@example.com', role: 'SUPER_ADMIN', mfa: true, mfaVerified: true, sign_in_second_factor_verified: true };
  }
  if (token === 'admin') return { ...base, uid: 'admin-1', email: 'admin@example.com', role: 'ADMIN' };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

const DESTRUCTIVE_ROUTES = [
  ['post', '/api/platform/maintenance', { enabled: true }],
  ['post', '/api/platform/operators', { email: 'x@example.com', role: 'ADMIN' }],
  ['post', '/api/platform/tenants/tenant-1/decommission', {}],
  ['put', '/api/platform/feature-flags/some-flag', { enabled: true }],
];

test('destructive Super Admin routes deny a session with no verified second factor', async () => {
  for (const [method, route, body] of DESTRUCTIVE_ROUTES) {
    const response = await request(app)[method](route).set(bearer('super-no-mfa')).send(body);
    assert.equal(response.status, 403, `${method.toUpperCase()} ${route} must deny an unverified session`);
    const error = response.body.error || {};
    assert.ok(
      ['SUPER_ADMIN_MFA_REQUIRED', 'MFA_CONFIGURATION_REQUIRED'].includes(error.code),
      `${route} returned unexpected code ${error.code}`
    );
    assert.equal(error.mfaEnforced, true);
    assert.ok(error.remediation, 'the denial must carry actionable remediation');
  }
});

test('a forged custom claim does not satisfy the MFA boundary', async () => {
  const response = await request(app).post('/api/platform/maintenance').set(bearer('super-fake-claim')).send({ enabled: true });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.mfaState, 'MFA_REQUIRED');
});

test('an enrolled-but-not-challenged session is still denied', async () => {
  const response = await request(app).post('/api/platform/maintenance').set(bearer('super-enrolled-not-challenged')).send({ enabled: true });
  assert.equal(response.status, 403, 'holding a registered factor is not the same as having used it');
  assert.equal(response.body.error.code, 'SUPER_ADMIN_MFA_REQUIRED');
});

test('a session with a verified second factor passes the MFA gate', async () => {
  const response = await request(app).post('/api/platform/maintenance').set(bearer('super-with-mfa')).send({ enabled: true });
  assert.notEqual(response.status, 403, `verified MFA must clear the gate, got ${response.status} ${JSON.stringify(response.body)}`);
});

test('a non-super-admin is rejected for role, not misreported as an MFA problem', async () => {
  const response = await request(app).post('/api/platform/maintenance').set(bearer('admin')).send({ enabled: true });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
  assert.equal(response.body.error.mfaState, undefined);
});

test('the MFA posture endpoint stays readable while the operator is MFA-blocked', async () => {
  // This is the whole point: a blocked Super Admin must be able to discover WHY.
  const response = await request(app).get('/api/platform/security/mfa-posture').set(bearer('super-no-mfa'));
  assert.equal(response.status, 200, 'posture must not be gated behind the guard that is failing');
  assert.equal(response.body.mfa.satisfied, false);
  assert.equal(response.body.mfa.enforced, true);
  assert.ok(response.body.mfa.remediation, 'posture must explain what to do');
  assert.equal(response.body.principal.isSuperAdmin, true);
  // No secret material may cross this boundary.
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, /secret|apiKey|privateKey|password/i);
});

test('posture reports declared provider capability honestly and flags production verification', async () => {
  const response = await request(app).get('/api/platform/security/mfa-posture').set(bearer('super-no-mfa'));
  assert.equal(response.body.mfa.providerCapability, 'UNKNOWN', 'an undeclared provider must not be reported as ENABLED');
  assert.equal(response.body.verification.source, 'DECLARED_CONFIGURATION');
  assert.equal(response.body.verification.productionVerificationRequired, true);
});

test('posture reports MFA_VERIFIED for a challenged session', async () => {
  const response = await request(app).get('/api/platform/security/mfa-posture').set(bearer('super-with-mfa'));
  assert.equal(response.body.mfa.state, 'MFA_VERIFIED');
  assert.equal(response.body.mfa.satisfied, true);
  assert.equal(response.body.mfa.secondFactorMethod, 'totp');
});

test('unauthenticated callers cannot read posture', async () => {
  assert.equal((await request(app).get('/api/platform/security/mfa-posture')).status, 401);
});

test('recent-auth denials declare that they do not satisfy MFA', async () => {
  // RECENT_AUTH_REQUIRED and SUPER_ADMIN_MFA_REQUIRED are different boundaries.
  // Conflating them is what previously let "reauthenticate" be presented as an
  // MFA remedy.
  const { requireRecentAdminAuthentication } = require('../security/auth');
  const previous = process.env.REQUIRE_RECENT_AUTH_IN_TEST;
  process.env.REQUIRE_RECENT_AUTH_IN_TEST = 'true';
  try {
    const captured = {};
    const res = {
      locals: { requestId: 'r1' },
      status(code) { captured.status = code; return this; },
      json(body) { captured.body = body; return this; },
    };
    const req = {
      user: {
        uid: 'super-5',
        claims: { role: 'SUPER_ADMIN', firebase: { sign_in_second_factor: 'totp' }, auth_time: nowSeconds() - 7200 },
      },
    };
    requireRecentAdminAuthentication(req, res, () => { captured.passed = true; });
    assert.equal(captured.passed, undefined, 'a stale session must not reach the handler');
    assert.equal(captured.status, 403);
    assert.equal(captured.body.error.code, 'RECENT_AUTH_REQUIRED');
    assert.equal(captured.body.error.satisfiesMfa, false);
  } finally {
    if (previous === undefined) delete process.env.REQUIRE_RECENT_AUTH_IN_TEST;
    else process.env.REQUIRE_RECENT_AUTH_IN_TEST = previous;
  }
});
