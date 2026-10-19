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
