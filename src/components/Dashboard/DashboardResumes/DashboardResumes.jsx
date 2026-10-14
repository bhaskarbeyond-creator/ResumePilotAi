import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import {
    FiChevronRight,
    FiClock,
    FiCopy,
    FiEdit3,
    FiFileText,
    FiLayers,
    FiPlus,
    FiTrash2,
    FiTrendingUp,
    FiUser,
} from 'react-icons/fi';
import { AuthContext } from '../../../context/AuthContext';
import { getFullName, getResumes } from '../../../services/api/platform';
import { createResumeDraft, deleteResumeDraft } from '../../../services/resumePersistence';
import { calculateAtsScore } from '../../../utils/atsScore';
import { formatSafeDate } from '../../../utils/subscriptionUtils';
import {
    CubaBadge,
    CubaButton,
    CubaCard,
    CubaEmptyState,
    CubaErrorState,
    CubaLoadingState,
    CubaModal,
    CubaPageHeader,
    CubaStatCard,
} from '../../cuba';

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

const readTitle = (doc) => {
    const item = doc?.item || {};
    return firstText(
        item.title,
        `${item.firstname || ''} ${item.lastname || ''}`,
        item.occupation,
    ) || 'Untitled resume';
};

const readRole = (doc) => firstText(doc?.item?.occupation, doc?.item?.title);

const readUpdated = (doc) => {
    const item = doc?.item || {};
    return formatSafeDate(
        item.updated_at || item.updatedAt || item.created_at || item.createdAt || '',
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

const atsTone = (score) => {
    if (score === null) return 'neutral';
    if (score >= 70) return 'success';
    if (score >= 40) return 'warning';
    return 'danger';
};

/**
 * Reads the COMPLETE resume workspace for the authenticated user. The platform
 * reader paginates client-side (default 5 per page), so a workspace hub that
 * called it directly would silently show only the first page of a candidate's
 * resumes. The first call's real `pagination.totalItems` is used to fetch the
 * whole list in one follow-up read — no invented numbers, no arbitrary cap.
 */
const loadAllResumes = async (uid) => {
    const first = await getResumes(uid, 1, 5);
    const list = Array.isArray(first?.resumes)
        ? first.resumes
        : (Array.isArray(first) ? first : []);
    const total = Number(first?.pagination?.totalItems) || list.length;
    if (total > list.length) {
        const all = await getResumes(uid, 1, total);
        return Array.isArray(all?.resumes) ? all.resumes : list;
    }
    return list;
};
const DashboardResumes = ({ showToast, t }) => {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const userId = user?.uid || user?.uuid || null;

    const [resumes, setResumes] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [profile, setProfile] = useState(null);
    const [pendingKey, setPendingKey] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async (active) => {
        if (!userId) {
            setResumes([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError('');
        try {
            const [result, profileValue] = await Promise.all([
                loadAllResumes(userId),
                getFullName(userId).catch(() => null),
            ]);
            if (!active()) return;
            setResumes(Array.isArray(result) ? result : []);
            setProfile(profileValue);
        } catch (loadFailure) {
            if (!active()) return;
            setResumes([]);
            setLoadError(loadFailure?.message || 'Your resumes are unavailable right now.');
        } finally {
            if (active()) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        let active = true;
        const isActive = () => active;
        load(isActive);
        return () => { active = false; };
    }, [load]);

    const reload = useCallback(() => load(() => true), [load]);

    const stats = useMemo(() => {
        const list = Array.isArray(resumes) ? resumes : [];
        const scores = list.map(qualityScoreFor).filter((score) => score !== null);
        const avgAts = scores.length
            ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
            : null;
        const timestamps = list
            .map((doc) => {
                const item = doc?.item || {};
                const value = item.updated_at || item.updatedAt || item.created_at || item.createdAt;
                const parsed = value ? Date.parse(value) : NaN;
                return Number.isFinite(parsed) ? parsed : null;
            })
            .filter((parsed) => parsed !== null);
        const newest = timestamps.length ? Math.max(...timestamps) : null;
        const templateCount = new Set(
            list.map((doc) => readTemplate(doc) || 'Cv1'),
        ).size;
        return {
            count: list.length,
            avgAts,
            newest,
            templateCount: list.length ? templateCount : 0,
        };
    }, [resumes]);

    const beginCreate = () => {
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
        navigate('/build-resume/heading');
    };

    const openEditor = (doc) => {
        if (!doc?.id) return;
        localStorage.setItem('currentResumeId', String(doc.id));
        localStorage.removeItem('currentResumeItem');
        navigate('/build-resume/heading');
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
            if (localStorage.getItem('currentResumeId') === String(target.id)) {
                localStorage.removeItem('currentResumeId');
                localStorage.removeItem('currentResumeItem');
            }
            setResumes((prev) => (Array.isArray(prev) ? prev.filter((doc) => doc.id !== target.id) : []));
            showToast?.('success', 'Resume deleted', `"${readTitle(target)}" was removed from your workspace.`);
            setDeleteTarget(null);
        } catch (deleteFailure) {
            showToast?.('error', 'Delete failed', deleteFailure?.message || 'The resume could not be deleted.');
        } finally {
            setDeleting(false);
        }
    };

    const profileName = firstText(
        profile?.firstname && profile?.lastname
            ? `${profile.firstname} ${profile.lastname}`
            : '',
    );

    const breadcrumb = (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-medium text-cuba-ink-subtle">
            <a
                href="/dashboard"
                className="cuba-focusable rounded transition-colors hover:text-cuba-primary-strong"
            >
                Dashboard
            </a>
            <FiChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span aria-current="page" className="text-cuba-ink-muted">
                Resumes &amp; Master CV
            </span>
        </nav>
    );

    const countLabel = Array.isArray(resumes)
        ? `${resumes.length} ${resumes.length === 1 ? 'resume' : 'resumes'}`
        : '';
    return (
        <section className="space-y-6" data-testid="dashboard-resumes-hub">
            <CubaPageHeader
                eyebrow={t('DashboardResumes.eyebrow', 'Workspace')}
                title={t('DashboardResumes.title', 'Resumes & Master CV')}
                subtitle={
                    countLabel
                        ? t(
                            'DashboardResumes.subtitleWithCount',
                            '{{count}} in your workspace — build, edit and track every version from one hub.',
                            { count: countLabel },
                        )
                        : t(
                            'DashboardResumes.subtitle',
                            'Build, edit and track every resume version from one hub.',
                        )
                }
                breadcrumb={breadcrumb}
                actions={
                    <>
                        <CubaButton
                            variant="primary"
                            icon={<FiPlus className="h-4 w-4" aria-hidden="true" />}
                            onClick={beginCreate}
                        >
                            {t('DashboardResumes.create', 'Create New Resume')}
                        </CubaButton>
                        <CubaButton
                            variant="outline"
                            icon={<FiUser className="h-4 w-4" aria-hidden="true" />}
                            onClick={() => navigate('/dashboard/settings?tab=Profile')}
                        >
                            {t('DashboardResumes.masterProfile', 'Master Profile Data')}
                        </CubaButton>
                    </>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CubaStatCard
                    label={t('DashboardResumes.stats.total', 'Total Resumes')}
                    value={loading ? '' : String(stats.count)}
                    hint={t('DashboardResumes.stats.totalHint', 'Saved in your workspace')}
                    icon={<FiFileText className="h-5 w-5" aria-hidden="true" />}
                    accent="primary"
                    loading={loading}
                />
                <CubaStatCard
                    label={t('DashboardResumes.stats.avgAts', 'Average ATS Readiness')}
                    value={loading ? '' : (stats.avgAts !== null ? `${stats.avgAts}/100` : '—')}
                    hint={t('DashboardResumes.stats.avgAtsHint', 'Deterministic engine score')}
                    icon={<FiTrendingUp className="h-5 w-5" aria-hidden="true" />}
                    accent={stats.avgAts !== null && stats.avgAts >= 70 ? 'success' : 'info'}
                    loading={loading}
                />
                <CubaStatCard
                    label={t('DashboardResumes.stats.lastUpdated', 'Last Updated')}
                    value={loading ? '' : (stats.newest ? formatSafeDate(stats.newest) || '—' : '—')}
                    hint={t('DashboardResumes.stats.lastUpdatedHint', 'Newest resume change')}
                    icon={<FiClock className="h-5 w-5" aria-hidden="true" />}
                    accent="info"
                    loading={loading}
                />
                <CubaStatCard
                    label={t('DashboardResumes.stats.templates', 'Template Styles')}
                    value={loading ? '' : String(stats.templateCount)}
                    hint={t('DashboardResumes.stats.templatesHint', 'Distinct designs in use')}
                    icon={<FiLayers className="h-5 w-5" aria-hidden="true" />}
                    accent="warning"
                    loading={loading}
                />
            </div>
            <CubaCard ai className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div
                        className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary-ink-strong"
                        aria-hidden="true"
                    >
                        <FiUser className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold tracking-tight text-cuba-ink">
                            {t('DashboardResumes.masterCvTitle', 'Master CV — Master Profile Data')}
                        </h2>
                        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-cuba-ink-muted">
                            {profileName
                                ? t(
                                    'DashboardResumes.masterCvWithName',
                                    'Your resumes are built on the Master Profile Data of {{name}}. Keep it current and every new resume starts complete.',
                                    { name: profileName },
                                )
                                : t(
                                    'DashboardResumes.masterCvWithoutName',
                                    'Your Master Profile Data feeds every resume you build. Keep it current and every new resume starts complete.',
                                )}
                        </p>
                    </div>
                </div>
                <CubaButton
                    variant="outline"
                    size="sm"
                    className="flex-none"
                    iconRight={<FiChevronRight className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => navigate('/dashboard/settings?tab=Profile')}
                >
                    {t('DashboardResumes.openMasterProfile', 'Open Master Profile')}
                </CubaButton>
            </CubaCard>

            <CubaCard as="div" padded className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold tracking-tight text-cuba-ink">
                        {t('DashboardResumes.yourResumes', 'Your Resumes')}
                    </h2>
                    {!loading && Array.isArray(resumes) && resumes.length > 0 && (
                        <CubaBadge tone="neutral" srLabel={t('DashboardResumes.badgeCount', 'Resume count')}>
                            {resumes.length}
                        </CubaBadge>
                    )}
                </div>

                {loading ? (
                    <CubaLoadingState
                        rows={3}
                        label={t('DashboardResumes.loading', 'Loading your resumes')}
                    />
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
                        description={t(
                            'DashboardResumes.emptyDescription',
                            'Build your first resume with the guided ATS builder. Your Master Profile Data gives it a head start.',
                        )}
                        action={
                            <CubaButton
                                variant="primary"
                                size="sm"
                                icon={<FiPlus className="h-4 w-4" aria-hidden="true" />}
                                onClick={beginCreate}
                            >
                                {t('DashboardResumes.create', 'Create New Resume')}
                            </CubaButton>
                        }
                        secondaryAction={
                            <CubaButton
                                variant="outline"
                                size="sm"
                                icon={<FiUser className="h-4 w-4" aria-hidden="true" />}
                                onClick={() => navigate('/dashboard/settings?tab=Profile')}
                            >
                                {t('DashboardResumes.masterProfile', 'Master Profile Data')}
                            </CubaButton>
                        }
                    />
                ) : (
                    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label={t('DashboardResumes.listLabel', 'Saved resumes')}>
                        {resumes.map((doc) => {
                            const score = qualityScoreFor(doc);
                            const updated = readUpdated(doc);
                            const role = readRole(doc);
                            const template = readTemplate(doc);
                            return (
                                <li key={doc.id}>
                                    <CubaCard hover className="flex h-full flex-col gap-4">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div
                                                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary-ink-strong"
                                                aria-hidden="true"
                                            >
                                                <FiFileText className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="truncate text-sm font-semibold tracking-tight text-cuba-ink">
                                                        {readTitle(doc)}
                                                    </h3>
                                                    <CubaBadge tone={atsTone(score)}>
                                                        {score !== null ? `${score}/100 ATS` : '—'}
                                                    </CubaBadge>
                                                </div>
                                                {role && (
                                                    <p className="mt-0.5 truncate text-xs text-cuba-ink-muted">
                                                        {role}
                                                    </p>
                                                )}
                                                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cuba-ink-subtle">
                                                    {updated && (
                                                        <span className="inline-flex items-center gap-1">
                                                            <FiClock className="h-3 w-3" aria-hidden="true" />
                                                            {updated}
                                                        </span>
                                                    )}
                                                    {template && (
                                                        <span>
                                                            {t('DashboardResumes.templateLabel', 'Template')} {template}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-none flex-wrap items-center gap-2">
                                            <CubaButton
                                                variant="outline"
                                                size="sm"
                                                icon={<FiEdit3 className="h-3.5 w-3.5" aria-hidden="true" />}
                                                onClick={() => openEditor(doc)}
                                            >
                                                {t('DashboardResumes.edit', 'Edit')}
                                            </CubaButton>
                                            <CubaButton
                                                variant="ghost"
                                                size="sm"
                                                icon={<FiCopy className="h-3.5 w-3.5" aria-hidden="true" />}
                                                loading={pendingKey === doc.id}
                                                onClick={() => duplicateResume(doc)}
                                            >
                                                {t('DashboardResumes.duplicate', 'Duplicate')}
                                            </CubaButton>
                                            <CubaButton
                                                variant="ghost"
                                                size="sm"
                                                icon={<FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                                                onClick={() => setDeleteTarget(doc)}
                                            >
                                                {t('DashboardResumes.delete', 'Delete')}
                                            </CubaButton>
                                        </div>
                                    </CubaCard>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CubaCard>
            <CubaModal
                open={Boolean(deleteTarget)}
                onClose={() => {
                    if (!deleting) setDeleteTarget(null);
                }}
                title={t('DashboardResumes.deleteTitle', 'Delete resume?')}
                description={
                    deleteTarget
                        ? t(
                            'DashboardResumes.deleteDescription',
                            '"{{title}}" will be permanently removed from your workspace. This action cannot be undone.',
                            { title: readTitle(deleteTarget) },
                        )
                        : undefined
                }
                testId="dashboard-resumes-delete-modal"
                footer={
                    <>
                        <CubaButton
                            variant="ghost"
                            size="sm"
                            disabled={deleting}
                            onClick={() => setDeleteTarget(null)}
                        >
                            {t('common.cancel', 'Cancel')}
                        </CubaButton>
                        <CubaButton
                            variant="danger"
                            size="sm"
                            icon={<FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            loading={deleting}
                            onClick={confirmDelete}
                        >
                            {t('DashboardResumes.confirmDelete', 'Delete resume')}
                        </CubaButton>
                    </>
                }
            >
                <p className="sr-only">
                    {t('DashboardResumes.deleteSrHint', 'Confirmation required before the resume is deleted.')}
                </p>
            </CubaModal>
        </section>
    );
};

const MyComponent = withTranslation('common')(DashboardResumes);
export default MyComponent;






