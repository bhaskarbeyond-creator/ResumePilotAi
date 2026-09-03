import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdDelete,
    MdKeyboardArrowDown,
    MdAdd,
    MdCheck,
    MdAutoAwesome,
    MdLightbulb,
    MdVerified,
    MdWorkspacePremium,
    MdContentCopy,
    MdArrowUpward,
    MdArrowDownward,
} from 'react-icons/md';
import InputField from './components/InputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { generateUserAiContent } from '../../../services/aiService';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import { getCandidateContext } from '../../../utils/candidateContext';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import TrackGuidanceBanner from '../components/TrackGuidanceBanner';

const CertificationsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [certifications, setCertifications] = useState(resumeData.certifications || []);
    const [expandedCards, setExpandedCards] = useState(new Set());
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [aiRecommendations, setAiRecommendations] = useState([]);
    const [addedFeedback, setAddedFeedback] = useState(null);
    const [certError, setCertError] = useState(null);

    const candidateContext = getCandidateContext(resumeData);
    const certBlueprints = candidateContext.starterBlueprints?.certifications || [];

    const aiRequestControllerRef = useRef(null);

    useEffect(() => {
        return () => {
            const controller = aiRequestControllerRef.current;
            aiRequestControllerRef.current = null;
            controller?.abort();
        };
    }, []);

    useEffect(() => {
        if (resumeData.certifications && Array.isArray(resumeData.certifications)) {
            setCertifications(resumeData.certifications);
        }
    }, [resumeData.certifications]);

    const effectiveRole =
        (resumeData.occupation && resumeData.occupation.trim()) ||
        (resumeData.employments?.[0]?.jobTitle && resumeData.employments[0].jobTitle.trim()) ||
        '';

    const createNewCertification = (initialData = {}) => ({
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: initialData.title || '',
        issuer: initialData.issuer || '',
        date: initialData.date || '', // BLANK by default - NEVER fabricate current year!
        isLicense: Boolean(initialData.isLicense),
    });

    const addCertification = (overrides = {}) => {
        const newCertification = createNewCertification(overrides);
        setCertifications((prev) => [...prev, newCertification]);
        setExpandedCards(new Set([newCertification.id]));
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'add-license':
                addCertification({ isLicense: true });
                break;
            case 'ai-find-certs':
                handleGenerateAiCertifications();
                break;
            case 'add-cert':
            default:
                addCertification();
                break;
        }
    };

    const removeCertification = (id) => {
        setCertifications((prev) => prev.filter((cert) => cert.id !== id));
        setExpandedCards((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveCertification = (id, direction) => {
        const dir = direction === 'up' ? -1 : 1;
        setCertifications((current) => moveResumeItem(current, id, dir));
    };

    const duplicateCertification = (id) =>
        setCertifications((current) => {
            const source = current.find((cert) => cert.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || source?.name || 'Certification'} (Copy)`,
            });
        });

    const toggleCardExpansion = (id) => {
        setExpandedCards((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const updateCertification = (id, field, value) => {
        setCertifications((prev) =>
            prev.map((cert) => (cert.id === id ? { ...cert, [field]: value } : cert))
        );
    };

    // Auto-save on change (500ms debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            const validCertifications = certifications.filter(
                (cert) => (cert.title || cert.name || '').trim() !== ''
            );

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validCertifications.length > 0 && !completedSteps.includes(6)) {
                updatedCompletedSteps = [...completedSteps, 6];
            } else if (validCertifications.length === 0 && (completedSteps.includes(6) || completedSteps.includes(7))) {
                updatedCompletedSteps = completedSteps.filter((step) => step !== 6 && step !== 7);
            }

            updateResumeData({
                certifications,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [certifications]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (certifications.length === 1 && expandedCards.size === 0) {
            setExpandedCards(new Set([certifications[0].id]));
        }
    }, [certifications.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // AI Certification Generation
    const handleGenerateAiCertifications = async () => {
        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;

        setIsAiGenerating(true);
        try {
            const currentLanguage = localStorage.getItem('i18nextLng') || 'en';
            const expDetails = (resumeData.employments || [])
                .map((w) => `${w.jobTitle || 'Role'} at ${w.employer || ''}`)
                .filter(Boolean)
                .join('; ');
            const eduDetails = (resumeData.educations || [])
                .map((e) => `${e.degree || ''} from ${e.school || ''}`)
                .filter(Boolean)
                .join('; ');
            const skillsDetails = (resumeData.skills || [])
                .map((s) => (typeof s === 'string' ? s : s?.name || s?.skillName))
                .filter(Boolean)
                .join(', ');
            const existingCerts = (certifications || [])
                .map((c) => (typeof c === 'string' ? c : c?.title || c?.name))
                .filter(Boolean);

            const data = await generateUserAiContent(
                'generate-certifications',
                {
                    jobTitle: effectiveRole || candidateContext.profession || 'Professional',
                    occupation: effectiveRole || candidateContext.profession || 'Professional',
                    workHistory: expDetails,
                    education: eduDetails,
                    skills: skillsDetails,
                    existingCertifications: existingCerts,
                    language: currentLanguage,
                    context: candidateContext,
                },
                { signal: requestController.signal }
            );

            const certsList =
                data?.certifications ||
                data?.certs ||
                data?.items ||
                data?.data?.certifications ||
                (Array.isArray(data) ? data : []);

            if (Array.isArray(certsList) && certsList.length > 0) {
                const formatted = certsList
                    .map((c, idx) => {
                        const title = typeof c === 'string' ? c : c?.title || c?.name || '';
                        const issuer =
                            typeof c === 'object' ? c?.issuer || c?.organization || 'Accredited Body' : 'Accredited Body';
                        const category =
                            typeof c === 'object' && c?.category
                                ? c.category
                                : idx < 3
                                ? 'mandatory'
                                : 'recommended';
                        return { title, issuer, category };
                    })
                    .filter((c) => c.title);

                if (formatted.length > 0) {
                    setAiRecommendations(formatted);
                    setCertError(null);
                } else {
                    setAiRecommendations([]);
                    setCertError('No credentials found for this target role.');
                }
            } else {
                setAiRecommendations([]);
                setCertError('No credentials found for this target role.');
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI Certifications generation error:', err);
            const msg = (err?.code === 'AI_DAILY_QUOTA_EXCEEDED' || err?.status === 429)
                ? 'Daily AI limit reached. Please try again tomorrow.'
                : (err?.message || 'Unable to generate certifications at this time.');
            setCertError(msg);
            setAiRecommendations([]);
        } finally {
            if (aiRequestControllerRef.current === requestController) {
                aiRequestControllerRef.current = null;
                setIsAiGenerating(false);
            }
        }
    };

    const isCertAlreadyAdded = (title) => {
        if (!title) return false;
        const normalized = title.trim().toLowerCase();
        return certifications.some((c) => (c.title || c.name || '').trim().toLowerCase() === normalized);
    };

    const handleAddRecommendedCert = (rec) => {
        if (isCertAlreadyAdded(rec.title)) return;
        const newCert = createNewCertification({
            title: rec.title,
            issuer: rec.issuer || '',
            date: '', // Candidate must specify actual year
        });
        setCertifications((prev) => [...prev, newCert]);
        setExpandedCards((prev) => new Set([...prev, newCert.id]));
        setAddedFeedback(`Added ${rec.title} — enter verified date`);
        setTimeout(() => setAddedFeedback(null), 2500);
    };

    const handleAddAllRecommended = () => {
        const unadded = aiRecommendations.filter((rec) => !isCertAlreadyAdded(rec.title));
        if (unadded.length === 0) return;

        const newCerts = unadded.map((rec) =>
            createNewCertification({
                title: rec.title,
                issuer: rec.issuer || '',
                date: '', // Candidate must specify actual year
            })
        );

        setCertifications((prev) => [...prev, ...newCerts]);
        setExpandedCards((prev) => new Set([...prev, ...newCerts.map((c) => c.id)]));
        setAddedFeedback(`Added ${newCerts.length} certifications — enter verified dates`);
        setTimeout(() => setAddedFeedback(null), 3000);
    };

    const hasCertifications = certifications.some((c) => String(c?.title || '').trim() !== '');

    const unaddedRecommendations = aiRecommendations.filter((rec) => !isCertAlreadyAdded(rec.title));

    return (
        <StepWorkspaceLayout
            stepNumber={6}
            stepPath="certifications"
            title={t('CertificationsStep.title', 'Certifications & Credentials')}
            subtitle={t('CertificationsStep.subtitle', 'Add professional certifications and credentials that validate your expertise.')}
            isComplete={hasCertifications}
            statusBadge={`${certifications.length} Credential${certifications.length === 1 ? '' : 's'}`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="certifications"
                    onAction={handleQuickAddAction}
                    isAiLoading={isAiGenerating}
                />

                {/* Feedback Toast */}
                {addedFeedback && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs">
                        <MdCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{addedFeedback.startsWith('Added ') ? addedFeedback : `Added: ${addedFeedback}`}</span>
                    </div>
                )}

                {certifications.length === 0 ? (
                    /* Guided Certifications Setup Banner (Zero-Fabrication Architecture) */
                    <TrackGuidanceBanner
                        candidateContext={candidateContext}
                        stepName="Certification or License"
                        stepPath="certifications"
                        focusAreas={['Professional Licensing & State Registration', 'Board Certifications & Accreditations', 'Technical & Domain Accreditations', 'Safety, Compliance & Quality Standards', 'Continuing Education Credits']}
                        examples={certBlueprints.slice(0, 3).map((b) => ({
                            title: b.title || 'Professional Certification',
                            description: `Issued by ${b.issuer || 'Accredited Authority'}`
                        }))}
                        onStartBlank={() => addCertification()}
                    />
                ) : (
                    /* High-Density Certification Studio with Milestone Bar */
                    <div className="space-y-2.5">
                        {/* Milestone Bar */}
                        <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-bold text-slate-800 truncate">
                                    {certifications.length} Credential{certifications.length === 1 ? '' : 's'} Documented
                                </span>
                                <span className="text-[11px] text-slate-400 hidden sm:inline">• Verified Standing</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleGenerateAiCertifications}
                                    disabled={isAiGenerating}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                >
                                    <MdAutoAwesome className="w-3.5 h-3.5 text-purple-600" />
                                    <span className="hidden sm:inline">{isAiGenerating ? 'Discovering...' : 'AI Recommend'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={addCertification}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                                >
                                    <MdAdd className="w-3.5 h-3.5" />
                                    <span>Add Credential</span>
                                </button>
                            </div>
                        </div>

                        {certifications.map((certification, index) => {
                            const isExpanded = expandedCards.has(certification.id);
                            const certTitle = certification.title || certification.name || '';
                            const isFilled = Boolean(certTitle);

                            return (
                                <div
                                    key={certification.id}
                                    className={`bg-white rounded-xl border transition-all duration-150 ${
                                        isExpanded 
                                            ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10' 
                                            : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                                    }`}
                                >
                                    {/* Compact Card Header / Summary Row */}
                                    <div 
                                        className={`px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                                            isExpanded ? 'border-b border-slate-100 bg-slate-50/50 rounded-t-xl' : 'rounded-xl'
                                        }`}
                                        onClick={() => toggleCardExpansion(certification.id)}
                                    >
                                        {/* Left: Badge + Title + Issuer */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                                isFilled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {isFilled ? <MdCheck className="w-4 h-4" /> : index + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className={`text-xs sm:text-sm font-bold truncate ${certTitle ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                                                        {certTitle || 'Untitled Certification'}
                                                    </h3>
                                                    {certification.issuer && (
                                                        <>
                                                            <span className="text-slate-300 text-xs">•</span>
                                                            <span className="text-xs font-medium text-slate-600 truncate">
                                                                {certification.issuer}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                                {certification.date && (
                                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                                        <span>Earned: {certification.date}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Quick Action Controls */}
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                onClick={() => moveCertification(certification.id, 'up')}
                                                disabled={index === 0}
                                                aria-label="Move certification up"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move up"
                                            >
                                                <MdArrowUpward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveCertification(certification.id, 'down')}
                                                disabled={index === certifications.length - 1}
                                                aria-label="Move certification down"
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                                title="Move down"
                                            >
                                                <MdArrowDownward className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateCertification(certification.id)}
                                                aria-label="Duplicate certification"
                                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                                title="Duplicate"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeCertification(certification.id)}
                                                aria-label="Remove certification"
                                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                                title="Delete"
                                            >
                                                <MdDelete className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleCardExpansion(certification.id)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer ml-1"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                <MdKeyboardArrowDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Form Fields */}
                                    {isExpanded && (
                                        <div className="p-4 sm:p-5 space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <InputField
                                                    label={t('CertificationsStep.fields.title.label', 'Certification Name')}
                                                    name={`certification-title-${certification.id}`}
                                                    placeholder={certBlueprints[0]?.title ? `e.g. ${certBlueprints[0].title}` : 'e.g. Professional Board Certification, Practice License, PMP'}
                                                    value={certification.title || certification.name || ''}
                                                    onChange={(e) => updateCertification(certification.id, 'title', e.target.value)}
                                                    required
                                                />
                                                <div className="space-y-1.5">
                                                    <InputField
                                                        label={t('CertificationsStep.fields.issuer.label', 'Issuing Organization')}
                                                        name={`certification-issuer-${certification.id}`}
                                                        placeholder={certBlueprints[0]?.issuer ? `e.g. ${certBlueprints[0].issuer}` : 'e.g. Accredited Licensing Board, National Council, University'}
                                                        value={certification.issuer || ''}
                                                        onChange={(e) => updateCertification(certification.id, 'issuer', e.target.value)}
                                                    />
                                                    {/* Quick Authority Pills */}
                                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                                        <span className="text-[10px] font-bold text-slate-400">Popular:</span>
                                                        {([...new Set(certBlueprints.map(c => c.issuer).filter(Boolean))].slice(0, 5).length > 0
                                                            ? [...new Set(certBlueprints.map(c => c.issuer).filter(Boolean))].slice(0, 5)
                                                            : ['Licensing Board', 'State Council', 'Accredited Institute', 'PMI', 'University']
                                                        ).map((auth) => (
                                                            <button
                                                                key={auth}
                                                                type="button"
                                                                onClick={() => updateCertification(certification.id, 'issuer', auth)}
                                                                className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded border border-slate-200/80 transition-colors cursor-pointer"
                                                            >
                                                                {auth}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <InputField
                                                    label={t('CertificationsStep.fields.date.label', 'Date Earned')}
                                                    name={`certification-date-${certification.id}`}
                                                    placeholder="e.g. 2024 or Nov 2023"
                                                    value={certification.date || ''}
                                                    onChange={(e) => updateCertification(certification.id, 'date', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Add Button Row */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={addCertification}
                                className="flex-1 h-11 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                            >
                                <MdAdd className="w-4 h-4" />
                                <span>Add Another Credential</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleGenerateAiCertifications}
                                disabled={isAiGenerating}
                                className="h-11 px-4 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/80 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                            >
                                <MdAutoAwesome className="w-3.5 h-3.5 text-purple-600" />
                                <span>{isAiGenerating ? 'Discovering...' : 'AI Recommendations'}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* AI Recommendations Tray */}
                {aiRecommendations.length > 0 && (
                    <div className="p-4 bg-white rounded-xl border border-indigo-100 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                    <MdVerified className="w-4 h-4 text-indigo-600" />
                                    <span>Recommended Credentials for {effectiveRole || 'Your Role'}</span>
                                </h3>
                                <p className="text-[11px] text-slate-500">
                                    Click any credential to add it instantly to your resume.
                                </p>
                            </div>
                            {unaddedRecommendations.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleAddAllRecommended}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs shrink-0"
                                >
                                    <MdCheck className="w-3.5 h-3.5" />
                                    <span>Add All ({unaddedRecommendations.length})</span>
                                </button>
                            )}
                        </div>

                        {unaddedRecommendations.length === 0 ? (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <MdCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                    All recommended certifications from this batch have been added!
                                </span>
                                <button
                                    type="button"
                                    onClick={handleGenerateAiCertifications}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                >
                                    Get More
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {aiRecommendations.map((rec, idx) => {
                                    const added = isCertAlreadyAdded(rec.title);
                                    return (
                                        <div
                                            key={`${rec.title}-${idx}`}
                                            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                                                added 
                                                    ? 'bg-slate-50 border-slate-200 opacity-60' 
                                                    : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-2xs'
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <span className="font-bold text-slate-900 block truncate">
                                                    {rec.title}
                                                </span>
                                                <span className="text-[10px] text-slate-500 block truncate">
                                                    {rec.issuer}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleAddRecommendedCert(rec)}
                                                disabled={added}
                                                className={`px-2 py-1 rounded-lg text-[10px] font-extrabold shrink-0 transition-all ${
                                                    added
                                                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                                                        : 'bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-transparent cursor-pointer'
                                                }`}
                                            >
                                                {added ? 'Added ✓' : '+ Add'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </StepWorkspaceLayout>
    );
};

export default CertificationsStep;
