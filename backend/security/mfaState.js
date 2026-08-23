'use strict';

/**
 * Authoritative server-side MFA state machine.
 *
 * Historical defect (P0): the platform reported "Security/RBAC/MFA = PASS" while
 * Firebase returned `auth/operation-not-allowed` for TOTP enrollment in
 * production. The code could not distinguish "the operator has not enrolled a
 * second factor" from "the identity provider cannot issue a second factor at
 * all", so every Super Admin destructive route failed closed with a message
 * ("Enroll TOTP MFA and sign in again") that described an action the operator
 * was physically unable to perform.
 *
 * This module makes the distinction explicit and machine-readable. It never
 * downgrades an enforced requirement: MFA_CONFIGURATION_REQUIRED still denies
 * the request. It only changes *what the platform honestly reports* about why.
 */

const MFA_STATE = Object.freeze({
  /** A verified Firebase ID token is present. Nothing more is proven. */
  AUTHENTICATED: 'AUTHENTICATED',
  /** `auth_time` is inside the sensitive-operation window. NOT a second factor. */
  RECENT_AUTHENTICATION: 'RECENT_AUTHENTICATION',
  /** The account has a second factor registered but this session did not use it. */
  MFA_ENROLLED: 'MFA_ENROLLED',
  /** This session was established with a verified second factor. */
  MFA_VERIFIED: 'MFA_VERIFIED',
  /** A second factor is required for the attempted operation and is absent. */
  MFA_REQUIRED: 'MFA_REQUIRED',
  /** MFA is deliberately not enforced for this deployment/principal. */
  MFA_UNAVAILABLE: 'MFA_UNAVAILABLE',
  /** MFA is enforced but the identity provider cannot issue a factor. Operator action. */
  MFA_CONFIGURATION_REQUIRED: 'MFA_CONFIGURATION_REQUIRED',
});

const PROVIDER_CAPABILITY = Object.freeze({
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Provider capability is a *declaration*, not an inference.
 *
 * Firebase Admin exposes no API to read whether the TOTP multi-factor provider
 * is enabled on a project, so the backend cannot probe it. The only honest
 * options are an explicit operator declaration or UNKNOWN. UNKNOWN is never
 * reported as ENABLED, and never as healthy.
 */
function providerCapability(env = process.env) {
  const raw = String(env.FIREBASE_TOTP_MFA_ENABLED ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === 'enabled' || raw === '1') return PROVIDER_CAPABILITY.ENABLED;
  if (raw === 'false' || raw === 'disabled' || raw === '0') return PROVIDER_CAPABILITY.DISABLED;
  return PROVIDER_CAPABILITY.UNKNOWN;
}

/** Verified Firebase claim. Custom claims are NEVER accepted as MFA proof. */
function secondFactorClaim(user) {
  const claims = user?.claims || {};
  const firebaseClaim = claims.firebase && typeof claims.firebase === 'object' ? claims.firebase : {};
  const value = firebaseClaim.sign_in_second_factor || claims.sign_in_second_factor || null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Enrollment is only observable from the verified token when Firebase includes
 * the second-factor identifier list. A client assertion is never trusted.
 */
function enrolledFactorCount(user) {
  const firebaseClaim = user?.claims?.firebase;
  const identities = firebaseClaim && typeof firebaseClaim === 'object' ? firebaseClaim.identities : null;
  const list = identities && Array.isArray(identities['second_factor']) ? identities['second_factor'] : null;
  if (list) return list.length;
  return secondFactorClaim(user) ? 1 : 0;
}

function authTimeSeconds(user) {
  const value = Number(user?.claims?.auth_time || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isRecentAuthentication(user, env = process.env, now = Date.now()) {
  const seconds = authTimeSeconds(user);
  if (!seconds) return false;
  const maxAgeMs = Number(env.SENSITIVE_AUTH_MAX_AGE_MS || 10 * 60 * 1000);
  const ageMs = now - seconds * 1000;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

/**
 * Resolve the honest state for a principal against a requirement.
 *
 * @param {object} user            req.user (verified token only)
 * @param {object} options
 * @param {boolean} options.enforced Whether MFA is enforced for this operation.
 * @param {object} options.env
 * @param {number} options.now
 */
function resolveMfaState(user, { enforced = false, env = process.env, now = Date.now() } = {}) {
  const capability = providerCapability(env);
  const secondFactor = secondFactorClaim(user);
  const enrolled = enrolledFactorCount(user) > 0;
  const recent = isRecentAuthentication(user, env, now);

  let state;
  if (secondFactor) {
    state = MFA_STATE.MFA_VERIFIED;
  } else if (enforced && capability === PROVIDER_CAPABILITY.DISABLED) {
    // Enforced but structurally impossible to satisfy: an operator must enable
    // the provider. Access stays denied; the reason is now truthful.
    state = MFA_STATE.MFA_CONFIGURATION_REQUIRED;
  } else if (enforced) {
    state = MFA_STATE.MFA_REQUIRED;
  } else if (enrolled) {
    state = MFA_STATE.MFA_ENROLLED;
  } else if (recent) {
    state = MFA_STATE.RECENT_AUTHENTICATION;
  } else {
    state = user ? MFA_STATE.AUTHENTICATED : MFA_STATE.MFA_UNAVAILABLE;
  }

  return Object.freeze({
    state,
    enforced,
    satisfied: state === MFA_STATE.MFA_VERIFIED,
    providerCapability: capability,
    secondFactor,
    enrolled,
    recentAuthentication: recent,
    authTime: authTimeSeconds(user) || null,
  });
}

const REMEDIATION = Object.freeze({
  [MFA_STATE.MFA_REQUIRED]: {
    what: 'This session has no verified second authentication factor.',
    why: 'The operation is classified destructive and requires step-up authentication.',
    impact: 'The request was denied. No state was changed.',
    action: 'Enroll an authenticator app in account settings, then sign out and sign in again so the session carries a verified second factor.',
    actor: 'OPERATOR',
  },
  [MFA_STATE.MFA_CONFIGURATION_REQUIRED]: {
    what: 'Multi-factor authentication is enforced, but the Firebase TOTP provider is declared unavailable for this project.',
    why: 'Firebase rejects enrollment with auth/operation-not-allowed until TOTP multi-factor authentication is enabled in the Firebase console (Authentication → Sign-in method → Advanced → Multi-factor).',
    impact: 'Destructive Super Admin operations remain denied and cannot be unblocked by any in-application action.',
    action: 'A Firebase project owner must enable TOTP multi-factor authentication, then set FIREBASE_TOTP_MFA_ENABLED=true for the backend.',
    actor: 'PLATFORM_OWNER',
  },
  [MFA_STATE.MFA_UNAVAILABLE]: {
    what: 'Multi-factor authentication is not enforced for this deployment.',
    why: 'SUPER_ADMIN_MFA_REQUIRED is disabled or the runtime is not production.',
    impact: 'Destructive operations rely on role plus recent-authentication only.',
    action: 'Enable SUPER_ADMIN_MFA_REQUIRED=true in production once the Firebase TOTP provider is available.',
    actor: 'PLATFORM_OWNER',
  },
});

function describeMfaState(resolution) {
  const remediation = REMEDIATION[resolution.state] || null;
  return remediation ? { ...resolution, remediation } : { ...resolution, remediation: null };
}

module.exports = {
  MFA_STATE,
  PROVIDER_CAPABILITY,
  providerCapability,
  secondFactorClaim,
  enrolledFactorCount,
  isRecentAuthentication,
  resolveMfaState,
  describeMfaState,
  REMEDIATION,
};
