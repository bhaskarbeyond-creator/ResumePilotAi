import React, { useState, useEffect, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FaBriefcase, FaSearch, FaCalendar, FaMapMarkerAlt, FaDollarSign, FaClock, FaCheckCircle, FaTimesCircle, FaHourglass, FaInfoCircle, FaBuilding, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { AuthContext } from '../../main';
import { getUserJobApplications } from '../../firestore/dbOperations';


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
                if (active) setAppliedJobs(applications);
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

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending':
                return <FaHourglass className="w-4 h-4" />;
            case 'interview':
                return <FaClock className="w-4 h-4" />;
            case 'accepted':
                return <FaCheckCircle className="w-4 h-4" />;
            case 'rejected':
                return <FaTimesCircle className="w-4 h-4" />;
            default:
                return <FaInfoCircle className="w-4 h-4" />;
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'pending':
                return 'Under Review';
            case 'interview':
                return 'Interview Scheduled';
            case 'accepted':
                return 'Offer Received';
            case 'rejected':
                return 'Not Selected';
            default:
                return 'Unknown';
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending':
                return 'text-orange-700 bg-orange-50 border-orange-200';
            case 'interview':
                return 'text-indigo-700 bg-indigo-50 border-indigo-200';
            case 'accepted':
                return 'text-teal-700 bg-teal-50 border-teal-200';
            case 'rejected':
                return 'text-stone-600 bg-stone-50 border-stone-200';
            default:
                return 'text-stone-600 bg-stone-50 border-stone-200';
        }
    };

    const formatDate = (date) => {
        if (!date) return 'Date not available';

        const converted = date?.toDate?.() || date;
        const dateObj = converted instanceof Date ? converted : new Date(converted);

        // Check if date is valid
        if (isNaN(dateObj.getTime())) {
            return 'Invalid date';
        }

        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const getStatusCount = (status) => {
        return appliedJobs.filter((job) => job.status === status).length;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                    <div className="flex items-center justify-center h-64" aria-busy="true">
                        <div className="text-center" role="status" aria-live="polite">
                            <div aria-hidden="true" className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-slate-600 mx-auto mb-3"></div>
                            <p className="text-slate-600 text-sm font-medium">{t('JobsUpdate.AppliedJobs.loading', 'Loading your applications...')}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Check if user is logged in
    if (!user?.uid) {
        return (
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                                <FaBriefcase className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.AppliedJobs.loginRequired.title', 'Please log in')}</h3>
                            <p className="text-slate-600 text-sm">{t('JobsUpdate.AppliedJobs.loginRequired.message', 'You need to be logged in to view your job applications.')}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
                <div className="max-w-md text-center" role="alert">
                    <FaInfoCircle aria-hidden="true" className="w-10 h-10 text-amber-600 mx-auto mb-3" />
                    <h1 className="text-lg font-semibold text-slate-900 mb-2">Applications unavailable</h1>
                    <p className="text-sm text-slate-600 mb-4">{loadError}</p>
                    <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
                        Try again
                    </button>
                </div>
            </main>
        );
    }

    const redirectToJobs = () => {
        navigate('/jobs');
    };
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                {/* Header Section */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <div className="p-2 bg-slate-100 rounded-lg">
                                <FaBriefcase className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight truncate">{t('JobsUpdate.AppliedJobs.title', 'Applied Jobs')}</h1>
                                <p className="text-slate-600 text-sm mt-0.5">{t('JobsUpdate.AppliedJobs.subtitle', 'Track your job applications and their current status')}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Statistics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.AppliedJobs.stats.totalApplied', 'Total Applied')}</p>
                                <p className="text-lg font-semibold text-slate-900 mt-1">{appliedJobs.length}</p>
                            </div>
                            <div className="p-2 bg-slate-100 rounded-md">
                                <FaBriefcase className="w-4 h-4 text-slate-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.AppliedJobs.stats.pending', 'Pending')}</p>
                                <p className="text-lg font-semibold text-slate-900 mt-1">{getStatusCount('pending')}</p>
                            </div>
                            <div className="p-2 bg-amber-50 rounded-md">
                                <FaHourglass className="w-4 h-4 text-amber-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.AppliedJobs.stats.interviews', 'Interviews')}</p>
                                <p className="text-lg font-semibold text-slate-900 mt-1">{getStatusCount('interview')}</p>
                            </div>
                            <div className="p-2 bg-blue-50 rounded-md">
                                <FaClock className="w-4 h-4 text-blue-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.AppliedJobs.stats.successRate', 'Success Rate')}</p>
                                <p className="text-lg font-semibold text-slate-900 mt-1">{appliedJobs.length > 0 ? Math.round((getStatusCount('accepted') / appliedJobs.length) * 100) : 0}%</p>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded-md">
                                <FaCheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search and Filter Section */}
                <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm mb-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="flex-1">
                            <label htmlFor="application-search" className="sr-only">Search applications</label>
                            <div className="relative">
                                <FaSearch aria-hidden="true" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                                <input
                                    id="application-search"
                                    type="search"
                                    placeholder={t('JobsUpdate.AppliedJobs.search.placeholder', 'Search jobs, companies, or locations...')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 placeholder-slate-400"
                                />
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="sm:w-40">
                            <label htmlFor="application-status-filter" className="sr-only">Filter by status</label>
                            <select
                                id="application-status-filter"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white">
                                <option value="all">{t('JobsUpdate.AppliedJobs.filters.allStatus', 'All Status')}</option>
                                <option value="pending">{t('JobsUpdate.AppliedJobs.filters.underReview', 'Under Review')}</option>
                                <option value="interview">{t('JobsUpdate.AppliedJobs.filters.interview', 'Interview')}</option>
                                <option value="accepted">{t('JobsUpdate.AppliedJobs.filters.accepted', 'Accepted')}</option>
                                <option value="rejected">{t('JobsUpdate.AppliedJobs.filters.rejected', 'Rejected')}</option>
                            </select>
                        </div>

                        {/* Sort */}
                        <div className="sm:w-40">
                            <label htmlFor="application-sort" className="sr-only">Sort applications</label>
                            <select
                                id="application-sort"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white">
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
                        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center shadow-sm">
                            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                                <FaBriefcase className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.AppliedJobs.noApplications.title', 'No applications found')}</h3>
                            <p className="text-slate-600 text-sm mb-4">
                                {searchTerm || statusFilter !== 'all' ? t('JobsUpdate.AppliedJobs.noApplications.filterMessage', 'Try adjusting your search or filter criteria.') : t('JobsUpdate.AppliedJobs.noApplications.emptyMessage', "You haven't applied to any jobs yet. Start exploring opportunities!")}
                            </p>
                            {!searchTerm && statusFilter === 'all' && (
                                <button onClick={redirectToJobs} className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors duration-200 text-sm font-medium">{t('JobsUpdate.AppliedJobs.actions.browseJobs', 'Browse Jobs')}</button>
                            )}
                        </div>
                    ) : (
                        filteredJobs.map((job) => (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-slate-300 transition-all duration-200">
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-sm font-semibold text-slate-900 truncate">{job.jobTitle}</h3>
                                                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-medium ${getStatusColor(job.status)}`}>
                                                    {getStatusIcon(job.status)}
                                                    {getStatusText(job.status)}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-3">
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
                                                    <FaInfoCircle className="w-3 h-3 text-slate-500" />
                                                    <span className="font-medium text-slate-900">{t('JobsUpdate.AppliedJobs.jobInfo.status', 'Status')}:</span>
                                                    <span className="text-slate-500">{getStatusText(job.status)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleViewDetails(job)}
                                                aria-expanded={expandedJobId === job.id}
                                                aria-controls={`application-details-${job.id}`}
                                                aria-label={`${expandedJobId === job.id ? 'Hide' : 'Show'} details for ${job.jobTitle || 'application'}`}
                                                className="p-2 text-slate-500 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 transition-colors rounded-md hover:bg-slate-50">
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
                                                className="mt-3 pt-3 border-t border-slate-200">
                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                    <div className="lg:col-span-2">
                                                        <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.jobDescription', 'Job Description')}</h4>
                                                        <p className="text-slate-600 text-xs leading-relaxed mb-3 line-clamp-3">
                                                            {job.description || `Join ${job.company} as a ${job.jobTitle}. This is an exciting opportunity to contribute to our team and make a meaningful impact.`}
                                                        </p>

                                                        <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.requirements', 'Requirements')}</h4>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {Array.isArray(job.requirements) && job.requirements.length > 0 ? (
                                                                job.requirements.slice(0, 6).map((req, index) => (
                                                                    <span key={index} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                                                        {req}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-xs text-slate-500">{t('JobsUpdate.AppliedJobs.jobDetails.noRequirements', 'No specific requirements listed')}</span>
                                                            )}
                                                            {Array.isArray(job.requirements) && job.requirements.length > 6 && (
                                                                <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-xs">+{job.requirements.length - 6} more</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <div className="bg-slate-50 rounded-lg p-3">
                                                            <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.applicationStatus', 'Application Status')}</h4>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs text-slate-500">{t('JobsUpdate.AppliedJobs.jobDetails.status', 'Status')}:</span>
                                                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(job.status)}`}>
                                                                    {getStatusIcon(job.status)}
                                                                    {getStatusText(job.status)}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                {t('JobsUpdate.AppliedJobs.jobDetails.appliedOn', 'Applied on')} {formatDate(job.appliedDate)}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="bg-slate-50 rounded-lg p-3">
                                                            <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.AppliedJobs.jobDetails.jobDetails', 'Job Details')}</h4>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-slate-500">{t('JobsUpdate.AppliedJobs.jobDetails.type', 'Type')}:</span>
                                                                    <span className="text-slate-900 font-medium">{job.jobType || 'Full-time'}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-slate-500">{t('JobsUpdate.AppliedJobs.jobDetails.mode', 'Mode')}:</span>
                                                                    <span className="text-slate-900 font-medium">{job.workMode || 'On-site'}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-slate-500">{t('JobsUpdate.AppliedJobs.jobDetails.salary', 'Salary')}:</span>
                                                                    <span className="text-slate-900 font-medium">{job.salary}</span>
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

            </div>
        </div>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export default withTranslation('common')(AppliedJobs);
