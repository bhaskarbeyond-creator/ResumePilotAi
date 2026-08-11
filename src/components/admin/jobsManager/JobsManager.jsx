import React, { Component } from 'react';
import { getAllJobs, updateJobStatus, deleteJobPosting, createNotification, toggleJobFeatured } from '../../../firestore/dbOperations';
import {
    FaBriefcase,
    FaBuilding,
    FaCalendar,
    FaCheck,
    FaTimes,
    FaEye,
    FaChevronDown,
    FaChevronUp,
    FaClock,
    FaInbox,
    FaSearch,
    FaFilter,
    FaMapMarkerAlt,
    FaDollarSign,
    FaUsers,
    FaExclamationTriangle,
    FaTrash,
    FaEdit,
    FaPause,
    FaPlay,
    FaArchive,
    FaStar,
} from 'react-icons/fa';

class JobsManager extends Component {
    constructor(props) {
        super(props);
        this.state = {
            jobs: [],
            loading: true,
            selectedJob: null,
            expandedRow: null,
            processingAction: null,
            successMessage: '',
            errorMessage: '',
            filterStatus: 'all',
            searchTerm: '',
            currentPage: 1,
            pagination: {
                totalItems: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
            },
            jobsPerPage: 10,
        };
    }

    componentDidMount() {
        this.loadJobs();
    }

    loadJobs = async (page = 1) => {
        this.setState({ loading: true });
        try {
            const filters = {
                searchTerm: this.state.searchTerm,
                status: this.state.filterStatus,
            };

            const result = await getAllJobs(page, this.state.jobsPerPage, filters);

            if (result.success) {
                this.setState({
                    jobs: result.jobs,
                    loading: false,
                    currentPage: page,
                    pagination: result.pagination,
                });
            } else {
                this.setState({
                    loading: false,
                    errorMessage: 'Failed to load jobs. Please try again.',
                });
            }
        } catch (error) {
            console.error('Error loading jobs:', error);
            this.setState({
                loading: false,
                errorMessage: 'Failed to load jobs. Please try again.',
            });
        }
    };

    handleStatusChange = async (jobId, newStatus) => {
        this.setState({ processingAction: jobId });
        try {
            // Find the job details before updating status
            const job = this.state.jobs.find(j => j.id === jobId);
            
            const result = await updateJobStatus(jobId, newStatus);
            if (result.success) {
                // Send notification to the employer about the status change
                if (job && job.employerId) {
                    const notificationData = this.getStatusChangeNotification(newStatus, job);
                    try {
                        await createNotification(job.employerId, notificationData);
                        console.log('✅ Notification sent to employer:', job.employerId);
                    } catch (notificationError) {
                        console.error('❌ Failed to send notification to employer:', notificationError);
                        // Don't fail the entire operation if notification fails
                    }
                }
                
                this.setState({
                    successMessage: `Job status updated to ${newStatus} successfully!`,
                    processingAction: null,
                });
                // Reload jobs to reflect changes
                this.loadJobs(this.state.currentPage);
            } else {
                this.setState({
                    errorMessage: 'Failed to update job status. Please try again.',
                    processingAction: null,
                });
            }
        } catch (error) {
            console.error('Error updating job status:', error);
            this.setState({
                errorMessage: 'Failed to update job status. Please try again.',
                processingAction: null,
            });
        }
    };

    handleDeleteJob = async (jobId) => {
        if (!window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
            return;
        }

        this.setState({ processingAction: jobId });
        try {
            const result = await deleteJobPosting(jobId);
            if (result.success) {
                this.setState({
                    successMessage: 'Job deleted successfully!',
                    processingAction: null,
                });
                // Reload jobs to reflect changes
                this.loadJobs(this.state.currentPage);
            } else {
                this.setState({
                    errorMessage: 'Failed to delete job. Please try again.',
                    processingAction: null,
                });
            }
        } catch (error) {
            console.error('Error deleting job:', error);
            this.setState({
                errorMessage: 'Failed to delete job. Please try again.',
                processingAction: null,
            });
        }
    };

    handleToggleFeatured = async (jobId, isFeatured) => {
        this.setState({ processingAction: jobId });
        try {
            const result = await toggleJobFeatured(jobId, isFeatured);
            if (result.success) {
                this.setState({
                    successMessage: `Job ${isFeatured ? 'featured' : 'unfeatured'} successfully!`,
                    processingAction: null,
                });
                // Reload jobs to reflect changes
                this.loadJobs(this.state.currentPage);
            } else {
                this.setState({
                    errorMessage: 'Failed to update job featured status. Please try again.',
                    processingAction: null,
                });
            }
        } catch (error) {
            console.error('Error toggling job featured status:', error);
            this.setState({
                errorMessage: 'Failed to update job featured status. Please try again.',
                processingAction: null,
            });
        }
    };

    handleFilterChange = (filterType, value) => {
        this.setState({ [filterType]: value }, () => {
            this.loadJobs(1); // Reset to first page when filtering
        });
    };

    handlePageChange = (page) => {
        this.loadJobs(page);
    };

    toggleRowExpansion = (jobId) => {
        this.setState({
            expandedRow: this.state.expandedRow === jobId ? null : jobId,
        });
    };

    dismissMessage = () => {
        this.setState({ successMessage: '', errorMessage: '' });
    };

    getStatusChangeNotification = (newStatus, job) => {
        const jobTitle = job.title || 'Your Job';
        const companyName = job.company || 'Your Company';
        
        switch (newStatus) {
            case 'active':
                return {
                    type: 'job_status_update',
                    title: 'Job Approved',
                    message: `Great news! Your job posting "${jobTitle}" at ${companyName} has been approved and is now active. Job seekers can now view and apply to your position.`,
                    data: {
                        jobId: job.id,
                        jobTitle: jobTitle,
                        company: companyName,
                        status: newStatus,
                        action: 'approved'
                    }
                };
            case 'inactive':
                return {
                    type: 'job_status_update',
                    title: 'Job Deactivated',
                    message: `Your job posting "${jobTitle}" at ${companyName} has been temporarily deactivated by our admin team. It is no longer visible to job seekers. Please contact support if you have any questions.`,
                    data: {
                        jobId: job.id,
                        jobTitle: jobTitle,
                        company: companyName,
                        status: newStatus,
                        action: 'deactivated'
                    }
                };
            case 'archived':
                return {
                    type: 'job_status_update',
                    title: 'Job Archived',
                    message: `Your job posting "${jobTitle}" at ${companyName} has been archived by our admin team. This job is no longer accepting applications and has been moved to your archived jobs.`,
                    data: {
                        jobId: job.id,
                        jobTitle: jobTitle,
                        company: companyName,
                        status: newStatus,
                        action: 'archived'
                    }
                };
            case 'pending':
                return {
                    type: 'job_status_update',
                    title: 'Job Under Review',
                    message: `Your job posting "${jobTitle}" at ${companyName} is currently under review by our admin team. We'll notify you once the review is complete.`,
                    data: {
                        jobId: job.id,
                        jobTitle: jobTitle,
                        company: companyName,
                        status: newStatus,
                        action: 'under_review'
                    }
                };
            default:
                return {
                    type: 'job_status_update',
                    title: 'Job Status Updated',
                    message: `The status of your job posting "${jobTitle}" at ${companyName} has been updated to ${newStatus}.`,
                    data: {
                        jobId: job.id,
                        jobTitle: jobTitle,
                        company: companyName,
                        status: newStatus,
                        action: 'status_changed'
                    }
                };
        }
    };

    getStatusBadge = (status) => {
        const statusConfig = {
            active: { color: 'bg-green-100 text-green-800', icon: FaCheck, label: 'Active' },
            pending: { color: 'bg-yellow-100 text-yellow-800', icon: FaClock, label: 'Pending' },
            inactive: { color: 'bg-gray-100 text-gray-800', icon: FaPause, label: 'Inactive' },
            archived: { color: 'bg-red-100 text-red-800', icon: FaArchive, label: 'Archived' },
        };

        const config = statusConfig[status] || statusConfig.pending;
        const IconComponent = config.icon;

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                <IconComponent className="w-3 h-3 mr-1" />
                {config.label}
            </span>
        );
    };

    formatDate = (date) => {
        if (!date) return 'N/A';
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    render() {
        const { loading, expandedRow, processingAction, successMessage, errorMessage, currentPage, pagination } = this.state;
        const jobCount = this.state.jobs.length;
        const totalJobs = pagination.totalItems;

        if (loading) {
            return (
                <div className="min-h-screen bg-slate-50 px-4 py-6">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <p className="text-slate-600">Loading jobs...</p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-slate-50 px-4 py-6">
                {/* Success/Error Messages */}
                {(successMessage || errorMessage) && (
                    <div className={`mb-4 p-4 rounded-lg ${successMessage ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                        <div className="flex items-center justify-between">
                            <span>{successMessage || errorMessage}</span>
                            <button onClick={this.dismissMessage} className="text-sm underline">
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Jobs Manager</h1>
                            <div className="flex items-center mt-1 text-sm text-slate-500">
                                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
                                <span>{totalJobs} total jobs</span>
                                {currentPage > 1 && (
                                    <>
                                        <span className="mx-2">•</span>
                                        <span>
                                            Page {currentPage} of {pagination.totalPages}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search jobs by title, company, or description..."
                                    value={this.state.searchTerm}
                                    onChange={(e) => this.handleFilterChange('searchTerm', e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={this.state.filterStatus}
                                onChange={(e) => this.handleFilterChange('filterStatus', e.target.value)}
                                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm">
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="pending">Pending</option>
                                <option value="inactive">Inactive</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Jobs List */}
                {this.state.jobs.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 mb-4">
                                <FaInbox className="w-6 h-6 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">No Jobs Found</h3>
                            <p className="text-xs text-slate-500">{totalJobs === 0 ? 'No jobs have been posted yet.' : 'No jobs match your current filters.'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Job Details</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Company</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Location</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Posted</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Status</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {this.state.jobs.map((job) => (
                                        <React.Fragment key={job.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-start">
                                                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                                                            <FaBriefcase className="w-4 h-4 text-blue-600" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center">
                                                                <p className="text-sm font-medium text-slate-900 truncate">{job.title}</p>
                                                                <button onClick={() => this.toggleRowExpansion(job.id)} className="ml-2 text-slate-400 hover:text-slate-600">
                                                                    {expandedRow === job.id ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center mt-1 text-xs text-slate-500">
                                                                <span className="bg-slate-100 px-2 py-1 rounded mr-2">{job.jobType}</span>
                                                                <span className="bg-slate-100 px-2 py-1 rounded mr-2">{job.workMode}</span>
                                                                {job.salary && <span className="text-green-600">{job.salary}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center">
                                                        <FaBuilding className="w-3 h-3 text-slate-400 mr-2" />
                                                        <span className="text-sm text-slate-900">{job.company}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center">
                                                        <FaMapMarkerAlt className="w-3 h-3 text-slate-400 mr-2" />
                                                        <span className="text-sm text-slate-600">{job.location}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center">
                                                        <FaCalendar className="w-3 h-3 text-slate-400 mr-2" />
                                                        <span className="text-sm text-slate-600">{this.formatDate(job.createdAt)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">{this.getStatusBadge(job.status)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end space-x-2">
                                                        <button
                                                            onClick={() => this.handleToggleFeatured(job.id, !job.isFeatured)}
                                                            disabled={processingAction === job.id}
                                                            className={`${job.isFeatured ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'} disabled:opacity-50 transition-colors`}
                                                            title={job.isFeatured ? 'Remove from featured' : 'Make featured'}>
                                                            <FaStar className="w-4 h-4" />
                                                        </button>

                                                        {job.status === 'active' ? (
                                                            <button
                                                                onClick={() => this.handleStatusChange(job.id, 'inactive')}
                                                                disabled={processingAction === job.id}
                                                                className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                                                                title="Deactivate Job">
                                                                <FaPause className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => this.handleStatusChange(job.id, 'active')}
                                                                disabled={processingAction === job.id}
                                                                className="text-green-600 hover:text-green-800 disabled:opacity-50"
                                                                title="Activate Job">
                                                                <FaPlay className="w-4 h-4" />
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => this.handleStatusChange(job.id, 'archived')}
                                                            disabled={processingAction === job.id}
                                                            className="text-orange-600 hover:text-orange-800 disabled:opacity-50"
                                                            title="Archive Job">
                                                            <FaArchive className="w-4 h-4" />
                                                        </button>

                                                        <button
                                                            onClick={() => this.handleDeleteJob(job.id)}
                                                            disabled={processingAction === job.id}
                                                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                                            title="Delete Job">
                                                            <FaTrash className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded Row Details */}
                                            {expandedRow === job.id && (
                                                <tr>
                                                    <td colSpan="6" className="px-4 py-4 bg-slate-50">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <h4 className="text-sm font-medium text-slate-900 mb-2">Job Description</h4>
                                                                <p className="text-sm text-slate-600 mb-3">{job.description}</p>

                                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                                    <div>
                                                                        <span className="font-medium text-slate-700">Experience:</span>
                                                                        <span className="ml-1 text-slate-600">{job.experienceLevel}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium text-slate-700">Applications:</span>
                                                                        <span className="ml-1 text-slate-600">{job.applicants}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <h4 className="text-sm font-medium text-slate-900 mb-2">Requirements</h4>
                                                                <p className="text-sm text-slate-600 mb-3">{job.requirements || 'No specific requirements listed.'}</p>

                                                                <div className="text-xs">
                                                                    <div className="mb-1">
                                                                        <span className="font-medium text-slate-700">Deadline:</span>
                                                                        <span className="ml-1 text-slate-600">{this.formatDate(job.deadline) || 'Not specified'}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium text-slate-700">Last Updated:</span>
                                                                        <span className="ml-1 text-slate-600">{this.formatDate(job.updatedAt)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="mt-6 flex justify-center items-center gap-2">
                        <button
                            onClick={() => this.handlePageChange(currentPage - 1)}
                            disabled={!pagination.hasPreviousPage}
                            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            Previous
                        </button>

                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                let pageNum;
                                if (pagination.totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= pagination.totalPages - 2) {
                                    pageNum = pagination.totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }

                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => this.handlePageChange(pageNum)}
                                        className={`px-3 py-2 rounded-lg transition-colors ${pageNum === currentPage ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => this.handlePageChange(currentPage + 1)}
                            disabled={!pagination.hasNextPage}
                            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                            Next
                        </button>
                    </div>
                )}
            </div>
        );
    }
}

export default JobsManager;
