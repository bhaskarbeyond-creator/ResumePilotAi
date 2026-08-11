import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FaBuilding, FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaGlobe, FaLinkedin, FaFileAlt, FaSpinner, FaCheck, FaExclamationTriangle } from 'react-icons/fa';

const EmployerApplicationForm = ({ onSubmit, isSubmitting, showSuccess }) => {
    const [formData, setFormData] = useState({
        contactPersonName: '',
        contactPersonTitle: '',
        contactEmail: '',
        contactPhone: '',
        linkedinProfile: '',
        reasonForJoining: '',
        expectedJobPostings: '',
        agreeToTerms: false,
    });

    const [errors, setErrors] = useState({});

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));

        // Clear error when user starts typing
        if (errors[field]) {
            setErrors((prev) => ({
                ...prev,
                [field]: '',
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        // Required fields
        const requiredFields = [
            'contactPersonName',
            'contactPersonTitle',
            'contactEmail',
            'reasonForJoining',
        ];

        requiredFields.forEach((field) => {
            if (!formData[field] || formData[field].trim() === '') {
                newErrors[field] = 'This field is required';
            }
        });

        // Email validation
        if (formData.contactEmail && !/\S+@\S+\.\S+/.test(formData.contactEmail)) {
            newErrors.contactEmail = 'Please enter a valid email address';
        }


        // Terms agreement
        if (!formData.agreeToTerms) {
            newErrors.agreeToTerms = 'You must agree to the terms and conditions';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validateForm()) {
            onSubmit(formData);
        }
    };

    return (
        <div className="space-y-6">
            {/* Success Message */}
            {showSuccess && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                        <FaCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                        <h3 className="font-medium text-emerald-800">Application Submitted Successfully!</h3>
                        <p className="text-sm text-emerald-600">Your employer application has been submitted and will be reviewed within 2-3 business days.</p>
                    </div>
                </motion.div>
            )}

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <FaExclamationTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                    <h3 className="font-medium text-blue-800 mb-1">Employer Account Application</h3>
                    <p className="text-sm text-blue-700">
                        To post jobs on our platform, you need to apply for an employer account. Please fill out the form below with your personal information. Our team will review your application and
                        approve it within 2-3 business days.
                    </p>
                </div>
            </div>

            <form id="employer-application-form" onSubmit={handleSubmit} className="space-y-6">
                {/* Contact Information Section */}
                <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <FaUser className="w-4 h-4 text-teal-600" />
                        <h3 className="text-lg font-semibold text-slate-900">Contact Information</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Contact Person Name *</label>
                            <input
                                type="text"
                                value={formData.contactPersonName}
                                onChange={(e) => handleInputChange('contactPersonName', e.target.value)}
                                placeholder="e.g. John Smith"
                                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors ${
                                    errors.contactPersonName ? 'border-red-300' : 'border-slate-300'
                                }`}
                            />
                            {errors.contactPersonName && <p className="text-red-500 text-xs mt-1">{errors.contactPersonName}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Job Title *</label>
                            <input
                                type="text"
                                value={formData.contactPersonTitle}
                                onChange={(e) => handleInputChange('contactPersonTitle', e.target.value)}
                                placeholder="e.g. HR Manager"
                                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors ${
                                    errors.contactPersonTitle ? 'border-red-300' : 'border-slate-300'
                                }`}
                            />
                            {errors.contactPersonTitle && <p className="text-red-500 text-xs mt-1">{errors.contactPersonTitle}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Email Address *</label>
                            <input
                                type="email"
                                value={formData.contactEmail}
                                onChange={(e) => handleInputChange('contactEmail', e.target.value)}
                                placeholder="john@company.com"
                                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors ${
                                    errors.contactEmail ? 'border-red-300' : 'border-slate-300'
                                }`}
                            />
                            {errors.contactEmail && <p className="text-red-500 text-xs mt-1">{errors.contactEmail}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                            <input
                                type="tel"
                                value={formData.contactPhone}
                                onChange={(e) => handleInputChange('contactPhone', e.target.value)}
                                placeholder="+1 (555) 123-4567"
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">LinkedIn Profile</label>
                            <input
                                type="url"
                                value={formData.linkedinProfile}
                                onChange={(e) => handleInputChange('linkedinProfile', e.target.value)}
                                placeholder="https://linkedin.com/in/yourprofile"
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* Additional Information Section */}
                <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <FaFileAlt className="w-4 h-4 text-teal-600" />
                        <h3 className="text-lg font-semibold text-slate-900">Additional Information</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Why do you want to join our platform? *</label>
                            <textarea
                                value={formData.reasonForJoining}
                                onChange={(e) => handleInputChange('reasonForJoining', e.target.value)}
                                placeholder="Tell us why you want to post jobs on our platform and what you hope to achieve..."
                                rows={3}
                                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors resize-vertical ${
                                    errors.reasonForJoining ? 'border-red-300' : 'border-slate-300'
                                }`}
                            />
                            {errors.reasonForJoining && <p className="text-red-500 text-xs mt-1">{errors.reasonForJoining}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Expected number of job postings per month</label>
                            <select
                                value={formData.expectedJobPostings}
                                onChange={(e) => handleInputChange('expectedJobPostings', e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors">
                                <option value="">Select expected volume</option>
                                <option value="1-5">1-5 jobs per month</option>
                                <option value="6-10">6-10 jobs per month</option>
                                <option value="11-20">11-20 jobs per month</option>
                                <option value="20+">20+ jobs per month</option>
                            </select>
                        </div>

                        <div className="flex items-start gap-3">
                            <input type="checkbox" id="agreeToTerms" checked={formData.agreeToTerms} onChange={(e) => handleInputChange('agreeToTerms', e.target.checked)} className="mt-1" />
                            <label htmlFor="agreeToTerms" className="text-sm text-slate-700">
                                I agree to the{' '}
                                <a href="#" className="text-teal-600 hover:underline">
                                    Terms and Conditions
                                </a>{' '}
                                and
                                <a href="#" className="text-teal-600 hover:underline ml-1">
                                    Privacy Policy
                                </a>{' '}
                                *
                            </label>
                        </div>
                        {errors.agreeToTerms && <p className="text-red-500 text-xs">{errors.agreeToTerms}</p>}
                    </div>
                </div>
            </form>
        </div>
    );
};

export default EmployerApplicationForm;
