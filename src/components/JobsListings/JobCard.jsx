import React, { useState, useEffect, useContext } from 'react';
import { withTranslation } from 'react-i18next';
import { FaMapMarkerAlt, FaClock, FaBuilding, FaBookmark, FaRegBookmark, FaEye, FaUsers, FaCheckCircle, FaPaperPlane, FaClock as FaClockStatus } from 'react-icons/fa';
import JobApplicationModal from './JobApplicationModal';
import { AuthContext } from '../../context/AuthContext';
import { checkUserApplicationStatus } from '../../services/api/platform';
import { sanitizeImageUrl } from '../../utils/sanitizeHtml';

/**
 * JobCard component displays high-fidelity job information with company branding,
 * structured compensation badges, quick metadata, and application status workflows.
 */
const JobCard = ({ job, isSaved, onToggleSaved, onViewDetails, onAuthRequired, t }) => {
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
        if (!user?.uid) {
            if (onAuthRequired) {
                onAuthRequired();
            } else {
                alert(t('JobsUpdate.JobCard2.alerts.signInRequired', 'Please sign in to apply for jobs.'));
            }
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
                className: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-sm hover:shadow-md active:scale-95',
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
            className: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-sm hover:shadow-md active:scale-95',
            icon: FaPaperPlane,
            disabled: false,
        };
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

    return (
        <article className="group relative bg-white border border-slate-200/80 hover:border-blue-300/90 rounded-2xl p-5 sm:p-6 shadow-xs hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
            {/* Top Micro Gradient Bar on Hover */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="flex items-start justify-between gap-4 mb-3.5">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Company Logo or Monogram */}
                    <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/90 shadow-2xs flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:border-blue-200 transition-colors">
                        {sanitizeImageUrl(job.companyImage) && !imageError ? (
                            <img
                                src={sanitizeImageUrl(job.companyImage)}
                                alt={`${job.company} logo`}
                                className="w-full h-full object-contain p-1.5"
                                onError={() => setImageError(true)}
                                onLoad={() => setImageError(false)}
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 font-extrabold text-base flex items-center justify-center tracking-wider">
                                {companyMonogram || <FaBuilding className="w-5 h-5 text-blue-600" />}
                            </div>
                        )}
                    </div>

                    {/* Job Details Header */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3
                                onClick={() => onViewDetails(job)}
                                className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors cursor-pointer truncate">
                                {job.title}
                            </h3>
                        </div>
                        <p className="text-slate-700 font-semibold text-sm mb-2 truncate">{job.company}</p>

                        {/* Metadata Row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                            <div className="flex items-center space-x-1.5">
                                <FaMapMarkerAlt className="w-3 h-3 text-slate-400" />
                                <span className="font-medium text-slate-600 truncate max-w-[200px]">
                                    {job.location && job.country
                                        ? `${job.location}, ${job.country}`
                                        : job.location || job.country || t('JobsUpdate.JobCard2.jobInfo.locationTBD', 'Location TBD')}
                                </span>
                            </div>
                            <div className="flex items-center space-x-1.5">
                                <FaClock className="w-3 h-3 text-slate-400" />
                                <span className="font-medium text-slate-600">{job.postedDate}</span>
                            </div>
                            {typeof job.applicants === 'number' && (
                                <div className="flex items-center space-x-1.5">
                                    <FaUsers className="w-3 h-3 text-slate-400" />
                                    <span className="font-medium text-slate-600">
                                        {t('JobsUpdate.JobCard2.jobInfo.applicants', '{{applicants}} applicants', { applicants: job.applicants })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bookmark Button */}
                <button
                    onClick={() => onToggleSaved(job.id)}
                    type="button"
                    aria-label={isSaved ? 'Remove from saved jobs' : 'Save job'}
                    className={`p-2.5 rounded-xl border transition-all duration-200 flex-shrink-0 ${
                        isSaved
                            ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-2xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-400 hover:text-blue-600'
                    }`}>
                    {isSaved ? <FaBookmark className="w-4 h-4 text-blue-600" /> : <FaRegBookmark className="w-4 h-4" />}
                </button>
            </div>

            {/* Description & Attributes */}
            <div className="mb-4">
                {job.description && (
                    <p className="text-slate-600 text-sm leading-relaxed line-clamp-2 mb-3.5">
                        {job.description}
                    </p>
                )}

                {/* Badges Strip */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {job.workMode && (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${getWorkModeBadgeStyle(job.workMode)}`}>
                            {job.workMode}
                        </span>
                    )}
                    {job.type && (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            {job.type}
                        </span>
                    )}
                    {job.experienceLevel && (
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            {job.experienceLevel}
                        </span>
                    )}
                    {job.salary && (
                        <span className="bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 border border-emerald-200/90 px-3 py-1 rounded-lg text-xs font-bold shadow-2xs">
                            {job.salary}
                        </span>
                    )}
                </div>

                {/* Requirements Chips */}
                {requirements.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mr-1">
                            {t('JobsUpdate.JobCard2.jobInfo.requirements', 'Requirements')}:
                        </span>
                        {visibleRequirements.map((req, index) => (
                            <span
                                key={index}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md text-xs font-medium border border-slate-200/80 transition-colors">
                                {req}
                            </span>
                        ))}
                        {remainingCount > 0 && (
                            <span
                                onClick={() => onViewDetails(job)}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-semibold border border-blue-200/80 cursor-pointer transition-colors">
                                +{remainingCount} {t('JobsUpdate.JobCard2.jobInfo.more', 'more')}
                            </span>
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
                        onClick={() => onViewDetails(job)}
                        type="button"
                        className="border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-50 px-3.5 py-2 rounded-xl font-semibold transition-all duration-200 flex items-center space-x-1.5 text-sm">
                        <FaEye className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('JobsUpdate.JobCard2.buttons.viewDetails', 'View Details')}</span>
                    </button>
                </div>

                <div className="text-[11px] text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 self-start sm:self-auto">
                    {t('JobsUpdate.JobCard2.jobInfo.posted', 'Posted {{postedDate}}', { postedDate: job.postedDate })}
                </div>
            </div>

            {/* Job Application Modal */}
            <JobApplicationModal isOpen={showApplicationModal} onClose={handleCloseModal} job={job} />
        </article>
    );
};

const TranslatedJobCard = withTranslation('common')(JobCard);
export default TranslatedJobCard;
