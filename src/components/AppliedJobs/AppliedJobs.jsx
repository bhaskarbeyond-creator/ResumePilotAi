import React, { useState, useEffect, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FaBriefcase, FaSearch, FaCalendar, FaMapMarkerAlt, FaDollarSign, FaClock, FaCheckCircle, FaTimesCircle, FaHourglass, FaInfoCircle, FaBuilding, FaChevronDown, FaChevronUp, FaTrashAlt, FaColumns } from 'react-icons/fa';
import { AuthContext } from '../../context/AuthContext';
import { getUserJobApplications, getJobById, withdrawJobApplication, createTrackedJob, getTrackedJobs } from '../../services/api/platform';
import { formatSafeDate } from '../../utils/subscriptionUtils.js';
import useConfirmDialog from '../../hooks/useConfirmDialog';
// DIR-081: the shared page frame so loading / empty / error swap only the content
// region and never replace the whole page with a blank body.
import CubaPageFrame from '../cuba/CubaPageFrame';
import CubaEmptyState from '../cuba/CubaEmptyState';
// DIR-083: the compact pipeline HUD (bound to the same real counts the stat tiles used).
import CubaHud from '../cuba/CubaHud';

/**
 * DIR-059: the `applications` table stores its own status vocabulary (default
 * `PENDING`, uppercase) while this component presents the CANONICAL tracker
 * vocabulary. Without this map the "Pending" tile counted `=== 'pending'` and
 * could never match the stored `PENDING`, so it always read 0.
 */
const APPLICATION_STATUS_MAP = Object.freeze({
    pending: 'applied',
    applied: 'applied',
    submitted: 'applied',
    review: 'applied',
    reviewing: 'applied',
    shortlisted: 'interview',
    interview: 'interview',
    interviewing: 'interview',
    offer: 'offer',
    accepted: 'offer',
    hired: 'offer',
    rejected: 'rejected',
    declined: 'rejected',
});
const canonicalApplicationStatus = (raw) => APPLICATION_STATUS_MAP[String(raw || '').trim().toLowerCase()] || 'applied';

/**
 * DIR-059: the `applications` row carries `job_id` but NO jobTitle/company/
 * location/salary — those live on the `jobs` table and `getApplications()` does a
 * bare SELECT with no join. Without enrichment every row rendered blank. The job
 * record is fetched per row and folded into the view model this list renders.
 */
const normaliseApplication = (row, jobRecord) => {
    const job = jobRecord && typeof jobRecord === 'object' ? jobRecord : {};
    const source = job.job && typeof job.job === 'object' ? job.job : job;
    return {
        id: row?.id,
        jobId: row?.job_id || row?.jobId || '',
        jobTitle: source.title || source.jobTitle || 'Job',
        company: source.company || source.companyName || '',
        location: source.location || '',
        salary: source.salary || '',
        jobType: source.jobType || source.type || '',
        workMode: source.workMode || '',
        status: canonicalApplicationStatus(row?.status),
        appliedDate: row?.created_at || row?.createdAt || row?.appliedDate || null,
        notes: row?.notes || '',
    };
};


// eslint-disable-next-line react-refresh/only-export-components
const AppliedJobs = ({ showToast, t }) => {
    const user = useContext(AuthContext);
    const [appliedJobs, setAppliedJobs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [expandedJobId, setExpandedJobId] = useState(null);
    // DIR-059: per-row busy state for the withdraw / track actions, plus the set
    // of applications already promoted to the Kanban tracker (so the action is
    // idempotent instead of creating duplicates).
    const [pendingActionId, setPendingActionId] = useState(null);
    const [trackedJobIds, setTrackedJobIds] = useState(() => new Set());
    const { confirm, confirmationDialog } = useConfirmDialog();
    const navigate = useNavigate();
    // Fetch user's job applications without allowing a stale account request to win.
    useEffect(() => {
        let active = true;
        const fetchApplications = async () => {
            if (!user?.uid) {
                setAppliedJobs([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            setLoadError('');
            try {
                const applications = await getUserJobApplications(user.uid);
                // DIR-059: enrich each row with its job record — the applications
                // table stores only job_id, so title/company/location/salary must
                // come from the jobs table or every row renders blank.
                const normalised = await Promise.all(applications.map(async (row) => {
                    const jobId = row?.job_id || row?.jobId;
                    const job = jobId ? await getJobById(jobId).catch(() => null) : null;
                    return normaliseApplication(row, job);
                }));
                if (active) setAppliedJobs(normalised);
            } catch (error) {
                if (!active) return;
                console.error('Error fetching applications:', error);
                setLoadError('Your applications could not be loaded. Please try again.');
                showToast?.('Error loading applications', 'error');
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchApplications();
        return () => {
            active = false;
        };
    }, [user?.uid, showToast, retryCount]);

    const filteredJobs = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase();
        const filtered = appliedJobs.filter((job) => {
            const matchesSearch = !query || [job.jobTitle, job.company, job.location]
                .some((value) => String(value || '').toLocaleLowerCase().includes(query));
            const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
        return filtered.sort((a, b) => {
            if (sortBy === 'date') return new Date(b.appliedDate || 0) - new Date(a.appliedDate || 0);
            if (sortBy === 'company') return String(a.company || '').localeCompare(String(b.company || ''));
            if (sortBy === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
            return 0;
        });
    }, [appliedJobs, searchTerm, statusFilter, sortBy]);

    const handleViewDetails = (job) => {
        if (expandedJobId === job.id) {
            // If the same job is clicked, collapse it
            setExpandedJobId(null);
        } else {
            // Expand the clicked job
            setExpandedJobId(job.id);
        }
    };

    /**
     * DIR-059 S3: withdraw an application. Confirmation goes through the shared
     * Cuba confirm dialog (never a native window.confirm). The row is removed
     * optimistically and restored if the server refuses, so a failure never
     * silently loses the candidate's application.
     */
    const handleWithdraw = async (job) => {
        const approved = await confirm({
            title: t('JobsUpdate.AppliedJobs.withdraw.title', 'Withdraw this application?'),
            message: `${t('JobsUpdate.AppliedJobs.withdraw.message', 'This permanently removes your application for')} ${job.jobTitle}${job.company ? ` — ${job.company}` : ''}.`,
            confirmLabel: t('JobsUpdate.AppliedJobs.withdraw.confirm', 'Withdraw application'),
            variant: 'danger',
        });
        if (!approved) return;

        const snapshot = appliedJobs;
        setPendingActionId(job.id);
        setAppliedJobs((current) => current.filter((row) => row.id !== job.id));
        try {
            await withdrawJobApplication(job.id);
            showToast?.('Application withdrawn', 'success');
        } catch (_error) {
            setAppliedJobs(snapshot);
            showToast?.('Could not withdraw the application', 'error');
        } finally {
            setPendingActionId(null);
        }
    };

    /**
     * DIR-059 S4: promote an application into the Kanban tracker with the
     * canonical `applied` status. Idempotent — a second click opens the tracker
     * instead of creating a duplicate row.
     */
    const handleTrackInKanban = async (job) => {
        if (trackedJobIds.has(job.id) || (job.jobId && trackedJobIds.has(job.jobId))) {
            navigate('/dashboard/job-tracker');
            return;
        }
        setPendingActionId(job.id);
        try {
            await createTrackedJob(user?.uid, {
                title: job.jobTitle,
                company: job.company,
                location: job.location,
                salary: job.salary,
                status: 'applied',
            });
            setTrackedJobIds((current) => new Set(current).add(job.id));
            showToast?.('Added to your Kanban tracker', 'success');
        } catch (_error) {
            showToast?.('Could not add this application to the tracker', 'error');
        } finally {
            setPendingActionId(null);
        }
    };

    // DIR-059: which applications are already on the Kanban board, so the button
    // reflects reality rather than a guess.
    useEffect(() => {
        if (!user?.uid) return undefined;
        let active = true;
        getTrackedJobs(user.uid)
            .then((rows) => {
                if (!active || !Array.isArray(rows)) return;
                setTrackedJobIds(new Set(rows.map((row) => row.id).filter(Boolean)));
            })
            .catch(() => { /* the button simply stays in its "add" state */ });
        return () => { active = false; };
    }, [user?.uid]);

    /**
     * DIR-056 SUB-056-6: the status vocabulary is the CANONICAL one.
     *
     * This component used to carry its own switch over `pending` / `interview` /
     * `accepted` / `rejected`, which overlapped the tracker's real enum
     * (`utils/jobTracker.js` → JOB_TRACKER_STATUSES = wishlist, applied, interview,
     * offer, rejected) on only TWO of five values. `applied` — the primary state a
     * job is actually in after you apply — and `offer` both fell through to
     * `default`, so this list mislabelled the two most important statuses, while
     * `pending` / `accepted` were values the tracker never emits at all.
     *
     * One map derived from the canonical enum removes that entire class of drift.
     */
    const STATUS_PRESENTATION = {
        wishlist: { icon: FaBriefcase, text: 'Saved', color: 'text-cuba-ink-muted bg-cuba-canvas border-cuba-line' },
        applied: { icon: FaHourglass, text: 'Under Review', color: 'text-cuba-warning bg-cuba-warning-soft border-cuba-warning' },
        interview: { icon: FaClock, text: 'Interview Scheduled', color: 'text-cuba-primary-ink-strong bg-cuba-primary-soft border-cuba-primary' },
        offer: { icon: FaCheckCircle, text: 'Offer Received', color: 'text-cuba-success bg-cuba-success-soft border-cuba-success' },
        rejected: { icon: FaTimesCircle, text: 'Not Selected', color: 'text-cuba-ink-muted bg-cuba-canvas border-cuba-line' },
    };
    const presentationFor = (status) => STATUS_PRESENTATION[String(status || '').toLowerCase()]
        || { icon: FaInfoCircle, text: 'Unknown', color: 'text-cuba-ink-muted bg-cuba-canvas border-cuba-line' };

    const getStatusIcon = (status) => {
        const Icon = presentationFor(status).icon;
        return <Icon className="w-4 h-4" />;
    };

    const getStatusText = (status) => presentationFor(status).text;

    const getStatusColor = (status) => presentationFor(status).color;

    // DIR-048: shared safe-date contract — unparseable values fall back
    // honestly instead of rendering "Invalid date".
    const formatDate = (date) => {
        if (!date) return 'Date not available';
        return formatSafeDate(date, 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) || 'Date unavailable';
    };

    const getStatusCount = (status) => {
        return appliedJobs.filter((job) => job.status === status).length;
    };

    // DIR-081: the page identity is rendered in every state, so a signed-out,
    // loading or failed applications list keeps its real title and retry action
    // instead of collapsing to a blank page body.
    const pageIdentity = {
        title: t('JobsUpdate.AppliedJobs.title', 'Applied Jobs'),
        subtitle: t('JobsUpdate.AppliedJobs.subtitle', 'Track your job applications and their current status'),
    };

    if (loading) {
        return <CubaPageFrame {...pageIdentity} state="loading" loadingLabel={t('JobsUpdate.AppliedJobs.loading', 'Loading your applications')} loadingRows={4} />;
    }

    // Check if user is logged in
    if (!user?.uid) {
        return (
            <CubaPageFrame {...pageIdentity} state="empty">
                <CubaEmptyState
                    title={t('JobsUpdate.AppliedJobs.loginRequired.title', 'Please log in')}
                    description={t('JobsUpdate.AppliedJobs.loginRequired.message', 'You need to be logged in to view your job applications.')}
                />
            </CubaPageFrame>
        );
    }

    if (loadError) {
        return (
            <CubaPageFrame
                {...pageIdentity}
                state="error"
                error={loadError}
                onRetry={() => setRetryCount((count) => count + 1)}
            />
        );
    }

    const redirectToJobs = () => {
        navigate('/jobs');
    };
    // DIR-083: the HUD binds to the SAME real counts the stat tiles used, and the page now
    // renders inside the dense frame so the header and the HUD stay pinned while the list
    // scrolls inside the viewport.
    const hudItems = [
        { label: t('JobsUpdate.AppliedJobs.stats.totalApplied', 'Total applied'), value: appliedJobs.length },
        { label: t('JobsUpdate.AppliedJobs.stats.pending', 'Under review'), value: getStatusCount('applied') },
        { label: t('JobsUpdate.AppliedJobs.stats.interviews', 'Interviews'), value: getStatusCount('interview') },
        { label: t('JobsUpdate.AppliedJobs.stats.successRate', 'Success rate'), value: `${appliedJobs.length > 0 ? Math.round((getStatusCount('accepted') / appliedJobs.length) * 100) : 0}%` },
    ];

    return (
        <CubaPageFrame
            {...pageIdentity}
            dense
            hud={<CubaHud items={hudItems} label="Applications pipeline" />}
        >

                {/* Search and Filter Section */}
                <div className="card bs-card-executive bg-cuba-card rounded-3 p-3 border border-cuba-line shadow-sm mb-4">
                    <div className="row g-3">
                        {/* Search */}
                        <div className="col-12 col-md">
                            <label htmlFor="application-search" className="sr-only">Search applications</label>
                            <div className="relative">
                                <FaSearch aria-hidden="true" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cuba-ink-subtle w-3.5 h-3.5" />
                                <input
                                    id="application-search"
                                    type="search"
                                    placeholder={t('JobsUpdate.AppliedJobs.search.placeholder', 'Search jobs, companies, or locations...')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="form-control w-full pl-9 pr-3 py-2 text-sm border border-cuba-line-strong rounded-md"
                                />
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="col-12 col-sm-6 col-md-auto">
                            <label htmlFor="application-status-filter" className="sr-only">Filter by status</label>
                            <select
                                id="application-status-filter"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="form-select w-full px-3 py-2 text-sm border border-cuba-line-strong rounded-md bg-cuba-card">
                                <option value="all">{t('JobsUpdate.AppliedJobs.filters.allStatus', 'All Status')}</option>
                                <option value="pending">{t('JobsUpdate.AppliedJobs.filters.underReview', 'Under Review')}</option>
                                <option value="interview">{t('JobsUpdate.AppliedJobs.filters.interview', 'Interview')}</option>
                                <option value="accepted">{t('JobsUpdate.AppliedJobs.filters.accepted', 'Accepted')}</option>
                                <option value="rejected">{t('JobsUpdate.AppliedJobs.filters.rejected', 'Rejected')}</option>
                            </select>
                        </div>

                        {/* Sort */}
                        <div className="col-12 col-sm-6 col-md-auto">
                            <label htmlFor="application-sort" className="sr-only">Sort applications</label>
                            <select
                                id="application-sort"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="form-select w-full px-3 py-2 text-sm border border-cuba-line-strong rounded-md bg-cuba-card">
                                <option value="date">{t('JobsUpdate.AppliedJobs.sort.byDate', 'Sort by Date')}</option>
                                <option value="company">{t('JobsUpdate.AppliedJobs.sort.byCompany', 'Sort by Company')}</option>
                                <option value="status">{t('JobsUpdate.AppliedJobs.sort.byStatus', 'Sort by Status')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Jobs List */}
                <div className="space-y-3">
                    
                    {filteredJobs.length === 0 ? (
                        <div className="bg-cuba-card rounded-lg border border-cuba-line p-8 text-center shadow-sm">
                            <div className="p-4 bg-cuba-elevated rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                                <FaBriefcase className="w-8 h-8 text-cuba-ink-subtle" />
                            </div>
                            <h3 className="text-sm font-medium text-cuba-ink mb-2">{t('JobsUpdate.AppliedJobs.noApplications.title', 'No applications found')}</h3>
                            <p className="text-cuba-ink-muted text-sm mb-4">
                                {searchTerm || statusFilter !== 'all' ? t('JobsUpdate.AppliedJobs.noApplications.filterMessage', 'Try adjusting your search or filter criteria.') : t('JobsUpdate.AppliedJobs.noApplications.emptyMessage', "You haven't applied to any jobs yet. Start exploring opportunities!")}
                            </p>
                            {!searchTerm && statusFilter === 'all' && (
                                <button onClick={redirectToJobs} className="btn btn-primary cuba-btn-primary px-4 py-2 rounded-pill text-sm font-bold shadow-xs">{t('JobsUpdate.AppliedJobs.actions.browseJobs', 'Browse Jobs')}</button>
                            )}
                        </div>
                    ) : (
                        filteredJobs.map((job) => (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="card bs-card-executive bg-cuba-card rounded-3 border border-cuba-line overflow-hidden hover:border-cuba-line-strong transition-all duration-200">
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-sm font-semibold text-cuba-ink truncate">{job.jobTitle}</h3>
                                                <div className={`badge rounded-pill inline-flex items-center gap-2 px-2.5 py-1.5 border text-xs font-medium ${getStatusColor(job.status)}`}>
                                                    {getStatusIcon(job.status)}
                                                    {getStatusText(job.status)}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 text-xs text-cuba-ink-muted mb-3">
                                                <div className="flex items-center gap-1">
                                                    <FaBuilding className="w-3 h-3" />
                                                    <span>{job.company}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <FaMapMarkerAlt className="w-3 h-3" />
                                                    <span>{job.location}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <FaDollarSign className="w-3 h-3" />
                                                    <span>{job.salary}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <FaClock className="w-3 h-3" />
                                                    <span>
                                                        {job.jobType || 'Full-time'} • {job.workMode || 'On-site'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <FaCalendar className="w-3 h-3" />
                                                    <span>{t('JobsUpdate.AppliedJobs.jobInfo.applied', 'Applied')} {formatDate(job.appliedDate)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <FaInfoCircle className="w-3 h-3 text-cuba-ink-muted" />
                                                    <span className="font-medium text-cuba-ink">{t('JobsUpdate.AppliedJobs.jobInfo.status', 'Status')}:</span>
                                                    <span className="text-cuba-ink-muted">{getStatusText(job.status)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                            {/* DIR-059 S4: 1-click Kanban promotion. */}
                                            <button
                                                type="button"
                                                onClick={() => handleTrackInKanban(job)}
                                                disabled={pendingActionId === job.id}
                                                data-testid="track-in-kanban"
                                                aria-label={`${trackedJobIds.has(job.id) ? 'Open in Kanban' : 'Track in Kanban'}: ${job.jobTitle || 'application'}`}
                                                title={trackedJobIds.has(job.id) ? 'Open in Kanban' : 'Track in Kanban'}
                                                className="p-2 text-cuba-ink-muted hover:text-cuba-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cuba-primary transition-colors rounded-md hover:bg-cuba-canvas disabled:opacity-50 disabled:cursor-not-allowed">
                                                <FaColumns aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                            {/* DIR-059 S3: candidate withdrawal. */}
                                            <button
                                                type="button"
                                                onClick={() => handleWithdraw(job)}
                                                disabled={pendingActionId === job.id}
                                                data-testid="withdraw-application"
                                                aria-label={`Withdraw application for ${job.jobTitle || 'job'}`}
                                                title="Withdraw application"
                                                className="p-2 text-cuba-ink-muted hover:text-cuba-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cuba-primary transition-colors rounded-md hover:bg-cuba-canvas disabled:opacity-50 disabled:cursor-not-allowed">
                                                <FaTrashAlt aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleViewDetails(job)}
                                                aria-expanded={expandedJobId === job.id}
                                                aria-controls={`application-details-${job.id}`}
                                                aria-label={`${expandedJobId === job.id ? 'Hide' : 'Show'} details for ${job.jobTitle || 'application'}`}
                                                className="p-2 text-cuba-ink-muted hover:text-cuba-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cuba-primary transition-colors rounded-md hover:bg-cuba-canvas">
                                                {expandedJobId === job.id ? <FaChevronUp aria-hidden="true" className="w-3 h-3" /> : <FaChevronDown aria-hidden="true" className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Job Details */}
                                    <AnimatePresence>
                                        {expandedJobId === job.id && (
                                            <motion.div
                                                id={`application-details-${job.id}`}
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 pt-3 border-t border-cuba-line">
                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                    <div className="lg:col-span-2">
                                                        <h4 className="text-sm font-medium text-cuba-ink mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.jobDescription', 'Job Description')}</h4>
                                                        <p className="text-cuba-ink-muted text-xs leading-relaxed mb-3 line-clamp-3">
                                                            {job.description || `Join ${job.company} as a ${job.jobTitle}. This is an exciting opportunity to contribute to our team and make a meaningful impact.`}
                                                        </p>

                                                        <h4 className="text-sm font-medium text-cuba-ink mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.requirements', 'Requirements')}</h4>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {Array.isArray(job.requirements) && job.requirements.length > 0 ? (
                                                                job.requirements.slice(0, 6).map((req, index) => (
                                                                    <span key={index} className="px-2 py-1 bg-cuba-elevated text-cuba-ink rounded text-xs font-medium">
                                                                        {req}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-xs text-cuba-ink-muted">{t('JobsUpdate.AppliedJobs.jobDetails.noRequirements', 'No specific requirements listed')}</span>
                                                            )}
                                                            {Array.isArray(job.requirements) && job.requirements.length > 6 && (
                                                                <span className="px-2 py-1 bg-cuba-elevated text-cuba-ink-muted rounded text-xs">+{job.requirements.length - 6} more</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <div className="bg-cuba-canvas rounded-lg p-3">
                                                            <h4 className="text-sm font-medium text-cuba-ink mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.applicationStatus', 'Application Status')}</h4>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs text-cuba-ink-muted">{t('JobsUpdate.AppliedJobs.jobDetails.status', 'Status')}:</span>
                                                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(job.status)}`}>
                                                                    {getStatusIcon(job.status)}
                                                                    {getStatusText(job.status)}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-cuba-ink-muted">
                                                                {t('JobsUpdate.AppliedJobs.jobDetails.appliedOn', 'Applied on')} {formatDate(job.appliedDate)}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="bg-cuba-canvas rounded-lg p-3">
                                                            <h4 className="text-sm font-medium text-cuba-ink mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.jobDetails', 'Job Details')}</h4>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-cuba-ink-muted">{t('JobsUpdate.AppliedJobs.jobDetails.type', 'Type')}:</span>
                                                                    <span className="text-cuba-ink font-medium">{job.jobType || 'Full-time'}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-cuba-ink-muted">{t('JobsUpdate.AppliedJobs.jobDetails.mode', 'Mode')}:</span>
                                                                    <span className="text-cuba-ink font-medium">{job.workMode || 'On-site'}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-cuba-ink-muted">{t('JobsUpdate.AppliedJobs.jobDetails.salary', 'Salary')}:</span>
                                                                    <span className="text-cuba-ink font-medium">{job.salary}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>

            {/* DIR-059: the shared Cuba confirmation dialog for withdrawal. */}
            {confirmationDialog}
        </CubaPageFrame>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export default withTranslation('common')(AppliedJobs);
