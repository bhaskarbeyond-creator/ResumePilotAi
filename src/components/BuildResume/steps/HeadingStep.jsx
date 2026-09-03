import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdPerson, MdPlace, MdPublic, MdCheck } from 'react-icons/md';
import InputField from './components/InputField';
import PhotoUpload from './components/PhotoUpload';
import AutocompleteInputField from './components/AutocompleteInputField';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';

const HeadingStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');

    const [formData, setFormData] = useState({
        firstname: resumeData?.firstname || '',
        lastname: resumeData?.lastname || '',
        email: resumeData?.email || '',
        phone: resumeData?.phone || '',
        country: resumeData?.country || '',
        city: resumeData?.city || '',
        address: resumeData?.address || '',
        postalcode: resumeData?.postalcode || '',
        occupation: resumeData?.occupation || '',
        photo: resumeData?.photo || null,
        showPhoto: resumeData?.showPhoto !== undefined ? resumeData.showPhoto : true,
        website: resumeData?.website || '',
        linkedin: resumeData?.linkedin || '',
        github: resumeData?.github || '',
    });

    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    // Keep formData in sync if parent resumeData updates externally
    useEffect(() => {
        if (!resumeData) return;
        setFormData((prev) => ({
            ...prev,
            firstname: resumeData.firstname || '',
            lastname: resumeData.lastname || '',
            email: resumeData.email || '',
            phone: resumeData.phone || '',
            country: resumeData.country || '',
            city: resumeData.city || '',
            address: resumeData.address || '',
            postalcode: resumeData.postalcode || '',
            occupation: resumeData.occupation || '',
            photo: resumeData.photo || null,
            showPhoto: resumeData.showPhoto !== undefined ? resumeData.showPhoto : true,
            website: resumeData.website || '',
            linkedin: resumeData.linkedin || '',
            github: resumeData.github || '',
        }));
    }, [resumeData]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));

        if (errors[name]) {
            validateField(name, value);
        }
    };

    const handleInputBlur = (e) => {
        const { name, value } = e.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        validateField(name, value);
    };

    const validateField = (name, value) => {
        let error = '';

        if (requiredFields.includes(name) && (!value || String(value).trim() === '')) {
            error = t('HeadingStep.errors.required', { field: name.charAt(0).toUpperCase() + name.slice(1) });
        } else if (name === 'email' && value && !/\S+@\S+\.\S+/.test(String(value))) {
            error = t('HeadingStep.errors.invalidEmail');
        } else if (name === 'phone' && value && !/^[+]?[1-9][\d]{0,15}$/.test(String(value).replace(/[\s\-()]/g, ''))) {
            error = t('HeadingStep.errors.invalidPhone');
        }

        setErrors((prev) => ({ ...prev, [name]: error }));
        return error === '';
    };

    const handlePhotoChange = (photo) => {
        setFormData((prev) => ({ ...prev, photo }));
    };

    const handleSave = () => {
        let allValid = true;

        requiredFields.forEach((field) => {
            if (!validateField(field, formData[field])) {
                allValid = false;
            }
        });

        updateResumeData(formData);

        const isComplete = requiredFields.every((field) => String(formData[field] || '').trim() !== '') && allValid;

        if (isComplete) {
            const completedSteps = [...(resumeData?.completedSteps || [])];
            if (!completedSteps.includes(1)) {
                completedSteps.push(1);
                updateResumeData({ ...formData, completedSteps });
            }
        } else {
            const completedSteps = [...(resumeData?.completedSteps || [])];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData]);

    const requiredFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];

    // Unmount flush: synchronously commit form data on step exit
    const formDataRef = useRef(formData);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { formDataRef.current = formData; }, [formData]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const data = formDataRef.current;
        updateResumeDataRef.current(data);
        const complete = requiredFields.every((field) => String(data[field] || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        if (complete && !completedSteps.includes(1)) {
            completedSteps.push(1);
            updateResumeDataRef.current({ ...data, completedSteps });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const completedRequiredFields = requiredFields.filter((field) => String(formData[field] || '').trim() !== '').length;
    const isStepComplete = completedRequiredFields === requiredFields.length;

    return (
        <StepWorkspaceLayout
            stepNumber={1}
            stepPath="heading"
            title={t('HeadingStep.title', 'Personal Details')}
            subtitle={t('HeadingStep.subtitle', 'Provide your core contact details so employers and automated systems can reach you.')}
            isComplete={isStepComplete}
            statusBadge={`${completedRequiredFields}/${requiredFields.length} Required`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            {/* Unified High-Density Editor Panel */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-4">
                {/* Candidate ATS Recruiter Screening Index (Top Studio Header) */}
                <div className={`px-4 py-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all shadow-2xs ${
                    isStepComplete 
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                        : 'bg-slate-50/90 border-slate-200/90 text-slate-800'
                }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isStepComplete ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500'}`} />
                        <div className="min-w-0">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block">
                                ATS Recruiter Search Index
                            </span>
                            <span className="font-bold text-slate-900 truncate block">
                                {formData.firstname || formData.lastname ? `${formData.firstname || ''} ${formData.lastname || ''}`.trim() : 'Candidate Name'}
                                {' • '}
                                <span className="text-indigo-600">{formData.occupation || 'Target Job Title'}</span>
                                {' • '}
                                <span className="text-slate-500">{[formData.city, formData.country].filter(Boolean).join(', ') || 'Location'}</span>
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-md border ${
                            isStepComplete
                                ? 'bg-white text-emerald-700 border-emerald-200'
                                : 'bg-white text-indigo-700 border-indigo-200'
                        }`}>
                            {isStepComplete ? '✓ 100% Reachable' : `${completedRequiredFields} of ${requiredFields.length} Core Fields`}
                        </span>
                    </div>
                </div>

                {/* Block 1: Identity & Professional Headline */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <MdPerson className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Identity & Professional Headline</span>
                        </h2>
                        <span className="text-[10px] font-bold text-slate-400">Required</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 items-start">
                        {/* Profile Avatar */}
                        <div className="shrink-0 pt-0.5">
                            <PhotoUpload
                                label=""
                                value={formData.photo}
                                onChange={handlePhotoChange}
                                showPhoto={formData.showPhoto !== false}
                                onToggleShowPhoto={(show) => setFormData((prev) => ({ ...prev, showPhoto: show }))}
                                compact={true}
                                hint=""
                            />
                        </div>

                        {/* Name and Professional Title Fields */}
                        <div className="flex-1 min-w-0 w-full space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <InputField
                                    label={t('HeadingStep.fields.firstName.label', 'First Name')}
                                    name="firstname"
                                    placeholder={t('HeadingStep.fields.firstName.placeholder', 'e.g. Alex, Sarah, Aarav')}
                                    value={formData.firstname}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    required={true}
                                    error={touched.firstname ? errors.firstname : ''}
                                />
                                <InputField
                                    label={t('HeadingStep.fields.lastName.label', 'Last Name')}
                                    name="lastname"
                                    placeholder={t('HeadingStep.fields.lastName.placeholder', 'e.g. Morgan, Taylor, Sharma')}
                                    value={formData.lastname}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    required={true}
                                    error={touched.lastname ? errors.lastname : ''}
                                />
                            </div>

                            <AutocompleteInputField
                                label={t('HeadingStep.fields.jobTitle.label', 'Job Title / Profession')}
                                name="occupation"
                                placeholder={t('HeadingStep.fields.jobTitle.placeholder', 'e.g. General Dentist, Corporate Lawyer, Senior Accountant, Project Manager')}
                                value={formData.occupation}
                                onChange={handleInputChange}
                                onBlur={handleInputBlur}
                                required={true}
                                suggestionType="jobTitle"
                                context={formData}
                                error={touched.occupation ? errors.occupation : ''}
                            />
                        </div>
                    </div>
                </div>

                {/* Block 2: Direct Contact & Geographic Location */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <MdPlace className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Direct Contact & Location</span>
                        </h2>
                        <span className="text-[10px] font-bold text-slate-400">Required & Geo-Filters</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InputField
                            label={t('HeadingStep.fields.email.label', 'Email Address')}
                            name="email"
                            type="email"
                            placeholder={t('HeadingStep.fields.email.placeholder', 'e.g. alex.morgan@example.com')}
                            value={formData.email}
                            onChange={handleInputChange}
                            onBlur={handleInputBlur}
                            required={true}
                            error={touched.email ? errors.email : ''}
                        />
                        <InputField
                            label={t('HeadingStep.fields.phone.label', 'Phone Number')}
                            name="phone"
                            type="tel"
                            placeholder={t('HeadingStep.fields.phone.placeholder', 'e.g. +1 555-019-2834 or +91 98765 43210')}
                            value={formData.phone}
                            onChange={handleInputChange}
                            onBlur={handleInputBlur}
                            required={true}
                            error={touched.phone ? errors.phone : ''}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <AutocompleteInputField
                            label={t('HeadingStep.fields.city.label', 'City')}
                            name="city"
                            placeholder={t('HeadingStep.fields.city.placeholder', 'e.g. New York, London, Mumbai')}
                            value={formData.city}
                            onChange={handleInputChange}
                            suggestionType="city"
                            context={formData}
                        />
                        <InputField
                            label={t('HeadingStep.fields.country.label', 'Country')}
                            name="country"
                            placeholder={t('HeadingStep.fields.country.placeholder', 'e.g. United States, United Kingdom, India')}
                            value={formData.country}
                            onChange={handleInputChange}
                        />
                        <InputField
                            label={t('HeadingStep.fields.address.label', 'Address')}
                            name="address"
                            placeholder={t('HeadingStep.fields.address.placeholder', 'e.g. 123 Main Street, Suite 400')}
                            value={formData.address}
                            onChange={handleInputChange}
                        />
                        <InputField
                            label={t('HeadingStep.fields.postalCode.label', 'PIN / Postal Code')}
                            name="postalcode"
                            placeholder={t('HeadingStep.fields.postalCode.placeholder', 'e.g. 10001, SW1A 1AA, 500081')}
                            value={formData.postalcode}
                            onChange={handleInputChange}
                        />
                    </div>
                </div>

                {/* Block 3: Online Presence & Portfolios */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <MdPublic className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Online Profiles & Portfolios</span>
                        </h2>
                        <span className="text-[10px] font-bold text-slate-400">Optional</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <InputField
                            label={t('HeadingStep.fields.linkedin.label', 'LinkedIn')}
                            name="linkedin"
                            placeholder="linkedin.com/in/username"
                            value={formData.linkedin}
                            onChange={handleInputChange}
                        />
                        <InputField
                            label={t('HeadingStep.fields.website.label', 'Portfolio / Website')}
                            name="website"
                            type="url"
                            placeholder="https://yourportfolio.com or yoursite.com"
                            value={formData.website}
                            onChange={handleInputChange}
                        />
                        <InputField
                            label={t('HeadingStep.fields.github.label', 'Professional Profile / Repository')}
                            name="github"
                            placeholder="e.g. github.com/user or dribbble.com/user"
                            value={formData.github}
                            onChange={handleInputChange}
                        />
                    </div>
                </div>
            </div>
        </StepWorkspaceLayout>
    );
};

export default HeadingStep;
