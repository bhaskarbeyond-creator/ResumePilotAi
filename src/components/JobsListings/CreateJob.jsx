import React, { useState, useEffect, useContext } from 'react';
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
    FaExclamationTriangle,
} from 'react-icons/fa';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import { AuthContext } from '../../main';
import { checkIsEmployer, submitEmployerApplication, createJobPosting, getApprovedEmployerCompanies } from '../../firestore/dbOperations';
import EmployerApplicationForm from './EmployerApplicationForm';
import countries from './countries';

const CreateJob = () => {
    const user = useContext(AuthContext);

    const [formData, setFormData] = useState({
        jobTitle: '',
        selectedCompanyId: '',
        company: '',
        companySize: '',
        companyIndustry: '',
        companyWebsite: '',
        companyDescription: '',
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

    const [companies, setCompanies] = useState([]);
    const [loadingCompanies, setLoadingCompanies] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isEmployer, setIsEmployer] = useState(null); // null = loading, true = employer, false = not employer
    const [showEmployerApplication, setShowEmployerApplication] = useState(false);
    const [employerApplicationSuccess, setEmployerApplicationSuccess] = useState(false);
    const [errors, setErrors] = useState({});
    const [isDraft, setIsDraft] = useState(false);

    // Check employer status when component mounts
    useEffect(() => {
        if (user) {
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
        } else {
            // User not logged in
            setIsEmployer(false);
            setShowEmployerApplication(true);
        }
    }, [user]);

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

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
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

    const validateForm = () => {
        const newErrors = {};

        // Required fields validation
        if (!formData.jobTitle.trim()) newErrors.jobTitle = 'Job title is required';
        if (!formData.selectedCompanyId) newErrors.company = 'Please select a company';
        if (!formData.location.trim()) newErrors.location = 'Location is required';
        if (!formData.description.trim()) newErrors.description = 'Job description is required';

        // Salary validation
        if (formData.minSalary && formData.maxSalary) {
            const minSal = parseInt(formData.minSalary);
            const maxSal = parseInt(formData.maxSalary);
            if (minSal >= maxSal) {
                newErrors.salary = 'Maximum salary must be greater than minimum salary';
            }
        }

        // Requirements validation (at least one non-empty requirement)
        const validRequirements = formData.requirements.filter((req) => req.trim() !== '');
        if (validRequirements.length === 0) {
            newErrors.requirements = 'At least one requirement is needed';
        }

        // Deadline validation (must be in the future)
        if (formData.deadline) {
            const deadlineDate = new Date(formData.deadline);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (deadlineDate <= today) {
                newErrors.deadline = 'Deadline must be in the future';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate form
        if (!validateForm()) {
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        try {
            if (!user) {
                throw new Error('User not authenticated');
            }

            console.log('User authenticated:', user.uid);
            console.log('User is employer:', isEmployer);

            // Validate that a company is selected
            if (!formData.selectedCompanyId) {
                throw new Error('Please select a company from your approved companies');
            }

            // Find the selected company details
            const selectedCompany = companies.find(c => c.id === formData.selectedCompanyId);
            if (!selectedCompany) {
                throw new Error('Selected company not found');
            }

            // Prepare job data with company information
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
                status: isDraft ? 'draft' : 'active', // Set to active since companies are pre-approved
            };

            // Create job posting
            console.log('Creating job with data:', jobData);
            console.log('User ID:', user.uid);

            const result = await createJobPosting(user.uid, jobData);
            console.log('Job creation result:', result);

            if (result.success) {
                setShowSuccess(true);
                console.log('Job created successfully with ID:', result.jobId);

                // Reset form after success
                setTimeout(() => {
                    setShowSuccess(false);
                    setFormData({
                        jobTitle: '',
                        selectedCompanyId: '',
                        company: '',
                        companySize: '',
                        companyIndustry: '',
                        companyWebsite: '',
                        companyDescription: '',
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
                    setIsDraft(false);
                }, 3000);
            } else {
                throw new Error(result.error || 'Failed to create job posting');
            }
        } catch (error) {
            console.error('Error creating job posting:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);

            let errorMessage = 'Failed to create job posting. Please try again.';

            // Handle specific Firebase errors
            if (error.code === 'permission-denied') {
                errorMessage = 'Permission denied. Please make sure you have employer privileges.';
            } else if (error.code === 'unauthenticated') {
                errorMessage = 'Please log in to create a job posting.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            setErrors({ submit: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAsDraft = async () => {
        setIsDraft(true);
        // Trigger form submission with draft status
        const form = document.querySelector('form');
        if (form) {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
    };

    const handleEmployerApplicationSubmit = async (applicationData) => {
        if (!user) {
            console.error('User not logged in');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await submitEmployerApplication(user.uid, applicationData);
            if (result.success) {
                setEmployerApplicationSuccess(true);
                setTimeout(() => {
                    setEmployerApplicationSuccess(false);
                    // Optionally redirect or refresh the page
                }, 3000);
            } else {
                console.error('Failed to submit application:', result.error);
            }
        } catch (error) {
            console.error('Error submitting employer application:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <HomepageNavbar />
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pt-20 pb-8">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="flex items-center justify-center mb-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                                <FaBriefcase className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">{showEmployerApplication ? 'Apply for Employer Account' : 'Create Job Posting'}</h1>
                        <p className="text-slate-600">{showEmployerApplication ? 'Apply to become an employer and start posting jobs' : 'Post your job and find the perfect candidate'}</p>
                    </div>

                    {/* Loading State */}
                    {isEmployer === null && (
                        <div className="flex items-center justify-center py-12">
                            <FaSpinner className="w-8 h-8 text-teal-600 animate-spin" />
                            <span className="ml-3 text-slate-600">Checking account status...</span>
                        </div>
                    )}

                    {/* Employer Application Form */}
                    {showEmployerApplication && isEmployer !== null && (
                        <EmployerApplicationForm onSubmit={handleEmployerApplicationSubmit} isSubmitting={isSubmitting} showSuccess={employerApplicationSuccess} />
                    )}

                    {/* Job Creation Form */}
                    {!showEmployerApplication && isEmployer === true && (
                        <>
                            {/* Success Message */}
                            {showSuccess && (
                                <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
                                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                        <FaCheck className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-emerald-800">Job Submitted Successfully!</h3>
                                        <p className="text-sm text-emerald-600">Your job posting has been {isDraft ? 'saved as draft' : 'submitted and is pending approval'}.</p>
                                    </div>
                                </div>
                            )}

                            {/* Error Message */}
                            {errors.submit && (
                                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                        <FaTimes className="w-4 h-4 text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-red-800">Error Creating Job</h3>
                                        <p className="text-sm text-red-600">{errors.submit}</p>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Job Information Section */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                                    <div className="p-6 border-b border-slate-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                                <FaBriefcase className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <h2 className="text-xl font-semibold text-slate-900">Job Information</h2>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Job Title *</label>
                                                <input
                                                    type="text"
                                                    value={formData.jobTitle}
                                                    onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                                                    placeholder="e.g. Senior React Developer"
                                                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none ${
                                                        errors.jobTitle ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                    required
                                                />
                                                {errors.jobTitle && <p className="mt-1 text-sm text-red-600">{errors.jobTitle}</p>}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Select Company *</label>
                                                {loadingCompanies ? (
                                                    <div className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-md bg-gray-50">
                                                        <FaSpinner className="w-4 h-4 animate-spin text-blue-600" />
                                                        <span className="text-sm text-gray-600">Loading companies...</span>
                                                    </div>
                                                ) : companies.length === 0 ? (
                                                    <div className="text-sm text-red-600 p-3 bg-red-50 border border-red-200 rounded-md">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <FaExclamationTriangle className="w-4 h-4" />
                                                            <span className="font-medium">No approved companies found</span>
                                                        </div>
                                                        <p className="text-xs">You need to add and get approval for at least one company before posting jobs. Use the "Add Company" button in your dashboard.</p>
                                                    </div>
                                                ) : (
                                                    <select
                                                        value={formData.selectedCompanyId}
                                                        onChange={(e) => handleInputChange('selectedCompanyId', e.target.value)}
                                                        className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                                        required
                                                    >
                                                        <option value="">Select a company</option>
                                                        {companies.map((company) => (
                                                            <option key={company.id} value={company.id}>
                                                                {company.name} ({company.industry})
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                                {errors.company && <p className="mt-1 text-sm text-red-600">{errors.company}</p>}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">City/State *</label>
                                                <input
                                                    type="text"
                                                    value={formData.location}
                                                    onChange={(e) => handleInputChange('location', e.target.value)}
                                                    placeholder="e.g. New York, NY"
                                                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none ${
                                                        errors.location ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                    required
                                                />
                                                {errors.location && <p className="mt-1 text-sm text-red-600">{errors.location}</p>}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Country *</label>
                                                <select
                                                    value={formData.country}
                                                    onChange={(e) => handleInputChange('country', e.target.value)}
                                                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none ${
                                                        errors.country ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                    required>
                                                    <option value="">Select country</option>
                                                    {countries.map((country) => (
                                                        <option key={country.code} value={country.name}>
                                                            {country.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {errors.country && <p className="mt-1 text-sm text-red-600">{errors.country}</p>}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Application Deadline</label>
                                                <input
                                                    type="date"
                                                    value={formData.deadline}
                                                    onChange={(e) => handleInputChange('deadline', e.target.value)}
                                                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none ${
                                                        errors.deadline ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                />
                                                {errors.deadline && <p className="mt-1 text-sm text-red-600">{errors.deadline}</p>}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Job Type</label>
                                                <select
                                                    value={formData.jobType}
                                                    onChange={(e) => handleInputChange('jobType', e.target.value)}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                                                    <option value="full-time">Full-time</option>
                                                    <option value="part-time">Part-time</option>
                                                    <option value="contract">Contract</option>
                                                    <option value="internship">Internship</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Work Mode</label>
                                                <select
                                                    value={formData.workMode}
                                                    onChange={(e) => handleInputChange('workMode', e.target.value)}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                                                    <option value="on-site">On-site</option>
                                                    <option value="remote">Remote</option>
                                                    <option value="hybrid">Hybrid</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Experience Level</label>
                                                <select
                                                    value={formData.experience}
                                                    onChange={(e) => handleInputChange('experience', e.target.value)}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                                                    <option value="entry-level">Entry Level</option>
                                                    <option value="mid-level">Mid Level (2-5 years)</option>
                                                    <option value="senior-level">Senior Level (5+ years)</option>
                                                    <option value="executive">Executive/Director</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Min Salary (USD)</label>
                                                <input
                                                    type="number"
                                                    value={formData.minSalary}
                                                    onChange={(e) => handleInputChange('minSalary', e.target.value)}
                                                    placeholder="50000"
                                                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none ${
                                                        errors.salary ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Max Salary (USD)</label>
                                                <input
                                                    type="number"
                                                    value={formData.maxSalary}
                                                    onChange={(e) => handleInputChange('maxSalary', e.target.value)}
                                                    placeholder="80000"
                                                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none ${
                                                        errors.salary ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                />
                                            </div>
                                        </div>
                                        {errors.salary && <p className="mt-2 text-sm text-red-600">{errors.salary}</p>}
                                    </div>
                                </div>

                                {/* Company Information Section */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                                    <div className="p-6 border-b border-slate-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                                <FaBuilding className="w-4 h-4 text-purple-600" />
                                            </div>
                                            <h2 className="text-xl font-semibold text-slate-900">Company Information</h2>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Company Size</label>
                                                <select
                                                    value={formData.companySize}
                                                    onChange={(e) => handleInputChange('companySize', e.target.value)}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                                                    <option value="">Select company size</option>
                                                    <option value="1-10">1-10 employees</option>
                                                    <option value="11-50">11-50 employees</option>
                                                    <option value="51-200">51-200 employees</option>
                                                    <option value="201-500">201-500 employees</option>
                                                    <option value="501-1000">501-1000 employees</option>
                                                    <option value="1000+">1000+ employees</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
                                                <select
                                                    value={formData.companyIndustry}
                                                    onChange={(e) => handleInputChange('companyIndustry', e.target.value)}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500">
                                                    <option value="">Select industry</option>
                                                    <option value="Technology">Technology</option>
                                                    <option value="Finance">Finance</option>
                                                    <option value="Healthcare">Healthcare</option>
                                                    <option value="Education">Education</option>
                                                    <option value="Retail">Retail</option>
                                                    <option value="Manufacturing">Manufacturing</option>
                                                    <option value="Consulting">Consulting</option>
                                                    <option value="Media & Entertainment">Media & Entertainment</option>
                                                    <option value="Real Estate">Real Estate</option>
                                                    <option value="Transportation">Transportation</option>
                                                    <option value="Energy">Energy</option>
                                                    <option value="Telecommunications">Telecommunications</option>
                                                    <option value="Government">Government</option>
                                                    <option value="Non-profit">Non-profit</option>
                                                    <option value="Agriculture">Agriculture</option>
                                                    <option value="Construction">Construction</option>
                                                    <option value="Hospitality">Hospitality</option>
                                                    <option value="Legal">Legal</option>
                                                    <option value="Marketing & Advertising">Marketing & Advertising</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Company Website</label>
                                                <input
                                                    type="url"
                                                    value={formData.companyWebsite}
                                                    onChange={(e) => handleInputChange('companyWebsite', e.target.value)}
                                                    placeholder="e.g. https://www.company.com"
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                                                />
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Company Description</label>
                                                <textarea
                                                    value={formData.companyDescription}
                                                    onChange={(e) => handleInputChange('companyDescription', e.target.value)}
                                                    placeholder="Brief description of your company, culture, and mission..."
                                                    rows={3}
                                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Job Description Section */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                                    <div className="p-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                                <FaFileAlt className="w-4 h-4 text-emerald-600" />
                                            </div>
                                            <h2 className="text-xl font-semibold text-slate-900">Job Description</h2>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Detailed Description *</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={(e) => handleInputChange('description', e.target.value)}
                                                placeholder="Describe the role, responsibilities, and what makes this position exciting..."
                                                rows={6}
                                                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none resize-none ${
                                                    errors.description ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                }`}
                                                required
                                            />
                                            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
                                        </div>
                                    </div>
                                </div>

                                {/* Requirements & Benefits Section */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                                    <div className="p-6">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                                <FaGraduationCap className="w-4 h-4 text-purple-600" />
                                            </div>
                                            <h2 className="text-xl font-semibold text-slate-900">Requirements & Benefits</h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Requirements */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-3">Requirements</label>
                                                <div className="space-y-2">
                                                    {formData.requirements.map((requirement, index) => (
                                                        <div key={index} className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={requirement}
                                                                onChange={(e) => handleArrayChange('requirements', index, e.target.value)}
                                                                placeholder={`Requirement ${index + 1}`}
                                                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                                                            />
                                                            {formData.requirements.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeArrayItem('requirements', index)}
                                                                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                                                                    <FaTrash className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => addArrayItem('requirements')}
                                                        className="flex items-center gap-2 text-teal-600 hover:text-teal-700 font-medium text-sm">
                                                        <FaPlus className="w-3 h-3" />
                                                        Add Requirement
                                                    </button>
                                                </div>
                                                {errors.requirements && <p className="mt-1 text-sm text-red-600">{errors.requirements}</p>}
                                            </div>

                                            {/* Benefits */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-3">Benefits</label>
                                                <div className="space-y-2">
                                                    {formData.benefits.map((benefit, index) => (
                                                        <div key={index} className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={benefit}
                                                                onChange={(e) => handleArrayChange('benefits', index, e.target.value)}
                                                                placeholder={`Benefit ${index + 1}`}
                                                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                                                            />
                                                            {formData.benefits.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeArrayItem('benefits', index)}
                                                                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                                                                    <FaTrash className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => addArrayItem('benefits')}
                                                        className="flex items-center gap-2 text-teal-600 hover:text-teal-700 font-medium text-sm">
                                                        <FaPlus className="w-3 h-3" />
                                                        Add Benefit
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Submit Section */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                                    <div className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                                                    <FaSave className="w-4 h-4 text-teal-600" />
                                                </div>
                                                <h2 className="text-xl font-semibold text-slate-900">Ready to Post?</h2>
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    type="button"
                                                    onClick={handleSaveAsDraft}
                                                    disabled={isSubmitting}
                                                    className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                                    {isSubmitting && isDraft ? (
                                                        <>
                                                            <FaSpinner className="w-4 h-4 animate-spin mr-2" />
                                                            Saving Draft...
                                                        </>
                                                    ) : (
                                                        'Save as Draft'
                                                    )}
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={isSubmitting}
                                                    className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                                    {isSubmitting && !isDraft ? (
                                                        <>
                                                            <FaSpinner className="w-4 h-4 animate-spin" />
                                                            Posting...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FaBriefcase className="w-4 h-4" />
                                                            Post Job
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
            <HomepageFooter />
        </>
    );
};

export default CreateJob;
