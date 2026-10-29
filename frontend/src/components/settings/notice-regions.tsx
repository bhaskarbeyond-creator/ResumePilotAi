/**
 * Always-rendered live regions for a Settings card: a polite status for
 * success/info/warning and an assertive alert for errors. Both containers
 * exist before any message arrives, so screen readers announce changes
 * reliably, and an empty container takes no space (no margin, padding or
 * border). One notice is shown at a time, so a success and an error are never
 * announced together for the same operation. Actions that belong to a message
 * are rendered by the caller next to these regions, so only the message text
 * is announced.
 */
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Notice {
  /** `warning` is polite: the operation finished, with caveats the user must read. */
  tone: 'success' | 'info' | 'warning' | 'error';
  text: string;
}

// An empty region keeps its place in the accessibility tree but takes no space.
const EMPTY = 'empty:m-0 empty:border-0 empty:p-0';

export function NoticeRegions({ notice, className, idPrefix }: { notice: Notice | null; className?: string; idPrefix?: string }) {
  const polite = notice && notice.tone !== 'error' ? notice : null;
  const assertive = notice?.tone === 'error' ? notice : null;
  return (
    <>
      <div
        role="status"
        id={idPrefix ? `${idPrefix}-status` : undefined}
        className={cn(
          EMPTY,
          polite && 'flex items-start gap-2 rounded-lg border p-3 text-sm',
          polite?.tone === 'success' && 'border-success-200 bg-success-50 text-success-700',
          polite?.tone === 'info' && 'border-border bg-canvas-soft text-ink',
          polite?.tone === 'warning' && 'border-warning-200 bg-warning-50 text-warning-800',
          polite && className,
        )}
      >
        {polite && (
          <>
            {polite.tone === 'success'
              ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              : polite.tone === 'warning'
                ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                : <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{polite.text}</span>
          </>
        )}
      </div>
      <div
        role="alert"
        id={idPrefix ? `${idPrefix}-alert` : undefined}
        className={cn(EMPTY, assertive && 'flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700', assertive && className)}
      >
        {assertive && (
          <>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{assertive.text}</span>
          </>
        )}
      </div>
    </>
  );
}
