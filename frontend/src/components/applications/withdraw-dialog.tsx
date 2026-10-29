/** Accessible confirmation for the verified DELETE withdrawal contract. */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { statusLabel, withdrawApplication, type Application, type WithdrawOutcome } from '@/lib/applications';
import { appliedDate } from '@/lib/application-display';

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
  const mounted = useRef(true);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const sent = appliedDate(application);
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const outcome = await withdrawApplication(application);
      if (mounted.current) onWithdrawn(application, outcome);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Withdrawal could not be confirmed. Please retry.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busyRef.current || next) onOpenChange(next); }}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => { event.preventDefault(); confirmRef.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busyRef.current) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">Withdraw your application?</DialogTitle>
          <DialogDescription>
            Your application for <span className="font-medium text-ink">{application.job.title || 'this job'}</span>
            {application.job.company && <> at <span className="font-medium text-ink">{application.job.company}</span></>} will be removed from the employer’s list of applicants. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-canvas-soft p-3 text-sm">
          <dt className="text-ink-muted">Status</dt><dd className="text-ink">{statusLabel(application.status)}</dd>
          {sent && <><dt className="text-ink-muted">Applied</dt><dd className="text-ink"><time dateTime={sent.dateTime}>{sent.label.replace(/^Applied /, '')}</time></dd></>}
        </dl>
        <p className="text-sm text-ink-secondary">
          {application.job.listed ? 'You can submit a new application while the job is listed.' : 'The job is not currently listed, so a new application may not be possible.'} Your Job Tracker is not changed.
        </p>
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 p-3 text-sm text-error-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span>
        </div>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>Keep application</Button></DialogClose>
          <Button ref={confirmRef} type="button" variant="destructive" onClick={() => void confirm()} disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Withdrawing…' : 'Confirm withdrawal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
