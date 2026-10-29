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
} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  RefreshCw,
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
  type CustomDomainConfig,
  type ResumeChoice,
  configurePortfolioCustomDomain,
  listResumeChoices,
  publicPortfolioPreviewLabel,
  suggestPortfolioSlug,
  toPortfolioError,
  validateCustomDomain,
  validatePortfolioSlug,
} from '@/lib/portfolio';
import { PORTFOLIO_TEMPLATES, type PortfolioTemplateId } from '@/lib/portfolio-document';
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

/* ─── Custom Domain (`POST /api/portfolios/:id/custom-domain`) ─── */

interface CustomDomainDialogProps {
  open: boolean;
  portfolioId: string;
  initialConfig: CustomDomainConfig | null;
  onConfigUpdated: (config: CustomDomainConfig) => void;
  onRefreshPortfolio?: () => Promise<void> | void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'token' | 'host' | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfig(initialConfig);
    setDomainInput(initialConfig?.domain ?? '');
    setFieldError(null);
    setSubmitError(null);
    setCopiedKey(null);
  }, [open, initialConfig]);

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
      onConfigUpdated(updated);
    } catch (cause) {
      setSubmitError(toPortfolioError(cause).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (value: string, key: 'token' | 'host') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
    } catch {
      setSubmitError('Could not copy automatically. Please copy the value shown below.');
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshPortfolio || refreshing) return;
    setRefreshing(true);
    setSubmitError(null);
    try {
      await onRefreshPortfolio();
    } catch (cause) {
      setSubmitError(toPortfolioError(cause).message);
    } finally {
      setRefreshing(false);
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
            <DialogTitle className={titleClass}>Custom Domain Setup</DialogTitle>
            <DialogDescription>
              Connect your own domain to this portfolio and verify ownership via a DNS TXT record.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleRegisterDomain(e)} noValidate className="space-y-3">
            <div>
              <label htmlFor={domainFieldId} className="mb-1.5 block text-sm font-medium text-ink">
                Domain Hostname
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  ref={inputRef}
                  id={domainFieldId}
                  value={domainInput}
                  onChange={(e) => {
                    setDomainInput(e.target.value);
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
                  {config ? 'Update Domain' : 'Register Domain'}
                </Button>
              </div>
              <p id={domainHintId} className="mt-1.5 text-xs text-ink-muted">
                Enter your hostname without <span className="font-mono">https://</span> or paths (e.g.,{' '}
                <span className="font-mono">alex-smith.dev</span>).
              </p>
              {fieldError && (
                <p
                  id={domainErrorId}
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-error-600"
                >
                  {fieldError}
                </p>
              )}
            </div>
          </form>

          {submitError && <InlineError message={submitError} />}

          {config && (
            <div className="space-y-4 rounded-2xl border border-border bg-neutral-50/70 p-4 text-xs dark:bg-neutral-900/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink break-all">{config.domain}</p>
                  <p className="text-ink-muted">DNS Ownership Verification</p>
                </div>
                {config.status === 'VERIFIED' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>Verified</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                    <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>Pending verification</span>
                  </span>
                )}
              </div>

              <p className="leading-relaxed text-ink-secondary">
                {config.instructions ||
                  'Add the DNS TXT record below at your domain registrar. Status stays Pending verification until DNS ownership is confirmed by the server.'}
              </p>

              <dl className="space-y-3 rounded-xl border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="font-semibold text-ink-muted">Record Type</dt>
                  <dd className="rounded bg-neutral-100 px-2 py-0.5 font-mono font-bold text-ink dark:bg-neutral-800">
                    {config.recordType}
                  </dd>
                </div>

                <div className="space-y-1 border-t border-border pt-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="font-semibold text-ink-muted">Host / Name</dt>
                    {config.host && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => void handleCopy(config.host!, 'host')}
                      >
                        {copiedKey === 'host' ? (
                          <>
                            <Check className="size-3.5" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" aria-hidden="true" />
                            Copy Host
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <dd className="rounded-lg border border-border bg-neutral-50 px-2.5 py-1.5 font-mono text-ink break-all dark:bg-neutral-900">
                    {config.host || 'See backend instructions above'}
                  </dd>
                </div>

                {config.verificationToken && (
                  <div className="space-y-1 border-t border-border pt-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="font-semibold text-ink-muted">TXT Value / Token</dt>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => void handleCopy(config.verificationToken, 'token')}
                      >
                        {copiedKey === 'token' ? (
                          <>
                            <Check className="size-3.5" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" aria-hidden="true" />
                            Copy Token
                          </>
                        )}
                      </Button>
                    </div>
                    <dd className="rounded-lg border border-border bg-neutral-50 px-2.5 py-1.5 font-mono text-ink break-all dark:bg-neutral-900">
                      {config.verificationToken}
                    </dd>
                  </div>
                )}
              </dl>

              {onRefreshPortfolio && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={refreshing}
                    aria-busy={refreshing}
                    onClick={() => void handleRefresh()}
                  >
                    <RefreshCw
                      className={cn('size-3.5', refreshing && 'animate-spin')}
                      aria-hidden="true"
                    />
                    Refresh Status
                  </Button>
                </div>
              )}
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
