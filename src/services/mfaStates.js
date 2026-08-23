/**
 * MFA vocabulary and error classification — deliberately free of any Firebase
 * or browser dependency so the real decision logic is directly testable.
 *
 * `mfaService.js` layers the Firebase calls on top of this module. Keeping the
 * classification separate is what makes it possible to assert the actual
 * behaviour of `auth/operation-not-allowed` handling rather than asserting that
 * a source file happens to contain a string.
 */

export const MFA_STATE = Object.freeze({
    /** A Firebase session exists. Nothing further is proven. */
    AUTHENTICATED: 'AUTHENTICATED',
    /** The session was refreshed recently. This is NOT a second factor. */
    RECENT_AUTHENTICATION: 'RECENT_AUTHENTICATION',
    /** A second factor is registered on the account. */
    MFA_ENROLLED: 'MFA_ENROLLED',
    /** This session presented a second factor and Firebase verified it. */
    MFA_VERIFIED: 'MFA_VERIFIED',
    /** A second factor is required and absent. */
    MFA_REQUIRED: 'MFA_REQUIRED',
    /** MFA is not applicable (no session, or not enforced). */
    MFA_UNAVAILABLE: 'MFA_UNAVAILABLE',
    /** The identity provider cannot issue a factor. Platform owner action. */
    MFA_CONFIGURATION_REQUIRED: 'MFA_CONFIGURATION_REQUIRED',
});

export const MFA_PROVIDER_CAPABILITY = Object.freeze({
    ENABLED: 'ENABLED',
    DISABLED: 'DISABLED',
    UNKNOWN: 'UNKNOWN',
});

/**
 * Firebase returns these when the TOTP second-factor provider is switched off
 * for the project. This is the exact production failure that triggered the
 * audit: `auth/operation-not-allowed` from `generateSecret()`.
 */
export const PROVIDER_DISABLED_CODES = Object.freeze([
    'auth/operation-not-allowed',
    'auth/admin-restricted-operation',
    'auth/unsupported-first-factor',
]);

export const MFA_CONFIGURATION_GUIDANCE = Object.freeze({
    state: MFA_STATE.MFA_CONFIGURATION_REQUIRED,
    what: 'Firebase rejected two-factor enrollment because TOTP multi-factor authentication is not enabled for this Firebase project.',
    why: 'Firebase returns auth/operation-not-allowed when the TOTP second-factor provider is switched off at the project level.',
    impact: 'No account can enrol an authenticator app, and Super Admin operations that require a verified second factor stay blocked.',
    action: 'A Firebase project owner must enable Authentication → Sign-in method → Advanced → Multi-factor → Authenticator app (TOTP), then redeploy with FIREBASE_TOTP_MFA_ENABLED=true.',
    actor: 'PLATFORM_OWNER',
    recoverable: false,
});

/**
 * Translate an error into an explicit state plus operator-facing guidance.
 * An unrecognised error is never reported as success and never as a benign
 * configuration issue — it degrades to MFA_REQUIRED with an escalation path.
 */
export function classifyMfaError(error) {
    const code = String(error?.code || '');
    if (PROVIDER_DISABLED_CODES.includes(code)) {
        return { ...MFA_CONFIGURATION_GUIDANCE, code };
    }
    if (code === 'auth/requires-recent-login') {
        return {
            state: MFA_STATE.RECENT_AUTHENTICATION,
            code,
            what: 'Firebase requires a recent sign-in before changing multi-factor settings.',
            why: 'The current session is older than the provider allows for security-sensitive changes.',
            impact: 'The enrollment attempt was not started. Nothing changed on the account.',
            action: 'Sign out and sign in again, then retry enrollment.',
            actor: 'OPERATOR',
            recoverable: true,
        };
    }
    if (code === 'auth/invalid-verification-code' || code === 'auth/missing-verification-code' || code === 'auth/code-expired') {
        return {
            state: MFA_STATE.MFA_REQUIRED,
            code,
            what: 'The authenticator code was rejected.',
            why: code === 'auth/code-expired'
                ? 'The 30-second code window elapsed before verification completed.'
                : 'The six-digit code did not match the enrolled secret.',
            impact: 'Enrollment did not complete and no second factor was added.',
            action: 'Confirm the device clock is accurate and enter the current six-digit code.',
            actor: 'OPERATOR',
            recoverable: true,
        };
    }
    if (code === 'auth/maximum-second-factor-count-exceeded') {
        return {
            state: MFA_STATE.MFA_ENROLLED,
            code,
            what: 'The account already holds the maximum number of second factors.',
            why: 'Firebase caps the number of enrolled multi-factor methods per account.',
            impact: 'No additional factor was added. Existing factors are unchanged.',
            action: 'Remove an existing authenticator before enrolling a new one.',
            actor: 'OPERATOR',
            recoverable: true,
        };
    }
    if (code === 'auth/second-factor-already-in-use') {
        return {
            state: MFA_STATE.MFA_ENROLLED,
            code,
            what: 'That authenticator is already enrolled on this account.',
            why: 'Firebase rejected a duplicate second-factor enrollment.',
            impact: 'No change was made.',
            action: 'Use the existing authenticator entry, or remove it before re-enrolling.',
            actor: 'OPERATOR',
            recoverable: true,
        };
    }
    return {
        state: MFA_STATE.MFA_REQUIRED,
        code: code || 'MFA_ERROR',
        what: error?.message || 'Two-factor enrollment failed.',
        why: 'The identity provider returned an unclassified error.',
        impact: 'Enrollment did not complete. The account security posture is unchanged.',
        action: 'Retry. If the failure persists, capture the error code and escalate to the platform owner.',
        actor: 'OPERATOR',
        recoverable: true,
    };
}

/**
 * Derive the session posture from a decoded ID token and the user's registered
 * factors. `enrolled` and `verified` are deliberately distinct: the backend
 * accepts only Firebase's verified `sign_in_second_factor` claim, so an
 * enrolled-but-unchallenged session must never be presented as protected.
 */
export function deriveSessionMfaState({
    authenticated = false,
    claims = {},
    enrolledFactorCount = 0,
    authTimeMs = 0,
    providerCapability = MFA_PROVIDER_CAPABILITY.UNKNOWN,
    now = Date.now(),
    recentWindowMs = 10 * 60 * 1000,
} = {}) {
    if (!authenticated) {
        return {
            state: MFA_STATE.MFA_UNAVAILABLE,
            authenticated: false,
            enrolled: false,
            verified: false,
            recentAuthentication: false,
            providerCapability,
        };
    }
    const verified = Boolean(claims?.firebase?.sign_in_second_factor || claims?.sign_in_second_factor);
    const enrolled = Number(enrolledFactorCount) > 0;
    const recentAuthentication = authTimeMs > 0 && now - authTimeMs >= 0 && now - authTimeMs <= recentWindowMs;

    let state;
    if (verified) state = MFA_STATE.MFA_VERIFIED;
    else if (providerCapability === MFA_PROVIDER_CAPABILITY.DISABLED) state = MFA_STATE.MFA_CONFIGURATION_REQUIRED;
    else if (enrolled) state = MFA_STATE.MFA_ENROLLED;
    else if (recentAuthentication) state = MFA_STATE.RECENT_AUTHENTICATION;
    else state = MFA_STATE.AUTHENTICATED;

    return { state, authenticated: true, enrolled, verified, recentAuthentication, providerCapability };
}

/** True only for states that actually satisfy a second-factor requirement. */
export function satisfiesMfaRequirement(state) {
    return state === MFA_STATE.MFA_VERIFIED;
}
