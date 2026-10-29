/** Create/edit one tracker record. Conflict review is explicit; no blind retry on a new revision. */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  changedFields, createTrackedJob, EMPTY_TRACKER_FIELDS, FIELD_LIMITS, fieldsOf, INTERVIEW_FORMATS, INTERVIEW_ROUNDS,
  normalizeTrackerFields, stageLabel, TRACKER_STAGES, TrackerError, updateTrackedJob, validateTracker, WORK_MODES,
  type TrackedJob, type TrackerErrors, type TrackerFieldName, type TrackerFields, type TrackerStatus,
} from '@/lib/job-tracker';

export interface TrackerFormRequest { mode: 'create' | 'edit'; job: TrackedJob | null; initialStatus?: TrackerStatus; focus?: 'interview' }
interface TrackerFormDialogProps {
  open: boolean;
  request: TrackerFormRequest;
  onOpenChange: (open: boolean) => void;
  onSaved: (job: TrackedJob, mode: 'create' | 'edit') => void;
  onUnchanged: () => void;
  onMissing: (job: TrackedJob) => void;
  /** Must return authoritative data, not merely start a background request. */
  onConflict: (job: TrackedJob) => Promise<TrackedJob | null>;
  onCloseAutoFocus?: (event: Event) => void;
}
const FIELD_ORDER: TrackerFieldName[] = ['title', 'company', 'location', 'workMode', 'salary', 'url', 'status', 'dateApplied', 'deadline', 'contactPerson', 'contactEmail', 'interviewRound', 'interviewFormat', 'interviewAt', 'interviewLink', 'notes'];
const fieldId = (name: TrackerFieldName) => `tracker-field-${name}`;
const selectClass = 'h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 aria-[invalid=true]:border-error-500';

export function TrackerFormDialog({ open, request, onOpenChange, onSaved, onUnchanged, onMissing, onConflict, onCloseAutoFocus }: TrackerFormDialogProps) {
  const { mode, job } = request;
  const [baseline, setBaseline] = useState<TrackerFields>(() => job ? fieldsOf(job) : { ...EMPTY_TRACKER_FIELDS, status: request.initialStatus ?? 'wishlist' });
  const [draft, setDraft] = useState<TrackerFields>(() => job && request.focus === 'interview' ? { ...fieldsOf(job), status: 'interview' } : baseline);
  const [revision, setRevision] = useState(job?.revision ?? 1);
  const [errors, setErrors] = useState<TrackerErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<TrackedJob | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const interviewRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = (name: TrackerFieldName) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };
  const focusField = (name: TrackerFieldName) => formRef.current?.querySelector<HTMLElement>(`#${fieldId(name)}`)?.focus();
  const reviewConflict = async () => {
    if (!job || checkingConflict) return;
    setCheckingConflict(true);
    try {
      const latest = await onConflict(job);
      if (!mounted.current) return;
      if (!latest) { setMissing(true); setFormError('This job was removed elsewhere. These changes cannot be saved.'); onMissing(job); return; }
      setConflict(latest);
      setFormError('This job changed elsewhere. Review the latest version below. Your draft is preserved; nothing has been saved over it.');
    } catch {
      if (mounted.current) setFormError('The record changed elsewhere, but its latest version could not be loaded. Your draft is safe. Retry the review before saving.');
    } finally { if (mounted.current) setCheckingConflict(false); }
  };
  const acceptLatest = () => {
    if (!conflict) return;
    const edits = changedFields(baseline, draft);
    const latestFields = fieldsOf(conflict);
    setDraft({ ...latestFields, ...edits });
    setBaseline(latestFields);
    setRevision(conflict.revision);
    setConflict(null);
    setFormError(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current || missing || conflict || checkingConflict) return;
    const normalized = normalizeTrackerFields(draft);
    const found = validateTracker(normalized);
    const invalid = FIELD_ORDER.filter((name) => found[name]);
    setErrors(found);
    if (invalid.length) { setFormError(`Check the ${invalid.length} highlighted ${invalid.length === 1 ? 'field' : 'fields'}.`); focusField(invalid[0]); return; }
    const changes = mode === 'edit' ? changedFields(baseline, normalized) : normalized;
    if (mode === 'edit' && !Object.keys(changes).length) { onUnchanged(); return; }
    busyRef.current = true; setBusy(true); setFormError(null);
    try {
      const saved = mode === 'edit' && job ? await updateTrackedJob(job, changes, revision) : await createTrackedJob(normalized);
      if (mounted.current) onSaved(saved, mode);
    } catch (error) {
      if (!mounted.current) return;
      const failure = error instanceof TrackerError ? error : new TrackerError('The tracker could not be reached. Your form values are preserved.', 'unavailable');
      if (failure.kind === 'conflict') await reviewConflict();
      else if (failure.kind === 'not-found' && job) { setMissing(true); setFormError('This job is no longer in your tracker. These changes cannot be saved.'); onMissing(job); }
      else setFormError(failure.message);
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const common = (name: TrackerFieldName) => ({
    id: fieldId(name), value: draft[name], onChange: update(name), disabled: busy || missing,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
  });
  // No maxLength: over-limit input must show an error, not be silently truncated.
  const textField = (name: TrackerFieldName, label: string, options: { required?: boolean; type?: string; autoComplete?: string; placeholder?: string; inputMode?: 'url' | 'email' } = {}) => (
    <Field name={name} label={label} required={options.required} error={errors[name]}>
      <Input {...common(name)} type={options.type ?? 'text'} autoComplete={options.autoComplete ?? 'off'} inputMode={options.inputMode}
        placeholder={options.placeholder} aria-required={options.required || undefined} error={Boolean(errors[name])} />
    </Field>
  );
  const selectField = (name: TrackerFieldName, label: string, choices: ReadonlyArray<{ value: string; label: string }>, interview = false) => (
    <Field name={name} label={label} error={errors[name]}>
      <select {...common(name)} ref={interview ? interviewRef : undefined} className={selectClass}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
    </Field>
  );
  const optional = (values: readonly string[], none: string) => [{ value: '', label: none }, ...values.map((value) => ({ value, label: value }))];
  const title = mode === 'edit' && job ? `Edit ${job.title} at ${job.company}` : 'Track a job';
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busyRef.current || next) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl" onOpenAutoFocus={(event) => { if (request.focus === 'interview') { event.preventDefault(); interviewRef.current?.focus(); } }}
        onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug break-words">{title}</DialogTitle>
          <DialogDescription>Only you can see your tracker. Job title and company are required. Other details are optional.</DialogDescription>
        </DialogHeader>
        {formError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 p-3 text-sm text-error-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{formError}</span></div>}
        {conflict && <section aria-label="Latest version changed elsewhere" className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">
          <h3 className="font-semibold">Latest saved version · revision {conflict.revision}</h3>
          <p className="mt-1 break-words">{conflict.title} at {conflict.company} · {stageLabel(conflict.status)}</p>
          <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr]">
            {(Object.keys(changedFields(fieldsOf(conflict), draft)) as TrackerFieldName[]).map((key) => <div key={key} className="contents"><dt className="font-medium">{key}</dt><dd className="break-words">Saved: {fieldsOf(conflict)[key] || '(empty)'}</dd></div>)}
          </dl>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={acceptLatest}>Use latest version and keep my edits</Button>
          <p className="mt-2 text-xs">Then review the form and select Save changes. Your edits take precedence only after this explicit review.</p>
        </section>}
        {formError && !conflict && job && revision === job.revision && formError.includes('latest version could not') && <Button type="button" variant="outline" onClick={() => void reviewConflict()} disabled={checkingConflict}>Retry latest-version review</Button>}
        <form ref={formRef} noValidate onSubmit={submit} aria-label={title} aria-busy={busy || undefined} className="min-w-0 space-y-5">
          <Section legend="Job">
            {textField('title', 'Job title', { required: true, autoComplete: 'organization-title' })}
            {textField('company', 'Company', { required: true, autoComplete: 'organization' })}
            {textField('location', 'Location')}
            {selectField('workMode', 'Work mode', optional(WORK_MODES, 'Not specified'))}
            {textField('salary', 'Salary or range', { placeholder: 'e.g. ₹18–22 LPA' })}
            {textField('url', 'Job posting link', { type: 'url', inputMode: 'url', placeholder: 'https://' })}
          </Section>
          <Section legend="Progress" columns={3}>
            {selectField('status', 'Stage', TRACKER_STAGES.map((stage) => ({ value: stage.id, label: stage.label })))}
            {textField('dateApplied', 'Date applied', { type: 'date' })}
            {textField('deadline', 'Apply by', { type: 'date' })}
          </Section>
          <Section legend="Contact">
            {textField('contactPerson', 'Contact name')}
            {textField('contactEmail', 'Contact email', { type: 'email', inputMode: 'email' })}
          </Section>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold text-ink">Interview</legend>
            {draft.status === 'interview' ? <>
              <p className="mb-3 text-xs text-ink-muted">Entering Interviewing does not schedule a round. Leave these fields empty until confirmed. This tracker stores one round per job; saving changes replaces those details. Time is saved as a wall-clock time without a time zone.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectField('interviewRound', 'Round', optional(INTERVIEW_ROUNDS, 'Not scheduled'), true)}
                {selectField('interviewFormat', 'Format', optional(INTERVIEW_FORMATS, 'Not specified'))}
                {textField('interviewAt', 'Date and time', { type: 'datetime-local' })}
                {textField('interviewLink', 'Meeting link', { type: 'url', inputMode: 'url', placeholder: 'https://' })}
              </div>
              <p className="mt-2 text-xs text-ink-muted">Calendar downloads use a documented 60-minute default duration. Confirm the time zone with your contact.</p>
            </> : <p className="text-sm text-ink-muted">Choose the Interviewing stage to schedule a round. Any previously saved interview details are retained.</p>}
          </fieldset>
          <Field name="notes" label="Notes" error={errors.notes} wide>
            <Textarea {...common('notes')} rows={4} error={Boolean(errors.notes)} aria-describedby={cn(errors.notes && `${fieldId('notes')}-error`, `${fieldId('notes')}-count`)} />
            <p id={`${fieldId('notes')}-count`} className="mt-1 text-xs text-ink-muted">{draft.notes.length} of {FIELD_LIMITS.notes} characters</p>
          </Field>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>Cancel</Button></DialogClose>
            <Button type="submit" disabled={busy || missing || Boolean(conflict) || checkingConflict} aria-busy={busy || undefined}>{busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add to tracker'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Section({ legend, columns = 2, children }: { legend: string; columns?: 2 | 3; children: ReactNode }) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-sm font-semibold text-ink">{legend}</legend><div className={cn('grid gap-3', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>{children}</div></fieldset>;
}
function Field({ name, label, required, error, wide, children }: { name: TrackerFieldName; label: string; required?: boolean; error?: string; wide?: boolean; children: ReactNode }) {
  return <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
    <label htmlFor={fieldId(name)} className="mb-1.5 block text-sm font-medium text-ink">{label}{required && <> <span className="text-xs font-normal text-ink-muted">(required)</span></>}</label>
    {children}{error && <p id={`${fieldId(name)}-error`} className="mt-1 text-xs font-medium text-error-700">{error}</p>}
  </div>;
}
