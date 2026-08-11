import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { withTranslation } from 'react-i18next';
import './JobApplicationsModal.css';
import SendMessageDialog from './SendMessageDialog';
import fire from '../../../conf/fire';
import { updateApplicationStatusWithMessage } from '../../../firestore/dbOperations';
import RejectionReasonModal from './RejectionReasonModal';
import {
    FaTimes,
    FaUser,
    FaEnvelope,
    FaCalendar,
    FaFileAlt,
    FaDownload,
    FaCheckCircle,
    FaTimesCircle,
    FaUsers,
    FaClock,
    FaEye,
    FaChevronDown,
    FaChevronUp,
    FaSearch,
    FaFilter,
    FaExpand,
    FaCompress,
    FaCommentAlt,
} from 'react-icons/fa';

const JobApplicationsModal = ({ isOpen, onClose, job, applications, onUpdateStatus, showToast, t }) => {
    const [filteredApplications, setFilteredApplications] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedApplication, setExpandedApplication] = useState(null);
    const [updatingStatus, setUpdatingStatus] = useState(null);
    const [messageApplicant, setMessageApplicant] = useState(null);

    useEffect(() => {
        if (applications) {
            filterApplications();
        }
    }, [applications, searchTerm, statusFilter]);

    const filterApplications = () => {
        let filtered = [...applications];

        // Filter by search term
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (app) =>
                    app.applicantName.toLowerCase().includes(searchLower) ||
                    app.applicantEmail.toLowerCase().includes(searchLower) ||
                    app.skills.some((skill) => skill.toLowerCase().includes(searchLower))
            );
        }

        // Filter by status
        if (statusFilter !== 'all') {
            filtered = filtered.filter((app) => app.status === statusFilter);
        }

        setFilteredApplications(filtered);
    };

const [selectedApplication, setSelectedApplication] = useState(null);
    const [isRejectionModalOpen, setRejectionModalOpen] = useState(false);

    const handleStatusUpdate = async (applicationId, newStatus, rejectionMessage = '') => {
        setUpdatingStatus(applicationId);
        try {
            console.log('Updating application status:', { applicationId, newStatus, rejectionMessage });

            // Update the database
            const result = await updateApplicationStatusWithMessage(applicationId, newStatus, rejectionMessage);

            if (result.success) {
                // Update local state immediately for better UX
                setFilteredApplications((prev) => prev.map((app) => (app.id === applicationId ? { ...app, status: newStatus, statusUpdatedAt: new Date() } : app)));

                // Also call the parent callback if provided
                if (onUpdateStatus) {
                    onUpdateStatus(applicationId, newStatus);
                }

                // Show success toast
                if (showToast) {
                    showToast('success', 'Success', `Application status updated to ${newStatus}`);
                }

                console.log('Application status updated successfully');
            } else {
                console.error('Failed to update application status:', result.error);
                if (showToast) {
                    showToast('error', 'Error', 'Failed to update application status. Please try again.');
                } else {
                    alert('Failed to update application status. Please try again.');
                }
            }
        } catch (error) {
            console.error('Error updating application status:', error);
            if (showToast) {
                showToast('error', 'Error', 'An error occurred while updating the application status. Please try again.');
            } else {
                alert('An error occurred while updating the application status. Please try again.');
            }
        } finally {
            setUpdatingStatus(null);
            setRejectionModalOpen(false);
        }
    };

    const openRejectionModal = (application) => {
        setSelectedApplication(application);
        setRejectionModalOpen(true);
    };

    const handleSendMessage = (applicant) => {
        setMessageApplicant(applicant);
    };

    const handleSendEmail = (application) => {
        const subject = `Regarding your application for ${job.title}`;
        const body = `Dear ${application.applicantName},\n\nThank you for your interest in the ${job.title} position at our company.\n\nWe have reviewed your application and would like to discuss it further.\n\nBest regards,\n[Your Name]`;
        
        const mailtoLink = `mailto:${application.applicantEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        // Open the default email client
        window.location.href = mailtoLink;
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: FaClock, label: t('JobsUpdate.JobApplicationsModal.status.pending', 'Pending') },
            interview: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', icon: FaUsers, label: t('JobsUpdate.JobApplicationsModal.status.interview', 'Interview') },
            accepted: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: FaCheckCircle, label: t('JobsUpdate.JobApplicationsModal.status.accepted', 'Accepted') },
            rejected: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: FaTimesCircle, label: t('JobsUpdate.JobApplicationsModal.status.rejected', 'Rejected') },
        };

        const config = statusConfig[status] || statusConfig.pending;
        const IconComponent = config.icon;

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${config.bg} ${config.text} ${config.border}`}>
                <IconComponent className="w-2.5 h-2.5 mr-1" />
                {config.label}
            </span>
        );
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const toggleApplicationExpansion = (applicationId) => {
        setExpandedApplication(expandedApplication === applicationId ? null : applicationId);
    };

    // Sanitize and render HTML content safely
    const renderSafeHTML = (htmlContent) => {
        if (!htmlContent) return t('JobsUpdate.JobApplicationsModal.coverLetter.none', 'No cover letter provided');

        // Configure DOMPurify to allow safe HTML tags for rich text
        const cleanHTML = DOMPurify.sanitize(htmlContent, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
            ALLOWED_ATTR: [],
            KEEP_CONTENT: true,
            RETURN_DOM_FRAGMENT: false,
        });

        return { __html: cleanHTML };
    };

    if (!isOpen) return null;

    return (
    <>
            <div
                className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.1) 0%, rgba(30, 41, 59, 0.2) 100%)' }}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        onClose();
                    }
                }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden border border-slate-200"
                    onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">{t('JobsUpdate.JobApplicationsModal.header.title', 'Applications for')} {job?.title}</h2>
                            <p className="text-slate-600 text-sm mt-0.5">{applications?.length || 0} {t('JobsUpdate.JobApplicationsModal.header.totalApplications', 'total applications')}</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-md transition-colors">
                            <FaTimes className="w-4 h-4 text-slate-500" />
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="p-4 border-b border-slate-200">
                        <div className="flex flex-col sm:flex-row gap-3">
                            {/* Search */}
                            <div className="flex-1">
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                                    <input
                                        type="text"
                                        placeholder={t('JobsUpdate.JobApplicationsModal.search.placeholder', 'Search by name, email, or skills...')}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 placeholder-slate-400"
                                    />
                                </div>
                            </div>

                            {/* Status Filter */}
                            <div className="sm:w-40">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white">
                                    <option value="all">{t('JobsUpdate.JobApplicationsModal.filters.allStatus', 'All Status')}</option>
                                    <option value="pending">{t('JobsUpdate.JobApplicationsModal.filters.pending', 'Pending')}</option>
                                    <option value="interview">{t('JobsUpdate.JobApplicationsModal.filters.interview', 'Interview')}</option>
                                    <option value="accepted">{t('JobsUpdate.JobApplicationsModal.filters.accepted', 'Accepted')}</option>
                                    <option value="rejected">{t('JobsUpdate.JobApplicationsModal.filters.rejected', 'Rejected')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Applications List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {filteredApplications.length === 0 ? (
                            <div className="text-center py-8">
                                <FaUsers className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                                <h3 className="text-base font-medium text-slate-900 mb-2">{t('JobsUpdate.JobApplicationsModal.emptyState.title', 'No applications found')}</h3>
                                <p className="text-slate-600 text-sm">
                                    {applications?.length === 0 
                                        ? t('JobsUpdate.JobApplicationsModal.emptyState.noApplications', 'No one has applied to this job yet.') 
                                        : t('JobsUpdate.JobApplicationsModal.emptyState.noResults', 'No applications match your current filters.')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredApplications.map((application) => (
                                    <motion.div
                                        key={application.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-white rounded-lg p-4 border border-slate-200 hover:border-slate-300 transition-all duration-200">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <FaUser className="w-3.5 h-3.5 text-slate-600" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="text-sm font-medium text-slate-900 truncate">{application.applicantName}</h3>
                                                        <p className="text-xs text-slate-600 truncate">{application.applicantEmail}</p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-3 ml-11">
                                                    <div className="flex items-center gap-1">
                                                        <FaCalendar className="w-3 h-3" />
                                                        <span>Applied {formatDate(application.appliedDate)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <FaUser className="w-3 h-3" />
                                                        <span>{application.experience} {t('JobsUpdate.JobApplicationsModal.applicantInfo.experience', 'experience')}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <FaFileAlt className="w-3 h-3" />
                                                        <span>{t('JobsUpdate.JobApplicationsModal.applicantInfo.resumeAttached', 'Resume attached')}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5 mb-3 ml-11">
                                                    {application.skills?.slice(0, 4).map((skill, index) => (
                                                        <span key={index} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {application.skills?.length > 4 && (
                                                        <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-xs">+{application.skills.length - 4} {t('JobsUpdate.JobApplicationsModal.applicantInfo.more', 'more')}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                                                {/* Status Badge */}
                                                {getStatusBadge(application.status)}

                                                {/* Send Message Button */}
                                                <button
                                                    onClick={() => handleSendMessage(application)}
                                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                                                    title="Send Message">
                                                    <FaCommentAlt className="w-3 h-3" />
                                                    {t('JobsUpdate.JobApplicationsModal.buttons.message', 'Message')}
                                                </button>

                                                {/* Status Update Buttons */}
                                                {application.status === 'pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStatusUpdate(application.id, 'interview')}
                                                            disabled={updatingStatus === application.id}
                                                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50">
                                                            {t('JobsUpdate.JobApplicationsModal.buttons.interview', 'Interview')}
                                                        </button>
                                                        <button
                                                            onClick={() => openRejectionModal(application)}
                                                            disabled={updatingStatus === application.id}
                                                            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50">
                                                            Reject
                                                        </button>
                                                    </>
                                                )}

                                                {application.status === 'interview' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStatusUpdate(application.id, 'accepted')}
                                                            disabled={updatingStatus === application.id}
                                                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50">
                                                            {t('JobsUpdate.JobApplicationsModal.buttons.accept', 'Accept')}
                                                        </button>
                                                        <button
                                                            onClick={() => openRejectionModal(application)}
                                                            disabled={updatingStatus === application.id}
                                                            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50">
                                                            Reject
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    onClick={() => toggleApplicationExpansion(application.id)}
                                                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-50">
                                                    {expandedApplication === application.id ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Application Details */}
                                        {expandedApplication === application.id && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 pt-3 border-t border-slate-200">
                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                    <div className="lg:col-span-2">
                                                        <h4 className="text-sm font-medium text-slate-900 mb-2">Cover Letter</h4>
                                                        <div
                                                            className="text-slate-600 text-xs leading-relaxed mb-3 p-3 bg-slate-50 rounded-md border border-slate-200 max-h-40 overflow-y-auto rich-text-content"
                                                            style={{
                                                                fontSize: '12px',
                                                                lineHeight: '1.5',
                                                            }}
                                                            dangerouslySetInnerHTML={renderSafeHTML(application.coverLetter)}
                                                        />

                                                        <h4 className="text-sm font-medium text-slate-900 mb-2 mt-4">Additional Information</h4>
                                                        <div className="space-y-2 text-xs">
                                                            <div className="flex items-center justify-between py-1">
                                                                <span className="text-slate-500">Experience:</span>
                                                                <span className="text-slate-900 font-medium">{application.experience || 'Not specified'}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between py-1">
                                                                <span className="text-slate-500">Applied:</span>
                                                                <span className="text-slate-900 font-medium">{formatDate(application.appliedDate)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between py-1">
                                                                <span className="text-slate-500">Resume:</span>
                                                                <span className="text-slate-900 font-medium">{application.resume ? 'Attached' : 'Not provided'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <button className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200">
                                                            <FaDownload className="w-3 h-3" />
                                                            {t('JobsUpdate.JobApplicationsModal.buttons.downloadResume', 'Download Resume')}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleSendEmail(application)}
                                                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200">
                                                            <FaEnvelope className="w-3 h-3" />
                                                            {t('JobsUpdate.JobApplicationsModal.buttons.sendEmail', 'Send Email')}
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                let resumeUrl = application.resumeUrl || application.selectedResume?.shareableLink;
                                                                if (resumeUrl) {
                                                                    // Correct the URL if it uses the old pattern
                                                                    if (resumeUrl.includes('/resume/')) {
                                                                        resumeUrl = resumeUrl.replace('/resume/', '/shared/');
                                                                    }
                                                                    window.open(resumeUrl, '_blank');
                                                                } else {
                                                                    alert('Resume link not available');
                                                                }
                                                            }}
                                                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200">
                                                            <FaEye className="w-3 h-3" />
                                                            {t('JobsUpdate.JobApplicationsModal.buttons.showResume', 'Show Resume')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
</motion.div>
            </div>
            {messageApplicant && (
                <SendMessageDialog 
                    isOpen={!!messageApplicant}
                    onClose={() => setMessageApplicant(null)}
                    applicantId={messageApplicant.userId}
                    applicantName={messageApplicant.applicantName}
                    showToast={showToast}
                />
            )}

            <RejectionReasonModal
                isOpen={isRejectionModalOpen}
                onClose={() => setRejectionModalOpen(false)}
                onSubmit={(message) => handleStatusUpdate(selectedApplication.id, 'rejected', message)}
                applicationData={selectedApplication}
                loading={updatingStatus === selectedApplication?.id}
            />
        </>
    );
};

export default withTranslation('common')(JobApplicationsModal);
