/**
 * Add or edit a tracked job (Radix dialog).
 *
 * Every field the server stores can be entered and changed here. An edit sends
 * only the changed fields with the revision it started from. If the job changed
 * in another tab or device (409), the candidate's edits stay in the form and the
 * newer revision is adopted, so saving again applies them on top of it.
 */
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type Ref } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  changedFields, createTrackedJob, EMPTY_TRACKER_FIELDS, FIELD_LIMITS, fieldsOf, INTERVIEW_FORMATS, INTERVIEW_ROUNDS,
  TRACKER_STAGES, TrackerError, updateTrackedJob, validateTracker, WORK_MODES,
  type TrackedJob, type TrackerErrors, type TrackerFieldName, type TrackerFields, type TrackerStatus,
} from '@/lib/job-tracker';

export interface TrackerFormRequest {
  mode: 'create' | 'edit';
  job: TrackedJob | null;
  initialStatus?: TrackerStatus;
  /** Open with the interview fields focused ("Schedule interview"). */
  focus?: 'interview';
}

interface TrackerFormDialogProps {
  open: boolean;
  request: TrackerFormRequest;
  onOpenChange: (open: boolean) => void;
  onSaved: (job: TrackedJob, mode: 'create' | 'edit') => void;
  onUnchanged: () => void;
  onMissing: (job: TrackedJob) => void;
  onConflict: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

const FIELD_ORDER: TrackerFieldName[] = [
  'title', 'company', 'location', 'workMode', 'salary', 'url', 'status', 'dateApplied', 'deadline',
  'contactPerson', 'contactEmail', 'interviewRound', 'interviewFormat', 'interviewAt', 'interviewLink', 'notes',
];

const fieldId = (name: TrackerFieldName) => `tracker-field-${name}`;
const selectClass = 'h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 aria-[invalid=true]:border-error-500';

export function TrackerFormDialog({ open, request, onOpenChange, onSaved, onUnchanged, onMissing, onConflict, onCloseAutoFocus }: TrackerFormDialogProps) {
  const { mode, job } = request;
  const [baseline] = useState<TrackerFields>(() => (job ? fieldsOf(job) : { ...EMPTY_TRACKER_FIELDS, status: request.initialStatus ?? 'wishlist' }));
  const [draft, setDraft] = useState<TrackerFields>(baseline);
  const [revision, setRevision] = useState(job?.revision ?? 1);
  const [errors, setErrors] = useState<TrackerErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const interviewRef = useRef<HTMLSelectElement>(null);

  const update = (name: TrackerFieldName) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const focusField = (name: TrackerFieldName) => {
    formRef.current?.querySelector<HTMLElement>(`#${fieldId(name)}`)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current || missing) return;
    const found = validateTracker(draft);
    const invalid = FIELD_ORDER.filter((name) => found[name]);
    setErrors(found);
    if (invalid.length) {
      setFormError(invalid.length === 1 ? 'Check the highlighted field.' : `Check the ${invalid.length} highlighted fields.`);
      focusField(invalid[0]);
      return;
    }
    let changes: Partial<TrackerFields> | null = null;
    if (mode === 'edit' && job) {
      changes = changedFields(baseline, draft);
      if (!Object.keys(changes).length) {
        onUnchanged();
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const saved = mode === 'edit' && job && changes
        ? await updateTrackedJob(job, changes, revision)
        : await createTrackedJob(draft);
      onSaved(saved, mode);
    } catch (error) {
      const failure = error instanceof TrackerError ? error : new TrackerError('The job tracker could not be reached, so nothing was changed. Try again.', 'unavailable');
      if (failure.kind === 'conflict') {
        if (failure.remoteRevision) setRevision(failure.remoteRevision);
        setFormError('This job was changed in another tab or device. Your edits are still here: select Save changes to apply them on top of the latest version, or Cancel to discard them.');
        onConflict();
      } else if (failure.kind === 'not-found' && job) {
        setMissing(true);
        setFormError('This job is no longer in your tracker, so these changes can’t be saved.');
        onMissing(job);
      } else {
        setFormError(failure.message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const describedBy = (name: TrackerFieldName, extra?: string) => [extra, errors[name] ? `${fieldId(name)}-error` : undefined].filter(Boolean).join(' ') || undefined;
  const common = (name: TrackerFieldName) => ({
    id: fieldId(name),
    value: draft[name],
    onChange: update(name),
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': describedBy(name),
  });
  const textField = (name: TrackerFieldName, label: string, options: { required?: boolean; type?: string; autoComplete?: string; placeholder?: string; wide?: boolean; inputMode?: 'url' | 'email' } = {}) => (
    <Field name={name} label={label} required={options.required} error={errors[name]} wide={options.wide}>
      <Input
        {...common(name)}
        type={options.type ?? 'text'}
        maxLength={FIELD_LIMITS[name]}
        autoComplete={options.autoComplete ?? 'off'}
        inputMode={options.inputMode}
        placeholder={options.placeholder}
        aria-required={options.required || undefined}
        error={Boolean(errors[name])}
      />
    </Field>
  );
  const selectField = (name: TrackerFieldName, label: string, choices: ReadonlyArray<{ value: string; label: string }>, ref?: Ref<HTMLSelectElement>) => (
    <Field name={name} label={label} error={errors[name]}>
      <select {...common(name)} ref={ref} className={selectClass}>
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </Field>
  );
  const optional = (values: readonly string[], none: string) => [{ value: '', label: none }, ...values.map((value) => ({ value, label: value }))];
  const title = mode === 'edit' && job ? `Edit ${job.title} at ${job.company}` : 'Track a job';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busyRef.current || next) onOpenChange(next); }}>
      <DialogContent
        className="max-w-2xl"
        onOpenAutoFocus={(event) => {
          if (request.focus === 'interview') {
            event.preventDefault();
            interviewRef.current?.focus();
          }
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug break-words">{title}</DialogTitle>
          <DialogDescription>
            Only you can see your tracker. Job title and company are required; everything else is optional.
          </DialogDescription>
        </DialogHeader>
        <div role="alert" className={cn('empty:hidden', formError && 'flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 p-3 text-sm text-error-700')}>
          {formError && (
            <>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </>
          )}
        </div>
        <form ref={formRef} noValidate onSubmit={submit} aria-label={title} className="min-w-0 space-y-5">
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
            {textField('contactPerson', 'Contact name', { autoComplete: 'off' })}
            {textField('contactEmail', 'Contact email', { type: 'email', inputMode: 'email' })}
          </Section>
          <Section legend="Interview">
            {selectField('interviewRound', 'Round', optional(INTERVIEW_ROUNDS, 'Not set'), interviewRef)}
            {selectField('interviewFormat', 'Format', optional(INTERVIEW_FORMATS, 'Not set'))}
            {textField('interviewAt', 'Date and time', { type: 'datetime-local' })}
            {textField('interviewLink', 'Meeting link', { type: 'url', inputMode: 'url', placeholder: 'https://' })}
          </Section>
          <Field name="notes" label="Notes" error={errors.notes} wide>
            <Textarea
              {...common('notes')}
              rows={4}
              maxLength={FIELD_LIMITS.notes}
              aria-describedby={describedBy('notes', `${fieldId('notes')}-count`)}
              error={Boolean(errors.notes)}
            />
            <p id={`${fieldId('notes')}-count`} className="mt-1 text-xs text-ink-muted">{draft.notes.length} of {FIELD_LIMITS.notes} characters</p>
          </Field>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" aria-disabled={busy || missing || undefined} aria-busy={busy || undefined}>
              {busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add to tracker'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ legend, columns = 2, children }: { legend: string; columns?: 2 | 3; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-ink">{legend}</legend>
      <div className={cn('grid gap-3', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>{children}</div>
    </fieldset>
  );
}

function Field({ name, label, required, error, wide, children }: { name: TrackerFieldName; label: string; required?: boolean; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <label htmlFor={fieldId(name)} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <>{' '}<span className="text-xs font-normal text-ink-muted">(required)</span></>}
      </label>
      {children}
      {error && <p id={`${fieldId(name)}-error`} className="mt-1 text-xs font-medium text-error-700">{error}</p>}
    </div>
  );
}
