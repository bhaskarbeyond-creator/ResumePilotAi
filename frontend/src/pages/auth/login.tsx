/**
 * Login / Registration Page
 *
 * Handles email/password sign-in, registration, OAuth, password reset and the
 * second sign-in step (multi-factor authentication). Preserves the existing
 * backend's Firebase Auth identity contract.
 *
 * The page is one explicit state machine (AuthView): login, register, reset,
 * mfa (a pending second step), or profile-sync (the account exists but the
 * registration names could not be stored). Exactly one view renders at a
 * time, so contradictory states (for example a registration form next to a
 * second-step challenge) cannot occur.
 *
 * Messages use the shared live regions: a polite status for progress and
 * success, an assertive alert for errors. Passwords and verification codes
 * are never logged or stored.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  googleProvider,
  isFirebaseConfigured,
} from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { PreviewLoginError, requestPreviewLogin } from '@/lib/preview-session';
import {
  markRegistrationProfileSyncFailed,
  clearRegistrationProfileSyncFlag,
  syncRegistrationProfile,
} from '@/lib/account-settings';
import {
  completePhoneSignIn,
  completeTotpSignIn,
  getMfaResolver,
  isValidMfaCode,
  sanitizeMfaCode,
  sendPhoneSignInCode,
  toMfaChallengeError,
  type MfaChallenge,
  type PhoneVerification,
} from '@/lib/mfa';
import { PASSWORD_MIN_LENGTH, safeReturnPath } from '@/lib/session-security';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldCheck,
  MessageSquare,
  Smartphone,
} from 'lucide-react';

type AuthView =
  | { mode: 'login' }
  | { mode: 'register' }
  | { mode: 'reset' }
  | { mode: 'mfa'; challenge: MfaChallenge; factorUid: string | null }
  | { mode: 'profile-sync'; destination: string; fullReload: boolean };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Preview identities (non-production only) are keyed by email; the backend
 * performs no password verification for them. A one-time random value is sent
 * instead of a stored credential, so no password literal lives in the bundle.
 */
function oneTimePreviewSecret(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const errorCode = (error: unknown): string =>
  typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';

/** User-facing sign-in / registration messages. Raw provider messages are never shown. */
function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead, or reset your password.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return `Choose a stronger password of at least ${PASSWORD_MIN_LENGTH} characters.`;
    case 'auth/user-disabled':
      return 'This account cannot sign in. Contact support for help.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/not-configured':
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not available in this environment.';
    case 'auth/unauthorized-domain':
      return `The current domain (${typeof window !== 'undefined' ? window.location.hostname : 'domain'}) is not authorized in Firebase. Please add it to Authorized domains in Firebase Console.`;
    case 'auth/multi-factor-auth-required':
      return 'This account needs a second sign-in step that could not be started. Please try again.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('next'));
  // Without a configured Firebase identity provider (local / QA / certification
  // environments) the same form authenticates through the backend preview
  // identity endpoint, which answers 404 unless the non-production verifier is on.
  const usePreviewIdentity = !isFirebaseConfigured();

  const [view, setView] = useState<AuthView>({ mode: 'login' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [phoneVerification, setPhoneVerification] = useState<PhoneVerification | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const mfaCodeRef = useRef<HTMLInputElement>(null);
  const mode = view.mode;

  // Set on every mount: StrictMode (dev) mounts, unmounts and mounts again.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // Release any reCAPTCHA widget when it is replaced or the page unmounts.
  useEffect(() => () => phoneVerification?.dispose(), [phoneVerification]);

  const showError = (text: string) => setNotice({ tone: 'error', text });

  /** Run one request at a time; a second click while busy does nothing. */
  const guarded = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const switchMode = (next: 'login' | 'register' | 'reset') => {
    if (busyRef.current) return;
    setView({ mode: next });
    setNotice(null);
  };

  const enterMfa = (challenge: MfaChallenge) => {
    setMfaCode('');
    setPhoneVerification(null);
    setView({ mode: 'mfa', challenge, factorUid: challenge.factors[0]?.uid ?? null });
    setNotice(challenge.factors.length === 0
      ? { tone: 'error', text: 'This account uses a second sign-in step that this page cannot complete. Cancel, then contact support for help.' }
      : null);
  };

  /** Back to the sign-in form; only challenge state is cleared (email and password stay). */
  const cancelMfa = (message: Notice | null = null) => {
    setMfaCode('');
    setPhoneVerification(null);
    setView({ mode: 'login' });
    setNotice(message);
  };

  const goTo = (destination: string, fullReload: boolean) => {
    if (fullReload) window.location.assign(destination);
    else navigate(destination, { replace: true });
  };

  /**
   * Store the registration names once the identity exists. A refusal is
   * reported, never hidden, and never retried by creating another account.
   */
  const finishRegistration = async (destination: string, fullReload: boolean) => {
    try {
      await syncRegistrationProfile(firstName, lastName);
      clearRegistrationProfileSyncFlag();
      goTo(destination, fullReload);
    } catch {
      // The Settings page reads this marker (no names or credentials are stored).
      markRegistrationProfileSyncFailed();
      if (mountedRef.current) {
        setView({ mode: 'profile-sync', destination, fullReload });
        showError('Your account was created, but your name could not be saved to your Master Profile.');
      } else {
        // The sign-in redirect already replaced this page: open the Master
        // Profile, where the notice explains what to do.
        navigate('/dashboard/settings?tab=profile', { replace: true });
      }
    }
  };

  const retryProfileSync = () => guarded(async () => {
    if (view.mode !== 'profile-sync') return;
    setNotice(null);
    try {
      await syncRegistrationProfile(firstName, lastName);
      clearRegistrationProfileSyncFlag();
      setNotice({ tone: 'success', text: 'Your name was saved to your Master Profile.' });
      goTo(view.destination, view.fullReload);
    } catch {
      showError('Your name still could not be saved. You can continue and add it later in Settings → Master Profile.');
    }
  });

  /** Sign in (or register) through the backend preview identity endpoint. */
  const completePreviewSignIn = async () => {
    const name = firstName ? `${firstName} ${lastName}`.trim() : undefined;
    await requestPreviewLogin({ email, password, ...(name ? { name } : {}) });
    setPassword('');
    if (mode === 'register') {
      // Full navigation so the auth provider re-reads and verifies the new session.
      await finishRegistration(returnTo, true);
      return;
    }
    window.location.assign(returnTo);
  };

  /** Non-production QA shortcut: real preview login for a known demo identity. */
  const handleDemoAccess = (demoEmail: string) => guarded(async () => {
    setNotice(null);
    try {
      await requestPreviewLogin({ email: demoEmail, password: oneTimePreviewSecret() });
      window.location.assign(returnTo);
    } catch (err) {
      showError(err instanceof PreviewLoginError ? err.message : 'Demo sign-in failed. Please try again.');
    }
  });

  const handleReset = async () => {
    if (usePreviewIdentity) {
      showError('Password reset is not available in this environment.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      showError('Enter a valid email address.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice({ tone: 'success', text: 'If an account exists for that email, a password reset link is on its way. Check your inbox.' });
    } catch (err) {
      const code = errorCode(err);
      // Same answer whether or not the address has an account.
      if (code === 'auth/user-not-found') {
        setNotice({ tone: 'success', text: 'If an account exists for that email, a password reset link is on its way. Check your inbox.' });
      } else if (code === 'auth/invalid-email') {
        showError('Enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        showError('Too many attempts. Please try again later.');
      } else if (code === 'auth/network-request-failed') {
        showError('Network error. Please check your connection.');
      } else {
        showError('The reset link could not be sent. Please try again.');
      }
    }
  };

  const handleEmailAuth = (e: FormEvent) => {
    e.preventDefault();
    return guarded(async () => {
      setNotice(null);
      if (mode === 'reset') {
        await handleReset();
        return;
      }
      if (!EMAIL_PATTERN.test(email.trim())) {
        showError('Enter a valid email address.');
        return;
      }
      if (!password) {
        showError('Enter your password.');
        return;
      }
      if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) {
        showError(`Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
        return;
      }

      try {
        // Test accounts on the reserved .test domain (RFC 2606) use the preview
        // identity even where Firebase is configured: no real address can end in
        // .test, and the endpoint answers 404 unless the backend's non-production
        // verifier is on. A prefix such as "p002." is not used, because a real
        // address can start with it.
        if (usePreviewIdentity || email.trim().endsWith('.test')) {
          await completePreviewSignIn();
          return;
        }

        if (mode === 'register') {
          await createUserWithEmailAndPassword(auth, email.trim(), password);
          setPassword('');
          await finishRegistration(returnTo, false);
        } else {
          const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
          if (credential.user) navigate(returnTo, { replace: true });
        }
      } catch (err: unknown) {
        if (err instanceof PreviewLoginError) {
          showError(err.message);
          return;
        }
        const challenge = getMfaResolver(err);
        if (challenge) {
          enterMfa(challenge);
          return;
        }
        const code = errorCode(err);

        // Local development & QA hosts that are not in Firebase's authorised
        // domains can still authenticate through the preview identity endpoint
        // (404 unless the backend's non-production verifier is enabled).
        if (code === 'auth/unauthorized-domain') {
          try {
            await completePreviewSignIn();
            return;
          } catch (previewErr) {
            if (previewErr instanceof PreviewLoginError && previewErr.status !== 404) {
              showError(previewErr.message);
              return;
            }
          }
        }
        showError(authErrorMessage(code));
      }
    });
  };

  const handleGoogleSignIn = () => guarded(async () => {
    if (!googleProvider) {
      showError('Google sign-in is not available in this environment.');
      return;
    }
    setNotice(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      const challenge = getMfaResolver(err);
      if (challenge) {
        enterMfa(challenge);
        return;
      }
      const code = errorCode(err);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      showError(code === 'auth/unauthorized-domain'
        ? `Sign-in domain (${typeof window !== 'undefined' ? window.location.hostname : 'domain'}) is not authorized in Firebase. Please add it to Firebase Console > Authentication > Settings > Authorized domains.`
        : code === 'auth/popup-blocked'
          ? 'The sign-in window was blocked. Allow pop-ups for this site and try again.'
          : 'Google sign-in failed. Please try again.');
    }
  });

  const mfaFactor = view.mode === 'mfa' ? view.challenge.factors.find((factor) => factor.uid === view.factorUid) ?? null : null;

  const handleSendSms = () => guarded(async () => {
    if (view.mode !== 'mfa' || !mfaFactor || mfaFactor.kind !== 'phone' || !recaptchaRef.current) return;
    setNotice(null);
    try {
      const verification = await sendPhoneSignInCode(view.challenge, mfaFactor.uid, recaptchaRef.current);
      setPhoneVerification(verification);
      setMfaCode('');
      setNotice({ tone: 'info', text: `A 6-digit code was sent${mfaFactor.phoneHint ? ` to ${mfaFactor.phoneHint}` : ''}.` });
      mfaCodeRef.current?.focus();
    } catch (err) {
      showError(toMfaChallengeError(err).message);
    }
  });

  const handleMfaSubmit = (e: FormEvent) => {
    e.preventDefault();
    return guarded(async () => {
      if (view.mode !== 'mfa' || !mfaFactor) return;
      const code = sanitizeMfaCode(mfaCode);
      if (!isValidMfaCode(code)) {
        showError(mfaFactor.kind === 'totp' ? 'Enter the 6-digit code from your authenticator app.' : 'Enter the 6-digit code from the text message.');
        mfaCodeRef.current?.focus();
        return;
      }
      if (mfaFactor.kind === 'phone' && !phoneVerification) {
        showError('Send a code to your phone first.');
        return;
      }
      setNotice(null);
      try {
        const credential = mfaFactor.kind === 'totp'
          ? await completeTotpSignIn(view.challenge, mfaFactor.uid, code)
          : await completePhoneSignIn(view.challenge, phoneVerification!.verificationId, code);
        if (credential.user) {
          // Firebase confirmed the second step; only now is success reported.
          setNotice({ tone: 'success', text: 'Verified. Signing you in…' });
          navigate(returnTo, { replace: true });
        }
      } catch (err) {
        const failure = toMfaChallengeError(err);
        setMfaCode('');
        if (failure.restartRequired) {
          cancelMfa({ tone: 'error', text: failure.message.replace('Cancel and sign in again.', 'Sign in again.') });
          return;
        }
        showError(failure.message);
        mfaCodeRef.current?.focus();
      }
    });
  };

  const chooseFactor = (factorUid: string) => {
    if (view.mode !== 'mfa' || busyRef.current) return;
    setMfaCode('');
    setPhoneVerification(null);
    setNotice(null);
    setView({ ...view, factorUid });
  };

  const heading = mode === 'mfa'
    ? 'Two-Factor Authentication'
    : mode === 'profile-sync'
      ? 'Account created'
      : mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset password';
  const subheading = mode === 'mfa'
    ? 'Confirm it is you with your second sign-in step'
    : mode === 'profile-sync'
      ? 'One detail needs your attention'
      : mode === 'login' ? 'Sign in to your IME365 account' : mode === 'register' ? 'Start building your career today' : 'Enter your email to receive a reset link';
  const pageTitle = mode === 'register'
    ? 'Create your IME365 account'
    : mode === 'reset' ? 'Reset your password' : mode === 'mfa' ? 'Verify your sign-in' : mode === 'profile-sync' ? 'Your IME365 account was created' : 'Sign in to IME365';

  return (
    <div className="flex min-h-screen">
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-surface focus:text-brand-600 focus:border-b focus:border-brand-200"
      >
        Skip to main content
      </a>

      {/* Left panel — branding */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-info-700 lg:flex lg:flex-col lg:justify-center">
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        </div>
        <div className="relative z-10 px-12 xl:px-20">
          <Link to="/" className="mb-12 flex items-center gap-3 no-underline">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/20 font-bold text-white text-lg backdrop-blur-sm">
              IM
            </div>
            <span className="text-2xl font-bold text-white">IME365</span>
          </Link>
          <h2 className="text-3xl font-bold text-white xl:text-4xl">
            Build your career path with AI-powered tools
          </h2>
          <p className="mt-4 text-lg text-white/80 leading-relaxed">
            Professional resumes, interview coaching, job tracking, and more — everything you need in one platform.
          </p>
          <div className="mt-8 space-y-3">
            {[
              '51+ professional resume templates',
              'AI interview preparation coach',
              'Real-time ATS score analysis',
              'Smart job matching & tracking',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-white/90">
                <CheckCircle2 className="size-5 shrink-0 text-success-400" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <Link to="/" className="flex items-center gap-2 no-underline">
              <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 font-bold text-white text-sm">
                IM
              </div>
              <span className="text-lg font-bold text-ink">IME365</span>
            </Link>
          </div>

          <main id="main-content" className="w-full" role="main">
            <h1 className="sr-only">{pageTitle}</h1>
            <Card className="border-0 shadow-xl lg:border">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-2xl">{heading}</CardTitle>
                <CardDescription>{subheading}</CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="mb-4 space-y-2 empty:mb-0">
                  <NoticeRegions notice={notice} idPrefix="auth-notice" />
                </div>

                {view.mode === 'mfa' ? (
                  /* Second sign-in step */
                  <form onSubmit={handleMfaSubmit} className="space-y-4" noValidate aria-label="Two-factor verification">
                    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-center">
                      <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                        <ShieldCheck className="size-6" aria-hidden="true" />
                      </div>
                      <h2 className="text-base font-bold text-ink">Two-step verification</h2>
                      <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                        {mfaFactor?.kind === 'phone'
                          ? 'We will text a 6-digit code to your enrolled phone.'
                          : mfaFactor?.kind === 'totp'
                            ? 'Enter the 6-digit code from your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.).'
                            : 'No verification method on this account can be completed here.'}
                      </p>
                    </div>

                    {view.challenge.factors.length > 1 && (
                      <fieldset className="space-y-2">
                        <legend className="mb-1 text-sm font-medium text-ink">Verification method</legend>
                        {view.challenge.factors.map((factor) => (
                          <label key={factor.uid} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm focus-within:outline-2 focus-within:outline-brand-500">
                            <input
                              type="radio"
                              name="mfa-factor"
                              value={factor.uid}
                              checked={view.factorUid === factor.uid}
                              onChange={() => chooseFactor(factor.uid)}
                            />
                            {factor.kind === 'totp' ? <Smartphone className="size-4 text-ink-muted" aria-hidden="true" /> : <MessageSquare className="size-4 text-ink-muted" aria-hidden="true" />}
                            <span>
                              {factor.label}
                              {factor.kind === 'phone' && factor.phoneHint ? ` (${factor.phoneHint})` : ''}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    )}

                    {mfaFactor?.kind === 'phone' && (
                      <Button type="button" variant="outline" className="w-full" onClick={() => void handleSendSms()} aria-disabled={loading || undefined}>
                        <MessageSquare className="size-4" aria-hidden="true" />
                        {phoneVerification ? 'Send a new code' : `Text a code${mfaFactor.phoneHint ? ` to ${mfaFactor.phoneHint}` : ''}`}
                      </Button>
                    )}

                    {mfaFactor && (mfaFactor.kind === 'totp' || phoneVerification) && (
                      <div>
                        <label htmlFor="mfa-code" className="mb-1.5 block text-sm font-medium text-ink">
                          {mfaFactor.kind === 'totp' ? 'Authenticator app code' : 'Text message code'}
                        </label>
                        <Input
                          ref={mfaCodeRef}
                          id="mfa-code"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          autoFocus
                          maxLength={6}
                          placeholder="123456"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(sanitizeMfaCode(e.target.value))}
                          className="text-center font-mono text-2xl tracking-[0.4em] h-14 bg-surface"
                          autoComplete="one-time-code"
                          aria-describedby="mfa-code-hint"
                          required
                        />
                        <p id="mfa-code-hint" className="mt-1 text-xs text-ink-muted">6 digits, numbers only.</p>
                      </div>
                    )}

                    {/* Invisible reCAPTCHA host for SMS codes (required by Firebase). */}
                    <div ref={recaptchaRef} />

                    {mfaFactor && (mfaFactor.kind === 'totp' || phoneVerification) && (
                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        aria-disabled={loading || undefined}
                        aria-busy={loading || undefined}
                        id="btn-verify-mfa"
                      >
                        {loading ? 'Verifying…' : 'Verify & Sign In'}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-xs text-ink-muted hover:text-ink"
                      onClick={() => { if (!busyRef.current) cancelMfa(); }}
                    >
                      Cancel and return to sign in
                    </Button>
                  </form>
                ) : view.mode === 'profile-sync' ? (
                  <div className="space-y-4">
                    <p className="text-sm text-ink-secondary">
                      You are signed in. The name you entered was not stored in your Master Profile, so resumes will not
                      start with it yet. Try again now, or continue and add it later in Settings → Master Profile.
                    </p>
                    <Button type="button" className="w-full" onClick={() => void retryProfileSync()} aria-disabled={loading || undefined} aria-busy={loading || undefined}>
                      {loading ? 'Saving…' : 'Try saving my name again'}
                    </Button>
                    <Button type="button" variant="outline" className="w-full" onClick={() => { if (!busyRef.current) goTo(view.destination, view.fullReload); }}>
                      Continue without saving
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* OAuth buttons */}
                    {mode !== 'reset' && isFirebaseConfigured() && (
                      <>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => void handleGoogleSignIn()}
                          disabled={loading}
                          type="button"
                        >
                          <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          Continue with Google
                        </Button>

                        <div className="my-5 flex items-center gap-3">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-xs font-medium text-ink-muted">OR</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      </>
                    )}

                    {/* Email/Password form */}
                    <form onSubmit={handleEmailAuth} className="space-y-4" noValidate aria-label={mode === 'register' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in'}>
                      {mode === 'register' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-ink">
                              First name
                            </label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                              <Input
                                id="firstName"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="John"
                                className="pl-9"
                                autoComplete="given-name"
                                maxLength={120}
                              />
                            </div>
                          </div>
                          <div>
                            <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-ink">
                              Last name
                            </label>
                            <Input
                              id="lastName"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              placeholder="Doe"
                              autoComplete="family-name"
                              maxLength={120}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                          Email address
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                          <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="pl-9"
                            required
                            autoComplete="email"
                          />
                        </div>
                      </div>

                      {mode !== 'reset' && (
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="password" className="text-sm font-medium text-ink">
                              Password
                            </label>
                            {mode === 'login' && (
                              <button
                                type="button"
                                onClick={() => switchMode('reset')}
                                className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                              >
                                Forgot password?
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                            <Input
                              id="password"
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="pl-9 pr-10"
                              required
                              minLength={mode === 'register' ? PASSWORD_MIN_LENGTH : undefined}
                              aria-describedby={mode === 'register' ? 'password-hint' : undefined}
                              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((current) => !current)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-brand-500"
                              aria-label="Show password"
                              aria-pressed={showPassword}
                              aria-controls="password"
                            >
                              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                            </button>
                          </div>
                          {mode === 'register' && (
                            <p id="password-hint" className="mt-1 text-xs text-ink-muted">Use at least {PASSWORD_MIN_LENGTH} characters.</p>
                          )}
                        </div>
                      )}

                      <Button type="submit" className="w-full" loading={loading} size="lg">
                        {mode === 'login' && 'Sign in'}
                        {mode === 'register' && 'Create account'}
                        {mode === 'reset' && 'Send reset link'}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Button>
                    </form>

                    {/* Mode switch */}
                    <div className="mt-6 text-center text-sm text-ink-muted">
                      {mode === 'login' && (
                        <>
                          Don't have an account?{' '}
                          <button
                            type="button"
                            onClick={() => switchMode('register')}
                            className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
                          >
                            Sign up free
                          </button>
                        </>
                      )}
                      {mode === 'register' && (
                        <>
                          Already have an account?{' '}
                          <button
                            type="button"
                            onClick={() => switchMode('login')}
                            className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
                          >
                            Sign in
                          </button>
                        </>
                      )}
                      {mode === 'reset' && (
                        <button
                          type="button"
                          onClick={() => switchMode('login')}
                          className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
                        >
                          Back to sign in
                        </button>
                      )}
                    </div>

                    {/* Quick Demo Access (preview & QA builds only — the server
                        endpoint 404s in production, so never advertise it there).
                        Each button signs in through the real preview identity
                        endpoint; a failure is reported, never replaced by a
                        locally fabricated session. Roles come only from the
                        server allowlist (PREVIEW_*_EMAILS). */}
                    {!import.meta.env.PROD && (
                    <div className="mt-6 pt-5 border-t border-border">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted text-center mb-2.5">
                        Instant Demo Access (Local / QA)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={loading}
                          onClick={() => void handleDemoAccess('candidate@ime365.com')}
                        >
                          Candidate Demo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={loading}
                          onClick={() => void handleDemoAccess('admin@ime365.com')}
                        >
                          Admin Demo
                        </Button>
                      </div>
                    </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
