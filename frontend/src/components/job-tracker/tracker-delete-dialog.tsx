/**
 * Remove a job from the tracker (Radix dialog). Removing it does not withdraw an
 * application the candidate has sent, and the dialog says so. If the job changed
 * in another tab or device, its latest version is shown before removing it.
 */
import { useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { deleteTrackedJob, stageLabel, TrackerError, type TrackedJob } from '@/lib/job-tracker';
import { progressDate } from '@/lib/job-tracker-display';

interface TrackerDeleteDialogProps {
  job: TrackedJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `alreadyGone`: another tab or device removed it first. */
  onDeleted: (job: TrackedJob, alreadyGone: boolean) => void;
  /** Reloads the tracker and returns this job's latest version, or null when it is gone. */
  onConflict: (job: TrackedJob) => Promise<TrackedJob | null>;
  onCloseAutoFocus?: (event: Event) => void;
}

export function TrackerDeleteDialog({ job, open, onOpenChange, onDeleted, onConflict, onCloseAutoFocus }: TrackerDeleteDialogProps) {
  const [current, setCurrent] = useState(job);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const progress = progressDate(current);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await deleteTrackedJob(current);
      onDeleted(current, false);
    } catch (failure) {
      const kind = failure instanceof TrackerError ? failure.kind : 'unavailable';
      if (kind === 'not-found') {
        onDeleted(current, true);
      } else if (kind === 'conflict') {
        const latest = await onConflict(current);
        if (latest) {
          setCurrent(latest);
          setError('This job was changed in another tab or device. Its latest details are shown below; remove it again if you still want to.');
        } else {
          onDeleted(current, true);
        }
      } else {
        setError(failure instanceof Error ? failure.message : 'The job tracker could not be reached, so nothing was removed. Try again.');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busyRef.current || next) onOpenChange(next); }}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">Remove this job from your tracker?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-ink">{current.title}</span> at <span className="font-medium text-ink">{current.company}</span> will be removed from your tracker. This can’t be undone, and it doesn’t withdraw an application you have sent.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-canvas-soft p-3 text-sm">
          <dt className="text-ink-muted">Stage</dt>
          <dd className="text-ink">{stageLabel(current.status)}</dd>
          {progress && (
            <>
              <dt className="text-ink-muted">Date</dt>
              <dd className="text-ink"><time dateTime={progress.dateTime}>{progress.label}</time></dd>
            </>
          )}
        </dl>
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
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={() => void confirm()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
            {busy ? 'Removing…' : 'Remove job'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
