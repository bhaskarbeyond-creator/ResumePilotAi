import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MFA_STATE,
  MFA_PROVIDER_CAPABILITY,
  MFA_CONFIGURATION_GUIDANCE,
  PROVIDER_DISABLED_CODES,
  classifyMfaError,
  deriveSessionMfaState,
  satisfiesMfaRequirement,
} from '../src/services/mfaStates.js';

/**
 * REGRESSION COVERAGE — client MFA state machine (P0).
 *
 * The previous MFA test file (tests/mfa-static.test.mjs) only asserted that
 * certain identifiers appeared in the source. It passed while production could
 * not enrol a single second factor. These tests execute the real classification
 * and derivation functions.
 */

test('auth/operation-not-allowed is classified as a configuration problem, not a user error', () => {
  const guidance = classifyMfaError({ code: 'auth/operation-not-allowed', message: 'The given sign-in provider is disabled' });
  assert.equal(guidance.state, MFA_STATE.MFA_CONFIGURATION_REQUIRED);
  assert.equal(guidance.actor, 'PLATFORM_OWNER');
  assert.equal(guidance.recoverable, false);
  // The historical message told the user to reauthenticate, which cannot help.
  assert.doesNotMatch(guidance.action, /reauthenticate/i);
  assert.match(guidance.action, /Firebase/);
  assert.match(guidance.why, /auth\/operation-not-allowed/);
});

test('every provider-disabled code maps to MFA_CONFIGURATION_REQUIRED', () => {
  for (const code of PROVIDER_DISABLED_CODES) {
    assert.equal(classifyMfaError({ code }).state, MFA_STATE.MFA_CONFIGURATION_REQUIRED, code);
  }
});

test('an invalid or expired OTP is a recoverable operator error, distinct from a provider outage', () => {
  for (const code of ['auth/invalid-verification-code', 'auth/missing-verification-code', 'auth/code-expired']) {
    const guidance = classifyMfaError({ code });
    assert.equal(guidance.state, MFA_STATE.MFA_REQUIRED, code);
    assert.equal(guidance.actor, 'OPERATOR', code);
    assert.equal(guidance.recoverable, true, code);
    assert.notEqual(guidance.state, MFA_STATE.MFA_CONFIGURATION_REQUIRED, code);
  }
});

test('requires-recent-login is classified as recent-authentication, never as MFA success', () => {
  const guidance = classifyMfaError({ code: 'auth/requires-recent-login' });
  assert.equal(guidance.state, MFA_STATE.RECENT_AUTHENTICATION);
  assert.equal(satisfiesMfaRequirement(guidance.state), false);
});

test('an unclassified provider failure degrades to MFA_REQUIRED with an escalation path', () => {
  const guidance = classifyMfaError({ code: 'auth/internal-error', message: 'boom' });
  assert.equal(guidance.state, MFA_STATE.MFA_REQUIRED);
  assert.equal(satisfiesMfaRequirement(guidance.state), false);
  assert.match(guidance.action, /escalate/i);
});

test('classification never reports success and never claims MFA is verified', () => {
  const codes = [...PROVIDER_DISABLED_CODES, 'auth/requires-recent-login', 'auth/invalid-verification-code', 'auth/code-expired', 'auth/second-factor-already-in-use', 'auth/maximum-second-factor-count-exceeded', 'auth/internal-error', undefined];
  for (const code of codes) {
    const guidance = classifyMfaError(code ? { code } : new Error('unknown'));
    assert.notEqual(guidance.state, MFA_STATE.MFA_VERIFIED, `${code} must never be reported as verified`);
    assert.ok(guidance.what && guidance.why && guidance.impact && guidance.action, `${code} must carry what/why/impact/action`);
  }
});

test('enrollment alone is reported as MFA_ENROLLED and does not satisfy the requirement', () => {
  const posture = deriveSessionMfaState({ authenticated: true, claims: {}, enrolledFactorCount: 1, authTimeMs: Date.now() });
  assert.equal(posture.state, MFA_STATE.MFA_ENROLLED);
  assert.equal(posture.enrolled, true);
  assert.equal(posture.verified, false);
  assert.equal(satisfiesMfaRequirement(posture.state), false);
});

test('a verified second factor is the only path to MFA_VERIFIED', () => {
  const posture = deriveSessionMfaState({
    authenticated: true,
    claims: { firebase: { sign_in_second_factor: 'totp' } },
    enrolledFactorCount: 1,
    authTimeMs: Date.now(),
  });
  assert.equal(posture.state, MFA_STATE.MFA_VERIFIED);
  assert.equal(satisfiesMfaRequirement(posture.state), true);
});

test('custom claims are not accepted as MFA proof on the client either', () => {
  const posture = deriveSessionMfaState({
    authenticated: true,
    claims: { mfa: true, mfaVerified: true, role: 'SUPER_ADMIN', permissions: ['*'] },
    enrolledFactorCount: 0,
    authTimeMs: Date.now(),
  });
  assert.equal(posture.verified, false);
  assert.notEqual(posture.state, MFA_STATE.MFA_VERIFIED);
});

test('recent authentication is surfaced but ranks below enrollment and verification', () => {
  const recent = deriveSessionMfaState({ authenticated: true, claims: {}, enrolledFactorCount: 0, authTimeMs: Date.now() });
  assert.equal(recent.state, MFA_STATE.RECENT_AUTHENTICATION);
  assert.equal(satisfiesMfaRequirement(recent.state), false);

  const stale = deriveSessionMfaState({ authenticated: true, claims: {}, enrolledFactorCount: 0, authTimeMs: Date.now() - 3_600_000 });
  assert.equal(stale.state, MFA_STATE.AUTHENTICATED);
  assert.equal(stale.recentAuthentication, false);
});

test('a disabled provider is reported as MFA_CONFIGURATION_REQUIRED for unenrolled sessions', () => {
  const posture = deriveSessionMfaState({
    authenticated: true,
    claims: {},
    enrolledFactorCount: 0,
    authTimeMs: Date.now(),
    providerCapability: MFA_PROVIDER_CAPABILITY.DISABLED,
  });
  assert.equal(posture.state, MFA_STATE.MFA_CONFIGURATION_REQUIRED);
  assert.equal(satisfiesMfaRequirement(posture.state), false);
});

test('a disabled provider never masks an already verified session', () => {
  const posture = deriveSessionMfaState({
    authenticated: true,
    claims: { firebase: { sign_in_second_factor: 'totp' } },
    enrolledFactorCount: 1,
    authTimeMs: Date.now(),
    providerCapability: MFA_PROVIDER_CAPABILITY.DISABLED,
  });
  assert.equal(posture.state, MFA_STATE.MFA_VERIFIED);
});

test('an unauthenticated session is MFA_UNAVAILABLE, never AUTHENTICATED', () => {
  const posture = deriveSessionMfaState({ authenticated: false });
  assert.equal(posture.state, MFA_STATE.MFA_UNAVAILABLE);
  assert.equal(posture.verified, false);
});

test('the Admin console derives MFA only from the verified claim', () => {
  const admin = fs.readFileSync(new URL('../src/components/admin/Admin.jsx', import.meta.url), 'utf8');
  // The previous implementation OR-ed in `user.multiFactor.enrolledFactors.length`,
  // which hid the warning banner for sessions the backend still rejected.
  assert.doesNotMatch(
    admin,
    /hasMfa\s*=\s*Boolean\([^)]*enrolledFactors/,
    'enrollment must not be treated as session verification'
  );
  assert.match(admin, /sign_in_second_factor/);
  assert.match(admin, /AdminMfaNotice/, 'the console must render state-specific guidance');
});

test('the Admin console renders a distinct, honest notice per state', () => {
  const admin = fs.readFileSync(new URL('../src/components/admin/Admin.jsx', import.meta.url), 'utf8');
  assert.match(admin, /MFA_CONFIGURATION_REQUIRED/);
  assert.match(admin, /MFA_ENROLLED/);
  assert.match(admin, /data-mfa-state=/, 'state must be machine-readable for UI regression tests');
  assert.match(admin, /Recent reauthentication is not a second factor/);
});

test('MFA denials terminate the reauthentication retry path', () => {
  const source = fs.readFileSync(new URL('../src/services/adminReauth.js', import.meta.url), 'utf8');
  assert.match(source, /SUPER_ADMIN_MFA_REQUIRED/);
  assert.match(source, /MFA_CONFIGURATION_REQUIRED/);
  assert.match(source, /recoverableByReauthentication:\s*false/);
});

test('the configuration guidance names the exact Firebase console path', () => {
  assert.match(MFA_CONFIGURATION_GUIDANCE.action, /Sign-in method/);
  assert.match(MFA_CONFIGURATION_GUIDANCE.action, /Multi-factor/);
  assert.match(MFA_CONFIGURATION_GUIDANCE.action, /FIREBASE_TOTP_MFA_ENABLED/);
});

test('the enrollment UI does not present a working control when the provider is unavailable', () => {
  const settings = fs.readFileSync(new URL('../src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', import.meta.url), 'utf8');
  assert.match(settings, /mfaProviderUnavailable/);
  assert.match(settings, /disabled=\{mfaProviderUnavailable/);
  assert.doesNotMatch(settings, /Unable to start MFA enrollment\. Reauthenticate and try again\./, 'the misleading fallback message must be gone');
  assert.match(settings, /data-testid="mfa-guidance"/);
});

test('platformApi propagates a second-factor denial instead of a bare HTTP error', () => {
  const source = fs.readFileSync(new URL('../src/services/platformApi.js', import.meta.url), 'utf8');
  assert.match(source, /mfaDenial/, 'the shared platform client must surface MFA denials');
  assert.match(source, /error\.mfaState = mfaDenial\.mfaState/);
  assert.match(source, /recoverableByReauthentication = false/);
});

test('destructive tenant controls report a blocked second factor rather than failing opaquely', () => {
  const api = fs.readFileSync(new URL('../src/services/platformApi.js', import.meta.url), 'utf8');
  const reauth = fs.readFileSync(new URL('../src/services/adminReauth.js', import.meta.url), 'utf8');
  // The denial must originate from the shared client, so every panel built on
  // platformFetch inherits it — including tenant decommission.
  assert.match(reauth, /export function mfaDenial/);
  assert.match(api, /const \{ response, data, mfaDenial \} = await fetchAdminWithReauth/);
});
