/**
 * Dialogs for the portfolio builder. They open without a Radix trigger, so each
 * returns focus explicitly to the control that opened it.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type Ref,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TextField } from '@/components/portfolio/portfolio-editor-fields';
import {
  CUSTOM_DOMAIN_ROUTING_NOTE,
  CUSTOM_DOMAIN_ROUTING_SUPPORTED,
  type CustomDomainConfig,
  type CustomDomainStatusReport,
  type ResumeChoice,
  configurePortfolioCustomDomain,
  customDomainDnsRecords,
  getPortfolioCustomDomain,
  listResumeChoices,
  publicPortfolioPreviewLabel,
  setPortfolioPassword,
  suggestPortfolioSlug,
  toPortfolioError,
  validateCustomDomain,
  validatePortfolioSlug,
  verifyPortfolioCustomDomain,
} from '@/lib/portfolio';
import {
  PORTFOLIO_TEMPLATES,
  compareCanonical,
  type PortfolioCanonical,
  type PortfolioTemplateId,
} from '@/lib/portfolio-document';
import { cn } from '@/lib/utils';

const dialogClass =
  'w-[calc(100%-2rem)] max-w-lg rounded-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto';
/** The shared close button sits at right-4 top-4 (28px); keep long titles clear of it on phones. */
const titleClass = 'px-7 sm:pl-0';

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{' '}
      <span className="min-w-0 break-words">{message}</span>
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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  busy,
  error,
  onConfirm,
  onClose,
  returnFocusRef,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {error && <InlineError message={error} />}
        <DialogFooter className="gap-2">
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
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

type ResumeState =
  | { status: 'loading' }
  | { status: 'ready'; resumes: ResumeChoice[] }
  | { status: 'error'; message: string };

export function CreatePortfolioDialog({
  open,
  busy,
  error,
  onCreate,
  onClose,
  returnFocusRef,
}: CreatePortfolioDialogProps) {
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
    onCreate({
      title: title.trim(),
      template,
      resumeId: source === 'resume' && resumeId ? resumeId : null,
    });
  };

  const resumeList = resumes.status === 'ready' ? resumes.resumes : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className={titleClass}>New portfolio</DialogTitle>
            <DialogDescription>
              It is saved as a private draft. Nothing is public until you publish it.
            </DialogDescription>
          </DialogHeader>

          <TextField
            label="Title"
            value={title}
            onChange={(value) => {
              setTitle(value);
              if (titleError) setTitleError('');
            }}
            error={titleError}
            required
            maxLength={160}
            inputRef={titleRef}
            placeholder="e.g. Product design portfolio"
          />

          <div role="radiogroup" aria-labelledby={templateLabel}>
            <p id={templateLabel} className="mb-2 text-sm font-medium text-ink">
              Template
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PORTFOLIO_TEMPLATES.map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    'flex cursor-pointer gap-2 rounded-xl border p-3 text-sm',
                    template === option.id ? 'border-brand-600 bg-brand-50' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name="portfolio-template"
                    value={option.id}
                    checked={template === option.id}
                    onChange={() => setTemplate(option.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-ink">{option.name}</span>
                    <span className="block text-xs text-ink-secondary">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div role="radiogroup" aria-labelledby={sourceLabel}>
            <p id={sourceLabel} className="mb-2 text-sm font-medium text-ink">
              Start from
            </p>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="portfolio-source"
                  value="resume"
                  checked={source === 'resume'}
                  disabled={!resumeList.length}
                  onChange={() => setSource('resume')}
                  className="mt-0.5"
                />
                <span className={cn(!resumeList.length && 'text-ink-muted')}>
                  One of my saved resumes
                  {resumes.status === 'loading' && (
                    <span className="block text-xs text-ink-muted">Loading your resumes…</span>
                  )}
                  {resumes.status === 'ready' && !resumeList.length && (
                    <span className="block text-xs text-ink-muted">
                      You have no saved resumes yet.
                    </span>
                  )}
                  {resumes.status === 'error' && (
                    <span className="block text-xs text-error-700">
                      Your resumes could not be loaded: {resumes.message}
                    </span>
                  )}
                </span>
              </label>
              {source === 'resume' && resumeList.length > 0 && (
                <div className="pl-6">
                  <label htmlFor={resumeSelectId} className="mb-1 block text-sm font-medium text-ink">
                    Resume
                  </label>
                  <select
                    id={resumeSelectId}
                    value={resumeId}
                    onChange={(event) => setResumeId(event.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
                  >
                    {resumeList.map((resume) => (
                      <option key={resume.id} value={resume.id}>
                        {resume.title}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-ink-muted">
                    Its details are copied into the portfolio once; later resume edits don’t change the portfolio.
                  </p>
                </div>
              )}
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="portfolio-source"
                  value="empty"
                  checked={source === 'empty'}
                  onChange={() => setSource('empty')}
                  className="mt-0.5"
                />
                <span>An empty portfolio</span>
              </label>
            </div>
          </div>

          {error && <InlineError message={error} />}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Publish (`POST /api/portfolios/:id/publish`) ─── */

interface PublishDialogProps {
  open: boolean;
  portfolioId: string;
  defaultBase: string;
  initialSlug?: string | null;
  busy: boolean;
  error: string | null;
  onPublish: (slug: string) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function PublishDialog({
  open,
  defaultBase,
  initialSlug,
  busy,
  error,
  onPublish,
  onClose,
  returnFocusRef,
}: PublishDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const validationId = useId();
  const [slugInput, setSlugInput] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const candidate = initialSlug || suggestPortfolioSlug(defaultBase);
    setSlugInput(candidate);
    setTouched(Boolean(candidate));
  }, [open, defaultBase, initialSlug]);

  const validation = validatePortfolioSlug(slugInput);
  const showValidationError = touched && !validation.valid;
  const previewLabel = publicPortfolioPreviewLabel(slugInput);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!validation.valid || busy) {
      inputRef.current?.focus();
      return;
    }
    onPublish(validation.slug);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className={titleClass}>Publish your portfolio</DialogTitle>
            <DialogDescription>
              Choose a public URL slug for your portfolio. Anyone with the link can view your published profile, and you can unpublish it at any time.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
              URL Slug
            </label>
            <Input
              ref={inputRef}
              id={inputId}
              value={slugInput}
              onChange={(event) => {
                setSlugInput(event.target.value);
                setTouched(true);
              }}
              placeholder="alex-smith"
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              error={showValidationError || Boolean(error)}
              aria-invalid={showValidationError || Boolean(error) ? true : undefined}
              aria-describedby={showValidationError ? `${hintId} ${validationId}` : hintId}
            />
            <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
              3–40 characters using lowercase letters (a–z), numbers (0–9), and single hyphens.
            </p>
            {showValidationError && (
              <p
                id={validationId}
                role="alert"
                className="mt-1.5 text-xs font-medium text-error-600"
              >
                {validation.reason}
              </p>
            )}
          </div>

          <div
            aria-live="polite"
            className="rounded-xl border border-border bg-neutral-50 p-3 text-xs dark:bg-neutral-900/50"
          >
            <span className="block font-semibold uppercase tracking-wider text-ink-muted">
              Live URL Preview
            </span>
            <p className="mt-1 font-mono text-sm font-semibold text-ink break-all">
              {previewLabel}
            </p>
          </div>

          {error && <InlineError message={error} />}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!validation.valid || busy}>
              <Globe className="size-4" aria-hidden="true" />
              Publish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Save conflict (HTTP 409) ───
 *
 * Shown when the server rejects a save because the portfolio moved on. Nothing is
 * overwritten and nothing is discarded automatically: the three actions are the
 * only ways out, and each one is an explicit decision.
 */

export interface ConflictDialogProps {
  open: boolean;
  local: { title: string; canonical: PortfolioCanonical };
  remote: { title: string; canonical: PortfolioCanonical; revision: number; updatedAt: string | null };
  /** Revision this tab's copy was based on. */
  baseRevision: number | null;
  busy: boolean;
  error: string | null;
  onKeepLocal: () => void;
  onDiscardAndReload: () => void;
  /** Closes the dialog but keeps the conflict state; the save stays blocked. */
  onDecideLater: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

const conflictDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function ConflictDialog({
  open,
  local,
  remote,
  baseRevision,
  busy,
  error,
  onKeepLocal,
  onDiscardAndReload,
  onDecideLater,
  returnFocusRef,
}: ConflictDialogProps) {
  const [inspecting, setInspecting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailsId = useId();

  useEffect(() => {
    if (open) setInspecting(false);
  }, [open]);

  const differences = compareCanonical(local, remote);
  const remoteUpdated = remote.updatedAt ? conflictDate.format(new Date(remote.updatedAt)) : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape/overlay dismiss must never resolve the conflict implicitly.
        if (!next && !busy) onDecideLater();
      }}
    >
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <div className="space-y-4">
          <DialogHeader>
            {/* DialogTitle renders the dialog's heading element; adding a second
                heading inside it would nest two identical landmarks. */}
            <DialogTitle
              ref={headingRef as Ref<HTMLHeadingElement>}
              tabIndex={-1}
              className={cn(titleClass, 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600')}
            >
              <span className="flex items-center gap-2">
                <ShieldAlert className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
                This portfolio changed elsewhere
              </span>
            </DialogTitle>
            <DialogDescription>
              Your changes were not saved. The version on the server is different from the one you opened
              {baseRevision !== null ? ` (you opened revision ${baseRevision}` : ''}
              {baseRevision !== null ? `, the server is at revision ${remote.revision})` : ` (the server is at revision ${remote.revision})`}
              {remoteUpdated ? `. It was saved ${remoteUpdated}.` : '.'} Nothing has been overwritten.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border bg-neutral-50 p-3 text-sm dark:bg-neutral-900/50">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Your unsaved title</dt>
                <dd className="break-words text-ink">{local.title.trim() || 'Untitled'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Server title</dt>
                <dd className="break-words text-ink">{remote.title.trim() || 'Untitled'}</dd>
              </div>
            </dl>
          </div>

          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={inspecting}
              aria-controls={detailsId}
              onClick={() => setInspecting((value) => !value)}
            >
              <AlertTriangle aria-hidden="true" /> Inspect remote changes
            </Button>
            <div id={detailsId} hidden={!inspecting} className="mt-3 rounded-xl border border-border p-3">
              {differences.length === 0 ? (
                <p className="text-sm text-ink-secondary">
                  The two versions differ in content this summary cannot show, so reload the server version to compare
                  them directly.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <caption className="mb-2 text-left text-xs text-ink-muted">
                    Fields that differ between your unsaved copy and the server version.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="pr-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Field</th>
                      <th scope="col" className="pr-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Yours</th>
                      <th scope="col" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Server</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differences.map((difference) => (
                      <tr key={difference.key} className="border-t border-border align-top">
                        <th scope="row" className="py-1.5 pr-2 font-medium text-ink">{difference.label}</th>
                        <td className="py-1.5 pr-2 break-words text-ink-secondary">{difference.local}</td>
                        <td className="py-1.5 break-words text-ink-secondary">{difference.remote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {error && <InlineError message={error} />}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onDecideLater} disabled={busy}>
              Decide later
            </Button>
            <Button type="button" variant="outline" onClick={onDiscardAndReload} disabled={busy} loading={busy}>
              <RefreshCw aria-hidden="true" /> Discard &amp; reload
            </Button>
            <Button type="button" onClick={onKeepLocal} disabled={busy}>
              <Check aria-hidden="true" /> Keep local &amp; overwrite
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Custom Domain (`POST /api/portfolios/:id/custom-domain`) ─── */

interface CustomDomainDialogProps {
  open: boolean;
  portfolioId: string;
  initialConfig: CustomDomainConfig | null;
  onConfigUpdated: (config: CustomDomainConfig) => void;
  onRefreshPortfolio: () => Promise<void>;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

const statusStyles: Record<string, string> = {
  VERIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  FAILED: 'border-error-200 bg-error-50 text-error-800 dark:border-error-800 dark:bg-error-950/60 dark:text-error-200',
  EXPIRED: 'border-error-200 bg-error-50 text-error-800 dark:border-error-800 dark:bg-error-950/60 dark:text-error-200',
  UNAVAILABLE: 'border-border bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
  NONE: 'border-border bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
};

export function CustomDomainDialog({
  open,
  portfolioId,
  initialConfig,
  onConfigUpdated,
  onRefreshPortfolio,
  onClose,
  returnFocusRef,
}: CustomDomainDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const domainFieldId = useId();
  const domainHintId = useId();
  const domainErrorId = useId();

  const [domainInput, setDomainInput] = useState('');
  const [config, setConfig] = useState<CustomDomainConfig | null>(initialConfig);
  const [report, setReport] = useState<CustomDomainStatusReport | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfig(initialConfig);
    setDomainInput(initialConfig?.domain ?? '');
    setFieldError(null);
    setSubmitError(null);
    setCopiedKey(null);
    setReport(
      initialConfig
        ? {
            status: initialConfig.status,
            domain: initialConfig.domain,
            verifiedAt: initialConfig.verifiedAt,
            expiresAt: null,
            lastError: null,
            verifyAttempts: null,
            label: initialConfig.status === 'VERIFIED' ? 'Verified' : initialConfig.status === 'FAILED' ? 'Verification failed' : 'Pending verification',
            detail: '',
            verified: initialConfig.status === 'VERIFIED',
          }
        : null,
    );
  }, [open, initialConfig]);

  // Read the stored verification state from the server when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getPortfolioCustomDomain(portfolioId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setReport(next);
        if (next.domain) setDomainInput((current) => current || next.domain || '');
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, portfolioId]);

  const handleRegisterDomain = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const check = validateCustomDomain(domainInput);
    if (!check.valid) {
      setFieldError(check.reason);
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const updated = await configurePortfolioCustomDomain(portfolioId, check.domain);
      setConfig(updated);
      setDomainInput(updated.domain);
      setReport({
        status: updated.status,
        domain: updated.domain,
        verifiedAt: updated.verifiedAt,
        expiresAt: null,
        lastError: null,
        verifyAttempts: null,
        label: updated.status === 'VERIFIED' ? 'Verified' : updated.status === 'FAILED' ? 'Verification failed' : 'Pending verification',
        detail: updated.status === 'VERIFIED' ? '' : 'Add the TXT record below, then check verification.',
        verified: updated.status === 'VERIFIED',
      });
      onConfigUpdated(updated);
    } catch (cause) {
      setSubmitError(toPortfolioError(cause).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (checking) return;
    setChecking(true);
    setSubmitError(null);
    try {
      const next = await verifyPortfolioCustomDomain(portfolioId);
      setReport(next);
      // Refresh the owner record so the badge outside the dialog and any stored
      // config reflect what the server now holds.
      await onRefreshPortfolio();
    } catch (cause) {
      setSubmitError(toPortfolioError(cause).message);
    } finally {
      setChecking(false);
    }
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((previous) => (previous === key ? null : previous)), 2200);
    } catch {
      setSubmitError('Could not copy automatically. Please copy the value shown below.');
    }
  };

  const records = customDomainDnsRecords(config);
  const activeStatus = report?.status ?? (config ? config.status : 'NONE');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <div className="space-y-5">
          <DialogHeader>
            <DialogTitle className={titleClass}>Custom domain</DialogTitle>
            <DialogDescription>
              Claim a hostname for this portfolio and verify ownership with a DNS TXT record. Verification status always
              comes from the server.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => void handleRegisterDomain(event)} noValidate className="space-y-3">
            <div>
              <label htmlFor={domainFieldId} className="mb-1.5 block text-sm font-medium text-ink">
                Domain hostname
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  ref={inputRef}
                  id={domainFieldId}
                  value={domainInput}
                  onChange={(event) => {
                    setDomainInput(event.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  placeholder="alex-smith.dev"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={submitting}
                  error={Boolean(fieldError)}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? `${domainHintId} ${domainErrorId}` : domainHintId}
                  className="flex-1 font-mono text-sm"
                />
                <Button type="submit" disabled={submitting} loading={submitting}>
                  {config ? 'Update domain' : 'Register domain'}
                </Button>
              </div>
              <p id={domainHintId} className="mt-1.5 text-xs text-ink-muted">
                Enter the hostname only — no <span className="font-mono">http://</span>, no trailing slash, no path.
              </p>
              {fieldError && (
                <p id={domainErrorId} role="alert" className="mt-1.5 text-xs font-medium text-error-600">
                  {fieldError}
                </p>
              )}
            </div>
          </form>

          {submitError && <InlineError message={submitError} />}

          <section aria-label="Verification status" className="space-y-3 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink break-all">{report?.domain ?? config?.domain ?? 'No domain registered'}</p>
                <p className="text-xs text-ink-muted">DNS ownership verification</p>
              </div>
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusStyles[activeStatus] ?? statusStyles.NONE)}>
                {activeStatus === 'VERIFIED' ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" /> : activeStatus === 'FAILED' || activeStatus === 'EXPIRED' ? <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" /> : <Clock className="size-3.5 shrink-0" aria-hidden="true" />}
                <span>{report?.label ?? 'Pending verification'}</span>
              </span>
            </div>

            {report?.detail && <p className="text-sm text-ink-secondary">{report.detail}</p>}
            {report?.lastError && report.status !== 'VERIFIED' && (
              <p className="rounded-lg bg-neutral-100 px-2.5 py-1.5 font-mono text-xs text-ink-secondary break-words dark:bg-neutral-800">
                {report.lastError}
              </p>
            )}

            {records.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-ink">Required DNS record</h3>
                <dl className="space-y-3 rounded-xl border border-border bg-neutral-50/70 p-3.5 dark:bg-neutral-900/50">
                  {records.map((record) => (
                    <div key={`${record.type}-${record.host}`} className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{record.type} record</dt>
                        <span className="text-xs text-ink-muted">{record.purpose}</span>
                      </div>
                      <dd className="space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-ink-muted">Name/Host</span>
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void handleCopy(record.host, 'host')}>
                            {copiedKey === 'host' ? <><Check className="size-3.5" aria-hidden="true" /> Copied</> : <><Copy className="size-3.5" aria-hidden="true" /> Copy host</>}
                          </Button>
                        </div>
                        <p className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-ink break-all">{record.host}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-ink-muted">Value</span>
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => handleCopy(record.value, 'value')}>
                            {copiedKey === 'value' ? <><Check className="size-3.5" aria-hidden="true" /> Copied</> : <><Copy className="size-3.5" aria-hidden="true" /> Copy value</>}
                          </Button>
                        </div>
                        <p className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-ink break-all">{record.value}</p>
                      </dd>
                    </div>
                  ))}
                </dl>
                {config?.instructions && (
                  <details className="text-xs text-ink-secondary">
                    <summary className="cursor-pointer font-medium text-ink">Server instructions</summary>
                    <p className="mt-1.5 whitespace-pre-line">{config.instructions}</p>
                  </details>
                )}
              </div>
            )}

            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-ink-secondary">
              <p className="flex items-start gap-1.5 font-medium text-ink">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {CUSTOM_DOMAIN_ROUTING_SUPPORTED ? 'Routing target' : 'CNAME / A routing is not available'}
              </p>
              <p className="mt-1">{CUSTOM_DOMAIN_ROUTING_NOTE}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={checking || !config} aria-busy={checking} onClick={() => void handleVerify()}>
                <RefreshCw className={cn('size-3.5', checking && 'animate-spin')} aria-hidden="true" />
                Check verification now
              </Button>
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface PasswordProtectionDialogProps {
  open: boolean;
  onClose: () => void;
  portfolioId: string;
  isPasswordProtected: boolean;
  onPasswordChanged: (protectedStatus: boolean) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function PasswordProtectionDialog({
  open,
  onClose,
  portfolioId,
  isPasswordProtected,
  onPasswordChanged,
  returnFocusRef,
}: Readonly<PasswordProtectionDialogProps>) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordFieldId = useId();

  useEffect(() => {
    if (open) {
      setPassword('');
      setSubmitError(null);
      setSuccessMessage(null);
    }
  }, [open]);

  const handleSetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      setSubmitError('Please enter a password.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const res = await setPortfolioPassword(portfolioId, password);
      onPasswordChanged(res.isPasswordProtected);
      setSuccessMessage('Password protection enabled successfully.');
      setPassword('');
    } catch (cause) {
      setSubmitError(toPortfolioError(cause).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemovePassword = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const res = await setPortfolioPassword(portfolioId, null);
      onPasswordChanged(res.isPasswordProtected);
      setSuccessMessage('Password protection removed. Portfolio is now public.');
    } catch (cause) {
      setSubmitError(toPortfolioError(cause).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <DialogContent
        className={dialogClass}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <div className="space-y-5">
          <DialogHeader>
            <DialogTitle className={titleClass}>Portfolio Password Protection</DialogTitle>
            <DialogDescription>
              Restrict access to this portfolio with server-side PBKDF2/Bcrypt hash verification (FP-C10).
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full',
                  isPasswordProtected ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
                )}
              >
                {isPasswordProtected ? <Lock className="size-5" /> : <Unlock className="size-5" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {isPasswordProtected ? 'Password Protected' : 'Public Access'}
                </p>
                <p className="text-xs text-ink-secondary">
                  {isPasswordProtected
                    ? 'Visitors must enter the correct password to unlock and view portfolio sections.'
                    : 'Anyone with the published URL can view your portfolio.'}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void handleSetPassword(e)} noValidate className="space-y-3">
            <div>
              <label htmlFor={passwordFieldId} className="mb-1.5 block text-sm font-medium text-ink">
                {isPasswordProtected ? 'Change Password' : 'Set Access Password'}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  ref={inputRef}
                  id={passwordFieldId}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  placeholder="Enter a secure password..."
                  disabled={submitting}
                  className="flex-1 text-sm"
                />
                <Button type="submit" disabled={submitting || !password.trim()} loading={submitting}>
                  <KeyRound className="mr-1 size-4" /> Save
                </Button>
              </div>
            </div>
          </form>

          {isPasswordProtected && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-ink-muted">Want to remove password barrier?</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => void handleRemovePassword()}
              >
                <Unlock className="mr-1 size-4" /> Remove Password
              </Button>
            </div>
          )}

          {submitError && <InlineError message={submitError} />}
          {successMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                {successMessage}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

