import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import {
    FaTimes,
    FaBriefcase,
    FaMapMarkerAlt,
    FaClock,
    FaDollarSign,
    FaUser,
    FaBuilding,
    FaGraduationCap,
    FaCalendarAlt,
    FaBookmark,
    FaShare,
    FaFlag,
    FaExternalLinkAlt,
    FaStar,
    FaStarHalfAlt,
    FaRegStar,
    FaLinkedin,
    FaTwitter,
    FaFacebook,
    FaEnvelope,
    FaPhone,
    FaExclamationTriangle,
    FaChevronUp,
    FaExpand,
    FaCompress,
    FaDownload,
    FaPrint,
    FaHeart,
    FaGift,
    FaThumbsUp,
    FaThumbsDown,
    FaComment,
    FaBolt,
    FaChartLine,
    FaShieldAlt,
    FaGlobe,
    FaLaptop,
    FaCoffee,
    FaMedkit,
    FaPlane,
    FaHome,
    FaCar,
    FaUtensils,
    FaDumbbell,
    FaChild,
} from 'react-icons/fa';

const JobDetailsModal = ({ job, isOpen, onClose, isSaved, onToggleSaved, onApplyNow, t }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [isExpanded, setIsExpanded] = useState(false);
    const [applicationStep, setApplicationStep] = useState(0);

    // Prevent background scrolling when modal is open without body manipulation
    useEffect(() => {
        if (isOpen) {
            // Add class to html element to prevent scrolling without layout shift
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.documentElement.style.overflow = 'unset';
        }

        // Cleanup on unmount
        return () => {
            document.documentElement.style.overflow = 'unset';
        };
    }, [isOpen]);
    const [expandedSections, setExpandedSections] = useState({
        responsibilities: true,
        requirements: true,
        benefits: false,
        company: false,
        team: false,
    });

    // Use real job data with some fallback values for UI enhancement
    const enhancedJob = {
        ...job,
        // Use real data from database or provide sensible defaults
        matchScore: 94, // This could be calculated based on user profile in the future
        urgency: 'medium', // Could be determined by deadline or other factors
        applicationDeadline: job?.deadline ? new Date(job.deadline).toISOString().split('T')[0] : null,
        viewsLast24h: job?.viewsCount || 0,
        applicationsCount: job?.applicationsCount || 0,
        companyRating: 4.2, // This would come from company data in the future
        companyReviews: 1247, // This would come from company data in the future
        salaryRange: {
            min: job?.minSalary || 0,
            max: job?.maxSalary || 0,
            currency: 'USD',
            equity: null, // This would come from job data if available
            bonus: null, // This would come from job data if available
        },
        // Use real benefits from job data or provide defaults
        benefits:
            job?.benefits && job.benefits.length > 0
                ? job.benefits.map((benefit) => ({
                      icon: FaMedkit, // Default icon, could be mapped based on benefit type
                      title: benefit,
                      desc: benefit,
                  }))
                : [
                      {
                          icon: FaMedkit,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.healthInsurance.title', 'Health Insurance'),
                          desc: t('JobsUpdate.JobDetailsModal.defaultBenefits.healthInsurance.description', 'Medical coverage details to be discussed'),
                      },
                      {
                          icon: FaPlane,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.timeOff.title', 'Time Off'),
                          desc: t('JobsUpdate.JobDetailsModal.defaultBenefits.timeOff.description', 'Vacation and personal time'),
                      },
                      {
                          icon: FaLaptop,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.equipment.title', 'Equipment'),
                          desc: t('JobsUpdate.JobDetailsModal.defaultBenefits.equipment.description', 'Work equipment provided'),
                      },
                      {
                          icon: FaHome,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.workMode.title', 'Work Mode'),
                          desc: job?.workMode || t('JobsUpdate.JobDetailsModal.defaultBenefits.workMode.description', 'To be discussed'),
                      },
                  ],
        // These would come from company data in a real implementation
        team: [],
        companyStats: {
            founded: null,
            employees: job?.companySize || null,
            funding: null,
            industry: job?.companyIndustry || null,
            locations: [job?.location || t('JobsUpdate.JobDetailsModal.companyStats.locationTBD', 'Location TBD')],
            website: job?.companyWebsite || null,
            description: job?.companyDescription || null,
        },
        applicationProcess: [
            { step: t('JobsUpdate.JobDetailsModal.applicationProcess.applicationReview', 'Application Review'), duration: t('JobsUpdate.JobDetailsModal.applicationProcess.duration.days2to3', '2-3 days'), status: t('JobsUpdate.JobDetailsModal.applicationProcess.status.pending', 'pending') },
            { step: t('JobsUpdate.JobDetailsModal.applicationProcess.initialInterview', 'Initial Interview'), duration: t('JobsUpdate.JobDetailsModal.applicationProcess.duration.mins30to45', '30-45 mins'), status: t('JobsUpdate.JobDetailsModal.applicationProcess.status.upcoming', 'upcoming') },
            { step: t('JobsUpdate.JobDetailsModal.applicationProcess.technicalAssessment', 'Technical Assessment'), duration: t('JobsUpdate.JobDetailsModal.applicationProcess.duration.hours1to2', '1-2 hours'), status: t('JobsUpdate.JobDetailsModal.applicationProcess.status.upcoming', 'upcoming') },
            { step: t('JobsUpdate.JobDetailsModal.applicationProcess.finalInterview', 'Final Interview'), duration: t('JobsUpdate.JobDetailsModal.applicationProcess.duration.mins45to60', '45-60 mins'), status: t('JobsUpdate.JobDetailsModal.applicationProcess.status.upcoming', 'upcoming') },
        ],
        // This would be calculated based on user skills vs job requirements
        skillsMatch:
            job?.requirements && job.requirements.length > 0
                ? job.requirements.map((skill) => ({
                      skill: skill,
                      match: Math.floor(Math.random() * 40) + 60, // Random for demo, would be calculated
                      required: true,
                  }))
                : [],
        similarJobs: [], // This would be populated with actual similar jobs
    };

    const toggleSection = (section) => {
        setExpandedSections((prev) => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    const renderStarRating = (rating) => {
        const stars = [];
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 !== 0;

        for (let i = 0; i < fullStars; i++) {
            stars.push(<FaStar key={i} className="text-yellow-400" />);
        }

        if (hasHalfStar) {
            stars.push(<FaStarHalfAlt key="half" className="text-yellow-400" />);
        }

        const emptyStars = 5 - Math.ceil(rating);
        for (let i = 0; i < emptyStars; i++) {
            stars.push(<FaRegStar key={`empty-${i}`} className="text-gray-300" />);
        }

        return stars;
    };

    const tabs = [
        { id: 'overview', label: t('JobsUpdate.JobDetailsModal.tabs.overview', 'Overview'), icon: FaBriefcase },
        { id: 'company', label: t('JobsUpdate.JobDetailsModal.tabs.company', 'Company'), icon: FaBuilding },
    ];

    return (
        <AnimatePresence>
            {isOpen && job && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10001]"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{
                            type: 'tween',
                            ease: [0.25, 0.46, 0.45, 0.94],
                            duration: 0.4,
                        }}
                        className={`fixed top-0 right-0 h-screen bg-white shadow-xl z-[10002] overflow-hidden border-l border-gray-200 ${isExpanded ? 'w-full' : 'w-full lg:w-3/5 xl:w-1/2'}`}>
                        <div className="h-full flex flex-col">
                            {/* Header */}
                            <div className="bg-white border-b border-gray-200">
                                {/* Top Bar */}
                                <div className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`w-2 h-2 rounded-full ${
                                                    enhancedJob.urgency === 'high' ? 'bg-amber-500' : enhancedJob.urgency === 'medium' ? 'bg-blue-500' : 'bg-emerald-500'
                                                }`}></div>
                                            <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{t('JobsUpdate.JobDetailsModal.urgencyPriority', 'Priority')}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {enhancedJob.viewsLast24h} {t('JobsUpdate.JobDetailsModal.stats.viewsToday', 'views today')} • {enhancedJob.applicationsCount} {t('JobsUpdate.JobDetailsModal.stats.applications', 'applications')}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsExpanded(!isExpanded)}
                                            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all"
                                            title={isExpanded ? t('JobsUpdate.JobDetailsModal.actions.collapse', 'Collapse') : t('JobsUpdate.JobDetailsModal.actions.expand', 'Expand')}>
                                            {isExpanded ? <FaCompress className="w-4 h-4" /> : <FaExpand className="w-4 h-4" />}
                                        </button>
                                        <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all">
                                            <FaTimes className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Job Header */}
                                <div className="px-6 pb-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-lg">{enhancedJob.company.charAt(0)}</div>
                                        <div className="flex-1">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h1 className="text-2xl font-bold text-slate-900 mb-1">{enhancedJob.title}</h1>
                                                    <div className="flex items-center gap-4 text-sm text-slate-600">
                                                        <span className="flex items-center gap-1">
                                                            <FaBuilding className="w-3 h-3" />
                                                            {enhancedJob.company}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <FaMapMarkerAlt className="w-3 h-3" />
                                                            {enhancedJob.location}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <FaClock className="w-3 h-3" />
                                                            {enhancedJob.type}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                                <span className="px-4 py-2 bg-amber-50 text-amber-700 text-sm font-medium rounded-full flex items-center gap-1 border border-amber-200">
                                                    <FaDollarSign className="w-3 h-3" />${enhancedJob.salaryRange.min / 1000}k - ${enhancedJob.salaryRange.max / 1000}k
                                                </span>
                                                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200">{enhancedJob.workMode}</span>
                                                <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                                                    <FaBolt className="w-3 h-3" />
                                                    {t('JobsUpdate.JobDetailsModal.fastTrack', 'Fast-track')}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="text-xs text-slate-500">{t('JobsUpdate.JobDetailsModal.deadline', 'Deadline')}: {new Date(enhancedJob.applicationDeadline).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="px-6">
                                    <div className="flex space-x-1">
                                        {tabs.map((tab) => {
                                            const Icon = tab.icon;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveTab(tab.id)}
                                                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-all ${
                                                        activeTab === tab.id ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                                    }`}>
                                                    <Icon className="w-4 h-4" />
                                                    {tab.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-y-auto bg-white">
                                <div className="p-6">
                                    {activeTab === 'overview' && (
                                        <div className="space-y-5">
                                            {/* Job Description */}
                                            <div>
                                                <h3 className="text-base font-semibold text-slate-900 mb-2">{t('JobsUpdate.JobDetailsModal.jobDescription', 'Job Description')}</h3>
                                                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                                                    {enhancedJob.description || t('JobsUpdate.JobDetailsModal.jobDescription.default', 'Join {{company}} as a {{title}}. We are looking for a talented professional to join our team.', {company: enhancedJob.company, title: enhancedJob.title})}
                                                </p>
                                            </div>

                                            {/* Qualifications */}
                                            <div>
                                                <h3 className="text-base font-semibold text-slate-900 mb-2">{t('JobsUpdate.JobDetailsModal.qualifications', 'Requirements')}</h3>
                                                <ul className="space-y-1.5">
                                                    {enhancedJob.requirements && enhancedJob.requirements.length > 0 ? (
                                                        enhancedJob.requirements.map((requirement, index) => (
                                                            <li key={index} className="text-sm text-slate-600 leading-relaxed flex items-start">
                                                                <span className="w-1 h-1 bg-slate-400 rounded-full mt-2.5 mr-3 flex-shrink-0"></span>
                                                                {requirement}
                                                            </li>
                                                        ))
                                                    ) : (
                                                        <li className="text-sm text-slate-600 leading-relaxed flex items-start">
                                                            <span className="w-1 h-1 bg-slate-400 rounded-full mt-2.5 mr-3 flex-shrink-0"></span>
                                                            {t('JobsUpdate.JobDetailsModal.qualifications.default', 'Requirements will be discussed during the interview process.')}
                                                        </li>
                                                    )}
                                                </ul>
                                            </div>

                                            {/* Job Details */}
                                            <div>
                                                <h3 className="text-base font-semibold text-slate-900 mb-2">{t('JobsUpdate.JobDetailsModal.jobDetails.title', 'Job Details')}</h3>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-slate-500">{t('JobsUpdate.JobDetailsModal.jobDetails.jobType', 'Job Type')}:</span>
                                                        <span className="ml-2 text-slate-900 font-medium">{enhancedJob.jobType || enhancedJob.type || t('JobsUpdate.JobDetailsModal.jobDetails.notSpecified', 'Not specified')}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">{t('JobsUpdate.JobDetailsModal.jobDetails.workMode', 'Work Mode')}:</span>
                                                        <span className="ml-2 text-slate-900 font-medium">{enhancedJob.workMode || t('JobsUpdate.JobDetailsModal.jobDetails.notSpecified', 'Not specified')}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">{t('JobsUpdate.JobDetailsModal.jobDetails.experienceLevel', 'Experience Level')}:</span>
                                                        <span className="ml-2 text-slate-900 font-medium">{enhancedJob.experienceLevel || t('JobsUpdate.JobDetailsModal.jobDetails.notSpecified', 'Not specified')}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">{t('JobsUpdate.JobDetailsModal.jobDetails.location', 'Location')}:</span>
                                                        <span className="ml-2 text-slate-900 font-medium">
                                                            {enhancedJob.location && enhancedJob.country
                                                                ? `${enhancedJob.location}, ${enhancedJob.country}`
                                                                : enhancedJob.location || enhancedJob.country || t('JobsUpdate.JobDetailsModal.jobDetails.notSpecified', 'Not specified')}
                                                        </span>
                                                    </div>
                                                    {enhancedJob.salaryRange && (enhancedJob.salaryRange.min > 0 || enhancedJob.salaryRange.max > 0) && (
                                                        <div className="col-span-2">
                                                            <span className="text-slate-500">{t('JobsUpdate.JobDetailsModal.jobDetails.salaryRange', 'Salary Range')}:</span>
                                                            <span className="ml-2 text-slate-900 font-medium">
                                                                {enhancedJob.salaryRange.min > 0 && enhancedJob.salaryRange.max > 0
                                                                    ? `$${enhancedJob.salaryRange.min.toLocaleString()} - $${enhancedJob.salaryRange.max.toLocaleString()}`
                                                                    : enhancedJob.salary || t('JobsUpdate.JobDetailsModal.jobDetails.competitive', 'Competitive')}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {enhancedJob.applicationDeadline && (
                                                        <div className="col-span-2">
                                                            <span className="text-slate-500">{t('JobsUpdate.JobDetailsModal.jobDetails.applicationDeadline', 'Application Deadline')}:</span>
                                                            <span className="ml-2 text-slate-900 font-medium">{new Date(enhancedJob.applicationDeadline).toLocaleDateString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'company' && (
                                        <div className="space-y-5">
                                            {/* Company Header */}
                                            <div>
                                                <div className="flex items-start gap-3 mb-4">
                                                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center text-white text-lg font-bold">
                                                        {enhancedJob.company.charAt(0)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h2 className="text-lg font-bold text-slate-900 mb-1">{enhancedJob.company}</h2>
                                                        <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                                                            {enhancedJob.companyStats.industry && <span>{enhancedJob.companyStats.industry}</span>}
                                                            {enhancedJob.companyStats.industry && enhancedJob.companyStats.employees && <span>•</span>}
                                                            {enhancedJob.companyStats.employees && <span>{enhancedJob.companyStats.employees}</span>}
                                                            {enhancedJob.companyStats.website && (
                                                                <>
                                                                    {(enhancedJob.companyStats.industry || enhancedJob.companyStats.employees) && <span>•</span>}
                                                                    <a
                                                                        href={enhancedJob.companyStats.website}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-600 hover:text-blue-800 hover:underline">
                                                                        {t('JobsUpdate.JobDetailsModal.company.website', 'Website')}
                                                                    </a>
                                                                </>
                                                            )}
                                                            {!enhancedJob.companyStats.industry && !enhancedJob.companyStats.employees && !enhancedJob.companyStats.website && (
                                                                <span>{t('JobsUpdate.JobDetailsModal.company.notSpecified', 'Company information will be provided during the interview process')}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* About Company */}
                                            <div>
                                                <h3 className="text-base font-semibold text-slate-900 mb-2">{t('JobsUpdate.JobDetailsModal.aboutCompany.title', 'About Company')}</h3>
                                                <p className="text-sm text-slate-600 leading-relaxed">
                                                    {enhancedJob.companyStats.description ||
                                                        t('JobsUpdate.JobDetailsModal.aboutCompany.defaultDescription', 'Learn more about {{company}} during the interview process. Company details and culture information will be shared with qualified candidates.', {company: enhancedJob.company})}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="border-t border-slate-200 p-4 bg-slate-50">
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => onApplyNow && onApplyNow(job)}
                                        className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                    >
                                        <FaBriefcase className="w-4 h-4" />
                                        {t('JobsUpdate.JobDetailsModal.actions.applyNow', 'Apply Now')}
                                    </button>

                                    <button className="px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 hover:border-slate-400 transition-colors duration-200 flex items-center gap-2 text-sm">
                                        <FaBookmark className="w-3 h-3" />
                                        {t('JobsUpdate.JobDetailsModal.actions.save', 'Save')}
                                    </button>

                   
                                    <button className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200 flex items-center gap-2 text-sm">
                                        <FaUser className="w-3 h-3" />
                                        {t('JobsUpdate.JobDetailsModal.actions.contact', 'Contact')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default withTranslation('common')(JobDetailsModal);
