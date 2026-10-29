/**
 * Settings → Security & 2FA.
 *
 * The session is described from the identity provider, re-read on every visit
 * (lib/session-security.ts refreshSessionSecurity), never from a stale copy:
 *  - Firebase sessions: the password form re-authenticates with the current
 *    password before changing it; an account protected by an authenticator
 *    app confirms that step with a code. Enrolled second factors can be
 *    removed through POST /api/users-data/mfa/disable, which needs a sign-in
 *    from the last 10 minutes (403 RECENT_AUTH_REQUIRED otherwise) and signs
 *    every session out.
 *  - Preview sessions (non-production only) have no password and no second
 *    factor; the cards say so instead of offering controls that cannot work.
 *  - When the session cannot be confirmed, nothing is offered or implied.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react';
import { Eye, EyeOff, KeyRound, LogIn, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { useRestoreFocusWhenIdle } from '@/hooks/use-restore-focus-when-idle';
import { disableTwoFactor, toAccountError } from '@/lib/account-settings';
import { MfaChallengeError, sanitizeMfaCode, isValidMfaCode, type MfaChallenge } from '@/lib/mfa';
import {
  PASSWORD_MIN_LENGTH,
  PasswordChangeError,
  assessPasswordStrength,
  changePassword,
  completePasswordChangeWithTotp,
  readSessionSecurity,
  refreshSessionSecurity,
  signInMethodName,
  validatePasswordChange,
  type PasswordChangeErrors,
  type SessionSecurity,
} from '@/lib/session-security';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

const PREVIEW_SECURITY_NOTICE = 'Password and 2FA settings are disabled in preview sessions.';

export function SecurityPanel() {
  // A Firebase session is re-read from the provider before anything is shown.
  const [security, setSecurity] = useState<SessionSecurity | null>(() => {
    const initial = readSessionSecurity();
    return initial.kind === 'firebase' ? null : initial;
  });
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try {
      setSecurity(await refreshSessionSecurity());
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void refreshSessionSecurity().then((next) => { if (!cancelled) setSecurity(next); });
    return () => { cancelled = true; };
  }, []);

  if (!security) {
    return (
      <Card aria-busy="true">
        <CardContent className="py-6">
          <p className="text-sm text-ink-muted">Checking your sign-in security…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {security.kind === 'preview' && (
        <div id="settings-security-preview-notice" className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{PREVIEW_SECURITY_NOTICE}</span>
        </div>
      )}
      {security.kind === 'unavailable' && <UnavailableCard checking={checking} onRetry={() => void refresh()} />}
      {security.kind !== 'unavailable' && (
        <>
          <PasswordCard security={security} />
          <TwoFactorCard security={security} onChanged={() => void refresh()} />
        </>
      )}
    </div>
  );
}

function UnavailableCard({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  const { signOut } = useAuth();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-ink-muted" aria-hidden="true" />
          Sign-in security
        </CardTitle>
        <CardDescription>Your password and two-factor settings could not be confirmed right now.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-ink-secondary">
          Nothing can be changed until your sign-in is confirmed. Try again, or sign in again if your session has ended.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry} aria-busy={checking || undefined}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {checking ? 'Checking…' : 'Try again'}
          </Button>
          <Button type="button" size="sm" onClick={() => void signOut()}>
            <LogIn className="size-4" aria-hidden="true" />
            Sign in again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard({ security }: { security: Exclude<SessionSecurity, { kind: 'unavailable' }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-ink-muted" aria-hidden="true" />
          Password
        </CardTitle>
        <CardDescription>Change the password you use to sign in.</CardDescription>
      </CardHeader>
      {security.kind === 'preview' ? (
        <CardContent>
          <p className="text-sm text-ink-secondary">
            This session uses a preview identity, which exists only outside production. Preview identities have no
            password, so there is nothing to change here.
          </p>
        </CardContent>
      ) : security.hasPassword ? (
        <PasswordForm />
      ) : (
        <CardContent>
          <p className="text-sm text-ink-secondary">
            You sign in with {security.signInMethods.map(signInMethodName).join(' or ')}. This account has no separate
            password; manage your password with that provider.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function PasswordField({ id, label, value, onChange, error, autoComplete, describedBy, inputRef }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: string;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          error={Boolean(error)}
          className="pr-10"
          aria-describedby={[describedBy, errorId].filter(Boolean).join(' ') || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={`Show ${label.toLowerCase()}`}
          aria-controls={id}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {error && <p id={errorId} className="mt-1 text-xs font-medium text-error-700">{error}</p>}
    </div>
  );
}

function PasswordStrengthMeter({ id, password }: { id: string; password: string }) {
  if (!password) {
    return <p id={id} className="text-xs text-ink-muted">Use at least {PASSWORD_MIN_LENGTH} characters. Longer is stronger.</p>;
  }
  const strength = assessPasswordStrength(password);
  const tone = !strength.meetsPolicy ? 'bg-error-500' : strength.score <= 1 ? 'bg-error-500' : strength.score === 2 ? 'bg-warning-500' : 'bg-success-500';
  return (
    <div id={id} className="space-y-1.5 text-xs">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={cn('h-1.5 flex-1 rounded-full', strength.meetsPolicy && step <= strength.score ? tone : 'bg-canvas-soft')} />
        ))}
      </div>
      <p className={strength.meetsPolicy ? 'text-ink-secondary' : 'font-medium text-error-700'}>
        {strength.meetsPolicy
          ? `Meets the minimum of ${PASSWORD_MIN_LENGTH} characters. Strength estimate: ${strength.label}.`
          : `Does not meet the minimum of ${PASSWORD_MIN_LENGTH} characters.`}
      </p>
      {strength.meetsPolicy && strength.suggestions.length > 0 && (
        <ul className="list-disc pl-4 text-ink-muted">
          {strength.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
        </ul>
      )}
      <p className="text-ink-muted">The estimate is calculated on this device; your password is not sent anywhere to check it.</p>
    </div>
  );
}

type PasswordStep = { step: 'form' } | { step: 'second-factor'; challenge: MfaChallenge; factorUid: string };

function PasswordForm() {
  const { signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<PasswordChangeErrors & { code?: string }>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [step, setStep] = useState<PasswordStep>({ step: 'form' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const strengthId = useId();
  useRestoreFocusWhenIdle(busy, submitRef);

  useEffect(() => {
    if (step.step === 'second-factor') codeRef.current?.focus();
  }, [step]);

  const clearSecrets = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setCode('');
  };

  const fail = (error: unknown) => {
    if (error instanceof MfaChallengeError) {
      setNotice({ tone: 'error', text: error.message });
      if (error.restartRequired) {
        setStep({ step: 'form' });
        setCode('');
      }
      return;
    }
    const failure = error instanceof PasswordChangeError ? error : new PasswordChangeError('PASSWORD_CHANGE_FAILED', 'Your password could not be changed. Try again.');
    setNeedsSignIn(failure.needsRecentSignIn);
    setNotice({ tone: 'error', text: failure.message });
  };

  const run = async (work: () => Promise<void>) => {
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setNeedsSignIn(false);
    try {
      await work();
    } catch (error) {
      fail(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const succeed = () => {
    clearSecrets();
    setErrors({});
    setStep({ step: 'form' });
    setNotice({ tone: 'success', text: 'Your password was changed.' });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (step.step === 'second-factor') {
      const clean = sanitizeMfaCode(code);
      if (!isValidMfaCode(clean)) {
        setErrors({ code: 'Enter the 6-digit code from your authenticator app.' });
        setNotice({ tone: 'error', text: 'Your password was not changed. Enter the 6-digit code.' });
        codeRef.current?.focus();
        return;
      }
      setErrors({});
      await run(async () => {
        await completePasswordChangeWithTotp(step.challenge, step.factorUid, clean, next);
        succeed();
      });
      return;
    }
    const found = validatePasswordChange({ current, next, confirm });
    setErrors(found);
    if (Object.keys(found).length) {
      setNotice({ tone: 'error', text: 'Your password was not changed. Fix the highlighted fields.' });
      return;
    }
    await run(async () => {
      const result = await changePassword(current, next);
      if (result.status === 'changed') {
        succeed();
        return;
      }
      const totp = result.challenge.factors.find((factor) => factor.kind === 'totp');
      if (!totp) throw new PasswordChangeError('SECOND_FACTOR_UNSUPPORTED', 'Your account\'s second step cannot confirm a password change on this page.');
      setCode('');
      setStep({ step: 'second-factor', challenge: result.challenge, factorUid: totp.uid });
      setNotice({ tone: 'info', text: 'Your current password was accepted. Enter the code from your authenticator app to finish.' });
    });
  };

  const cancelSecondFactor = () => {
    if (busyRef.current) return;
    // Security-sensitive cancellation: no password stays in memory.
    clearSecrets();
    setErrors({});
    setStep({ step: 'form' });
    setNotice({ tone: 'info', text: 'Password change cancelled. Your password was not changed.' });
  };

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Change password">
      <CardContent className="space-y-4">
        {step.step === 'form' ? (
          <>
            <PasswordField id="settings-current-password" label="Current password" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" />
            <PasswordField id="settings-new-password" label="New password" value={next} onChange={setNext} error={errors.next} autoComplete="new-password" describedBy={strengthId} />
            <PasswordStrengthMeter id={strengthId} password={next} />
            <PasswordField id="settings-confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
          </>
        ) : (
          <div>
            <label htmlFor="settings-password-mfa-code" className="mb-1.5 block text-sm font-medium text-ink">Authenticator app code</label>
            <Input
              ref={codeRef}
              id="settings-password-mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              error={Boolean(errors.code)}
              aria-describedby={['settings-password-mfa-hint', errors.code ? 'settings-password-mfa-error' : ''].filter(Boolean).join(' ')}
              onChange={(event) => setCode(sanitizeMfaCode(event.target.value))}
            />
            <p id="settings-password-mfa-hint" className="mt-1 text-xs text-ink-muted">Your account uses two-factor authentication, so changing the password needs the 6-digit code.</p>
            {errors.code && <p id="settings-password-mfa-error" className="mt-1 text-xs font-medium text-error-700">{errors.code}</p>}
          </div>
        )}
        <NoticeRegions notice={notice} />
        {needsSignIn && (
          <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
            <LogIn className="size-4" aria-hidden="true" />
            Sign in again
          </Button>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button ref={submitRef} type="submit" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          {busy ? 'Changing password…' : step.step === 'second-factor' ? 'Verify and change password' : 'Change password'}
        </Button>
        {step.step === 'second-factor' && (
          <Button type="button" variant="ghost" onClick={cancelSecondFactor} aria-disabled={busy || undefined}>Cancel</Button>
        )}
      </CardFooter>
    </form>
  );
}

function TwoFactorCard({ security, onChanged }: { security: Exclude<SessionSecurity, { kind: 'unavailable' }>; onChanged: () => void }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-ink-muted" aria-hidden="true" />
          Two-factor authentication
        </CardTitle>
        <CardDescription>A second step, such as an authenticator app code, when you sign in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {security.kind === 'preview' ? (
          <p className="text-sm text-ink-secondary">
            Two-factor authentication is managed by Firebase Authentication. This preview session has no Firebase
            identity, so there are no second factors to manage.
          </p>
        ) : security.factors.length === 0 ? (
          <p className="text-sm text-ink-secondary">
            Two-factor authentication is not set up for your account. Setting up an authenticator app is not available on
            this page.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-secondary">
              Two-factor authentication is on. Enrolled {security.factors.length === 1 ? 'factor' : 'factors'}:
            </p>
            <ul className="space-y-2" aria-label="Enrolled second factors">
              {security.factors.map((factor) => (
                <li key={factor.uid} className="rounded-lg border border-border bg-surface p-3 text-sm text-ink">
                  <span className="font-medium">{factor.label}</span>
                  <span className="block text-xs text-ink-muted">
                    {factor.kind === 'totp' ? 'Authenticator app' : factor.kind === 'phone' ? 'Text message' : 'Other method'}
                    {factor.enrolledAt && !Number.isNaN(new Date(factor.enrolledAt).getTime()) && ` · added ${new Date(factor.enrolledAt).toLocaleDateString()}`}
                  </span>
                </li>
              ))}
            </ul>
            <DisableTwoFactorDialog
              factorCount={security.factors.length}
              onDisabled={() => {
                setNotice({ tone: 'success', text: 'Two-factor authentication was turned off. Every session was signed out; sign in again to continue.' });
                onChanged();
              }}
            />
          </>
        )}
        <NoticeRegions notice={notice} />
      </CardContent>
    </Card>
  );
}

type DisablePhase = 'confirm' | 'busy' | 'done' | 'sign-in' | 'failed';

function DisableTwoFactorDialog({ factorCount, onDisabled }: { factorCount: number; onDisabled: () => void }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DisablePhase>('confirm');
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // The footer actions change with the outcome; keep focus on the next step.
  useEffect(() => {
    if (phase === 'done' || phase === 'sign-in') primaryRef.current?.focus();
  }, [phase]);

  const onOpenChange = (next: boolean) => {
    if (busyRef.current) return;
    if (next) {
      setPhase('confirm');
      setMessage('');
    } else if (phase === 'done') {
      // Refresh the card from the provider only once the user has read the outcome.
      onDisabled();
    }
    setOpen(next);
  };

  const run = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('busy');
    setMessage('');
    try {
      const removed = await disableTwoFactor();
      setMessage(`Removed ${removed} ${removed === 1 ? 'factor' : 'factors'}. Every session was signed out, including this one.`);
      setPhase('done');
    } catch (error) {
      const failure = toAccountError(error);
      setMessage(failure.needsRecentSignIn
        ? 'For your security, turning off two-factor authentication needs a sign-in from the last 10 minutes. Sign in again, then return here.'
        : `Two-factor authentication was not turned off. ${failure.message}`);
      setPhase(failure.needsRecentSignIn ? 'sign-in' : 'failed');
    } finally {
      busyRef.current = false;
    }
  };

  const busy = phase === 'busy';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ShieldOff className="size-4" aria-hidden="true" />
          Turn off two-factor authentication
        </Button>
      </DialogTrigger>
      <DialogContent
        role="alertdialog"
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busyRef.current) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{phase === 'done' ? 'Two-factor authentication is off' : 'Turn off two-factor authentication?'}</DialogTitle>
          <DialogDescription>
            {phase === 'done'
              ? 'Sign in again to keep using your account.'
              : `This removes ${factorCount === 1 ? 'your second factor' : `all ${factorCount} second factors`} and signs out every active session, including this one. Your account will be protected by your password only.`}
          </DialogDescription>
        </DialogHeader>
        <NoticeRegions notice={message ? { tone: phase === 'done' ? 'success' : 'error', text: message } : null} />
        <DialogFooter className="gap-2">
          {phase === 'done' || phase === 'sign-in' ? (
            <>
              {phase === 'sign-in' && <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>}
              <Button ref={primaryRef} type="button" onClick={() => void signOut()}>
                <LogIn className="size-4" aria-hidden="true" />
                Sign in again
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} aria-disabled={busy || undefined}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={() => void run()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
                {busy ? 'Turning off…' : 'Turn off'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
