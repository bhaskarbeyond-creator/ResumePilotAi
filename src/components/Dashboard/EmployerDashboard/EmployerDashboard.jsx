import React, { useState, useEffect, useContext } from 'react';
import { withTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
    FaBriefcase,
    FaSearch,
    FaFilter,
    FaCalendar,
    FaMapMarkerAlt,
    FaDollarSign,
    FaEye,
    FaClock,
    FaCheckCircle,
    FaTimesCircle,
    FaHourglass,
    FaInfoCircle,
    FaSortAmountDown,
    FaBuilding,
    FaPlus,
    FaEdit,
    FaTrash,
    FaUsers,
    FaChartBar,
    FaFileAlt,
    FaExclamationTriangle,
    FaChevronDown,
    FaChevronUp,
} from 'react-icons/fa';
import { getEmployerJobs, getJobApplications, updateJobPosting, deleteJobPosting, updateApplicationStatus } from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';
import JobApplicationsModal from './JobApplicationsModal';
import AddCompanyModal from './AddCompanyModal';
import EditJobModal from './EditJobModal';

const EmployerDashboard = ({ showToast, sidebarCollapsed, t }) => {
    const user = useContext(AuthContext);
    const [jobs, setJobs] = useState([]);
    const [filteredJobs, setFilteredJobs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState(null);
    const [applications, setApplications] = useState([]);
    const [loadingApplications, setLoadingApplications] = useState(false);
    const [expandedJob, setExpandedJob] = useState(null);
    const [showApplicationsModal, setShowApplicationsModal] = useState(false);
    const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
    const [showEditJobModal, setShowEditJobModal] = useState(false);
    const [selectedJobForEdit, setSelectedJobForEdit] = useState(null);

    // Real data is now loaded from Firebase via getEmployerJobs and getJobApplications

    useEffect(() => {
        loadJobs();
    }, []);

    useEffect(() => {
        filterAndSortJobs();
    }, [jobs, searchTerm, statusFilter, sortBy]);

    const loadJobs = async () => {
        if (!user?.uid) {
            console.log('❌ No user found, cannot load jobs');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {


            const employerJobs = await getEmployerJobs(user.uid);


            if (employerJobs && employerJobs.length > 0) {
                // Transform the data to match the expected format
                const transformedJobs = employerJobs.map((job) => {
                    return {
                        id: job.id,
                        title: job.title || 'Untitled Job',
                        company: job.company || 'Your Company',
                        location: job.location || 'Location not specified',
                        salary: formatSalaryDisplay(job.minSalary, job.maxSalary),
                        postedDate: job.createdAt ? formatDate(job.createdAt) : new Date().toISOString().split('T')[0],
                        status: job.status || 'active',
                        statusColor: getStatusColor(job.status),
                        jobType: job.jobType || 'Full-time',
                        workMode: job.workMode || 'On-site',
                        description: job.description || 'No description provided',
                        requirements: job.requirements || [],
                        applicationsCount: job.applicationsCount || 0,
                        viewsCount: job.viewsCount || 0,
                        deadline: job.deadline ? formatDate(job.deadline) : null,
                        // Include all original data
                        ...job,
                    };
                });

                setJobs(transformedJobs);
            } else {
                console.log('❌ No jobs found for employer:', user.uid);
                console.log('❌ This could mean:');
                console.log('   1. No jobs exist in the database for this employer');
                console.log("   2. The employerId field in jobs doesn't match the user.uid");
                console.log("   3. There's an issue with the database query");
                setJobs([]);
            }
        } catch (error) {
            console.error('❌ Error loading jobs:', error);
            console.error('❌ Error details:', error.message);
            showToast && showToast('error', 'Error', 'Failed to load jobs');
            setJobs([]);
        } finally {
            setLoading(false);
        }
    };

    const filterAndSortJobs = () => {
        let filtered = [...jobs];

        // Filter by search term
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (job) => job.title.toLowerCase().includes(searchLower) || job.location.toLowerCase().includes(searchLower) || job.requirements.some((req) => req.toLowerCase().includes(searchLower))
            );
        }

        // Filter by status
        if (statusFilter !== 'all') {
            filtered = filtered.filter((job) => job.status === statusFilter);
        }

        // Sort jobs
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'date':
                    return new Date(b.postedDate) - new Date(a.postedDate);
                case 'applications':
                    return b.applicationsCount - a.applicationsCount;
                case 'views':
                    return b.viewsCount - a.viewsCount;
                case 'title':
                    return a.title.localeCompare(b.title);
                default:
                    return 0;
            }
        });

        setFilteredJobs(filtered);
    };

    const loadApplications = async (jobId) => {
        setLoadingApplications(true);
        try {
            const jobApplications = await getJobApplications(jobId);

       
            if (jobApplications && jobApplications.length > 0) {
                // Transform the data to match the expected format
                const transformedApplications = jobApplications.map((app) => {
                    return {
                        id: app.id,
                        jobId: app.jobId,
                        applicantName: app.applicantName || app.fullName || 'Unknown Applicant',
                        applicantEmail: app.applicantEmail || app.email || 'No email provided',
                        appliedDate: app.appliedAt ? formatDate(app.appliedAt) : formatDate(app.createdAt),
                        status: app.status || 'pending',
                        statusColor: getApplicationStatusColor(app.status),
                        resume: app.resumeUrl || app.selectedResume?.id || 'No resume',
                        coverLetter: app.coverLetter || 'No cover letter provided',
                        experience: app.experience || 'Not specified',
                        skills: app.skills || [],
                        // Include all original data
                        ...app,
                    };
                });

                setApplications(transformedApplications);
            } else {
                console.log('❌ EmployerDashboard: No applications found for job:', jobId);
                setApplications([]);
            }
        } catch (error) {
            console.error('❌ EmployerDashboard: Error loading applications:', error);
            showToast && showToast('error', 'Error', 'Failed to load applications');
            setApplications([]);
        } finally {
            setLoadingApplications(false);
        }
    };

    const handleJobClick = (job) => {
        setSelectedJob(job);
        loadApplications(job.id);
        setShowApplicationsModal(true);
    };

    const handleCloseModal = () => {
        setShowApplicationsModal(false);
        setSelectedJob(null);
        setApplications([]);
    };

    const handleUpdateApplicationStatus = (applicationId, newStatus) => {
        setApplications((prev) => prev.map((app) => (app.id === applicationId ? { ...app, status: newStatus } : app)));
        showToast && showToast('success', 'Success', `Application status updated to ${newStatus}`);
    };

    const toggleJobExpansion = (jobId) => {
        setExpandedJob(expandedJob === jobId ? null : jobId);
    };

    // Handle edit job
    const handleEditJob = (job) => {
        setSelectedJobForEdit(job);
        setShowEditJobModal(true);
    };

    // Handle job updated from edit modal
    const handleJobUpdated = (updatedJob) => {
        setJobs((prevJobs) => 
            prevJobs.map((job) => 
                job.id === updatedJob.id 
                    ? { ...job, ...updatedJob, salary: formatSalaryDisplay(updatedJob.minSalary, updatedJob.maxSalary) }
                    : job
            )
        );
        showToast('success', 'Success', 'Job updated successfully!');
    };

    // Handle deactivate/activate job
    const handleToggleJobStatus = async (job) => {
        try {
            const newStatus = job.status === 'active' ? 'paused' : 'active';
            
            const result = await updateJobPosting(job.id, { status: newStatus });
            
            if (result.success) {
                setJobs((prevJobs) => 
                    prevJobs.map((j) => 
                        j.id === job.id 
                            ? { ...j, status: newStatus, statusColor: getStatusColor(newStatus) }
                            : j
                    )
                );
                showToast('success', 'Success', `Job ${newStatus === 'active' ? 'activated' : 'paused'} successfully`);
            } else {
                throw new Error(result.error || 'Failed to update job status');
            }
        } catch (error) {
            console.error('Error updating job status:', error);
            showToast('error', 'Error', `Failed to ${job.status === 'active' ? 'pause' : 'activate'} job: ${error.message}`);
        }
    };

    // Handle delete job
    const handleDeleteJob = async (job) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete the job "${job.title}"? This action cannot be undone and will remove all associated applications.`
        );
        
        if (!confirmed) return;
        
        try {
            const result = await deleteJobPosting(job.id);
            
            if (result.success) {
                setJobs((prevJobs) => prevJobs.filter((j) => j.id !== job.id));
                showToast('success', 'Success', 'Job deleted successfully');
                // Close expanded view if this job was expanded
                if (expandedJob === job.id) {
                    setExpandedJob(null);
                }
            } else {
                throw new Error(result.error || 'Failed to delete job');
            }
        } catch (error) {
            console.error('Error deleting job:', error);
            showToast('error', 'Error', `Failed to delete job: ${error.message}`);
        }
    };

    // Handle close edit modal
    const handleCloseEditModal = () => {
        setShowEditJobModal(false);
        setSelectedJobForEdit(null);
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            active: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: FaCheckCircle, label: 'Active' },
            pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: FaClock, label: 'Pending Approval' },
            paused: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: FaHourglass, label: 'Paused' },
            closed: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: FaTimesCircle, label: 'Closed' },
            draft: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: FaFileAlt, label: 'Draft' },
        };

        const config = statusConfig[status] || statusConfig.pending; // Default to pending instead of active
        const IconComponent = config.icon;

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${config.bg} ${config.text} ${config.border}`}>
                <IconComponent className="w-2.5 h-2.5 mr-1" />
                {config.label}
            </span>
        );
    };

    const getApplicationStatusBadge = (status) => {
        const statusConfig = {
            pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: FaClock, label: 'Pending' },
            interview: { bg: 'bg-blue-100', text: 'text-blue-700', icon: FaUsers, label: 'Interview' },
            accepted: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: FaCheckCircle, label: 'Accepted' },
            rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: FaTimesCircle, label: 'Rejected' },
        };

        const config = statusConfig[status] || statusConfig.pending;
        const IconComponent = config.icon;

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
                <IconComponent className="w-3 h-3 mr-1" />
                {config.label}
            </span>
        );
    };

    // Helper function to format salary display
    const formatSalaryDisplay = (minSalary, maxSalary) => {
        if (!minSalary && !maxSalary) return 'Salary not specified';
        if (minSalary && maxSalary) {
            return `$${(minSalary / 1000).toFixed(0)}k - $${(maxSalary / 1000).toFixed(0)}k`;
        }
        if (minSalary) return `$${(minSalary / 1000).toFixed(0)}k+`;
        if (maxSalary) return `Up to $${(maxSalary / 1000).toFixed(0)}k`;
        return 'Salary not specified';
    };

    // Helper function to get status color
    const getStatusColor = (status) => {
        const statusColors = {
            active: 'green',
            pending: 'yellow',
            paused: 'gray',
            closed: 'red',
            draft: 'gray',
        };
        return statusColors[status] || 'yellow'; // Default to yellow (pending) instead of green
    };

    // Helper function to get application status color
    const getApplicationStatusColor = (status) => {
        const statusColors = {
            pending: 'yellow',
            interview: 'blue',
            accepted: 'green',
            rejected: 'red',
        };
        return statusColors[status] || 'yellow';
    };

    const formatDate = (dateInput) => {
        if (!dateInput) return 'Date not specified';

        let date;
        if (dateInput.toDate && typeof dateInput.toDate === 'function') {
            // Firestore timestamp
            date = dateInput.toDate();
        } else if (dateInput instanceof Date) {
            date = dateInput;
        } else if (typeof dateInput === 'string') {
            date = new Date(dateInput);
        } else {
            return 'Invalid date';
        }

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-3 sm:py-4">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-slate-600 mx-auto mb-3"></div>
                            <p className="text-slate-600 text-sm font-medium">{t('JobsUpdate.EmployerDashboard.loading', 'Loading your job postings...')}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
            <div className="min-h-screen bg-slate-50">
                <div className="mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-3 sm:py-4">
                {/* Header */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <div className="p-2 bg-slate-100 rounded-lg">
                                <FaBriefcase className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xl font-semibold text-slate-900 tracking-tight truncate">{t('JobsUpdate.EmployerDashboard.header.title', 'Job Postings')}</h1>
                                <p className="text-slate-600 text-sm mt-0.5">{t('JobsUpdate.EmployerDashboard.header.subtitle', 'Manage your job postings and review applications')}</p>
                            </div>
                        </div>
                        <div className="flex space-x-3">
                            <button 
                                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium shadow-sm"
                                onClick={() => setShowAddCompanyModal(true)}
                            >
                                <FaBuilding className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{t('JobsUpdate.EmployerDashboard.buttons.addCompany', 'Add Company')}</span>
                                <span className="sm:hidden">{t('JobsUpdate.EmployerDashboard.buttons.company', 'Company')}</span>
                            </button>
                            <button className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium shadow-sm">
                                <FaPlus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{t('JobsUpdate.EmployerDashboard.buttons.postNewJob', 'Post New Job')}</span>
                                <span className="sm:hidden">{t('JobsUpdate.EmployerDashboard.buttons.newJob', 'New Job')}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.EmployerDashboard.stats.totalJobs', 'Total Jobs')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">{jobs.length}</p>
                            </div>
                            <div className="p-2 bg-slate-100 rounded-md">
                                <FaBriefcase className="w-4 h-4 text-slate-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.EmployerDashboard.stats.active', 'Active')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">{jobs.filter((job) => job.status === 'active').length}</p>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded-md">
                                <FaCheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.EmployerDashboard.stats.applications', 'Applications')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">{jobs.reduce((sum, job) => sum + job.applicationsCount, 0)}</p>
                            </div>
                            <div className="p-2 bg-blue-50 rounded-md">
                                <FaUsers className="w-4 h-4 text-blue-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.EmployerDashboard.stats.views', 'Views')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">{jobs.reduce((sum, job) => sum + job.viewsCount, 0)}</p>
                            </div>
                            <div className="p-2 bg-slate-100 rounded-md">
                                <FaEye className="w-4 h-4 text-slate-600" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm mb-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="flex-1">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                                <input
                                    type="text"
                                    placeholder={t('JobsUpdate.EmployerDashboard.search.placeholder', 'Search jobs by title, location...')}
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
                                <option value="all">{t('JobsUpdate.EmployerDashboard.filters.allStatus', 'All Status')}</option>
                                <option value="active">{t('JobsUpdate.EmployerDashboard.filters.active', 'Active')}</option>
                                <option value="pending">{t('JobsUpdate.EmployerDashboard.filters.pending', 'Pending Approval')}</option>
                                <option value="paused">{t('JobsUpdate.EmployerDashboard.filters.paused', 'Paused')}</option>
                                <option value="closed">{t('JobsUpdate.EmployerDashboard.filters.closed', 'Closed')}</option>
                                <option value="draft">{t('JobsUpdate.EmployerDashboard.filters.draft', 'Draft')}</option>
                            </select>
                        </div>

                        {/* Sort By */}
                        <div className="sm:w-44">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white">
                                <option value="date">{t('JobsUpdate.EmployerDashboard.sort.byDate', 'Sort by Date')}</option>
                                <option value="applications">{t('JobsUpdate.EmployerDashboard.sort.byApplications', 'Applications')}</option>
                                <option value="views">{t('JobsUpdate.EmployerDashboard.sort.byViews', 'Views')}</option>
                                <option value="title">{t('JobsUpdate.EmployerDashboard.sort.byTitle', 'Title')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Jobs List */}
                {filteredJobs.length === 0 ? (
                    <div className="bg-white rounded-lg p-8 border border-slate-200 text-center">
                        <FaBriefcase className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-slate-900 mb-2">{t('JobsUpdate.EmployerDashboard.emptyState.title', 'No job postings found')}</h3>
                        <p className="text-slate-600 text-sm mb-4 max-w-md mx-auto">
                            {jobs.length === 0
                                ? t('JobsUpdate.EmployerDashboard.emptyState.noJobs', "You haven't posted any jobs yet. Create your first job posting to get started!")
                                : t('JobsUpdate.EmployerDashboard.emptyState.noResults', 'No jobs match your current filters. Try adjusting your search criteria.')}
                        </p>
                        <button className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-md flex items-center gap-2 mx-auto transition-colors text-sm font-medium">
                            <FaPlus className="w-3.5 h-3.5" />
                            {t('JobsUpdate.EmployerDashboard.buttons.postFirstJob', 'Post Your First Job')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredJobs.map((job) => (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-slate-300 transition-all duration-200">
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="text-sm font-medium text-slate-900 truncate">{job.title}</h3>
                                                {getStatusBadge(job.status)}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-3">
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
                                                        {job.jobType} • {job.workMode}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <FaCalendar className="w-3 h-3" />
                                                    <span>Posted {formatDate(job.postedDate)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <FaUsers className="w-3 h-3 text-slate-500" />
                                                    <span className="font-medium text-slate-900">{job.applicationsCount}</span>
                                                    <span className="text-slate-500">{t('JobsUpdate.EmployerDashboard.jobInfo.applications', 'applications')}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <FaEye className="w-3 h-3 text-slate-500" />
                                                    <span className="font-medium text-slate-900">{job.viewsCount}</span>
                                                    <span className="text-slate-500">{t('JobsUpdate.EmployerDashboard.jobInfo.views', 'views')}</span>
                                                </div>
                                                {job.deadline && (
                                                    <div className="flex items-center gap-1">
                                                        <FaCalendar className="w-3 h-3 text-slate-500" />
                                                        <span className="text-slate-500">{t('JobsUpdate.EmployerDashboard.jobInfo.deadline', 'Deadline:')}</span>
                                                        <span className="font-medium text-slate-900">{formatDate(job.deadline)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                            <button
                                                onClick={() => handleJobClick(job)}
                                                className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                                                <FaUsers className="w-3 h-3" />
                                                <span className="hidden sm:inline">{t('JobsUpdate.EmployerDashboard.buttons.applications', 'Applications')}</span>
                                                <span className="sm:hidden">{job.applicationsCount}</span>
                                            </button>
                                            <button onClick={() => toggleJobExpansion(job.id)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-50">
                                                {expandedJob === job.id ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Job Details */}
                                    {expandedJob === job.id && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mt-3 pt-3 border-t border-slate-200">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                <div className="lg:col-span-2">
                                                    <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.EmployerDashboard.jobDetails.description', 'Job Description')}</h4>
                                                    <p className="text-slate-600 text-xs leading-relaxed mb-3 line-clamp-3">{job.description}</p>

                                                    <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.EmployerDashboard.jobDetails.requirements', 'Requirements')}</h4>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {job.requirements.slice(0, 6).map((req, index) => (
                                                            <span key={index} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                                                {req}
                                                            </span>
                                                        ))}
                                                        {job.requirements.length > 6 && (
                                                            <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-xs">{t('JobsUpdate.EmployerDashboard.jobDetails.moreRequirements', '+{{count}} more', { count: job.requirements.length - 6 })}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    <button 
                                                        onClick={() => handleEditJob(job)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200"
                                                    >
                                                        <FaEdit className="w-3 h-3" />
                                                        {t('JobsUpdate.EmployerDashboard.buttons.editJob', 'Edit Job')}
                                                    </button>
                                                    <button 
                                                        onClick={() => handleToggleJobStatus(job)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200"
                                                    >
                                                        <FaHourglass className="w-3 h-3" />
                                                        {job.status === 'active' ? t('JobsUpdate.EmployerDashboard.buttons.pause', 'Pause') : t('JobsUpdate.EmployerDashboard.buttons.activate', 'Activate')}
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteJob(job)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-xs font-medium border border-red-200"
                                                    >
                                                        <FaTrash className="w-3 h-3" />
                                                        {t('JobsUpdate.EmployerDashboard.buttons.delete', 'Delete')}
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Job Applications Modal */}
                <JobApplicationsModal
                    isOpen={showApplicationsModal}
                    onClose={handleCloseModal}
                    job={selectedJob}
                    applications={applications}
                    onUpdateStatus={handleUpdateApplicationStatus}
                    showToast={showToast}
                />

                {/* Add Company Modal */}
                <AddCompanyModal
                    isOpen={showAddCompanyModal}
                    onClose={() => setShowAddCompanyModal(false)}
                    showToast={showToast}
                />

                {/* Edit Job Modal */}
                <EditJobModal
                    isOpen={showEditJobModal}
                    onClose={handleCloseEditModal}
                    job={selectedJobForEdit}
                    onJobUpdated={handleJobUpdated}
                    showToast={showToast}
                />
                </div>
            </div>
    );
};

export default withTranslation('common')(EmployerDashboard);
