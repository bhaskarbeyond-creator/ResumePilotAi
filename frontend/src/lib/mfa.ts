/**
 * Firebase multi-factor authentication (second step at sign-in and at
 * re-authentication).
 *
 * When Firebase answers a sign-in or re-authentication with
 * `auth/multi-factor-auth-required`, the error carries a MultiFactorResolver.
 * This module turns that resolver into a challenge the UI can render:
 *
 *  - only factor types this app can complete are offered (TOTP authenticator
 *    apps and SMS); any other enrolled type is counted, never shown as usable;
 *  - each factor type is completed with its own assertion API:
 *      TOTP  → TotpMultiFactorGenerator.assertionForSignIn(enrollmentId, code)
 *      SMS   → PhoneAuthProvider.verifyPhoneNumber({ multiFactorHint, session })
 *              then PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(id, code))
 *  - provider errors are mapped to short user-facing messages; codes,
 *    assertions and resolver contents are never logged.
 *
 * Nothing here reports success on its own: a challenge only resolves when
 * Firebase's `resolver.resolveSignIn` resolves.
 */

import {
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';

/** Firebase factor ids ('totp' and 'phone'); kept literal so tests need no SDK. */
const TOTP_FACTOR_ID = 'totp';
const PHONE_FACTOR_ID = 'phone';

export type MfaFactorKind = 'totp' | 'phone';

export interface MfaChallengeFactor {
  /** Enrollment id (MultiFactorInfo.uid), needed by the assertion APIs. */
  uid: string;
  kind: MfaFactorKind;
  /** Human-readable name, e.g. "Authenticator app" or the enrolled display name. */
  label: string;
  /** SMS only: the masked number Firebase reports (it is already masked server-side). */
  phoneHint?: string;
}

export interface MfaChallenge {
  resolver: MultiFactorResolver;
  /** Supported factors, authenticator apps first. Empty when none can be used here. */
  factors: MfaChallengeFactor[];
  /** Enrolled factors of a type this app cannot complete (e.g. a future factor type). */
  unsupportedCount: number;
}

export const MFA_CODE_LENGTH = 6;
const CODE_PATTERN = /^\d{6}$/;

/** True for Firebase's "a second factor is required" error (sign-in or re-authentication). */
export function isMfaRequired(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === 'auth/multi-factor-auth-required';
}

/** Keep only the characters a verification code can contain. */
export function sanitizeMfaCode(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, MFA_CODE_LENGTH);
}

export function isValidMfaCode(code: unknown): boolean {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

/**
 * Classify the resolver's hints. Unknown or malformed entries are counted as
 * unsupported rather than offered, so the UI never shows a method that cannot
 * complete.
 */
export function describeFactorHints(hints: unknown): { factors: MfaChallengeFactor[]; unsupportedCount: number } {
  const list = Array.isArray(hints) ? hints : [];
  const factors: MfaChallengeFactor[] = [];
  let unsupportedCount = 0;
  for (const entry of list) {
    const hint = (entry && typeof entry === 'object' ? entry : {}) as {
      uid?: unknown; factorId?: unknown; displayName?: unknown; phoneNumber?: unknown;
    };
    const uid = typeof hint.uid === 'string' ? hint.uid : '';
    const displayName = typeof hint.displayName === 'string' ? hint.displayName.trim() : '';
    if (!uid) {
      unsupportedCount += 1;
    } else if (hint.factorId === TOTP_FACTOR_ID) {
      factors.push({ uid, kind: 'totp', label: displayName || 'Authenticator app' });
    } else if (hint.factorId === PHONE_FACTOR_ID) {
      const phoneHint = typeof hint.phoneNumber === 'string' ? hint.phoneNumber : '';
      factors.push({ uid, kind: 'phone', label: displayName || 'Text message', ...(phoneHint ? { phoneHint } : {}) });
    } else {
      unsupportedCount += 1;
    }
  }
  // Authenticator apps first: they need no network round trip or reCAPTCHA.
  factors.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'totp' ? -1 : 1));
  return { factors, unsupportedCount };
}

/**
 * Build a challenge from a multi-factor-required error. Returns null for any
 * other error, or when the resolver cannot be obtained (the caller then shows
 * a generic failure instead of a half-working challenge).
 */
export function getMfaResolver(error: unknown): MfaChallenge | null {
  if (!isMfaRequired(error)) return null;
  let resolver: MultiFactorResolver | null = null;
  try {
    const candidate = (error as { resolver?: unknown }).resolver;
    resolver = candidate && typeof candidate === 'object' && 'resolveSignIn' in candidate
      ? (candidate as MultiFactorResolver)
      : getMultiFactorResolver(auth, error as never);
  } catch {
    // The resolver contents are sensitive; nothing about them is logged.
    resolver = null;
  }
  if (!resolver || typeof resolver.resolveSignIn !== 'function') return null;
  return { resolver, ...describeFactorHints(resolver.hints) };
}

export class MfaChallengeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MfaChallengeError';
    this.code = code;
  }

  /** The pending sign-in can no longer be completed; the user must start again. */
  get restartRequired(): boolean {
    return this.code === 'MFA_SESSION_EXPIRED';
  }
}

function findFactor(challenge: MfaChallenge, factorUid: string, kind: MfaFactorKind): MfaChallengeFactor {
  const factor = challenge.factors.find((entry) => entry.uid === factorUid && entry.kind === kind);
  if (!factor) throw new MfaChallengeError('MFA_FACTOR_NOT_FOUND', 'That verification method is not enrolled on this account. Choose another method or sign in again.');
  return factor;
}

/** Map a provider error to a short message. Raw provider messages are never shown. */
export function toMfaChallengeError(error: unknown): MfaChallengeError {
  if (error instanceof MfaChallengeError) return error;
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  switch (code) {
    case 'auth/invalid-verification-code':
    case 'auth/missing-code':
    case 'auth/totp-challenge-invalid':
      return new MfaChallengeError('MFA_CODE_INVALID', 'That code is not correct. Check the code and try again.');
    case 'auth/code-expired':
      return new MfaChallengeError('MFA_CODE_EXPIRED', 'That code has expired. Request or generate a new code and try again.');
    case 'auth/invalid-multi-factor-session':
    case 'auth/missing-multi-factor-session':
    case 'auth/multi-factor-info-not-found':
    case 'auth/user-token-expired':
      return new MfaChallengeError('MFA_SESSION_EXPIRED', 'This sign-in attempt has expired. Cancel and sign in again.');
    case 'auth/too-many-requests':
      return new MfaChallengeError('MFA_RATE_LIMITED', 'Too many attempts. Wait a few minutes, then try again.');
    case 'auth/network-request-failed':
      return new MfaChallengeError('MFA_NETWORK', 'The sign-in service could not be reached. Check your connection and try again.');
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      return new MfaChallengeError('MFA_RECAPTCHA_FAILED', 'The security check did not complete. Try sending the code again.');
    case 'auth/quota-exceeded':
      return new MfaChallengeError('MFA_SMS_QUOTA', 'Text messages cannot be sent right now. Use another method or try again later.');
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return new MfaChallengeError('MFA_CANCELLED', 'Verification was cancelled.');
    default:
      return new MfaChallengeError('MFA_FAILED', 'Verification failed. Try again, or cancel and sign in again.');
  }
}

/** Complete the second step with a 6-digit code from an authenticator app. */
export async function completeTotpSignIn(challenge: MfaChallenge, factorUid: string, code: string): Promise<UserCredential> {
  const clean = sanitizeMfaCode(code);
  if (!isValidMfaCode(clean)) throw new MfaChallengeError('MFA_CODE_FORMAT', 'Enter the 6-digit code from your authenticator app.');
  const factor = findFactor(challenge, factorUid, 'totp');
  try {
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, clean);
    return await challenge.resolver.resolveSignIn(assertion);
  } catch (error) {
    throw toMfaChallengeError(error);
  }
}

export interface PhoneVerification {
  verificationId: string;
  /** Releases the reCAPTCHA widget; safe to call more than once. */
  dispose: () => void;
}

/**
 * Send an SMS code for an enrolled phone factor. Firebase requires a reCAPTCHA
 * verifier for this; an invisible one is rendered into `container`.
 */
export async function sendPhoneSignInCode(challenge: MfaChallenge, factorUid: string, container: HTMLElement): Promise<PhoneVerification> {
  findFactor(challenge, factorUid, 'phone');
  const hint = challenge.resolver.hints.find((entry) => entry.uid === factorUid);
  if (!hint) throw new MfaChallengeError('MFA_FACTOR_NOT_FOUND', 'That verification method is not enrolled on this account. Choose another method or sign in again.');
  let verifier: RecaptchaVerifier | null = null;
  const dispose = () => {
    try { verifier?.clear(); } catch { /* already cleared */ }
    verifier = null;
  };
  try {
    verifier = new RecaptchaVerifier(auth, container, { size: 'invisible' });
    const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(
      { multiFactorHint: hint, session: challenge.resolver.session },
      verifier,
    );
    return { verificationId, dispose };
  } catch (error) {
    dispose();
    throw toMfaChallengeError(error);
  }
}

/** Complete the second step with the SMS code sent by `sendPhoneSignInCode`. */
export async function completePhoneSignIn(challenge: MfaChallenge, verificationId: string, code: string): Promise<UserCredential> {
  const clean = sanitizeMfaCode(code);
  if (!isValidMfaCode(clean)) throw new MfaChallengeError('MFA_CODE_FORMAT', 'Enter the 6-digit code from the text message.');
  if (!verificationId) throw new MfaChallengeError('MFA_CODE_NOT_SENT', 'Send a code to your phone first.');
  try {
    const assertion = PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(verificationId, clean));
    return await challenge.resolver.resolveSignIn(assertion);
  } catch (error) {
    throw toMfaChallengeError(error);
  }
}
