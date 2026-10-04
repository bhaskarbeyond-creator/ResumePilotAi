import { sanitizeUrl } from '../../utils/sanitizeHtml';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import {
    FaTimes,
    FaBriefcase,
    FaMapMarkerAlt,
    FaBuilding,
    FaBookmark,
    FaExpand,
    FaCompress,
    FaCheckCircle,
} from 'react-icons/fa';

const JobDetailsModal = ({
    job,
    isOpen,
    onClose,
    isSaved,
    _isSaved,
    onToggleSaved,
    _onToggleSaved,
    onApplyNow,
    t,
}) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [isExpanded, setIsExpanded] = useState(false);
    const [shareStatus, setShareStatus] = useState('');
    const dialogRef = useRef(null);

    const activeSaved = isSaved ?? _isSaved ?? false;
    const activeToggleSaved = onToggleSaved || _onToggleSaved;

    // Prevent background scrolling and keep keyboard focus inside the modal.
    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.documentElement.style.overflow;
        const previousFocus = document.activeElement;
        document.documentElement.style.overflow = 'hidden';
        dialogRef.current?.focus({ preventScroll: true });

        const handleDialogKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose?.();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = [...dialogRef.current.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            )].filter(element => element.getAttribute('aria-hidden') !== 'true');
            if (!focusable.length) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleDialogKeyDown);
        return () => {
            document.removeEventListener('keydown', handleDialogKeyDown);
            document.documentElement.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [isOpen, onClose]);

    const requirements = Array.isArray(job?.requirements) ? job.requirements : [];
    const benefits = Array.isArray(job?.benefits)
        ? job.benefits.map(item => String(item || '').trim()).filter(Boolean)
        : [];
    const safeCompanyWebsite = sanitizeUrl(job?.companyWebsite || job?.company_url || '');
    const companyWebsite = /^https?:\/\//i.test(safeCompanyWebsite) ? safeCompanyWebsite : '';
    const companyDescription = String(job?.companyDescription || job?.company_description || '').trim();
    const companyIndustry = String(job?.companyIndustry || job?.company_industry || '').trim();
    const companySize = String(job?.companySize || job?.company_size || '').trim();
    const enhancedJob = {
        ...job,
        company: String(job?.company || job?.company_name || job?.companyName || '').trim(),
        location: String(job?.location || '').trim(),
        workMode: String(job?.workMode || job?.workplace_type || job?.workplaceType || '').trim(),
        salary: typeof job?.salary === 'string' ? job.salary.trim() : '',
        requirements,
    };

    const handleShare = async () => {
        const shareUrl = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: job?.title || 'Job opportunity', url: shareUrl });
                setShareStatus('Job link shared.');
            } else {
                await navigator.clipboard.writeText(shareUrl);
                setShareStatus('Job link copied.');
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            setShareStatus('Unable to share this job from this browser.');
        }
        window.setTimeout(() => setShareStatus(''), 3000);
    };

    const tabs = [
        { id: 'overview', label: t('JobsUpdate.JobDetailsModal.tabs.overview', 'Overview'), icon: FaBriefcase },
        { id: 'company', label: t('JobsUpdate.JobDetailsModal.tabs.company', 'Company'), icon: FaBuilding },
    ];

    const companyName = String(job?.company || job?.company_name || job?.companyName || '').trim();
    const companyMonogram = companyName
        ? companyName.split(/\s+/).map(word => word[0]).join('').toUpperCase().slice(0, 2)
        : '—';

    return (
        <AnimatePresence>
            {isOpen && job && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[10001]"
                        aria-hidden="true"
                        onClick={onClose}
                    />

                    {/* Slide-over Drawer Modal */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{
                            type: 'spring',
                            damping: 28,
                            stiffness: 300,
                        }}
                        ref={dialogRef}
                        className={`fixed top-0 right-0 h-screen bg-white shadow-2xl z-[10002] overflow-hidden border-l border-slate-200 flex flex-col ${
                            isExpanded ? 'w-full' : 'w-full lg:w-[620px] xl:w-[680px]'
                        }`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="job-detail-title"
                        tabIndex={-1}>
                        {/* Drawer Header */}
                        <div className="bg-white border-b border-slate-100 flex-shrink-0">
                            {/* Top Control Bar */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                    {job.type && <span className="uppercase tracking-wider">{job.type}</span>}
                                    {job.type && enhancedJob.workMode && <span aria-hidden="true">·</span>}
                                    {enhancedJob.workMode && <span>{enhancedJob.workMode}</span>}
                                    {!job.type && !enhancedJob.workMode && <span>Job details</span>}
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 transition-colors"
                                        aria-label={isExpanded ? 'Use compact job details view' : 'Expand job details'}>
                                        {isExpanded ? <FaCompress aria-hidden="true" className="w-3.5 h-3.5" /> : <FaExpand aria-hidden="true" className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 transition-colors"
                                        aria-label="Close job details">
                                        <FaTimes aria-hidden="true" className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Job Brief Header */}
                            <div className="px-6 pt-5 pb-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white font-extrabold text-lg flex items-center justify-center shadow-md flex-shrink-0">
                                        {companyMonogram}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h1 id="job-detail-title" className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mb-1">
                                            {enhancedJob.title}
                                        </h1>
                                        <div className="flex items-center gap-3 text-sm text-slate-600 flex-wrap font-medium">
                                            <span className="flex items-center gap-1.5 font-bold text-slate-800">
                                                <FaBuilding aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
                                                {enhancedJob.company || 'Employer not listed'}
                                            </span>
                                            {enhancedJob.location && (
                                                <span className="flex items-center gap-1 text-slate-500">
                                                    <FaMapMarkerAlt aria-hidden="true" className="w-3 h-3 text-slate-400" />
                                                    {enhancedJob.location}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Highlight Pills */}
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    {enhancedJob.salary && (
                                        <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-900 text-xs font-semibold rounded-xl border border-emerald-200">
                                            {enhancedJob.salary}
                                        </span>
                                    )}

                                    {enhancedJob.workMode && (
                                        <span className="px-3 py-1.5 bg-blue-50 text-blue-800 text-xs font-semibold rounded-xl border border-blue-200">
                                            {enhancedJob.workMode}
                                        </span>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleShare}
                                        className="px-3 py-1.5 bg-indigo-50 text-indigo-800 text-xs font-semibold rounded-xl border border-indigo-200 hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                                    >
                                        Share job
                                    </button>
                                    {shareStatus && <span role="status" aria-live="polite" className="sr-only">{shareStatus}</span>}
                                </div>
                            </div>

                            {/* Navigation Tabs */}
                            <div className="px-6 flex space-x-2 border-t border-slate-100" role="tablist" aria-label="Job information sections">
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            id={`job-detail-tab-${tab.id}`}
                                            type="button"
                                            role="tab"
                                            aria-selected={isActive}
                                            aria-controls={`job-detail-panel-${tab.id}`}
                                            tabIndex={isActive ? 0 : -1}
                                            onClick={() => setActiveTab(tab.id)}
                                            onKeyDown={event => {
                                                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                                event.preventDefault();
                                                const index = tabs.findIndex(item => item.id === tab.id);
                                                const next = event.key === 'Home' ? 0
                                                    : event.key === 'End' ? tabs.length - 1
                                                        : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
                                                setActiveTab(tabs[next].id);
                                                document.getElementById(`job-detail-tab-${tabs[next].id}`)?.focus();
                                            }}
                                            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                                                isActive
                                                    ? 'border-blue-600 text-blue-700'
                                                    : 'border-transparent text-slate-700 hover:text-slate-900'
                                            }`}>
                                            <Icon aria-hidden="true" className="w-3.5 h-3.5" />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Drawer Body Scroll Area */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <section
                                id="job-detail-panel-overview"
                                role="tabpanel"
                                aria-labelledby="job-detail-tab-overview"
                                tabIndex={0}
                                hidden={activeTab !== 'overview'}
                                className="space-y-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                            >
                                    {/* Job Description */}
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">
                                            {t('JobsUpdate.JobDetailsModal.jobDescription', 'Job Overview')}
                                        </h3>
                                        <div className="text-sm text-slate-600 leading-relaxed space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                                            {enhancedJob.description || (
                                                <p role="status" className="text-slate-600">The employer did not provide a job description.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Key Requirements */}
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">
                                            {t('JobsUpdate.JobDetailsModal.qualifications', 'Requirements & Skills')}
                                        </h3>
                                        <div className="space-y-2">
                                            {enhancedJob.requirements && enhancedJob.requirements.length > 0 ? (
                                                enhancedJob.requirements.map((req, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200/80 text-sm text-slate-700">
                                                        <FaCheckCircle aria-hidden="true" className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                        <span>{req}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-slate-600" role="status">
                                                    The employer did not provide structured requirements for this listing.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Employer-provided benefits only; no inferred package. */}
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">Perks &amp; Benefits</h3>
                                        {benefits.length ? (
                                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {benefits.map((benefit, index) => (
                                                    <li key={`${benefit}-${index}`} className="p-3.5 rounded-xl border border-slate-200/80 bg-white text-sm text-slate-800">
                                                        {benefit}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-slate-600" role="status">No benefits were specified by the employer.</p>
                                        )}
                                    </div>
                            </section>

                            <section
                                id="job-detail-panel-company"
                                role="tabpanel"
                                aria-labelledby="job-detail-tab-company"
                                tabIndex={0}
                                hidden={activeTab !== 'company'}
                                className="space-y-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                            >
                                    <section className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80" aria-labelledby="employer-profile-heading">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div aria-hidden="true" className="w-12 h-12 rounded-xl bg-indigo-700 text-white font-bold text-base flex items-center justify-center shadow-sm">
                                                {companyMonogram}
                                            </div>
                                            <div>
                                                <h2 id="employer-profile-heading" className="text-lg font-bold text-slate-900">{enhancedJob.company || 'Employer not listed'}</h2>
                                                <p className="text-sm text-slate-600">Employer details supplied with this posting</p>
                                            </div>
                                        </div>
                                        {(companyIndustry || companySize) ? (
                                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                                {companyIndustry && <div className="p-3 bg-white rounded-xl border border-slate-200"><dt className="text-xs text-slate-600">Industry</dt><dd className="font-semibold text-slate-900 mt-1">{companyIndustry}</dd></div>}
                                                {companySize && <div className="p-3 bg-white rounded-xl border border-slate-200"><dt className="text-xs text-slate-600">Company size</dt><dd className="font-semibold text-slate-900 mt-1">{companySize}</dd></div>}
                                            </dl>
                                        ) : null}
                                        {companyWebsite && (
                                            <a href={companyWebsite} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex font-semibold text-indigo-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
                                                Visit employer website <span className="sr-only">(opens in a new tab)</span>
                                            </a>
                                        )}
                                        {!companyIndustry && !companySize && !companyWebsite && !companyDescription && (
                                            <p role="status" className="text-sm text-slate-600">No additional employer profile details were included with this posting.</p>
                                        )}
                                    </section>

                                    {companyDescription && (
                                        <section aria-labelledby="about-employer-heading">
                                            <h3 id="about-employer-heading" className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">About the employer</h3>
                                            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200">{companyDescription}</p>
                                        </section>
                                    )}
                            </section>
                        </div>

                        {/* Drawer Footer Actions */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => onApplyNow && onApplyNow(job)}
                                className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold py-3 px-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm active:scale-98">
                                <FaBriefcase aria-hidden="true" className="w-4 h-4" />
                                <span>{t('JobsUpdate.JobDetailsModal.actions.applyNow', 'Apply for this Role')}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (activeToggleSaved && job?.id) {
                                        activeToggleSaved(job.id);
                                    }
                                }}
                                className={`px-4 py-3 border rounded-xl font-bold transition-all duration-200 flex items-center gap-2 text-sm ${
                                    activeSaved
                                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-700'
                                }`}>
                                <FaBookmark className={`w-3.5 h-3.5 ${activeSaved ? 'text-blue-600' : 'text-slate-400'}`} />
                                <span>{activeSaved ? t('JobsUpdate.JobDetailsModal.actions.saved', 'Saved') : t('JobsUpdate.JobDetailsModal.actions.save', 'Save')}</span>
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default withTranslation('common')(JobDetailsModal);
