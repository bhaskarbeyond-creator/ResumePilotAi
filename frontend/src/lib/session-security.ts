/**
 * Session security for the signed-in candidate: what the session can manage,
 * password policy and changes, and the post-login return path.
 *
 * Session kinds (classifySessionSecurity):
 *  - firebase:    a Firebase user is signed in. Sign-in methods and enrolled
 *                 second factors come from that user record. A password
 *                 change re-authenticates first, because Firebase only accepts
 *                 a credential change after a recent sign-in; an account with
 *                 a second factor completes that step too (TOTP).
 *  - preview:     a non-production preview identity (lib/preview-session.ts).
 *                 It has no Firebase record, so there is no password and no
 *                 second factor to manage.
 *  - unavailable: neither can be confirmed (Firebase not ready, or no
 *                 identity at all). Nothing is offered and nothing is implied.
 *
 * A Firebase user object alone is not treated as proof that a session is
 * "secure"; the UI only reports what the identity provider says.
 */
import {
  EmailAuthProvider,
  multiFactor,
  reauthenticateWithCredential,
  updatePassword,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { readPreviewSession } from '@/lib/preview-session';
import { completeTotpSignIn, getMfaResolver, type MfaChallenge } from '@/lib/mfa';

/* ───────────────────────────── Return path ───────────────────────────── */

export const DEFAULT_RETURN_PATH = '/dashboard';
/** A reserved, never-resolvable origin used only to parse candidates (RFC 6761 .invalid). */
const PARSE_ORIGIN = 'https://ime365.invalid';
const MAX_RETURN_PATH_LENGTH = 2048;
// Any whitespace or control character (browsers silently strip tab/CR/LF from
// URLs, which turns "/\t/evil.example" into "//evil.example").
function hasUnsafeCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f)
      || code === 0x2028 || code === 0x2029 || code === 0xfeff || /\s/.test(char)) return true;
  }
  return false;
}

/**
 * Only same-origin application paths are accepted as a post-login
 * destination; anything else yields `fallback`.
 *
 * Rejected: protocol-relative ("//host"), any backslash (browsers treat "\"
 * as "/"), absolute URLs and schemes (javascript:, data:, https:), whitespace
 * or control characters anywhere, malformed percent-encoding, encoded forms
 * that decode to any of these, and anything that parses to another origin.
 * Accepted paths are returned normalised (dot segments resolved).
 */
export function safeReturnPath(raw: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RETURN_PATH_LENGTH) return fallback;
  if (hasUnsafeCharacters(raw)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;

  // Decode repeatedly (bounded) so double-encoded separators cannot slip through.
  let decoded = raw;
  for (let round = 0; round < 3; round += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    decoded = next;
  }
  if (decoded.startsWith('//') || decoded.includes('\\') || hasUnsafeCharacters(decoded)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, PARSE_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PARSE_ORIGIN) return fallback;
  // Never bounce back to the sign-in page itself.
  if (parsed.pathname === '/login') return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/* ─────────────────────────── Session classification ─────────────────────────── */

export type SignInMethod = 'password' | 'google.com' | 'facebook.com' | 'other';

export interface SecondFactor {
  uid: string;
  kind: 'totp' | 'phone' | 'other';
  label: string;
  /** Enrollment time as reported by Firebase (UTC string), or ''. */
  enrolledAt: string;
}

export type SessionSecurity =
  | { kind: 'preview' }
  | { kind: 'unavailable' }
  | { kind: 'firebase'; signInMethods: SignInMethod[]; hasPassword: boolean; factors: SecondFactor[] };

/** Minimum for new passwords (registration and password changes). */
export const PASSWORD_MIN_LENGTH = 8;
/** Firebase rejects longer passwords. */
export const PASSWORD_MAX_LENGTH = 4096;

export function signInMethodName(method: SignInMethod): string {
  switch (method) {
    case 'password': return 'email and password';
    case 'google.com': return 'Google';
    case 'facebook.com': return 'Facebook';
    default: return 'your sign-in provider';
  }
}

interface UserLike {
  providerData?: ReadonlyArray<{ providerId?: unknown } | null> | null;
}

interface FactorLike { uid?: unknown; factorId?: unknown; displayName?: unknown; enrollmentTime?: unknown }

export interface SessionSecurityInputs {
  firebaseConfigured: boolean;
  user: UserLike | null;
  /** The user's enrolled factors (multiFactor(user).enrolledFactors); null when they could not be read. */
  enrolledFactors: ReadonlyArray<FactorLike> | null;
  hasPreviewSession: boolean;
}

export function describeSecondFactors(enrolled: ReadonlyArray<FactorLike>): SecondFactor[] {
  return enrolled.flatMap((factor) => {
    const uid = typeof factor?.uid === 'string' ? factor.uid : '';
    if (!uid) return [];
    const kind = factor.factorId === 'totp' ? 'totp' : factor.factorId === 'phone' ? 'phone' : 'other';
    const named = typeof factor.displayName === 'string' ? factor.displayName.trim() : '';
    const label = named || (kind === 'totp' ? 'Authenticator app' : kind === 'phone' ? 'Text message' : 'Second factor');
    return [{ uid, kind, label, enrolledAt: typeof factor.enrollmentTime === 'string' ? factor.enrollmentTime : '' }];
  });
}

/** Pure classification of the current session (see module comment). */
export function classifySessionSecurity(inputs: SessionSecurityInputs): SessionSecurity {
  const user = inputs.firebaseConfigured ? inputs.user : null;
  if (!user) return inputs.hasPreviewSession ? { kind: 'preview' } : { kind: 'unavailable' };
  // Without the provider's factor list the session cannot be described honestly.
  if (!inputs.enrolledFactors) return { kind: 'unavailable' };
  const signInMethods = (user.providerData ?? []).map((provider): SignInMethod => {
    const id = provider?.providerId;
    return id === 'password' || id === 'google.com' || id === 'facebook.com' ? id : 'other';
  });
  return {
    kind: 'firebase',
    signInMethods,
    hasPassword: signInMethods.includes('password'),
    factors: describeSecondFactors(inputs.enrolledFactors),
  };
}

function enrolledFactorsOf(user: User | null): FactorLike[] | null {
  if (!user) return null;
  try {
    return [...multiFactor(user).enrolledFactors];
  } catch {
    return null;
  }
}

export function readSessionSecurity(): SessionSecurity {
  const firebaseConfigured = isFirebaseConfigured();
  const user = firebaseConfigured ? auth.currentUser : null;
  return classifySessionSecurity({
    firebaseConfigured,
    user,
    enrolledFactors: enrolledFactorsOf(user),
    hasPreviewSession: readPreviewSession() !== null,
  });
}

/**
 * Re-read the Firebase user from the identity provider before describing the
 * session, so enrolled factors are never taken from a stale local copy.
 * When the reload fails the result is `unavailable`, not the cached record.
 */
export async function refreshSessionSecurity(): Promise<SessionSecurity> {
  const user = isFirebaseConfigured() ? auth.currentUser : null;
  if (user) {
    try {
      await user.reload();
    } catch {
      return { kind: 'unavailable' };
    }
  }
  return readSessionSecurity();
}

/* ─────────────────────────── Password policy & strength ─────────────────────────── */

export interface PasswordChangeInput { current: string; next: string; confirm: string }
export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeInput, string>>;

export function validatePasswordChange({ current, next, confirm }: PasswordChangeInput): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!current) errors.current = 'Enter your current password.';
  if (next.length < PASSWORD_MIN_LENGTH) errors.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  else if (next.length > PASSWORD_MAX_LENGTH) errors.next = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  else if (current && next === current) errors.next = 'Choose a password that differs from your current one.';
  if (!errors.next && confirm !== next) errors.confirm = 'The passwords do not match.';
  return errors;
}

export interface PasswordStrength {
  /** Meets the minimum policy (length). Policy compliance is not the same as strength. */
  meetsPolicy: boolean;
  /** 0 (very weak) … 4 (strong), a local estimate only. */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  suggestions: string[];
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'admin123', 'welcome1', 'letmein1', 'abc12345', 'football', 'baseball', 'sunshine',
  'princess', 'passw0rd', 'trustno1', '11111111', '00000000', 'ime365ime365', 'interview',
]);

/**
 * A local, offline estimate. The password never leaves the browser and is not
 * sent to any third-party strength or breach service.
 */
export function assessPasswordStrength(password: string): PasswordStrength {
  const value = String(password ?? '');
  const meetsPolicy = value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
  const suggestions: string[] = [];
  if (!meetsPolicy) {
    return { meetsPolicy, score: 0, label: 'Too short', suggestions: [`Use at least ${PASSWORD_MIN_LENGTH} characters.`] };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  let points = 0;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;
  if (classes >= 3) points += 1;
  if (classes === 4) points += 1;
  const lower = value.toLowerCase();
  const repeated = /(.)\1{3,}/.test(value);
  const sequential = /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|asdf|zxcv)/.test(lower);
  const common = COMMON_PASSWORDS.has(lower);
  if (common) points = 0;
  if (repeated || sequential) points = Math.max(0, points - 1);
  const score = (common ? 1 : Math.min(4, Math.max(1, points))) as PasswordStrength['score'];
  if (value.length < 12) suggestions.push('A longer password (12 or more characters) is much harder to guess.');
  if (classes < 3) suggestions.push('Mix upper- and lower-case letters, numbers and symbols.');
  if (repeated) suggestions.push('Avoid repeating the same character.');
  if (sequential) suggestions.push('Avoid sequences such as 1234 or qwer.');
  if (common) suggestions.push('This is a commonly used password. Choose something unique.');
  const labels: Record<number, PasswordStrength['label']> = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };
  return { meetsPolicy, score, label: labels[score] ?? 'Weak', suggestions };
}

/* ─────────────────────────── Password change ─────────────────────────── */

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
  if (error instanceof PasswordChangeError) return error;
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return new PasswordChangeError(code, 'Your current password is incorrect.');
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return new PasswordChangeError(code, `Choose a stronger password of at least ${PASSWORD_MIN_LENGTH} characters.`);
    case 'auth/too-many-requests':
      return new PasswordChangeError(code, 'Too many attempts. Wait a few minutes, then try again.');
    case 'auth/network-request-failed':
      return new PasswordChangeError(code, 'The sign-in service could not be reached. Check your connection and try again.');
    case 'auth/requires-recent-login':
    case 'auth/multi-factor-auth-required':
    case 'auth/user-mismatch':
    case 'auth/user-token-expired':
      return new PasswordChangeError('RECENT_SIGN_IN_REQUIRED', 'For your security, sign in again, then change your password.');
    default:
      return new PasswordChangeError(code || 'PASSWORD_CHANGE_FAILED', 'Your password could not be changed. Try again.');
  }
}

export type PasswordChangeResult =
  | { status: 'changed' }
  /** Re-authentication needs the account's second factor before the change can be made. */
  | { status: 'second-factor-required'; challenge: MfaChallenge };

function currentPasswordUser(): User & { email: string } {
  const user = isFirebaseConfigured() ? auth.currentUser : null;
  if (!user?.email) {
    throw new PasswordChangeError('NO_PASSWORD_IDENTITY', 'This session has no password that can be changed here.');
  }
  return user as User & { email: string };
}

/**
 * Re-authenticate with the current password, then set the new one. An account
 * protected by an authenticator app returns `second-factor-required`; the
 * change is then finished by `completePasswordChangeWithTotp`.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResult> {
  const user = currentPasswordUser();
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  } catch (error) {
    const challenge = getMfaResolver(error);
    if (challenge && challenge.factors.some((factor) => factor.kind === 'totp')) {
      return { status: 'second-factor-required', challenge };
    }
    if (challenge) {
      throw new PasswordChangeError(
        'SECOND_FACTOR_UNSUPPORTED',
        'Your account\'s second step cannot confirm a password change on this page. Sign out and use "Forgot password?" on the sign-in page instead.',
      );
    }
    throw toPasswordChangeError(error);
  }
  try {
    await updatePassword(user, newPassword);
  } catch (error) {
    throw toPasswordChangeError(error);
  }
  return { status: 'changed' };
}

/** Finish a password change whose re-authentication needed an authenticator-app code. */
export async function completePasswordChangeWithTotp(
  challenge: MfaChallenge,
  factorUid: string,
  code: string,
  newPassword: string,
): Promise<void> {
  // Re-authentication completes through the resolver; MfaChallengeError carries its own message.
  await completeTotpSignIn(challenge, factorUid, code);
  try {
    await updatePassword(currentPasswordUser(), newPassword);
  } catch (error) {
    throw toPasswordChangeError(error);
  }
}
