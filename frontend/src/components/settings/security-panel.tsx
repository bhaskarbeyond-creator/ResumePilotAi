/**
 * Settings → Security & 2FA.
 *
 * Firebase sessions: the password form re-authenticates with the current
 * password before changing it (lib/session-security.ts), and enrolled second
 * factors can be removed through POST /api/users-data/mfa/disable, which needs
 * a sign-in from the last 10 minutes and signs every session out.
 * Preview sessions (non-production only) have no password and no second
 * factor; the cards say so instead of offering controls that cannot work.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, LogIn, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MfaEnrollmentPanel } from '@/components/auth/mfa-enrollment-panel';
import { isFirebaseConfigured } from '@/lib/firebase';
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
import {
  PASSWORD_MIN_LENGTH,
  PasswordChangeError,
  changePassword,
  readSessionSecurity,
  signInMethodName,
  type SessionSecurity,
} from '@/lib/session-security';
import { useAuth } from '@/providers/auth-provider';

export function SecurityPanel() {
  // Read once per visit: the session cannot change without leaving this page.
  const [security] = useState<SessionSecurity>(readSessionSecurity);
  return (
    <div className="space-y-6">
      <PasswordCard security={security} />
      <TwoFactorCard security={security} />
    </div>
  );
}

function PasswordCard({ security }: { security: SessionSecurity }) {
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

function PasswordForm() {
  const { signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  useRestoreFocusWhenIdle(busy, submitRef);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const found: typeof errors = {};
    if (!current) found.current = 'Enter your current password.';
    if (next.length < PASSWORD_MIN_LENGTH) found.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    else if (next === current) found.next = 'Choose a password that differs from your current one.';
    if (!found.next && confirm !== next) found.confirm = 'The passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) {
      setNotice({ tone: 'error', text: 'Your password was not changed. Fix the highlighted fields.' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setNeedsSignIn(false);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setNotice({ tone: 'success', text: 'Your password was changed.' });
    } catch (error) {
      const failure = error instanceof PasswordChangeError ? error : new PasswordChangeError('PASSWORD_CHANGE_FAILED', 'Your password could not be changed. Try again.');
      setNeedsSignIn(failure.needsRecentSignIn);
      setNotice({ tone: 'error', text: failure.message });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, set: (value: string) => void, error: string | undefined, autoComplete: string) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <Input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        error={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => set(event.target.value)}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-error-700">{error}</p>}
    </div>
  );

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Change password">
      <CardContent className="space-y-4">
        {field('settings-current-password', 'Current password', current, setCurrent, errors.current, 'current-password')}
        {field('settings-new-password', 'New password', next, setNext, errors.next, 'new-password')}
        {field('settings-confirm-password', 'Confirm new password', confirm, setConfirm, errors.confirm, 'new-password')}
        <NoticeRegions notice={notice} />
        {needsSignIn && (
          <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
            <LogIn className="size-4" aria-hidden="true" />
            Sign in again
          </Button>
        )}
      </CardContent>
      <CardFooter>
        <Button ref={submitRef} type="submit" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
          {busy ? 'Changing password…' : 'Change password'}
        </Button>
      </CardFooter>
    </form>
  );
}

function TwoFactorCard({ security }: { security: SessionSecurity }) {
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
          // Enrolment used to be a dead end here: the panel could remove a factor and had no way
          // to add one. It is now the real flow, with the "no identity provider" case stated
          // rather than hidden (`MfaEnrollmentPanel`, `tests/mfa-panel.spec.ts`).
          <MfaEnrollmentPanel available={isFirebaseConfigured()} accountName={security.accountName ?? 'your account'} />
        ) : (
          <>
            <p className="text-sm text-ink-secondary">
              Two-factor authentication is on. Enrolled {security.factors.length === 1 ? 'factor' : 'factors'}:
            </p>
            <ul className="space-y-2">
              {security.factors.map((factor) => (
                <li key={factor.uid} className="rounded-lg border border-border bg-surface p-3 text-sm text-ink">
                  <span className="font-medium">{factor.label}</span>
                  {factor.enrolledAt && (
                    <span className="block text-xs text-ink-muted">Added {new Date(factor.enrolledAt).toLocaleDateString()}</span>
                  )}
                </li>
              ))}
            </ul>
            <DisableTwoFactorDialog factorCount={security.factors.length} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type DisablePhase = 'confirm' | 'busy' | 'done' | 'sign-in' | 'failed';

function DisableTwoFactorDialog({ factorCount }: { factorCount: number }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DisablePhase>('confirm');
  const [message, setMessage] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);

  // The footer actions change with the outcome; keep focus on the next step.
  useEffect(() => {
    if (phase === 'done' || phase === 'sign-in') primaryRef.current?.focus();
  }, [phase]);

  const onOpenChange = (next: boolean) => {
    if (phase === 'busy') return;
    if (next) {
      setPhase('confirm');
      setMessage('');
    }
    setOpen(next);
  };

  const run = async () => {
    if (phase === 'busy') return;
    setPhase('busy');
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
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ShieldOff className="size-4" aria-hidden="true" />
          Turn off two-factor authentication
        </Button>
      </DialogTrigger>
      <DialogContent onEscapeKeyDown={(event) => { if (phase === 'busy') event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{phase === 'done' ? 'Two-factor authentication is off' : 'Turn off two-factor authentication?'}</DialogTitle>
          <DialogDescription>
            {phase === 'done'
              ? 'Sign in again to keep using your account.'
              : `This removes ${factorCount === 1 ? 'your second factor' : `all ${factorCount} second factors`} and signs out every session. Your account will be protected by your password only.`}
          </DialogDescription>
        </DialogHeader>
        <NoticeRegions notice={message ? { tone: phase === 'done' ? 'success' : 'error', text: message } : null} />
        <DialogFooter className="gap-2">
          {phase === 'done' || phase === 'sign-in' ? (
            <Button ref={primaryRef} type="button" onClick={() => void signOut()}>
              <LogIn className="size-4" aria-hidden="true" />
              Sign in again
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} aria-disabled={phase === 'busy' || undefined}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={() => void run()} aria-disabled={phase === 'busy' || undefined} aria-busy={phase === 'busy' || undefined}>
                {phase === 'busy' ? 'Turning off…' : 'Turn off'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
