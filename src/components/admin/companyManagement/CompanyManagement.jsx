import React, { Component } from 'react';
import { getAllCompanies, approveCompany, rejectCompany, toggleCompanyFeatured } from '../../../firestore/dbOperations';
import { sanitizeImageUrl } from '../../../utils/sanitizeHtml';
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
    FaUsers,
    FaExclamationTriangle,
    FaImage,
    FaIndustry,
    FaCheckCircle,
    FaTimesCircle,
    FaStar,
    FaPlus,
} from 'react-icons/fa';
import AddCompanyModal from '../../Dashboard/EmployerDashboard/AddCompanyModal';

class CompanyManagement extends Component {
    constructor(props) {
        super(props);
        this.state = {
            companies: [],
            loading: true,
            selectedCompany: null,
            expandedRow: null,
            processingAction: null,
            successMessage: '',
            errorMessage: '',
            filterStatus: 'all',
            searchTerm: '',
            pendingAction: null,
            rejectionReason: '',
            isAddModalOpen: false,
        };
    }

    componentDidMount() {
        this.loadCompanies();
        this.handleGlobalKeyDown = (event) => {
            if (event.key === 'Escape' && !this.state.processingAction && this.state.pendingAction) {
                this.setState({ pendingAction: null, rejectionReason: '' });
            }
        };
        window.addEventListener('keydown', this.handleGlobalKeyDown);
    }

    componentWillUnmount() {
        if (this.handleGlobalKeyDown) {
            window.removeEventListener('keydown', this.handleGlobalKeyDown);
        }
    }

    loadCompanies = async () => {
        this.setState({ loading: true });
        try {
            const companies = await getAllCompanies();
            this.setState({ companies, loading: false });
        } catch (error) {
            console.error('Error loading companies:', error);
            this.setState({
                loading: false,
                errorMessage: 'Failed to load companies. Please try again.',
            });
        }
    };

    handleApprove = async (company) => {
        this.setState({ processingAction: `approve-${company.id}` });
        try {
            const result = await approveCompany(company.id, {
                expectedStatus: company.status || 'pending',
                ...(company.updatedAt ? { expectedUpdatedAt: (company.updatedAt.toDate?.() || new Date(company.updatedAt)).getTime() } : {}),
            });
            if (result.success) {
                this.setState({
                    successMessage: 'Company approved successfully!',
                    processingAction: null,
                    pendingAction: null,
                    rejectionReason: '',
                });
                setTimeout(() => this.setState({ successMessage: '' }), 3000);
                this.loadCompanies(); // Refresh the list
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to approve company',
                    processingAction: null,
                    ...(result.code === 'ADMIN_TARGET_CHANGED' ? { pendingAction: null } : {}),
                });
                if (result.code === 'ADMIN_TARGET_CHANGED') this.loadCompanies();
                setTimeout(() => this.setState({ errorMessage: '' }), 3000);
            }
        } catch (error) {
            console.error('Error approving company:', error);
            this.setState({
                errorMessage: 'Failed to approve company. Please try again.',
                processingAction: null,
            });
            setTimeout(() => this.setState({ errorMessage: '' }), 3000);
        }
    };

    handleReject = async (company, reason = '') => {
        this.setState({ processingAction: `reject-${company.id}` });
        try {
            const result = await rejectCompany(company.id, reason, {
                expectedStatus: company.status || 'pending',
                ...(company.updatedAt ? { expectedUpdatedAt: (company.updatedAt.toDate?.() || new Date(company.updatedAt)).getTime() } : {}),
            });
            if (result.success) {
                this.setState({
                    successMessage: 'Company rejected successfully!',
                    processingAction: null,
                    pendingAction: null,
                    rejectionReason: '',
                });
                setTimeout(() => this.setState({ successMessage: '' }), 3000);
                this.loadCompanies(); // Refresh the list
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to reject company',
                    processingAction: null,
                    ...(result.code === 'ADMIN_TARGET_CHANGED' ? { pendingAction: null } : {}),
                });
                if (result.code === 'ADMIN_TARGET_CHANGED') this.loadCompanies();
                setTimeout(() => this.setState({ errorMessage: '' }), 3000);
            }
        } catch (error) {
            console.error('Error rejecting company:', error);
            this.setState({
                errorMessage: 'Failed to reject company. Please try again.',
                processingAction: null,
            });
            setTimeout(() => this.setState({ errorMessage: '' }), 3000);
        }
    };

    handleToggleFeatured = async (company) => {
        const newFeaturedStatus = !company.featured;
        this.setState({ processingAction: `featured-${company.id}` });
        try {
            const result = await toggleCompanyFeatured(company.id, newFeaturedStatus, {
                expectedFeatured: Boolean(company.featured),
                ...(company.updatedAt ? { expectedUpdatedAt: (company.updatedAt.toDate?.() || new Date(company.updatedAt)).getTime() } : {}),
            });
            if (result.success) {
                this.setState({
                    successMessage: `Company ${newFeaturedStatus ? 'marked as featured' : 'removed from featured'} successfully!`,
                    processingAction: null,
                    pendingAction: null,
                    rejectionReason: '',
                });
                setTimeout(() => this.setState({ successMessage: '' }), 3000);
                this.loadCompanies(); // Refresh the list
            } else {
                this.setState({
                    errorMessage: result.error || 'Failed to update featured status',
                    processingAction: null,
                    ...(result.code === 'ADMIN_TARGET_CHANGED' ? { pendingAction: null } : {}),
                });
                if (result.code === 'ADMIN_TARGET_CHANGED') this.loadCompanies();
                setTimeout(() => this.setState({ errorMessage: '' }), 3000);
            }
        } catch (error) {
            console.error('Error updating featured status:', error);
            this.setState({
                errorMessage: 'Failed to update featured status. Please try again.',
                processingAction: null,
            });
            setTimeout(() => this.setState({ errorMessage: '' }), 3000);
        }
    };

    requestCompanyAction = (company, action) => {
        this.setState({ pendingAction: { company, action }, rejectionReason: '' });
    };

    confirmCompanyAction = async () => {
        const pending = this.state.pendingAction;
        if (!pending) return;
        if (pending.action === 'reject' && !this.state.rejectionReason.trim()) {
            this.setState({ errorMessage: 'A reason is required when rejecting or revoking a company.' });
            return;
        }
        if (pending.action === 'approve') await this.handleApprove(pending.company);
        else if (pending.action === 'reject') await this.handleReject(pending.company, this.state.rejectionReason.trim());
        else await this.handleToggleFeatured(pending.company);
    };

    toggleAddModal = () => {
        this.setState(prevState => ({ isAddModalOpen: !prevState.isAddModalOpen }));
    };

    handleShowToast = (type, message) => {
        if (type === 'success') {
            this.setState({ successMessage: message });
            this.loadCompanies();
        } else {
            this.setState({ errorMessage: message });
        }
    };

    toggleExpandRow = (companyId) => {
        this.setState((prevState) => ({
            expandedRow: prevState.expandedRow === companyId ? null : companyId,
        }));
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
                icon: FaCheckCircle,
                label: 'Approved',
            },
            rejected: {
                bg: 'bg-red-100',
                text: 'text-red-700',
                icon: FaTimesCircle,
                label: 'Rejected',
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

    getFilteredCompanies = () => {
        let filtered = this.state.companies;

        // Filter by status
        if (this.state.filterStatus !== 'all') {
            filtered = filtered.filter((company) => company.status === this.state.filterStatus);
        }

        // Filter by search term
        if (this.state.searchTerm) {
            const searchLower = this.state.searchTerm.toLowerCase();
            filtered = filtered.filter(
                (company) =>
                    company.name?.toLowerCase().includes(searchLower) ||
                    company.industry?.toLowerCase().includes(searchLower) ||
                    company.location?.toLowerCase().includes(searchLower) ||
                    company.website?.toLowerCase().includes(searchLower)
            );
        }

        return filtered;
    };

    formatDate = (date) => {
        if (!date) return 'N/A';
        let dateObj;
        try { dateObj = date.toDate ? date.toDate() : new Date(date); } catch { return 'N/A'; }
        if (!Number.isFinite(dateObj.getTime())) return 'N/A';
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
        const filteredCompanies = this.getFilteredCompanies();
        const companyCount = filteredCompanies.length;
        const pendingCount = this.state.companies.filter((company) => company.status === 'pending').length;

        if (loading) {
            return (
                <div className="min-h-screen bg-slate-50 px-4 py-6">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <p className="text-slate-600">Loading companies...</p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-slate-50 px-4 py-6">
                {this.state.pendingAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="presentation" onKeyDown={event => { if (event.key === 'Escape' && !processingAction) this.setState({ pendingAction: null, rejectionReason: '' }); }}>
                        <div role="alertdialog" aria-modal="true" aria-labelledby="company-action-title" aria-describedby="company-action-message" className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
                            <h2 id="company-action-title" className="text-lg font-bold text-slate-900">{this.state.pendingAction.action === 'approve' ? 'Approve company?' : this.state.pendingAction.action === 'reject' ? 'Reject or revoke company?' : this.state.pendingAction.company.featured ? 'Remove featured company?' : 'Feature company?'}</h2>
                            <p id="company-action-message" className="mt-2 text-sm text-slate-600">Target: {this.state.pendingAction.company.name || this.state.pendingAction.company.id}. The loaded state will be verified and the change audited.</p>
                            {this.state.pendingAction.action === 'reject' && <div className="mt-4"><label htmlFor="company-rejection-reason" className="text-sm font-medium text-slate-700">Reason</label><textarea id="company-rejection-reason" autoFocus required maxLength={500} rows={3} value={this.state.rejectionReason} onChange={event => this.setState({ rejectionReason: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" /></div>}
                            <div className="mt-6 flex justify-end gap-3"><button type="button" autoFocus={this.state.pendingAction.action !== 'reject'} onClick={() => this.setState({ pendingAction: null, rejectionReason: '' })} disabled={Boolean(processingAction)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="button" onClick={this.confirmCompanyAction} disabled={Boolean(processingAction)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{processingAction ? 'Applying…' : 'Confirm change'}</button></div>
                        </div>
                    </div>
                )}

                {/* Success/Error Messages */}
                {successMessage && (
                    <div role="status" aria-live="polite" className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg">
                        <div className="flex items-center">
                            <FaCheck className="w-4 h-4 mr-2" />
                            {successMessage}
                        </div>
                    </div>
                )}

                {errorMessage && (
                    <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
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
                            <h1 className="text-2xl font-bold text-slate-800">Company Management</h1>
                            <div className="flex items-center mt-1 text-sm text-slate-500">
                                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
                                <span>{companyCount} total companies</span>
                                {pendingCount > 0 && (
                                    <>
                                        <span className="mx-2">•</span>
                                        <span className="text-yellow-600 font-medium">{pendingCount} pending review</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={this.toggleAddModal}
                                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
                            >
                                <FaPlus className="w-3 h-3 mr-2" />
                                Register Company
                            </button>
                            <div className="text-xs text-slate-400 font-mono">{new Date().toLocaleDateString()}</div>
                        </div>
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
                                    placeholder="Search by company name, industry, location, or website..."
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
                                    <option value="rejected">Rejected</option>
                                </select>
                                <FaChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3 h-3 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Companies List */}
                {filteredCompanies.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 mb-4">
                                <FaInbox className="w-6 h-6 text-slate-400" />
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 mb-1">No Companies Found</h3>
                            <p className="text-xs text-slate-500">
                                {this.state.companies.length === 0 ? 'No companies have been submitted yet.' : 'No companies match your current filters.'}
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
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Industry</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Location</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Submitted</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Status</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {filteredCompanies.map((company) => (
                                        <React.Fragment key={company.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                                            {sanitizeImageUrl(company.companyImage) ? (
                                                                <img
                                                                    src={sanitizeImageUrl(company.companyImage)}
                                                                    alt={company.name}
                                                                    className="w-6 h-6 object-contain rounded"
                                                                    onError={(e) => {
                                                                        e.target.style.display = 'none';
                                                                        e.target.nextSibling.style.display = 'block';
                                                                    }}
                                                                />
                                                            ) : null}
                                                            <FaBuilding className="w-4 h-4 text-blue-600" style={{ display: sanitizeImageUrl(company.companyImage) ? 'none' : 'block' }} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{company.name || 'N/A'}</p>
                                                            <p className="text-xs text-slate-500">{company.size || 'Size not specified'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-slate-600">{company.industry || 'N/A'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-slate-600">{company.location || 'N/A'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center text-sm text-slate-600">
                                                        <FaCalendar className="w-3 h-3 mr-2 text-slate-400" />
                                                        <span className="text-xs">{this.formatDate(company.createdAt)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">{this.getStatusBadge(company.status)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end space-x-2">
                                                        <button
                                                            onClick={() => this.toggleExpandRow(company.id)}
                                                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 transition-colors">
                                                            <FaEye className="w-3 h-3" />
                                                            <span className="text-xs font-medium">{expandedRow === company.id ? 'Hide' : 'View'}</span>
                                                            {expandedRow === company.id ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                                                        </button>

                                                        {/* Show approve button only for pending companies */}
                                                        {company.status === 'pending' && (
                                                            <button
                                                                onClick={() => this.requestCompanyAction(company, 'approve')}
                                                                disabled={processingAction === `approve-${company.id}`}
                                                                className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50">
                                                                <FaCheck className="w-3 h-3" />
                                                                <span className="text-xs font-medium">{processingAction === `approve-${company.id}` ? 'Approving...' : 'Approve'}</span>
                                                            </button>
                                                        )}

                                                        {/* Show reject button for pending and approved companies */}
                                                        {(company.status === 'pending' || company.status === 'approved') && (
                                                            <button
                                                                onClick={() => this.requestCompanyAction(company, 'reject')}
                                                                disabled={processingAction === `reject-${company.id}`}
                                                                className="flex items-center space-x-1 text-red-600 hover:text-red-700 transition-colors disabled:opacity-50">
                                                                <FaTimes className="w-3 h-3" />
                                                                <span className="text-xs font-medium">
                                                                    {processingAction === `reject-${company.id}`
                                                                        ? 'Rejecting...'
                                                                        : company.status === 'approved'
                                                                        ? 'Revoke'
                                                                        : 'Reject'}
                                                                </span>
                                                            </button>
                                                        )}

                                                        {/* Show featured toggle button for approved companies */}
                                                        {company.status === 'approved' && (
                                                            <button
                                                                onClick={() => this.requestCompanyAction(company, 'featured')}
                                                                disabled={processingAction === `featured-${company.id}`}
                                                                className={`flex items-center space-x-1 transition-colors disabled:opacity-50 ${
                                                                    company.featured 
                                                                        ? 'text-yellow-600 hover:text-yellow-700' 
                                                                        : 'text-gray-600 hover:text-yellow-600'
                                                                }`}>
                                                                <FaStar className={`w-3 h-3 ${company.featured ? 'text-yellow-500' : 'text-gray-400'}`} />
                                                                <span className="text-xs font-medium">
                                                                    {processingAction === `featured-${company.id}`
                                                                        ? (company.featured ? 'Removing...' : 'Setting...')
                                                                        : (company.featured ? 'Unfeature' : 'Feature')}
                                                                </span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded Row Details */}
                                            {expandedRow === company.id && (
                                                <tr>
                                                    <td colSpan="6" className="px-4 py-4 bg-slate-50">
                                                        <div className="max-w-full overflow-hidden">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                                {/* Company Information */}
                                                                <div className="space-y-3 min-w-0">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Company Details</h4>
                                                                    <div className="space-y-2 text-xs">
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaGlobe className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Website:</span>
                                                                                <p className="text-slate-700 break-words">{company.website || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaMapMarkerAlt className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Address:</span>
                                                                                <p className="text-slate-700 break-words">{company.address || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaUsers className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Company Size:</span>
                                                                                <p className="text-slate-700">{company.size || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        {sanitizeImageUrl(company.companyImage) && (
                                                                            <div className="flex items-start space-x-2">
                                                                                <FaImage className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                                <div className="min-w-0 flex-1">
                                                                                    <span className="text-slate-500">Logo:</span>
                                                                                    <div className="mt-1">
                                                                                        <img
                                                                                            src={sanitizeImageUrl(company.companyImage)}
                                                                                            alt={`${company.name} logo`}
                                                                                            className="w-16 h-16 object-contain border border-slate-200 rounded-md bg-white shadow-sm"
                                                                                            onError={(e) => {
                                                                                                e.target.style.display = 'none';
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Contact Information */}
                                                                <div className="space-y-3 min-w-0">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Contact Information</h4>
                                                                    <div className="space-y-2 text-xs">
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaEnvelope className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Email:</span>
                                                                                <p className="text-slate-700 break-words">{company.email || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-start space-x-2">
                                                                            <FaPhone className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                                                            <div className="min-w-0 flex-1">
                                                                                <span className="text-slate-500">Phone:</span>
                                                                                <p className="text-slate-700">{company.phone || 'N/A'}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Company Statistics */}
                                                                <div className="space-y-3 min-w-0">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Company Statistics</h4>
                                                                    <div className="space-y-2 text-xs">
                                                                        {/* `stats` is only absent when the derivation failed. A
                                                                            company with no jobs still gets real zeros, so a missing
                                                                            object means "unknown", not "none". */}
                                                                        <div>
                                                                            <span className="text-slate-500">Total Jobs:</span>
                                                                            <p className="text-slate-700">{company.stats ? company.stats.totalJobs : 'Data unavailable'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Active Jobs:</span>
                                                                            <p className="text-slate-700">{company.stats ? company.stats.activeJobs : 'Data unavailable'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Total Applications:</span>
                                                                            <p className="text-slate-700">{company.stats ? company.stats.totalApplications : 'Data unavailable'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-slate-500">Last Job Posted:</span>
                                                                            <p className="text-slate-700">{!company.stats ? 'Data unavailable' : company.stats.lastJobPosted ? this.formatDate(company.stats.lastJobPosted) : 'Never'}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Company Description */}
                                                            {company.description && (
                                                                <div className="mt-6 space-y-3">
                                                                    <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1">Company Description</h4>
                                                                    <p className="text-xs text-slate-700 break-words max-h-20 overflow-y-auto bg-white p-3 rounded border border-slate-200">
                                                                        {company.description}
                                                                    </p>
                                                                </div>
                                                            )}
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
                
                <AddCompanyModal
                    isOpen={this.state.isAddModalOpen}
                    onClose={this.toggleAddModal}
                    showToast={this.handleShowToast}
                    t={(k) => k}
                />
            </div>
        );
    }
}

export default CompanyManagement;
