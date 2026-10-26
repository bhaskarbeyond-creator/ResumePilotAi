/**
 * What the signed-in session can manage for passwords and two-factor
 * authentication.
 *
 * Firebase identities (every production session): a password change first
 * re-authenticates with the current password, because Firebase only accepts a
 * credential change after a recent sign-in. Enrolled second factors are read
 * from the Firebase user. A session that needs a fresh sign-in (for example
 * one protected by a second factor) is told to sign in again instead of being
 * shown a raw provider error.
 *
 * Preview identities (non-production only, lib/preview-session.ts) have no
 * Firebase record, so there is no password and no second factor to manage;
 * the Settings page says so instead of offering forms that cannot work.
 */
import {
  EmailAuthProvider,
  multiFactor,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';

export type SignInMethod = 'password' | 'google.com' | 'facebook.com' | 'other';

export interface SecondFactor {
  uid: string;
  label: string;
  /** Enrollment time as reported by Firebase (UTC string), or ''. */
  enrolledAt: string;
}

export type SessionSecurity =
  | { kind: 'preview' }
  | {
      kind: 'firebase';
      signInMethods: SignInMethod[];
      hasPassword: boolean;
      factors: SecondFactor[];
      /** Email (or uid) shown inside an authenticator app when a new factor is enrolled. */
      accountName: string;
    };

export const PASSWORD_MIN_LENGTH = 6;

export function signInMethodName(method: SignInMethod): string {
  switch (method) {
    case 'password': return 'email and password';
    case 'google.com': return 'Google';
    case 'facebook.com': return 'Facebook';
    default: return 'your sign-in provider';
  }
}

export function readSessionSecurity(): SessionSecurity {
  const user = isFirebaseConfigured() ? auth.currentUser : null;
  if (!user) return { kind: 'preview' };
  const signInMethods = user.providerData.map((provider): SignInMethod => (
    provider.providerId === 'password' || provider.providerId === 'google.com' || provider.providerId === 'facebook.com'
      ? provider.providerId
      : 'other'
  ));
  let factors: SecondFactor[] = [];
  try {
    factors = multiFactor(user).enrolledFactors.map((factor) => ({
      uid: factor.uid,
      label: factor.displayName || (factor.factorId === 'totp' ? 'Authenticator app' : 'Second factor'),
      enrolledAt: factor.enrollmentTime || '',
    }));
  } catch {
    factors = [];
  }
  return {
    kind: 'firebase',
    signInMethods,
    hasPassword: signInMethods.includes('password'),
    factors,
    accountName: user.email || user.uid,
  };
}

export class PasswordChangeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PasswordChangeError';
    this.code = code;
  }

  get needsRecentSignIn(): boolean {
    return this.code === 'RECENT_SIGN_IN_REQUIRED';
  }
}

function toPasswordChangeError(error: unknown): PasswordChangeError {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return new PasswordChangeError(code, 'Your current password is incorrect.');
    case 'auth/weak-password':
      return new PasswordChangeError(code, `Choose a stronger password of at least ${PASSWORD_MIN_LENGTH} characters.`);
    case 'auth/too-many-requests':
      return new PasswordChangeError(code, 'Too many attempts. Wait a few minutes, then try again.');
    case 'auth/network-request-failed':
      return new PasswordChangeError(code, 'The sign-in service could not be reached. Check your connection and try again.');
    case 'auth/requires-recent-login':
    case 'auth/multi-factor-auth-required':
    case 'auth/user-mismatch':
      return new PasswordChangeError('RECENT_SIGN_IN_REQUIRED', 'For your security, sign in again, then change your password.');
    default:
      return new PasswordChangeError(code || 'PASSWORD_CHANGE_FAILED', 'Your password could not be changed. Try again.');
  }
}

/** Re-authenticate with the current password, then set the new one (Firebase sessions only). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = isFirebaseConfigured() ? auth.currentUser : null;
  if (!user?.email) {
    throw new PasswordChangeError('NO_PASSWORD_IDENTITY', 'This session has no password that can be changed here.');
  }
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  } catch (error) {
    throw toPasswordChangeError(error);
  }
}
