/**
 * The second-factor challenge — the screen shown when Firebase answers
 * `auth/multi-factor-auth-required`.
 *
 * ## Why it is a component rather than a branch inside `pages/auth/login`
 *
 * The panel could only be reached by completing a password sign-in against a **configured Firebase
 * project** with an enrolled factor, so nothing in the fast tier or the browser tier could render
 * it. Extracting it means the screen is exercised directly (`tests/mfa-panel.spec.ts` mounts it in
 * a test harness at five device classes, and `tests/unit/mfa-panel.test.tsx` covers its state
 * machine) while the *flow* — actually resolving a challenge with Firebase — stays named as the
 * one thing still unproven (`OI-UX-11` carries the command that proves it).
 *
 * ## Keyboard contract
 *
 * | Key | Behaviour |
 * |---|---|
 * | (on mount) | the code input takes focus, so a person who just typed a password can type six digits |
 * | digits | kept; anything else is dropped, and the field never exceeds six characters |
 * | `Enter` | submits once six digits are present; before that the primary action is disabled, so `Enter` does nothing |
 * | `Shift+Tab` from the code field | reaches "Back to sign-in", which cancels the challenge |
 *
 * The header uses `h2`, not `h3`: the panel replaces the sign-in form under the page's `h1`, and
 * `h3` under an `h1` is a heading-order violation that axe rates serious.
 *
 * @module components/auth/mfa-challenge-panel
 */

import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface MfaChallengePanelProps {
  /** Current value of the code field (digits only, at most six). */
  code: string;
  /** Called with the sanitised value on every edit. */
  onCodeChange: (code: string) => void;
  /** Called when the form is submitted with a complete code. */
  onSubmit: () => void;
  /** Called by "Back to sign-in". */
  onCancel: () => void;
  /** True while the verification request is in flight. */
  loading?: boolean;
  /** Server-side rejection to show above the field, already human-readable. */
  error?: string | null;
}

/** Keep digits only, and never more than six — the length a TOTP code has. */
export function sanitiseCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function MfaChallengePanel({ code, onCodeChange, onSubmit, onCancel, loading = false, error = null }: MfaChallengePanelProps) {
  const complete = code.length === 6;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !loading) onSubmit();
      }}
      className="space-y-4"
      autoComplete="one-time-code"
      data-testid="mfa-challenge"
    >
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-center dark:border-brand-800 dark:bg-brand-950/40">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </div>
        <h2 className="text-base font-bold text-ink">Two-factor authentication</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-950/50 dark:text-error-200">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="mfa-code" className="mb-1.5 block text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Authenticator code
        </label>
        <Input
          id="mfa-code"
          type="text"
          inputMode="numeric"
          autoFocus
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(event) => onCodeChange(sanitiseCode(event.target.value))}
          className="h-14 bg-surface text-center font-mono text-2xl tracking-[0.4em]"
          autoComplete="one-time-code"
          aria-describedby="mfa-code-hint"
          required
        />
        <p id="mfa-code-hint" className="mt-1.5 text-center text-xs text-ink-muted">
          Six digits. The code changes every 30 seconds.
        </p>
      </div>

      <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!complete || loading} id="btn-verify-mfa">
        Verify and sign in
      </Button>

      <Button type="button" variant="ghost" className="w-full text-xs text-ink-muted hover:text-ink" onClick={onCancel}>
        Back to sign-in
      </Button>
    </form>
  );
}
