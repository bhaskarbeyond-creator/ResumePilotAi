import React, { Component } from 'react';
import { getAllEmployerApplications, approveEmployerApplication, rejectEmployerApplication, reactivateEmployerApplication } from '../../../firestore/dbOperations';
import {
    FaBuilding,
    FaUser,
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
    FaGlobe,
    FaMapMarkerAlt,
    FaPhone,
    FaEnvelope,
    FaLinkedin,
    FaUsers,
    FaExclamationTriangle,
} from 'react-icons/fa';

class EmployerApplications extends Component {
    constructor(props) {
        super(props);
        this.state = {
            applications: [],
            loading: true,
            selectedApplication: null,
            expandedRow: null,
            processingAction: null,
            successMessage: '',
            errorMessage: '',
            filterStatus: 'all',
            searchTerm: '',
        };
    }

    componentDidMount() {
        this.loadApplications();
    }

    loadApplications = async () => {
        this.setState({ loading: true });
        try {
            const applications = await getAllEmployerApplications();
            this.setState({ applications, loading: false });
        } catch (error) {
            console.error('Error loading applications:', error);
            this.setState({
                loading: false,
                errorMessage: 'Failed to load applications. Please try again.',
            });
        }
    };

    handleApprove = async (userId) => {
        this.setState({ processingAction: `approve-${userId}` });
        try {
            const result = await approveEmployerApplication(userId);
            if (result.success) {
                this.setState({
                    successMessage: 'Application approved successfully!',
                    processingAction: null,
                });
                setTimeout(() => this.setState({ successMessage: '' }), 3000);
                this.loadApplications(); // Refresh the list
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to approve application',
                    processingAction: null,
                });
                setTimeout(() => this.setState({ errorMessage: '' }), 3000);
            }
        } catch (error) {
            console.error('Error approving application:', error);
            this.setState({
                errorMessage: 'Failed to approve application. Please try again.',
                processingAction: null,
            });
            setTimeout(() => this.setState({ errorMessage: '' }), 3000);
        }
    };

    handleReject = async (userId, reason = '') => {
        this.setState({ processingAction: `reject-${userId}` });
        try {
            const result = await rejectEmployerApplication(userId, reason);
            if (result.success) {
                this.setState({
                    successMessage: 'Application rejected successfully!',
                    processingAction: null,
                });
                setTimeout(() => this.setState({ successMessage: '' }), 3000);
                this.loadApplications(); // Refresh the list
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to reject application',
                    processingAction: null,
                });
                setTimeout(() => this.setState({ errorMessage: '' }), 3000);
            }
        } catch (error) {
            console.error('Error rejecting application:', error);
            this.setState({
                errorMessage: 'Failed to reject application. Please try again.',
                processingAction: null,
            });
            setTimeout(() => this.setState({ errorMessage: '' }), 3000);
        }
    };

    toggleExpandRow = (applicationId) => {
        this.setState((prevState) => ({
            expandedRow: prevState.expandedRow === applicationId ? null : applicationId,
        }));
};

    handleReactivate = async (userId) => {
        this.setState({ processingAction: `reactivate-${userId}` });
        try {
            const result = await reactivateEmployerApplication(userId);
            if (result.success) {
                this.setState({
                    successMessage: 'Access reactivated successfully!',
                    processingAction: null,
                });
                setTimeout(() => this.setState({ successMessage: '' }), 3000);
                this.loadApplications(); // Refresh the list
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to reactivate access',
                    processingAction: null,
                });
                setTimeout(() => this.setState({ errorMessage: '' }), 3000);
            }
        } catch (error) {
            console.error('Error reactivating access:', error);
            this.setState({
                errorMessage: 'Failed to reactivate access. Please try again.',
                processingAction: null,
            });
            setTimeout(() => this.setState({ errorMessage: '' }), 3000);
        }
    };

    getStatusBadge = (status) => {
        const statusConfig = {
            pending: {
                bg: 'bg-yellow-100',
                text: 'text-yellow-700',
                icon: FaClock,
                label: 'Pending Review',
            },
            approved: {
                bg: 'bg-emerald-100',
                text: 'text-emerald-700',
                icon: FaCheck,
                label: 'Approved',
            },
            rejected: {
                bg: 'bg-red-100',
                text: 'text-red-700',
                icon: FaTimes,
                label: 'Rejected',
            },
            active: {
                bg: 'bg-blue-100',
                text: 'text-blue-700',
                icon: FaCheck,
                label: 'Active',
            },
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

    getFilteredApplications = () => {
        let filtered = this.state.applications;

        // Filter by status
        if (this.state.filterStatus !== 'all') {
            filtered = filtered.filter((app) => app.status === this.state.filterStatus);
        }

        // Filter by search term
        if (this.state.searchTerm) {
            const searchLower = this.state.searchTerm.toLowerCase();
            filtered = filtered.filter(
                (app) =>
                    app.companyName?.toLowerCase().includes(searchLower) ||
                    app.contactPersonName?.toLowerCase().includes(searchLower) ||
                    app.contactEmail?.toLowerCase().includes(searchLower) ||
                    app.industry?.toLowerCase().includes(searchLower)
            );
        }

        return filtered;
    };

    formatDate = (date) => {
        if (!date) return 'N/A';
        const dateObj = date.toDate ? date.toDate() : new Date(date);
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    render() {
        const { loading, expandedRow, processingAction, successMessage, errorMessage } = this.state;
        const filteredApplications = this.getFilteredApplications();
        const applicationCount = filteredApplications.length;
        const pendingCount = this.state.applications.filter((app) => app.status === 'pending').length;

        if (loading) {
            return (
                <div className="min-h-screen bg-slate-50 px-4 py-6">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <p className="text-slate-600">Loading applications...</p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-slate-50 px-4 py-6">
                {/* Success/Error Messages */}
                {successMessage && (
                    <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg">
                        <div className="flex items-center">
                            <FaCheck className="w-4 h-4 mr-2" />
                            {successMessage}
                        </div>
                    </div>
                )}

                {errorMessage && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                        <div className="flex items-center">
                            <FaExclamationTriangle className="w-4 h-4 mr-2" />
                            {errorMessage}
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Employer Applications</h1>
                            <div className="flex items-center mt-1 text-sm text-slate-500">
                                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
                                <span>{applicationCount} total applications</span>
                                {pendingCount > 0 && (
                                    <>
                                        <span className="mx-2">•</span>
                                        <span className="text-yellow-600 font-medium">{pendingCount} pending review</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>

                {/* Filters and Search */}
                <div className="mb-6 bg-white rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* Search */}
                        <div className="flex-1">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search by company, contact name, email, or industry..."
                                    value={this.state.searchTerm}
                                    onChange={(e) => this.setState({ searchTerm: e.target.value })}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="sm:w-48">
                            <div className="relative">
                                <FaFilter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <select
                                    value={this.state.filterStatus}
                                    onChange={(e) => this.setState({ filterStatus: e.target.value })}
                                    className="w-full pl-10 pr-8 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white">
                                    <option value="all">All Status</option>
                                    <option value="pending">Pending</option>
                                    <option value="approved">Approved</option>
                                    <option value="active">Active</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                                <FaChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Applications List */}
                {filteredApplications.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 mb-4">
                                <FaInbox className="w-6 h-6 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">No Applications Found</h3>
                            <p className="text-xs text-slate-500">
                                {this.state.applications.length === 0 ? 'No employer applications have been submitted yet.' : 'No applications match your current filters.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Company</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Contact</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Industry</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Submitted</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Status</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {filteredApplications.map((application) => (
                                        <React.Fragment key={application.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                                            <FaBuilding className="w-4 h-4 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{application.companyName || 'N/A'}</p>
                                                            <p className="text-xs text-slate-500">{application.companySize || 'Size not specified'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-900">{application.contactPersonName || 'N/A'}</p>
                                                        <p className="text-xs text-slate-500">{application.contactEmail || 'N/A'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-slate-600">{application.industry || 'N/A'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center text-sm text-slate-600">
                                                        <FaCalendar className="w-3 h-3 mr-2 text-slate-400" />
                                                        <span className="text-xs">{this.formatDate(application.submittedAt)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">{this.getStatusBadge(application.status)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end space-x-2">
                                                        <button
                                                            onClick={() => this.toggleExpandRow(application.id)}
                                                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 transition-colors">
                                                            <FaEye className="w-3 h-3" />
                                                            <span className="text-xs font-medium">{expandedRow === application.id ? 'Hide' : 'View'}</span>
                                                            {expandedRow === application.id ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                                                        </button>

                                                        {/* Show approve button only for pending applications */}
                                                        {application.status === 'pending' && (
                                                            <button
                                                                onClick={() => this.handleApprove(application.userId)}
                                                                disabled={processingAction === `approve-${application.userId}`}
                                                                className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50">
                                                                <FaCheck className="w-3 h-3" />
                                                                <span className="text-xs font-medium">{processingAction === `approve-${application.userId}` ? 'Approving...' : 'Approve'}</span>
                                                            </button>
                                                        )}

{/* Show reject button for pending, approved, and active applications */}
{(application.status === 'pending' || application.status === 'approved' || application.status === 'active') && (
    <button
        onClick={() => this.handleReject(application.userId)}
        disabled={processingAction === `reject-${application.userId}`}
        className="flex items-center space-x-1 text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
    >
        <FaTimes className="w-3 h-3" />
        <span className="text-xs font-medium">
            {processingAction === `reject-${application.userId}`
                ? 'Rejecting...'
                : (application.status === 'approved' || application.status === 'active')
                ? 'Revoke Access'
                : 'Reject'}
        </span>
    </button>
)}

{/* Show activate button for rejected applications */}
{application.status === 'rejected' && (
    <button
        onClick={() => this.handleReactivate(application.userId)}
        disabled={processingAction === `reactivate-${application.userId}`}
        className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
    >
        <FaCheck className="w-3 h-3" />
        <span className="text-xs font-medium">
            {processingAction === `reactivate-${application.userId}` ? 'Activating...' : 'Activate'}
        </span>
    </button>
)}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded Row Details */}
                                            {expandedRow === application.id && (
                                                <tr>
                                                    <td colSpan="6" className="px-4 py-4 bg-slate-50">
                                                        <div className="max-w-full overflow-hidden">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                                {/* Company Information */}
                                                                <div className="space-y-3 min-w-0">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Company Information</h4>
                                                                    <div className="space-y-2 text-xs">
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaGlobe className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Website:</span>
                                                                                <p className="text-slate-700 break-words">{application.companyWebsite || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaMapMarkerAlt className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Address:</span>
                                                                                <p className="text-slate-700 break-words">
                                                                                    {[application.companyAddress, application.companyCity, application.companyCountry].filter(Boolean).join(', ') ||
                                                                                        'N/A'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaUsers className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Company Size:</span>
                                                                                <p className="text-slate-700">{application.companySize || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Contact Information */}
                                                                <div className="space-y-3 min-w-0">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Contact Information</h4>
                                                                    <div className="space-y-2 text-xs">
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaUser className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Title:</span>
                                                                                <p className="text-slate-700">{application.contactPersonTitle || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaEnvelope className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Email:</span>
                                                                                <p className="text-slate-700 break-words">{application.contactEmail || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaPhone className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Phone:</span>
                                                                                <p className="text-slate-700">{application.contactPhone || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        {application.linkedinProfile && (
                                                                            <div className="flex items-start space-x-2">
                                                                                <FaLinkedin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                                <div className="min-w-0 flex-1">
                                                                                    <span className="text-slate-500">LinkedIn:</span>
                                                                                    <p className="text-slate-700 break-words">{application.linkedinProfile}</p>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Application Details */}
                                                                <div className="space-y-3 min-w-0">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Application Details</h4>
                                                                    <div className="space-y-2 text-xs">
                                                                        <div>
                                                                            <span className="text-slate-500">Expected Job Postings:</span>
                                                                            <p className="text-slate-700 break-words">{application.expectedJobPostings || 'N/A'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Reason for Joining:</span>
                                                                            <p className="text-slate-700 mt-1 break-words max-h-20 overflow-y-auto">{application.reasonForJoining || 'N/A'}</p>
                                                                        </div>
                                                                        {application.companyDescription && (
                                                                            <div>
                                                                                <span className="text-slate-500">Company Description:</span>
                                                                                <p className="text-slate-700 mt-1 break-words max-h-20 overflow-y-auto">{application.companyDescription}</p>
                                                                            </div>
                                                                        )}
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
            </div>
        );
    }
}

export default EmployerApplications;
