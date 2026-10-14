import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import { FaBriefcase, FaFileAlt, FaTrashAlt, FaExternalLinkAlt, FaStar } from 'react-icons/fa';
import { AuthContext } from '../../../context/AuthContext';
import {
    getCoverById,
    getFavouritesForWorkspace,
    getJobById,
    getJobFavouritesForWorkspace,
    getResumeById,
    removeFromFavourites,
} from '../../../services/api/platform';
import { formatSafeDate } from '../../../utils/subscriptionUtils.js';
import {
    CubaBadge,
    CubaButton,
    CubaCard,
    CubaEmptyState,
    CubaErrorState,
    CubaLoadingState,
    CubaPageHeader,
} from '../../cuba';

/**
 * DashboardFavourites — the candidate "Saved Favorites & Bookmarks" workspace.
 *
 * DIR-056 SUB-056-4. Before this rewrite the entire view was gated behind
 * `props.isFavoritesShowed === true` (the old modal contract). The `favorites`
 * route never passed that prop, so `/dashboard/favorites` rendered a completely
 * blank white screen. It is now a first-class full-page Cuba workspace that
 * always renders, reading BOTH saved documents (`/api/favourites`) and saved
 * jobs (`/api/favourites?type=job`) from the real MariaDB-backed API.
 *
 * It never invents rows: a zero-result read is a real empty state (§46), and a
 * failed read is a real error state with a working retry.
 */

const TABS = Object.freeze([
    { id: 'all', label: 'All' },
    { id: 'documents', label: 'Documents' },
    { id: 'jobs', label: 'Jobs' },
]);

const COVER_TYPES = Object.freeze(['cover', 'coverletter', 'cover-letter']);

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const firstText = (...values) => values.map(cleanText).find(Boolean) || '';

const isJobFavourite = (row) => String(row?.itemType || '').toLowerCase() === 'job';
const isCoverFavourite = (row) => COVER_TYPES.includes(String(row?.itemType || '').toLowerCase());

/** Newest first; rows without a timestamp sort last but never crash. */
const byNewest = (a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
};

/**
 * Normalise a raw `/api/favourites` row into the view model this workspace
 * renders. `entity` is an optional enriched record (the job/resume/cover) used
 * only to fill fields the stored payload did not carry.
 */
const toViewModel = (row, { kind, entity }) => {
    const payload = row || {};
    const source = entity || payload;
    if (kind === 'job') {
        return {
            key: `job:${payload.itemId}`,
            kind: 'job',
            documentType: null,
            id: payload.itemId,
            createdAt: payload.createdAt || null,
            title: firstText(source.title, source.jobTitle, payload.title, payload.jobTitle) || 'Saved job',
            company: firstText(source.company, source.companyName, payload.company, payload.companyName),
            location: firstText(source.location, payload.location),
            salary: firstText(source.salary, payload.salary),
            summary: firstText(source.description, payload.description),
            badge: 'Job',
            badgeTone: 'info',
        };
    }
    const cover = isCoverFavourite(payload);
    const personName = [firstText(payload.firstName, payload.firstname), firstText(payload.lastName, payload.lastname)]
        .filter(Boolean)
        .join(' ');
    return {
        key: `${cover ? 'cover' : 'resume'}:${payload.itemId}`,
        kind: 'document',
        documentType: cover ? 'cover' : 'resume',
        id: payload.itemId,
        createdAt: payload.createdAt || null,
        title: firstText(source.title, source.resumeTitle, payload.title, payload.resumeTitle, personName)
            || (cover ? 'Cover letter' : 'Resume'),
        company: firstText(source.companyName, payload.companyName, source.company, payload.company),
        location: '',
        salary: '',
        summary: firstText(source.summary, source.objective, payload.summary, payload.objective),
        badge: cover ? 'Cover letter' : 'Resume',
        badgeTone: cover ? 'warning' : 'primary',
    };
};

const EMPTY_COPY = Object.freeze({
    all: {
        title: 'Nothing saved yet',
        description: 'Bookmark jobs or save documents and they will appear here for quick access.',
    },
    documents: {
        title: 'No saved documents',
        description: 'You have not saved any resumes or cover letters yet.',
    },
    jobs: {
        title: 'No saved jobs',
        description: 'Bookmark a job from the job portal and it will appear here.',
    },
});

const DashboardFavourites = ({ showToast, t }) => {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const userId = user?.uid || user?.uuid || null;

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [tab, setTab] = useState('all');
    const [pendingKeys, setPendingKeys] = useState(() => new Set());
    const [reloadToken, setReloadToken] = useState(0);
    const pendingKeysRef = useRef(new Set());
    const mountedRef = useRef(false);
    const tabsRef = useRef(new Map());

    const load = useCallback(async (active) => {
        if (!userId) {
            setItems([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError('');
        try {
            const [documentRows, jobRows] = await Promise.all([
                getFavouritesForWorkspace(userId),
                getJobFavouritesForWorkspace(userId),
            ]);
            if (!active()) return;

            const documents = (Array.isArray(documentRows) ? documentRows : []).filter((row) => !isJobFavourite(row));
            const jobs = (Array.isArray(jobRows) ? jobRows : []).filter(isJobFavourite);

            // The stored payload is often empty (jobs are saved as `{}`), so
            // enrich only the rows that genuinely lack a display title.
            const enrichedDocuments = await Promise.all(documents.map(async (row) => {
                let entity = null;
                if (!firstText(row.title, row.resumeTitle, row.summary, row.objective, row.companyName)) {
                    entity = await (isCoverFavourite(row) ? getCoverById(row.itemId) : getResumeById(row.itemId)).catch(() => null);
                }
                return toViewModel(row, { kind: 'document', entity });
            }));
            if (!active()) return;

            const enrichedJobs = await Promise.all(jobs.map(async (row) => {
                let entity = null;
                if (!firstText(row.title, row.jobTitle, row.company, row.companyName)) {
                    entity = await getJobById(row.itemId).catch(() => null);
                }
                return toViewModel(row, { kind: 'job', entity });
            }));
            if (!active()) return;

            setItems([...enrichedDocuments, ...enrichedJobs].sort(byNewest));
        } catch (_error) {
            if (!active()) return;
            setLoadError('Your saved favourites could not be loaded. Please try again.');
        } finally {
            if (active()) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        let alive = true;
        mountedRef.current = true;
        load(() => alive);
        return () => {
            alive = false;
            mountedRef.current = false;
        };
    }, [load, reloadToken]);

    const handleRetry = useCallback(() => setReloadToken((token) => token + 1), []);

    const handleOpen = useCallback((item) => {
        if (item.kind === 'job') {
            navigate(`/dashboard/jobs/portal/${encodeURIComponent(item.id)}`);
            return;
        }
        if (item.documentType === 'cover') {
            navigate('/dashboard/cover-letters');
            return;
        }
        // Resume: open it in the builder, mirroring the proven ResumeCard path.
        try {
            localStorage.setItem('currentResumeId', item.id);
            localStorage.removeItem('currentResumeItem');
        } catch (_error) { /* storage unavailable — navigation still works */ }
        navigate('/build-resume/heading');
    }, [navigate]);

    const handleRemove = useCallback(async (item) => {
        if (pendingKeysRef.current.has(item.key)) return;
        pendingKeysRef.current.add(item.key);
        setPendingKeys(new Set(pendingKeysRef.current));
        // Optimistic: drop the row immediately, roll back if the server refuses.
        setItems((current) => current.filter((row) => row.key !== item.key));
        try {
            const result = await removeFromFavourites(userId, item.id);
            if (result && result.success === false) {
                throw new Error(result.error || 'remove failed');
            }
            showToast?.('success', 'Removed from favourites', `${item.title} was removed from your saved favourites.`);
        } catch (_error) {
            if (mountedRef.current) {
                // Restore only this row so a concurrent successful removal stays removed.
                setItems((current) => current.some((row) => row.key === item.key)
                    ? current
                    : [...current, item].sort(byNewest));
                showToast?.('error', 'Could not remove favourite', 'That favourite is still saved. Please try again.');
            }
        } finally {
            pendingKeysRef.current.delete(item.key);
            if (mountedRef.current) setPendingKeys(new Set(pendingKeysRef.current));
        }
    }, [showToast, userId]);

    const counts = useMemo(() => ({
        all: items.length,
        documents: items.filter((row) => row.kind === 'document').length,
        jobs: items.filter((row) => row.kind === 'job').length,
    }), [items]);

    const visible = useMemo(() => {
        if (tab === 'documents') return items.filter((row) => row.kind === 'document');
        if (tab === 'jobs') return items.filter((row) => row.kind === 'job');
        return items;
    }, [items, tab]);

    const emptyActions = tab === 'documents'
        ? {
            primary: { label: 'Create a resume', onClick: () => navigate('/build-resume/heading?new=1') },
            secondary: { label: 'Create a cover letter', onClick: () => navigate('/dashboard/cover-letters') },
        }
        : tab === 'all'
            ? {
                primary: { label: 'Browse jobs', onClick: () => navigate('/dashboard/jobs') },
                secondary: { label: 'Create a resume', onClick: () => navigate('/build-resume/heading?new=1') },
            }
            : { primary: { label: 'Browse jobs', onClick: () => navigate('/dashboard/jobs') } };

    const renderBody = () => {
        if (loading) return <CubaLoadingState label="Loading saved favourites" rows={4} />;
        if (loadError) return <CubaErrorState title="Could not load favourites" message={loadError} onRetry={handleRetry} />;
        if (visible.length === 0) {
            return (
                <CubaEmptyState
                    icon={<FaStar className="h-5 w-5" aria-hidden="true" />}
                    title={EMPTY_COPY[tab].title}
                    description={EMPTY_COPY[tab].description}
                    action={<CubaButton variant="primary" onClick={emptyActions.primary.onClick}>{emptyActions.primary.label}</CubaButton>}
                    secondaryAction={emptyActions.secondary && (
                        <CubaButton variant="outline" onClick={emptyActions.secondary.onClick}>{emptyActions.secondary.label}</CubaButton>
                    )}
                />
            );
        }
        return (
            <ul className="space-y-3" data-testid="favourites-list">
                {visible.map((item) => {
                    const savedLabel = formatSafeDate(item.createdAt);
                    const meta = [item.company, item.location, item.salary].filter(Boolean).join(' · ');
                    return (
                        <li key={item.key}>
                            <CubaCard
                                as="article"
                                className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                                data-testid="favourite-row"
                            >
                                <div className="flex min-w-0 items-start gap-3">
                                    <span
                                        className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary"
                                        aria-hidden="true"
                                    >
                                        {item.kind === 'job' ? <FaBriefcase className="h-4 w-4" /> : <FaFileAlt className="h-4 w-4" />}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="truncate text-sm font-semibold text-cuba-ink">{item.title}</h2>
                                            <CubaBadge tone={item.badgeTone}>{item.badge}</CubaBadge>
                                        </div>
                                        {meta && <p className="mt-1 text-xs text-cuba-ink-muted">{meta}</p>}
                                        {item.summary && (
                                            <p
                                                className="mt-1 text-xs text-cuba-ink-muted"
                                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                            >
                                                {item.summary}
                                            </p>
                                        )}
                                        {savedLabel && <p className="mt-1 text-[11px] text-cuba-ink-subtle">Saved {savedLabel}</p>}
                                    </div>
                                </div>
                                <div className="flex flex-none items-center gap-2">
                                    <CubaButton
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpen(item)}
                                        icon={<FaExternalLinkAlt className="h-3.5 w-3.5" aria-hidden="true" />}
                                        aria-label={`Open ${item.title}`}
                                    >
                                        Open
                                    </CubaButton>
                                    <CubaButton
                                        variant="ghost"
                                        size="sm"
                                        loading={pendingKeys.has(item.key)}
                                        onClick={() => handleRemove(item)}
                                        icon={<FaTrashAlt className="h-3.5 w-3.5" aria-hidden="true" />}
                                        aria-label={`Remove ${item.title} from favourites`}
                                    >
                                        Remove
                                    </CubaButton>
                                </div>
                            </CubaCard>
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <section className="space-y-6" data-testid="dashboard-favourites">
            <CubaPageHeader
                eyebrow="Saved"
                title={t('dashNew.favourites')}
                subtitle={t('dashNew.favouitesDesc')}
                actions={(
                    <CubaButton variant="outline" size="sm" onClick={handleRetry} loading={loading}>
                        Refresh
                    </CubaButton>
                )}
            />
            <div role="tablist" aria-label="Filter saved favourites" className="flex flex-wrap items-center gap-2">
                {TABS.map((entry, index) => {
                    const selected = tab === entry.id;
                    return (
                        <button
                            key={entry.id}
                            type="button"
                            role="tab"
                            id={`favourites-tab-${entry.id}`}
                            aria-selected={selected}
                            aria-controls="favourites-panel"
                            tabIndex={selected ? 0 : -1}
                            ref={(node) => {
                                if (node) tabsRef.current.set(entry.id, node);
                                else tabsRef.current.delete(entry.id);
                            }}
                            onClick={() => setTab(entry.id)}
                            onKeyDown={(event) => {
                                let targetIndex = null;
                                if (event.key === 'ArrowRight') targetIndex = (index + 1) % TABS.length;
                                if (event.key === 'ArrowLeft') targetIndex = (index - 1 + TABS.length) % TABS.length;
                                if (event.key === 'Home') targetIndex = 0;
                                if (event.key === 'End') targetIndex = TABS.length - 1;
                                if (targetIndex === null) return;
                                event.preventDefault();
                                const target = TABS[targetIndex];
                                setTab(target.id);
                                tabsRef.current.get(target.id)?.focus();
                            }}
                            className={selected
                                ? 'cuba-focusable inline-flex items-center gap-2 rounded-full bg-cuba-primary-fill px-4 py-1.5 text-[13px] font-semibold text-cuba-on-primary'
                                : 'cuba-focusable inline-flex items-center gap-2 rounded-full border border-cuba-line-strong px-4 py-1.5 text-[13px] font-semibold text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-cuba-ink'}
                        >
                            {entry.label}
                            <span className="text-[11px] opacity-80">{counts[entry.id]}</span>
                        </button>
                    );
                })}
            </div>
            <div id="favourites-panel" role="tabpanel" tabIndex={0} aria-labelledby={`favourites-tab-${tab}`} aria-busy={loading}>
                {renderBody()}
            </div>
        </section>
    );
};

const MyComponent = withTranslation('common')(DashboardFavourites);
export default MyComponent;
