import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import {
    FaBriefcase,
    FaMapMarkerAlt,
    FaDollarSign,
    FaFileAlt,
    FaSave,
    FaTimes,
    FaPlus,
    FaTrash,
    FaSpinner,
    FaExclamationTriangle,
} from 'react-icons/fa';
import { AuthContext } from '../../../main';
import { updateJobPosting, getApprovedEmployerCompanies } from '../../../firestore/dbOperations';
import CustomLocationAutocomplete from '../../JobsListings/CustomLocationAutocomplete';

const EditJobModal = ({ isOpen, onClose, job, onJobUpdated, showToast, t }) => {
    const user = useContext(AuthContext);

    const [formData, setFormData] = useState({
        jobTitle: '',
        selectedCompanyId: '',
        location: '',
        country: '',
        jobType: 'full-time',
        workMode: 'on-site',
        experience: 'entry-level',
        minSalary: '',
        maxSalary: '',
        description: '',
        requirements: [''],
        benefits: [''],
        deadline: '',
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [loadingCompanies, setLoadingCompanies] = useState(false);

    // Load form data when job prop changes
    useEffect(() => {
        if (job && isOpen) {
            setFormData({
                jobTitle: job.title || '',
                selectedCompanyId: job.companyId || '',
                location: job.location || '',
                country: job.country || '',
                jobType: job.jobType || 'full-time',
                workMode: job.workMode || 'on-site',
                experience: job.experienceLevel || 'entry-level',
                minSalary: job.minSalary ? job.minSalary.toString() : '',
                maxSalary: job.maxSalary ? job.maxSalary.toString() : '',
                description: job.description || '',
                requirements: job.requirements && job.requirements.length > 0 ? job.requirements : [''],
                benefits: job.benefits && job.benefits.length > 0 ? job.benefits : [''],
                deadline: job.deadline ? formatDateForInput(job.deadline) : '',
            });
            loadCompanies();
        }
    }, [job, isOpen]);

    // Prevent background scrolling when modal is open
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

    const formatDateForInput = (date) => {
        if (!date) return '';
        
        let dateObj;
        if (date.toDate && typeof date.toDate === 'function') {
            dateObj = date.toDate();
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            dateObj = new Date(date);
        }
        
        return dateObj.toISOString().split('T')[0];
    };

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    // Parse location from autocomplete (e.g., "San Francisco, CA, United States")
    const handleLocationChange = (locationString) => {
        const parts = locationString.split(',').map((part) => part.trim());

        if (parts.length >= 3) {
            // Format: "City, State, Country"
            const city = parts[0];
            const state = parts[1];
            const country = parts[2];

            setFormData((prev) => ({
                ...prev,
                location: `${city}, ${state}`,
                country: country,
            }));
        } else if (parts.length === 2) {
            // Format: "City, Country"
            const city = parts[0];
            const country = parts[1];

            setFormData((prev) => ({
                ...prev,
                location: city,
                country: country,
            }));
        } else {
            // Single value - treat as location
            setFormData((prev) => ({
                ...prev,
                location: locationString,
                country: '',
            }));
        }
    };

    const handleArrayChange = (field, index, value) => {
        const updatedArray = [...formData[field]];
        updatedArray[index] = value;
        setFormData((prev) => ({
            ...prev,
            [field]: updatedArray,
        }));
    };

    const addArrayItem = (field) => {
        setFormData((prev) => ({
            ...prev,
            [field]: [...prev[field], ''],
        }));
    };

    const removeArrayItem = (field, index) => {
        if (formData[field].length > 1) {
            const updatedArray = formData[field].filter((_, i) => i !== index);
            setFormData((prev) => ({
                ...prev,
                [field]: updatedArray,
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (!user) {
                throw new Error('User not authenticated');
            }

            console.log('Updating job with form data:', formData);

            // Validate that a company is selected
            if (!formData.selectedCompanyId) {
                throw new Error('Please select a company from your approved companies');
            }

            // Find the selected company details
            const selectedCompany = companies.find(c => c.id === formData.selectedCompanyId);
            if (!selectedCompany) {
                throw new Error('Selected company not found');
            }

            // Prepare job data for database with company information
            const jobData = {
                title: formData.jobTitle.trim(),
                companyId: formData.selectedCompanyId,
                // Include company details for job listing display
                company: selectedCompany.name,
                companySize: selectedCompany.size,
                companyIndustry: selectedCompany.industry,
                companyWebsite: selectedCompany.website,
                companyImage: selectedCompany.companyImage || '',
                companyDescription: selectedCompany.description,
                location: formData.location.trim(),
                country: formData.country.trim(),
                jobType: formData.jobType,
                workMode: formData.workMode,
                experienceLevel: formData.experience,
                minSalary: formData.minSalary ? parseInt(formData.minSalary) : null,
                maxSalary: formData.maxSalary ? parseInt(formData.maxSalary) : null,
                description: formData.description.trim(),
                requirements: formData.requirements.filter((req) => req.trim() !== ''),
                benefits: formData.benefits.filter((benefit) => benefit.trim() !== ''),
                deadline: formData.deadline ? new Date(formData.deadline) : null,
                status: 'pending', // Set to pending when edited for re-approval
            };

            console.log('Processed job data:', jobData);

            // Update job posting in database
            const result = await updateJobPosting(job.id, jobData);

            if (result.success) {
                console.log('✅ Job updated successfully');
                setShowSuccess(true);

                // Call callback if provided
                if (onJobUpdated) {
                    onJobUpdated({ ...jobData, id: job.id });
                }

                if (showToast) {
                    showToast('success', 'Success', 'Job updated successfully! It is now pending approval.');
                }

                // Close modal after success
                setTimeout(() => {
                    setShowSuccess(false);
                    onClose();
                }, 2000);
            } else {
                throw new Error(result.error || 'Failed to update job posting');
            }
        } catch (error) {
            console.error('❌ Error updating job posting:', error);
            if (showToast) {
                showToast('error', 'Error', `Failed to update job posting: ${error.message}`);
            } else {
                alert(`Failed to update job posting: ${error.message}`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Load approved companies for the employer
    const loadCompanies = async () => {
        if (!user?.uid) return;
        
        setLoadingCompanies(true);
        try {
            console.log('Loading approved companies for employer:', user.uid);
            const approvedCompanies = await getApprovedEmployerCompanies(user.uid);
            console.log('Found approved companies:', approvedCompanies.length);
            setCompanies(approvedCompanies);
        } catch (error) {
            console.error('Error loading companies:', error);
            setCompanies([]);
        } finally {
            setLoadingCompanies(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            onClose();
        }
    };

    const modalVariants = {
        hidden: { opacity: 0, scale: 0.95 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: {
                type: 'spring',
                damping: 25,
                stiffness: 300,
                duration: 0.3,
            },
        },
        exit: {
            opacity: 0,
            scale: 0.95,
            transition: {
                type: 'tween',
                ease: 'easeInOut',
                duration: 0.2,
            },
        },
    };

    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { duration: 0.3 },
        },
        exit: {
            opacity: 0,
            transition: { duration: 0.3 },
        },
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4" 
                variants={backdropVariants} 
                initial="hidden" 
                animate="visible" 
                exit="exit" 
                onClick={handleClose}
            >
                <motion.div
                    className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200"
                    variants={modalVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        maxHeight: '90vh',
                        height: '90vh',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <div className="flex flex-col h-full">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                            <div className="flex items-center justify-between px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                        <FaBriefcase className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-lg font-semibold">{t('JobsUpdate.EditJobModal.header.title', 'Edit Job Posting')}</h1>
                                        <p className="text-sm text-blue-100">{t('JobsUpdate.EditJobModal.header.subtitle', 'Make changes to your job posting')}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleClose}
                                    disabled={isSubmitting}
                                    className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                                >
                                    <FaTimes className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div 
                            className="flex-1 overflow-y-auto bg-gray-50"
                            style={{
                                minHeight: 0,
                                maxHeight: 'calc(90vh - 140px)', // Account for header and footer
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#3b82f6 #e5e7eb'
                            }}
                        >
                            <div className="p-6 space-y-6">
                                {/* Success Message */}
                                {showSuccess && (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                                        <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <FaSave className="w-3 h-3 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-emerald-800 text-sm">{t('JobsUpdate.EditJobModal.success.title', 'Job Updated Successfully!')}</h3>
                                            <p className="text-xs text-emerald-600 mt-1">{t('JobsUpdate.EditJobModal.success.message', 'Your job posting has been updated and is now pending approval.')}</p>
                                        </div>
                                    </div>
                                )}

                                <form id="edit-job-form" onSubmit={handleSubmit} className="space-y-6">
                                    {/* Job Basics */}
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <FaBriefcase className="w-4 h-4 text-blue-600" />
                                                <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.EditJobModal.sections.jobDetails', 'Job Details')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.jobTitle', 'Job Title *')}</label>
                                                    <input
                                                        type="text"
                                                        value={formData.jobTitle}
                                                        onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                                                        placeholder={t('JobsUpdate.EditJobModal.placeholders.jobTitle', 'Senior Software Engineer')}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.selectCompany', 'Select Company *')}</label>
                                                    {loadingCompanies ? (
                                                        <div className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-md bg-gray-50">
                                                            <FaSpinner className="w-4 h-4 animate-spin text-blue-600" />
                                                            <span className="text-sm text-gray-600">{t('JobsUpdate.EditJobModal.loading.companies', 'Loading companies...')}</span>
                                                        </div>
                                                    ) : companies.length === 0 ? (
                                                        <div className="text-sm text-red-600 p-3 bg-red-50 border border-red-200 rounded-md">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <FaExclamationTriangle className="w-4 h-4" />
                                                                <span className="font-medium">{t('JobsUpdate.EditJobModal.errors.noCompanies.title', 'No approved companies found')}</span>
                                                            </div>
                                                            <p className="text-xs">{t('JobsUpdate.EditJobModal.errors.noCompanies.message', 'You need to add and get approval for at least one company before editing jobs.')}</p>
                                                        </div>
                                                    ) : (
                                                        <select
                                                            value={formData.selectedCompanyId}
                                                            onChange={(e) => handleInputChange('selectedCompanyId', e.target.value)}
                                                            className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                            required
                                                        >
                                                            <option value="">{t('JobsUpdate.EditJobModal.dropdowns.selectCompany', 'Select a company')}</option>
                                                            {companies.map((company) => (
                                                                <option key={company.id} value={company.id}>
                                                                    {company.name} ({company.industry})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Location & Job Type */}
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <FaMapMarkerAlt className="w-4 h-4 text-blue-600" />
                                                <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.EditJobModal.sections.locationType', 'Location & Type')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.jobLocation', 'Job Location *')}</label>
                                                <CustomLocationAutocomplete
                                                    value={formData.location && formData.country ? `${formData.location}, ${formData.country}` : formData.location}
                                                    onChange={handleLocationChange}
                                                    placeholder={t('JobsUpdate.EditJobModal.placeholders.location', 'Start typing city, state, country...')}
                                                    className="w-full"
                                                />
                                                {(formData.location || formData.country) && (
                                                    <div className="mt-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                                                        <span className="font-semibold">{t('JobsUpdate.EditJobModal.labels.location', 'Location:')} </span> {formData.location || t('JobsUpdate.EditJobModal.values.notSet', 'Not set')}
                                                        {formData.country && (
                                                            <span>
                                                                {' '}
                                                                • <span className="font-semibold">{t('JobsUpdate.EditJobModal.labels.country', 'Country:')} </span> {formData.country}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.jobType', 'Job Type')}</label>
                                                    <select
                                                        value={formData.jobType}
                                                        onChange={(e) => handleInputChange('jobType', e.target.value)}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                    >
                                                        <option value="full-time">{t('JobsUpdate.EditJobModal.options.jobType.fullTime', 'Full-time')}</option>
                                                        <option value="part-time">{t('JobsUpdate.EditJobModal.options.jobType.partTime', 'Part-time')}</option>
                                                        <option value="contract">{t('JobsUpdate.EditJobModal.options.jobType.contract', 'Contract')}</option>
                                                        <option value="freelance">{t('JobsUpdate.EditJobModal.options.jobType.freelance', 'Freelance')}</option>
                                                        <option value="internship">{t('JobsUpdate.EditJobModal.options.jobType.internship', 'Internship')}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.workMode', 'Work Mode')}</label>
                                                    <select
                                                        value={formData.workMode}
                                                        onChange={(e) => handleInputChange('workMode', e.target.value)}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                    >
                                                        <option value="on-site">{t('JobsUpdate.EditJobModal.options.workMode.onSite', 'On-site')}</option>
                                                        <option value="remote">{t('JobsUpdate.EditJobModal.options.workMode.remote', 'Remote')}</option>
                                                        <option value="hybrid">{t('JobsUpdate.EditJobModal.options.workMode.hybrid', 'Hybrid')}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.experienceLevel', 'Experience Level')}</label>
                                                    <select
                                                        value={formData.experience}
                                                        onChange={(e) => handleInputChange('experience', e.target.value)}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                    >
                                                        <option value="entry-level">{t('JobsUpdate.EditJobModal.options.experienceLevel.entryLevel', 'Entry Level')}</option>
                                                        <option value="junior">{t('JobsUpdate.EditJobModal.options.experienceLevel.junior', 'Junior')}</option>
                                                        <option value="mid-level">{t('JobsUpdate.EditJobModal.options.experienceLevel.midLevel', 'Mid Level')}</option>
                                                        <option value="senior">{t('JobsUpdate.EditJobModal.options.experienceLevel.senior', 'Senior')}</option>
                                                        <option value="executive">{t('JobsUpdate.EditJobModal.options.experienceLevel.executive', 'Executive')}</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Compensation & Deadline */}
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <FaDollarSign className="w-4 h-4 text-blue-600" />
                                                <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.EditJobModal.sections.compensationDeadline', 'Compensation & Deadline')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.minSalary', 'Min Salary')}</label>
                                                    <input
                                                        type="number"
                                                        value={formData.minSalary}
                                                        onChange={(e) => handleInputChange('minSalary', e.target.value)}
                                                        placeholder={t('JobsUpdate.EditJobModal.placeholders.minSalary', '80000')}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.maxSalary', 'Max Salary')}</label>
                                                    <input
                                                        type="number"
                                                        value={formData.maxSalary}
                                                        onChange={(e) => handleInputChange('maxSalary', e.target.value)}
                                                        placeholder={t('JobsUpdate.EditJobModal.placeholders.maxSalary', '120000')}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.applicationDeadline', 'Application Deadline')}</label>
                                                    <input
                                                        type="date"
                                                        value={formData.deadline}
                                                        onChange={(e) => handleInputChange('deadline', e.target.value)}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Job Description */}
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <FaFileAlt className="w-4 h-4 text-blue-600" />
                                                <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.EditJobModal.sections.jobDescription', 'Job Description')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.jobDescription', 'Job Description *')}</label>
                                                <textarea
                                                    value={formData.description}
                                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                                    placeholder={t('JobsUpdate.EditJobModal.placeholders.jobDescription', 'Describe the role, responsibilities, and what makes this position exciting...')}
                                                    rows={4}
                                                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Requirements & Benefits */}
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <div className="flex items-center gap-2">
                                                <FaFileAlt className="w-4 h-4 text-blue-600" />
                                                <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.EditJobModal.sections.requirementsBenefits', 'Requirements & Benefits')}</h3>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <div className="grid grid-cols-2 gap-6">
                                                {/* Requirements */}
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.EditJobModal.form.requirements', 'Requirements')}</label>
                                                    <div className="space-y-2">
                                                        {formData.requirements.map((requirement, index) => (
                                                            <div key={index} className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={requirement}
                                                                    onChange={(e) => handleArrayChange('requirements', index, e.target.value)}
                                                                    placeholder={`Requirement ${index + 1}`}
                                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                                />
                                                                {formData.requirements.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeArrayItem('requirements', index)}
                                                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                                                    >
                                                                        <FaTrash className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => addArrayItem('requirements')}
                                                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
                                                        >
                                                            <FaPlus className="w-3 h-3" />
                                                            Add Requirement
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Benefits */}
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-800 mb-2">Benefits</label>
                                                    <div className="space-y-2">
                                                        {formData.benefits.map((benefit, index) => (
                                                            <div key={index} className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={benefit}
                                                                    onChange={(e) => handleArrayChange('benefits', index, e.target.value)}
                                                                    placeholder={`Benefit ${index + 1}`}
                                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                                />
                                                                {formData.benefits.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeArrayItem('benefits', index)}
                                                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                                                    >
                                                                        <FaTrash className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => addArrayItem('benefits')}
                                                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
                                                        >
                                                            <FaPlus className="w-3 h-3" />
                                                            Add Benefit
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="border-t border-gray-200 bg-white px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-600 font-medium">
                                    {t('JobsUpdate.EditJobModal.statusMessage', 'Job will be set to "Pending Approval" after editing')}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        disabled={isSubmitting}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors duration-200 flex items-center gap-2 text-sm disabled:opacity-50 font-medium"
                                    >
                                        <FaTimes className="w-3 h-3" />
                                        Cancel
                                    </button>

                                    <button
                                        form="edit-job-form"
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="bg-blue-600 text-white py-2 px-6 rounded-md font-semibold text-sm hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <FaSpinner className="w-4 h-4 animate-spin" />
                                                Updating Job...
                                            </>
                                        ) : (
                                            <>
                                                <FaSave className="w-4 h-4" />
                                                Update Job Posting
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default withTranslation('common')(EditJobModal);
