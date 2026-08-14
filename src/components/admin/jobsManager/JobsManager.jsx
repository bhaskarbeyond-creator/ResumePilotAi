import React, { Component } from 'react';
import { getAllJobs, updateJobStatus, deleteJobByAdmin, toggleJobFeatured } from '../../../firestore/dbOperations';
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
            pendingAction: null,
        };
        this.loadRequest = 0;
    }

    componentDidMount() {
        this.loadJobs();
    }

    componentWillUnmount() {
        if (this.searchTimer) clearTimeout(this.searchTimer);
    }

    loadJobs = async (page = 1) => {
        const requestId = ++this.loadRequest;
        this.setState({ loading: true });
        try {
            const filters = {
                searchTerm: this.state.searchTerm,
                status: this.state.filterStatus,
            };

            const result = await getAllJobs(page, this.state.jobsPerPage, filters);
            if (requestId !== this.loadRequest) return;

            if (result.success) {
                this.setState({
                    jobs: result.jobs,
                    loading: false,
                    currentPage: result.pagination.currentPage,
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
            if (requestId === this.loadRequest) this.setState({
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
            
            if (!job) {
                this.setState({ errorMessage: 'The selected job is no longer on this page.', processingAction: null, pendingAction: null });
                await this.loadJobs(this.state.currentPage);
                return;
            }
            const result = await updateJobStatus(jobId, newStatus, {
                expectedStatus: job.status || 'pending',
                ...(job.updatedAt ? { expectedUpdatedAt: new Date(job.updatedAt).getTime() } : {}),
            });
            if (result.success) {
                this.setState({
                    successMessage: `Job status updated to ${newStatus}. The employer notification and audit record were created by the backend.`,
                    processingAction: null,
                    pendingAction: null,
                });
                // Reload jobs to reflect changes
                this.loadJobs(this.state.currentPage);
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to update job status. Please try again.',
                    processingAction: null,
                    ...(result.code === 'ADMIN_TARGET_CHANGED' ? { pendingAction: null } : {}),
                });
                if (result.code === 'ADMIN_TARGET_CHANGED') this.loadJobs(this.state.currentPage);
            }
        } catch (error) {
            console.error('Error updating job status:', error);
            this.setState({
                errorMessage: 'Failed to update job status. Please try again.',
                processingAction: null,
            });
        }
    };

    handleDeleteJob = async (job) => {
        this.setState({ processingAction: job.id });
        try {
            const result = await deleteJobByAdmin(job.id, {
                expectedStatus: job.status || 'pending',
                ...(job.updatedAt ? { expectedUpdatedAt: new Date(job.updatedAt).getTime() } : {}),
            });
            if (result.success) {
                this.setState({
                    successMessage: 'Job deleted and the action was audited.',
                    processingAction: null,
                    pendingAction: null,
                });
                // Reload jobs to reflect changes
                this.loadJobs(this.state.currentPage);
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to delete job. Please try again.',
                    processingAction: null,
                    ...(result.code === 'ADMIN_TARGET_CHANGED' ? { pendingAction: null } : {}),
                });
                if (result.code === 'ADMIN_TARGET_CHANGED') this.loadJobs(this.state.currentPage);
            }
        } catch (error) {
            console.error('Error deleting job:', error);
            this.setState({
                errorMessage: 'Failed to delete job. Please try again.',
                processingAction: null,
            });
        }
    };

    handleToggleFeatured = async (job, isFeatured) => {
        this.setState({ processingAction: job.id });
        try {
            const result = await toggleJobFeatured(job.id, isFeatured, {
                expectedFeatured: Boolean(job.isFeatured),
                ...(job.updatedAt ? { expectedUpdatedAt: new Date(job.updatedAt).getTime() } : {}),
            });
            if (result.success) {
                this.setState({
                    successMessage: `Job ${isFeatured ? 'featured' : 'unfeatured'} and the action was audited.`,
                    processingAction: null,
                    pendingAction: null,
                });
                // Reload jobs to reflect changes
                this.loadJobs(this.state.currentPage);
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to update job featured status. Please try again.',
                    processingAction: null,
                    ...(result.code === 'ADMIN_TARGET_CHANGED' ? { pendingAction: null } : {}),
                });
                if (result.code === 'ADMIN_TARGET_CHANGED') this.loadJobs(this.state.currentPage);
            }
        } catch (error) {
            console.error('Error toggling job featured status:', error);
            this.setState({
                errorMessage: 'Failed to update job featured status. Please try again.',
                processingAction: null,
            });
        }
    };

    requestJobAction = (job, action, value = null) => {
        const labels = {
            status: `Change status to ${value}?`,
            featured: value ? 'Feature this job?' : 'Remove featured status?',
            delete: 'Permanently delete this job?',
        };
        const details = action === 'delete'
            ? 'Deletion is allowed only when no applications exist; otherwise archive the job to preserve application records.'
            : 'The backend will verify the loaded job state, apply one change, create an audit record, and notify the employer for status changes.';
        this.setState({ pendingAction: {
            title: labels[action], message: `${job.title || 'Untitled job'} — ${details}`,
            confirmLabel: action === 'delete' ? 'Delete job' : 'Confirm change',
            onConfirm: () => action === 'status' ? this.handleStatusChange(job.id, value) : action === 'featured' ? this.handleToggleFeatured(job, value) : this.handleDeleteJob(job),
        } });
    };

    handleFilterChange = (filterType, value) => {
        this.setState({ [filterType]: value }, () => {
            if (filterType !== 'searchTerm') {
                this.loadJobs(1);
                return;
            }
            if (this.searchTimer) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.loadJobs(1), 350);
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
                {this.state.pendingAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !processingAction) this.setState({ pendingAction: null }); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="job-action-title" aria-describedby="job-action-message" className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
                            <h2 id="job-action-title" className="text-lg font-bold text-slate-900">{this.state.pendingAction.title}</h2>
                            <p id="job-action-message" className="mt-2 text-sm text-slate-600">{this.state.pendingAction.message}</p>
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" autoFocus onClick={() => this.setState({ pendingAction: null })} disabled={Boolean(processingAction)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
                                <button type="button" onClick={this.state.pendingAction.onConfirm} disabled={Boolean(processingAction)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{processingAction ? 'Applying…' : this.state.pendingAction.confirmLabel}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Success/Error Messages */}
                {(successMessage || errorMessage) && (
                    <div role={successMessage ? 'status' : 'alert'} aria-live="polite" className={`mb-4 p-4 rounded-lg ${successMessage ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
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
                                    id="admin-job-search"
                                    type="search"
                                    aria-label="Search jobs"
                                    placeholder="Search jobs by title, company, or description..."
                                    value={this.state.searchTerm}
                                    onChange={(e) => this.handleFilterChange('searchTerm', e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <select
                                id="admin-job-status"
                                aria-label="Filter jobs by status"
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
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600">Job Details</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600">Company</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600">Location</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600">Posted</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600">Status</th>
                                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actions</th>
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
                                                                <button type="button" onClick={() => this.toggleRowExpansion(job.id)} aria-label={expandedRow === job.id ? `Collapse ${job.title}` : `Expand ${job.title}`} className="ml-2 text-slate-400 hover:text-slate-600">
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
                                                            onClick={() => this.requestJobAction(job, 'featured', !job.isFeatured)}
                                                            disabled={processingAction === job.id}
                                                            className={`${job.isFeatured ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'} disabled:opacity-50 transition-colors`}
                                                            aria-label={job.isFeatured ? 'Remove from featured' : 'Make featured'}
                                                            title={job.isFeatured ? 'Remove from featured' : 'Make featured'}>
                                                            <FaStar className="w-4 h-4" />
                                                        </button>

                                                        {job.status === 'active' ? (
                                                            <button
                                                                onClick={() => this.requestJobAction(job, 'status', 'inactive')}
                                                                disabled={processingAction === job.id}
                                                                className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                                                                aria-label="Deactivate Job"
                                                                title="Deactivate Job">
                                                                <FaPause className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => this.requestJobAction(job, 'status', 'active')}
                                                                disabled={processingAction === job.id}
                                                                className="text-green-600 hover:text-green-800 disabled:opacity-50"
                                                                aria-label="Activate Job"
                                                                title="Activate Job">
                                                                <FaPlay className="w-4 h-4" />
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => this.requestJobAction(job, 'status', 'archived')}
                                                            disabled={processingAction === job.id}
                                                            className="text-orange-600 hover:text-orange-800 disabled:opacity-50"
                                                            aria-label="Archive Job"
                                                            title="Archive Job">
                                                            <FaArchive className="w-4 h-4" />
                                                        </button>

                                                        <button
                                                            onClick={() => this.requestJobAction(job, 'delete')}
                                                            disabled={processingAction === job.id}
                                                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                                            aria-label="Delete Job"
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
