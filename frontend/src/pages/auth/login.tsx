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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { post } from '@/lib/api-client';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

type AuthMode = 'login' | 'register' | 'reset';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('next') || '/dashboard';

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setSuccess('Password reset email sent. Check your inbox.');
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        // Register the user profile on the backend
        try {
          await post('/users/profile', {
            firstName: firstName || 'User',
            lastName: lastName || '',
          });
        } catch {
          // Non-blocking: profile creation can be retried
          console.warn('Profile creation deferred');
        }
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
      const firebaseError = err as { code?: string; message?: string };
      const code = firebaseError.code ?? '';
      const friendlyMessages: Record<string, string> = {
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/not-configured': 'Authentication is not configured in this environment.',
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
      const firebaseError = err as { code?: string; message?: string };
      if (firebaseError.code !== 'auth/popup-closed-by-user') {
        setError(firebaseError.message ?? 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
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

          <Card className="border-0 shadow-xl lg:border">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl">
                {mode === 'login' && 'Welcome back'}
                {mode === 'register' && 'Create your account'}
                {mode === 'reset' && 'Reset password'}
              </CardTitle>
              <CardDescription>
                {mode === 'login' && 'Sign in to your IME365 account'}
                {mode === 'register' && 'Start building your career today'}
                {mode === 'reset' && 'Enter your email to receive a reset link'}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-0">
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
                  <div className="grid grid-cols-2 gap-3">
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
                          onClick={() => { setMode('reset'); clearMessages(); }}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
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
                        className="pl-9 pr-10"
                        required
                        minLength={6}
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" loading={loading} size="lg">
                  {mode === 'login' && 'Sign in'}
                  {mode === 'register' && 'Create account'}
                  {mode === 'reset' && 'Send reset link'}
                  <ArrowRight className="size-4" />
                </Button>
              </form>

              {/* Mode switch */}
              <div className="mt-6 text-center text-sm text-ink-muted">
                {mode === 'login' && (
                  <>
                    Don't have an account?{' '}
                    <button
                      onClick={() => { setMode('register'); clearMessages(); }}
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
                      onClick={() => { setMode('login'); clearMessages(); }}
                      className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
                    >
                      Sign in
                    </button>
                  </>
                )}
                {mode === 'reset' && (
                  <button
                    onClick={() => { setMode('login'); clearMessages(); }}
                    className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    Back to sign in
                  </button>
                )}
              </div>

              {/* Quick Demo Access (for preview & QA testing) */}
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
                    onClick={() => {
                      const demoUser = {
                        uid: 'demo-candidate-1',
                        email: 'candidate@ime365.com',
                        displayName: 'Alex Morgan',
                        role: 'CANDIDATE',
                      };
                      localStorage.setItem('ime_dev_user', JSON.stringify(demoUser));
                      window.location.href = returnTo;
                    }}
                  >
                    Candidate Demo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      const demoAdmin = {
                        uid: 'demo-admin-1',
                        email: 'admin@ime365.com',
                        displayName: 'Sarah Administrator',
                        role: 'ADMIN',
                      };
                      localStorage.setItem('ime_dev_user', JSON.stringify(demoAdmin));
                      window.location.href = returnTo;
                    }}
                  >
                    Admin Demo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
