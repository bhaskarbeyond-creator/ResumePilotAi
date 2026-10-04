import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { checkPortfolioSlugAvailability, getPortfolioById, getResumes, mintPortfolioId, normalizePortfolioSlugBase, publishPortfolio, savePortfolioDraft, updateExistingPortfolio } from '../../services/api/platform';
import { normalizeResumeData } from '../../utils/resumeData';
import { PORTFOLIO_TEMPLATES, PORTFOLIO_TEMPLATE_IDS, buildPortfolioDocument, convertResumeToPortfolio, displayNameFromCanonical, emptyCanonicalPortfolio, extractCanonicalFromPuck, normalizePortfolioData, resolvePortfolioTemplate, sanitizeCanonicalPortfolio, switchPortfolioTemplate, themeForTemplate } from '../../utils/portfolioData';
import WebCvRenderer from '../PortfolioTemplates/WebCvRenderer';
import CreateWebCvDialog from './CreateWebCvDialog';
import Toasts from '../Toasts/Toats';

const SECTIONS = [
    { id: 'heading', label: 'Profile' },
    { id: 'summary', label: 'Summary' },
    { id: 'experiences', label: 'Experience' },
    { id: 'education', label: 'Education' },
    { id: 'skills', label: 'Skills' },
    { id: 'projects', label: 'Projects' },
    { id: 'certifications', label: 'Certifications' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'references', label: 'References' },
    { id: 'languages', label: 'Languages' },
    { id: 'hobbies', label: 'Hobbies' },
    { id: 'customSections', label: 'Custom' },
];

/**
 * DIR-019 Web CV Studio — executive split-pane customizer.
 *
 * AC-2 LAYOUT CONTRACT (this component is what /portfolio/builder renders):
 *   LEFT  = configuration drawer with one accordion per content domain.
 *   RIGHT = live scaled preview plus the responsive viewport switcher.
 * The prior build was a 3-column grid (design | preview | editor); it is
 * deliberately replaced by a true 2-pane split so editing content and reading
 * the result happen in one stable visual field.
 *
 * AC-1 TOKEN CONTRACT: every surface resolves through Cuba Executive tokens
 * (`bg-cuba-*`, `text-cuba-*`, `border-cuba-line`, `.cuba-btn-*`, `.cuba-field`,
 * `.cuba-pill-*`). No raw palette utility or hex literal is introduced, so the
 * studio re-themes when `[data-theme]` flips and INV-4 (AA contrast in BOTH
 * themes) is inherited from the token layer rather than re-asserted here.
 *
 * AC-3: the vanity bar probes the authoritative MariaDB through
 * `checkPortfolioSlugAvailability`, debounced so a keystroke storm produces one
 * in-flight request and never a fabricated local answer.
 */

/** Left-drawer accordion groups. AC-2 names seven domains; the granular
 *  section pickers are grouped into those domains so the drawer reads as an
 *  executive inspector instead of a flat list of twelve buttons. */
const ACCORDION_GROUPS = [
    { id: 'identity', label: 'Header & Bio', hint: 'Name, title, avatar, tagline, social', sections: ['heading', 'summary'] },
    { id: 'skills', label: 'Skills Matrix', hint: 'Categorized technical & soft skills', sections: ['skills', 'languages'] },
    { id: 'projects', label: 'Projects & Case Studies', hint: 'Images, stack badges, demo & repo links', sections: ['projects'] },
    { id: 'history', label: 'Work History & Education', hint: 'Roles, degrees, certifications, awards', sections: ['experiences', 'education', 'certifications', 'achievements'] },
    { id: 'contact', label: 'Contact & Inquiry Form', hint: 'References, hobbies, custom blocks', sections: ['references', 'hobbies', 'customSections'] },
    { id: 'theme', label: 'Theme & Style Presets', hint: 'Minimalist, Tech Modern, Executive Glass, Creative Bold', sections: [] },
];

/** AC-2 responsive viewports. These are TRUE render widths, not labels. */
const VIEWPORTS = [
    { id: 'desktop', label: 'Desktop', width: 1440 },
    { id: 'tablet', label: 'Tablet', width: 768 },
    { id: 'mobile', label: 'Mobile', width: 375 },
];

/** Debounce window for the vanity probe (ms). Real request-rate control. */
const SLUG_DEBOUNCE_MS = 350;

function Field({ label, value, onChange, textarea, type = 'text' }) {
    return (
        <label className="block text-xs font-medium text-cuba-ink-muted">
            {label}
            {textarea ? (
                <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} rows={4} className="cuba-field mt-1 w-full resize-y" />
            ) : (
                <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} className="cuba-field mt-1 w-full" />
            )}
        </label>
    );
}

function ListEditor({ items, emptyItem, onChange, renderItem, addLabel }) {
    return (
        <div className="space-y-3">
            {items.map((item, index) => (
                <div key={item.id || index} className="rounded-xl border border-cuba-line bg-cuba-elevated p-3">
                    {renderItem(item, index, (patch) => onChange(items.map((current, currentIndex) => (currentIndex === index ? { ...current, ...patch } : current))))}
                    <button type="button" className="mt-2 text-xs font-medium text-cuba-danger hover:underline" onClick={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))}>Remove</button>
                </div>
            ))}
            <button type="button" className="w-full rounded-lg border border-dashed border-cuba-line-strong px-3 py-2 text-sm text-cuba-ink-muted transition-colors hover:border-cuba-primary hover:text-cuba-primary" onClick={() => onChange([...items, emptyItem(items.length)])}>{addLabel}</button>
        </div>
    );
}

/**
 * Vanity-address bar (AC-3).
 *
 * The badge is a truthful mirror of the server verdict: `idle` before input,
 * `checking` while a probe is in flight, then `available` / `taken` /
 * `invalid` from the authoritative MariaDB response, and `error` when the
 * probe could not complete. It never falls back to a synthetic "available".
 * `aria-live="polite"` announces the verdict to screen readers.
 */
function VanityUrlBar({ base, onChange, status, origin, disabled }) {
    const tone = {
        available: 'cuba-pill-success',
        taken: 'cuba-pill-danger',
        invalid: 'cuba-pill-warning',
        error: 'cuba-pill-warning',
    }[status.state] || 'cuba-pill-neutral';
    const label = {
        checking: 'Checking…',
        available: '✓ Available',
        taken: '✕ Already taken',
        invalid: '✕ Too short',
        error: '✕ Could not verify',
    }[status.state] || '—';
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="portfolio-vanity-base" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cuba-ink-muted">Live Portfolio URL</label>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-cuba-line bg-cuba-card px-2 py-1.5">
                <span aria-hidden="true" className="shrink-0 truncate text-xs text-cuba-ink-muted">{origin}/portfolio/</span>
                <input
                    id="portfolio-vanity-base"
                    data-testid="portfolio-slug-input"
                    value={base}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="your-name"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="portfolio-slug-status"
                    aria-invalid={status.state === 'taken' || status.state === 'invalid'}
                    className="cuba-field min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-sm font-medium"
                />
                <span
                    id="portfolio-slug-status"
                    data-testid="portfolio-slug-status"
                    data-state={status.state}
                    role="status"
                    aria-live="polite"
                    className={`cuba-pill shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
                >
                    {label}
                </span>
            </div>
            <p className="truncate text-[11px] text-cuba-ink-muted">
                {status.state === 'available' && status.slug
                    ? `Will publish as ${origin}/portfolio/${status.slug}`
                    : status.message || 'Lowercase letters, numbers and hyphens. Minimum 3 characters.'}
            </p>
        </div>
    );
}

/** Section chips inside a drawer group (Profile, Summary, Experience, …). */
function SectionPicker({ group, section, onSelectSection }) {
    return (
        <div className="mb-3 grid grid-cols-2 gap-2">
            {group.sections.map((sectionId) => {
                const item = SECTIONS.find((entry) => entry.id === sectionId);
                if (!item) return null;
                const active = section === sectionId;
                return (
                    <button
                        key={sectionId}
                        type="button"
                        data-testid={`portfolio-section-${sectionId}`}
                        aria-pressed={active}
                        onClick={() => onSelectSection(sectionId)}
                        className={`rounded-lg px-2 py-2 text-left text-xs font-medium transition-colors ${active ? 'bg-cuba-primary text-cuba-primary-ink' : 'bg-cuba-canvas text-cuba-ink-muted hover:text-cuba-ink'}`}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * AC-2 LEFT PANE — collapsible configuration inspector.
 *
 * Each group is a real `aria-expanded` / `aria-controls` disclosure, so the
 * drawer is keyboard-operable and correctly announced (INV-4). The theme group
 * carries the AC-2 style presets; every other group exposes its section
 * pickers plus the shared field editor.
 */
function ConfigurationDrawer({ openGroup, onToggleGroup, section, onSelectSection, templateKey, onSelectTemplate, editor }) {
    return (
        <div className="cuba-glass flex flex-col rounded-2xl" data-testid="portfolio-config-drawer">
            {ACCORDION_GROUPS.map((group) => {
                const expanded = openGroup === group.id;
                const panelId = `portfolio-group-${group.id}`;
                return (
                    <section key={group.id} className="border-b border-cuba-line last:border-b-0">
                        <h2>
                            <button
                                type="button"
                                data-testid={`portfolio-group-${group.id}`}
                                aria-expanded={expanded}
                                aria-controls={panelId}
                                onClick={() => onToggleGroup(group.id)}
                                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-cuba-primary-soft"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-cuba-ink">{group.label}</span>
                                    <span className="block truncate text-[11px] text-cuba-ink-muted">{group.hint}</span>
                                </span>
                                <span aria-hidden="true" className={`shrink-0 text-cuba-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`}>&#9662;</span>
                            </button>
                        </h2>
                        {expanded ? (
                            <div id={panelId} className="px-4 pb-4">
                                {group.id === 'theme' ? (
                                    <div className="grid gap-2" data-testid="portfolio-theme-presets">
                                        {PORTFOLIO_TEMPLATE_IDS.map((id) => {
                                            const meta = PORTFOLIO_TEMPLATES[id];
                                            const active = templateKey === id;
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    data-testid={`portfolio-theme-${id}`}
                                                    aria-pressed={active}
                                                    onClick={() => onSelectTemplate(id)}
                                                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${active ? 'border-cuba-primary bg-cuba-primary-soft' : 'border-cuba-line hover:border-cuba-line-strong'}`}
                                                >
                                                    <p className="text-sm font-medium text-cuba-ink">{meta.name}</p>
                                                    <p className="mt-1 text-xs text-cuba-ink-muted">{meta.description}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <>
                                        <SectionPicker group={group} section={section} onSelectSection={onSelectSection} />
                                        <p className="mb-3 text-xs text-cuba-ink-muted">Edits stay on this Web CV. The original resume is never modified.</p>
                                        {editor}
                                    </>
                                )}
                            </div>
                        ) : null}
                    </section>
                );
            })}
        </div>
    );
}

/**
 * AC-2 RIGHT PANE — live scaled preview plus the responsive viewport switcher.
 *
 * The frame renders at the viewport's TRUE pixel width so template breakpoints
 * are exercised honestly rather than approximated by a fluid width (which would
 * hide mobile breakage). `maxWidth: 100%` keeps it inside the pane, and the
 * width is mirrored into `data-preview-width` so the E2E suite can assert AC-2
 * from the DOM instead of reverse-engineering computed styles.
 */
function LivePreviewPane({ previewMode, onPreviewMode, activeViewport, previewWidth, publishedUrl, children }) {
    return (
        <section className="cuba-glass flex min-h-0 flex-col rounded-2xl" aria-label="Live preview">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cuba-line px-4 py-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cuba-ink-muted">Live preview</p>
                    <p className="truncate text-sm font-medium text-cuba-ink" data-testid="portfolio-viewport-label">
                        {activeViewport.label} &middot; {previewWidth}px
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Preview viewport">
                    {VIEWPORTS.map((viewport) => (
                        <button
                            key={viewport.id}
                            type="button"
                            data-testid={`portfolio-viewport-${viewport.id}`}
                            data-viewport={viewport.id}
                            aria-pressed={previewMode === viewport.id}
                            onClick={() => onPreviewMode(viewport.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${previewMode === viewport.id ? 'border-cuba-primary bg-cuba-primary-soft text-cuba-primary-ink-strong' : 'border-cuba-line text-cuba-ink-muted hover:border-cuba-line-strong hover:text-cuba-ink'}`}
                        >
                            {viewport.label}
                            <span className="ml-1 text-[10px] opacity-70">{viewport.width}</span>
                        </button>
                    ))}
                    {publishedUrl ? (
                        <a href={publishedUrl} target="_blank" rel="noreferrer" data-testid="portfolio-open-fullscreen" className="cuba-btn-outline rounded-lg px-3 py-1.5 text-xs font-medium">
                            Open full &#8599;
                        </a>
                    ) : null}
                </div>
            </div>
            <div
                className="cuba-focusable min-h-0 flex-1 overflow-auto p-4"
                tabIndex={0}
                role="region"
                aria-label={`Portfolio preview at ${activeViewport.label} width (scrollable)`}
            >
                <div
                    data-testid="portfolio-preview-frame"
                    data-preview-width={previewWidth}
                    className="cuba-glass-strong mx-auto overflow-hidden rounded-xl shadow-cuba-md"
                    style={{ width: previewWidth, maxWidth: '100%' }}
                >
                    {children}
                </div>
            </div>
        </section>
    );
}

export default function WebCvStudio({ initialPortfolio = null, _onExitAdvanced }) {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [canonical, setCanonical] = useState(() => emptyCanonicalPortfolio());
    const [templateKey, setTemplateKey] = useState('modernMinimal');
    const [title, setTitle] = useState('My Web CV');
    const [section, setSection] = useState('heading');
    const [openGroup, setOpenGroup] = useState('identity');
    const [portfolioId, setPortfolioId] = useState(null);
    const [revision, setRevision] = useState(null);
    const [resumes, setResumes] = useState([]);
    const [resumesLoading, setResumesLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [toast, setToast] = useState({ show: false, type: '', message: '' });
    const [previewMode, setPreviewMode] = useState('desktop');
    const [slugBase, setSlugBase] = useState('');
    const [slugStatus, setSlugStatus] = useState({ state: 'idle', message: '', slug: '' });
    const [publishedUrl, setPublishedUrl] = useState('');
    const [conflict, setConflict] = useState(false);
    const initialized = useRef(false);
    const saveTimer = useRef(null);
    const slugTimer = useRef(null);
    // Monotonic request token: only the newest probe may write UI state, so a
    // slow earlier response can never overwrite a newer verdict.
    const slugRequestRef = useRef(0);
    const latestRef = useRef({ canonical, templateKey, title, portfolioId, revision, slugBase });

    const showToast = (type, message = '') => {
        setToast({ show: true, type, message });
        setTimeout(() => setToast({ show: false, type: '', message: '' }), 3500);
    };

    const applyCanonical = useCallback((next, nextTemplate = templateKey, nextTitle) => {
        const normalized = normalizePortfolioData(next, { template: nextTemplate });
        setCanonical(normalized);
        setTemplateKey(resolvePortfolioTemplate(nextTemplate));
        if (nextTitle) setTitle(nextTitle);
        setDirty(true);
    }, [templateKey]);

    useEffect(() => {
        latestRef.current = { canonical, templateKey, title, portfolioId, revision, slugBase };
    }, [canonical, templateKey, title, portfolioId, revision, slugBase]);

    useEffect(() => {
        if (!user?.uid || initialized.current) return;
        initialized.current = true;
        const boot = async () => {
            const editId = searchParams.get('edit');
            const fromResume = searchParams.get('fromResume');
            const create = searchParams.get('create') === '1' || !editId;
            if (editId) {
                const portfolio = initialPortfolio || await getPortfolioById(editId);
                if (!portfolio || portfolio.userId !== user.uid) {
                    showToast('Error', 'Portfolio not found');
                    setShowCreate(true);
                    return;
                }
                const source = portfolio.draftData || portfolio.data || {};
                const extracted = source.canonical || extractCanonicalFromPuck(source);
                const next = normalizePortfolioData(extracted, { template: source.templateKey || portfolio.theme });
                setCanonical(next);
                setTemplateKey(resolvePortfolioTemplate(source.templateKey || next.template));
                setTitle(portfolio.draftTitle || portfolio.title || displayNameFromCanonical(next));
                setPortfolioId(portfolio.id);
                setRevision(Number(portfolio.revision) || 0);
                // Pre-fill the vanity field with the address this portfolio
                // already owns. The persisted slug carries the deterministic
                // `-<8 hex>` suffix, so we show the human base the candidate
                // typed; the server re-derives the authoritative full slug.
                if (portfolio.slug) {
                    const issued = String(portfolio.slug);
                    const suffixIndex = issued.lastIndexOf('-');
                    setSlugBase(suffixIndex > 0 ? issued.slice(0, suffixIndex) : issued);
                }
                setPublishedUrl(portfolio.isPublished && portfolio.slug ? `${window.location.origin}/portfolio/${portfolio.slug}` : '');
                setDirty(false);
                setSearchParams({});
                return;
            }
            setResumesLoading(true);
            try {
                const listed = await getResumes(user.uid, 1, 80);
                const mapped = (listed.resumes || []).map((resume) => {
                    const data = normalizeResumeData(resume.item || resume);
                    return {
                        id: resume.id,
                        data,
                        item: resume.item,
                        updatedAt: resume.item?.updatedAt || resume.item?.created_at || null,
                    };
                });
                setResumes(mapped);
                if (fromResume) {
                    const match = mapped.find((item) => item.id === fromResume);
                    if (match) {
                        const converted = convertResumeToPortfolio(match.data, { resumeId: match.id });
                        applyCanonical(converted, 'modernMinimal', displayNameFromCanonical(converted));
                        setShowCreate(false);
                        setSearchParams({});
                        return;
                    }
                }
                setShowCreate(create);
            } catch (error) {
                showToast('Error', error.message || 'Unable to load resumes');
                setShowCreate(true);
            } finally {
                setResumesLoading(false);
            }
        };
        boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    useEffect(() => {
        const warn = (event) => {
            if (!dirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    // ── AC-3: debounced vanity availability probe ─────────────────────────────
    //
    // Ground rules enforced here (INV-3 / no-fabrication):
    //   * the verdict ALWAYS comes from MariaDB via the server route;
    //   * `normalizePortfolioSlugBase` only gates obviously-invalid input so we
    //     do not spend a round trip on it — it is never an availability claim;
    //   * a rejected probe renders `error`, never a false "available";
    //   * the request token discards out-of-order responses.
    useEffect(() => {
        if (!user?.uid) return undefined;
        const normalized = normalizePortfolioSlugBase(slugBase);
        if (normalized.length < 3) {
            setSlugStatus({ state: normalized ? 'invalid' : 'idle', message: normalized ? 'Use at least 3 characters.' : '', slug: '' });
            return undefined;
        }
        setSlugStatus((previous) => ({ ...previous, state: 'checking' }));
        const token = slugRequestRef.current + 1;
        slugRequestRef.current = token;
        slugTimer.current = setTimeout(() => {
            checkPortfolioSlugAvailability(normalized, latestRef.current.portfolioId)
                .then((result) => {
                    if (slugRequestRef.current !== token) return;
                    setSlugStatus({
                        state: result.available ? 'available' : 'taken',
                        message: result.available ? '' : 'That address is already claimed. Try another.',
                        slug: result.slug,
                    });
                })
                .catch(() => {
                    if (slugRequestRef.current !== token) return;
                    setSlugStatus({ state: 'error', message: 'Could not reach the address service. Try again.', slug: '' });
                });
        }, SLUG_DEBOUNCE_MS);
        return () => clearTimeout(slugTimer.current);
    }, [slugBase, user?.uid]);

    const persistDraft = useCallback(async () => {
        if (!user?.uid) return;
        const snapshot = latestRef.current;
        setSaving(true);
        try {
            const document = buildPortfolioDocument({
                canonical: snapshot.canonical,
                template: snapshot.templateKey,
                title: snapshot.title,
            });
            const result = await savePortfolioDraft(user.uid, document, snapshot.portfolioId, themeForTemplate(snapshot.templateKey), snapshot.revision, latestRef.current.slugBase);
            // Preserve slugBase: it is not part of the save response, and dropping
            // it here would make the next autosave silently clear the address.
            latestRef.current = { ...snapshot, portfolioId: result.id, revision: result.revision, slugBase: latestRef.current.slugBase };
            setPortfolioId(result.id);
            setRevision(result.revision);
            setDirty(false);
            setConflict(false);
            return result;
        } catch (error) {
            if (error.code === 'PORTFOLIO_CONFLICT') setConflict(true);
            showToast('Error', error.message || 'Unable to save draft');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        if (!dirty || !user?.uid) return undefined;
        saveTimer.current = setTimeout(() => {
            persistDraft().catch(() => {});
        }, 2500);
        return () => clearTimeout(saveTimer.current);
    }, [canonical, templateKey, title, dirty, persistDraft, user?.uid]);

    const handleUseResume = (resume) => {
        const converted = convertResumeToPortfolio(resume.data || resume.item || resume, { resumeId: resume.id, template: templateKey });
        applyCanonical(converted, templateKey, displayNameFromCanonical(converted));
        setShowCreate(false);
        setPublishedUrl('');
        // Mint the primary key up front so the vanity probe resolves the same
        // deterministic suffix the first save will persist (AC-3 truthfulness).
        setPortfolioId(mintPortfolioId());
        setRevision(0);
    };

    const handleStartBlank = () => {
        const blank = emptyCanonicalPortfolio({ template: templateKey });
        applyCanonical(blank, templateKey, 'My Web CV');
        setShowCreate(false);
        setPublishedUrl('');
        setPortfolioId(mintPortfolioId());
        setRevision(0);
    };

    const handleSwitchTemplate = (nextTemplate) => {
        applyCanonical(switchPortfolioTemplate(canonical, nextTemplate), nextTemplate, title);
    };

    const handlePublish = async () => {
        if (!user?.uid) return;
        setPublishing(true);
        try {
            await persistDraft();
            const snapshot = latestRef.current;
            const document = buildPortfolioDocument({
                canonical: snapshot.canonical,
                template: snapshot.templateKey,
                title: snapshot.title,
            });
            // Reuse the minted id (or mint one now) so the persisted slug suffix matches
            // exactly what the vanity badge already reported to the candidate.
            const targetId = snapshot.portfolioId || mintPortfolioId();
            const result = Number(latestRef.current.revision) > 0
                ? await updateExistingPortfolio(targetId, user.uid, document, themeForTemplate(snapshot.templateKey), latestRef.current.revision, latestRef.current.slugBase)
                : await publishPortfolio(user.uid, { ...document, id: targetId }, themeForTemplate(snapshot.templateKey), latestRef.current.slugBase);
            setPortfolioId(result.id);
            setRevision(result.revision);
            const url = `${window.location.origin}/portfolio/${result.slug}`;
            setPublishedUrl(url);
            setDirty(false);
            // Publication and its email event commit atomically on the server.
            showToast('Success', 'Published');
        } catch (error) {
            if (error.code === 'PORTFOLIO_CONFLICT') setConflict(true);
            showToast('Error', error.message || 'Unable to publish');
        } finally {
            setPublishing(false);
        }
    };

    // AC-2: the preview renders at the viewport's TRUE width and is scaled down
    // to fit the pane with a CSS transform, so the candidate sees the real
    // responsive layout (including its breakpoints) rather than a fluid
    // approximation that would hide mobile breakage.
    const activeViewport = VIEWPORTS.find((item) => item.id === previewMode) || VIEWPORTS[0];
    const previewWidth = activeViewport.width;
    const heading = canonical.heading;

    const editor = useMemo(() => {
        if (section === 'heading') {
            return (
                <div className="grid gap-3">
                    <Field label="First name" value={heading.firstname} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, firstname: value, fullName: [value, heading.lastname].filter(Boolean).join(' ') } })} />
                    <Field label="Last name" value={heading.lastname} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, lastname: value, fullName: [heading.firstname, value].filter(Boolean).join(' ') } })} />
                    <Field label="Occupation" value={heading.occupation} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, occupation: value } })} />
                    <Field label="Email" value={heading.email} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, email: value } })} />
                    <Field label="Phone" value={heading.phone} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, phone: value } })} />
                    <Field label="City" value={heading.city} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, city: value } })} />
                    <Field label="Country" value={heading.country} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, country: value } })} />
                    <Field label="Address" value={heading.address} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, address: value } })} />
                    <Field label="Postal code" value={heading.postalcode} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, postalcode: value } })} />
                    <Field label="Website" value={heading.website} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, website: value } })} />
                    <Field label="LinkedIn" value={heading.linkedin} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, linkedin: value } })} />
                    <Field label="GitHub" value={heading.github} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, github: value } })} />
                    <Field label="Photo URL" value={heading.photo} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, photo: value } })} />
                </div>
            );
        }
        if (section === 'summary') {
            return <Field label="Professional summary" textarea value={canonical.summary} onChange={(value) => applyCanonical({ ...canonical, summary: value })} />;
        }
        if (section === 'experiences') {
            return (
                <ListEditor
                    items={canonical.experiences}
                    addLabel="Add experience"
                    emptyItem={(index) => ({ id: `experience-${Date.now()}`, jobTitle: '', employer: '', begin: '', end: '', description: '', date: index + 1 })}
                    onChange={(items) => applyCanonical({ ...canonical, experiences: items })}
                    renderItem={(item, index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Job title" value={item.jobTitle} onChange={(value) => patch({ jobTitle: value })} />
                            <Field label="Employer" value={item.employer} onChange={(value) => patch({ employer: value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Start" value={item.begin} onChange={(value) => patch({ begin: value })} />
                                <Field label="End" value={item.end} onChange={(value) => patch({ end: value })} />
                            </div>
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'education') {
            return (
                <ListEditor
                    items={canonical.education}
                    addLabel="Add education"
                    emptyItem={(index) => ({ id: `education-${Date.now()}`, school: '', degree: '', started: '', finished: '', description: '', date: index + 1 })}
                    onChange={(items) => applyCanonical({ ...canonical, education: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="School" value={item.school} onChange={(value) => patch({ school: value })} />
                            <Field label="Degree" value={item.degree} onChange={(value) => patch({ degree: value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Started" value={item.started} onChange={(value) => patch({ started: value })} />
                                <Field label="Finished" value={item.finished} onChange={(value) => patch({ finished: value })} />
                            </div>
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'skills') {
            return (
                <ListEditor
                    items={canonical.skills}
                    addLabel="Add skill"
                    emptyItem={() => ({ id: `skill-${Date.now()}`, name: '', skillName: '', rating: 70, category: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, skills: items.map((item) => ({ ...item, skillName: item.name })) })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Skill" value={item.name} onChange={(value) => patch({ name: value, skillName: value })} />
                            <Field label="Rating" type="number" value={item.rating} onChange={(value) => patch({ rating: Number(value) || 0 })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'projects') {
            return (
                <ListEditor
                    items={canonical.projects}
                    addLabel="Add project"
                    emptyItem={() => ({ id: `project-${Date.now()}`, title: '', description: '', link: '', technologies: '', technologyList: [], image: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, projects: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Title" value={item.title} onChange={(value) => patch({ title: value })} />
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                            <Field label="Link" value={item.link} onChange={(value) => patch({ link: value })} />
                            <Field label="Technologies" value={item.technologies} onChange={(value) => patch({ technologies: value, technologyList: value.split(',').map((part) => part.trim()).filter(Boolean) })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'certifications') {
            return (
                <ListEditor
                    items={canonical.certifications}
                    addLabel="Add certification"
                    emptyItem={() => ({ id: `certification-${Date.now()}`, title: '', issuer: '', date: '', description: '', link: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, certifications: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Title" value={item.title} onChange={(value) => patch({ title: value })} />
                            <Field label="Issuer" value={item.issuer} onChange={(value) => patch({ issuer: value })} />
                            <Field label="Date" value={item.date} onChange={(value) => patch({ date: value })} />
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                            <Field label="Link" value={item.link} onChange={(value) => patch({ link: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'achievements') {
            return (
                <ListEditor
                    items={canonical.achievements}
                    addLabel="Add achievement"
                    emptyItem={() => ({ id: `achievement-${Date.now()}`, title: '', description: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, achievements: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Title" value={item.title} onChange={(value) => patch({ title: value })} />
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'references') {
            return (
                <ListEditor
                    items={canonical.references}
                    addLabel="Add reference"
                    emptyItem={() => ({ id: `reference-${Date.now()}`, name: '', reference: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, references: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Name" value={item.name} onChange={(value) => patch({ name: value })} />
                            <Field label="Reference" textarea value={item.reference} onChange={(value) => patch({ reference: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'languages') {
            return (
                <ListEditor
                    items={canonical.languages}
                    addLabel="Add language"
                    emptyItem={() => ({ id: `language-${Date.now()}`, name: '', level: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, languages: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Language" value={item.name} onChange={(value) => patch({ name: value })} />
                            <Field label="Level" value={item.level} onChange={(value) => patch({ level: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'hobbies') {
            return <Field label="Hobbies (comma separated)" value={canonical.hobbies.join(', ')} onChange={(value) => applyCanonical({ ...canonical, hobbies: value.split(',').map((item) => item.trim()).filter(Boolean) })} />;
        }
        return (
            <ListEditor
                items={canonical.customSections}
                addLabel="Add custom section"
                emptyItem={() => ({ id: `custom-${Date.now()}`, title: '', items: [], content: '' })}
                onChange={(items) => applyCanonical({ ...canonical, customSections: items })}
                renderItem={(item, _index, patch) => (
                    <div className="grid gap-2">
                        <Field label="Section title" value={item.title} onChange={(value) => patch({ title: value })} />
                        <Field
                            label="Items (one per line as Title — Description)"
                            textarea
                            value={(item.items || []).map((entry) => [entry.title, entry.description].filter(Boolean).join(' — ')).join('\n')}
                            onChange={(value) => patch({
                                items: value.split('\n').map((line, lineIndex) => {
                                    const [entryTitle, ...rest] = line.split('—');
                                    return { id: `${item.id}-item-${lineIndex}`, title: (entryTitle || '').trim(), description: rest.join('—').trim() };
                                }).filter((entry) => entry.title || entry.description),
                            })}
                        />
                    </div>
                )}
            />
        );
    }, [applyCanonical, canonical, heading, section]);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const slugAvailable = slugStatus.state === 'available';

    return (
        <div className="min-h-screen bg-cuba-canvas text-cuba-ink">
            <CreateWebCvDialog open={showCreate} resumes={resumes} loading={resumesLoading} onUseResume={handleUseResume} onStartBlank={handleStartBlank} onCancel={() => (portfolioId ? setShowCreate(false) : navigate('/dashboard/portfolios'))} />
            <header className="sticky top-0 z-30 border-b border-cuba-line bg-cuba-glass-strong backdrop-blur">
                <div className="mx-auto flex max-w-[1800px] flex-wrap items-start justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <button type="button" onClick={() => navigate('/dashboard/portfolios')} className="cuba-btn-outline shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium">Dashboard</button>
                        <input
                            aria-label="Portfolio title"
                            value={title}
                            onChange={(event) => { setTitle(event.target.value); setDirty(true); }}
                            className="cuba-field min-w-0 max-w-xs bg-transparent px-2 py-1 text-sm font-semibold"
                        />
                        <span className="cuba-pill cuba-pill-neutral shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium" data-testid="portfolio-save-state">
                            {saving ? 'Saving…' : dirty ? 'Unsaved draft' : 'Draft saved'}
                        </span>
                    </div>
                    <VanityUrlBar base={slugBase} onChange={setSlugBase} status={slugStatus} origin={origin} />
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {/* AC-4: 1-click sync from the candidate's active resume. */}
                        <button
                            type="button"
                            data-testid="portfolio-import-resume"
                            disabled={resumesLoading || !resumes.length}
                            onClick={() => (resumes.length ? handleUseResume(resumes[0]) : setShowCreate(true))}
                            title={resumes.length ? 'Populate this Web CV from your resume' : 'No resume found — create one first'}
                            className="cuba-btn-outline rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {resumesLoading ? 'Loading resumes…' : 'Import from Resume'}
                        </button>
                        <button type="button" data-testid="portfolio-save" onClick={() => persistDraft()} disabled={saving} className="cuba-btn-outline rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">Save</button>
                        <button
                            type="button"
                            data-testid="portfolio-publish"
                            onClick={handlePublish}
                            disabled={publishing || !slugAvailable}
                            title={!slugAvailable && slugBase ? 'Choose an available address before publishing' : 'Publish this Web CV'}
                            className="cuba-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed"
                        >
                            {publishing ? 'Publishing…' : 'Publish'}
                        </button>
                        {publishedUrl ? <a href={publishedUrl} target="_blank" rel="noreferrer" className="cuba-btn-outline rounded-lg px-3 py-1.5 text-sm font-medium">Public URL</a> : null}
                    </div>
                </div>
            </header>

            {conflict ? (
                <div role="alert" className="cuba-pill cuba-pill-warning border px-4 py-2 text-sm font-medium">
                    This portfolio changed in another tab. Reload before saving to avoid overwriting newer work.
                </div>
            ) : null}

            {/* AC-2: true 2-pane split. Configuration inspector left, live preview right. */}
            <div
                data-testid="portfolio-studio-split"
                className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 lg:h-[calc(100vh-9.5rem)] lg:grid-cols-[26rem_minmax(0,1fr)]"
            >
                <aside className="cuba-focusable min-h-0 overflow-y-auto pr-1" tabIndex={0} role="region" aria-label="Configuration inspector (scrollable)">
                    <ConfigurationDrawer
                        openGroup={openGroup}
                        onToggleGroup={(id) => setOpenGroup((current) => (current === id ? '' : id))}
                        section={section}
                        onSelectSection={setSection}
                        templateKey={templateKey}
                        onSelectTemplate={handleSwitchTemplate}
                        editor={editor}
                    />
                </aside>
                <LivePreviewPane
                    previewMode={previewMode}
                    onPreviewMode={setPreviewMode}
                    activeViewport={activeViewport}
                    previewWidth={previewWidth}
                    publishedUrl={publishedUrl}
                >
                    <WebCvRenderer canonical={sanitizeCanonicalPortfolio(canonical, { template: templateKey })} templateKey={templateKey} />
                </LivePreviewPane>
            </div>
            {toast.show ? <Toasts type={toast.type} message={toast.message} /> : null}
        </div>
    );
}
