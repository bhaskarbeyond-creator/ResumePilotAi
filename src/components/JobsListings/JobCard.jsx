import React, { useState, useEffect, useContext } from 'react';
import { withTranslation } from 'react-i18next';
import { FaMapMarkerAlt, FaClock, FaBuilding, FaBookmark, FaRegBookmark, FaEye, FaUsers, FaCheckCircle, FaPaperPlane, FaClock as FaClockStatus } from 'react-icons/fa';
import JobApplicationModal from './JobApplicationModal';
import { AuthContext } from '../../context/AuthContext';
import { checkUserApplicationStatus } from '../../services/api/platform';
import { sanitizeImageUrl } from '../../utils/sanitizeHtml';

/**
 * Format raw date string into modern relative or human-readable format.
 */
const formatPostedDate = (dateStr) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && (dateStr.includes('ago') || dateStr.includes('Just') || dateStr.includes('Today') || dateStr.includes('Yesterday'))) {
        return dateStr;
    }

    try {
        let dateObj;
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                dateObj = new Date(year, month, day);
            }
        }
        if (!dateObj || isNaN(dateObj.getTime())) {
            dateObj = new Date(dateStr);
        }

        if (!isNaN(dateObj.getTime())) {
            const now = new Date();
            const diffMs = now.getTime() - dateObj.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays > 1 && diffDays < 30) return `${diffDays}d ago`;

            return dateObj.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: dateObj.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    } catch {
        // Fallback to raw date string
    }
    return dateStr;
};

/**
 * JobCard component displays high-fidelity job information with company branding,
 * structured compensation badges, quick metadata, and application status workflows.
 */
const JobCard = ({ job, isSaved, onToggleSaved, onViewDetails, onAuthRequired, onApply, t }) => {
    const user = useContext(AuthContext);
    const [showApplicationModal, setShowApplicationModal] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [applicationStatus, setApplicationStatus] = useState({
        hasApplied: false,
        status: null,
        loading: true,
    });

    // Reset image error state when job changes
    useEffect(() => {
        setImageError(false);
    }, [job.id, job.companyImage]);

    // Check if user has already applied to this job
    useEffect(() => {
        const checkApplicationStatus = async () => {
            if (!user?.uid || !job?.id) {
                setApplicationStatus({ hasApplied: false, status: null, loading: false });
                return;
            }

            try {
                const result = await checkUserApplicationStatus(user.uid, job.id);
                setApplicationStatus({
                    hasApplied: result.hasApplied,
                    status: result.status,
                    loading: false,
                });
            } catch (error) {
                console.error('❌ JobCard: Error checking application status:', error);
                setApplicationStatus({ hasApplied: false, status: null, loading: false });
            }
        };

        checkApplicationStatus();
    }, [user?.uid, job?.id]);

    const handleApplyClick = () => {
        if (onApply) {
            onApply(job);
            return;
        }

        if (applicationStatus.hasApplied) {
            return;
        }

        setShowApplicationModal(true);
    };

    const handleCloseModal = () => {
        setShowApplicationModal(false);
        if (user?.uid && job?.id) {
            checkUserApplicationStatus(user.uid, job.id).then((result) => {
                setApplicationStatus({
                    hasApplied: result.hasApplied,
                    status: result.status,
                    loading: false,
                });
            });
        }
    };

    // Helper function to get application status display
    const getApplicationStatusDisplay = () => {
        if (applicationStatus.loading) {
            return {
                text: t('JobsUpdate.JobCard2.applicationStatus.loading', 'Loading...'),
                className: 'bg-slate-400 text-white cursor-not-allowed',
                icon: FaClockStatus,
                disabled: true,
            };
        }

        if (!user?.uid) {
            return {
                text: t('JobsUpdate.JobCard2.applicationStatus.applyNow', 'Apply Now'),
                className: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-sm hover:shadow-md hover:shadow-blue-500/20 active:scale-95',
                icon: FaPaperPlane,
                disabled: false,
            };
        }

        if (applicationStatus.hasApplied) {
            const statusConfig = {
                pending: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.pending', 'Application Pending'),
                    className: 'bg-amber-50 text-amber-800 border border-amber-300/80 cursor-not-allowed font-semibold',
                    icon: FaClockStatus,
                },
                interview: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.interview', 'Interview Scheduled'),
                    className: 'bg-blue-50 text-blue-800 border border-blue-300/80 cursor-not-allowed font-semibold',
                    icon: FaCheckCircle,
                },
                accepted: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.accepted', 'Application Accepted'),
                    className: 'bg-emerald-50 text-emerald-800 border border-emerald-300/80 cursor-not-allowed font-semibold',
                    icon: FaCheckCircle,
                },
                rejected: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.rejected', 'Application Closed'),
                    className: 'bg-slate-100 text-slate-600 border border-slate-200 cursor-not-allowed font-semibold',
                    icon: FaCheckCircle,
                },
            };

            const config = statusConfig[applicationStatus.status] || statusConfig.pending;
            return {
                ...config,
                disabled: true,
            };
        }

        return {
            text: t('JobsUpdate.JobCard2.applicationStatus.applyNow', 'Apply Now'),
            className: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-sm hover:shadow-md hover:shadow-blue-500/20 active:scale-95',
            icon: FaPaperPlane,
            disabled: false,
        };
    };

    // Deterministic palette generator for company monogram avatars
    const getCompanyPalette = (companyName) => {
        const palettes = [
            { bg: 'from-violet-600 to-indigo-700', text: 'text-white', ring: 'ring-violet-200' },
            { bg: 'from-blue-600 to-cyan-600', text: 'text-white', ring: 'ring-blue-200' },
            { bg: 'from-emerald-600 to-teal-700', text: 'text-white', ring: 'ring-emerald-200' },
            { bg: 'from-rose-500 to-pink-600', text: 'text-white', ring: 'ring-rose-200' },
            { bg: 'from-amber-500 to-orange-600', text: 'text-white', ring: 'ring-amber-200' },
            { bg: 'from-indigo-600 to-purple-700', text: 'text-white', ring: 'ring-indigo-200' },
            { bg: 'from-teal-600 to-emerald-700', text: 'text-white', ring: 'ring-teal-200' },
            { bg: 'from-slate-700 to-slate-900', text: 'text-white', ring: 'ring-slate-300' },
        ];
        if (!companyName) return palettes[0];
        let hash = 0;
        for (let i = 0; i < companyName.length; i++) {
            hash = (hash << 5) - hash + companyName.charCodeAt(i);
            hash |= 0;
        }
        const index = Math.abs(hash) % palettes.length;
        return palettes[index];
    };

    // Style helper for work mode
    const getWorkModeBadgeStyle = (mode) => {
        const lower = String(mode || '').toLowerCase();
        if (lower.includes('remote')) {
            return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
        }
        if (lower.includes('hybrid')) {
            return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
        }
        return 'bg-slate-50 text-slate-700 border-slate-200/80';
    };

    // Requirements slice
    const requirements = Array.isArray(job.requirements) ? job.requirements : [];
    const visibleRequirements = requirements.slice(0, 3);
    const remainingCount = Math.max(0, requirements.length - 3);

    // Monogram fallback
    const companyMonogram = job.company
        ? job.company
              .split(' ')
              .map((w) => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
        : 'CO';

    const companyPalette = getCompanyPalette(job.company);

    return (
        <article className="group relative bg-white border border-slate-200/90 hover:border-blue-400 rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
            {/* Top Micro Gradient Bar on Hover */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="flex items-start justify-between gap-4 mb-3.5">
                <div className="flex items-start gap-3.5 sm:gap-4 flex-1 min-w-0">
                    {/* Company Logo or Monogram with Premium Depth */}
                    <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/80 border border-slate-200/90 shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:border-blue-300/80 group-hover:shadow-md transition-all duration-300 p-0.5">
                        {sanitizeImageUrl(job.companyImage) && !imageError ? (
                            <img
                                src={sanitizeImageUrl(job.companyImage)}
                                alt={`${job.company} logo`}
                                className="w-full h-full object-contain rounded-xl p-1"
                                onError={() => setImageError(true)}
                                onLoad={() => setImageError(false)}
                            />
                        ) : (
                            <div className={`w-full h-full rounded-xl bg-gradient-to-br ${companyPalette.bg} ${companyPalette.text} font-black text-base sm:text-lg flex items-center justify-center tracking-wider shadow-inner ring-1 ring-white/20`}>
                                {companyMonogram || <FaBuilding className="w-5 h-5 text-white" />}
                            </div>
                        )}
                    </div>

                    {/* Job Details Header */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3
                                onClick={() => onViewDetails && onViewDetails(job)}
                                className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors cursor-pointer truncate leading-snug tracking-tight">
                                {job.title}
                            </h3>
                        </div>

                        {/* Company Name with Verified Employer Badge */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-slate-800 font-semibold text-sm truncate">{job.company}</span>
                            <span className="inline-flex items-center text-blue-500 shrink-0" title="Verified Employer">
                                <FaCheckCircle className="w-3.5 h-3.5" />
                            </span>
                        </div>

                        {/* Metadata Row (Cleaned up: No duplicate date display) */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                            <div className="flex items-center space-x-1.5">
                                <FaMapMarkerAlt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-600 truncate max-w-[220px]">
                                    {job.location && job.country
                                        ? `${job.location}, ${job.country}`
                                        : job.location || job.country || t('JobsUpdate.JobCard2.jobInfo.locationTBD', 'Location TBD')}
                                </span>
                            </div>
                            {typeof job.applicants === 'number' && (
                                <div className="flex items-center space-x-1.5">
                                    <FaUsers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-medium text-slate-600">
                                        {t('JobsUpdate.JobCard2.jobInfo.applicants', '{{applicants}} applicants', { applicants: job.applicants })}
                                    </span>
                                </div>
                            )}
                            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Actively Hiring</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bookmark Button */}
                <button
                    onClick={() => onToggleSaved && onToggleSaved(job.id)}
                    type="button"
                    aria-label={isSaved ? 'Remove from saved jobs' : 'Save job'}
                    title={isSaved ? 'Saved to bookmarks' : 'Save to bookmarks'}
                    className={`p-2.5 rounded-xl border transition-all duration-200 flex-shrink-0 cursor-pointer ${
                        isSaved
                            ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-2xs scale-105'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-400 hover:text-blue-600 hover:scale-105 active:scale-95'
                    }`}>
                    {isSaved ? <FaBookmark className="w-4 h-4 text-blue-600" /> : <FaRegBookmark className="w-4 h-4" />}
                </button>
            </div>

            {/* Description & Attributes */}
            <div className="mb-4">
                {job.description && (
                    <p className="text-slate-600 text-sm leading-relaxed line-clamp-2 mb-3.5 font-normal">
                        {job.description}
                    </p>
                )}

                {/* Harmonious Badges Strip */}
                <div className="flex flex-wrap items-center gap-2 mb-3.5">
                    {job.salary && (
                        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 border border-emerald-200/90 px-3 py-1 rounded-lg text-xs font-bold shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {job.salary}
                        </span>
                    )}
                    {job.workMode && (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getWorkModeBadgeStyle(job.workMode)}`}>
                            {String(job.workMode).toLowerCase().includes('remote') ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            ) : (
                                <FaBuilding className="w-3 h-3 text-slate-400" />
                            )}
                            {job.workMode}
                        </span>
                    )}
                    {job.type && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            <span className="w-1 h-1 rounded-full bg-blue-400" />
                            <span className="capitalize">{job.type}</span>
                        </span>
                    )}
                    {job.experienceLevel && (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            {job.experienceLevel}
                        </span>
                    )}
                </div>

                {/* Requirements & Skills Strip */}
                {requirements.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                            <span className="w-1.5 h-1.5 rounded-sm bg-slate-400" />
                            {t('JobsUpdate.JobCard2.jobInfo.requirements', 'Requirements')}:
                        </span>
                        {visibleRequirements.map((req, index) => (
                            <span
                                key={index}
                                className="inline-flex items-center bg-slate-50 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200/80 transition-colors">
                                {req}
                            </span>
                        ))}
                        {remainingCount > 0 && (
                            <button
                                type="button"
                                onClick={() => onViewDetails && onViewDetails(job)}
                                className="inline-flex items-center bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-2.5 py-1 rounded-lg text-xs border border-blue-200/80 cursor-pointer transition-colors active:scale-95">
                                +{remainingCount} {t('JobsUpdate.JobCard2.jobInfo.more', 'more')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Action Bar Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-slate-100">
                <div className="flex items-center space-x-2.5">
                    {(() => {
                        const statusDisplay = getApplicationStatusDisplay();
                        const IconComponent = statusDisplay.icon;

                        return (
                            <button
                                onClick={handleApplyClick}
                                disabled={statusDisplay.disabled}
                                type="button"
                                className={`${statusDisplay.className} px-4 py-2 rounded-xl font-bold transition-all duration-200 text-sm flex items-center space-x-2`}>
                                {IconComponent && <IconComponent className="w-3.5 h-3.5" />}
                                <span>{statusDisplay.text}</span>
                            </button>
                        );
                    })()}

                    <button
                        onClick={() => onViewDetails && onViewDetails(job)}
                        type="button"
                        className="border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-50 px-4 py-2 rounded-xl font-semibold transition-all duration-200 flex items-center space-x-1.5 text-sm active:scale-95 group/btn cursor-pointer">
                        <FaEye className="w-3.5 h-3.5 text-slate-400 group-hover/btn:text-blue-600 transition-colors" />
                        <span>{t('JobsUpdate.JobCard2.buttons.viewDetails', 'View Details')}</span>
                    </button>
                </div>

                <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/70 self-start sm:self-auto">
                    <FaClock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{t('JobsUpdate.JobCard2.jobInfo.posted', 'Posted {{postedDate}}', { postedDate: formatPostedDate(job.postedDate) })}</span>
                </div>
            </div>


            {/* Job Application Modal */}
            <JobApplicationModal isOpen={showApplicationModal} onClose={handleCloseModal} job={job} />
        </article>
    );
};

const TranslatedJobCard = withTranslation('common')(JobCard);
export default TranslatedJobCard;

