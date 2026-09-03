import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MdExpandMore, MdExpandLess, MdAutoAwesome, MdCheck, MdClose } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import PhotoUpload from './components/PhotoUpload';
import { getCandidateContext, extractTargetRoleFromJd } from '../../../utils/candidateContext';
import { extractJdKeywords } from '../../../utils/atsScore';
import { generateUserAiContent } from '../../../services/aiService';

const aiRoleCache = {};

function getOrganicRoleProgressions(baseRole) {
    const role = String(baseRole || '').trim();
    if (!role || role.length < 2) return [];
    const clean = role.replace(/^(?:Senior|Lead|Principal|Junior|Staff|Chief|Head of|Associate)\s+/i, '').trim();
    return [
        `Senior ${clean}`,
        `Lead ${clean}`,
        `Principal ${clean}`,
        `${clean} Manager`,
        `Director of ${clean}`,
        `${clean} Specialist`,
    ];
}

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
    const [targetJd, setTargetJd] = useState(resumeData?.targetJobDescription || '');
    const [targetRole, setTargetRole] = useState(resumeData?.targetRole || '');
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [moreOpen, setMoreOpen] = useState(
        Boolean(resumeData?.website || resumeData?.linkedin || resumeData?.github || resumeData?.address || resumeData?.postalcode),
    );

    const [isGeneratingJd, setIsGeneratingJd] = useState(false);
    const [jdAutofillMessage, setJdAutofillMessage] = useState('');
    const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
    const [aiRoleSuggestions, setAiRoleSuggestions] = useState([]);
    const [isFetchingAiRoles, setIsFetchingAiRoles] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const roleInputContainerRef = useRef(null);

    const candidateContext = getCandidateContext({ ...resumeData, targetRole }, targetJd || resumeData?.targetJobDescription || '');

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
        if (resumeData.targetJobDescription !== undefined) {
            setTargetJd(resumeData.targetJobDescription || '');
        }
        if (resumeData.targetRole !== undefined) {
            setTargetRole(resumeData.targetRole || '');
        }
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

        const isComplete = requiredFields.every((field) => String(formData[field] || '').trim() !== '') && allValid;
        const completedSteps = [...(resumeData?.completedSteps || [])];
        let updatedCompletedSteps = null;

        if (isComplete && !completedSteps.includes(1)) {
            updatedCompletedSteps = [...completedSteps, 1];
        } else if (!isComplete && completedSteps.includes(1)) {
            updatedCompletedSteps = completedSteps.filter((step) => step !== 1);
        }

        updateResumeData({
            ...formData,
            targetRole,
            targetJobDescription: targetJd,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData, targetRole, targetJd]);

    // Unmount flush: synchronously commit form data on step exit
    const formDataRef = useRef(formData);
    const targetRoleRef = useRef(targetRole);
    const targetJdRef = useRef(targetJd);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { formDataRef.current = formData; }, [formData]);
    useEffect(() => { targetRoleRef.current = targetRole; }, [targetRole]);
    useEffect(() => { targetJdRef.current = targetJd; }, [targetJd]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const data = formDataRef.current;
        const complete = requiredFields.every((field) => String(data[field] || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (complete && !completedSteps.includes(1)) {
            updatedCompletedSteps = [...completedSteps, 1];
        } else if (!complete && completedSteps.includes(1)) {
            updatedCompletedSteps = completedSteps.filter((step) => step !== 1);
        }
        updateResumeDataRef.current({
            ...data,
            targetRole: targetRoleRef.current,
            targetJobDescription: targetJdRef.current,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Automatic AI role suggestion fetcher (debounced, with cache)
    useEffect(() => {
        if (!roleDropdownOpen) return;
        const query = String(targetRole || formData.occupation || '').trim();
        if (!query || query.length < 2) return;

        const cacheKey = `role_${query.toLowerCase()}`;
        if (aiRoleCache[cacheKey]) {
            setAiRoleSuggestions(aiRoleCache[cacheKey]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsFetchingAiRoles(true);
            try {
                const res = await generateUserAiContent('autocomplete', {
                    type: 'jobTitle',
                    query,
                    context: {
                        facts: candidateContext?.facts || {},
                        target: { role: query },
                    },
                });
                if (Array.isArray(res?.suggestions) && res.suggestions.length) {
                    aiRoleCache[cacheKey] = res.suggestions;
                    setAiRoleSuggestions(res.suggestions);
                }
            } catch (err) {
                console.warn('[HeadingStep] AI role autocomplete failed:', err);
            } finally {
                setIsFetchingAiRoles(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [roleDropdownOpen, targetRole, formData.occupation, candidateContext]);

    const suggestedRoles = useMemo(() => {
        const query = String(targetRole || '').trim().toLowerCase();
        const occ = String(formData.occupation || '').trim();

        // 1. Dynamic seniority progression derived from candidate's actual occupation
        const organicProgressions = occ ? getOrganicRoleProgressions(occ) : [];

        // 2. Candidate's own past role titles from resumeData
        const pastRoles = (resumeData?.employments || [])
            .map((e) => String(e.jobTitle || '').trim())
            .filter((title) => title && title.toLowerCase() !== occ.toLowerCase());

        // 3. Dynamic AI-generated suggestions
        const allCandidates = [
            ...aiRoleSuggestions,
            ...organicProgressions,
            ...pastRoles,
        ];

        const seen = new Set();
        const unique = [];
        for (const item of allCandidates) {
            const trimmed = String(item || '').trim();
            const norm = trimmed.toLowerCase();
            if (trimmed && !seen.has(norm)) {
                seen.add(norm);
                unique.push(trimmed);
            }
        }

        if (!query) {
            return unique.slice(0, 8);
        }

        const matched = unique.filter((r) => r.toLowerCase().includes(query));
        return (matched.length > 0 ? matched : unique).slice(0, 8);
    }, [targetRole, formData.occupation, aiRoleSuggestions, resumeData?.employments]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (roleInputContainerRef.current && !roleInputContainerRef.current.contains(event.target)) {
                setRoleDropdownOpen(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectTargetRole = (selectedRole) => {
        setTargetRole(selectedRole);
        targetRoleRef.current = selectedRole;
        setRoleDropdownOpen(false);
        setHighlightedIndex(-1);
        handleSave();
    };

    const handleFetchAiRoleSuggestions = async () => {
        const query = String(targetRole || formData.occupation || '').trim();
        if (!query || isFetchingAiRoles) return;
        setIsFetchingAiRoles(true);
        try {
            const res = await generateUserAiContent('autocomplete', {
                type: 'jobTitle',
                query,
            });
            if (Array.isArray(res?.suggestions) && res.suggestions.length) {
                setAiRoleSuggestions(res.suggestions);
                setRoleDropdownOpen(true);
            }
        } catch (err) {
            console.warn('[HeadingStep] AI role autocomplete failed:', err);
        } finally {
            setIsFetchingAiRoles(false);
        }
    };

    const handleRoleKeyDown = (e) => {
        if (!roleDropdownOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setRoleDropdownOpen(true);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev < suggestedRoles.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestedRoles.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < suggestedRoles.length) {
                handleSelectTargetRole(suggestedRoles[highlightedIndex]);
            } else {
                setRoleDropdownOpen(false);
            }
        } else if (e.key === 'Escape') {
            setRoleDropdownOpen(false);
            setHighlightedIndex(-1);
        }
    };

    const handleAutofillJd = async () => {
        const effectiveRole = String(targetRole || formData.occupation || '').trim();
        if (!effectiveRole) {
            setJdAutofillMessage('Please enter or select a Target Job Title first.');
            setTimeout(() => setJdAutofillMessage(''), 4000);
            return;
        }

        if (targetJd && targetJd.trim().length >= 30) {
            const confirmed = window.confirm(
                `Your target requirements already contain text. Do you want to replace it with AI-generated requirements for "${effectiveRole}"?`
            );
            if (!confirmed) return;
        }

        setIsGeneratingJd(true);
        setJdAutofillMessage('');
        try {
            const res = await generateUserAiContent('generate-content', {
                operation: 'generate-job-description',
                payload: {
                    targetRole: effectiveRole,
                    occupation: formData.occupation || '',
                },
            });

            const generatedText = typeof res?.jobDescription === 'string'
                ? res.jobDescription
                : (typeof res?.text === 'string' ? res.text : '');

            if (generatedText) {
                setTargetJd(generatedText);
                targetJdRef.current = generatedText;
                updateResumeData({
                    ...formData,
                    targetRole,
                    targetJobDescription: generatedText,
                });
                setJdAutofillMessage(`✨ Requirements generated and autofilled for ${effectiveRole}!`);
                setTimeout(() => setJdAutofillMessage(''), 5000);
            }
        } catch (err) {
            console.error('[HeadingStep] Failed to generate job description:', err);
            setJdAutofillMessage('Failed to generate requirements. Please try again.');
            setTimeout(() => setJdAutofillMessage(''), 4000);
        } finally {
            setIsGeneratingJd(false);
        }
    };

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
            <form onSubmit={(e) => e.preventDefault()} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-5">
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

                {/* Optional Target Job Description Tailoring */}
                <div className="border-t border-slate-100 pt-3">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                                <span>🎯 Target Role & Job Description (Optional)</span>
                            </span>
                            {(targetJd && targetJd.trim().length > 0) || (targetRole && targetRole.trim().length > 0) ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Tailored ✓
                                </span>
                            ) : null}
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-500">
                            Specifying your target role and pasting the job description allows the AI copilot and ATS engine to highlight missing keywords, tailor summaries, and suggest relevant skills across all subsequent steps.
                        </p>
                        {/* Target Role with Auto AI Dropdown */}
                        <div ref={roleInputContainerRef} className="relative">
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-semibold text-slate-700">
                                    Target Job Title (Optional)
                                </label>
                                <span className="text-[10px] text-slate-400">
                                    Select or type your destination role
                                </span>
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={targetRole}
                                    onChange={(e) => {
                                        setTargetRole(e.target.value);
                                        setRoleDropdownOpen(true);
                                    }}
                                    onFocus={() => setRoleDropdownOpen(true)}
                                    onKeyDown={handleRoleKeyDown}
                                    placeholder="e.g. Senior Data Analyst (if transitioning or targeting a different role)"
                                    className="w-full rounded-lg border border-slate-200 bg-white pl-3 pr-16 py-1.5 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    {targetRole && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetRole('');
                                                targetRoleRef.current = '';
                                                handleSave();
                                            }}
                                            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
                                            title="Clear target role"
                                        >
                                            <MdClose className="w-3 h-3" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setRoleDropdownOpen((prev) => !prev)}
                                        className="p-1 text-indigo-600 hover:text-indigo-800 rounded-md hover:bg-indigo-50"
                                        title="Toggle role suggestions"
                                    >
                                        {roleDropdownOpen ? <MdExpandLess className="w-4 h-4" /> : <MdExpandMore className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Intelligent Auto AI Dropdown */}
                            {roleDropdownOpen && (
                                <div className="absolute z-30 mt-1 w-full rounded-xl border border-indigo-200/90 bg-white shadow-xl overflow-hidden text-xs">
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50/70 border-b border-indigo-100 text-[10px] font-semibold text-indigo-950">
                                        <span className="flex items-center gap-1">
                                            <MdAutoAwesome className="w-3 h-3 text-indigo-600" />
                                            <span>AI Role Suggestions</span>
                                            {isFetchingAiRoles && (
                                                <span className="inline-block w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin ml-1"></span>
                                            )}
                                        </span>
                                        <span className="text-slate-400 font-normal">
                                            {suggestedRoles.length} suggestions
                                        </span>
                                    </div>
                                    {suggestedRoles.length === 0 && isFetchingAiRoles && (
                                        <div className="p-4 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                                            <span className="inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                            <span>Consulting AI for role suggestions…</span>
                                        </div>
                                    )}
                                    <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 py-1">
                                        {suggestedRoles.map((roleItem, index) => {
                                            const isSelected = targetRole && targetRole.toLowerCase() === roleItem.toLowerCase();
                                            const isHighlighted = index === highlightedIndex;
                                            return (
                                                <li key={roleItem}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectTargetRole(roleItem)}
                                                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                                                            isHighlighted || isSelected
                                                                ? 'bg-indigo-50/90 text-indigo-950 font-semibold'
                                                                : 'text-slate-700 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="text-indigo-500 font-bold">•</span>
                                                            <span>{roleItem}</span>
                                                        </span>
                                                        {isSelected && (
                                                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                                                                <MdCheck className="w-3 h-3" />
                                                                <span>Selected</span>
                                                            </span>
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                        {targetRole && targetRole.trim().length >= 2 && (
                                            <li className="p-1 bg-slate-50/60">
                                                <button
                                                    type="button"
                                                    onClick={handleFetchAiRoleSuggestions}
                                                    disabled={isFetchingAiRoles}
                                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50/60 border border-indigo-200/70 rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                                                >
                                                    {isFetchingAiRoles ? (
                                                        <>
                                                            <span className="inline-block w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                                            <span>Consulting AI autocomplete…</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <MdAutoAwesome className="w-3 h-3 text-indigo-600" />
                                                            <span>More AI suggestions for &ldquo;{targetRole}&rdquo;</span>
                                                        </>
                                                    )}
                                                </button>
                                            </li>
                                        )}
                                    </ul>
                                    <div className="px-3 py-1 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                                        <span>Use ↑↓ to navigate, Enter to select</span>
                                        <button
                                            type="button"
                                            onClick={() => setRoleDropdownOpen(false)}
                                            className="text-slate-500 hover:text-slate-800 font-medium"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Target Job Description with Manual Autofill Button */}
                        <div>
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                                <label className="block text-[11px] font-semibold text-slate-700">
                                    Target Job Description / Key Requirements (Optional)
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAutofillJd}
                                    disabled={isGeneratingJd}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50/90 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg px-2.5 py-1 transition-all shadow-2xs disabled:opacity-50 cursor-pointer active:scale-95"
                                    title="Auto-fill realistic requirements using AI for this target role"
                                >
                                    {isGeneratingJd ? (
                                        <>
                                            <span className="inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                            <span>Generating requirements…</span>
                                        </>
                                    ) : (
                                        <>
                                            <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>Autofill Requirements</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {jdAutofillMessage && (
                                <div className={`text-[11px] px-2.5 py-1.5 rounded-lg mb-1.5 flex items-center justify-between font-medium ${
                                    jdAutofillMessage.startsWith('✨')
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                    <span>{jdAutofillMessage}</span>
                                    <button
                                        type="button"
                                        onClick={() => setJdAutofillMessage('')}
                                        className="text-slate-400 hover:text-slate-600 ml-2"
                                    >
                                        <MdClose className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            <textarea
                                rows={3}
                                value={targetJd}
                                onChange={(e) => setTargetJd(e.target.value)}
                                placeholder="Paste the target job description or click 'Autofill Requirements' above to generate realistic expectations for this role…"
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>

                        {(() => {
                            if (!targetJd || targetJd.trim().length < 20) return null;
                            const detectedRole = extractTargetRoleFromJd(targetJd);
                            const extractedKeywords = extractJdKeywords(targetJd, { limit: 6 });
                            return (
                                <div className="mt-2.5 pt-2.5 border-t border-indigo-100/80 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px] flex-wrap gap-1">
                                        <span className="font-bold text-indigo-950 flex items-center gap-1.5 flex-wrap">
                                            <span>✨ Detected Requirements:</span>
                                            {detectedRole && (
                                                <span className="font-semibold text-indigo-700 bg-indigo-100/70 border border-indigo-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                                    Role: {detectedRole}
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                            {extractedKeywords.length} key domains parsed
                                        </span>
                                    </div>
                                    {extractedKeywords.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {extractedKeywords.map((kw, i) => (
                                                <span key={`kw-${i}`} className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-indigo-200/80 text-[10px] font-medium text-slate-700 shadow-2xs">
                                                    {kw.term}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </form>
        </StepShell>
    );
};

export default HeadingStep;
