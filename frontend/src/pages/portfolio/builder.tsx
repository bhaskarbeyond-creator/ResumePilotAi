/**
 * Portfolio builder: /dashboard/portfolio (the candidate's portfolios) and
 * /dashboard/portfolio/:portfolioId (one portfolio). The legacy paths
 * /dashboard/portfolios and /portfolio/builder redirect here.
 *
 * Everything goes through the real portfolio API (lib/portfolio.ts) and the
 * shared Web CV document contract (lib/portfolio-document.ts):
 * - A new portfolio is saved as a private draft first, so every editor URL
 *   refers to a stored record that survives reload.
 * - Saves are revision-checked with the stored revision. A 409 means the portfolio
 *   changed in another tab or device: the candidate gets an explicit conflict
 *   dialog (keep local and overwrite, inspect the remote changes, or discard and
 *   reload) and nothing is overwritten until they choose.
 * - The editor and a live preview sit side by side on desktop and stack on
 *   phones; the preview renders the same PortfolioView the public page uses, from
 *   the same canonical document, and can be switched between desktop and mobile
 *   widths. Section visibility toggles apply to the preview immediately.
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
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Copy, Eye, ExternalLink, Globe, Link2, Loader2, Monitor, Pencil, Plus, RotateCcw, Save, Share2, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortfolioView } from '@/components/portfolio/portfolio-view';
import { EntryListEditor, TextAreaField, TextField, VisibilityControls } from '@/components/portfolio/portfolio-editor-fields';
import {
  ConflictDialog,
  ConfirmDialog,
  CreatePortfolioDialog,
  CustomDomainDialog,
  PublishDialog,
  type CreatePortfolioInput,
} from '@/components/portfolio/portfolio-dialogs';
import { SharePublicationDialog } from '@/components/portfolio/share-publication';
import {
  deletePortfolio,
  extractStoredCustomDomain,
  getPortfolio,
  getResumeRecord,
  listPortfolios,
  mintPortfolioId,
  publicPortfolioUrl,
  publishPortfolioSlug,
  savePortfolio,
  toPortfolioError,
  unpublishPortfolioById,
  type CustomDomainConfig,
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
  hasHiddenSections,
  isWebCvDocument,
  normalizeCanonical,
  normalizeVisibility,
  templateMeta,
  type PortfolioCanonical,
  type PortfolioEducation,
  type PortfolioExperience,
  type PortfolioVisibility,
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

/**
 * Shown only for HTTP 403 + code PORTFOLIO_MODULE_DISABLED (see
 * PortfolioApiError.moduleDisabled). An unrelated 403 keeps its own error state.
 * Editing and publishing stay unavailable; reading published portfolios does not.
 */
function ModuleDisabled() {
  return (
    <PageFrame>
      <h1 className="text-xl font-bold text-ink">Portfolios</h1>
      <section aria-labelledby="portfolio-disabled-heading" className="rounded-2xl border border-border bg-surface p-6">
        <h2 id="portfolio-disabled-heading" className="text-base font-semibold text-ink">Portfolios are turned off</h2>
        <p role="status" className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>The portfolio module is currently disabled by system administration.</span>
        </p>
        <p className="mt-3 text-sm text-ink-secondary">
          Portfolios can’t be created, edited or published while the module is off. Portfolios that were already
          published stay visible at their public addresses.
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
  const creatingRef = useRef(false);

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
    // One draft per click: a second submit (double click, Strict Mode replay) is
    // ignored while the first is in flight, so no duplicate rows are created.
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const canonical = resumeId ? canonicalFromResume(await getResumeRecord(resumeId), template) : emptyCanonical(template);
      const id = mintPortfolioId();
      const saved = await savePortfolio(
        id,
        buildDocument({ canonical: { ...canonical, template }, title, isPublished: false }),
        0, // expectedRevision 0 = create
      );
      // Only an acknowledged, persisted record counts as a draft. Anything else
      // would be a browser-only object pretending to be stored.
      if (String(saved?.id ?? '') !== id || Number(saved?.revision) < 1) {
        throw toPortfolioError(new Error('The draft was not confirmed by the server. Please try again.'));
      }
      creatingRef.current = false;
      setCreateBusy(false);
      setCreateOpen(false);
      navigate(`/dashboard/portfolio/${encodeURIComponent(id)}`);
      return;
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) {
        setCreateOpen(false);
        setState({ status: 'disabled' });
      } else {
        setCreateError(error.message);
      }
    } finally {
      creatingRef.current = false;
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

type EditorDialog = null | 'publish' | 'unpublish' | 'custom-domain' | 'share';
type PreviewDevice = 'desktop' | 'mobile';

/** The server version behind an unresolved 409, plus the local edits it collided with. */
interface SaveConflict {
  remote: StoredPortfolio;
  remoteCanonical: PortfolioCanonical;
  localTitle: string;
  localCanonical: PortfolioCanonical;
  /** Revision this tab's copy was based on, for the dialog's explanation. */
  baseRevision: number | null;
  /** True once the candidate chose "decide later": saving stays blocked. */
  deferred: boolean;
}

const snapshot = (title: string, canonical: PortfolioCanonical) => JSON.stringify({ title, canonical });
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function PortfolioEditor({ portfolioId }: { portfolioId: string }) {
  const [state, setState] = useState<EditorState>({ status: 'loading' });
  const [stored, setStored] = useState<StoredPortfolio | null>(null);
  const [customDomainConfig, setCustomDomainConfig] = useState<CustomDomainConfig | null>(null);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [canonical, setCanonical] = useState<PortfolioCanonical>(() => emptyCanonical());
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<PortfolioApiError | null>(null);
  const [dialog, setDialog] = useState<EditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const visibilityButtonRef = useRef<HTMLButtonElement>(null);
  const domainButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const conflictButtonRef = useRef<HTMLButtonElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  /** Guards against a slow response from an older save overwriting newer state. */
  const saveSeq = useRef(0);

  const apply = useCallback((portfolio: StoredPortfolio) => {
    const next = normalizeCanonical(portfolio);
    setStored(portfolio);
    setTitle(portfolio.title ?? '');
    setCanonical(next);
    setSavedSnapshot(snapshot(portfolio.title ?? '', next));
    const storedDomain = extractStoredCustomDomain(portfolio);
    if (storedDomain) setCustomDomainConfig(storedDomain);
  }, []);

  const load = useCallback((signal?: AbortSignal) => {
    setState({ status: 'loading' });
    setSaveError(null);
    getPortfolio(portfolioId, signal)
      .then((portfolio) => {
        // A reload replaces local edits only after the current version is known.
        saveSeq.current += 1;
        apply(portfolio);
        setConflict(null);
        setConflictOpen(false);
        setState({ status: 'ready' });
      })
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
  const visibility = normalizeVisibility(canonical.visibility);
  const dirty = Boolean(stored) && editable && snapshot(title, canonical) !== savedSnapshot;
  const saveBlocked = conflict !== null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (saveError) alertRef.current?.scrollIntoView({ block: 'nearest' });
  }, [saveError]);

  useEffect(() => {
    if (conflict && !conflictOpen) conflictRef.current?.scrollIntoView({ block: 'center' });
  }, [conflict, conflictOpen]);

  /** Captures the current edits plus the newer server version for the dialog. */
  const openConflict = useCallback(async (baseRevision: number | null, localTitle: string, localCanonical: PortfolioCanonical) => {
    setSaveError(null);
    try {
      const remote = await getPortfolio(portfolioId);
      setConflict({
        remote,
        remoteCanonical: normalizeCanonical(remote),
        localTitle,
        localCanonical,
        baseRevision,
        deferred: true,
      });
      setConflictError(null);
      // The inline alert names the conflict and offers every resolution; the
      // detailed comparison stays behind an explicit "Inspect remote changes".
      setConflictOpen(false);
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) {
        setState({ status: 'disabled' });
        return;
      }
      // Without the server version there is still a conflict to resolve: the
      // candidate can retry by reloading the page. Nothing is overwritten.
      setSaveError(error);
      setAnnouncement('The portfolio changed on the server, and the newest version could not be loaded.');
    }
  }, [portfolioId]);

  /**
   * Saves with the given publication state. Resolves to the error (null on
   * success). A 409 never resolves silently: it opens the conflict dialog and the
   * local edits stay exactly as they are.
   */
  const persist = useCallback(async (isPublished: boolean, slugBase?: string): Promise<PortfolioApiError | null> => {
    if (!stored) return null;
    if (editable && !title.trim()) {
      setTitleError('Give your portfolio a title.');
      requestAnimationFrame(() => titleRef.current?.focus());
      return toPortfolioError(new Error('Give your portfolio a title.'));
    }
    const document = editable
      ? buildDocument({ canonical, title, isPublished, slugBase, previous: stored })
      : // A document this builder cannot edit: flip publication only, and keep
        // every stored section (including ones hidden by visibility flags).
        { ...documentWithVisibility(stored, isPublished), ...(slugBase ? { slug: slugBase } : {}) };
    const sequence = saveSeq.current + 1;
    saveSeq.current = sequence;
    try {
      const saved = await savePortfolio(stored.id, document, stored.revision);
      if (sequence !== saveSeq.current) return null; // a newer save owns the state
      apply({ ...stored, ...saved });
      setConflict(null);
      return null;
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) {
        setState({ status: 'disabled' });
        return error;
      }
      if (error.conflict && sequence === saveSeq.current) {
        await openConflict(stored.revision, title, canonical);
      }
      return error;
    }
  }, [apply, canonical, editable, openConflict, stored, title]);

  const save = async () => {
    if (saving || saveBlocked) return;
    setSaving(true);
    setSaveError(null);
    const error = await persist(Boolean(stored?.isPublished));
    setSaving(false);
    if (error) {
      if (error.conflict) return; // the dialog explains it
      if (!titleError && title.trim()) setSaveError(error);
    } else {
      setAnnouncement(stored?.isPublished ? 'Saved. Your published page now shows these changes.' : 'Saved as a private draft.');
    }
  };

  const handlePublishSlug = async (slug: string) => {
    if (!stored || saving) return;
    setDialogError(null);
    setSaving(true);
    if (dirty && editable) {
      const draftSaveError = await persist(stored.isPublished);
      if (draftSaveError) {
        setSaving(false);
        if (draftSaveError.conflict) {
          setDialog(null);
          return;
        }
        if (!title.trim()) { setDialog(null); return; }
        setDialogError(draftSaveError.message);
        return;
      }
    }
    try {
      const result = await publishPortfolioSlug(stored.id, slug);
      setStored((previous) =>
        previous
          ? {
              ...previous,
              ...result.portfolio,
              slug: result.slug ?? slug,
              isPublished: result.isPublished,
              publishedAt: result.publishedAt ?? previous.publishedAt,
            }
          : previous,
      );
      setDialog(null);
      setAnnouncement('Your portfolio is published.');
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) { setState({ status: 'disabled' }); return; }
      if (error.slugConflict) {
        setDialogError(`The URL slug “${slug}” is already claimed. Please choose another slug.`);
      } else if (error.conflict) {
        setDialog(null);
        await openConflict(stored.revision, title, canonical);
      } else {
        setDialogError(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublishPortfolio = async () => {
    if (!stored || saving) return;
    setDialogError(null);
    setSaving(true);
    try {
      const result = await unpublishPortfolioById(stored.id, stored.slug);
      setStored((previous) =>
        previous ? { ...previous, ...result.portfolio, slug: result.slug, isPublished: result.isPublished } : previous,
      );
      setDialog(null);
      setAnnouncement('Your portfolio has been unpublished.');
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) { setState({ status: 'disabled' }); return; }
      setDialogError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const refreshPortfolioRecord = useCallback(async () => {
    const fresh = await getPortfolio(portfolioId);
    apply(fresh);
  }, [apply, portfolioId]);

  /* ── Conflict resolution ── */

  const keepLocalOverwrite = async () => {
    if (!conflict || conflictBusy) return;
    setConflictBusy(true);
    setConflictError(null);
    const document = buildDocument({
      canonical: conflict.localCanonical,
      title: conflict.localTitle,
      isPublished: Boolean(conflict.remote.isPublished || stored?.isPublished),
      previous: conflict.remote,
    });
    try {
      // Overwrite against the CURRENT server revision — never the stale one — and
      // only because the candidate chose to.
      const saved = await savePortfolio(conflict.remote.id, document, conflict.remote.revision);
      saveSeq.current += 1;
      apply({ ...conflict.remote, ...saved });
      setConflict(null);
      setConflictOpen(false);
      setAnnouncement('Your version was saved over the server version.');
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) { setState({ status: 'disabled' }); return; }
      if (error.conflict) {
        try {
          const newest = await getPortfolio(portfolioId);
          setConflict((current) => current ? { ...current, remote: newest, remoteCanonical: normalizeCanonical(newest) } : current);
          setConflictError('Another change landed on the server while this dialog was open. Compare the newest server version, then decide again.');
        } catch {
          setConflictError(error.message);
        }
      } else {
        setConflictError(error.message);
      }
    } finally {
      setConflictBusy(false);
    }
  };

  const discardAndReload = async () => {
    if (conflictBusy) return;
    setConflictBusy(true);
    setConflictError(null);
    try {
      // Fetch the current version at the moment of the decision, not the one from
      // the failed save, so the candidate really gets the newest content.
      const fresh = await getPortfolio(portfolioId);
      saveSeq.current += 1;
      apply(fresh);
      setConflict(null);
      setConflictOpen(false);
      setSaveError(null);
      setAnnouncement('Reloaded the server version. Your unsaved changes were discarded.');
    } catch (cause) {
      const error = toPortfolioError(cause);
      if (error.moduleDisabled) { setState({ status: 'disabled' }); return; }
      setConflictError(error.message);
    } finally {
      setConflictBusy(false);
    }
  };

  const decideLater = () => {
    setConflictOpen(false);
    setAnnouncement('Save is blocked until you resolve the conflict with the server version.');
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setAnnouncement('Link copied.');
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
  const setVisibility = (next: PortfolioVisibility) => setCanonical({ ...canonical, visibility: next });
  const keptSections = [
    ['certifications', canonical.certifications.length],
    ['achievements', canonical.achievements.length],
    ['languages', canonical.languages.length],
    ['references', canonical.references.length],
    ['interests', canonical.hobbies.length],
    ['custom sections', canonical.customSections.length],
  ].filter(([, count]) => Number(count) > 0) as Array<[string, number]>;

  const editorColumn = (
    <div className="min-w-0 space-y-5">
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

      <EditorSection id="portfolio-visible" title="Visible sections">
        <VisibilityControls visibility={visibility} onChange={setVisibility} />
        {hasHiddenSections(canonical) && (
          <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            Some sections are hidden. Their content is still saved and can be shown again at any time.
          </p>
        )}
      </EditorSection>

      <EditorSection id="portfolio-profile" title="Profile">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="First name" value={heading.firstname} onChange={(value) => setHeading({ firstname: value })} autoComplete="given-name" />
          <TextField label="Last name" value={heading.lastname} onChange={(value) => setHeading({ lastname: value })} autoComplete="family-name" />
          <TextField label="Occupation" value={heading.occupation} onChange={(value) => setHeading({ occupation: value })} placeholder="e.g. Data analyst" />
          <TextField label="Tagline" value={canonical.extras.tagline} onChange={(value) => setCanonical({ ...canonical, extras: { ...canonical.extras, tagline: value } })} hint="One line under your name." />
          <TextField label="Email" type="email" value={heading.email} onChange={(value) => setHeading({ email: value })} autoComplete="email" hint="Shown publicly when published and when contact details are visible." />
          <TextField label="Phone" type="tel" value={heading.phone} onChange={(value) => setHeading({ phone: value })} autoComplete="tel" hint="Shown publicly when published and when contact details are visible." />
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
            {keptSections.map(([label, count]) => <li key={label} className="rounded-full bg-neutral-100 px-3 py-1 text-ink-secondary">{count} {count === 1 ? label.replace(/s$/, '') : label}</li>)}
          </ul>
        </EditorSection>
      )}

      {canonical.source.resumeTitle && (
        <p className="text-xs text-ink-muted">Started from the resume “{canonical.source.resumeTitle}”. Changes here don’t change the resume.</p>
      )}
    </div>
  );

  const previewColumn = (
    <section
      aria-label="Live preview of your portfolio"
      className="min-w-0 self-start rounded-2xl border border-border bg-surface lg:sticky lg:top-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Live preview</h2>
        <div role="group" aria-label="Preview width" className="inline-flex rounded-lg border border-border p-0.5">
          <Button size="xs" variant={device === 'desktop' ? 'secondary' : 'ghost'} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
            <Monitor aria-hidden="true" /> Desktop
          </Button>
          <Button size="xs" variant={device === 'mobile' ? 'secondary' : 'ghost'} aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
            <Smartphone aria-hidden="true" /> Mobile
          </Button>
        </div>
      </div>
      <div className="min-w-0 overflow-hidden p-3">
        <div
          data-preview-width={device}
          className={cn(
            'mx-auto min-w-0 overflow-hidden rounded-xl border border-border bg-canvas',
            device === 'mobile' ? 'w-[375px] max-w-full' : 'w-full',
          )}
        >
          <PortfolioView canonical={canonical} headingLevel={2} />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {device === 'mobile'
            ? 'Previewing the phone layout (375px wide).'
            : 'Previewing the desktop layout.'} Hidden sections are left out here, exactly as on the public page.
        </p>
      </div>
    </section>
  );

  return (
    <PageFrame>
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink break-words">{stored.title || 'Untitled portfolio'}</h1>
            <StatusBadge published={stored.isPublished} />
            {customDomainConfig && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  customDomainConfig.status === 'VERIFIED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900',
                )}
              >
                {customDomainConfig.status === 'VERIFIED'
                  ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  : <Clock className="size-3.5 shrink-0" aria-hidden="true" />}
                <span>
                  {customDomainConfig.domain} ·{' '}
                  {customDomainConfig.status === 'VERIFIED' ? 'Verified' : 'Pending verification'}
                </span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-secondary" aria-live="polite">
            {editable ? (dirty ? 'Unsaved changes' : 'All changes saved') : 'Built with the earlier page editor'}
          </p>
          {url && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline break-all">
                {url}<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
              </a>
              <Button size="xs" variant="outline" onClick={() => void copyLink(url)}>
                <Copy aria-hidden="true" /> Copy URL
              </Button>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button ref={shareButtonRef} size="sm" variant="outline" onClick={() => setDialog('share')}>
            <Share2 aria-hidden="true" /> Share
          </Button>
          <Button
            ref={domainButtonRef}
            size="sm"
            variant="outline"
            onClick={() => { setDialogError(null); setDialog('custom-domain'); }}
            disabled={saving}
          >
            <Link2 aria-hidden="true" /> Custom domain
          </Button>
          {editable && (
            <Button size="sm" variant="outline" onClick={() => void save()} loading={saving && dialog === null} disabled={!dirty || saving || saveBlocked}>
              <Save aria-hidden="true" /> Save
            </Button>
          )}
          {stored.isPublished ? (
            <Button ref={visibilityButtonRef} size="sm" variant="outline" onClick={() => { setDialogError(null); setDialog('unpublish'); }} disabled={saving}>Unpublish portfolio</Button>
          ) : (
            <Button ref={visibilityButtonRef} size="sm" onClick={() => { setDialogError(null); setDialog('publish'); }} disabled={saving || saveBlocked}><Globe aria-hidden="true" /> Publish</Button>
          )}
        </div>
      </header>

      <p role="status" className="sr-only">{announcement}</p>

      {conflict && (
        <div ref={conflictRef} role="alert" className="scroll-mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" /> This portfolio changed elsewhere — saving is paused
          </p>
          <p className="mt-1">
            It was saved in another tab or on another device after you opened it. Your edits are still here and nothing was
            overwritten. Choose what happens next.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void keepLocalOverwrite()} disabled={conflictBusy}>
              <Save aria-hidden="true" /> Keep local & overwrite
            </Button>
            <Button ref={conflictButtonRef} size="sm" variant="outline" onClick={() => { setConflictError(null); setConflictOpen(true); }} disabled={conflictBusy}>
              <Eye aria-hidden="true" /> Inspect remote changes
            </Button>
            <Button size="sm" variant="outline" onClick={() => void discardAndReload()} disabled={conflictBusy}>
              <RotateCcw aria-hidden="true" /> Discard changes and reload latest version
            </Button>
          </div>
          {conflictError && (
            <p className="mt-2 flex items-start gap-1.5 font-medium">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">{conflictError}</span>
            </p>
          )}
        </div>
      )}

      {saveError && (
        <div ref={alertRef} role="alert" className="scroll-mt-4 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
          <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4 shrink-0" aria-hidden="true" /> Your changes were not saved</p>
          <p className="mt-1 break-words">{saveError.message}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void save()} disabled={saveBlocked}>
            <RotateCcw aria-hidden="true" /> Try again
          </Button>
        </div>
      )}

      {!editable && (
        <section className="rounded-2xl border border-border bg-surface p-5 text-sm text-ink-secondary">
          This portfolio was built with the earlier page editor. Its content can’t be edited here, but you can publish, unpublish or delete it.
        </section>
      )}

      {editable ? (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:items-start">
          {editorColumn}
          {previewColumn}
        </div>
      ) : (
        <section aria-label="Preview of your portfolio" className="min-w-0 overflow-hidden rounded-2xl border border-border">
          <PortfolioView canonical={canonical} headingLevel={2} />
        </section>
      )}

      <SharePublicationDialog
        open={dialog === 'share'}
        title={stored.title || displayName(canonical) || 'My portfolio'}
        slug={stored.slug}
        isPublished={stored.isPublished}
        publishedAt={stored.publishedAt}
        onPublish={() => { setDialog(null); setDialogError(null); setDialog('publish'); }}
        onClose={() => setDialog(null)}
        returnFocusRef={shareButtonRef}
      />
      <PublishDialog
        open={dialog === 'publish'}
        portfolioId={stored.id}
        defaultBase={displayName(canonical) || title}
        initialSlug={stored.slug}
        busy={saving}
        error={dialogError}
        onPublish={(slug) => void handlePublishSlug(slug)}
        onClose={() => setDialog(null)}
        returnFocusRef={visibilityButtonRef}
      />
      <CustomDomainDialog
        open={dialog === 'custom-domain'}
        portfolioId={stored.id}
        initialConfig={customDomainConfig}
        onConfigUpdated={(config) => {
          setCustomDomainConfig(config);
          setAnnouncement(`Custom domain ${config.domain} registered. Pending DNS TXT verification.`);
        }}
        onRefreshPortfolio={refreshPortfolioRecord}
        onClose={() => setDialog(null)}
        returnFocusRef={domainButtonRef}
      />
      <ConflictDialog
        open={conflictOpen && conflict !== null}
        local={conflict ? { title: conflict.localTitle, canonical: conflict.localCanonical } : { title, canonical }}
        remote={conflict
          ? { title: conflict.remote.title ?? '', canonical: conflict.remoteCanonical, revision: Number(conflict.remote.revision), updatedAt: conflict.remote.updatedAt ?? null }
          : { title: '', canonical: emptyCanonical(), revision: 0, updatedAt: null }}
        baseRevision={conflict?.baseRevision ?? null}
        busy={conflictBusy}
        error={conflictError}
        onKeepLocal={() => void keepLocalOverwrite()}
        onDiscardAndReload={() => void discardAndReload()}
        onDecideLater={decideLater}
        returnFocusRef={conflictButtonRef}
      />
      <ConfirmDialog
        open={dialog === 'unpublish'}
        title="Unpublish this portfolio?"
        description={
          <>
            <p>Your public portfolio{url ? ` at ${url}` : ''} will no longer be accessible to visitors.</p>
            <p>Your URL slug stays preserved unless removed by the server, so you can publish it again whenever you are ready.</p>
          </>
        }
        confirmLabel="Unpublish portfolio"
        destructive
        busy={saving}
        error={dialogError}
        onConfirm={() => void handleUnpublishPortfolio()}
        onClose={() => setDialog(null)}
        returnFocusRef={visibilityButtonRef}
      />
    </PageFrame>
  );
}

function EditorSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 rounded-2xl border border-border bg-surface p-5">
      <h2 id={`${id}-heading`} className="mb-3 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
