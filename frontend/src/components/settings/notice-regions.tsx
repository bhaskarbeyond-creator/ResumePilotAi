/**
 * Always-rendered live regions for a Settings card: a polite status for
 * success/info and an assertive alert for errors. Both containers exist before
 * any message arrives, so screen readers announce changes reliably; an empty
 * container takes no space. Actions that belong to a message are rendered by
 * the caller next to these regions, so only the message text is announced.
 */
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Notice {
  tone: 'success' | 'info' | 'error';
  text: string;
}

export function NoticeRegions({ notice, className }: { notice: Notice | null; className?: string }) {
  const polite = notice && notice.tone !== 'error' ? notice : null;
  const assertive = notice?.tone === 'error' ? notice : null;
  return (
    <>
      <div
        role="status"
        className={cn(
          // An empty region keeps its place in the accessibility tree but takes no space.
          'empty:m-0',
          polite && 'flex items-start gap-2 rounded-lg border p-3 text-sm',
          polite?.tone === 'success' && 'border-success-200 bg-success-50 text-success-700',
          polite?.tone === 'info' && 'border-border bg-canvas-soft text-ink',
          polite && className,
        )}
      >
        {polite && (
          <>
            {polite.tone === 'success'
              ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              : <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{polite.text}</span>
          </>
        )}
      </div>
      <div
        role="alert"
        className={cn('empty:m-0', assertive && 'flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700', assertive && className)}
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
