/**
 * Withdraw a submitted application (Radix dialog). The server deletes the
 * application, so it leaves the employer's list of applicants; the dialog says
 * what that means for applying again. The Job Tracker is a separate list and is
 * not changed. A failure keeps the dialog open with the reason.
 */
import { useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { statusLabel, withdrawApplication, type Application, type WithdrawOutcome } from '@/lib/applications';
import { formatDay } from '@/lib/job-tracker-display';

interface WithdrawDialogProps {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWithdrawn: (application: Application, outcome: WithdrawOutcome) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function WithdrawDialog({ application, open, onOpenChange, onWithdrawn, onCloseAutoFocus }: WithdrawDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const { title, company, listed } = application.job;
  const sent = application.createdAt && !Number.isNaN(new Date(application.createdAt).getTime()) ? new Date(application.createdAt) : null;

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      onWithdrawn(application, await withdrawApplication(application));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your application couldn’t be withdrawn. Check your connection and try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busyRef.current || next) onOpenChange(next); }}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">Withdraw your application?</DialogTitle>
          <DialogDescription>
            Your application for <span className="font-medium text-ink">{title || 'this job'}</span>
            {company && <> at <span className="font-medium text-ink">{company}</span></>} will be removed from the
            employer’s list of applicants. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-canvas-soft p-3 text-sm">
          <dt className="text-ink-muted">Status</dt>
          <dd className="text-ink">{statusLabel(application.status)}</dd>
          {sent && (
            <>
              <dt className="text-ink-muted">Applied</dt>
              <dd className="text-ink"><time dateTime={application.createdAt}>{formatDay(sent)}</time></dd>
            </>
          )}
        </dl>
        <p className="text-sm text-ink-secondary">
          {listed
            ? 'You can apply again while the job is listed.'
            : 'The job is no longer listed, so you won’t be able to apply again.'}{' '}
          Your Job Tracker isn’t changed.
        </p>
        <div role="alert" className={cn('empty:hidden', error && 'flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 p-3 text-sm text-error-700')}>
          {error && (
            <>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline">Keep application</Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={() => void confirm()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
            {busy ? 'Withdrawing…' : 'Withdraw application'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
