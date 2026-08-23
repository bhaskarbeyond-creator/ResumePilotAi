import QRCode from 'qrcode';
import {
    getAuth,
    multiFactor,
    TotpMultiFactorGenerator,
    getMultiFactorResolver,
} from 'firebase/auth';
import fire from '../conf/fire';

/**
 * Client-side MFA state machine and Firebase capability boundary.
 *
 * P0 root cause this module addresses:
 *   Production reported `auth/operation-not-allowed` from
 *   `TotpMultiFactorGenerator.generateSecret()`. The previous implementation
 *   assumed the Firebase TOTP multi-factor provider was enabled, surfaced the
 *   raw Firebase error as "Unable to start MFA enrollment. Reauthenticate and
 *   try again.", and the Admin console treated a *registered* factor as though
 *   it were a *verified* one. The result was a security posture the product
 *   claimed but could not deliver, with no recovery guidance.
 *
 * Nothing here weakens MFA. Enrollment still runs entirely through Firebase's
 * native TOTP APIs; the module only adds capability detection, an explicit
 * state vocabulary, and truthful error classification.
 */

import {
    MFA_STATE,
    MFA_PROVIDER_CAPABILITY,
    MFA_CONFIGURATION_GUIDANCE,
    PROVIDER_DISABLED_CODES,
    classifyMfaError as classifyMfaErrorPure,
    deriveSessionMfaState,
    satisfiesMfaRequirement,
} from './mfaStates';

export { MFA_STATE, MFA_PROVIDER_CAPABILITY, MFA_CONFIGURATION_GUIDANCE, deriveSessionMfaState, satisfiesMfaRequirement };

const modularAuth = () => getAuth(fire._delegate);

/**
 * Firebase exposes no read API for "is the TOTP provider enabled?". The only
 * truthful client signal is the outcome of a real enrollment attempt, so the
 * capability starts UNKNOWN and is latched by observed provider behaviour.
 * It is never optimistically reported as ENABLED.
 */
let providerCapability = MFA_PROVIDER_CAPABILITY.UNKNOWN;

export function getProviderCapability() {
    return providerCapability;
}

/** Test seam: reset latched capability between deterministic scenarios. */
export function resetProviderCapabilityForTests() {
    providerCapability = MFA_PROVIDER_CAPABILITY.UNKNOWN;
}

/**
 * Classify an error AND latch the observed provider capability. Firebase offers
 * no read API for "is TOTP enabled?", so an observed
 * `auth/operation-not-allowed` is the only truthful negative signal available.
 */
export function classifyMfaError(error) {
    const classification = classifyMfaErrorPure(error);
    if (PROVIDER_DISABLED_CODES.includes(String(error?.code || ''))) {
        providerCapability = MFA_PROVIDER_CAPABILITY.DISABLED;
    }
    return classification;
}

/** An MFA-classified error that carries structured guidance to the UI. */
export class MfaError extends Error {
    constructor(classification) {
        super(classification.what);
        this.name = 'MfaError';
        this.code = classification.code;
        this.mfaState = classification.state;
        this.guidance = classification;
    }
}

function raise(classification) {
    throw new MfaError(classification);
}

export async function beginTotpEnrollment() {
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    if (!user.emailVerified) throw new Error('Verify your email before enabling two-factor authentication.');
    const token = await user.getIdTokenResult();
    if (['linkedin', 'github'].includes(token.claims.signInProvider)) {
        throw new Error('Authenticator MFA for LinkedIn/GitHub requires configuring that provider as native Firebase OIDC. Use an email/password or native Firebase provider account for MFA.');
    }
    let session;
    let secret;
    try {
        session = await multiFactor(user).getSession();
        secret = await TotpMultiFactorGenerator.generateSecret(session);
    } catch (error) {
        // This is the exact call that produced auth/operation-not-allowed in
        // production. Classify it instead of surfacing a misleading
        // "reauthenticate and try again".
        raise(classifyMfaError(error));
    }
    // A secret was issued, so the provider is demonstrably enabled.
    providerCapability = MFA_PROVIDER_CAPABILITY.ENABLED;
    const otpauthUrl = secret.generateQrCodeUrl(user.email || user.uid, 'ResumePilot AI');
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
    return { secret, secretKey: secret.secretKey, qrCodeDataUrl };
}

export async function completeTotpEnrollment(secret, verificationCode) {
    if (!secret || !/^\d{6}$/.test(String(verificationCode || ''))) throw new Error('A valid 6-digit code is required.');
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, String(verificationCode));
    try {
        await multiFactor(user).enroll(assertion, 'Authenticator app');
    } catch (error) {
        raise(classifyMfaError(error));
    }
    await user.getIdToken(true);
    return getTotpStatus();
}

export async function getTotpStatus() {
    const user = modularAuth().currentUser;
    if (!user) return { enabled: false, enrolledFactors: [], state: MFA_STATE.MFA_UNAVAILABLE };
    await user.reload();
    const factors = multiFactor(user).enrolledFactors.filter(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    return {
        enabled: factors.length > 0,
        state: factors.length > 0 ? MFA_STATE.MFA_ENROLLED : MFA_STATE.AUTHENTICATED,
        providerCapability,
        enrolledFactors: factors.map(factor => ({ uid: factor.uid, displayName: factor.displayName || 'Authenticator app', enrollmentTime: factor.enrollmentTime }))
    };
}

export async function disableTotpEnrollment() {
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    await user.reload();
    const factor = multiFactor(user).enrolledFactors.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!factor) return { enabled: false, enrolledFactors: [], state: MFA_STATE.AUTHENTICATED };
    await multiFactor(user).unenroll(factor);
    await user.getIdToken(true);
    return getTotpStatus();
}

/**
 * Session-level posture. `enrolled` and `verified` are deliberately separate:
 * the backend only accepts Firebase's verified `sign_in_second_factor` claim,
 * so an enrolled-but-not-challenged session must not be presented as protected.
 */
export async function getSessionMfaPosture(user) {
    const current = user || modularAuth().currentUser;
    if (!current) return deriveSessionMfaState({ authenticated: false, providerCapability });
    let claims = {};
    let authTimeMs = 0;
    try {
        const token = await current.getIdTokenResult();
        claims = token?.claims || {};
        authTimeMs = token?.authTime ? Date.parse(token.authTime) : 0;
    } catch { /* fall through to the unverified posture below */ }
    return deriveSessionMfaState({
        authenticated: true,
        claims,
        enrolledFactorCount: Array.isArray(current.multiFactor?.enrolledFactors) ? current.multiFactor.enrolledFactors.length : 0,
        authTimeMs,
        providerCapability,
    });
}

export function getTotpSignInResolver(error) {
    if (error?.code !== 'auth/multi-factor-auth-required') return null;
    const resolver = getMultiFactorResolver(modularAuth(), error._delegate || error);
    const hint = resolver.hints.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    return hint ? { resolver, hint } : null;
}

export async function completeTotpSignIn(resolverState, verificationCode) {
    if (!resolverState?.resolver || !resolverState.hint || !/^\d{6}$/.test(String(verificationCode || ''))) {
        throw new Error('A valid authenticator code is required.');
    }
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(resolverState.hint.uid, String(verificationCode));
    try {
        return await resolverState.resolver.resolveSignIn(assertion);
    } catch (error) {
        raise(classifyMfaError(error));
    }
}
