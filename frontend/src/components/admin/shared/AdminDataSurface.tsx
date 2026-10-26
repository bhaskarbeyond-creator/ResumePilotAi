/**
 * The one way an admin surface renders data (REC-001).
 *
 * ## Why this component exists
 *
 * Eleven admin tabs carried fixtures (`DEFAULT_USERS`, `INITIAL_EVENTS`,
 * `DEFAULT_TICKETS`, `|| FALLBACK` numerics) and merged them into live data with
 * `if (data.length > 0) setData(data)`. The result was a screen that could not
 * distinguish "we have nothing" from "we could not reach the server" from "here is
 * production data" — and in the last case it showed a mixture, so a KPI could be
 * real while the row list beside it was invented.
 *
 * `AdminDataSurface` makes exactly one of four states render, and always states its
 * provenance:
 *
 * | state | rendered when | what the reader learns |
 * |---|---|---|
 * | `loading` | first fetch, no data yet | the screen is working |
 * | `error` | the fetch failed, or the response was rejected by its schema | the number is **unavailable**, not zero |
 * | `empty` | the fetch succeeded with an empty collection | zero is real |
 * | `live` | the fetch succeeded with data | here it is, from the API |
 *
 * A fifth state, `partial`, exists for surfaces assembled from several endpoints: it
 * renders what succeeded and names what did not, because hiding a failed panel is
 * how a dashboard quietly becomes a lie.
 *
 * ## Accessibility
 *
 * The provenance chip is inside an `aria-live="polite"` region, so a screen reader
 * announces a change from loading to live (or to error) without the user having to
 * re-read the page. The error state is a `role="alert"` with the retry action inside
 * it, so focus order reaches the fix.
 *
 * @module components/admin/shared/AdminDataSurface
 */

import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';

/** Where the data on screen came from. Never inferred; always passed in. */
export type Provenance = 'LIVE' | 'EMPTY' | 'UNAVAILABLE' | 'LOADING' | 'PARTIAL';

export interface AdminDataSurfaceProps {
  /** `'loading' | 'error' | 'empty' | 'live' | 'partial'` */
  status: 'loading' | 'error' | 'empty' | 'live' | 'partial';
  /** The rendered content, only shown when `status` is `live` or `partial`. */
  children?: ReactNode;
  /** What this surface is, used in the accessible name of every state. */
  label: string;
  /** Human-readable failure reason. Required when `status === 'error'`. */
  error?: string | null;
  /** Copy for the empty state. Must say what "empty" means for this surface. */
  emptyMessage?: string;
  /** Retry handler; rendered when the surface can be retried. */
  onRetry?: () => void;
  /** Panels that failed while others succeeded, for `status === 'partial'`. */
  failedPanels?: string[];
  /** Rendered next to the state, e.g. a filter bar that should stay usable. */
  toolbar?: ReactNode;
  className?: string;
}

const PROVENANCE_STYLE: Record<Provenance, string> = {
  LIVE: 'bg-success-50 text-success-700 border-success-100',
  EMPTY: 'bg-muted text-ink-secondary border-border',
  UNAVAILABLE: 'bg-error-50 text-error-700 border-error-100',
  LOADING: 'bg-info-50 text-info-700 border-info-100',
  PARTIAL: 'bg-warning-50 text-warning-700 border-warning-100',
};

/**
 * @param {AdminDataSurfaceProps} props
 */
export function AdminDataSurface({
  status,
  children,
  label,
  error,
  emptyMessage = 'No records match the current filters.',
  onRetry,
  failedPanels = [],
  toolbar,
  className = '',
}: AdminDataSurfaceProps) {
  const provenance: Provenance =
    status === 'live' ? 'LIVE'
      : status === 'empty' ? 'EMPTY'
        : status === 'error' ? 'UNAVAILABLE'
          : status === 'partial' ? 'PARTIAL'
            : 'LOADING';

  const retry = onRetry ? (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <RefreshCw className="size-4" aria-hidden="true" />
      Retry
    </button>
  ) : null;

  return (
    <section className={`space-y-3 ${className}`} aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          data-testid="admin-provenance"
          data-provenance={provenance}
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide ${PROVENANCE_STYLE[provenance]}`}
        >
          {provenance === 'LOADING' && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {provenance === 'UNAVAILABLE' && <WifiOff className="size-3" aria-hidden="true" />}
          {provenance === 'EMPTY' && <Inbox className="size-3" aria-hidden="true" />}
          {provenance === 'PARTIAL' && <AlertTriangle className="size-3" aria-hidden="true" />}
          {provenance}
        </span>
        {toolbar}
      </div>

      {status === 'loading' && (
        <div role="status" className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-border text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading {label.toLowerCase()}…
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="space-y-3 rounded-2xl border border-error-100 bg-error-50 p-4">
          <p className="text-sm font-semibold text-error-700">{label} could not be loaded.</p>
          <p className="text-sm text-ink-secondary">
            {error || 'The server did not return a usable response.'} This is not an empty result —
            no figure on this surface is known to be zero.
          </p>
          {retry}
        </div>
      )}

      {status === 'empty' && (
        <div className="space-y-3 rounded-2xl border border-dashed border-border p-6 text-center">
          <Inbox className="mx-auto size-6 text-ink-subtle" aria-hidden="true" />
          <p className="text-sm text-ink-secondary">{emptyMessage}</p>
          {retry}
        </div>
      )}

      {status === 'partial' && failedPanels.length > 0 && (
        <div role="status" className="rounded-2xl border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700">
          Showing what loaded. Unavailable: {failedPanels.join(', ')}.
          {retry && <span className="ml-2 inline-block">{retry}</span>}
        </div>
      )}

      {(status === 'live' || status === 'partial') && children}
    </section>
  );
}

export default AdminDataSurface;
