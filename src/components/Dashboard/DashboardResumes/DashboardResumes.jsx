import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import {
    FiChevronLeft,
    FiChevronRight,
    FiCopy,
    FiDownload,
    FiEdit3,
    FiEye,
    FiFileText,
    FiMoreHorizontal,
    FiPlus,
    FiSearch,
    FiShare2,
    FiTrash2,
    FiUser,
} from 'react-icons/fi';
import { AuthContext } from '../../../context/AuthContext';
import fire from '../../../conf/fire';
import { getResumes, getSystemSettings } from '../../../services/api/platform';
import { createResumeDraft, deleteResumeDraft, publishResume } from '../../../services/resumePersistence';
import { normalizeResumeData } from '../../../utils/resumeData';
import { calculateAtsScore } from '../../../utils/atsScore';
import { formatSafeDate, isPaidMembershipTier } from '../../../utils/subscriptionUtils';
import { downloadResumeDocx, downloadResumePdf } from '../../../utils/exportDownloader';
import {
    CubaButton,
    CubaEmptyState,
    CubaErrorState,
    CubaInput,
    CubaModal,
    CubaSelect,
} from '../../cuba';
import TemplateRenderer from '../../TemplateRenderer';
import PreviewModal from '../../BuildResume/PreviewModal';
import ShareModal from '../ShareModal/ShareModal';
import PremiumUpgradeModal from '../../common/PremiumUpgradeModal';
import SubscriptionModal from '../DashboardSettings/SubscriptionModal';

/**
 * DashboardResumes — DIR-003 / CAND-001: the dedicated "Resumes & Master CV"
 * workspace hub mounted at `/dashboard/resumes`.
 *
 * DATA SOURCE (zero hardcoded data): every row, count, date and score comes
 * from the real MariaDB-backed resume API (`getResumes`) and the deterministic
 * `calculateAtsScore` engine. A resume with no parseable timestamp renders
 * "—", and an empty read renders an honest empty state — nothing is invented.
 *
 * NAVIGATION: "Edit" resolves the real builder route (/build-resume/heading)
 * with the resume's own id staged in localStorage (`currentResumeId`), the
 * exact contract the builder already honours. The Master CV surface deep-links
 * to the real Master Profile Data tab (/dashboard/settings?tab=Profile).
 *
 * INTERACTIONS: duplicate and delete go through the real persistence service
 * (`createResumeDraft` / `deleteResumeDraft`); delete is confirmed in the
 * accessible CubaModal — no native dialogs, no optimistic lies.
 */

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const firstText = (...values) => values.map(cleanText).find(Boolean) || '';
const normalizeForCompare = (value) => cleanText(value).normalize('NFKC').toLocaleLowerCase();

const readTitle = (doc) => {
    const item = doc?.item || {};
    return firstText(
        item.title,
        `${item.firstname || ''} ${item.lastname || ''}`,
        item.occupation,
    ) || 'Untitled resume';
};

const readRole = (doc) => {
    const role = firstText(doc?.item?.occupation, doc?.item?.title);
    return normalizeForCompare(role) === normalizeForCompare(readTitle(doc)) ? '' : role;
};

const readTimestamp = (doc) => {
    const item = doc?.item || {};
    const value = item.updated_at || item.updatedAt || item.created_at || item.createdAt;
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
};

const readUpdated = (doc) => {
    const item = doc?.item || {};
    return formatSafeDate(
        item.updated_at || item.updatedAt || item.created_at || item.createdAt || '',
        'en-US',
        { day: 'numeric', month: 'short', year: 'numeric' },
    ) || '';
};

const readCreated = (doc) => {
    const item = doc?.item || {};
    return formatSafeDate(
        item.created_at || item.createdAt || '',
        'en-US',
        { day: 'numeric', month: 'short', year: 'numeric' },
    ) || '';
};

const readTemplate = (doc) => cleanText(doc?.template || doc?.item?.template) || '';

/** Deterministic ATS readiness per resume; null when the engine has no number. */
const qualityScoreFor = (doc) => {
    try {
        const score = calculateAtsScore(doc?.item || doc)?.qualityScore;
        return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;
    } catch {
        return null;
    }
};

/**
 * Reads the complete resume workspace. `getResumes` currently downloads the
 * authenticated user's collection and then paginates that array client-side;
 * requesting the complete first page avoids downloading it twice. Keep the
 * error marker authoritative so an outage can never look like an empty account.
 */
const loadAllResumes = async (uid) => {
    const result = await getResumes(uid, 1, Number.MAX_SAFE_INTEGER);
    if (result?.apiError) {
        const error = new Error('Your resumes could not be loaded. Check your connection and try again.');
        error.status = result.errorStatus || null;
        throw error;
    }
    return Array.isArray(result?.resumes)
        ? result.resumes
        : (Array.isArray(result) ? result : []);
};

const RESUME_PAGE_SIZE = 8;
const ResumeThumbnail = React.memo(({ doc, title, onPreview, t }) => {
    const viewportRef = useRef(null);
    const [scale, setScale] = useState(0.34);
    const template = readTemplate(doc) || 'Cv1';
    const values = useMemo(() => {
        try {
            return normalizeResumeData(doc?.item || doc, { template });
        } catch {
            return doc?.item || doc || {};
        }
    }, [doc, template]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;
        const updateScale = () => {
            const availableWidth = Math.max(220, viewport.clientWidth - 16);
            setScale(Math.min(0.42, availableWidth / 794));
        };
        updateScale();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateScale);
            return () => window.removeEventListener('resize', updateScale);
        }
        const observer = new ResizeObserver(updateScale);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={viewportRef}
            className="group/resume-preview relative h-[288px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            data-testid="resume-thumbnail"
        >
            <div aria-hidden="true" inert className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                    className="absolute left-1/2 top-0 origin-top-left bg-white shadow-sm"
                    style={{
                        width: '794px',
                        height: '1123px',
                        marginLeft: `${-397 * scale}px`,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                    }}
                >
                    <TemplateRenderer templateId={template} values={values} language={values?.language || 'en'} />
                </div>
            </div>
            <button
                type="button"
                onClick={onPreview}
                aria-label={t('DashboardResumes.previewNamed', 'Preview {{title}}', { title })}
                className="absolute inset-0 z-10 flex items-center justify-center bg-transparent transition-colors hover:bg-transparent focus-visible:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                style={{ backgroundColor: 'transparent', border: 0 }}
            >
                <span className="translate-y-2 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-slate-900 opacity-0 shadow-lg transition-all group-hover/resume-preview:translate-y-0 group-hover/resume-preview:opacity-100 group-focus-within/resume-preview:translate-y-0 group-focus-within/resume-preview:opacity-100">
                    <FiEye className="mr-1.5 inline h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                    {t('DashboardResumes.preview', 'Preview')}
                </span>
            </button>
        </div>
    );
});

const DashboardResumes = ({ showToast, t, membership }) => {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const userId = user?.uid || user?.uuid || null;

    const [resumes, setResumes] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [pendingKey, setPendingKey] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [previewTarget, setPreviewTarget] = useState(null);
    const [shareModal, setShareModal] = useState(null);
    const [sharingId, setSharingId] = useState(null);
    const [downloadingPdfId, setDownloadingPdfId] = useState(null);
    const [downloadingDocxId, setDownloadingDocxId] = useState(null);
    const [freeTierAccess, setFreeTierAccess] = useState(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
    const [pendingEntitlement, setPendingEntitlement] = useState(null);
    const [query, setQuery] = useState('');
    const [atsFilter, setAtsFilter] = useState('all');
    const [templateFilter, setTemplateFilter] = useState('all');
    const [sortBy, setSortBy] = useState('updated-desc');
    const [page, setPage] = useState(1);
    const requestSequence = useRef(0);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            requestSequence.current += 1;
        };
    }, []);

    const load = useCallback(async () => {
        const requestId = ++requestSequence.current;
        const isCurrent = () => mounted.current && requestSequence.current === requestId;
        if (!userId) {
            if (!isCurrent()) return;
            setResumes([]);
            setLoadError('');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError('');
        try {
            const result = await loadAllResumes(userId);
            if (!isCurrent()) return;
            setResumes(Array.isArray(result) ? result : []);
        } catch (loadFailure) {
            if (!isCurrent()) return;
            setResumes([]);
            setLoadError(loadFailure?.message || 'Your resumes are unavailable right now.');
        } finally {
            if (isCurrent()) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        let active = true;
        const readEntitlements = () => getSystemSettings()
            .then((settings) => {
                if (active) setFreeTierAccess(settings?.watermark || {});
            })
            .catch(() => {
                if (active) setFreeTierAccess(null);
            });
        readEntitlements();
        const handleSettingsUpdated = (event) => {
            if (event?.detail?.category === 'watermark' && event.detail.settings) {
                setFreeTierAccess(event.detail.settings);
                return;
            }
            readEntitlements();
        };
        window.addEventListener('systemSettingsUpdated', handleSettingsUpdated);
        return () => {
            active = false;
            window.removeEventListener('systemSettingsUpdated', handleSettingsUpdated);
        };
    }, []);

    useEffect(() => {
        if (!openMenuId) return undefined;
        const dismiss = (event) => {
            if (event.key === 'Escape') setOpenMenuId(null);
            else if (event.type === 'pointerdown' && !event.target.closest('[data-resume-menu]')) setOpenMenuId(null);
        };
        document.addEventListener('keydown', dismiss);
        document.addEventListener('pointerdown', dismiss);
        return () => {
            document.removeEventListener('keydown', dismiss);
            document.removeEventListener('pointerdown', dismiss);
        };
    }, [openMenuId]);

    const reload = load;

    const templateOptions = useMemo(() => [...new Set(
        (Array.isArray(resumes) ? resumes : []).map((doc) => readTemplate(doc)).filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), [resumes]);

    const filteredResumes = useMemo(() => {
        const normalizedQuery = normalizeForCompare(query);
        const list = (Array.isArray(resumes) ? resumes : []).filter((doc) => {
            const score = qualityScoreFor(doc);
            const template = readTemplate(doc);
            const searchMatch = !normalizedQuery || [readTitle(doc), readRole(doc), template]
                .some((value) => normalizeForCompare(value).includes(normalizedQuery));
            const templateMatch = templateFilter === 'all' || template === templateFilter;
            const atsMatch = atsFilter === 'all'
                || (atsFilter === 'ready' && score !== null && score >= 70)
                || (atsFilter === 'developing' && score !== null && score >= 40 && score < 70)
                || (atsFilter === 'starting' && score !== null && score < 40)
                || (atsFilter === 'unscored' && score === null);
            return searchMatch && templateMatch && atsMatch;
        });

        const compareText = (a, b) => readTitle(a).localeCompare(readTitle(b), undefined, { numeric: true, sensitivity: 'base' });
        list.sort((a, b) => {
            if (sortBy === 'title-asc') return compareText(a, b);
            if (sortBy === 'title-desc') return compareText(b, a);
            if (sortBy === 'ats-desc' || sortBy === 'ats-asc') {
                const left = qualityScoreFor(a);
                const right = qualityScoreFor(b);
                if (left === null && right !== null) return 1;
                if (right === null && left !== null) return -1;
                return sortBy === 'ats-desc' ? (right - left || compareText(a, b)) : (left - right || compareText(a, b));
            }
            const left = readTimestamp(a);
            const right = readTimestamp(b);
            if (left === null && right !== null) return 1;
            if (right === null && left !== null) return -1;
            if (left === right) return compareText(a, b);
            return sortBy === 'updated-asc' ? left - right : right - left;
        });
        return list;
    }, [resumes, query, atsFilter, templateFilter, sortBy]);

    const pageCount = Math.max(1, Math.ceil(filteredResumes.length / RESUME_PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const pageResumes = filteredResumes.slice(
        (currentPage - 1) * RESUME_PAGE_SIZE,
        currentPage * RESUME_PAGE_SIZE,
    );
    const resultStart = filteredResumes.length ? (currentPage - 1) * RESUME_PAGE_SIZE + 1 : 0;
    const resultEnd = Math.min(currentPage * RESUME_PAGE_SIZE, filteredResumes.length);

    const clearFilters = () => {
        setQuery('');
        setAtsFilter('all');
        setTemplateFilter('all');
        setSortBy('updated-desc');
        setPage(1);
    };

    const beginCreate = () => {
        try {
            localStorage.removeItem('currentResumeId');
            localStorage.removeItem('currentResumeItem');
        } catch {
            showToast?.('error', 'Resume builder unavailable', 'Your browser could not access local storage. Allow site storage and try again.');
            return;
        }
        navigate('/build-resume/heading?new=1');
    };

    const openEditor = (doc) => {
        if (!doc?.id) return;
        try {
            localStorage.removeItem('currentResumeItem');
        } catch {
            showToast?.('error', 'Resume could not be opened', 'Your browser could not access local storage. Allow site storage and try again.');
            return;
        }
        try {
            localStorage.setItem('currentResumeId', String(doc.id));
        } catch {
            showToast?.('error', 'Resume could not be opened', 'Your browser could not access local storage. Allow site storage and try again.');
            return;
        }
        navigate('/build-resume/heading');
    };

    const hasPaidAccess = isPaidMembershipTier(membership);
    const canExport = (kind) => hasPaidAccess || freeTierAccess === null || freeTierAccess?.[
        kind === 'pdf' ? 'allowFreePdfDownload' : kind === 'docx' ? 'allowFreeDocxDownload' : 'allowFreeShareLink'
    ] === true;

    const requestUpgrade = (doc, kind) => {
        setPendingEntitlement({ doc, kind });
        setShowUpgradeModal(true);
        setPreviewTarget(null);
    };

    const runDownload = async (doc, kind, { afterUpgrade = false } = {}) => {
        const docId = doc?.id || doc?._id;
        if (!docId) return;
        if (!afterUpgrade && !canExport(kind)) {
            requestUpgrade(doc, kind);
            return;
        }
        const setBusy = kind === 'pdf' ? setDownloadingPdfId : setDownloadingDocxId;
        setBusy(docId);
        try {
            const item = doc.item || doc;
            const options = {
                resumeId: String(docId),
                resumeName: readTemplate(doc) || 'Cv1',
                language: item.language || 'en',
                firstname: item.firstname || doc.firstname || '',
                lastname: item.lastname || doc.lastname || '',
                userId,
                incrementCounts: Boolean(userId),
            };
            if (kind === 'docx') options.colors = item.colors || null;
            if (kind === 'docx') await downloadResumeDocx(options);
            else await downloadResumePdf(options);
            showToast?.('success', kind === 'pdf' ? 'PDF downloaded' : 'Word document downloaded',
                kind === 'pdf' ? 'Your resume PDF is ready.' : 'Your resume DOCX is ready.');
        } catch (error) {
            if (!afterUpgrade && (error?.response?.status === 402
                || error?.code === 'ACTIVE_SUBSCRIPTION_REQUIRED'
                || error?.message?.toLowerCase().includes('subscription'))) {
                requestUpgrade(doc, kind);
                return;
            }
            showToast?.('error', 'Download failed', error?.message || 'The resume could not be downloaded. Please try again.');
        } finally {
            setBusy(null);
        }
    };

    const shareResume = async (doc, { afterUpgrade = false } = {}) => {
        const docId = doc?.id || doc?._id;
        if (!docId || sharingId) return;
        if (!afterUpgrade && !canExport('share')) {
            requestUpgrade(doc, 'share');
            return;
        }
        if (!userId) {
            showToast?.('error', 'Resume could not be shared', 'Please sign in and try again.');
            return;
        }
        setSharingId(docId);
        try {
            await publishResume(
                userId,
                docId,
                normalizeResumeData(doc.item || doc),
                { expectedRevision: doc.revision ?? doc.item?.revision ?? null },
            );
            setPreviewTarget(null);
            setShareModal({
                documentId: String(docId),
                documentTitle: readTitle(doc),
            });
        } catch (error) {
            if (!afterUpgrade && (error?.response?.status === 402
                || error?.code === 'ACTIVE_SUBSCRIPTION_REQUIRED'
                || error?.message?.toLowerCase().includes('subscription'))) {
                requestUpgrade(doc, 'share');
                return;
            }
            showToast?.('error', 'Resume could not be shared', error?.message || 'Please try again.');
        } finally {
            setSharingId(null);
        }
    };

    const duplicateResume = async (doc) => {
        if (!userId || !doc?.id || pendingKey) return;
        setPendingKey(doc.id);
        try {
            const created = await createResumeDraft(userId, {
                ...(doc.item || {}),
                title: `${readTitle(doc)} (Copy)`,
            });
            setResumes((prev) => [
                {
                    id: created.id,
                    template: readTemplate(doc) || 'Cv1',
                    item: created.data || {},
                    isNewStyle: true,
                },
                ...(Array.isArray(prev) ? prev : []),
            ]);
            setPage(1);
            showToast?.('success', 'Resume duplicated', `"${readTitle(doc)} (Copy)" is ready to edit.`);
        } catch (duplicateFailure) {
            showToast?.('error', 'Duplicate failed', duplicateFailure?.message || 'The resume could not be duplicated.');
        } finally {
            setPendingKey(null);
        }
    };
    const confirmDelete = async () => {
        const target = deleteTarget;
        if (!userId || !target?.id || deleting) return;
        setDeleting(true);
        try {
            await deleteResumeDraft(userId, target.id);
        } catch (deleteFailure) {
            showToast?.('error', 'Delete failed', deleteFailure?.message || 'The resume could not be deleted.');
            setDeleting(false);
            return;
        }
        try {
            if (localStorage.getItem('currentResumeId') === String(target.id)) {
                localStorage.removeItem('currentResumeId');
                localStorage.removeItem('currentResumeItem');
            }
        } catch {
            // The server deletion is authoritative; local editor pointers are
            // best-effort browser state and must not turn success into error.
        }
        setResumes((prev) => (Array.isArray(prev) ? prev.filter((doc) => doc.id !== target.id) : []));
        showToast?.('success', 'Resume deleted', `"${readTitle(target)}" was removed from your workspace.`);
        setDeleteTarget(null);
        setDeleting(false);
    };

    const countLabel = loading
        ? t('DashboardResumes.loadingCount', 'Loading…')
        : loadError
            ? t('DashboardResumes.countUnavailable', 'Count unavailable')
            : (Array.isArray(resumes) ? resumes.length : 0) + ' ' + (resumes?.length === 1 ? 'resume' : 'resumes');
    const previewValues = useMemo(() => {
        if (!previewTarget) return null;
        try {
            return normalizeResumeData(previewTarget.item || previewTarget, {
                template: readTemplate(previewTarget) || 'Cv1',
            });
        } catch {
            return previewTarget.item || previewTarget;
        }
    }, [previewTarget]);
    const previewId = previewTarget?.id || previewTarget?._id;

    return (
        <section className="space-y-4" data-testid="dashboard-resumes-hub">
            <header className="flex min-h-10 items-center justify-between gap-3">
                <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                    {t('DashboardResumes.title', 'My Resumes')}
                </h1>
                <div className="flex flex-none items-center gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={() => setShowControls((value) => !value)}
                        aria-label={showControls ? t('DashboardResumes.hideTools', 'Hide search and filters') : t('DashboardResumes.showTools', 'Search and filters')}
                        aria-expanded={showControls}
                        aria-controls="resume-hub-tools"
                        title={t('DashboardResumes.showTools', 'Search and filters')}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                        <FiSearch className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={beginCreate}
                        aria-label={t('DashboardResumes.create', 'Create New Resume')}
                        title={t('DashboardResumes.create', 'Create New Resume')}
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                        <FiPlus className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <span className="whitespace-nowrap text-xs font-medium text-slate-600 sm:text-sm" aria-live="polite" data-testid="resume-count">
                        {countLabel}
                    </span>
                </div>
            </header>

            {showControls && Array.isArray(resumes) && resumes.length > 0 && (
                <div id="resume-hub-tools" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" data-testid="resume-list-controls">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <CubaInput
                            type="search"
                            label={t('DashboardResumes.searchLabel', 'Search resumes')}
                            placeholder={t('DashboardResumes.searchPlaceholder', 'Title, role, or template')}
                            value={query}
                            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                            data-testid="resume-search"
                            className="xl:col-span-2"
                        />
                        <CubaSelect label={t('DashboardResumes.sortLabel', 'Sort by')} value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }} data-testid="resume-sort">
                            <option value="updated-desc">{t('DashboardResumes.sort.updatedDesc', 'Recently updated')}</option>
                            <option value="updated-asc">{t('DashboardResumes.sort.updatedAsc', 'Oldest updated')}</option>
                            <option value="title-asc">{t('DashboardResumes.sort.titleAsc', 'Title A–Z')}</option>
                            <option value="title-desc">{t('DashboardResumes.sort.titleDesc', 'Title Z–A')}</option>
                            <option value="ats-desc">{t('DashboardResumes.sort.atsDesc', 'Highest ATS readiness')}</option>
                            <option value="ats-asc">{t('DashboardResumes.sort.atsAsc', 'Lowest ATS readiness')}</option>
                        </CubaSelect>
                        <CubaSelect label={t('DashboardResumes.atsFilterLabel', 'ATS readiness')} value={atsFilter} onChange={(event) => { setAtsFilter(event.target.value); setPage(1); }} data-testid="resume-ats-filter">
                            <option value="all">{t('DashboardResumes.atsFilter.all', 'All scores')}</option>
                            <option value="ready">{t('DashboardResumes.atsFilter.ready', 'High · 70–100')}</option>
                            <option value="developing">{t('DashboardResumes.atsFilter.developing', 'Building · 40–69')}</option>
                            <option value="starting">{t('DashboardResumes.atsFilter.starting', 'Starting · 0–39')}</option>
                            <option value="unscored">{t('DashboardResumes.atsFilter.unscored', 'Unscored')}</option>
                        </CubaSelect>
                        <CubaSelect label={t('DashboardResumes.templateFilterLabel', 'Template')} value={templateFilter} onChange={(event) => { setTemplateFilter(event.target.value); setPage(1); }} data-testid="resume-template-filter">
                            <option value="all">{t('DashboardResumes.templateFilter.all', 'All templates')}</option>
                            {templateOptions.map((template) => <option key={template} value={template}>{template}</option>)}
                        </CubaSelect>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <p className="text-xs text-slate-500" aria-live="polite" data-testid="resume-result-summary">
                            {filteredResumes.length
                                ? t('DashboardResumes.results.range', 'Showing {{start}}–{{end}} of {{total}} resumes', { start: resultStart, end: resultEnd, total: filteredResumes.length })
                                : t('DashboardResumes.results.none', 'No resumes match these filters.')}
                        </p>
                        <div className="flex items-center gap-2">
                            {(query || atsFilter !== 'all' || templateFilter !== 'all' || sortBy !== 'updated-desc') && (
                                <CubaButton variant="ghost" size="sm" onClick={clearFilters} data-testid="resume-clear-filters" className="min-h-10">
                                    {t('DashboardResumes.resetView', 'Reset view')}
                                </CubaButton>
                            )}
                            <CubaButton variant="outline" size="sm" icon={<FiUser className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => navigate('/dashboard/settings?tab=Profile')} className="min-h-10">
                                {t('DashboardResumes.masterProfile', 'Master Profile Data')}
                            </CubaButton>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label={t('DashboardResumes.loading', 'Loading your resumes')}>
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-hidden="true">
                            <div className="mb-2 h-4 w-3/5 rounded bg-slate-200" />
                            <div className="mb-4 h-3 w-2/5 rounded bg-slate-100" />
                            <div className="mb-4 h-[288px] rounded-xl bg-slate-100" />
                            <div className="space-y-2"><div className="h-11 rounded-lg bg-slate-100" /><div className="h-11 rounded-lg bg-slate-100" /></div>
                        </div>
                    ))}
                    <span className="sr-only">{t('DashboardResumes.loading', 'Loading your resumes')}</span>
                </div>
            ) : loadError ? (
                <CubaErrorState
                    title={t('DashboardResumes.errorTitle', 'Resumes unavailable')}
                    message={loadError}
                    onRetry={reload}
                    retrying={loading}
                />
            ) : !Array.isArray(resumes) || resumes.length === 0 ? (
                <CubaEmptyState
                    icon={<FiFileText className="h-6 w-6" aria-hidden="true" />}
                    title={t('DashboardResumes.emptyTitle', 'No resumes yet')}
                    description={t('DashboardResumes.emptyDescription', 'Build your first resume with the guided ATS builder. Your Master Profile Data gives it a head start.')}
                    action={<CubaButton variant="primary" size="sm" icon={<FiPlus className="h-4 w-4" aria-hidden="true" />} onClick={beginCreate}>{t('DashboardResumes.create', 'Create New Resume')}</CubaButton>}
                    secondaryAction={<CubaButton variant="outline" size="sm" icon={<FiUser className="h-4 w-4" aria-hidden="true" />} onClick={() => navigate('/dashboard/settings?tab=Profile')}>{t('DashboardResumes.masterProfile', 'Master Profile Data')}</CubaButton>}
                />
            ) : filteredResumes.length === 0 ? (
                <CubaEmptyState
                    icon={<FiSearch className="h-6 w-6" aria-hidden="true" />}
                    title={t('DashboardResumes.noMatchesTitle', 'No matching resumes')}
                    description={t('DashboardResumes.noMatchesDescription', 'Try a different search or clear your filters to see your full workspace.')}
                    action={<CubaButton variant="outline" size="sm" onClick={clearFilters} data-testid="resume-reset-empty">{t('DashboardResumes.resetView', 'Reset view')}</CubaButton>}
                />
            ) : (
                <>
                    <ul className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4" aria-label={t('DashboardResumes.listLabel', 'Saved resumes')} data-testid="resume-list">
                        {pageResumes.map((doc) => {
                            const score = qualityScoreFor(doc);
                            const created = readCreated(doc);
                            const date = created || readUpdated(doc);
                            const title = readTitle(doc);
                            const docId = doc.id || doc._id;
                            const scoreClass = score === null
                                ? 'border-slate-200 bg-slate-50 text-slate-600'
                                : score >= 70
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : score >= 40
                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                        : 'border-orange-200 bg-orange-50 text-orange-700';
                            return (
                                <li key={docId} className="min-w-0" data-testid="resume-card">
                                    <article className="card bs-card-executive relative flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
                                        <header className="flex min-w-0 items-center justify-between gap-2">
                                            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900" title={title}>{title}</h2>
                                            <div className="relative flex-none" data-resume-menu>
                                                <button
                                                    type="button"
                                                    aria-label={t('DashboardResumes.moreActionsNamed', 'More actions for {{title}}', { title })}
                                                    aria-haspopup="menu"
                                                    aria-expanded={openMenuId === docId}
                                                    onClick={() => setOpenMenuId((current) => current === docId ? null : docId)}
                                                    className="btn btn-light flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                >
                                                    <FiMoreHorizontal className="h-5 w-5" aria-hidden="true" />
                                                </button>
                                                {openMenuId === docId && (
                                                    <div role="menu" aria-label={t('DashboardResumes.moreActionsNamed', 'More actions for {{title}}', { title })} className="absolute right-0 top-10 z-30 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                                                        <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); duplicateResume(doc); }} disabled={Boolean(pendingKey)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                                            <FiCopy className="h-4 w-4" aria-hidden="true" />{t('DashboardResumes.duplicate', 'Duplicate')}
                                                        </button>
                                                        <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleteTarget(doc); }} disabled={Boolean(pendingKey)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                                                            <FiTrash2 className="h-4 w-4" aria-hidden="true" />{t('DashboardResumes.delete', 'Delete')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </header>
                                        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                            <span>{date ? (created ? 'Created ' : 'Updated ') + date : t('DashboardResumes.dateUnavailable', 'Date unavailable')}</span>
                                            <span className={'badge rounded-pill inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none ' + scoreClass} title={t('DashboardResumes.atsScoreTitle', 'ATS readiness score')}>
                                                {t('DashboardResumes.atsScore', 'ATS: {{score}}/100', { score: score === null ? '—' : score })}
                                            </span>
                                        </div>
                                        <ResumeThumbnail doc={doc} title={title} onPreview={() => setPreviewTarget(doc)} t={t} />
                                        <div className="mt-auto flex flex-col gap-2.5 pt-1">
                                            <button type="button" onClick={() => openEditor(doc)} disabled={Boolean(pendingKey)} aria-label={t('DashboardResumes.editNamed', 'Edit {{title}}', { title })} className="btn btn-dark shadow-sm flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-base font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50">
                                                <FiEdit3 className="h-4 w-4" aria-hidden="true" />{t('DashboardResumes.editResume', 'Edit Resume')}
                                            </button>
                                            <button type="button" onClick={() => shareResume(doc)} disabled={sharingId === docId} aria-label={t('DashboardResumes.shareNamed', 'Share {{title}}', { title })} data-testid="resume-action-share" className="btn btn-outline-secondary shadow-sm flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-base font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60">
                                                <FiShare2 className="h-4 w-4 text-indigo-600" aria-hidden="true" />{sharingId === docId ? t('DashboardResumes.sharing', 'Sharing…') : t('DashboardResumes.shareResume', 'Share Resume')}
                                            </button>
                                            <button type="button" onClick={() => runDownload(doc, 'pdf')} disabled={downloadingPdfId === docId} aria-label={t('DashboardResumes.downloadPdfNamed', 'Download PDF for {{title}}', { title })} className="btn btn-success shadow-sm flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 text-base font-semibold text-white transition hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60">
                                                <FiDownload className="h-4 w-4" aria-hidden="true" />{downloadingPdfId === docId ? t('DashboardResumes.downloadingPdf', 'Preparing PDF…') : t('DashboardResumes.downloadPdf', 'Download PDF')}
                                            </button>
                                            <button type="button" onClick={() => runDownload(doc, 'docx')} disabled={downloadingDocxId === docId} aria-label={t('DashboardResumes.downloadDocxNamed', 'Download Word (DOCX) for {{title}}', { title })} className="btn btn-primary shadow-sm flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60">
                                                <FiDownload className="h-4 w-4" aria-hidden="true" />{downloadingDocxId === docId ? t('DashboardResumes.downloadingDocx', 'Preparing Word document…') : t('DashboardResumes.downloadDocx', 'Download Word (DOCX)')}
                                            </button>
                                        </div>
                                    </article>
                                </li>
                            );
                        })}
                    </ul>

                    {filteredResumes.length > RESUME_PAGE_SIZE && (
                        <nav aria-label={t('DashboardResumes.paginationLabel', 'Resume list pages')} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4" data-testid="resume-pagination">
                            <p className="text-xs text-slate-500">{t('DashboardResumes.pageLabel', 'Page {{page}} of {{pages}}', { page: currentPage, pages: pageCount })}</p>
                            <div className="flex items-center gap-2">
                                <CubaButton variant="outline" size="sm" icon={<FiChevronLeft className="h-4 w-4" aria-hidden="true" />} disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label={t('DashboardResumes.previousPage', 'Previous page')} data-testid="resume-previous-page" className="min-h-11 min-w-11">{t('common.previous', 'Previous')}</CubaButton>
                                <CubaButton variant="outline" size="sm" iconRight={<FiChevronRight className="h-4 w-4" aria-hidden="true" />} disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label={t('DashboardResumes.nextPage', 'Next page')} data-testid="resume-next-page" className="min-h-11 min-w-11">{t('common.next', 'Next')}</CubaButton>
                            </div>
                        </nav>
                    )}
                </>
            )}

            <CubaModal
                open={Boolean(deleteTarget)}
                onClose={() => { if (!deleting) setDeleteTarget(null); }}
                title={t('DashboardResumes.deleteTitle', 'Delete resume?')}
                description={deleteTarget
                    ? t('DashboardResumes.deleteDescription', '"{{title}}" will be permanently removed from your workspace. This action cannot be undone.', { title: readTitle(deleteTarget) })
                    : undefined}
                testId="dashboard-resumes-delete-modal"
                footer={
                    <>
                        <CubaButton variant="ghost" size="sm" disabled={deleting} onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</CubaButton>
                        <CubaButton variant="danger" size="sm" icon={<FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />} loading={deleting} onClick={confirmDelete}>{t('DashboardResumes.confirmDelete', 'Delete resume')}</CubaButton>
                    </>
                }
            >
                <p className="sr-only">{t('DashboardResumes.deleteSrHint', 'Confirmation required before the resume is deleted.')}</p>
            </CubaModal>

            {previewTarget && (
                <PreviewModal
                    showPreview={Boolean(previewTarget)}
                    setShowPreview={(value) => { if (!value) setPreviewTarget(null); }}
                    resumeData={previewValues}
                    currentTemplate={readTemplate(previewTarget) || 'Cv1'}
                    getTemplateName={(template) => template}
                    onShare={() => shareResume(previewTarget)}
                    isSharing={sharingId === previewId}
                    onDownload={() => runDownload(previewTarget, 'pdf')}
                    isDownloading={downloadingPdfId === previewId}
                    onDownloadDocx={() => runDownload(previewTarget, 'docx')}
                    isDownloadingDocx={downloadingDocxId === previewId}
                />
            )}
            <ShareModal
                isOpen={Boolean(shareModal)}
                onClose={() => setShareModal(null)}
                documentId={shareModal?.documentId}
                documentTitle={shareModal?.documentTitle}
            />
            <PremiumUpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => { setShowUpgradeModal(false); setPendingEntitlement(null); }}
                onUpgrade={() => { setShowUpgradeModal(false); setShowSubscriptionModal(true); }}
                downloadType={pendingEntitlement?.kind || 'pdf'}
                resumeTitle={pendingEntitlement ? readTitle(pendingEntitlement.doc) : 'Resume'}
            />
            <SubscriptionModal
                isOpen={showSubscriptionModal}
                onClose={() => { setShowSubscriptionModal(false); setPendingEntitlement(null); }}
                user={fire.auth().currentUser}
                onSuccess={async () => {
                    const pending = pendingEntitlement;
                    setShowSubscriptionModal(false);
                    setPendingEntitlement(null);
                    if (!pending) return;
                    if (pending.kind === 'share') await shareResume(pending.doc, { afterUpgrade: true });
                    else await runDownload(pending.doc, pending.kind, { afterUpgrade: true });
                }}
            />
        </section>
    );
};

const MyComponent = withTranslation('common')(DashboardResumes);
export default MyComponent;
