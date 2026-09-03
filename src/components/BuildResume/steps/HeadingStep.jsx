import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import PhotoUpload from './components/PhotoUpload';
import { getCandidateContext } from '../../../utils/candidateContext';

/**
 * Heading — one form card: name, contact, target title, location.
 * Optional links/extra fields live behind a quiet "Add more details"
 * disclosure. No AI in this step. Gap list lives in the Guide rail.
 */
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
    const [moreOpen, setMoreOpen] = useState(
        Boolean(resumeData?.website || resumeData?.linkedin || resumeData?.github || resumeData?.address || resumeData?.postalcode),
    );

    const candidateContext = getCandidateContext(resumeData, resumeData?.targetJobDescription || '');

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

    const requiredFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) validateField(name, value);
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
            error = t('HeadingStep.errors.invalidEmail', 'That does not look like a valid email address.');
        } else if (name === 'phone' && value && !/^\+?[1-9][\d]{0,15}$/.test(String(value).replace(/[\s\-()]/g, ''))) {
            error = t('HeadingStep.errors.invalidPhone', 'That does not look like a valid phone number.');
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
            if (!validateField(field, formData[field])) allValid = false;
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
        <StepShell
            stepNumber={1}
            stepPath="heading"
            title={t('HeadingStep.title', 'Your details')}
            subtitle={t('HeadingStep.subtitle', 'How recruiters reach you, and the role you are targeting.')}
            isComplete={isStepComplete}
            statusBadge={`${completedRequiredFields}/${requiredFields.length} required fields`}
            resumeData={resumeData}
            targetJd={resumeData?.targetJobDescription || ''}
        >
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-5">
                {/* Identity */}
                <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
                        <div className="shrink-0 pt-0.5">
                            <PhotoUpload
                                label=""
                                value={formData.photo}
                                onChange={handlePhotoChange}
                                showPhoto={formData.showPhoto !== false}
                                onToggleShowPhoto={(show) => setFormData(prev => ({ ...prev, showPhoto: show }))}
                                compact
                                hint=""
                            />
                        </div>
                        <div className="flex-1 min-w-0 w-full space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field
                                    label={t('HeadingStep.fields.firstName.label', 'First name')}
                                    name="firstname"
                                    placeholder={t('HeadingStep.fields.firstName.placeholder', 'Your first name')}
                                    value={formData.firstname}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    required
                                    error={touched.firstname ? errors.firstname : ''}
                                />
                                <Field
                                    label={t('HeadingStep.fields.lastName.label', 'Last name')}
                                    name="lastname"
                                    placeholder={t('HeadingStep.fields.lastName.placeholder', 'Your last name')}
                                    value={formData.lastname}
                                    onChange={handleInputChange}
                                    onBlur={handleInputBlur}
                                    required
                                    error={touched.lastname ? errors.lastname : ''}
                                />
                            </div>
                            <AutocompleteInputField
                                label={t('HeadingStep.fields.jobTitle.label', 'Target job title')}
                                name="occupation"
                                placeholder={t('HeadingStep.fields.jobTitle.placeholder', 'Enter the job title you are applying for')}
                                value={formData.occupation}
                                onChange={handleInputChange}
                                onBlur={handleInputBlur}
                                required
                                suggestionType="jobTitle"
                                context={candidateContext}
                                error={touched.occupation ? errors.occupation : ''}
                            />
                        </div>
                    </div>
                </div>

                {/* Contact & location */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field
                            label={t('HeadingStep.fields.email.label', 'Email')}
                            name="email"
                            type="email"
                            placeholder={t('HeadingStep.fields.email.placeholder', 'you@example.com')}
                            value={formData.email}
                            onChange={handleInputChange}
                            onBlur={handleInputBlur}
                            required
                            error={touched.email ? errors.email : ''}
                        />
                        <Field
                            label={t('HeadingStep.fields.phone.label', 'Phone')}
                            name="phone"
                            type="tel"
                            inputMode="tel"
                            placeholder={t('HeadingStep.fields.phone.placeholder', 'With country code, e.g. +91 98765 43210')}
                            value={formData.phone}
                            onChange={handleInputChange}
                            onBlur={handleInputBlur}
                            required
                            error={touched.phone ? errors.phone : ''}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field
                            label={t('HeadingStep.fields.city.label', 'City')}
                            name="city"
                            placeholder={t('HeadingStep.fields.city.placeholder', 'Enter your city')}
                            value={formData.city}
                            onChange={handleInputChange}
                        />
                        <Field
                            label={t('HeadingStep.fields.country.label', 'Country')}
                            name="country"
                            placeholder={t('HeadingStep.fields.country.placeholder', 'Enter your country')}
                            value={formData.country}
                            onChange={handleInputChange}
                        />
                    </div>
                </div>

                {/* Optional extras */}
                <div className="border-t border-slate-100 pt-3">
                    <button
                        type="button"
                        onClick={() => setMoreOpen(prev => !prev)}
                        aria-expanded={moreOpen}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        {moreOpen ? <MdExpandLess className="w-4 h-4" /> : <MdExpandMore className="w-4 h-4" />}
                        More details (optional)
                    </button>
                    {moreOpen && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <Field
                                label={t('HeadingStep.fields.address.label', 'Address')}
                                name="address"
                                placeholder={t('HeadingStep.fields.address.placeholder', 'Street address')}
                                value={formData.address}
                                onChange={handleInputChange}
                            />
                            <Field
                                label={t('HeadingStep.fields.postalCode.label', 'Postal code')}
                                name="postalcode"
                                placeholder={t('HeadingStep.fields.postalCode.placeholder', 'PIN / postal code')}
                                value={formData.postalcode}
                                onChange={handleInputChange}
                            />
                            <Field
                                label={t('HeadingStep.fields.linkedin.label', 'LinkedIn')}
                                name="linkedin"
                                placeholder="linkedin.com/in/yourname"
                                value={formData.linkedin}
                                onChange={handleInputChange}
                            />
                            <Field
                                label={t('HeadingStep.fields.website.label', 'Portfolio / website')}
                                name="website"
                                type="url"
                                placeholder="https://yourportfolio.com"
                                value={formData.website}
                                onChange={handleInputChange}
                            />
                            <Field
                                label={t('HeadingStep.fields.github.label', 'Professional profile / repository')}
                                name="github"
                                placeholder="github.com/yourname"
                                value={formData.github}
                                onChange={handleInputChange}
                                className="sm:col-span-2"
                            />
                        </div>
                    )}
                </div>
            </div>
        </StepShell>
    );
};

export default HeadingStep;
