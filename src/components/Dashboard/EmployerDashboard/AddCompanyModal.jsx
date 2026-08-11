import React, { useState, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaBuilding, FaSpinner, FaExclamationTriangle, FaCheckCircle, FaExclamationCircle, FaImage } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';
import { createCompany } from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';
import LocationAutocomplete from '../../JobsListings/LocationAutocomplete';

const AddCompanyModal = ({ isOpen, onClose, showToast, t }) => {
    const user = useContext(AuthContext);
    
    // Inject CSS to hide WebKit scrollbars
    React.useEffect(() => {
        const styleId = 'hide-scrollbar-styles';
        if (!document.getElementById(styleId)) {
            try {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .scrollable-modal-content::-webkit-scrollbar {
                        display: none;
                    }
                `;
                document.head.appendChild(style);
            } catch (error) {
                console.warn('Failed to inject scrollbar styles:', error);
            }
        }
    }, []);


    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        website: '',
        companyImage: '',
        description: '',
        industry: '',
        size: '',
        location: '',
        address: '',
        phone: '',
        email: '',
    });
    const [errors, setErrors] = useState({});

    const industryOptions = [
        { value: 'Technology', label: t('JobsUpdate.AddCompanyModal.industries.technology', 'Technology') },
        { value: 'Healthcare', label: t('JobsUpdate.AddCompanyModal.industries.healthcare', 'Healthcare') },
        { value: 'Finance', label: t('JobsUpdate.AddCompanyModal.industries.finance', 'Finance') },
        { value: 'Education', label: t('JobsUpdate.AddCompanyModal.industries.education', 'Education') },
        { value: 'Retail', label: t('JobsUpdate.AddCompanyModal.industries.retail', 'Retail') },
        { value: 'Manufacturing', label: t('JobsUpdate.AddCompanyModal.industries.manufacturing', 'Manufacturing') },
        { value: 'Consulting', label: t('JobsUpdate.AddCompanyModal.industries.consulting', 'Consulting') },
        { value: 'Marketing', label: t('JobsUpdate.AddCompanyModal.industries.marketing', 'Marketing') },
        { value: 'Real Estate', label: t('JobsUpdate.AddCompanyModal.industries.realEstate', 'Real Estate') },
        { value: 'Hospitality', label: t('JobsUpdate.AddCompanyModal.industries.hospitality', 'Hospitality') },
        { value: 'Transportation', label: t('JobsUpdate.AddCompanyModal.industries.transportation', 'Transportation') },
        { value: 'Energy', label: t('JobsUpdate.AddCompanyModal.industries.energy', 'Energy') },
        { value: 'Media', label: t('JobsUpdate.AddCompanyModal.industries.media', 'Media') },
        { value: 'Government', label: t('JobsUpdate.AddCompanyModal.industries.government', 'Government') },
        { value: 'Non-profit', label: t('JobsUpdate.AddCompanyModal.industries.nonprofit', 'Non-profit') },
        { value: 'Other', label: t('JobsUpdate.AddCompanyModal.industries.other', 'Other') },
    ];

    const companySizeOptions = [
        { value: '1-10 employees', label: t('JobsUpdate.AddCompanyModal.companySizes.size1to10', '1-10 employees') },
        { value: '11-50 employees', label: t('JobsUpdate.AddCompanyModal.companySizes.size11to50', '11-50 employees') },
        { value: '51-200 employees', label: t('JobsUpdate.AddCompanyModal.companySizes.size51to200', '51-200 employees') },
        { value: '201-500 employees', label: t('JobsUpdate.AddCompanyModal.companySizes.size201to500', '201-500 employees') },
        { value: '501-1000 employees', label: t('JobsUpdate.AddCompanyModal.companySizes.size501to1000', '501-1000 employees') },
        { value: '1000+ employees', label: t('JobsUpdate.AddCompanyModal.companySizes.size1000plus', '1000+ employees') },
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors((prev) => ({
                ...prev,
                [name]: '',
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        // Required fields
        if (!formData.name.trim()) {
            newErrors.name = t('JobsUpdate.AddCompanyModal.validation.nameRequired', 'Company name is required');
        }
        if (!formData.industry) {
            newErrors.industry = t('JobsUpdate.AddCompanyModal.validation.industryRequired', 'Industry is required');
        }
        if (!formData.size) {
            newErrors.size = t('JobsUpdate.AddCompanyModal.validation.sizeRequired', 'Company size is required');
        }
        if (!formData.location.trim()) {
            newErrors.location = t('JobsUpdate.AddCompanyModal.validation.locationRequired', 'Location is required');
        }

        // Optional validation for website URL
        if (formData.website && !isValidUrl(formData.website)) {
            newErrors.website = t('JobsUpdate.AddCompanyModal.validation.invalidWebsite', 'Please enter a valid website URL');
        }

        // Optional validation for company logo URL
        if (formData.companyImage && !isValidUrl(formData.companyImage)) {
            newErrors.companyImage = t('JobsUpdate.AddCompanyModal.validation.invalidImage', 'Please enter a valid image URL');
        }

        // Optional validation for email
        if (formData.email && !isValidEmail(formData.email)) {
            newErrors.email = t('JobsUpdate.AddCompanyModal.validation.invalidEmail', 'Please enter a valid email address');
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const isValidUrl = (string) => {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    };

    const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            showToast && showToast('error', t('JobsUpdate.AddCompanyModal.messages.validationError', 'Validation Error'), t('JobsUpdate.AddCompanyModal.messages.fixErrors', 'Please fix the errors in the form'));
            return;
        }

        if (!user?.uid) {
            showToast && showToast('error', t('JobsUpdate.AddCompanyModal.messages.error', 'Error'), t('JobsUpdate.AddCompanyModal.messages.mustBeLoggedIn', 'You must be logged in to add a company'));
            return;
        }

        setLoading(true);
        try {
            console.log('🏢 Submitting company data:', formData);
            
            const result = await createCompany(user.uid, formData);

            if (result.success) {
                console.log('✅ Company created successfully:', result.companyId);
                showToast && showToast('success', t('JobsUpdate.AddCompanyModal.messages.success', 'Success'), t('JobsUpdate.AddCompanyModal.messages.companyAdded', 'Company added successfully! It will be reviewed by our team.'));
                handleClose();
            } else {
                console.error('❌ Failed to create company:', result.error);
                showToast && showToast('error', t('JobsUpdate.AddCompanyModal.messages.error', 'Error'), result.error || t('JobsUpdate.AddCompanyModal.messages.failedToAdd', 'Failed to add company'));
            }
        } catch (error) {
            console.error('❌ Error creating company:', error);
            showToast && showToast('error', t('JobsUpdate.AddCompanyModal.messages.error', 'Error'), t('JobsUpdate.AddCompanyModal.messages.unexpectedError', 'An unexpected error occurred'));
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setFormData({
                name: '',
                website: '',
                companyImage: '',
                description: '',
                industry: '',
                size: '',
                location: '',
                address: '',
                phone: '',
                email: '',
            });
            setErrors({});
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                    onClick={handleClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div 
                        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-3 bg-blue-100 rounded-xl">
                            <FaBuilding className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">{t('JobsUpdate.AddCompanyModal.header.title', 'Add Company')}</h2>
                            <p className="text-sm text-slate-600 mt-0.5">
                                {t('JobsUpdate.AddCompanyModal.header.subtitle', 'Add your company details for review and approval')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        className="p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 disabled:opacity-50 hover:scale-105"
                    >
                        <FaTimes className="w-5 h-5 text-slate-500 hover:text-slate-700" />
                    </button>
                </div>

                {/* Info Banner */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex-shrink-0">
                    <div className="flex items-start space-x-3">
                        <div className="p-1.5 bg-blue-100 rounded-lg flex-shrink-0">
                            <FaExclamationCircle className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="text-sm text-blue-800">
                            <p className="font-semibold mb-1">{t('JobsUpdate.AddCompanyModal.info.title', 'Company Review Process')}</p>
                            <p className="text-blue-700">
                                {t('JobsUpdate.AddCompanyModal.info.description', 'All company submissions are reviewed by our team to ensure quality and authenticity. You\'ll be notified once your company is approved and can be used for job postings.')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Scrollable Form Container */}
                <div 
                    className="flex-1 overflow-y-auto scrollable-modal-content min-h-0"
                    style={{
                        msOverflowStyle: 'none',
                        scrollbarWidth: 'none',
                    }}
                >
                    <motion.form 
                        onSubmit={handleSubmit} 
                        className="p-6 space-y-6"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                    >
                    {/* Company Name */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                            {t('JobsUpdate.AddCompanyModal.form.companyName', 'Company Name *')}
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            disabled={loading}
                            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                errors.name 
                                    ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                    : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                            }`}
                            placeholder={t('JobsUpdate.AddCompanyModal.form.companyNamePlaceholder', 'Enter company name')}
                        />
                        {errors.name && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                                <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                {errors.name}
                            </p>
                        )}
                    </div>

                    {/* Website */}
                    <div>
                        <label htmlFor="website" className="block text-sm font-medium text-slate-700 mb-2">
                            {t('JobsUpdate.AddCompanyModal.form.website', 'Website')}
                        </label>
                        <input
                            type="url"
                            id="website"
                            name="website"
                            value={formData.website}
                            onChange={handleChange}
                            disabled={loading}
                            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                errors.website 
                                    ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                    : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                            }`}
                            placeholder="https://example.com"
                        />
                        {errors.website && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                                <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                {errors.website}
                            </p>
                        )}
                    </div>

                    {/* Company Logo */}
                    <div>
                        <label htmlFor="companyImage" className="flex items-center text-sm font-medium text-slate-700 mb-2">
                            <FaImage className="w-4 h-4 mr-2 text-slate-600" />
                            {t('JobsUpdate.AddCompanyModal.form.companyLogo', 'Company Logo (Optional)')}
                        </label>
                        <input
                            type="url"
                            id="companyImage"
                            name="companyImage"
                            value={formData.companyImage}
                            onChange={handleChange}
                            disabled={loading}
                            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                errors.companyImage 
                                    ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                    : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                            }`}
                            placeholder="https://example.com/logo.png"
                        />
                        <p className="text-xs text-slate-500 mt-1">Provide a URL to your company logo (PNG, JPG, or SVG)</p>
                        {errors.companyImage && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                                <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                {errors.companyImage}
                            </p>
                        )}
                        {formData.companyImage && !errors.companyImage && (
                            <motion.div 
                                className="mt-4 flex items-center space-x-4 p-4 bg-slate-50 rounded-lg border border-slate-200"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="w-16 h-16 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                                    <img
                                        src={formData.companyImage}
                                        alt="Company logo preview"
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                        }}
                                    />
                                </div>
                                <div className="text-sm text-slate-600">
                                    <p className="font-semibold text-slate-800">Logo Preview</p>
                                    <p className="text-slate-500 text-xs mt-0.5">This will appear in job listings</p>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Industry and Size Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="industry" className="block text-sm font-medium text-slate-700 mb-2">
                                {t('JobsUpdate.AddCompanyModal.form.industry', 'Industry *')}
                            </label>
                            <select
                                id="industry"
                                name="industry"
                                value={formData.industry}
                                onChange={handleChange}
                                disabled={loading}
                                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                    errors.industry 
                                        ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                        : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                                }`}
                            >
                                <option value="">{t('JobsUpdate.AddCompanyModal.placeholders.selectIndustry', 'Select industry')}</option>
                                {industryOptions.map((industry) => (
                                    <option key={industry.value} value={industry.value}>
                                        {industry.label}
                                    </option>
                                ))}
                            </select>
                            {errors.industry && (
                                <p className="mt-1 text-sm text-red-600 flex items-center">
                                    <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                    {errors.industry}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="size" className="block text-sm font-medium text-slate-700 mb-2">
                                {t('JobsUpdate.AddCompanyModal.form.companySize', 'Company Size *')}
                            </label>
                            <select
                                id="size"
                                name="size"
                                value={formData.size}
                                onChange={handleChange}
                                disabled={loading}
                                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                    errors.size 
                                        ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                        : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                                }`}
                            >
                                <option value="">{t('JobsUpdate.AddCompanyModal.placeholders.selectCompanySize', 'Select company size')}</option>
                                {companySizeOptions.map((size) => (
                                    <option key={size.value} value={size.value}>
                                        {size.label}
                                    </option>
                                ))}
                            </select>
                            {errors.size && (
                                <p className="mt-1 text-sm text-red-600 flex items-center">
                                    <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                    {errors.size}
                                </p>
                            )}
                        </div>
                    </div>

{/* Location */}
                    <div>
                        <label htmlFor="location" className="block text-sm font-medium text-slate-700 mb-2">
                            {t('JobsUpdate.AddCompanyModal.form.location', 'Location *')}
                        </label>
                        <LocationAutocomplete
                            value={formData.location}
                            onChange={(value) => handleChange({ target: { name: 'location', value } })}
                            placeholder="City, State/Country"
                            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                errors.location 
                                    ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                    : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                            }`}
                        />
                        {errors.location && (
                            <p className="mt-1 text-sm text-red-600 flex items-center">
                                <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                {errors.location}
                            </p>
                        )}
                    </div>

                    {/* Address */}
                    <div>
                        <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-2">
                            {t('JobsUpdate.AddCompanyModal.form.address', 'Address')}
                        </label>
                        <input
                            type="text"
                            id="address"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            disabled={loading}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-sm disabled:opacity-50 disabled:bg-slate-50 hover:border-slate-400 transition-all duration-200"
                            placeholder="Full address (optional)"
                        />
                    </div>

                    {/* Contact Information Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                                {t('JobsUpdate.AddCompanyModal.form.phone', 'Phone')}
                            </label>
                            <input
                                type="tel"
                                id="phone"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                disabled={loading}
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-sm disabled:opacity-50 disabled:bg-slate-50 hover:border-slate-400 transition-all duration-200"
                                placeholder="Phone number"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                                {t('JobsUpdate.AddCompanyModal.form.email', 'Email')}
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                disabled={loading}
                                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 text-sm disabled:opacity-50 disabled:bg-slate-50 transition-all duration-200 ${
                                    errors.email 
                                        ? 'border-red-300 focus:ring-red-100 focus:border-red-400 bg-red-50' 
                                        : 'border-slate-300 focus:ring-blue-100 focus:border-blue-400 hover:border-slate-400'
                                }`}
                                placeholder="contact@company.com"
                            />
                            {errors.email && (
                                <p className="mt-1 text-sm text-red-600 flex items-center">
                                    <FaExclamationTriangle className="w-3 h-3 mr-1" />
                                    {errors.email}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
                            {t('JobsUpdate.AddCompanyModal.form.description', 'Company Description')}
                        </label>
                        <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            disabled={loading}
                            rows={4}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-sm disabled:opacity-50 disabled:bg-slate-50 resize-none hover:border-slate-400 transition-all duration-200"
                            placeholder="Brief description of the company, its mission, and what it does..."
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end space-x-3 pt-6 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={loading}
                            className="px-6 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all duration-200 disabled:opacity-50 border border-slate-200 hover:border-slate-300"
                        >
                            {t('JobsUpdate.AddCompanyModal.buttons.cancel', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center space-x-2 shadow-md hover:shadow-lg"
                        >
                            {loading ? (
                                <>
                                    <FaSpinner className="w-4 h-4 animate-spin" />
                                    <span>{t('JobsUpdate.AddCompanyModal.buttons.addingCompany', 'Adding Company...')}</span>
                                </>
                            ) : (
                                <>
                                    <FaCheckCircle className="w-4 h-4" />
                                    <span>{t('JobsUpdate.AddCompanyModal.buttons.addCompany', 'Add Company')}</span>
                                </>
                            )}
                        </button>
                    </div>
                    </motion.form>
                </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default withTranslation('common')(AddCompanyModal);
