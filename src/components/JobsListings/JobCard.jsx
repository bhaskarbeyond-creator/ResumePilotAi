import React, { useState, useEffect, useContext } from 'react';
import { withTranslation } from 'react-i18next';
import { FaMapMarkerAlt, FaClock, FaBuilding, FaBookmark, FaRegBookmark, FaEye, FaUsers, FaCheckCircle, FaClock as FaClockStatus } from 'react-icons/fa';
import JobApplicationModal from './JobApplicationModal';
import { AuthContext } from '../../main';
import { checkUserApplicationStatus } from '../../firestore/dbOperations';

/**
 * JobCard component displays job information with company logo support
 *
 * Expected job object structure:
 * {
 *   id: string,
 *   title: string,
 *   company: string,
 *   companyImage: string (optional - URL to company logo),
 *   location: string,
 *   country: string,
 *   description: string,
 *   type: string,
 *   workMode: string,
 *   experienceLevel: string,
 *   salary: string,
 *   requirements: string[],
 *   postedDate: string,
 *   applicants: number
 * }
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
        // Check if user is authenticated
        if (!user?.uid) {
            // Trigger auth modal through parent component
            if (onAuthRequired) {
                onAuthRequired();
            } else {
                alert(t('JobsUpdate.JobCard2.alerts.signInRequired', 'Please sign in to apply for jobs.'));
            }
            return;
        }

        // Don't allow applying if user has already applied
        if (applicationStatus.hasApplied) {
            return;
        }

        setShowApplicationModal(true);
    };

    const handleCloseModal = () => {
        setShowApplicationModal(false);
        // Refresh application status after modal closes (in case user applied)
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
                className: 'bg-slate-400 cursor-not-allowed',
                icon: FaClockStatus,
                disabled: true,
            };
        }

        if (!user?.uid) {
            return {
                text: t('JobsUpdate.JobCard2.applicationStatus.applyNow', 'Apply Now'),
                className: 'bg-blue-600 hover:bg-blue-700',
                icon: null,
                disabled: false,
            };
        }

        if (applicationStatus.hasApplied) {
            const statusConfig = {
                pending: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.pending', 'Application Pending'),
                    className: 'bg-amber-100 text-amber-800 border border-amber-200 cursor-not-allowed',
                    icon: FaClockStatus,
                },
                interview: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.interview', 'Interview Scheduled'),
                    className: 'bg-slate-100 text-slate-700 border border-slate-300 cursor-not-allowed',
                    icon: FaCheckCircle,
                },
                accepted: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.accepted', 'Application Accepted'),
                    className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-not-allowed',
                    icon: FaCheckCircle,
                },
                rejected: {
                    text: t('JobsUpdate.JobCard2.applicationStatus.rejected', 'Application Rejected'),
                    className: 'bg-slate-100 text-slate-600 border border-slate-200 cursor-not-allowed',
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
            className: 'bg-blue-600 hover:bg-blue-700',
            icon: null,
            disabled: false,
        };
    };

    return (
        <div className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-lg transition-all duration-300 group hover:border-slate-300 shadow-sm">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center group-hover:bg-blue-50 transition-all duration-200 overflow-hidden border border-slate-200 group-hover:border-blue-200">
                        {job.companyImage && job.companyImage.trim() !== '' && !imageError ? (
                            <img src={job.companyImage} alt={`${job.company} logo`} className="w-full h-full object-cover" onError={() => setImageError(true)} onLoad={() => setImageError(false)} />
                        ) : (
                            <FaBuilding className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors duration-200" />
                        )}
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 mb-1 group-hover:text-slate-700 transition-colors duration-200 leading-tight">{job.title}</h3>
                        <p className="text-slate-600 font-medium mb-3 text-sm">{job.company}</p>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                            <div className="flex items-center space-x-1.5">
                                <FaMapMarkerAlt className="w-3 h-3 text-slate-400" />
                                <span className="font-medium">{job.location && job.country ? `${job.location}, ${job.country}` : job.location || job.country || t('JobsUpdate.JobCard2.jobInfo.locationTBD', 'Location TBD')}</span>
                            </div>
                            <div className="flex items-center space-x-1.5">
                                <FaClock className="w-3 h-3 text-slate-400" />
                                <span className="font-medium">{job.postedDate}</span>
                            </div>
                            <div className="flex items-center space-x-1.5">
                                <FaUsers className="w-3 h-3 text-slate-400" />
                                <span className="font-medium">{t('JobsUpdate.JobCard2.jobInfo.applicants', '{{applicants}} applicants', { applicants: job.applicants })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <button onClick={() => onToggleSaved(job.id)} className="p-2.5 rounded-lg hover:bg-slate-50 transition-all duration-200 group/save border border-slate-200 hover:border-slate-300">
                    {isSaved ? <FaBookmark className="w-4 h-4 text-blue-600" /> : <FaRegBookmark className="w-4 h-4 text-slate-400 group-hover/save:text-blue-600 transition-colors duration-200" />}
                </button>
            </div>

            <div className="mb-5">
                <p className="text-slate-600 mb-4 text-sm leading-relaxed line-clamp-2">{job.description}</p>

                <div className="flex flex-wrap gap-2 mb-4">
                    <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md text-xs font-medium border border-blue-200">{job.type}</span>
                    <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md text-xs font-medium border border-emerald-200">{job.workMode}</span>
                    <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200">{job.experienceLevel}</span>
                    <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md text-xs font-medium border border-amber-200">{job.salary}</span>
                </div>

                <div className="mb-3">
                    <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">{t('JobsUpdate.JobCard2.jobInfo.requirements', 'Requirements')}</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {job.requirements.map((req, index) => (
                            <span key={index} className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded text-xs font-medium border border-slate-200">
                                {req}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <div className="flex space-x-3">
                    {(() => {
                        const statusDisplay = getApplicationStatusDisplay();
                        const IconComponent = statusDisplay.icon;

                        return (
                            <button
                                onClick={handleApplyClick}
                                disabled={statusDisplay.disabled}
                                className={`${statusDisplay.className} ${
                                    statusDisplay.disabled ? 'cursor-not-allowed' : 'text-white cursor-pointer'
                                } px-4 py-2.5 rounded-md font-medium transition-all duration-200 text-sm flex items-center space-x-2`}>
                                {IconComponent && <IconComponent className="w-3.5 h-3.5" />}
                                <span>{statusDisplay.text}</span>
                            </button>
                        );
                    })()}
                    <button
                        onClick={() => onViewDetails(job)}
                        className="border border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-800 hover:bg-slate-50 px-4 py-2.5 rounded-md font-medium transition-all duration-200 flex items-center space-x-2 text-sm">
                        <FaEye className="w-3.5 h-3.5" />
                        <span>{t('JobsUpdate.JobCard2.buttons.viewDetails', 'View Details')}</span>
                    </button>
                </div>

                <div className="text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">{t('JobsUpdate.JobCard2.jobInfo.posted', 'Posted {{postedDate}}', { postedDate: job.postedDate })}</div>
            </div>

            {/* Job Application Modal */}
            <JobApplicationModal isOpen={showApplicationModal} onClose={handleCloseModal} job={job} />
        </div>
    );
};

const TranslatedJobCard = withTranslation('common')(JobCard);
export default TranslatedJobCard;
