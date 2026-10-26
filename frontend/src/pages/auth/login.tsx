/**
 * Login / Registration Page
 *
 * Handles email/password sign-in, registration, OAuth, and password reset.
 * Preserves the existing backend's Firebase Auth identity contract.
 */

import { useState, type FormEvent } from 'react';
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
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { get, post } from '@/lib/api-client';
import { PreviewLoginError, requestPreviewLogin } from '@/lib/preview-session';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { getMfaResolver, completeMfaSignIn, type MfaResolverState } from '@/lib/mfa';

type AuthMode = 'login' | 'register' | 'reset';

/** Only same-origin application paths are accepted as a post-login destination. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  return raw;
}

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

/** Persist the names typed at registration through the real profile contract. */
async function saveRegistrationProfile(firstname: string, lastname: string): Promise<void> {
  if (!firstname && !lastname) return;
  const current = await get<{ user?: { revision?: number } }>('/users-data/profile').catch(() => null);
  await post('/users-data/profile', {
    profile: { firstname, lastname },
    expectedRevision: Number(current?.user?.revision ?? 0),
  });
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('next'));
  // Without a configured Firebase identity provider (local / QA / certification
  // environments) the same form authenticates through the backend preview
  // identity endpoint, which answers 404 unless the non-production verifier is on.
  const usePreviewIdentity = !isFirebaseConfigured();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mfaResolverState, setMfaResolverState] = useState<MfaResolverState | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  /** Sign in (or register) through the backend preview identity endpoint. */
  const completePreviewSignIn = async () => {
    const name = firstName ? `${firstName} ${lastName}`.trim() : undefined;
    await requestPreviewLogin({ email, password, ...(name ? { name } : {}) });
    if (mode === 'register') {
      await saveRegistrationProfile(firstName.trim(), lastName.trim()).catch(() => {
        console.warn('Profile details will be completed from Settings');
      });
    }
    // Full navigation so the auth provider re-reads and verifies the new session.
    window.location.assign(returnTo);
  };

  /** Non-production QA shortcut: real preview login for a known demo identity. */
  const handleDemoAccess = async (demoEmail: string) => {
    clearMessages();
    setLoading(true);
    try {
      await requestPreviewLogin({ email: demoEmail, password: oneTimePreviewSecret() });
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof PreviewLoginError ? err.message : 'Demo sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      if (mode === 'reset') {
        if (usePreviewIdentity) {
          setError('Password reset is not available in this environment.');
          return;
        }
        await sendPasswordResetEmail(auth, email);
        setSuccess('Password reset email sent. Check your inbox.');
        setLoading(false);
        return;
      }

      // Test accounts on the reserved .test domain (RFC 2606) use the preview
      // identity even where Firebase is configured: no real address can end in
      // .test, and the endpoint answers 404 unless the backend's non-production
      // verifier is on. A prefix such as "p002." is not used, because a real
      // address can start with it.
      if (usePreviewIdentity || email.endsWith('.test')) {
        await completePreviewSignIn();
        return;
      }

      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await saveRegistrationProfile(firstName.trim(), lastName.trim()).catch(() => {
          // Non-blocking: the profile can be completed from Settings.
          console.warn('Profile details will be completed from Settings');
        });
        if (credential.user) {
          navigate(returnTo, { replace: true });
        }
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (credential.user) {
          navigate(returnTo, { replace: true });
        }
      }
    } catch (err: unknown) {
      if (err instanceof PreviewLoginError) {
        setError(err.message);
        return;
      }
      const mfa = getMfaResolver(err);
      if (mfa) {
        setMfaResolverState(mfa);
        setMfaCode('');
        setLoading(false);
        return;
      }
      const firebaseError = err as { code?: string; message?: string };
      const code = firebaseError.code ?? '';

      // Local development & QA hosts that are not in Firebase's authorised
      // domains can still authenticate through the preview identity endpoint
      // (404 unless the backend's non-production verifier is enabled).
      if (code === 'auth/unauthorized-domain') {
        try {
          await completePreviewSignIn();
          return;
        } catch (previewErr) {
          if (previewErr instanceof PreviewLoginError && previewErr.status !== 404) {
            setError(previewErr.message);
            return;
          }
        }
      }

      const friendlyMessages: Record<string, string> = {
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/not-configured': 'Authentication is not configured in this environment.',
        'auth/unauthorized-domain': `The current domain (${typeof window !== 'undefined' ? window.location.hostname : 'domain'}) is not authorized in Firebase. Please add it to Authorized domains in Firebase Console.`,
      };
      setError(friendlyMessages[code] ?? firebaseError.message ?? 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!googleProvider) {
      setError('Google sign-in is not available in this environment.');
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        navigate(returnTo, { replace: true });
      }
    } catch (err: unknown) {
      const mfa = getMfaResolver(err);
      if (mfa) {
        setMfaResolverState(mfa);
        setMfaCode('');
        setLoading(false);
        return;
      }
      const firebaseError = err as { code?: string; message?: string };
      if (firebaseError.code !== 'auth/popup-closed-by-user') {
        if (firebaseError.code === 'auth/unauthorized-domain') {
          setError(`Sign-in domain (${typeof window !== 'undefined' ? window.location.hostname : 'domain'}) is not authorized in Firebase. Please add it to Firebase Console > Authentication > Settings > Authorized domains.`);
        } else {
          setError(firebaseError.message ?? 'Google sign-in failed.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaResolverState || mfaCode.length !== 6) return;
    clearMessages();
    setLoading(true);

    try {
      const credential = await completeMfaSignIn(mfaResolverState, mfaCode);
      if (credential.user) {
        setSuccess('Two-factor authentication verified. Welcome back!');
        setTimeout(() => {
          navigate(returnTo, { replace: true });
        }, 300);
      }
    } catch (err: unknown) {
      console.error('[MFA Verification Error]:', err);
      const firebaseError = err as { code?: string; message?: string };
      setError(
        firebaseError.code === 'auth/invalid-verification-code'
          ? 'Invalid 6-digit verification code. Please check your authenticator app and try again.'
          : firebaseError.message ?? 'MFA verification failed. Please check your authenticator code and try again.'
      );
      setMfaCode('');
    } finally {
      setLoading(false);
    }
  };

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
      <div className="flex flex-1 items-center justify-center bg-canvas p-4 sm:p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center justify-center lg:hidden">
            <Link to="/" className="flex min-h-11 items-center gap-2 no-underline">
              <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 font-bold text-white text-sm">
                IM
              </div>
              <span className="text-lg font-bold text-ink">IME365</span>
            </Link>
          </div>

          <main id="main-content" className="w-full" role="main">
            <h1 className="sr-only">{mode === 'login' ? 'Sign in to IME365' : mode === 'register' ? 'Create your IME365 account' : 'Reset your password'}</h1>
            <Card className="border-0 shadow-xl lg:border">
              <CardHeader className="space-y-1 px-4 pb-4 sm:px-5">
                {/* h2, not CardTitle: the page heading is the sr-only h1 above, and jumping
                      from h1 to h3 is an axe `heading-order` violation. */}
                  <h2 className="text-xl font-semibold leading-tight tracking-tight text-ink sm:text-2xl">{mfaResolverState
                    ? 'Two-Factor Authentication'
                    : mode === 'login'
                    ? 'Welcome back'
                    : mode === 'register'
                    ? 'Create your account'
                    : 'Reset password'}</h2>
                <CardDescription>
                  {mfaResolverState
                    ? 'Enter the 6-digit code from your authenticator app to complete sign-in'
                    : mode === 'login'
                    ? 'Sign in to your IME365 account'
                    : mode === 'register'
                    ? 'Start building your career today'
                    : 'Enter your email to receive a reset link'}
                </CardDescription>
              </CardHeader>

              <CardContent className="px-4 pt-0 sm:px-5">
              {/* Error message */}
              {error && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success message */}
              {success && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700" role="status">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {mfaResolverState ? (
                /* Two-Factor Authentication (TOTP 2FA) Form */
                <form onSubmit={handleMfaSubmit} className="space-y-4" autoComplete="one-time-code">
                  <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-center">
                    <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                      <ShieldCheck className="size-6" />
                    </div>
                    <h3 className="text-base font-bold text-ink">Two-Factor Authentication 🛡️</h3>
                    <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                      Enter the 6-digit verification code from your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.) to complete sign-in.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="mfa-code" className="mb-1.5 block text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Authenticator Code
                    </label>
                    <Input
                      id="mfa-code"
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      maxLength={6}
                      placeholder="123456"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="text-center font-mono text-2xl tracking-[0.4em] h-14 bg-surface"
                      autoComplete="one-time-code"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    loading={loading}
                    disabled={mfaCode.length !== 6 || loading}
                    id="btn-verify-mfa"
                  >
                    Verify &amp; Sign In ✓
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-xs text-ink-muted hover:text-ink"
                    onClick={() => {
                      setMfaResolverState(null);
                      setMfaCode('');
                      clearMessages();
                    }}
                  >
                    ← Back to Login
                  </Button>
                </form>
              ) : (
                <>
                  {/* OAuth buttons */}
                  {mode !== 'reset' && isFirebaseConfigured() && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleGoogleSignIn}
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
                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    {mode === 'register' && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-ink">
                            First name
                          </label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                            <Input
                              id="firstName"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              placeholder="John"
                              className="pl-9"
                              autoComplete="given-name"
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
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="min-h-11 min-w-0 pl-9"
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    {mode !== 'reset' && (
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2">
                          <label htmlFor="password" className="text-sm font-medium text-ink">
                            Password
                          </label>
                          {mode === 'login' && (
                            <button
                              type="button"
                              onClick={() => { setMode('reset'); clearMessages(); }}
                              className="inline-flex min-h-11 items-center text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="min-h-11 min-w-0 pl-9 pr-10"
                            required
                            minLength={6}
                            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            // 44x44 minimum: axe flags this control as `target-size` at 320px
                            // otherwise, and it is the one control a person with a motor
                            // impairment must hit to check what they typed.
                            className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <Button type="submit" className="w-full min-h-11" loading={loading} size="lg">
                      {mode === 'login' && 'Sign in'}
                      {mode === 'register' && 'Create account'}
                      {mode === 'reset' && 'Send reset link'}
                      <ArrowRight className="size-4" />
                    </Button>
                  </form>

                  {/* Mode switch */}
                  <div className="mt-4 text-center text-sm text-ink-muted">
                    {mode === 'login' && (
                      <>
                        Don't have an account?{' '}
                        <button
                          onClick={() => { setMode('register'); clearMessages(); }}
                          className="inline-flex min-h-11 items-center font-medium text-brand-600 transition-colors hover:text-brand-700"
                        >
                          Sign up free
                        </button>
                      </>
                    )}
                    {mode === 'register' && (
                      <>
                        Already have an account?{' '}
                        <button
                          onClick={() => { setMode('login'); clearMessages(); }}
                          className="inline-flex min-h-11 items-center font-medium text-brand-600 transition-colors hover:text-brand-700"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                    {mode === 'reset' && (
                      <button
                        onClick={() => { setMode('login'); clearMessages(); }}
                        className="inline-flex min-h-11 items-center font-medium text-brand-600 transition-colors hover:text-brand-700"
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted text-center mb-2.5">
                      Instant Demo Access (Local / QA)
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 text-xs"
                        disabled={loading}
                        onClick={() => handleDemoAccess('candidate@ime365.com')}
                      >
                        Candidate Demo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 text-xs"
                        disabled={loading}
                        onClick={() => handleDemoAccess('admin@ime365.com')}
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
