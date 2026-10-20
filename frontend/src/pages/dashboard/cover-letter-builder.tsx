/**
 * Cover Letter Builder — write, AI-draft, preview, save and export one letter.
 *
 * Routes (splat): /cover-letter, /cover-letter/new, /cover-letter/:id and the
 * legacy /coverletter/* aliases. `?role=&company=` (Job Tracker "linked cover
 * letter", DIR-020 AC-11) pre-fills the job title and company of a new letter.
 *
 * A new letter starts empty apart from the candidate's own profile details.
 * Nothing is saved until the candidate presses Save; AI drafts are inserted
 * only after an explicit request and never replace text without confirmation.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ClipboardCopy,
  Download,
  FileQuestion,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  AiUnavailableError,
  CoverLetterNotFoundError,
  TONE_OPTIONS,
  emptyCoverLetter,
  formatUpdated,
  generateCoverLetterDraft,
  getCoverLetter,
  keywordCoverage,
  letterTitle,
  loadProfilePrefill,
  saveCoverLetter,
  type CoverLetterRecord,
} from '@/lib/cover-letters';

type Phase = 'loading' | 'ready' | 'not-found' | 'error';
type Notice = { tone: 'success' | 'error'; text: string } | null;
type TextKey = Exclude<keyof CoverLetterRecord, 'id' | 'aiTone' | 'templateId' | 'updatedAt'>;
type FieldErrors = Partial<Record<TextKey, string>>;

const BODY_MAX = 20000;
const PRINT_FRAME_ID = 'cover-letter-print-frame';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldId = (field: TextKey) => `cover-letter-${field}`;
/** Comparable snapshot of the editable content (timestamps excluded). */
const snapshotOf = (record: CoverLetterRecord) => JSON.stringify({ ...record, updatedAt: undefined });

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

interface LetterParts {
  sender: string[];
  date: string;
  recipient: string[];
  subject: string;
  paragraphs: string[];
}

function letterParts(record: CoverLetterRecord): LetterParts {
  const place = (city: string, postal: string) => [city.trim(), postal.trim()].filter(Boolean).join(' ');
  return {
    sender: [
      `${record.candidateFirstname} ${record.candidateLastname}`.trim(),
      record.candidateAddress.trim(),
      place(record.candidateCity, record.candidatePostalCode),
      record.candidateEmail.trim(),
      record.candidatePhone.trim(),
    ].filter(Boolean),
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    recipient: [
      record.recipientName.trim(),
      record.companyName.trim(),
      record.companyAddress.trim(),
      place(record.companyCity, record.companyPostalCode),
    ].filter(Boolean),
    subject: record.jobTitle.trim() ? `Re: ${record.jobTitle.trim()}` : '',
    paragraphs: record.letterBody.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
  };
}

function letterPlainText(parts: LetterParts): string {
  return [parts.sender.join('\n'), parts.date, parts.recipient.join('\n'), parts.subject, ...parts.paragraphs]
    .filter(Boolean)
    .join('\n\n');
}

function fileNameFor(record: CoverLetterRecord): string {
  const slug = letterTitle(record).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `cover-letter-${slug || 'draft'}.txt`;
}

function validateForSave(record: CoverLetterRecord): FieldErrors {
  const errors: FieldErrors = {};
  if (!record.jobTitle.trim() && !record.companyName.trim() && !record.letterBody.trim()) {
    errors.jobTitle = 'Add a job title, company or letter text before saving.';
  }
  if (record.candidateEmail.trim() && !EMAIL_PATTERN.test(record.candidateEmail.trim())) {
    errors.candidateEmail = 'Enter a valid email address, for example name@example.com.';
  }
  return errors;
}

export function CoverLetterBuilderPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const segment = (params['*'] ?? '').split('/')[0] ?? '';
  const routeId = segment && segment !== 'new' ? decodeSegment(segment) : null;
  const roleParam = (searchParams.get('role') ?? '').slice(0, 200);
  const companyParam = (searchParams.get('company') ?? '').slice(0, 200);

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [record, setRecord] = useState<CoverLetterRecord>(() => emptyCoverLetter());
  const [baseline, setBaseline] = useState('');
  const [persisted, setPersisted] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [profileFilled, setProfileFilled] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');

  /** Id of a new letter that was just saved and is already in state. */
  const justSavedIdRef = useRef<string | null>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const keepTextRef = useRef<HTMLButtonElement>(null);
  useRestoreFocusWhenIdle(saving, saveButtonRef);
  useRestoreFocusWhenIdle(generating, generateButtonRef);

  // Load the requested letter, or prepare a new one with profile and deep-link context.
  useEffect(() => {
    if (routeId && justSavedIdRef.current === routeId) return;
    justSavedIdRef.current = null;
    let cancelled = false;
    setPhase('loading');
    setErrors({});
    setNotice(null);
    setView('edit');

    void (async () => {
      if (routeId) {
        try {
          const loaded = await getCoverLetter(routeId);
          if (cancelled) return;
          setRecord(loaded);
          setBaseline(snapshotOf(loaded));
          setPersisted(true);
          setLastSavedAt(loaded.updatedAt ?? null);
          setProfileFilled(false);
          setPhase('ready');
        } catch (error) {
          if (cancelled) return;
          if (error instanceof CoverLetterNotFoundError) {
            setPhase('not-found');
          } else {
            setLoadError(normalizeError(error).message || 'The cover letter could not be loaded.');
            setPhase('error');
          }
        }
        return;
      }

      const draft = emptyCoverLetter();
      draft.jobTitle = roleParam;
      draft.companyName = companyParam;
      const profile = await loadProfilePrefill();
      if (cancelled) return;
      const filled = Boolean(profile && Object.values(profile).some((value) => value.trim()));
      if (profile) Object.assign(draft, profile);
      setRecord(draft);
      setBaseline(snapshotOf(draft));
      setPersisted(false);
      setLastSavedAt(null);
      setProfileFilled(filled);
      setPhase('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [routeId, roleParam, companyParam, reloadKey]);

  const dirty = phase === 'ready' && snapshotOf(record) !== baseline;

  // Warn before closing or reloading the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Remove the print frame when leaving the builder.
  useEffect(() => () => document.getElementById(PRINT_FRAME_ID)?.remove(), []);

  const update = useCallback((field: TextKey, value: string) => {
    setRecord((previous) => ({ ...previous, [field]: value }));
    // The "needs a title, company or text" error is shown under Job title but
    // is satisfied by several fields, so editing any of them clears it.
    const cleared: TextKey[] = ['companyName', 'letterBody', 'jobDescription'].includes(field) ? [field, 'jobTitle'] : [field];
    setErrors((previous) => {
      if (!cleared.some((key) => previous[key])) return previous;
      const next = { ...previous };
      for (const key of cleared) delete next[key];
      return next;
    });
  }, []);

  const focusField = (field: TextKey) => {
    setView('edit');
    window.requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus());
  };

  const save = async () => {
    if (phase !== 'ready' || saving) return;
    const found = validateForSave(record);
    const firstInvalid = (Object.keys(found) as TextKey[])[0];
    if (firstInvalid) {
      setErrors(found);
      setNotice({ tone: 'error', text: 'The letter was not saved. Fix the highlighted field and try again.' });
      focusField(firstInvalid);
      return;
    }
    const sent = record;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await saveCoverLetter(sent);
      setBaseline(snapshotOf(sent));
      setLastSavedAt(saved.updatedAt ?? new Date().toISOString());
      setPersisted(true);
      setNotice({ tone: 'success', text: 'Cover letter saved.' });
      if (routeId !== sent.id) {
        justSavedIdRef.current = sent.id;
        navigate(`/cover-letter/${encodeURIComponent(sent.id)}`, { replace: true });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: `Your changes were not saved: ${normalizeError(error).message}` });
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S saves instead of opening the browser's "save page" dialog.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const generate = async () => {
    setConfirmReplace(false);
    setGenerating(true);
    setNotice(null);
    try {
      const draft = await generateCoverLetterDraft(record);
      update('letterBody', draft.slice(0, BODY_MAX));
      setNotice({ tone: 'success', text: 'AI draft added to the letter text. Review and edit it, then save.' });
    } catch (error) {
      const reason = error instanceof AiUnavailableError
        ? error.message
        : `The draft could not be generated: ${error instanceof Error ? error.message : 'unknown error'}.`;
      setNotice({ tone: 'error', text: `${reason} Your letter text was not changed.` });
    } finally {
      setGenerating(false);
    }
  };

  const requestGenerate = () => {
    if (!record.jobTitle.trim() && !record.jobDescription.trim()) {
      setErrors((previous) => ({ ...previous, jobTitle: 'Add the job title or paste the job description so the draft can be tailored.' }));
      setNotice({ tone: 'error', text: 'Add the job title or the job description before generating a draft.' });
      focusField('jobTitle');
      return;
    }
    if (record.letterBody.trim()) {
      setConfirmReplace(true);
      return;
    }
    void generate();
  };

  const parts = useMemo(() => letterParts(record), [record]);
  const coverage = useMemo(
    () => (record.jobDescription.trim() ? keywordCoverage(record.jobDescription, record.letterBody) : null),
    [record.jobDescription, record.letterBody],
  );
  const wordCount = useMemo(() => (record.letterBody.trim() ? record.letterBody.trim().split(/\s+/).length : 0), [record.letterBody]);

  const requireBody = () => {
    if (record.letterBody.trim()) return true;
    setNotice({ tone: 'error', text: 'Add letter text first. There is nothing to export yet.' });
    focusField('letterBody');
    return false;
  };

  const copyText = async () => {
    if (!requireBody()) return;
    try {
      await navigator.clipboard.writeText(letterPlainText(parts));
      setNotice({ tone: 'success', text: 'Letter copied to the clipboard.' });
    } catch {
      setNotice({ tone: 'error', text: 'Copy failed because the browser blocked clipboard access. Select the text in the preview and copy it manually.' });
    }
  };

  const downloadText = () => {
    if (!requireBody()) return;
    const url = URL.createObjectURL(new Blob([letterPlainText(parts)], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileNameFor(record);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ tone: 'success', text: `Downloaded ${anchor.download}.` });
  };

  const printLetter = () => {
    if (!requireBody()) return;
    let frame = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = PRINT_FRAME_ID;
      frame.title = 'Cover letter print layout';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
      document.body.appendChild(frame);
    }
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      setNotice({ tone: 'error', text: 'Printing is not available in this browser. Use Download .txt instead.' });
      return;
    }
    // Built with DOM APIs (textContent) so letter text can never inject markup.
    // The title becomes the browser's default file name when saving as PDF.
    const title = doc.createElement('title');
    title.textContent = letterTitle(record);
    const style = doc.createElement('style');
    style.textContent = '@page{margin:2.2cm}body{font:11.5pt/1.55 Georgia,"Times New Roman",serif;color:#111;margin:0}p{margin:0 0 1em;white-space:pre-wrap;overflow-wrap:anywhere}';
    doc.head.replaceChildren(title, style);
    doc.body.replaceChildren(
      ...[parts.sender.join('\n'), parts.date, parts.recipient.join('\n'), parts.subject, ...parts.paragraphs]
        .filter(Boolean)
        .map((text) => {
          const paragraph = doc.createElement('p');
          paragraph.textContent = text;
          return paragraph;
        }),
    );
    win.focus();
    win.print();
  };

  const textField = (field: TextKey, label: string, options: { autoComplete?: string; type?: string; hint?: string; maxLength?: number } = {}) => {
    const id = fieldId(field);
    const error = errors[field];
    const describedBy = error ? `${id}-error` : options.hint ? `${id}-hint` : undefined;
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
        <Input
          id={id}
          name={field}
          type={options.type ?? 'text'}
          value={record[field]}
          onChange={(event) => update(field, event.target.value)}
          autoComplete={options.autoComplete ?? 'off'}
          maxLength={options.maxLength ?? 200}
          error={Boolean(error)}
          aria-describedby={describedBy}
        />
        {error ? (
          <p id={`${id}-error`} className="mt-1 text-xs text-error-700">{error}</p>
        ) : options.hint ? (
          <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{options.hint}</p>
        ) : null}
      </div>
    );
  };

  if (phase === 'loading') {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8" aria-busy="true">
        <p role="status" className="sr-only">Loading cover letter…</p>
        <div className="mb-6 h-8 w-64 max-w-full animate-pulse rounded-lg bg-canvas" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-96 animate-pulse rounded-2xl border border-border bg-surface" />
          <div className="hidden h-96 animate-pulse rounded-2xl border border-border bg-surface lg:block" />
        </div>
      </div>
    );
  }

  if (phase === 'not-found') {
    return (
      <div className="mx-auto w-full max-w-lg p-6 text-center sm:p-10">
        <FileQuestion className="mx-auto size-12 text-ink-muted" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold text-ink">Cover letter not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This cover letter does not exist or is not available to your account. It may have been deleted.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline"><Link to="/dashboard/cover-letters">Back to cover letters</Link></Button>
          <Button asChild><Link to="/cover-letter/new">Start a new letter</Link></Button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto w-full max-w-lg p-6 sm:p-10">
        <h1 className="mb-4 text-xl font-semibold text-ink">Cover letter</h1>
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>The cover letter could not be loaded: {loadError}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
            <Button asChild variant="ghost" size="sm"><Link to="/dashboard/cover-letters">Back to cover letters</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const heading = record.jobTitle.trim() || record.companyName.trim()
    ? letterTitle(record)
    : persisted ? 'Untitled cover letter' : 'New cover letter';
  const saveState = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : persisted
        ? `All changes saved · ${formatUpdated(lastSavedAt)}`
        : 'Not saved yet';

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link to="/dashboard/cover-letters" className="mb-3 inline-flex items-center gap-1 rounded text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" /> All cover letters
      </Link>

      <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-ink">{heading}</h1>
          <p className={cn('mt-1 text-sm', dirty ? 'font-medium text-warning-700' : 'text-ink-muted')} data-testid="cover-letter-save-state">
            {saveState}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyText()}>
            <ClipboardCopy aria-hidden="true" /> Copy text
          </Button>
          <Button variant="outline" size="sm" onClick={downloadText}>
            <Download aria-hidden="true" /> Download .txt
          </Button>
          <Button variant="outline" size="sm" onClick={printLetter}>
            <Printer aria-hidden="true" /> Print / Save as PDF
          </Button>
          <Button ref={saveButtonRef} type="submit" form="cover-letter-editor" size="sm" loading={saving}>
            <Save aria-hidden="true" /> Save
          </Button>
        </div>
      </header>

      <div role="status" aria-live="polite">
        {notice && (
          <p className={cn(
            'mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm',
            notice.tone === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-error-200 bg-error-50 text-error-800',
          )}>
            {notice.tone === 'success'
              ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1 break-words">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-black/5" aria-label="Dismiss message">
              <X className="size-4" aria-hidden="true" />
            </button>
          </p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1 lg:hidden" role="group" aria-label="Builder view">
        {(['edit', 'preview'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            aria-controls={option === 'edit' ? 'cover-letter-editor' : 'cover-letter-preview'}
            onClick={() => setView(option)}
            className={cn(
              'h-9 rounded-lg text-sm font-medium transition-colors',
              view === option ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-canvas hover:text-ink',
            )}
          >
            {option === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          id="cover-letter-editor"
          aria-label="Cover letter details"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className={cn('min-w-0 space-y-5', view === 'edit' ? 'block' : 'hidden lg:block')}
        >
          <Section title="The job">
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('jobTitle', 'Job title')}
              {textField('companyName', 'Company')}
            </div>
            {textField('recipientName', 'Hiring manager or recipient', { hint: 'Optional. Leave blank to address the hiring team.' })}
            {textField('companyAddress', 'Company address', { maxLength: 300 })}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('companyCity', 'Company city')}
              {textField('companyPostalCode', 'Company postal code', { maxLength: 20 })}
            </div>
          </Section>

          <Section title="Draft with AI (optional)" description="The draft uses only the facts you provide here. Always review it before sending.">
            <div className="min-w-0">
              <label htmlFor={fieldId('jobDescription')} className="mb-1 block text-sm font-medium text-ink">Job description</label>
              <Textarea
                id={fieldId('jobDescription')}
                value={record.jobDescription}
                onChange={(event) => update('jobDescription', event.target.value)}
                rows={5}
                maxLength={4000}
                className="resize-y"
                aria-describedby={`${fieldId('jobDescription')}-hint`}
              />
              <p id={`${fieldId('jobDescription')}-hint`} className="mt-1 text-xs text-ink-muted">
                Paste the posting to tailor the draft and see which of its keywords your letter mentions.
              </p>
            </div>
            <div className="min-w-0">
              <label htmlFor={fieldId('userSkills')} className="mb-1 block text-sm font-medium text-ink">Skills and achievements to mention</label>
              <Textarea
                id={fieldId('userSkills')}
                value={record.userSkills}
                onChange={(event) => update('userSkills', event.target.value)}
                rows={3}
                maxLength={4000}
                className="resize-y"
                aria-describedby={`${fieldId('userSkills')}-hint`}
              />
              <p id={`${fieldId('userSkills')}-hint`} className="mt-1 text-xs text-ink-muted">
                {profileFilled && record.userSkills ? 'Filled from your profile skills. ' : ''}Only facts listed here are used, so add real results you want highlighted.
              </p>
            </div>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium text-ink">Tone</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TONE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500',
                      record.aiTone === option.value ? 'border-brand-500 bg-brand-50' : 'border-border hover:bg-canvas',
                    )}
                  >
                    <input
                      type="radio"
                      name="cover-letter-tone"
                      value={option.value}
                      checked={record.aiTone === option.value}
                      onChange={() => setRecord((previous) => ({ ...previous, aiTone: option.value }))}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{option.label}</span>
                      <span className="block text-xs text-ink-muted">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button ref={generateButtonRef} type="button" variant="secondary" onClick={requestGenerate} loading={generating}>
              <Sparkles aria-hidden="true" /> {generating ? 'Generating draft…' : 'Generate draft'}
            </Button>
          </Section>

          <Section title="Letter">
            <div className="min-w-0">
              <label htmlFor={fieldId('letterBody')} className="mb-1 block text-sm font-medium text-ink">Letter text</label>
              <Textarea
                id={fieldId('letterBody')}
                value={record.letterBody}
                onChange={(event) => update('letterBody', event.target.value)}
                rows={16}
                maxLength={BODY_MAX}
                className="resize-y leading-relaxed"
                aria-describedby={`${fieldId('letterBody')}-count`}
              />
              <p id={`${fieldId('letterBody')}-count`} className="mt-1 text-xs text-ink-muted">
                {wordCount} word{wordCount === 1 ? '' : 's'} · {record.letterBody.length.toLocaleString()} / {BODY_MAX.toLocaleString()} characters. Separate paragraphs with a blank line.
              </p>
            </div>
            {coverage && (
              <section aria-labelledby="cover-letter-keywords" className="rounded-xl border border-border bg-canvas p-3">
                <h3 id="cover-letter-keywords" className="text-sm font-semibold text-ink">
                  Job description keywords mentioned: {coverage.matched.length} of {coverage.matched.length + coverage.missing.length}
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">A writing aid based on the most frequent terms in the posting. It is not an ATS score.</p>
                {coverage.matched.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-medium text-ink">Mentioned</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Keywords mentioned">
                      {coverage.matched.map((word) => (
                        <li key={word} className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-800">
                          <Check className="size-3" aria-hidden="true" />{word}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {coverage.missing.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-medium text-ink">Not mentioned yet</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Keywords not mentioned yet">
                      {coverage.missing.map((word) => (
                        <li key={word} className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-ink-secondary">{word}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
          </Section>

          <Section title="Your details" description={profileFilled ? 'Filled from your profile. Changes here apply to this letter only.' : 'Shown at the top of the letter.'}>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('candidateFirstname', 'First name', { autoComplete: 'given-name', maxLength: 100 })}
              {textField('candidateLastname', 'Last name', { autoComplete: 'family-name', maxLength: 100 })}
              {textField('candidateEmail', 'Email', { autoComplete: 'email', type: 'email', maxLength: 254 })}
              {textField('candidatePhone', 'Phone', { autoComplete: 'tel', type: 'tel', maxLength: 40 })}
            </div>
            {textField('candidateAddress', 'Address', { autoComplete: 'street-address', maxLength: 300 })}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('candidateCity', 'City', { autoComplete: 'address-level2', maxLength: 120 })}
              {textField('candidatePostalCode', 'Postal code', { autoComplete: 'postal-code', maxLength: 20 })}
            </div>
          </Section>
        </form>

        <section
          id="cover-letter-preview"
          aria-labelledby="cover-letter-preview-heading"
          className={cn('min-w-0', view === 'preview' ? 'block' : 'hidden lg:block')}
        >
          <h2 id="cover-letter-preview-heading" className="mb-2 text-sm font-semibold text-ink-muted">Preview</h2>
          <article className="rounded-2xl border border-border bg-surface p-5 text-sm leading-relaxed text-ink shadow-sm sm:p-8 lg:sticky lg:top-4">
            {parts.sender.length > 0 && (
              <p className="whitespace-pre-line break-words">{parts.sender.join('\n')}</p>
            )}
            <p className="mt-4">{parts.date}</p>
            {parts.recipient.length > 0 && (
              <p className="mt-4 whitespace-pre-line break-words">{parts.recipient.join('\n')}</p>
            )}
            {parts.subject && <p className="mt-4 break-words font-semibold">{parts.subject}</p>}
            {parts.paragraphs.length > 0 ? (
              parts.paragraphs.map((paragraph, index) => (
                <p key={index} className="mt-4 whitespace-pre-wrap break-words">{paragraph}</p>
              ))
            ) : (
              <p className="mt-4 italic text-ink-muted">Your letter text will appear here.</p>
            )}
          </article>
        </section>
      </div>

      <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-2xl"
          onOpenAutoFocus={(event) => { event.preventDefault(); keepTextRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); generateButtonRef.current?.focus(); }}
        >
          <DialogHeader>
            <DialogTitle>Replace your letter text?</DialogTitle>
            <DialogDescription>
              The AI draft will replace the text currently in the letter.
              {persisted ? ' Your saved version stays unchanged until you save again.' : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button ref={keepTextRef} variant="outline" onClick={() => setConfirmReplace(false)}>Keep my text</Button>
            <Button onClick={() => void generate()}>
              <Sparkles aria-hidden="true" /> Replace with AI draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <fieldset className="min-w-0 space-y-4">
        <legend className="w-full">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <span className="mt-0.5 block text-xs font-normal text-ink-muted">{description}</span>}
        </legend>
        {children}
      </fieldset>
    </div>
  );
}

/**
 * Buttons are disabled while busy, which drops keyboard focus to <body>.
 * When the work finishes, put focus back on the button if nothing else took it.
 */
function useRestoreFocusWhenIdle(busy: boolean, ref: RefObject<HTMLButtonElement | null>) {
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const active = document.activeElement;
      if (!active || active === document.body) ref.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy, ref]);
}
