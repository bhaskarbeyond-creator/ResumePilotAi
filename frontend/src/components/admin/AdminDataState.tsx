/**
 * The three panels every administrative surface must be able to render.
 *
 * They exist so "no data yet", "the server said no" and "the server said there is nothing"
 * cannot be confused with one another — historically each tab invented its own empty state,
 * and several fell back to sample rows. Colour, spacing and type come from design tokens
 * only, so light, dark and high-contrast themes need no per-panel overrides.
 *
 * Accessibility contract:
 *   - loading is announced politely (`role="status"`, `aria-live="polite"`);
 *   - failure is announced assertively (`role="alert"`) and states the request id, so an
 *     operator can quote it without opening devtools;
 *   - the retry control is a real button, reachable by keyboard, first in tab order within
 *     the panel.
 */

import { AlertOctagon, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminResourceError } from './admin-data-state';

/** Standalone loading panel for surfaces that are not a table. */
export function AdminLoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border bg-surface p-8 text-center"
    >
      <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-600" />
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

/**
 * Failure panel. `message` is the server's own sentence when it sent one; the code and the
 * request id are always printed, because a failure an operator cannot quote is a failure
 * that never gets fixed.
 */
export function AdminErrorPanel({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: AdminResourceError;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-error-200 bg-error-50 p-6 text-error-900 dark:border-error-800 dark:bg-error-950 dark:text-error-100"
    >
      <div className="flex items-start gap-3">
        <AlertOctagon className="mt-0.5 size-5 shrink-0 text-error-600 dark:text-error-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-1 text-xs text-error-800 dark:text-error-200">{error.message}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-2xs text-error-700 dark:text-error-300">
            <div className="flex gap-1">
              <dt className="font-semibold">Code</dt>
              <dd className="font-mono">{error.code}</dd>
            </div>
            {error.httpStatus !== null && (
              <div className="flex gap-1">
                <dt className="font-semibold">HTTP</dt>
                <dd className="font-mono">{error.httpStatus}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt className="font-semibold">Request</dt>
              <dd className="font-mono">{error.requestId ?? 'not provided'}</dd>
            </div>
          </dl>
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <RefreshCw className="mr-1.5 size-4" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty panel. Distinct from failure on purpose: "the server answered and there is nothing"
 * is good news on the attention page and neutral on the directory, and neither is an error.
 */
export function AdminEmptyPanel({
  title,
  description,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'success';
}) {
  const success = tone === 'success';
  return (
    <div
      className={
        success
          ? 'rounded-xl border border-success-200 bg-success-50 p-8 text-center text-success-800 dark:border-success-800 dark:bg-success-950 dark:text-success-100'
          : 'rounded-xl border border-border bg-surface p-8 text-center'
      }
    >
      <Inbox
        className={
          success
            ? 'mx-auto mb-2 size-8 text-success-600 dark:text-success-400'
            : 'mx-auto mb-2 size-8 text-ink-muted'
        }
      />
      <h3 className="text-base font-bold">{title}</h3>
      <p className={success ? 'mt-1 text-xs text-success-700 dark:text-success-300' : 'mt-1 text-xs text-ink-muted'}>
        {description}
      </p>
    </div>
  );
}
