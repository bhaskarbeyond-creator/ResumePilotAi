import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    FaBriefcase,
    FaBuilding,
    FaMapMarkerAlt,
    FaDollarSign,
    FaClock,
    FaUsers,
    FaGraduationCap,
    FaFileAlt,
    FaSave,
    FaTimes,
    FaPlus,
    FaTrash,
    FaCheck,
    FaChevronDown,
    FaArrowRight,
    FaSpinner,
    FaUser,
    FaImage,
    FaExclamationTriangle,
} from 'react-icons/fa';
import { AuthContext } from '../../main';
import { checkIsEmployer, submitEmployerApplication, createJobPosting, getApprovedEmployerCompanies } from '../../firestore/dbOperations';
import EmployerApplicationForm from './EmployerApplicationForm';
import CustomLocationAutocomplete from './CustomLocationAutocomplete';
import countries from './countries';

const CreateJobModal = ({ isOpen, onClose, onJobCreated, t }) => {
    const user = useContext(AuthContext);
    const navigate = useNavigate();

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
    const [isEmployer, setIsEmployer] = useState(null); // null = loading, true = employer, false = not employer
    const [showEmployerApplication, setShowEmployerApplication] = useState(false);
    const [employerApplicationSuccess, setEmployerApplicationSuccess] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [loadingCompanies, setLoadingCompanies] = useState(false);

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

    // Check employer status when modal opens
    useEffect(() => {
        if (isOpen && user) {
            checkIsEmployer(user.uid)
                .then((employerStatus) => {
                    setIsEmployer(employerStatus);
                    setShowEmployerApplication(!employerStatus);
                    
                    // Load companies if user is an employer
                    if (employerStatus) {
                        loadCompanies();
                    }
                })
                .catch((error) => {
                    console.error('Error checking employer status:', error);
                    setIsEmployer(false);
                    setShowEmployerApplication(true);
                });
        } else if (isOpen && !user) {
            // User not logged in
            setIsEmployer(false);
            setShowEmployerApplication(true);
        }
    }, [isOpen, user]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
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
            setShowSuccess(false);
        }
    }, [isOpen]);

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

            console.log('Creating job with form data:', formData);

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
                status: 'pending', // Jobs need admin approval before going live
            };

            console.log('Processed job data:', jobData);

            // Create job posting in database
            const result = await createJobPosting(user.uid, jobData);

            if (result.success) {
                console.log('✅ Job created successfully with ID:', result.jobId);
                setShowSuccess(true);

                // Call callback if provided
                if (onJobCreated) {
                    onJobCreated({ ...jobData, id: result.jobId });
                }

                // Close modal after success
                setTimeout(() => {
                    setShowSuccess(false);
                    onClose();
                }, 3000);
            } else {
                throw new Error(result.error || 'Failed to create job posting');
            }
        } catch (error) {
            console.error('❌ Error creating job posting:', error);
            alert(`Failed to create job posting: ${error.message}`);
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

    const handleGoToCompanies = () => {
        navigate('/dashboard/my-companies');
        onClose(); // Close the modal
    };

    const handleEmployerApplicationSubmit = async (applicationData) => {
        if (!user) {
            console.error('User not logged in');
            alert('Please log in to submit an application.');
            return;
        }

        setIsSubmitting(true);
        try {
            console.log('Submitting application for user:', user.uid);
            const result = await submitEmployerApplication(user.uid, applicationData);

            if (result.success) {
                setEmployerApplicationSuccess(true);
                setTimeout(() => {
                    setEmployerApplicationSuccess(false);
                    onClose();
                }, 3000);
            } else {
                console.error('Failed to submit application:', result.error);
                alert(`Failed to submit application: ${result.error}`);
            }
        } catch (error) {
            console.error('Error submitting employer application:', error);
            alert(`Error submitting application: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const modalVariants = {
        hidden: { x: '100%' },
        visible: {
            x: 0,
            transition: {
                type: 'tween',
                ease: [0.25, 0.46, 0.45, 0.94],
                duration: 0.4,
            },
        },
        exit: {
            x: '100%',
            transition: {
                type: 'tween',
                ease: [0.25, 0.46, 0.45, 0.94],
                duration: 0.4,
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

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div className="fixed inset-0 bg-black/50 z-[10001]" variants={backdropVariants} initial="hidden" animate="visible" exit="exit" onClick={handleClose} />

                    {/* Modal */}
                    <motion.div
                        className="fixed top-0 right-0 h-screen bg-white shadow-2xl z-[10002] overflow-hidden w-full lg:w-[600px] xl:w-[700px]"
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="h-full flex flex-col">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                                <div className="flex items-center justify-between px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                            <FaBriefcase className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <h1 className="text-lg font-semibold">{showEmployerApplication ? 'Employer Application' : 'Create Job Posting'}</h1>
                                            <p className="text-sm text-blue-100">{showEmployerApplication ? 'Apply to become an employer' : 'Post a new job opportunity'}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleClose}
                                        disabled={isSubmitting}
                                        className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50">
                                        <FaTimes className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto bg-gray-50">
                                {/* Loading State */}
                                {isEmployer === null && (
                                    <div className="flex items-center justify-center py-20">
                                        <div className="text-center">
                                            <FaSpinner className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                                            <p className="text-gray-600 font-medium">Checking account status...</p>
                                        </div>
                                    </div>
                                )}

                                {/* Employer Application Form */}
                                {showEmployerApplication && isEmployer !== null && (
                                    <div className="p-6">
                                        <EmployerApplicationForm onSubmit={handleEmployerApplicationSubmit} isSubmitting={isSubmitting} showSuccess={employerApplicationSuccess} />
                                    </div>
                                )}

                                {/* Job Creation Form */}
                                {!showEmployerApplication && isEmployer === true && (
                                    <div className="p-6 space-y-6">
                                        {/* Success Message */}
                                        {showSuccess && (
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                                                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <FaCheck className="w-3 h-3 text-white" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-emerald-800 text-sm">Job Submitted Successfully!</h3>
                                                    <p className="text-xs text-emerald-600 mt-1">Your job posting is pending approval and will be reviewed shortly.</p>
                                                </div>
                                            </div>
                                        )}

                                        <form id="create-job-form" onSubmit={handleSubmit} className="space-y-6">
                                            {/* Job Basics */}
                                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                                    <div className="flex items-center gap-2">
                                                        <FaBriefcase className="w-4 h-4 text-blue-600" />
                                                        <h2 className="text-xl font-bold text-gray-900">{t('JobsUpdate.CreateJobModal.title', 'Create New Job Posting')}</h2>
                                                    </div>
                                                    {loadingCompanies ? (
                                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                                            <FaSpinner className="animate-spin" /> {t('JobsUpdate.CreateJobModal.loadingCompanies', 'Loading companies...')}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                                            {t('JobsUpdate.CreateJobModal.selectCompany', 'Select a company to post a job')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-4 space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.jobTitle', 'Job Title')} *</label>
                                                            <input
                                                                type="text"
                                                                value={formData.jobTitle}
                                                                onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                                                                placeholder={t('JobsUpdate.CreateJobModal.placeholders.jobTitle', 'e.g., Senior Product Manager')}
                                                                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                                required
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.company', 'Company')} *</label>
                                                            {loadingCompanies ? (
                                                                <div className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-md bg-gray-50">
                                                                    <FaSpinner className="w-4 h-4 animate-spin text-blue-600" />
                                                                    <span className="text-sm text-gray-600">{t('JobsUpdate.CreateJobModal.loadingCompanies', 'Loading companies...')}</span>
                                                                </div>
                                                            ) : companies.length === 0 ? (
                                                                <div className="text-sm text-red-600 p-4 bg-red-50 border border-red-200 rounded-md">
                                                                    <div className="flex items-center gap-2 mb-3">
                                                                        <FaExclamationTriangle className="w-4 h-4" />
                                                                        <span className="font-medium">{t('JobsUpdate.CreateJobModal.noCompanies', 'You don\'t have any approved companies. Please create one first.')}</span>
                                                                    </div>
                                                                    <p className="text-xs mb-3">{t('JobsUpdate.CreateJobModal.noCompaniesDescription', 'You need to add and get approval for at least one company before posting jobs. Use the "Add Company" button in your dashboard.')}</p>
                                                                    <button
                                                                        onClick={handleGoToCompanies}
                                                                        className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors duration-200"
                                                                    >
                                                                        <FaBuilding className="w-3 h-3" />
                                                                        Go to My Companies
                                                                        <FaArrowRight className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <select
                                                                    value={formData.selectedCompanyId}
                                                                    onChange={(e) => handleInputChange('selectedCompanyId', e.target.value)}
                                                                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                                    required
                                                                >
                                                                    <option value="" disabled>{t('JobsUpdate.CreateJobModal.selectCompany', 'Select a company')}</option>
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
                                            <div className="bg-white rounded-xl  border border-gray-200 overflow-hidden">
                                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                                    <div className="flex items-center gap-2">
                                                        <FaMapMarkerAlt className="w-4 h-4 text-blue-600" />
                                                        <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.CreateJobModal.sections.location', 'Location & Type')}</h3>
                                                    </div>
                                                </div>
                                                <div className="p-4 space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.location', 'Job Location')} *</label>
                                                        <CustomLocationAutocomplete
                                                            value={formData.location && formData.country ? `${formData.location}, ${formData.country}` : formData.location}
                                                            onChange={handleLocationChange}
                                                            placeholder={t('JobsUpdate.CreateJobModal.placeholders.location', 'Start typing city, state, country...')}
                                                            className="w-full"
                                                        />
                                                        {(formData.location || formData.country) && (
                                                            <div className="mt-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                                                                <span className="font-semibold">{t('JobsUpdate.CreateJobModal.fields.location', 'Location')}:</span> {formData.location || 'Not set'}
                                                                {formData.country && (
                                                                    <span>
                                                                        {' '}
                                                                        • <span className="font-semibold">{t('JobsUpdate.CreateJobModal.fields.country', 'Country')}:</span> {formData.country}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div>
                                                                <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.jobType', 'Job Type')}</label>
                                                                <select
                                                                    value={formData.jobType}
                                                                    onChange={(e) => handleInputChange('jobType', e.target.value)}
                                                                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                                                                    <option value="full-time">{t('JobsUpdate.CreateJobModal.jobTypes.fullTime', 'Full-time')}</option>
                                                                    <option value="part-time">{t('JobsUpdate.CreateJobModal.jobTypes.partTime', 'Part-time')}</option>
                                                                    <option value="contract">{t('JobsUpdate.CreateJobModal.jobTypes.contract', 'Contract')}</option>
                                                                    <option value="freelance">{t('JobsUpdate.CreateJobModal.jobTypes.freelance', 'Freelance')}</option>
                                                                    <option value="internship">{t('JobsUpdate.CreateJobModal.jobTypes.internship', 'Internship')}</option>
                                                                    <option value="temporary">{t('JobsUpdate.CreateJobModal.jobTypes.temporary', 'Temporary')}</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.workMode', 'Work Mode')}</label>
                                                                <select
                                                                    value={formData.workMode}
                                                                    onChange={(e) => handleInputChange('workMode', e.target.value)}
                                                                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                                                                    <option value="on-site">{t('JobsUpdate.CreateJobModal.workModes.onSite', 'On-site')}</option>
                                                                    <option value="remote">{t('JobsUpdate.CreateJobModal.workModes.remote', 'Remote')}</option>
                                                                    <option value="hybrid">{t('JobsUpdate.CreateJobModal.workModes.hybrid', 'Hybrid')}</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.experience', 'Experience Level')}</label>
                                                                <select
                                                                    value={formData.experience}
                                                                    onChange={(e) => handleInputChange('experience', e.target.value)}
                                                                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                                                                    <option value="entry-level">{t('JobsUpdate.CreateJobModal.experienceLevels.entryLevel', 'Entry Level')}</option>
                                                                    <option value="junior">{t('JobsUpdate.CreateJobModal.experienceLevels.junior', 'Junior')}</option>
                                                                    <option value="mid-level">{t('JobsUpdate.CreateJobModal.experienceLevels.midLevel', 'Mid Level')}</option>
                                                                    <option value="senior">{t('JobsUpdate.CreateJobModal.experienceLevels.senior', 'Senior')}</option>
                                                                    <option value="executive">{t('JobsUpdate.CreateJobModal.experienceLevels.executive', 'Executive')}</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Compensation & Deadline */}
                                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                                    <div className="flex items-center gap-2">
                                                        <FaDollarSign className="w-4 h-4 text-blue-600" />
                                                        <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.CreateJobModal.sections.compensation', 'Compensation & Deadline')}</h3>
                                                    </div>
                                                </div>
                                                <div className="p-4">
                                                    <div className="grid grid-cols-3 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.minSalary', 'Min Salary')}</label>
                                                            <input
                                                                type="number"
                                                                value={formData.minSalary}
                                                                onChange={(e) => handleInputChange('minSalary', e.target.value)}
                                                                placeholder="80000"
                                                                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.maxSalary', 'Max Salary')}</label>
                                                            <input
                                                                type="number"
                                                                value={formData.maxSalary}
                                                                onChange={(e) => handleInputChange('maxSalary', e.target.value)}
                                                                placeholder="120000"
                                                                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.deadline', 'Application Deadline')}</label>
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
                                                        <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.CreateJobModal.sections.jobDescription', 'Job Description')}</h3>
                                                    </div>
                                                </div>
                                                <div className="p-4 space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.jobDescription', 'Job Description')} *</label>
                                                        <textarea
                                                            value={formData.description}
                                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                                            placeholder={t('JobsUpdate.CreateJobModal.placeholders.jobDescription', 'Describe the role, responsibilities, and what makes this position exciting...')}
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
                                                        <FaUsers className="w-4 h-4 text-blue-600" />
                                                        <h3 className="font-semibold text-gray-900 text-base">{t('JobsUpdate.CreateJobModal.sections.requirements', 'Requirements & Benefits')}</h3>
                                                    </div>
                                                </div>
                                                <div className="p-4">
                                                    <div className="grid grid-cols-2 gap-6">
                                                        {/* Requirements */}
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.requirements', 'Requirements')}</label>
                                                            <div className="space-y-2">
                                                                {formData.requirements.map((requirement, index) => (
                                                                    <div key={index} className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={requirement}
                                                                            onChange={(e) => handleArrayChange('requirements', index, e.target.value)}
                                                                            placeholder={t('JobsUpdate.CreateJobModal.placeholders.requirement', 'e.g., 2+ years of experience in software development')}
                                                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                                        />
                                                                        {formData.requirements.length > 1 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeArrayItem('requirements', index)}
                                                                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors">
                                                                                <FaTrash className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => addArrayItem('requirements')}
                                                                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm">
                                                                    <FaPlus className="w-3 h-3" />
                                                                    {t('JobsUpdate.CreateJobModal.actions.addRequirement', 'Add Requirement')}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Benefits */}
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-800 mb-2">{t('JobsUpdate.CreateJobModal.fields.benefits', 'Benefits')}</label>
                                                            <div className="space-y-2">
                                                                {formData.benefits.map((benefit, index) => (
                                                                    <div key={index} className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            value={benefit}
                                                                            onChange={(e) => handleArrayChange('benefits', index, e.target.value)}
                                                                            placeholder={t('JobsUpdate.CreateJobModal.placeholders.benefit', 'e.g., Health insurance, 401(k) matching')}
                                                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                                        />
                                                                        {formData.benefits.length > 1 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeArrayItem('benefits', index)}
                                                                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors">
                                                                                <FaTrash className="w-3 h-3" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => addArrayItem('benefits')}
                                                                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm">
                                                                    <FaPlus className="w-3 h-3" />
                                                                    {t('JobsUpdate.CreateJobModal.actions.addBenefit', 'Add Benefit')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="border-t border-gray-200 bg-white px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600 font-medium">{t('JobsUpdate.CreateJobModal.requiredFields', 'All fields marked with * are required')}</div>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            disabled={isSubmitting}
                                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors duration-200 flex items-center gap-2 text-sm disabled:opacity-50 font-medium">
                                            <FaTimes className="w-3 h-3" />
                                            {t('JobsUpdate.CreateJobModal.cancel', 'Cancel')}
                                        </button>

                                        {/* Conditional Submit Button */}
                                        {showEmployerApplication ? (
                                            <button
                                                form="employer-application-form"
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="bg-blue-600 text-white py-2 px-6 rounded-md font-semibold text-sm hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                                {isSubmitting ? (
                                                    <>
                                                        <FaSpinner className="w-4 h-4 animate-spin" />
                                                        {t('JobsUpdate.CreateJobModal.submitting', 'Submitting...')}
                                                    </>
                                                ) : (
                                                    <>
                                                        <FaUser className="w-4 h-4" />
                                                        {t('JobsUpdate.CreateJobModal.submitApplication', 'Submit Application')}
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                form="create-job-form"
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="bg-blue-600 text-white py-2 px-6 rounded-md font-semibold text-sm hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                                {isSubmitting ? (
                                                    <>
                                                        <FaSpinner className="w-4 h-4 animate-spin" />
                                                        {t('JobsUpdate.CreateJobModal.creatingJob', 'Creating Job...')}
                                                    </>
                                                ) : (
                                                    <>
                                                        <FaBriefcase className="w-4 h-4" />
                                                        {t('JobsUpdate.CreateJobModal.createJobPosting', 'Create Job Posting')}
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

const MyComponent = withTranslation('common')(CreateJobModal);
export default MyComponent;
