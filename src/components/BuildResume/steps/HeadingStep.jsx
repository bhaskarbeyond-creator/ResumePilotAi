import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MdExpandMore, MdExpandLess, MdAutoAwesome, MdCheck, MdClose } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import Field from '../components/Field.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import PhotoUpload from './components/PhotoUpload';
import ConfirmRegenerateModal from './components/ConfirmRegenerateModal';
import { getCandidateContext, extractTargetRoleFromJd } from '../../../utils/candidateContext';
import { extractJdKeywords } from '../../../utils/atsScore';
import { generateUserAiContent, getAiCacheScope } from '../../../services/aiService';
import { matchUniversalDirectory } from '../../../utils/autocompleteDirectories.js';

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
const HeadingStep = ({ resumeData, updateResumeData, onNavigate, onPreview }) => {
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
    const [tailoringOpen, setTailoringOpen] = useState(Boolean(resumeData?.targetRole || resumeData?.targetJobDescription));
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [moreOpen, setMoreOpen] = useState(
        Boolean(resumeData?.website || resumeData?.linkedin || resumeData?.github || resumeData?.address || resumeData?.postalcode),
    );
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [assistantTab, setAssistantTab] = useState('suggestions');

    const [isGeneratingJd, setIsGeneratingJd] = useState(false);
    const [jdAutofillMessage, setJdAutofillMessage] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
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
        if (resumeData.targetRole || resumeData.targetJobDescription) {
            setTailoringOpen(true);
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

    const resetPersonalInformation = () => {
        // DIR-091: Reset is intentionally explicit (the confirmation state lives in
        // the visible section header). The normal autosave/unmount pipeline remains
        // the sole persistence path, so reset behaves exactly like user edits.
        setFormData({
            firstname: '', lastname: '', email: '', phone: '', country: '', city: '',
            address: '', postalcode: '', occupation: '', photo: null, showPhoto: true,
            website: '', linkedin: '', github: '',
        });
        setTargetRole('');
        setTargetJd('');
        targetRoleRef.current = '';
        targetJdRef.current = '';
        setTouched({});
        setErrors({});
        setMoreOpen(false);
        setResetConfirmOpen(false);
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

    const candidateContextRef = useRef(candidateContext);
    useEffect(() => { candidateContextRef.current = candidateContext; }, [candidateContext]);

    // Automatic AI role suggestion fetcher (debounced, with cache)
    useEffect(() => {
        if (!roleDropdownOpen) return;
        const query = String(targetRole || '').trim();
        if (!query || query.length < 2) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            // Suggestions are personalised by candidate facts: scope the cache to uid|tenant.
            const cacheKey = `${await getAiCacheScope()}_role_${query.toLowerCase()}`;
            if (cancelled) return;
            if (aiRoleCache[cacheKey]) {
                setAiRoleSuggestions(aiRoleCache[cacheKey]);
                return;
            }
            setIsFetchingAiRoles(true);
            try {
                const res = await generateUserAiContent('autocomplete', {
                    type: 'jobTitle',
                    query,
                    context: {
                        facts: candidateContextRef.current?.facts || {},
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
        }, 150);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [roleDropdownOpen, targetRole]);

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
        const aiList = aiRoleSuggestions || [];

        // If user is actively typing, prioritize pure AI suggestions
        if (query) {
            const qTokens = query.split(/\s+/).filter((t) => t.length >= 3);
            const matchedAi = aiList.filter((r) => {
                const rLower = String(r || '').toLowerCase();
                return rLower.includes(query) || (qTokens.length > 0 && qTokens.some((tok) => rLower.includes(tok)));
            });

            // Pure AI suggestions take top priority
            if (matchedAi.length > 0) {
                return [...new Set(matchedAi)].slice(0, 8);
            }

            // If AI is currently fetching, keep list clean or show candidate's past roles
            if (isFetchingAiRoles) {
                return [];
            }

            const matchedProg = organicProgressions.filter((r) => r.toLowerCase().includes(query));
            const matchedPast = pastRoles.filter((r) => r.toLowerCase().includes(query));
            const matchedDirectory = matchUniversalDirectory('jobTitle', query, 8);

            const combined = [...matchedProg, ...matchedPast, ...matchedDirectory];
            const seen = new Set();
            const unique = [];
            for (const item of combined) {
                const norm = String(item || '').trim().toLowerCase();
                if (norm && !seen.has(norm)) {
                    seen.add(norm);
                    unique.push(String(item).trim());
                }
            }
            return unique.slice(0, 8);
        }

        // When query is empty (focused or cleared):
        // Dynamically derive recommendations from candidate context or diverse modern careers
        let initialSources = [...organicProgressions, ...pastRoles];

        if (initialSources.length === 0 && resumeData?.educations?.length) {
            const eduField = resumeData.educations[0]?.degree || resumeData.educations[0]?.fieldOfStudy || '';
            if (eduField) {
                const eduMatches = matchUniversalDirectory('jobTitle', eduField.split(/\s+/)[0] || '', 6);
                initialSources = [...initialSources, ...eduMatches];
            }
        }

        if (initialSources.length === 0) {
            // Balanced, cross-industry modern careers across Healthcare, Finance, Engineering, Management, Creative, and Tech
            initialSources = [
                'Registered Nurse (RN)',
                'Senior Financial Analyst',
                'Software Engineer',
                'Product Manager',
                'Civil Project Engineer',
                'UI/UX Product Designer',
                'Operations Manager',
                'Cybersecurity Specialist',
            ];
        }

        const seen = new Set();
        const unique = [];
        for (const item of initialSources) {
            const norm = String(item || '').trim().toLowerCase();
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                unique.push(String(item).trim());
            }
        }
        return unique.slice(0, 8);
    }, [targetRole, formData.occupation, aiRoleSuggestions, resumeData?.employments, resumeData?.educations]);

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

    const executeAutofillJd = async () => {
        const effectiveRole = String(targetRole || formData.occupation || '').trim();
        if (!effectiveRole) return;

        setShowConfirmModal(false);
        setIsGeneratingJd(true);
        setJdAutofillMessage('');
        try {
            const res = await generateUserAiContent('generate-job-description', {
                targetRole: effectiveRole,
                occupation: formData.occupation || '',
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

    const handleAutofillJd = () => {
        const effectiveRole = String(targetRole || formData.occupation || '').trim();
        if (!effectiveRole) {
            setJdAutofillMessage('Please enter or select a Target Job Title first.');
            setTimeout(() => setJdAutofillMessage(''), 4000);
            return;
        }

        if (targetJd && targetJd.trim().length >= 30) {
            setShowConfirmModal(true);
            return;
        }

        executeAutofillJd();
    };

    const completedRequiredFields = requiredFields.filter((field) => String(formData[field] || '').trim() !== '').length;
    const isStepComplete = completedRequiredFields === requiredFields.length;

    const assistantRoleChips = useMemo(() => {
        const occ = String(formData.occupation || targetRole || '').trim();
        if (occ) {
            return getOrganicRoleProgressions(occ).slice(0, 3);
        }
        return ['Senior Product Designer', 'Lead UX/UI Designer', 'Product Design Lead'];
    }, [formData.occupation, targetRole]);

    const assistantSummaryStarters = useMemo(() => {
        const roleLabel = String(formData.occupation || targetRole || 'Product Designer').trim();
        return [
            `${roleLabel} with a track record of shipping high-impact digital products, measurable outcomes, and scalable systems.`,
            `User-focused ${roleLabel.toLowerCase()} specializing in cross-functional execution, research-backed decisions, and end-to-end delivery.`,
        ];
    }, [formData.occupation, targetRole]);

    const assistantSkillKeywords = useMemo(() => {
        if (targetJd && targetJd.trim().length >= 20) {
            const parsed = extractJdKeywords(targetJd, { limit: 8 }).map((k) => k.term).filter(Boolean);
            if (parsed.length > 0) return parsed;
        }
        return ['Figma', 'Design Systems', 'Prototyping', 'User Research', 'Wireframing', 'Usability Testing', 'Interaction Design', 'Agile'];
    }, [targetJd]);

    const existingSkillNames = useMemo(
        () => new Set(
            (Array.isArray(resumeData?.skills) ? resumeData.skills : [])
                .map((s) => String(typeof s === 'string' ? s : (s?.name || s?.skill || '')).trim().toLowerCase())
                .filter(Boolean),
        ),
        [resumeData?.skills],
    );

    const handleApplyAssistantRole = (roleTitle) => {
        const clean = String(roleTitle || '').trim();
        if (!clean) return;
        setFormData((prev) => ({ ...prev, occupation: clean }));
        updateResumeData({ ...formData, occupation: clean, targetRole, targetJobDescription: targetJd });
    };

    const handleApplyAssistantSummary = (summaryText) => {
        const clean = String(summaryText || '').trim();
        if (!clean) return;
        updateResumeData({ ...formData, summary: clean, targetRole, targetJobDescription: targetJd });
    };

    const handleAddAssistantSkill = (skillName) => {
        const clean = String(skillName || '').trim();
        if (!clean) return;
        const currentSkills = Array.isArray(resumeData?.skills) ? resumeData.skills : [];
        if (existingSkillNames.has(clean.toLowerCase())) return;
        const nextSkills = [...currentSkills, { name: clean, rating: 80 }];
        updateResumeData({ ...formData, skills: nextSkills, targetRole, targetJobDescription: targetJd });
    };

    return (
        <StepShell
            stepNumber={1}
            stepPath="heading"
            title={t('HeadingStep.title', 'Personal information')}
            subtitle={t('HeadingStep.subtitle', 'How recruiters reach you, and the role you are targeting.')}
            isComplete={isStepComplete}
            statusBadge={`${completedRequiredFields} of ${requiredFields.length} required fields`}
            resumeData={resumeData}
            targetJd={targetJd}
            headerActions={onPreview ? (
                <button
                    type="button"
                    onClick={onPreview}
                    aria-label="Preview resume"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z" />
                        <circle cx="12" cy="12" r="3" strokeWidth="2" />
                    </svg>
                    Preview
                </button>
            ) : null}
            guideChildren={(
                <div
                    data-testid="builder-career-assistant"
                    className="mt-3.5 border-t border-[var(--cuba-line)] pt-3.5 space-y-3"
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--cuba-primary-soft)] text-[var(--cuba-primary-strong)]">
                                <MdAutoAwesome className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <span className="truncate text-xs font-extrabold text-[var(--cuba-ink)]">AI Career Assistant</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cuba-success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--cuba-success)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--cuba-success)]" aria-hidden="true" />
                            Online
                        </span>
                    </div>

                    <div role="tablist" aria-label="AI Career Assistant tabs" className="flex items-center gap-0.5 rounded-lg bg-[var(--cuba-canvas)] p-1 border border-[var(--cuba-line)]">
                        {[
                            ['suggestions', 'Suggestions'],
                            ['insights', 'Resume Insights'],
                            ['match', 'Job Match'],
                        ].map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={assistantTab === id}
                                onClick={() => setAssistantTab(id)}
                                className={`flex-1 rounded-md px-1 py-1 text-[10px] font-bold transition-colors whitespace-nowrap text-center ${
                                    assistantTab === id
                                        ? 'bg-[var(--cuba-primary)] text-white'
                                        : 'text-[var(--cuba-ink-muted)] hover:text-[var(--cuba-ink)]'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {assistantTab === 'suggestions' && (
                        <div className="space-y-2.5" role="tabpanel" aria-label="Suggestions">
                            {/* Suggested Job Titles */}
                            <div className="rounded-lg border border-[var(--cuba-line)] bg-[var(--cuba-canvas)] p-2.5 space-y-2">
                                <div className="flex items-center justify-between gap-1">
                                    <span className="text-[11px] font-bold text-[var(--cuba-ink)]">Suggested Job Titles</span>
                                    <span className="text-[9px] font-semibold text-[var(--cuba-ink-subtle)]">Click to apply</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {assistantRoleChips.map((roleTitle) => {
                                        const isCurrent = String(formData.occupation || '').toLowerCase() === roleTitle.toLowerCase();
                                        return (
                                            <button
                                                key={roleTitle}
                                                type="button"
                                                onClick={() => handleApplyAssistantRole(roleTitle)}
                                                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                                                    isCurrent
                                                        ? 'border-[var(--cuba-primary)] bg-[var(--cuba-primary-soft)] text-[var(--cuba-primary-strong)]'
                                                        : 'border-[var(--cuba-line)] bg-white text-[var(--cuba-ink)] hover:border-[var(--cuba-primary-line)]'
                                                }`}
                                            >
                                                {roleTitle}
                                            </button>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const el = document.querySelector('input[name="occupation"]');
                                            if (el) el.focus();
                                        }}
                                        className="rounded-md border border-dashed border-[var(--cuba-primary-line)] bg-white px-2 py-1 text-[10px] font-bold text-[var(--cuba-primary-strong)] hover:bg-[var(--cuba-primary-soft)]"
                                    >
                                        + Custom Title
                                    </button>
                                </div>
                            </div>

                            {/* Professional Summary Suggestions */}
                            <div className="rounded-lg border border-[var(--cuba-line)] bg-[var(--cuba-canvas)] p-2.5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-[var(--cuba-ink)]">Professional Summary</span>
                                    <button
                                        type="button"
                                        onClick={handleAutofillJd}
                                        className="rounded border border-[var(--cuba-primary-line)] bg-[var(--cuba-primary-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--cuba-primary-strong)] hover:bg-[var(--cuba-primary-soft-hover)]"
                                    >
                                        Autofill from Profile
                                    </button>
                                </div>
                                <div className="space-y-1.5">
                                    {assistantSummaryStarters.map((starter, idx) => (
                                        <button
                                            key={`starter-${idx}`}
                                            type="button"
                                            onClick={() => handleApplyAssistantSummary(starter)}
                                            className="w-full rounded-md border border-[var(--cuba-line)] bg-white p-2 text-left text-[10px] leading-snug text-[var(--cuba-ink-muted)] hover:border-[var(--cuba-primary-line)] hover:text-[var(--cuba-ink)] transition-colors"
                                        >
                                            {starter}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Add Key Skills to Boost Match */}
                            <div className="rounded-lg border border-[var(--cuba-line)] bg-[var(--cuba-canvas)] p-2.5 space-y-2">
                                <span className="block text-[11px] font-bold text-[var(--cuba-ink)]">Add Key Skills to Boost Match</span>
                                <div className="flex flex-wrap gap-1">
                                    {assistantSkillKeywords.map((skill) => {
                                        const added = existingSkillNames.has(skill.toLowerCase());
                                        return (
                                            <button
                                                key={skill}
                                                type="button"
                                                onClick={() => handleAddAssistantSkill(skill)}
                                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                                    added
                                                        ? 'border-[var(--cuba-success)] bg-[var(--cuba-success-soft)] text-[var(--cuba-success)]'
                                                        : 'border-[var(--cuba-primary-line)] bg-white text-[var(--cuba-primary-strong)] hover:bg-[var(--cuba-primary-soft)]'
                                                }`}
                                            >
                                                {added ? `✓ ${skill}` : `+ ${skill}`}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {assistantTab === 'insights' && (
                        <div className="rounded-lg border border-[var(--cuba-line)] bg-[var(--cuba-canvas)] p-2.5 space-y-2" role="tabpanel" aria-label="Resume Insights">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-[var(--cuba-ink)]">Contact Completeness</span>
                                <span className="font-extrabold text-[var(--cuba-primary-strong)]">{completedRequiredFields}/{requiredFields.length} required</span>
                            </div>
                            <p className="text-[10px] leading-relaxed text-[var(--cuba-ink-muted)]">
                                {isStepComplete
                                    ? 'All required personal & contact fields are complete and ready for ATS parsing.'
                                    : 'Complete your name, target job title, email, and phone number so recruiters can reach you.'}
                            </p>
                        </div>
                    )}

                    {assistantTab === 'match' && (
                        <div className="rounded-lg border border-[var(--cuba-line)] bg-[var(--cuba-canvas)] p-2.5 space-y-2" role="tabpanel" aria-label="Job Match">
                            <span className="block text-[11px] font-bold text-[var(--cuba-ink)]">Target Role Alignment</span>
                            <p className="text-[10px] leading-relaxed text-[var(--cuba-ink-muted)]">
                                {targetJd && targetJd.trim().length >= 20
                                    ? `Tailoring active with ${assistantSkillKeywords.length} detected role keywords.`
                                    : 'Paste a job description in Target Role & Job Description to unlock live keyword matching.'}
                            </p>
                        </div>
                    )}
                </div>
            )}
            headerActions={(
                <>
                    {!resetConfirmOpen ? (
                        <>
                            <button
                                type="button"
                                onClick={handleAutofillJd}
                                disabled={isGeneratingJd || !String(targetRole || formData.occupation || '').trim()}
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--cuba-primary-line)] bg-[var(--cuba-primary-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--cuba-primary-strong)] transition-colors hover:bg-[var(--cuba-primary-soft-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                title="Generate target-role requirements with AI"
                            >
                                <MdAutoAwesome className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{isGeneratingJd ? 'Generating…' : 'Auto Fill with AI'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setResetConfirmOpen(true)}
                                className="inline-flex min-h-8 items-center rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--cuba-ink-subtle)] transition-colors hover:bg-[var(--cuba-canvas)] hover:text-[var(--cuba-ink)]"
                            >
                                Reset section
                            </button>
                        </>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--cuba-warning)] bg-[var(--cuba-warning-soft)] p-1 text-[10px] font-bold text-[var(--cuba-warning)]">
                            Clear all fields?
                            <button type="button" onClick={resetPersonalInformation} className="rounded bg-[var(--cuba-warning)] px-1.5 py-1 text-white hover:opacity-90">Reset</button>
                            <button type="button" onClick={() => setResetConfirmOpen(false)} className="rounded px-1.5 py-1 hover:bg-[var(--cuba-warning-soft)]">Cancel</button>
                        </span>
                    )}
                </>
            )}
        >
            <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-[var(--cuba-line)] bg-white p-4 sm:p-5 lg:p-6 shadow-cuba-xl space-y-5">
                {/* Identity */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-extrabold tracking-tight text-[var(--cuba-ink)]">Personal &amp; contact details</h2>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--cuba-ink-subtle)]">Required fields help employers identify and contact you.</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-[var(--cuba-line)] bg-[var(--cuba-canvas)] px-2 py-1 text-[10px] font-bold text-[var(--cuba-ink-subtle)]">Required *</span>
                    </div>
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
                <div className="space-y-3 border-t border-[var(--cuba-line)] pt-4">
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
                <div className="border-t border-[var(--cuba-line)] pt-3">
                    <button
                        type="button"
                        onClick={() => setMoreOpen(prev => !prev)}
                        aria-expanded={moreOpen}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--cuba-ink-subtle)] hover:text-[var(--cuba-ink)] transition-colors"
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
                <div className="border-t border-[var(--cuba-line)] pt-3">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5">
                        <button
                            type="button"
                            onClick={() => setTailoringOpen((open) => !open)}
                            aria-expanded={tailoringOpen}
                            aria-controls="heading-tailoring-fields"
                            className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            <span className="text-xs font-bold text-indigo-950">Tailor for a specific job <span className="font-medium text-indigo-700">(optional)</span></span>
                            {(targetJd && targetJd.trim().length > 0) || (targetRole && targetRole.trim().length > 0) ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Tailoring added
                                </span>
                            ) : null}
                            <MdExpandMore aria-hidden="true" className={`ml-auto h-5 w-5 text-indigo-700 transition-transform ${tailoringOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {!tailoringOpen && (
                            <p className="mt-1 text-[11px] leading-relaxed text-[var(--cuba-ink-subtle)]">
                                Add a target role or job description for tailored ATS and AI suggestions.
                            </p>
                        )}
                        <div id="heading-tailoring-fields" hidden={!tailoringOpen} className="mt-3 space-y-3">
                        <p className="text-[11px] leading-relaxed text-[var(--cuba-ink-subtle)]">
                            Specifying your target role and pasting the job description allows the AI copilot and ATS engine to highlight missing keywords, tailor summaries, and suggest relevant skills across all subsequent steps.
                        </p>
                        {/* Target Role with Auto AI Dropdown */}
                        <div ref={roleInputContainerRef} className="relative">
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-semibold text-[var(--cuba-ink-muted)]">
                                    Target Job Title (Optional)
                                </label>
                                <span className="text-[10px] text-[var(--cuba-ink-subtle)]">
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
                                    className="w-full rounded-lg border border-[var(--cuba-line)] bg-white pl-3 pr-16 py-1.5 text-xs text-[var(--cuba-ink)] shadow-2xs placeholder:text-[var(--cuba-ink-subtle)] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                                            className="p-1 text-[var(--cuba-ink-subtle)] hover:text-[var(--cuba-ink-muted)] rounded-md hover:bg-[var(--cuba-canvas)]"
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
                                        <span className="text-[var(--cuba-ink-subtle)] font-normal">
                                            {suggestedRoles.length} suggestions
                                        </span>
                                    </div>
                                    {suggestedRoles.length === 0 && isFetchingAiRoles && (
                                        <div className="p-4 text-center text-[var(--cuba-ink-subtle)] text-xs flex items-center justify-center gap-2">
                                            <span className="inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                            <span>Consulting AI for role suggestions…</span>
                                        </div>
                                    )}
                                    <ul className="max-h-56 overflow-y-auto divide-y divide-[var(--cuba-line)] py-1">
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
                                                                : 'text-[var(--cuba-ink-muted)] hover:bg-[var(--cuba-canvas)]'
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
                                            <li className="p-1 bg-[var(--cuba-canvas)]/60">
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
                                    <div className="px-3 py-1 bg-[var(--cuba-canvas)] border-t border-[var(--cuba-line)] text-[10px] text-[var(--cuba-ink-subtle)] flex items-center justify-between">
                                        <span>Use ↑↓ to navigate, Enter to select</span>
                                        <button
                                            type="button"
                                            onClick={() => setRoleDropdownOpen(false)}
                                            className="text-[var(--cuba-ink-subtle)] hover:text-[var(--cuba-ink)] font-medium"
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
                                <label className="block text-[11px] font-semibold text-[var(--cuba-ink-muted)]">
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
                                        className="text-[var(--cuba-ink-subtle)] hover:text-[var(--cuba-ink-muted)] ml-2"
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
                                className="w-full rounded-lg border border-[var(--cuba-line)] bg-white px-3 py-2 text-xs text-[var(--cuba-ink)] shadow-2xs placeholder:text-[var(--cuba-ink-subtle)] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                                        <span className="text-[10px] text-[var(--cuba-ink-subtle)]">
                                            {extractedKeywords.length} key domains parsed
                                        </span>
                                    </div>
                                    {extractedKeywords.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {extractedKeywords.map((kw, i) => (
                                                <span key={`kw-${i}`} className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-indigo-200/80 text-[10px] font-medium text-[var(--cuba-ink-muted)] shadow-2xs">
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
                </div>
            </form>
            <ConfirmRegenerateModal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                onConfirm={executeAutofillJd}
                targetRole={String(targetRole || formData.occupation || '').trim()}
                existingTextSnippet={targetJd}
                isGenerating={isGeneratingJd}
            />
        </StepShell>
    );
};

export default HeadingStep;
