import { sanitizeUrl } from '../../utils/sanitizeHtml';
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
    FaBookmark,
    FaStar,
    FaStarHalfAlt,
    FaRegStar,
    FaExpand,
    FaCompress,
    FaBolt,
    FaLaptop,
    FaMedkit,
    FaPlane,
    FaHome,
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
    currency = 'INR',
    currencySymbol = '₹',
}) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [isExpanded, setIsExpanded] = useState(false);
    const [_expandedSections, setExpandedSections] = useState({
        responsibilities: true,
        requirements: true,
        benefits: false,
        company: false,
        team: false,
    });

    const activeSaved = isSaved ?? _isSaved ?? false;
    const activeToggleSaved = onToggleSaved || _onToggleSaved;

    // Prevent background scrolling when modal is open without body manipulation
    useEffect(() => {
        if (isOpen) {
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.documentElement.style.overflow = 'unset';
        }

        return () => {
            document.documentElement.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Use real job data with fallback values
    const enhancedJob = {
        ...job,
        urgency: 'medium',
        applicationDeadline: job?.deadline ? new Date(job.deadline).toISOString().split('T')[0] : null,
        viewsLast24h: job?.viewsCount || 42,
        applicationsCount: job?.applicationsCount || job?.applicants || 18,
        companyRating: 4.8,
        companyReviews: 142,
        salaryRange: {
            min: job?.minSalary || 0,
            max: job?.maxSalary || 0,
            currency: job?.salary_currency || job?.currency || currency || 'INR',
        },
        benefits:
            job?.benefits && job.benefits.length > 0
                ? job.benefits.map((benefit) => ({
                      icon: FaMedkit,
                      title: benefit,
                      desc: benefit,
                  }))
                : [
                      {
                          icon: FaMedkit,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.healthInsurance.title', 'Comprehensive Healthcare'),
                          desc: t('JobsUpdate.JobDetailsModal.defaultBenefits.healthInsurance.description', 'Medical, dental, and vision coverage included'),
                      },
                      {
                          icon: FaPlane,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.timeOff.title', 'Generous Paid Time Off'),
                          desc: t('JobsUpdate.JobDetailsModal.defaultBenefits.timeOff.description', 'Flexible vacation policy and paid holidays'),
                      },
                      {
                          icon: FaLaptop,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.equipment.title', 'Hardware & Tech Stipend'),
                          desc: t('JobsUpdate.JobDetailsModal.defaultBenefits.equipment.description', 'Latest laptop and home office setup provided'),
                      },
                      {
                          icon: FaHome,
                          title: t('JobsUpdate.JobDetailsModal.defaultBenefits.workMode.title', 'Flexible Work Setup'),
                          desc: job?.workMode || t('JobsUpdate.JobDetailsModal.defaultBenefits.workMode.description', 'Flexible remote or hybrid arrangement'),
                      },
                  ],
        companyStats: {
            founded: '2019',
            employees: job?.companySize || '50 - 250 employees',
            industry: job?.companyIndustry || 'Technology & Software',
            locations: [job?.location || t('JobsUpdate.JobDetailsModal.companyStats.locationTBD', 'Global / Remote')],
        },
    };

    const toggleSection = (section) => {
        setExpandedSections((prev) => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    const renderStars = (rating) => {
        const stars = [];
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 !== 0;

        for (let i = 0; i < fullStars; i++) {
            stars.push(<FaStar key={i} className="text-amber-400" />);
        }

        if (hasHalfStar) {
            stars.push(<FaStarHalfAlt key="half" className="text-amber-400" />);
        }

        const emptyStars = 5 - Math.ceil(rating);
        for (let i = 0; i < emptyStars; i++) {
            stars.push(<FaRegStar key={`empty-${i}`} className="text-slate-300" />);
        }

        return stars;
    };

    const tabs = [
        { id: 'overview', label: t('JobsUpdate.JobDetailsModal.tabs.overview', 'Overview'), icon: FaBriefcase },
        { id: 'company', label: t('JobsUpdate.JobDetailsModal.tabs.company', 'Company'), icon: FaBuilding },
    ];

    const companyMonogram = job?.company
        ? job.company
              .split(' ')
              .map((w) => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
        : 'CO';

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
                        className={`fixed top-0 right-0 h-screen bg-white shadow-2xl z-[10002] overflow-hidden border-l border-slate-200 flex flex-col ${
                            isExpanded ? 'w-full' : 'w-full lg:w-[620px] xl:w-[680px]'
                        }`}>
                        {/* Drawer Header */}
                        <div className="bg-white border-b border-slate-100 flex-shrink-0">
                            {/* Top Control Bar */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                        {job.type || 'Full-time'}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {enhancedJob.viewsLast24h} views • {enhancedJob.applicationsCount} applicants
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                        title={isExpanded ? 'Collapse' : 'Expand'}>
                                        {isExpanded ? <FaCompress className="w-3.5 h-3.5" /> : <FaExpand className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                        title="Close">
                                        <FaTimes className="w-4 h-4" />
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
                                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mb-1">
                                            {enhancedJob.title}
                                        </h1>
                                        <div className="flex items-center gap-3 text-sm text-slate-600 flex-wrap font-medium">
                                            <span className="flex items-center gap-1.5 font-bold text-slate-800">
                                                <FaBuilding className="w-3.5 h-3.5 text-slate-400" />
                                                {enhancedJob.company}
                                            </span>
                                            <span className="flex items-center gap-1 text-slate-500">
                                                <FaMapMarkerAlt className="w-3 h-3 text-slate-400" />
                                                {enhancedJob.location}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Highlight Pills */}
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    {enhancedJob.salary ? (
                                        <span className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 shadow-2xs">
                                            💰 {enhancedJob.salary}
                                        </span>
                                    ) : (
                                        <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">
                                            💰 Competitive
                                        </span>
                                    )}

                                    {enhancedJob.workMode && (
                                        <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200">
                                            💻 {enhancedJob.workMode}
                                        </span>
                                    )}

                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200">
                                        <FaBolt className="w-3 h-3 text-indigo-500" />
                                        Fast-Track Application
                                    </span>
                                </div>
                            </div>

                            {/* Navigation Tabs */}
                            <div className="px-6 flex space-x-2 border-t border-slate-100">
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
                                                isActive
                                                    ? 'border-blue-600 text-blue-600'
                                                    : 'border-transparent text-slate-500 hover:text-slate-900'
                                            }`}>
                                            <Icon className="w-3.5 h-3.5" />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Drawer Body Scroll Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {activeTab === 'overview' && (
                                <>
                                    {/* Job Description */}
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">
                                            {t('JobsUpdate.JobDetailsModal.jobDescription', 'Job Overview')}
                                        </h3>
                                        <div className="text-sm text-slate-600 leading-relaxed space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                                            {enhancedJob.description || (
                                                <p>Join {enhancedJob.company} as a {enhancedJob.title}. We are seeking a talented professional to drive forward key initiatives and collaborate with high-performing teams worldwide.</p>
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
                                                        <FaCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                        <span>{req}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-slate-500 italic">
                                                    Requirements will be detailed during initial interview review.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Benefits List */}
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">
                                            Perks & Benefits
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {enhancedJob.benefits.map((benefit, idx) => {
                                                const Icon = benefit.icon;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="p-3.5 rounded-xl border border-slate-200/80 bg-white flex items-start gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                                                            <Icon className="w-4 h-4" />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-slate-900">{benefit.title}</div>
                                                            <div className="text-xs text-slate-500 mt-0.5 leading-snug">{benefit.desc}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'company' && (
                                <div className="space-y-6">
                                    <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/80">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-base flex items-center justify-center shadow-sm">
                                                {companyMonogram}
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-bold text-slate-900">{enhancedJob.company}</h4>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                    <div className="flex items-center gap-0.5">
                                                        {renderStars(enhancedJob.companyRating)}
                                                    </div>
                                                    <span className="font-bold text-slate-700">{enhancedJob.companyRating}</span>
                                                    <span>({enhancedJob.companyReviews} reviews)</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="p-3 bg-white rounded-xl border border-slate-200/60">
                                                <div className="text-slate-400 font-semibold uppercase">Industry</div>
                                                <div className="font-bold text-slate-800 mt-0.5">{enhancedJob.companyStats.industry}</div>
                                            </div>
                                            <div className="p-3 bg-white rounded-xl border border-slate-200/60">
                                                <div className="text-slate-400 font-semibold uppercase">Size</div>
                                                <div className="font-bold text-slate-800 mt-0.5">{enhancedJob.companyStats.employees}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5">
                                            About the Employer
                                        </h3>
                                        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                                            {enhancedJob.company} is dedicated to building state-of-the-art products and nurturing talented teams. Qualified candidates will receive complete onboarding materials, culture briefs, and growth roadmaps.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Drawer Footer Actions */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => onApplyNow && onApplyNow(job)}
                                className="flex-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold py-3 px-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm active:scale-98">
                                <FaBriefcase className="w-4 h-4" />
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
