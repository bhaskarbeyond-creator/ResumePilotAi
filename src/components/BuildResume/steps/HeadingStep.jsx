import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import InputField from './components/InputField';
import AutocompleteInputField from './components/AutocompleteInputField';
import SectionCard from './components/SectionCard';
import PhotoUpload from './components/PhotoUpload';
import { inferCountryFromCity } from '../../../utils/locationHelper';

const HeadingStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [formData, setFormData] = useState({
        firstname: resumeData.firstname || '',
        lastname: resumeData.lastname || '',
        email: resumeData.email || '',
        phone: resumeData.phone || '',
        occupation: resumeData.occupation || '',
        country: resumeData.country || '',
        city: resumeData.city || '',
        address: resumeData.address || '',
        postalcode: resumeData.postalcode || '',
        website: resumeData.website || '',
        linkedin: resumeData.linkedin || '',
        github: resumeData.github || '',
        photo: resumeData.photo || null,
    });

    useEffect(() => {
        setFormData({
            firstname: resumeData.firstname || '',
            lastname: resumeData.lastname || '',
            email: resumeData.email || '',
            phone: resumeData.phone || '',
            occupation: resumeData.occupation || '',
            country: resumeData.country || '',
            city: resumeData.city || '',
            address: resumeData.address || '',
            postalcode: resumeData.postalcode || '',
            website: resumeData.website || '',
            linkedin: resumeData.linkedin || '',
            github: resumeData.github || '',
            photo: resumeData.photo || null,
        });
    }, [resumeData.firstname, resumeData.lastname, resumeData.email, resumeData.phone, resumeData.occupation, resumeData.city, resumeData.country, resumeData.address, resumeData.postalcode, resumeData.website, resumeData.linkedin, resumeData.github, resumeData.photo]);

    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            const updated = { ...prev, [name]: value };
            if (name === 'city' && value) {
                const inferredCountry = inferCountryFromCity(value);
                if (inferredCountry) {
                    updated.country = inferredCountry;
                }
            }
            return updated;
        });

        // Clear error when user starts typing
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    const handleInputBlur = (e) => {
        const { name } = e.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        validateField(name, formData[name]);
    };

    const validateField = (name, value) => {
        let error = '';

        if (requiredFields.includes(name) && !value.trim()) {
            error = t('HeadingStep.errors.required', { field: name.charAt(0).toUpperCase() + name.slice(1) });
        } else if (name === 'email' && value && !/\S+@\S+\.\S+/.test(value)) {
            error = t('HeadingStep.errors.invalidEmail');
        } else if (name === 'phone' && value && !/^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)]/g, ''))) {
            error = t('HeadingStep.errors.invalidPhone');
        }

        setErrors((prev) => ({ ...prev, [name]: error }));
        return error === '';
    };

    const handlePhotoChange = (photo) => {
        setFormData((prev) => ({ ...prev, photo }));
    };

    const handleSave = () => {
        // Validate all required fields
        let allValid = true;

        requiredFields.forEach((field) => {
            if (!validateField(field, formData[field])) {
                allValid = false;
            }
        });

        updateResumeData(formData);

        // Mark step as completed if required fields are filled and valid
        const isComplete = requiredFields.every((field) => formData[field].trim() !== '') && allValid;

        if (isComplete) {
            const completedSteps = [...(resumeData.completedSteps || [])];
            if (!completedSteps.includes(1)) {
                completedSteps.push(1);
                updateResumeData({ ...formData, completedSteps });
            }
        } else {
            // Remove step from completed if it no longer meets requirements
            const completedSteps = [...(resumeData.completedSteps || [])];
            const updatedSteps = completedSteps.filter((step) => step !== 1);
            if (updatedSteps.length !== completedSteps.length) {
                updateResumeData({ ...formData, completedSteps: updatedSteps });
            }
        }
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [formData]);

    const requiredFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];
    const completedRequiredFields = requiredFields.filter((field) => formData[field].trim() !== '').length;
    const totalProgress = (completedRequiredFields / requiredFields.length) * 100;
    const isStepComplete = completedRequiredFields === requiredFields.length;

    // Calculate optional fields completion
    const optionalFields = ['country', 'city', 'address', 'postalcode'];
    const completedOptionalFields = optionalFields.filter((field) => formData[field].trim() !== '').length;

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            {/* Header Section with Progress */}
            <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                                    isStepComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                {isStepComplete ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                ) : (
                                    '1'
                                )}
                            </div>
                            <h1 className="text-lg sm:text-xl font-bold text-slate-900">{t('HeadingStep.title')}</h1>
                        </div>
                        <p className="text-slate-600 text-sm mb-4">{t('HeadingStep.subtitle')}</p>

                        {/* Progress Bar */}
                        <div className="mb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1">
                                <span className="text-sm font-medium text-slate-700">{t('HeadingStep.progress.label', { completed: completedRequiredFields, total: requiredFields.length })}</span>
                                <span className="text-sm text-slate-500">{t('HeadingStep.progress.percentage', { percentage: Math.round(totalProgress) })}</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div className={`h-2 rounded-full transition-all duration-300 ${isStepComplete ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${totalProgress}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Personal Information Section */}
                <SectionCard
                    title={t('HeadingStep.sections.personalInfo.title')}
                    icon={
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    }
                    iconColor="text-blue-600"
                    badge={t('HeadingStep.sections.personalInfo.badge', { completed: ['firstname', 'lastname', 'occupation'].filter((field) => formData[field].trim() !== '').length })}>
                    <div className="space-y-4">
                        {/* Photo and Name Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                            {/* Photo Upload */}
                            <div className="lg:col-span-1 order-1 lg:order-1">
                                <PhotoUpload label={t('HeadingStep.fields.profilePhoto.label')} value={formData.photo} onChange={handlePhotoChange} hint={t('HeadingStep.fields.profilePhoto.hint')} />
                            </div>

                            {/* Name Fields */}
                            <div className="lg:col-span-2 order-2 lg:order-2 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <InputField
                                        label={t('HeadingStep.fields.firstName.label')}
                                        name="firstname"
                                        placeholder={t('HeadingStep.fields.firstName.placeholder')}
                                        value={formData.firstname}
                                        onChange={handleInputChange}
                                        onBlur={handleInputBlur}
                                        required={true}
                                        error={touched.firstname ? errors.firstname : ''}
                                    />
                                    <InputField
                                        label={t('HeadingStep.fields.lastName.label')}
                                        name="lastname"
                                        placeholder={t('HeadingStep.fields.lastName.placeholder')}
                                        value={formData.lastname}
                                        onChange={handleInputChange}
                                        onBlur={handleInputBlur}
                                        required={true}
                                        error={touched.lastname ? errors.lastname : ''}
                                    />
                                </div>

                                {/* Profession */}
                                <AutocompleteInputField
                                    label={t('HeadingStep.fields.jobTitle.label')}
                                    name="occupation"
                                    placeholder={t('HeadingStep.fields.jobTitle.placeholder')}
                                    value={formData.occupation}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    required={true}
                                    suggestionType="jobTitle"
                                    error={touched.occupation ? errors.occupation : ''}
                                    hint={t('HeadingStep.fields.jobTitle.hint')}
                                />
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* Contact Information Section */}
                <SectionCard
                    title={t('HeadingStep.sections.contactInfo.title')}
                    icon={
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                        </svg>
                    }
                    iconColor="text-green-600"
                    badge={t('HeadingStep.sections.contactInfo.badge', { completed: ['email', 'phone'].filter((field) => formData[field].trim() !== '').length })}>
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <div>
                                    <h4 className="text-sm font-medium text-blue-900 mb-1">{t('HeadingStep.tips.contactInfo.title')}</h4>
                                    <p className="text-sm text-blue-700">{t('HeadingStep.tips.contactInfo.description')}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InputField
                                label={t('HeadingStep.fields.email.label')}
                                name="email"
                                type="email"
                                placeholder={t('HeadingStep.fields.email.placeholder')}
                                value={formData.email}
                                onChange={handleInputChange}
                                onBlur={handleInputBlur}
                                required={true}
                                error={touched.email ? errors.email : ''}
                                hint={t('HeadingStep.fields.email.hint')}
                            />
                            <InputField
                                label={t('HeadingStep.fields.phone.label')}
                                name="phone"
                                type="tel"
                                placeholder={t('HeadingStep.fields.phone.placeholder')}
                                value={formData.phone}
                                onChange={handleInputChange}
                                onBlur={handleInputBlur}
                                required={true}
                                error={touched.phone ? errors.phone : ''}
                                hint={t('HeadingStep.fields.phone.hint')}
                            />
                        </div>
                    </div>
                </SectionCard>

                {/* Location Information Section */}
                <SectionCard
                    title={t('HeadingStep.sections.locationInfo.title')}
                    icon={
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    }
                    iconColor="text-purple-600"
                    badge={completedOptionalFields > 0 ? t('HeadingStep.sections.locationInfo.badgeWithCount', { completed: completedOptionalFields }) : t('HeadingStep.sections.locationInfo.badge')}>
                    <div className="space-y-4">
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <div>
                                    <h4 className="text-sm font-medium text-purple-900 mb-1">{t('HeadingStep.tips.locationInfo.title')}</h4>
                                    <p className="text-sm text-purple-700">{t('HeadingStep.tips.locationInfo.description')}</p>
                                </div>
                            </div>
                        </div>

                        <InputField
                            label={t('HeadingStep.fields.address.label')}
                            name="address"
                            placeholder={t('HeadingStep.fields.address.placeholder')}
                            value={formData.address}
                            onChange={handleInputChange}
                            hint={t('HeadingStep.fields.address.hint')}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <AutocompleteInputField
                                label={t('HeadingStep.fields.city.label')}
                                name="city"
                                placeholder={t('HeadingStep.fields.city.placeholder')}
                                value={formData.city}
                                onChange={handleInputChange}
                                suggestionType="city"
                            />
                            <InputField
                                label={t('HeadingStep.fields.postalCode.label')}
                                name="postalcode"
                                placeholder={t('HeadingStep.fields.postalCode.placeholder')}
                                value={formData.postalcode}
                                onChange={handleInputChange}
                            />
                            <InputField
                                label={t('HeadingStep.fields.country.label')}
                                name="country"
                                placeholder={t('HeadingStep.fields.country.placeholder')}
                                value={formData.country}
                                onChange={handleInputChange}
                            />
                        </div>
                    </div>
                </SectionCard>

                {/* Online Profiles & Social Links Section */}
                <SectionCard
                    title={t('HeadingStep.sections.socialLinks.title', 'Online Profiles & Links')}
                    icon={
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    }
                    iconColor="text-indigo-600"
                    badge={['website', 'linkedin', 'github'].filter((f) => (formData[f] || '').trim() !== '').length > 0
                        ? `${['website', 'linkedin', 'github'].filter((f) => (formData[f] || '').trim() !== '').length} Added`
                        : 'Optional'}>
                    <div className="space-y-4">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fillRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <div>
                                    <h4 className="text-sm font-medium text-indigo-900 mb-1">Showcase Your Online Presence</h4>
                                    <p className="text-sm text-indigo-700">Add your personal portfolio website, LinkedIn profile, or GitHub repository to impress recruiters.</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <InputField
                                label={t('HeadingStep.fields.website.label', 'Website / Portfolio')}
                                name="website"
                                type="url"
                                placeholder="https://yourportfolio.com"
                                value={formData.website}
                                onChange={handleInputChange}
                                hint="Your personal blog, portfolio or personal page"
                            />
                            <InputField
                                label={t('HeadingStep.fields.linkedin.label', 'LinkedIn Profile')}
                                name="linkedin"
                                placeholder="linkedin.com/in/username"
                                value={formData.linkedin}
                                onChange={handleInputChange}
                                hint="Your LinkedIn public profile URL"
                            />
                            <InputField
                                label={t('HeadingStep.fields.github.label', 'GitHub / Portfolio')}
                                name="github"
                                placeholder="github.com/username"
                                value={formData.github}
                                onChange={handleInputChange}
                                hint="Your GitHub or developer profile"
                            />
                        </div>
                    </div>
                </SectionCard>

                {/* Completion Status */}
                {isStepComplete && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-green-900">{t('HeadingStep.completion.title')}</h3>
                                <p className="text-sm text-green-700">{t('HeadingStep.completion.description')}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HeadingStep;
