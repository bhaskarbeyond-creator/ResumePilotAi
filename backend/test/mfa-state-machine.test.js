'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MFA_STATE,
  PROVIDER_CAPABILITY,
  providerCapability,
  resolveMfaState,
  describeMfaState,
  secondFactorClaim,
  isRecentAuthentication,
} = require('../security/mfaState');

/**
 * REGRESSION COVERAGE — TOTP / MFA (P0)
 *
 * Production reported `auth/operation-not-allowed` for TOTP enrollment while
 * certification claimed "Security/RBAC/MFA = PASS". The previous test suite
 * asserted only that certain strings existed in the source, which proved
 * nothing about the security boundary.
 *
 * These tests exercise the real decision function. Every case asserts that the
 * boundary still DENIES; only the reported reason may differ. A test that made
 * an unverified session pass would be a security regression, not a fix.
 */

const now = 1_700_000_000_000;
const nowSeconds = Math.floor(now / 1000);

const principal = (claims = {}) => ({ uid: 'u1', claims: { auth_time: nowSeconds, ...claims } });
const withSecondFactor = () => principal({ firebase: { sign_in_second_factor: 'totp' } });

test('provider capability is declared, never optimistically inferred', () => {
  assert.equal(providerCapability({}), PROVIDER_CAPABILITY.UNKNOWN, 'absent configuration must be UNKNOWN, not ENABLED');
  assert.equal(providerCapability({ FIREBASE_TOTP_MFA_ENABLED: '' }), PROVIDER_CAPABILITY.UNKNOWN);
  assert.equal(providerCapability({ FIREBASE_TOTP_MFA_ENABLED: 'maybe' }), PROVIDER_CAPABILITY.UNKNOWN);
  assert.equal(providerCapability({ FIREBASE_TOTP_MFA_ENABLED: 'true' }), PROVIDER_CAPABILITY.ENABLED);
  assert.equal(providerCapability({ FIREBASE_TOTP_MFA_ENABLED: 'false' }), PROVIDER_CAPABILITY.DISABLED);
});

test('only the verified Firebase second-factor claim counts as MFA proof', () => {
  assert.equal(secondFactorClaim(withSecondFactor()), 'totp');
  assert.equal(secondFactorClaim(principal({ sign_in_second_factor: 'totp' })), 'totp');
  // Custom claims must never be accepted as a substitute for the verified claim.
  assert.equal(secondFactorClaim(principal({ mfa: true, mfaVerified: true, role: 'SUPER_ADMIN' })), null);
  assert.equal(secondFactorClaim(principal({ permissions: ['*'] })), null);
  assert.equal(secondFactorClaim(null), null);
});

test('recent authentication is tracked separately and is never MFA', () => {
  const recent = principal();
  const stale = principal({ auth_time: nowSeconds - 3600 });
  assert.equal(isRecentAuthentication(recent, {}, now), true);
  assert.equal(isRecentAuthentication(stale, {}, now), false);

  const resolution = resolveMfaState(recent, { enforced: true, env: {}, now });
  assert.equal(resolution.recentAuthentication, true);
  assert.equal(resolution.satisfied, false, 'a fresh session must not satisfy an MFA requirement');
  assert.equal(resolution.state, MFA_STATE.MFA_REQUIRED);
});

test('MFA_VERIFIED is reached only with a verified second factor', () => {
  const resolution = resolveMfaState(withSecondFactor(), { enforced: true, env: {}, now });
  assert.equal(resolution.state, MFA_STATE.MFA_VERIFIED);
  assert.equal(resolution.satisfied, true);
});

test('enrolled-but-not-challenged sessions report MFA_ENROLLED and do NOT satisfy enforcement', () => {
  const enrolledOnly = principal({ firebase: { identities: { second_factor: ['factor-1'] } } });
  const unenforced = resolveMfaState(enrolledOnly, { enforced: false, env: {}, now });
  assert.equal(unenforced.state, MFA_STATE.MFA_ENROLLED);
  assert.equal(unenforced.satisfied, false);

  const enforced = resolveMfaState(enrolledOnly, { enforced: true, env: {}, now });
  assert.equal(enforced.satisfied, false, 'enrollment alone must never unlock a destructive operation');
  assert.equal(enforced.state, MFA_STATE.MFA_REQUIRED);
});

test('auth/operation-not-allowed condition surfaces MFA_CONFIGURATION_REQUIRED and still denies', () => {
  const resolution = resolveMfaState(principal(), {
    enforced: true,
    env: { FIREBASE_TOTP_MFA_ENABLED: 'false' },
    now,
  });
  assert.equal(resolution.state, MFA_STATE.MFA_CONFIGURATION_REQUIRED);
  assert.equal(resolution.satisfied, false, 'an unavailable provider must not downgrade to authenticated-only access');

  const described = describeMfaState(resolution);
  assert.equal(described.remediation.actor, 'PLATFORM_OWNER');
  assert.match(described.remediation.why, /auth\/operation-not-allowed/);
  assert.match(described.remediation.action, /Firebase/i);
  assert.match(described.remediation.impact, /denied|blocked/i);
});

test('a disabled provider never overrides an already verified second factor', () => {
  const resolution = resolveMfaState(withSecondFactor(), {
    enforced: true,
    env: { FIREBASE_TOTP_MFA_ENABLED: 'false' },
    now,
  });
  assert.equal(resolution.state, MFA_STATE.MFA_VERIFIED);
  assert.equal(resolution.satisfied, true);
});

test('unknown provider capability is reported as MFA_REQUIRED, not as configuration-required or healthy', () => {
  const resolution = resolveMfaState(principal(), { enforced: true, env: {}, now });
  assert.equal(resolution.providerCapability, PROVIDER_CAPABILITY.UNKNOWN);
  assert.equal(resolution.state, MFA_STATE.MFA_REQUIRED);
  assert.equal(resolution.satisfied, false);
});

test('every reachable state is distinguishable', () => {
  const states = new Set([
    resolveMfaState(null, { enforced: false, env: {}, now }).state,
    resolveMfaState(principal({ auth_time: 0 }), { enforced: false, env: {}, now }).state,
    resolveMfaState(principal(), { enforced: false, env: {}, now }).state,
    resolveMfaState(principal({ firebase: { identities: { second_factor: ['f'] } } }), { enforced: false, env: {}, now }).state,
    resolveMfaState(withSecondFactor(), { enforced: true, env: {}, now }).state,
    resolveMfaState(principal(), { enforced: true, env: {}, now }).state,
    resolveMfaState(principal(), { enforced: true, env: { FIREBASE_TOTP_MFA_ENABLED: 'false' }, now }).state,
  ]);
  assert.deepEqual(
    [...states].sort(),
    [
      MFA_STATE.AUTHENTICATED,
      MFA_STATE.MFA_CONFIGURATION_REQUIRED,
      MFA_STATE.MFA_ENROLLED,
      MFA_STATE.MFA_REQUIRED,
      MFA_STATE.MFA_UNAVAILABLE,
      MFA_STATE.MFA_VERIFIED,
      MFA_STATE.RECENT_AUTHENTICATION,
    ].sort()
  );
});
