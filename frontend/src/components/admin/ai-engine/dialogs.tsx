/**
 * Modal surfaces for the AI Multi-Provider Engine.
 *
 * Three popups exist because each one guards a real outcome:
 *   1. ConfirmDialog   — destructive/explicit-revoke actions (credential clear,
 *                        quota reset). Nothing destructive happens on click-through.
 *   2. ReauthDialog    — RECENT_AUTH_REQUIRED / SUPER_ADMIN_MFA_REQUIRED from the
 *                        server. It retries the EXACT pending operation and never
 *                        claims success on its own.
 *   3. ModelDetailDialog — full model id, provider, owner and discovery time for a
 *                        single discovered model.
 *
 * All three use the shared Radix dialog primitive, so focus is trapped, Escape
 * closes, and the accessible name/description are wired for screen readers.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Copy, KeyRound, ShieldAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from './primitives';
import type { ProviderId } from './registry';
import { providerMeta } from './registry';

/**
 * Restores keyboard focus to whatever opened the dialog.
 *
 * These dialogs are controlled from the section components (there is no
 * `DialogTrigger`), so Radix has no trigger to return focus to and the caret
 * would be dropped on `<body>` after Escape — a dead end for keyboard and
 * screen-reader operators. The refocus happens on the next frame so it wins
 * against Radix's own close-time focus handling.
 */
function useReturnFocus(open: boolean) {
  const previous = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      previous.current = active instanceof HTMLElement ? active : null;
      return;
    }
    const target = previous.current;
    if (!target || !target.isConnected) return;
    previous.current = null;
    const frame = requestAnimationFrame(() => target.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Reauthentication
// ──────────────────────────────────────────────────────────────────────────────

export interface PendingAuthOperation {
  kind: 'save' | 'test' | 'discover' | 'quota';
  label: string;
  provider?: ProviderId;
  detail?: string;
}

/**
 * Forces a fresh ID token. This is the strongest re-authentication the browser
 * can perform without the operator's password; if the server still rejects the
 * retry, the dialog says so instead of pretending the session was refreshed.
 */
export async function refreshSessionToken(): Promise<boolean> {
  try {
    const { auth } = await import('@/lib/firebase');
    const user = auth.currentUser;
    if (!user) return false;
    const token = await user.getIdToken(true);
    return Boolean(token);
  } catch {
    return false;
  }
}

export function ReauthDialog({
  open,
  operation,
  reasonCode,
  reasonMessage,
  onOpenChange,
  onRetry,
}: {
  open: boolean;
  operation: PendingAuthOperation | null;
  reasonCode?: string;
  reasonMessage?: string;
  onOpenChange: (open: boolean) => void;
  onRetry: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useReturnFocus(open);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const handleRetry = async () => {
    setBusy(true);
    setError(null);
    const refreshed = await refreshSessionToken();
    const ok = await onRetry();
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      return;
    }
    setError(
      refreshed
        ? 'The server rejected the retried request again. Sign out and sign back in to renew the session, then retry.'
        : 'No authenticated session was available to refresh. Sign out and sign back in, then retry.',
    );
  };

  const mfa = reasonCode === 'SUPER_ADMIN_MFA_REQUIRED';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="ai-engine-reauth-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mfa ? <ShieldAlert className="size-5 text-amber-600" aria-hidden="true" /> : <KeyRound className="size-5 text-amber-600" aria-hidden="true" />}
            {mfa ? 'Second factor required' : 'Reauthentication required'}
          </DialogTitle>
          <DialogDescription>
            {mfa
              ? 'Super Admin credential operations require a completed second factor. Enrol TOTP MFA and sign in again.'
              : 'The server requires a recent authentication for this sensitive AI governance operation.'}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 rounded-xl border border-border bg-canvas-soft/60 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="font-semibold text-ink-muted">Pending operation</dt>
            <dd className="font-bold text-ink">{operation?.label ?? 'Unknown'}</dd>
          </div>
          {reasonCode && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="font-semibold text-ink-muted">Server code</dt>
              <dd><StatusPill tone="degraded">{reasonCode}</StatusPill></dd>
            </div>
          )}
          {reasonMessage && (
            <div>
              <dt className="font-semibold text-ink-muted">Server message</dt>
              <dd className="mt-0.5 break-words text-ink-secondary">{reasonMessage}</dd>
            </div>
          )}
        </dl>

        {error && (
          <p role="alert" className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs font-medium text-error-700 dark:border-error-700/40 dark:bg-error-950/30 dark:text-error-200">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleRetry} loading={busy} data-testid="ai-engine-reauth-retry">
            Reauthenticate and retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Confirmation
// ──────────────────────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  busy,
  onOpenChange,
  onConfirm,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'warning' | 'primary';
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  useReturnFocus(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="ai-engine-confirm-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className={tone === 'danger' ? 'size-5 text-rose-600' : 'size-5 text-amber-600'}
              aria-hidden="true"
            />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={busy}
            data-testid="ai-engine-confirm-action"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Model detail
// ──────────────────────────────────────────────────────────────────────────────

export function ModelDetailDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: { id: string; name?: string; owned_by?: string; provider: ProviderId; source: string; fetchedAt?: string } | null;
}) {
  const [copied, setCopied] = useState(false);
  const meta = model ? providerMeta(model.provider) : undefined;
  useReturnFocus(open);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = async () => {
    if (!model) return;
    try {
      await navigator.clipboard.writeText(model.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="ai-engine-model-dialog">
        <DialogHeader>
          <DialogTitle className="break-all font-mono text-base">{model?.id ?? 'Model'}</DialogTitle>
          <DialogDescription>
            Discovered from {meta?.name ?? model?.provider ?? 'the provider'} — reported by the live catalogue response, not by this console.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-canvas-soft/60 p-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Provider</dt>
            <dd className="mt-0.5 font-semibold text-ink">{meta?.name ?? model?.provider}</dd>
          </div>
          <div className="rounded-lg border border-border bg-canvas-soft/60 p-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Owner</dt>
            <dd className="mt-0.5 font-semibold text-ink">{model?.owned_by || 'Not reported'}</dd>
          </div>
          <div className="rounded-lg border border-border bg-canvas-soft/60 p-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Source</dt>
            <dd className="mt-0.5 font-semibold text-ink">{model?.source ?? 'Not reported'}</dd>
          </div>
          <div className="rounded-lg border border-border bg-canvas-soft/60 p-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Discovered at</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {model?.fetchedAt ? new Date(model.fetchedAt).toLocaleString() : 'Not reported'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={model?.id ?? ''} aria-label="Model identifier" className="h-8 flex-1 font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="size-3.5" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy id'}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
