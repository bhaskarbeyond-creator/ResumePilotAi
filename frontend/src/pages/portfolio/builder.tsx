/**
 * Portfolio builder: /dashboard/portfolio (the candidate's portfolios) and
 * /dashboard/portfolio/:portfolioId (one portfolio). The legacy paths
 * /dashboard/portfolios and /portfolio/builder redirect here.
 *
 * Everything goes through the real portfolio API (lib/portfolio.ts) and the
 * shared Web CV document contract (lib/portfolio-document.ts):
 * - A new portfolio is saved as a private draft first, so every editor URL
 *   refers to a stored record that survives reload.
 * - Saves are revision-checked. A 409 means the portfolio changed in another tab
 *   or device; the candidate chooses to reload, and nothing is overwritten.
 * - The public address is chosen once, on first publication, after the server
 *   confirms the exact address. The server then keeps it permanently.
 * - While an administrator has the module turned off (403
 *   PORTFOLIO_MODULE_DISABLED, the shipped default), the page says so and offers
 *   no editing.
 * - Portfolios built with the earlier page editor can't be edited here, but
 *   they can still be published, unpublished or deleted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, Copy, ExternalLink, Eye, Globe, Loader2, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortfolioView } from '@/components/portfolio/portfolio-view';
import { EntryListEditor, TextAreaField, TextField } from '@/components/portfolio/portfolio-editor-fields';
import { ConfirmDialog, CreatePortfolioDialog, PublishDialog, type CreatePortfolioInput } from '@/components/portfolio/portfolio-dialogs';
import {
  deletePortfolio,
  getPortfolio,
  getResumeRecord,
  listPortfolios,
  mintPortfolioId,
  publicPortfolioUrl,
  savePortfolio,
  toPortfolioError,
  type PortfolioApiError,
  type StoredPortfolio,
} from '@/lib/portfolio';
import {
  PORTFOLIO_TEMPLATES,
  buildDocument,
  canonicalFromResume,
  displayName,
  documentWithVisibility,
  emptyCanonical,
  isWebCvDocument,
  normalizeCanonical,
  templateMeta,
  type PortfolioCanonical,
  type PortfolioEducation,
  type PortfolioExperience,
  type PortfolioProject,
  type PortfolioSkill,
} from '@/lib/portfolio-document';
import { cn } from '@/lib/utils';

export function PortfolioBuilderPage() {
  const params = useParams();
  const portfolioId = decodeURIComponent((params['*'] ?? '').split('/')[0] ?? '');
  return portfolioId ? <PortfolioEditor key={portfolioId} portfolioId={portfolioId} /> : <PortfolioList />;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatDate = (value: unknown) => {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
};

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="p-4 lg:p-6 xl:p-8"><div className="mx-auto max-w-5xl space-y-5">{children}</div></div>;
}

function ModuleDisabled() {
  return (
    <PageFrame>
      <h1 className="text-xl font-bold text-ink">Portfolios</h1>
      <section aria-labelledby="portfolio-disabled-heading" className="rounded-2xl border border-border bg-surface p-6">
        <h2 id="portfolio-disabled-heading" className="text-base font-semibold text-ink">Portfolios are turned off</h2>
        <p className="mt-2 text-sm text-ink-secondary">
          An administrator has turned off the portfolio module for this site, so portfolios can’t be created or edited right now.
          Portfolios that were already published stay visible at their addresses.
        </p>
        <Link to="/portfolios" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
          <Globe className="size-4" aria-hidden="true" /> See published portfolios
        </Link>
      </section>
    </PageFrame>
  );
}

function LoadError({ title, error, onRetry }: { title: string; error: PortfolioApiError; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
      <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4 shrink-0" aria-hidden="true" /> {title}</p>
      <p className="mt-1 break-words">{error.message}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}><RotateCcw aria-hidden="true" /> Try again</Button>
    </div>
  );
}

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', published ? 'bg-success-50 text-success-800' : 'bg-neutral-100 text-neutral-700')}>
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

/* ─── List ─── */

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; portfolios: StoredPortfolio[] }
  | { status: 'disabled' }
  | { status: 'error'; error: PortfolioApiError };

function PortfolioList() {
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoredPortfolio | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const deleteReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listPortfolios(controller.signal)
      .then((portfolios) => setState({ status: 'ready', portfolios }))
      .catch((cause: unknown) => {
        const error = toPortfolioError(cause);
        if (error.cancelled) return;
        setState(error.moduleDisabled ? { status: 'disabled' } : { status: 'error', error });
      });
    return () => controller.abort();
  }, [attempt]);

  const create = async ({ title, template, resumeId }: CreatePortfolioInput) => {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const canonical = resumeId ? canonicalFromResume(await getResumeRecord(resumeId), template) : emptyCanonical(template);
      const id = mintPortfolioId();
      await savePortfolio(id, buildDocument({ canonical: { ...canonical, template }, title, isPublished: false }), 0);
      setCreateOpen(false);
      navigate(`/dashboard/portfolio/${encodeURIComponent(id)}`);
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) {
        setCreateOpen(false);
        setState({ status: 'disabled' });
      } else {
        setCreateError(error.message);
      }
    } finally {
      setCreateBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deletePortfolio(deleting.id, deleting.revision);
      setNotice(`“${deleting.title}” was deleted.`);
      setDeleting(null);
      deleteReturnRef.current = newButtonRef.current;
      setAttempt((value) => value + 1);
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.notFound) {
        setNotice(`“${deleting.title}” had already been deleted.`);
        setDeleting(null);
        deleteReturnRef.current = newButtonRef.current;
        setAttempt((value) => value + 1);
      } else if (error.conflict) {
        setDeleteError('This portfolio was changed in another tab or on another device. Cancel to see the latest version, then decide again.');
        setAttempt((value) => value + 1);
      } else {
        setDeleteError(error.message);
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  if (state.status === 'disabled') return <ModuleDisabled />;

  return (
    <PageFrame>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink">Portfolios</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">Publish a Web CV that anyone with the link can see. Drafts stay private.</p>
        </div>
        {state.status === 'ready' && (
          <Button ref={newButtonRef} onClick={() => { setCreateError(null); setCreateOpen(true); }}>
            <Plus aria-hidden="true" /> New portfolio
          </Button>
        )}
      </header>

      <div role="status" className={notice ? 'rounded-xl border border-border bg-surface p-3 text-sm text-ink-secondary' : 'sr-only'}>{notice}</div>

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your portfolios…</p>
      )}

      {state.status === 'error' && <LoadError title="Your portfolios could not be loaded" error={state.error} onRetry={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1); }} />}

      {state.status === 'ready' && state.portfolios.length === 0 && (
        <section className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <Globe className="mx-auto size-10 text-ink-muted" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-ink">You have no portfolios yet</h2>
          <p className="mt-1 text-sm text-ink-secondary">Start from one of your saved resumes or from scratch. It stays a private draft until you publish it.</p>
        </section>
      )}

      {state.status === 'ready' && state.portfolios.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {state.portfolios.map((portfolio) => {
            const url = portfolio.isPublished && portfolio.slug ? publicPortfolioUrl(portfolio.slug) : null;
            const webCv = isWebCvDocument(portfolio);
            return (
              <li key={portfolio.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge published={portfolio.isPublished} />
                  <span className="text-xs text-ink-muted">{webCv ? templateMeta(portfolio.templateKey ?? portfolio.template ?? portfolio.theme).name : 'Earlier page editor'}</span>
                </div>
                <h2 className="mt-2 text-base font-semibold text-ink break-words">{portfolio.title}</h2>
                {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 text-sm text-brand-700 underline-offset-4 hover:underline break-all">{url}<span className="sr-only"> (opens in a new tab)</span></a>}
                {formatDate(portfolio.updatedAt) && <p className="mt-1 text-xs text-ink-muted">Last saved {formatDate(portfolio.updatedAt)}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/dashboard/portfolio/${encodeURIComponent(portfolio.id)}`}>
                      <Pencil aria-hidden="true" /> Open<span className="sr-only"> {portfolio.title}</span>
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => { deleteReturnRef.current = event.currentTarget; setDeleteError(null); setDeleting(portfolio); }}
                  >
                    <Trash2 aria-hidden="true" /> Delete<span className="sr-only"> {portfolio.title}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreatePortfolioDialog
        open={createOpen}
        busy={createBusy}
        error={createError}
        onCreate={(input) => void create(input)}
        onClose={() => setCreateOpen(false)}
        returnFocusRef={newButtonRef}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this portfolio?"
        description={
          <>
            <p>“{deleting?.title}” will be deleted permanently.</p>
            {deleting?.isPublished && deleting.slug && <p>Its public page at {publicPortfolioUrl(deleting.slug)} will stop working.</p>}
          </>
        }
        confirmLabel="Delete portfolio"
        destructive
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
        returnFocusRef={deleteReturnRef}
      />
    </PageFrame>
  );
}

/* ─── Editor ─── */

type EditorState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'disabled' }
  | { status: 'not-found' }
  | { status: 'error'; error: PortfolioApiError };

type VisibilityDialog = null | 'publish' | 'republish' | 'unpublish';

const snapshot = (title: string, canonical: PortfolioCanonical) => JSON.stringify({ title, canonical });
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function PortfolioEditor({ portfolioId }: { portfolioId: string }) {
  const [state, setState] = useState<EditorState>({ status: 'loading' });
  const [stored, setStored] = useState<StoredPortfolio | null>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [canonical, setCanonical] = useState<PortfolioCanonical>(() => emptyCanonical());
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<PortfolioApiError | null>(null);
  const [dialog, setDialog] = useState<VisibilityDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const visibilityButtonRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((portfolio: StoredPortfolio) => {
    const next = normalizeCanonical(portfolio);
    setStored(portfolio);
    setTitle(portfolio.title ?? '');
    setCanonical(next);
    setSavedSnapshot(snapshot(portfolio.title ?? '', next));
  }, []);

  const load = useCallback((signal?: AbortSignal) => {
    setState({ status: 'loading' });
    setSaveError(null);
    getPortfolio(portfolioId, signal)
      .then((portfolio) => { apply(portfolio); setState({ status: 'ready' }); })
      .catch((cause: unknown) => {
        const error = toPortfolioError(cause);
        if (error.cancelled) return;
        setState(error.moduleDisabled ? { status: 'disabled' } : error.notFound ? { status: 'not-found' } : { status: 'error', error });
      });
  }, [apply, portfolioId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const editable = stored ? isWebCvDocument(stored) : false;
  const dirty = Boolean(stored) && editable && snapshot(title, canonical) !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (saveError) alertRef.current?.scrollIntoView({ block: 'nearest' });
  }, [saveError]);

  /** Saves the current edits with the given visibility. Returns the error, or null on success. */
  const persist = async (isPublished: boolean, slugBase?: string): Promise<PortfolioApiError | null> => {
    if (!stored) return null;
    if (editable && !title.trim()) {
      setMode('edit');
      setTitleError('Give your portfolio a title.');
      requestAnimationFrame(() => titleRef.current?.focus());
      return toPortfolioError(new Error('Give your portfolio a title.'));
    }
    const document = editable
      ? buildDocument({ canonical, title, isPublished, slugBase, previous: stored })
      : { ...documentWithVisibility(stored, isPublished), ...(slugBase ? { slug: slugBase } : {}) };
    try {
      const saved = await savePortfolio(stored.id, document, stored.revision);
      apply({ ...stored, ...saved });
      return null;
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) setState({ status: 'disabled' });
      return error;
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const error = await persist(Boolean(stored?.isPublished));
    setSaving(false);
    if (error) {
      if (!titleError && title.trim()) setSaveError(error);
    } else {
      setAnnouncement(stored?.isPublished ? 'Saved. Your published page now shows these changes.' : 'Saved as a private draft.');
    }
  };

  const changeVisibility = async (isPublished: boolean, slugBase?: string) => {
    setDialogError(null);
    setSaving(true);
    const error = await persist(isPublished, slugBase);
    setSaving(false);
    if (!error) {
      setDialog(null);
      setAnnouncement(isPublished ? 'Your portfolio is published.' : 'Your portfolio is unpublished. Its address stays reserved for it.');
      return;
    }
    if (!title.trim()) {
      setDialog(null);
      return;
    }
    setDialogError(error.conflict
      ? 'This portfolio was changed in another tab or on another device. Cancel, reload the latest version, then try again.'
      : error.code === 'PORTFOLIO_SLUG_CONFLICT'
        ? 'That address was taken a moment ago. Choose a different one.'
        : error.message);
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setAnnouncement('Link copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setAnnouncement('The link could not be copied. You can copy the address shown on the page.');
    }
  };

  if (state.status === 'disabled') return <ModuleDisabled />;

  const back = (
    <Link to="/dashboard/portfolio" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> All portfolios
    </Link>
  );

  if (state.status === 'loading' || !stored) {
    return (
      <PageFrame>
        {back}
        {state.status === 'loading' && <p className="flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading portfolio…</p>}
        {state.status === 'not-found' && (
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h1 className="text-xl font-bold text-ink">Portfolio not found</h1>
            <p className="mt-2 text-sm text-ink-secondary">It may have been deleted, or it belongs to another account.</p>
          </section>
        )}
        {state.status === 'error' && <LoadError title="This portfolio could not be loaded" error={state.error} onRetry={() => load()} />}
      </PageFrame>
    );
  }

  const url = stored.isPublished && stored.slug ? publicPortfolioUrl(stored.slug) : null;
  const heading = canonical.heading;
  const setHeading = (patch: Partial<PortfolioCanonical['heading']>) => {
    const next = { ...heading, ...patch };
    next.fullName = [next.firstname, next.lastname].filter(Boolean).join(' ') || next.fullName;
    setCanonical({ ...canonical, heading: next });
  };
  const keptSections = [
    ['certifications', canonical.certifications.length],
    ['achievements', canonical.achievements.length],
    ['languages', canonical.languages.length],
    ['references', canonical.references.length],
    ['interests', canonical.hobbies.length],
    ['custom sections', canonical.customSections.length],
  ].filter(([, count]) => Number(count) > 0) as Array<[string, number]>;

  return (
    <PageFrame>
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink break-words">{stored.title || 'Untitled portfolio'}</h1>
            <StatusBadge published={stored.isPublished} />
          </div>
          <p className="mt-0.5 text-sm text-ink-secondary" aria-live="polite">{editable ? (dirty ? 'Unsaved changes' : 'All changes saved') : 'Built with the earlier page editor'}</p>
          {url && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline break-all">
                {url}<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
              </a>
              <Button size="xs" variant="outline" onClick={() => void copyLink(url)}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? 'Copied' : 'Copy link'}
              </Button>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <div role="group" aria-label="View" className="inline-flex rounded-lg border border-border p-0.5">
              <Button size="sm" variant={mode === 'edit' ? 'secondary' : 'ghost'} aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}><Pencil aria-hidden="true" /> Edit</Button>
              <Button size="sm" variant={mode === 'preview' ? 'secondary' : 'ghost'} aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}><Eye aria-hidden="true" /> Preview</Button>
            </div>
          )}
          {editable && <Button size="sm" variant="outline" onClick={() => void save()} loading={saving && dialog === null} disabled={!dirty || saving}><Save aria-hidden="true" /> Save</Button>}
          {stored.isPublished ? (
            <Button ref={visibilityButtonRef} size="sm" variant="outline" onClick={() => { setDialogError(null); setDialog('unpublish'); }} disabled={saving}>Unpublish</Button>
          ) : (
            <Button ref={visibilityButtonRef} size="sm" onClick={() => { setDialogError(null); setDialog(stored.slug ? 'republish' : 'publish'); }} disabled={saving}><Globe aria-hidden="true" /> Publish</Button>
          )}
        </div>
      </header>

      <p role="status" className="sr-only">{announcement}</p>

      {saveError && (
        <div ref={alertRef} role="alert" className="scroll-mt-4 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
          <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4 shrink-0" aria-hidden="true" /> {saveError.conflict ? 'This portfolio changed elsewhere' : 'Your changes were not saved'}</p>
          <p className="mt-1 break-words">
            {saveError.conflict
              ? 'It was saved in another tab or on another device after you opened it. Reload to get the latest version; your unsaved changes here will be replaced.'
              : saveError.message}
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => (saveError.conflict ? load() : void save())}>
            <RotateCcw aria-hidden="true" /> {saveError.conflict ? 'Reload latest version' : 'Try again'}
          </Button>
        </div>
      )}

      {!editable && (
        <section className="rounded-2xl border border-border bg-surface p-5 text-sm text-ink-secondary">
          This portfolio was built with the earlier page editor. Its content can’t be edited here, but you can publish, unpublish or delete it.
        </section>
      )}

      {editable && mode === 'preview' && (
        <section aria-label="Preview of your portfolio" className="overflow-hidden rounded-2xl border border-border">
          <PortfolioView canonical={canonical} headingLevel={2} />
        </section>
      )}

      {editable && mode === 'edit' && (
        <div className="space-y-5">
          <EditorSection id="portfolio-details" title="Details">
            <div className="grid gap-4">
              <TextField label="Title" value={title} onChange={(value) => { setTitle(value); if (titleError) setTitleError(''); }} error={titleError} required maxLength={160} inputRef={titleRef} hint="Shown on the portfolio list and as the page title." />
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Template</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PORTFOLIO_TEMPLATES.map((option) => (
                    <label key={option.id} className={cn('flex cursor-pointer gap-2 rounded-xl border p-3 text-sm', canonical.template === option.id ? 'border-brand-600 bg-brand-50' : 'border-border')}>
                      <input type="radio" name="editor-template" value={option.id} checked={canonical.template === option.id} onChange={() => setCanonical({ ...canonical, template: option.id })} className="mt-0.5" />
                      <span><span className="block font-medium text-ink">{option.name}</span><span className="block text-xs text-ink-secondary">{option.description}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </EditorSection>

          <EditorSection id="portfolio-profile" title="Profile">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="First name" value={heading.firstname} onChange={(value) => setHeading({ firstname: value })} autoComplete="given-name" />
              <TextField label="Last name" value={heading.lastname} onChange={(value) => setHeading({ lastname: value })} autoComplete="family-name" />
              <TextField label="Occupation" value={heading.occupation} onChange={(value) => setHeading({ occupation: value })} placeholder="e.g. Data analyst" />
              <TextField label="Tagline" value={canonical.extras.tagline} onChange={(value) => setCanonical({ ...canonical, extras: { ...canonical.extras, tagline: value } })} hint="One line under your name." />
              <TextField label="Email" type="email" value={heading.email} onChange={(value) => setHeading({ email: value })} autoComplete="email" hint="Shown publicly when published." />
              <TextField label="Phone" type="tel" value={heading.phone} onChange={(value) => setHeading({ phone: value })} autoComplete="tel" hint="Shown publicly when published." />
              <TextField label="City" value={heading.city} onChange={(value) => setHeading({ city: value })} autoComplete="address-level2" />
              <TextField label="Country" value={heading.country} onChange={(value) => setHeading({ country: value })} autoComplete="country-name" />
              <TextField label="Website" value={heading.website} onChange={(value) => setHeading({ website: value })} placeholder="https://" />
              <TextField label="LinkedIn" value={heading.linkedin} onChange={(value) => setHeading({ linkedin: value })} placeholder="https://www.linkedin.com/in/…" />
              <TextField label="GitHub" value={heading.github} onChange={(value) => setHeading({ github: value })} placeholder="https://github.com/…" />
              <TextField label="Photo URL" value={heading.photo} onChange={(value) => setHeading({ photo: value })} placeholder="https://" hint="A link to an image (http or https)." />
            </div>
            <TextAreaField className="mt-3" label="About" value={canonical.summary} onChange={(value) => setCanonical({ ...canonical, summary: value })} rows={5} hint="A short introduction in your own words." />
          </EditorSection>

          <EditorSection id="portfolio-experience" title="Experience">
            <EntryListEditor<PortfolioExperience>
              noun="Experience"
              entries={canonical.experiences}
              onChange={(experiences) => setCanonical({ ...canonical, experiences })}
              create={() => ({ id: newId('experience'), jobTitle: '', employer: '', begin: '', end: '', description: '', date: canonical.experiences.length + 1, location: '' })}
              emptyText="No experience added."
              fields={[
                { key: 'jobTitle', label: 'Job title' },
                { key: 'employer', label: 'Employer' },
                { key: 'begin', label: 'Start', placeholder: 'e.g. Jan 2022' },
                { key: 'end', label: 'End', placeholder: 'e.g. Present' },
                { key: 'location', label: 'Location', wide: true },
                { key: 'description', label: 'Description', multiline: true },
              ]}
            />
          </EditorSection>

          <EditorSection id="portfolio-projects" title="Projects">
            <EntryListEditor<PortfolioProject>
              noun="Project"
              entries={canonical.projects}
              onChange={(projects) => setCanonical({ ...canonical, projects })}
              create={() => ({ id: newId('project'), title: '', description: '', link: '', technologies: '', technologyList: [], image: '' })}
              normalize={(project) => ({ ...project, technologyList: project.technologies.split(',').map((item) => item.trim()).filter(Boolean) })}
              emptyText="No projects added."
              fields={[
                { key: 'title', label: 'Project name' },
                { key: 'link', label: 'Link', placeholder: 'https://' },
                { key: 'technologies', label: 'Technologies', hint: 'Separate with commas.', wide: true },
                { key: 'description', label: 'Description', multiline: true },
              ]}
            />
          </EditorSection>

          <EditorSection id="portfolio-skills" title="Skills">
            <EntryListEditor<PortfolioSkill>
              noun="Skill"
              entries={canonical.skills}
              onChange={(skills) => setCanonical({ ...canonical, skills })}
              create={() => ({ id: newId('skill'), name: '', skillName: '', rating: 50, category: '' })}
              normalize={(skill) => ({ ...skill, skillName: skill.name })}
              emptyText="No skills added."
              fields={[
                { key: 'name', label: 'Skill' },
                { key: 'category', label: 'Group (optional)', placeholder: 'e.g. Tools' },
              ]}
            />
          </EditorSection>

          <EditorSection id="portfolio-education" title="Education">
            <EntryListEditor<PortfolioEducation>
              noun="Education"
              entries={canonical.education}
              onChange={(education) => setCanonical({ ...canonical, education })}
              create={() => ({ id: newId('education'), school: '', degree: '', started: '', finished: '', description: '', date: canonical.education.length + 1 })}
              emptyText="No education added."
              fields={[
                { key: 'school', label: 'School' },
                { key: 'degree', label: 'Degree' },
                { key: 'started', label: 'Start' },
                { key: 'finished', label: 'End' },
                { key: 'description', label: 'Description', multiline: true },
              ]}
            />
          </EditorSection>

          {keptSections.length > 0 && (
            <EditorSection id="portfolio-kept" title="Also included">
              <p className="text-sm text-ink-secondary">
                These sections came from your resume or an earlier editor. They are kept and published as they are; this builder doesn’t edit them yet.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {keptSections.map(([label, count]) => <li key={label} className="rounded-full bg-neutral-100 px-3 py-1 text-ink-secondary">{count} {count === 1 ? label.replace(/s$/, "") : label}</li>)}
              </ul>
            </EditorSection>
          )}

          {canonical.source.resumeTitle && (
            <p className="text-xs text-ink-muted">Started from the resume “{canonical.source.resumeTitle}”. Changes here don’t change the resume.</p>
          )}
        </div>
      )}

      <PublishDialog
        open={dialog === 'publish'}
        portfolioId={stored.id}
        defaultBase={displayName(canonical) || title}
        busy={saving}
        error={dialogError}
        onPublish={(base) => void changeVisibility(true, base)}
        onClose={() => setDialog(null)}
        returnFocusRef={visibilityButtonRef}
      />
      <ConfirmDialog
        open={dialog === 'republish'}
        title="Publish again?"
        description={<p>Your portfolio will be visible again at {stored.slug ? publicPortfolioUrl(stored.slug) : ''}{dirty ? ', including your unsaved changes' : ''}.</p>}
        confirmLabel="Publish"
        busy={saving}
        error={dialogError}
        onConfirm={() => void changeVisibility(true)}
        onClose={() => setDialog(null)}
        returnFocusRef={visibilityButtonRef}
      />
      <ConfirmDialog
        open={dialog === 'unpublish'}
        title="Unpublish this portfolio?"
        description={
          <>
            <p>Visitors will no longer see it{url ? ` at ${url}` : ''}, and it leaves the public portfolio list. A copy a browser already cached can take a few minutes to clear.</p>
            <p>The address stays reserved, so you can publish it again later.{dirty ? ' Your unsaved changes are saved too.' : ''}</p>
          </>
        }
        confirmLabel="Unpublish"
        destructive
        busy={saving}
        error={dialogError}
        onConfirm={() => void changeVisibility(false)}
        onClose={() => setDialog(null)}
        returnFocusRef={visibilityButtonRef}
      />
    </PageFrame>
  );
}

function EditorSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-2xl border border-border bg-surface p-5">
      <h2 id={`${id}-heading`} className="mb-3 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
