/**
 * Enrol an authenticator app as a second factor.
 *
 * ## What was missing before this round
 *
 * `components/settings/security-panel.tsx` could *remove* enrolled factors and could not add one:
 * it said, in a sentence, "Setting up an authenticator app is not available on this page." A
 * security setting you can turn off but not on is a one-way door, and the only way to enrol was to
 * ask someone with console access to do it for you.
 *
 * ## The states, and why each one is reachable in a test
 *
 * | State | When | What the person sees |
 * |---|---|---|
 * | `unavailable` | the build has no Firebase project (local, QA, certification) | why, and what to do instead — never a dead button |
 * | `idle` | Firebase configured, nothing started | the explanation and the primary action |
 * | `starting` | secret requested | the button shows a busy label |
 * | `scan` | secret issued | the secret, the `otpauth://` URI, and the code field |
 * | `verifying` | code submitted | busy, code field disabled |
 * | `done` | provider accepted | confirmation, and the panel stops inviting input |
 * | `error` | provider refused | the message, with the flow still usable |
 *
 * The QR image itself is not generated here: rendering a QR needs an encoder, and the two things a
 * person actually needs — the secret and the `otpauth://` URI — are text. A QR is a convenience,
 * and shipping an encoder to save six characters of typing is not worth the bundle.
 *
 * ## Keyboard contract (asserted in `tests/mfa-panel.spec.ts`)
 *
 * | Key | Behaviour |
 * |---|---|
 * | `Tab` from the primary action | reaches the secret, then the copy button, then the code field |
 * | `Enter` in the code field | confirms once six digits are present |
 * | `Escape` while enrolling | cancels and returns focus to the primary action |
 *
 * @module components/auth/mfa-enrollment-panel
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCopy, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { beginTotpEnrollment, completeTotpEnrollment, type MfaEnrollment } from '@/lib/mfa';
import { sanitiseCode } from '@/components/auth/mfa-challenge-panel';

/** What the panel knows how to do; injected so tests can drive every branch without Firebase. */
export interface MfaEnrollmentApi {
  begin: (accountName: string) => Promise<MfaEnrollment>;
  complete: (pending: unknown, code: string) => Promise<void>;
}

export interface MfaEnrollmentPanelProps {
  /** Whether the build has an identity provider that can enrol factors. */
  available: boolean;
  /** Account name shown inside the authenticator app. */
  accountName: string;
  /** Defaults to the real Firebase-backed calls. */
  api?: MfaEnrollmentApi;
  /** Called once the factor is live, so the settings page can refresh. */
  onEnrolled?: () => void;
}

type Phase = 'idle' | 'starting' | 'scan' | 'verifying' | 'done' | 'error';

const DEFAULT_API: MfaEnrollmentApi = {
  begin: (accountName) => beginTotpEnrollment(accountName),
  complete: (pending, code) => completeTotpEnrollment(pending, code),
};

export function MfaEnrollmentPanel({ available, accountName, api = DEFAULT_API, onEnrolled }: MfaEnrollmentPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  /** Set when a cancel should hand focus back to the primary action once it remounts. */
  const returnFocusOnIdle = useRef(false);

  // Once the secret exists, the next useful action is typing the code — put the caret there.
  useEffect(() => {
    if (phase === 'scan') codeRef.current?.focus();
  }, [phase]);

  // After a cancel the primary action is a *new* element (it is conditionally rendered), so
  // focusing the old ref in the handler is a no-op. Focus is restored here, once it exists.
  useEffect(() => {
    if (phase === 'idle' && returnFocusOnIdle.current) {
      returnFocusOnIdle.current = false;
      startRef.current?.focus();
    }
  }, [phase]);

  const start = useCallback(async () => {
    setPhase('starting');
    setMessage(null);
    try {
      const started = await api.begin(accountName);
      setEnrollment(started);
      setPhase('scan');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The authenticator app could not be set up.');
      setPhase('error');
    }
  }, [accountName, api]);

  const confirm = useCallback(async () => {
    if (!enrollment) return;
    setPhase('verifying');
    setMessage(null);
    try {
      await api.complete(enrollment.pending, code);
      setPhase('done');
      setCode('');
      onEnrolled?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That code could not be verified.');
      setPhase('error');
    }
  }, [api, code, enrollment, onEnrolled]);

  const cancel = useCallback(() => {
    setEnrollment(null);
    setCode('');
    setMessage(null);
    setCopied(false);
    returnFocusOnIdle.current = true;
    setPhase('idle');
  }, []);

  const copySecret = useCallback(async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
    } catch {
      // Clipboard permission is a browser policy, not an error the person can act on; the secret
      // is on screen and selectable either way.
      setCopied(false);
    }
  }, [enrollment]);

  if (!available) {
    return (
      <div data-testid="mfa-enrollment" data-phase="unavailable" className="space-y-3">
        <p className="text-sm text-ink-secondary">
          This build has no identity provider, so there is nowhere to store a second factor. In a
          deployment with Firebase Authentication configured, this panel issues a secret and
          confirms the first code from your authenticator app.
        </p>
        <p className="text-xs text-ink-muted">
          If you need a second factor today, ask an administrator to enrol the factor against your
          production account.
        </p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div data-testid="mfa-enrollment" data-phase="done" className="space-y-3" role="status">
        <p className="flex items-center gap-2 text-sm font-medium text-success-700 dark:text-success-300">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          Authenticator app enrolled. You will be asked for a code the next time you sign in.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="mfa-enrollment"
      data-phase={phase}
      className="space-y-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (phase === 'scan' || phase === 'error')) {
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {/* The start action is offered in `error` as well: a refusal from the provider is a
       * retryable state, and hiding the only button in it strands the person with a message. */}
      {phase === 'idle' || phase === 'starting' || (phase === 'error' && !enrollment) ? (
        <>
          <p className="text-sm text-ink-secondary">
            Add a code from an authenticator app as a second step when you sign in. You will need
            the app to hand the next time you sign in.
          </p>
          <Button ref={startRef} type="button" onClick={() => void start()} loading={phase === 'starting'}>
            {phase === 'starting' ? 'Preparing…' : 'Set up an authenticator app'}
          </Button>
        </>
      ) : null}

      {enrollment && (phase === 'scan' || phase === 'verifying' || phase === 'error') ? (
        <>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Your setup key</p>
            <code
              data-testid="mfa-secret"
              className="mt-1 block break-all font-mono text-sm text-ink"
            >
              {enrollment.secret}
            </code>
            <p className="mt-2 break-all text-xs text-ink-muted">{enrollment.uri}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" onClick={() => void copySecret()}>
              <ClipboardCopy aria-hidden="true" className="size-4" />
              {copied ? 'Copied' : 'Copy key'}
            </Button>
          </div>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.length === 6 && phase !== 'verifying') void confirm();
            }}
          >
            <label htmlFor="mfa-enroll-code" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Code from the app
            </label>
            <Input
              ref={codeRef}
              id="mfa-enroll-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              disabled={phase === 'verifying'}
              onChange={(event) => setCode(sanitiseCode(event.target.value))}
              className="text-center font-mono text-xl tracking-[0.3em]"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={code.length !== 6 || phase === 'verifying'} loading={phase === 'verifying'}>
                Confirm and turn on
              </Button>
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        </>
      ) : null}

      {message ? (
        <p role="alert" className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-950/50 dark:text-error-200">
          {message}
        </p>
      ) : null}

      {phase === 'idle' ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <ShieldCheck aria-hidden="true" className="size-4" />
          The key is shown once. Keep it somewhere safe until the app has it.
        </p>
      ) : null}
    </div>
  );
}
