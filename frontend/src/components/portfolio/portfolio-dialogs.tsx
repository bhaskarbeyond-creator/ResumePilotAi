/**
 * Dialogs for the portfolio builder. They open without a Radix trigger, so each
 * returns focus explicitly to the control that opened it.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextField } from '@/components/portfolio/portfolio-editor-fields';
import { checkSlugAvailability, listResumeChoices, publicPortfolioUrl, toPortfolioError, type ResumeChoice } from '@/lib/portfolio';
import { PORTFOLIO_TEMPLATES, normalizeSlugBase, type PortfolioTemplateId } from '@/lib/portfolio-document';
import { cn } from '@/lib/utils';

const dialogClass = 'w-[calc(100%-2rem)] max-w-lg rounded-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto';
/** The shared close button sits at right-4 top-4 (28px); keep long titles clear of it on phones. */
const titleClass = 'px-7 sm:pl-0';

function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">{message}</span>
    </p>
  );
}

/* ─── Confirm ─── */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function ConfirmDialog({ open, title, description, confirmLabel, destructive, busy, error, onConfirm, onClose, returnFocusRef }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      >
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
          <DialogDescription asChild><div className="space-y-2">{description}</div></DialogDescription>
        </DialogHeader>
        {error && <InlineError message={error} />}
        <DialogFooter className="gap-2">
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Create ─── */

export interface CreatePortfolioInput {
  title: string;
  template: PortfolioTemplateId;
  resumeId: string | null;
}

interface CreatePortfolioDialogProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCreate: (input: CreatePortfolioInput) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

type ResumeState = { status: 'loading' } | { status: 'ready'; resumes: ResumeChoice[] } | { status: 'error'; message: string };

export function CreatePortfolioDialog({ open, busy, error, onCreate, onClose, returnFocusRef }: CreatePortfolioDialogProps) {
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [template, setTemplate] = useState<PortfolioTemplateId>('modernMinimal');
  const [source, setSource] = useState<'resume' | 'empty'>('empty');
  const [resumeId, setResumeId] = useState('');
  const [resumes, setResumes] = useState<ResumeState>({ status: 'loading' });
  const titleRef = useRef<HTMLInputElement>(null);
  const templateLabel = useId();
  const sourceLabel = useId();
  const resumeSelectId = useId();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setTitleError('');
    setTemplate('modernMinimal');
    setSource('empty');
    setResumeId('');
    setResumes({ status: 'loading' });
    const controller = new AbortController();
    listResumeChoices(controller.signal)
      .then((list) => {
        setResumes({ status: 'ready', resumes: list });
        if (list.length) {
          setSource('resume');
          setResumeId(list[0].id);
        }
      })
      .catch((cause: unknown) => {
        const failure = toPortfolioError(cause);
        if (!failure.cancelled) setResumes({ status: 'error', message: failure.message });
      });
    return () => controller.abort();
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError('Give your portfolio a title.');
      titleRef.current?.focus();
      return;
    }
    onCreate({ title: title.trim(), template, resumeId: source === 'resume' && resumeId ? resumeId : null });
  };

  const resumeList = resumes.status === 'ready' ? resumes.resumes : [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      >
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className={titleClass}>New portfolio</DialogTitle>
            <DialogDescription>It is saved as a private draft. Nothing is public until you publish it.</DialogDescription>
          </DialogHeader>

          <TextField label="Title" value={title} onChange={(value) => { setTitle(value); if (titleError) setTitleError(''); }} error={titleError} required maxLength={160} inputRef={titleRef} placeholder="e.g. Product design portfolio" />

          <div role="radiogroup" aria-labelledby={templateLabel}>
            <p id={templateLabel} className="mb-2 text-sm font-medium text-ink">Template</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PORTFOLIO_TEMPLATES.map((option) => (
                <label key={option.id} className={cn('flex cursor-pointer gap-2 rounded-xl border p-3 text-sm', template === option.id ? 'border-brand-600 bg-brand-50' : 'border-border')}>
                  <input type="radio" name="portfolio-template" value={option.id} checked={template === option.id} onChange={() => setTemplate(option.id)} className="mt-0.5" />
                  <span><span className="block font-medium text-ink">{option.name}</span><span className="block text-xs text-ink-secondary">{option.description}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div role="radiogroup" aria-labelledby={sourceLabel}>
            <p id={sourceLabel} className="mb-2 text-sm font-medium text-ink">Start from</p>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" name="portfolio-source" value="resume" checked={source === 'resume'} disabled={!resumeList.length} onChange={() => setSource('resume')} className="mt-0.5" />
                <span className={cn(!resumeList.length && 'text-ink-muted')}>
                  One of my saved resumes
                  {resumes.status === 'loading' && <span className="block text-xs text-ink-muted">Loading your resumes…</span>}
                  {resumes.status === 'ready' && !resumeList.length && <span className="block text-xs text-ink-muted">You have no saved resumes yet.</span>}
                  {resumes.status === 'error' && <span className="block text-xs text-error-700">Your resumes could not be loaded: {resumes.message}</span>}
                </span>
              </label>
              {source === 'resume' && resumeList.length > 0 && (
                <div className="pl-6">
                  <label htmlFor={resumeSelectId} className="mb-1 block text-sm font-medium text-ink">Resume</label>
                  <select id={resumeSelectId} value={resumeId} onChange={(event) => setResumeId(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink">
                    {resumeList.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-ink-muted">Its details are copied into the portfolio once; later resume edits don’t change the portfolio.</p>
                </div>
              )}
              <label className="flex items-start gap-2">
                <input type="radio" name="portfolio-source" value="empty" checked={source === 'empty'} onChange={() => setSource('empty')} className="mt-0.5" />
                <span>An empty portfolio</span>
              </label>
            </div>
          </div>

          {error && <InlineError message={error} />}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy}>Create draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Publish (first time: choose the permanent address) ─── */

type Availability =
  | { status: 'idle' }
  | { status: 'too-short' }
  | { status: 'checking' }
  | { status: 'available'; slug: string }
  | { status: 'taken'; slug: string }
  | { status: 'error'; message: string };

interface PublishDialogProps {
  open: boolean;
  portfolioId: string;
  defaultBase: string;
  busy: boolean;
  error: string | null;
  onPublish: (base: string) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function PublishDialog({ open, portfolioId, defaultBase, busy, error, onPublish, onClose, returnFocusRef }: PublishDialogProps) {
  const [base, setBase] = useState('');
  const [availability, setAvailability] = useState<Availability>({ status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = normalizeSlugBase(base);

  useEffect(() => {
    if (open) setBase(normalizeSlugBase(defaultBase));
  }, [open, defaultBase]);

  useEffect(() => {
    if (!open) return;
    if (normalized.length < 3) {
      setAvailability({ status: normalized ? 'too-short' : 'idle' });
      return;
    }
    setAvailability({ status: 'checking' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      checkSlugAvailability(normalized, portfolioId, controller.signal)
        .then((result) => setAvailability(result.available ? { status: 'available', slug: result.slug } : { status: 'taken', slug: result.slug }))
        .catch((cause: unknown) => {
          const failure = toPortfolioError(cause);
          if (!failure.cancelled) setAvailability({ status: 'error', message: failure.message });
        });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, normalized, portfolioId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (availability.status === 'available') onPublish(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      >
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className={titleClass}>Publish your portfolio</DialogTitle>
            <DialogDescription>Anyone with the link can see it, and it appears in the public portfolio list. You can unpublish it at any time.</DialogDescription>
          </DialogHeader>
          <TextField
            label="Address"
            value={base}
            onChange={setBase}
            inputRef={inputRef}
            maxLength={130}
            hint="Letters, numbers and hyphens. A short code is added to make the address unique. The address can’t be changed after publishing."
          />
          <div aria-live="polite" className="min-h-[2.5rem] text-sm">
            {availability.status === 'too-short' && <p className="text-ink-secondary">Use at least 3 letters or numbers.</p>}
            {availability.status === 'checking' && <p className="flex items-center gap-2 text-ink-secondary"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking the address…</p>}
            {availability.status === 'available' && (
              <p className="flex items-start gap-2 text-success-800">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-all">Available: {publicPortfolioUrl(availability.slug)}</span>
              </p>
            )}
            {availability.status === 'taken' && <p className="text-error-700">That address is already in use. Try a different one.</p>}
            {availability.status === 'error' && <p className="text-error-700">The address could not be checked: {availability.message}</p>}
          </div>
          {error && <InlineError message={error} />}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={availability.status !== 'available'}>Publish</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
