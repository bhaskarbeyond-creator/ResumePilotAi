/** Revision-checked deletion. A card is removed only after confirmed server success. */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteTrackedJob, stageLabel, TrackerError, type TrackedJob } from '@/lib/job-tracker';
import { progressDate } from '@/lib/job-tracker-display';

interface TrackerDeleteDialogProps {
  job: TrackedJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (job: TrackedJob, alreadyGone: boolean) => void;
  onConflict: (job: TrackedJob) => Promise<TrackedJob | null>;
  onCloseAutoFocus?: (event: Event) => void;
}
export function TrackerDeleteDialog({ job, open, onOpenChange, onDeleted, onConflict, onCloseAutoFocus }: TrackerDeleteDialogProps) {
  const [current, setCurrent] = useState(job);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const progress = progressDate(current);
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      await deleteTrackedJob(current);
      if (mounted.current) onDeleted(current, false);
    } catch (failure) {
      if (!mounted.current) return;
      const kind = failure instanceof TrackerError ? failure.kind : 'unavailable';
      if (kind === 'not-found') onDeleted(current, true);
      else if (kind === 'conflict') {
        try {
          const latest = await onConflict(current);
          if (!mounted.current) return;
          if (latest) { setCurrent(latest); setError('This job changed elsewhere. Its latest details are shown below. Confirm removal again only if you still want to delete this version.'); }
          else onDeleted(current, true);
        } catch {
          if (mounted.current) setError('This job changed elsewhere, but the latest version could not be loaded. Nothing was removed. Retry to review the current version.');
        }
      } else setError(failure instanceof Error ? failure.message : 'The tracker could not be reached. Nothing was removed.');
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busyRef.current || next) onOpenChange(next); }}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">Remove this job from your tracker?</DialogTitle>
          <DialogDescription><span className="font-medium text-ink">{current.title}</span> at <span className="font-medium text-ink">{current.company}</span> will be permanently removed from your tracker. This does not withdraw an application you sent.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-canvas-soft p-3 text-sm">
          <dt className="text-ink-muted">Stage</dt><dd className="text-ink">{stageLabel(current.status)}</dd>
          {progress && <><dt className="text-ink-muted">Date</dt><dd className="text-ink"><time dateTime={progress.dateTime}>{progress.label}</time></dd></>}
        </dl>
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 p-3 text-sm text-error-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild><Button ref={cancelRef} type="button" variant="outline" disabled={busy}>Cancel</Button></DialogClose>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={busy} aria-busy={busy || undefined}>{busy ? 'Removing…' : 'Confirm removal'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
