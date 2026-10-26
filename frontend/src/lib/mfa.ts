/**
 * Firebase Multi-Factor Authentication (MFA / 2FA / TOTP)
 *
 * Provides resolution of auth/multi-factor-auth-required errors during
 * email/password and OAuth sign-in flows.
 */

import {
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type MultiFactorInfo,
  type UserCredential,
} from 'firebase/auth';
import { auth } from './firebase';

export interface MfaResolverState {
  resolver: MultiFactorResolver;
  hint: MultiFactorInfo;
}

/**
 * Checks whether an error is a Firebase multi-factor authentication required error.
 */
export function isMfaRequired(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === 'auth/multi-factor-auth-required' ||
    String(err.message || '').includes('multi-factor-auth-required')
  );
}

/**
 * Extracts the MultiFactorResolver and primary factor hint from a multi-factor error.
 */
export function getMfaResolver(error: unknown): MfaResolverState | null {
  if (!isMfaRequired(error)) return null;

  try {
    const err = error as { resolver?: MultiFactorResolver; _delegate?: unknown };
    let resolver = err.resolver ?? null;
    if (!resolver) {
      // Cast through unknown to satisfy Firebase MultiFactorError signature
      resolver = getMultiFactorResolver(auth, (err._delegate || err) as never);
    }
    if (!resolver) return null;

    const hints = resolver.hints || [];
    const hint =
      hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ||
      hints[0];

    if (!hint) return null;

    return { resolver, hint };
  } catch (extractErr) {
    console.error('[MFA] Failed to resolve multi-factor challenge:', extractErr);
    return null;
  }
}

/**
 * Completes sign-in using the user's 6-digit TOTP verification code.
 */
export async function completeMfaSignIn(
  resolverState: MfaResolverState,
  code: string
): Promise<UserCredential> {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('A valid 6-digit verification code is required.');
  }

  const { resolver, hint } = resolverState;
  const hintUid = hint.uid || resolver.hints?.[0]?.uid;
  if (!hintUid) {
    throw new Error('No enrolled multi-factor authentication method found on this account.');
  }

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hintUid, cleanCode);
  return resolver.resolveSignIn(assertion);
}

/**
 * What the enrolment screen needs after a factor is generated.
 *
 * `secret` and `uri` are what the person transfers into their authenticator app: the secret for
 * manual entry, the `otpauth://` URI for a tap-to-add link. `pending` is the provider's own
 * `TotpSecret`, opaque here on purpose — it is handed straight back to `completeTotpEnrollment`,
 * so the component never imports a Firebase type and stays testable without a project.
 */
export interface MfaEnrollment {
  secret: string;
  uri: string;
  pending: unknown;
}

/**
 * Begin TOTP enrolment for the signed-in user.
 *
 * The provider flow is two calls: `multiFactor(user).getSession()` then
 * `TotpMultiFactorGenerator.generateSecret(session)`. The second returns the shared key and can
 * produce the `otpauth://` URI the screen shows.
 *
 * @param accountName account label inside the authenticator app (usually the email)
 * @returns the secret, its URI and the opaque pending handle
 * @throws when nobody is signed in with a password, or the provider returns no secret
 */
export async function beginTotpEnrollment(accountName: string): Promise<MfaEnrollment> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sign in with a password before enrolling a second factor.');
  }
  const { multiFactor } = await import('firebase/auth');
  const session = await multiFactor(currentUser).getSession();
  const totpSecret = await TotpMultiFactorGenerator.generateSecret(session);
  const secret = totpSecret.secretKey;
  if (!secret) {
    // A blank enrolment screen is worse than a refusal: fail where the cause is visible.
    throw new Error('The identity provider did not return an enrolable secret.');
  }
  return {
    secret,
    uri: totpSecret.generateQrCodeUrl(accountName, 'IME365'),
    pending: totpSecret,
  };
}

/**
 * Finish an enrolment with the first six-digit code from the authenticator app.
 *
 * @param pending the handle returned by `beginTotpEnrollment`
 * @param code six digits from the app
 * @param displayName label shown in the app's factor list
 * @throws when the code is malformed or the provider rejects it
 */
export async function completeTotpEnrollment(pending: unknown, code: string, displayName = 'Authenticator app'): Promise<void> {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('A valid 6-digit verification code is required.');
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('The session ended before enrolment could be confirmed. Sign in again.');
  }
  const { multiFactor } = await import('firebase/auth');
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(pending as never, cleanCode);
  await multiFactor(currentUser).enroll(assertion, displayName);
}
