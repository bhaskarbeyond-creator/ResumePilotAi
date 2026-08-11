import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import {
    FaBuilding,
    FaSearch,
    FaFilter,
    FaCalendar,
    FaGlobe,
    FaMapMarkerAlt,
    FaEnvelope,
    FaPhone,
    FaPlus,
    FaEdit,
    FaTrash,
    FaExternalLinkAlt,
    FaCheckCircle,
    FaClock,
    FaTimesCircle,
    FaExclamationTriangle,
    FaInfoCircle,
    FaUsers,
    FaIndustry,
    FaChevronDown,
    FaChevronUp,
    FaEye,
    FaImage,
} from 'react-icons/fa';
import { getEmployerCompanies, updateCompany, deleteCompany } from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';
import AddCompanyModal from './AddCompanyModal';

const CompaniesManagement = ({ showToast, sidebarCollapsed, t }) => {
    const user = useContext(AuthContext);
    const [companies, setCompanies] = useState([]);
    const [filteredCompanies, setFilteredCompanies] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [expandedCompany, setExpandedCompany] = useState(null);
    const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);

    useEffect(() => {
        loadCompanies();
    }, []);

    useEffect(() => {
        filterAndSortCompanies();
    }, [companies, searchTerm, statusFilter]);

    const loadCompanies = async () => {
        if (!user?.uid) {
            console.log('❌ No user found, cannot load companies');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            console.log('🔍 Loading companies for employer:', user.uid);
            const employerCompanies = await getEmployerCompanies(user.uid);

            console.log('📊 Raw companies from database:', employerCompanies);
            console.log('📊 Number of companies found:', employerCompanies ? employerCompanies.length : 0);

            if (employerCompanies && employerCompanies.length > 0) {
                const transformedCompanies = employerCompanies.map((company) => ({
                    id: company.id,
                    name: company.name || 'Unnamed Company',
                    website: company.website || '',
                    companyImage: company.companyImage || '',
                    description: company.description || 'No description provided',
                    industry: company.industry || 'Not specified',
                    size: company.size || 'Not specified',
                    location: company.location || 'Location not specified',
                    address: company.address || '',
                    phone: company.phone || '',
                    email: company.email || '',
                    status: company.status || 'pending',
                    createdAt: company.createdAt,
                    updatedAt: company.updatedAt,
                    approvedAt: company.approvedAt,
                    rejectedAt: company.rejectedAt,
                    rejectionReason: company.rejectionReason || '',
                    stats: company.stats || {
                        totalJobs: 0,
                        activeJobs: 0,
                        expiredJobs: 0,
                        totalApplications: 0,
                        lastJobPosted: null,
                    },
                    ...company,
                }));

                console.log('✅ Transformed companies:', transformedCompanies);
                setCompanies(transformedCompanies);
            } else {
                console.log('❌ No companies found for employer:', user.uid);
                setCompanies([]);
            }
        } catch (error) {
            console.error('❌ Error loading companies:', error);
            showToast && showToast('error', 'Error', 'Failed to load companies');
            setCompanies([]);
        } finally {
            setLoading(false);
        }
    };

    const filterAndSortCompanies = () => {
        let filtered = [...companies];

        // Filter by search term
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (company) =>
                    company.name.toLowerCase().includes(searchLower) ||
                    company.industry.toLowerCase().includes(searchLower) ||
                    company.location.toLowerCase().includes(searchLower)
            );
        }

        // Filter by status
        if (statusFilter !== 'all') {
            filtered = filtered.filter((company) => company.status === statusFilter);
        }

        // Sort by creation date (newest first)
        filtered.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
            const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
            return new Date(dateB) - new Date(dateA);
        });

        setFilteredCompanies(filtered);
    };

    const toggleCompanyExpansion = (companyId) => {
        setExpandedCompany(expandedCompany === companyId ? null : companyId);
    };

    const handleDeleteCompany = async (companyId, companyName) => {
        if (!window.confirm(`Are you sure you want to delete "${companyName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const result = await deleteCompany(companyId);
            if (result.success) {
                showToast && showToast('success', 'Success', 'Company deleted successfully');
                loadCompanies(); // Reload the list
            } else {
                showToast && showToast('error', 'Error', result.error || 'Failed to delete company');
            }
        } catch (error) {
            console.error('Error deleting company:', error);
            showToast && showToast('error', 'Error', 'An unexpected error occurred');
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pending: {
                bg: 'bg-yellow-50',
                text: 'text-yellow-700',
                border: 'border-yellow-200',
                icon: FaClock,
                label: 'Pending Review',
                description: 'Your company is being reviewed by our team',
            },
            approved: {
                bg: 'bg-emerald-50',
                text: 'text-emerald-700',
                border: 'border-emerald-200',
                icon: FaCheckCircle,
                label: 'Approved',
                description: 'Company is approved and can be used for job postings',
            },
            rejected: {
                bg: 'bg-red-50',
                text: 'text-red-700',
                border: 'border-red-200',
                icon: FaTimesCircle,
                label: 'Rejected',
                description: 'Company was rejected and needs revision',
            },
        };

        const config = statusConfig[status] || statusConfig.pending;
        const IconComponent = config.icon;

        return {
            badge: (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium ${config.bg} ${config.text} ${config.border}`}>
                    <IconComponent className="w-3 h-3 mr-1.5" />
                    {config.label}
                </span>
            ),
            config,
        };
    };

    const formatDate = (dateInput) => {
        if (!dateInput) return 'Date not specified';

        let date;
        if (dateInput.toDate && typeof dateInput.toDate === 'function') {
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
                            <p className="text-slate-600 text-sm font-medium">{t('JobsUpdate.CompaniesManagement.loading.companies', 'Loading your companies...')}</p>
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
                                <FaBuilding className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight truncate">
                                    {t('JobsUpdate.CompaniesManagement.header.title', 'My Companies')}
                                </h1>
                                <p className="text-slate-600 text-sm mt-0.5">
                                    {t('JobsUpdate.CompaniesManagement.header.subtitle', 'Manage your companies and track their approval status')}
                                </p>
                            </div>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium shadow-sm"
                                onClick={() => setShowAddCompanyModal(true)}
                            >
                                <FaPlus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{t('JobsUpdate.CompaniesManagement.buttons.addCompany', 'Add Company')}</span>
                                <span className="sm:hidden">{t('JobsUpdate.CompaniesManagement.buttons.add', 'Add')}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                        <FaInfoCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-700">
                            <p className="font-medium mb-1">{t('JobsUpdate.CompaniesManagement.infoBanner.title', 'Company Approval Process')}</p>
                            <p>
                                {t('JobsUpdate.CompaniesManagement.infoBanner.message', 'All companies must be approved before they can be used for job postings. Only approved companies will appear in your job posting form.')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.CompaniesManagement.stats.totalCompanies', 'Total Companies')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">{companies.length}</p>
                            </div>
                            <div className="p-2 bg-slate-100 rounded-md">
                                <FaBuilding className="w-4 h-4 text-slate-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.CompaniesManagement.stats.approved', 'Approved')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">
                                    {companies.filter((company) => company.status === 'approved').length}
                                </p>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded-md">
                                <FaCheckCircle className="w-4 h-4 text-emerald-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.CompaniesManagement.stats.pending', 'Pending')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">
                                    {companies.filter((company) => company.status === 'pending').length}
                                </p>
                            </div>
                            <div className="p-2 bg-yellow-50 rounded-md">
                                <FaClock className="w-4 h-4 text-yellow-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t('JobsUpdate.CompaniesManagement.stats.rejected', 'Rejected')}</p>
                                <p className="text-xl font-semibold text-slate-900 mt-1">
                                    {companies.filter((company) => company.status === 'rejected').length}
                                </p>
                            </div>
                            <div className="p-2 bg-red-50 rounded-md">
                                <FaTimesCircle className="w-4 h-4 text-red-600" />
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
                                    placeholder={t('JobsUpdate.CompaniesManagement.search.placeholder', 'Search companies by name, industry, location...')}
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
                                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white"
                            >
                                <option value="all">{t('JobsUpdate.CompaniesManagement.filters.allStatus', 'All Status')}</option>
                                <option value="pending">{t('JobsUpdate.CompaniesManagement.filters.pending', 'Pending')}</option>
                                <option value="approved">{t('JobsUpdate.CompaniesManagement.filters.approved', 'Approved')}</option>
                                <option value="rejected">{t('JobsUpdate.CompaniesManagement.filters.rejected', 'Rejected')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Companies List */}
                {filteredCompanies.length === 0 ? (
                    <div className="bg-white rounded-lg p-8 border border-slate-200 text-center">
                        <FaBuilding className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                        <h3 className="text-base font-medium text-slate-900 mb-2">{t('JobsUpdate.CompaniesManagement.emptyState.title', 'No companies found')}</h3>
                        <p className="text-slate-600 text-sm mb-4 max-w-md mx-auto">
                            {companies.length === 0
                                ? t('JobsUpdate.CompaniesManagement.emptyState.noCompanies', "You haven't added any companies yet. Add your first company to get started!")
                                : t('JobsUpdate.CompaniesManagement.emptyState.noMatches', 'No companies match your current filters. Try adjusting your search criteria.')}
                        </p>
                        <button
                            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-md flex items-center gap-2 mx-auto transition-colors text-sm font-medium"
                            onClick={() => setShowAddCompanyModal(true)}
                        >
                            <FaPlus className="w-3.5 h-3.5" />
                            {t('JobsUpdate.CompaniesManagement.emptyState.addFirstCompany', 'Add Your First Company')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredCompanies.map((company) => {
                            const { badge, config } = getStatusBadge(company.status);
                            return (
                                <motion.div
                                    key={company.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-slate-300 transition-all duration-200"
                                >
                                    <div className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    {/* Company Logo */}
                                                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                        {company.companyImage ? (
                                                            <img
                                                                src={company.companyImage}
                                                                alt={`${company.name} logo`}
                                                                className="w-10 h-10 object-contain rounded"
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                    e.target.nextSibling.style.display = 'flex';
                                                                }}
                                                            />
                                                        ) : null}
                                                        <FaBuilding className="w-6 h-6 text-slate-600" style={{ display: company.companyImage ? 'none' : 'block' }} />
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h3 className="text-base font-medium text-slate-900 truncate">{company.name}</h3>
                                                            {badge}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                                            <div className="flex items-center gap-1">
                                                                <FaIndustry className="w-3 h-3" />
                                                                <span>{company.industry}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <FaUsers className="w-3 h-3" />
                                                                <span>{company.size}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <FaMapMarkerAlt className="w-3 h-3" />
                                                                <span>{company.location}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <FaCalendar className="w-3 h-3" />
                                                                <span>Added {formatDate(company.createdAt)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Status Info */}
                                                <div className="text-xs text-slate-600 mb-2">
                                                    <p>{config.description}</p>
                                                    {company.status === 'rejected' && company.rejectionReason && (
                                                        <p className="text-red-600 mt-1">
                                                            <strong>Reason:</strong> {company.rejectionReason}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                                <button
                                                    onClick={() => toggleCompanyExpansion(company.id)}
                                                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-md hover:bg-slate-50"
                                                >
                                                    {expandedCompany === company.id ? (
                                                        <FaChevronUp className="w-3 h-3" />
                                                    ) : (
                                                        <FaChevronDown className="w-3 h-3" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Company Details */}
                                        {expandedCompany === company.id && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 pt-3 border-t border-slate-200"
                                            >
                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                    <div className="lg:col-span-2">
                                                        <h4 className="text-sm font-medium text-slate-900 mb-2">{t('JobsUpdate.CompaniesManagement.companyDetails.description', 'Company Description')}</h4>
                                                        <p className="text-slate-600 text-xs leading-relaxed mb-3">{company.description}</p>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                                            {company.website && (
                                                                <div className="flex items-center gap-2">
                                                                    <FaGlobe className="w-3 h-3 text-slate-500" />
                                                                    <a
                                                                        href={company.website}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                                                    >
                                                                        {t('JobsUpdate.CompaniesManagement.companyDetails.visitWebsite', 'Visit Website')}
                                                                        <FaExternalLinkAlt className="w-2.5 h-2.5" />
                                                                    </a>
                                                                </div>
                                                            )}
                                                            {company.email && (
                                                                <div className="flex items-center gap-2">
                                                                    <FaEnvelope className="w-3 h-3 text-slate-500" />
                                                                    <span className="text-slate-600">{company.email}</span>
                                                                </div>
                                                            )}
                                                            {company.phone && (
                                                                <div className="flex items-center gap-2">
                                                                    <FaPhone className="w-3 h-3 text-slate-500" />
                                                                    <span className="text-slate-600">{company.phone}</span>
                                                                </div>
                                                            )}
                                                            {company.address && (
                                                                <div className="flex items-center gap-2">
                                                                    <FaMapMarkerAlt className="w-3 h-3 text-slate-500" />
                                                                    <span className="text-slate-600">{company.address}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <button className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200">
                                                            <FaEdit className="w-3 h-3" />
                                                            {t('JobsUpdate.CompaniesManagement.actions.editCompany', 'Edit Company')}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteCompany(company.id, company.name)}
                                                            className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors text-xs font-medium border border-red-200"
                                                        >
                                                            <FaTrash className="w-3 h-3" />
                                                            {t('JobsUpdate.CompaniesManagement.actions.delete', 'Delete')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Add Company Modal */}
                <AddCompanyModal
                    isOpen={showAddCompanyModal}
                    onClose={() => {
                        setShowAddCompanyModal(false);
                        loadCompanies(); // Reload companies after adding
                    }}
                    showToast={showToast}
                />
            </div>
        </div>
    );
};

export default withTranslation('common')(CompaniesManagement);
