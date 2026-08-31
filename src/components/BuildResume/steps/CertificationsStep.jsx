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
} from 'react-icons/md';
import InputField from './components/InputField';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { generateUserAiContent } from '../../../services/aiService';

/**
 * Role-aware fallback certifications to guarantee instantaneous, resilient
 * suggestions even in offline, network-constrained, or rate-limited environments.
 */
function getRoleTailoredFallbackCerts(role = '') {
    const r = (role || '').toLowerCase();
    if (r.includes('sec') || r.includes('cyber') || r.includes('infosec')) {
        return [
            { title: 'Certified Information Systems Security Professional (CISSP)', issuer: '(ISC)²', category: 'mandatory' },
            { title: 'CompTIA Security+ (SY0-701)', issuer: 'CompTIA', category: 'mandatory' },
            { title: 'Certified Ethical Hacker (CEH)', issuer: 'EC-Council', category: 'recommended' },
            { title: 'Certified Information Security Manager (CISM)', issuer: 'ISACA', category: 'recommended' },
            { title: 'AWS Certified Security - Specialty', issuer: 'Amazon Web Services', category: 'recommended' },
        ];
    }
    if (r.includes('data') || r.includes('ai') || r.includes('machine learning') || r.includes('ml') || r.includes('analytics')) {
        return [
            { title: 'AWS Certified Machine Learning - Specialty', issuer: 'Amazon Web Services', category: 'mandatory' },
            { title: 'Google Professional Data Engineer', issuer: 'Google Cloud', category: 'mandatory' },
            { title: 'Databricks Certified Data Engineer Associate', issuer: 'Databricks', category: 'recommended' },
            { title: 'Microsoft Certified: Azure AI Engineer Associate', issuer: 'Microsoft', category: 'recommended' },
            { title: 'TensorFlow Developer Certificate', issuer: 'Google', category: 'recommended' },
        ];
    }
    if (r.includes('manage') || r.includes('lead') || r.includes('scrum') || r.includes('agile') || r.includes('product') || r.includes('director')) {
        return [
            { title: 'Project Management Professional (PMP)', issuer: 'Project Management Institute (PMI)', category: 'mandatory' },
            { title: 'Certified ScrumMaster (CSM)', issuer: 'Scrum Alliance', category: 'mandatory' },
            { title: 'PMI Agile Certified Practitioner (PMI-ACP)', issuer: 'PMI', category: 'recommended' },
            { title: 'PRINCE2 Practitioner', issuer: 'AXELOS', category: 'recommended' },
            { title: 'Certified Information Systems Auditor (CISA)', issuer: 'ISACA', category: 'recommended' },
        ];
    }
    if (r.includes('cloud') || r.includes('devops') || r.includes('sre') || r.includes('system') || r.includes('infrastructure')) {
        return [
            { title: 'AWS Certified Solutions Architect - Associate', issuer: 'Amazon Web Services', category: 'mandatory' },
            { title: 'Certified Kubernetes Administrator (CKA)', issuer: 'Cloud Native Computing Foundation (CNCF)', category: 'mandatory' },
            { title: 'Google Professional Cloud Architect', issuer: 'Google Cloud', category: 'mandatory' },
            { title: 'HashiCorp Certified: Terraform Associate', issuer: 'HashiCorp', category: 'recommended' },
            { title: 'Microsoft Certified: Azure Solutions Architect Expert', issuer: 'Microsoft', category: 'recommended' },
        ];
    }
    // Default high-demand industry certifications for general software / engineering / business
    return [
        { title: 'AWS Certified Solutions Architect - Associate', issuer: 'Amazon Web Services', category: 'mandatory' },
        { title: 'Project Management Professional (PMP)', issuer: 'Project Management Institute (PMI)', category: 'mandatory' },
        { title: 'Certified ScrumMaster (CSM)', issuer: 'Scrum Alliance', category: 'mandatory' },
        { title: 'Google Professional Cloud Architect', issuer: 'Google Cloud', category: 'recommended' },
        { title: 'Certified Kubernetes Application Developer (CKAD)', issuer: 'CNCF', category: 'recommended' },
        { title: 'Microsoft Certified: Azure Fundamentals (AZ-900)', issuer: 'Microsoft', category: 'recommended' },
    ];
}

/**
 * CertificationsStep — wizard step for the `certifications` section with
 * built-in AI recommendation engine, quick-add cards, and auto-sync.
 */
const CertificationsStep = ({ resumeData, updateResumeData }) => {
    const { t } = useTranslation('common');
    const [certifications, setCertifications] = useState(resumeData.certifications || []);
    const [expandedCards, setExpandedCards] = useState(new Set());
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [aiRecommendations, setAiRecommendations] = useState([]);
    const [addedFeedback, setAddedFeedback] = useState(null);

    const aiRequestControllerRef = useRef(null);

    // Abort in-flight AI requests on unmount
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
        date: initialData.date || `${new Date().getFullYear()}`,
    });

    const addCertification = () => {
        const newCertification = createNewCertification();
        setCertifications((prev) => [...prev, newCertification]);
        setExpandedCards(() => new Set([newCertification.id]));
    };

    const removeCertification = (id) => {
        setCertifications((prev) => prev.filter((cert) => cert.id !== id));
        setExpandedCards((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const moveCertification = (id, direction) =>
        setCertifications((current) => moveResumeItem(current, id, direction));

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

    // Auto-expand the only card when there is exactly one certification
    useEffect(() => {
        if (certifications.length === 1) {
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
                    jobTitle: effectiveRole || 'Professional',
                    occupation: effectiveRole || 'Professional',
                    workHistory: expDetails,
                    education: eduDetails,
                    skills: skillsDetails,
                    existingCertifications: existingCerts,
                    language: currentLanguage,
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

                setAiRecommendations(formatted.length > 0 ? formatted : getRoleTailoredFallbackCerts(effectiveRole));
            } else {
                setAiRecommendations(getRoleTailoredFallbackCerts(effectiveRole));
            }
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.warn('AI Certifications generation fallback:', err);
            setAiRecommendations(getRoleTailoredFallbackCerts(effectiveRole));
        } finally {
            if (aiRequestControllerRef.current === requestController) {
                aiRequestControllerRef.current = null;
                setIsAiGenerating(false);
            }
        }
    };

    // Helper: is a certification already in user's list?
    const isCertAlreadyAdded = (title) => {
        if (!title) return false;
        const normalized = title.trim().toLowerCase();
        return certifications.some((c) => (c.title || c.name || '').trim().toLowerCase() === normalized);
    };

    // Add a single recommended certification
    const handleAddRecommendedCert = (rec) => {
        if (isCertAlreadyAdded(rec.title)) return;
        const newCert = createNewCertification({
            title: rec.title,
            issuer: rec.issuer || 'Accredited Body',
            date: `${new Date().getFullYear()}`,
        });
        setCertifications((prev) => [...prev, newCert]);
        setExpandedCards((prev) => new Set([...prev, newCert.id]));
        setAddedFeedback(rec.title);
        setTimeout(() => setAddedFeedback(null), 2500);
    };

    // Add all unadded recommended certifications at once
    const handleAddAllRecommended = () => {
        const unadded = aiRecommendations.filter((rec) => !isCertAlreadyAdded(rec.title));
        if (unadded.length === 0) return;

        const newCerts = unadded.map((rec) =>
            createNewCertification({
                title: rec.title,
                issuer: rec.issuer || 'Accredited Body',
                date: `${new Date().getFullYear()}`,
            })
        );

        setCertifications((prev) => [...prev, ...newCerts]);
        setExpandedCards((prev) => new Set([...prev, ...newCerts.map((c) => c.id)]));
        setAddedFeedback(`Added ${newCerts.length} certifications!`);
        setTimeout(() => setAddedFeedback(null), 3000);
    };

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            {/* Section Header */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <MdWorkspacePremium className="w-5 h-5 text-indigo-600" />
                        {t('CertificationsStep.title', 'Certifications')}
                    </h1>
                    <p className="text-gray-600 text-sm">
                        {t(
                            'CertificationsStep.subtitle',
                            'Add professional certifications and credentials that validate your expertise.'
                        )}
                    </p>
                </div>

                {/* Top AI Trigger Button */}
                <button
                    type="button"
                    onClick={handleGenerateAiCertifications}
                    disabled={isAiGenerating}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-xs hover:shadow-md ${
                        isAiGenerating
                            ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 text-white'
                    }`}
                    title={t('CertificationsStep.ai.tooltip', 'Generate AI certification recommendations tailored to your profile')}
                >
                    <MdAutoAwesome className={`w-4 h-4 ${isAiGenerating ? 'animate-spin' : 'text-yellow-300'}`} />
                    {isAiGenerating ? (
                        <span>{t('CertificationsStep.ai.generating', 'Analyzing & Generating...')}</span>
                    ) : (
                        <span>{t('CertificationsStep.ai.recommend', 'Recommend Certifications (AI)')}</span>
                    )}
                </button>
            </div>

            {/* Added Feedback Badge */}
            {addedFeedback && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <MdCheck className="w-4 h-4 text-emerald-600" />
                    <span>
                        {addedFeedback.startsWith('Added ')
                            ? addedFeedback
                            : `${t('CertificationsStep.ai.addedBadge', 'Added')}: ${addedFeedback}`}
                    </span>
                </div>
            )}

            {/* AI Recommendations Panel */}
            <div className="mb-6 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-pink-50/40 border border-indigo-100 rounded-2xl p-4 sm:p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xs">
                            <MdAutoAwesome className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                {t('CertificationsStep.ai.panelTitle', 'AI Certification Recommendations')}
                                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                    AI Powered
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500">
                                {effectiveRole
                                    ? t(
                                          'CertificationsStep.ai.tailoredSubtitle',
                                          'Recognized industry credentials tailored for {{role}}',
                                          { role: effectiveRole }
                                      )
                                    : t(
                                          'CertificationsStep.ai.genericSubtitle',
                                          'Top accredited industry credentials based on your skills and career path'
                                      )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        {aiRecommendations.length > 0 && (
                            <button
                                type="button"
                                onClick={handleAddAllRecommended}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                                <MdCheck className="w-3.5 h-3.5" />
                                {t('CertificationsStep.ai.addAll', 'Add All Recommended')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleGenerateAiCertifications}
                            disabled={isAiGenerating}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border ${
                                isAiGenerating
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs cursor-pointer'
                            }`}
                        >
                            <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-600" />
                            {isAiGenerating ? (
                                <span>{t('CertificationsStep.ai.generating', 'Generating...')}</span>
                            ) : (
                                <span>
                                    {aiRecommendations.length > 0
                                        ? t('CertificationsStep.ai.refresh', 'Refresh Recommendations')
                                        : t('CertificationsStep.ai.getRecommendations', 'Get Recommendations')}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Recommendations Grid or Empty Prompt State */}
                {aiRecommendations.length === 0 && !isAiGenerating ? (
                    <div className="p-6 bg-white/80 border border-indigo-100/60 rounded-xl text-center">
                        <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <MdLightbulb className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-800 mb-1">
                            {t('CertificationsStep.ai.promptTitle', 'Supercharge Your Resume with Validated Certifications')}
                        </h3>
                        <p className="text-xs text-gray-600 mb-4 max-w-md mx-auto">
                            {effectiveRole
                                ? t(
                                      'CertificationsStep.ai.promptDescRole',
                                      'Let AI analyze your experience as {{role}} and recommend the highest-value certifications hiring managers look for.',
                                      { role: effectiveRole }
                                  )
                                : t(
                                      'CertificationsStep.ai.promptDescGeneric',
                                      'Generate industry-standard credentials and certifications matched to your field to boost ATS ranking and employer credibility.'
                                  )}
                        </p>
                        <button
                            type="button"
                            onClick={handleGenerateAiCertifications}
                            disabled={isAiGenerating}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer"
                        >
                            <MdAutoAwesome className="w-4 h-4 text-yellow-300" />
                            {t('CertificationsStep.ai.generateNow', 'Generate AI Recommendations Now')}
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {aiRecommendations.map((rec, index) => {
                            const alreadyAdded = isCertAlreadyAdded(rec.title);
                            const isMandatory = rec.category === 'mandatory';

                            return (
                                <div
                                    key={`${rec.title}-${index}`}
                                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                                        alreadyAdded
                                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                                            : 'bg-white hover:bg-slate-50/80 border-indigo-100 hover:border-indigo-300 shadow-xs hover:shadow-md'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                            <span
                                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                                    isMandatory
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                                }`}
                                            >
                                                {isMandatory
                                                    ? t('CertificationsStep.ai.mandatoryBadge', 'Industry Standard')
                                                    : t('CertificationsStep.ai.recommendedBadge', 'Recommended')}
                                            </span>

                                            {alreadyAdded && (
                                                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                                                    <MdCheck className="w-3.5 h-3.5" />
                                                    {t('CertificationsStep.ai.added', 'Added')}
                                                </span>
                                            )}
                                        </div>

                                        <h4 className="font-bold text-xs text-gray-900 leading-snug line-clamp-2">
                                            {rec.title}
                                        </h4>

                                        {rec.issuer && (
                                            <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1 truncate">
                                                <MdVerified className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                                <span className="truncate">{rec.issuer}</span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400 font-medium">
                                            {new Date().getFullYear()}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => handleAddRecommendedCert(rec)}
                                            disabled={alreadyAdded}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                alreadyAdded
                                                    ? 'bg-emerald-100/80 text-emerald-700 cursor-default'
                                                    : 'bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-transparent cursor-pointer'
                                            }`}
                                        >
                                            {alreadyAdded ? (
                                                <>
                                                    <MdCheck className="w-3 h-3" />
                                                    <span>{t('CertificationsStep.ai.added', 'Added')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <MdAdd className="w-3 h-3" />
                                                    <span>{t('CertificationsStep.ai.add', 'Add')}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Certification Cards List */}
            <div className="space-y-4">
                {certifications.map((certification, index) => {
                    const isExpanded = expandedCards.has(certification.id);
                    const isComplete = Boolean(certification.title || certification.name);
                    const certTitle = certification.title || certification.name || '';

                    return (
                        <div
                            key={certification.id}
                            className={`relative bg-gradient-to-r from-white to-slate-50 border ${
                                isExpanded
                                    ? 'border-indigo-200 rounded-xl shadow-lg shadow-indigo-50'
                                    : 'border-gray-200 rounded-xl shadow-md hover:shadow-lg hover:border-indigo-300 hover:from-indigo-50 hover:to-slate-50'
                            }`}
                        >
                            {/* Accent line */}
                            <div
                                className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                                    isComplete
                                        ? 'bg-gradient-to-r from-indigo-400 to-purple-500'
                                        : 'bg-gradient-to-r from-gray-300 to-gray-400'
                                }`}
                            />

                            {/* Card header — click to expand/collapse */}
                            <div
                                className={`px-4 sm:px-6 py-4 ${
                                    isExpanded
                                        ? 'border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-xl'
                                        : 'rounded-xl'
                                } flex items-center cursor-pointer hover:bg-gradient-to-r hover:from-indigo-50 hover:to-slate-50 group`}
                                onClick={() => toggleCardExpansion(certification.id)}
                            >
                                {/* Left: badge + title */}
                                <div className="flex items-center flex-1 min-w-0">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0 shadow-sm ${
                                            isComplete
                                                ? 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-indigo-200'
                                                : 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white shadow-indigo-200'
                                        }`}
                                    >
                                        {isComplete ? (
                                            <MdCheck className="w-5 h-5" />
                                        ) : (
                                            <span className="font-bold">{index + 1}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className={`font-semibold text-base mb-1 truncate ${
                                                certTitle ? 'text-gray-800' : 'text-gray-400'
                                            }`}
                                        >
                                            {certTitle ||
                                                t(
                                                    'CertificationsStep.defaultValues.untitledCertification',
                                                    'Untitled Certification'
                                                )}
                                        </h3>
                                        {certification.issuer && (
                                            <span className="block text-xs text-indigo-500 font-medium truncate">
                                                {certification.issuer}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: reorder, duplicate, expand, delete */}
                                <div className="flex items-center space-x-1 sm:space-x-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-60 mr-1" />

                                    {/* Move Up */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveCertification(certification.id, 'up');
                                        }}
                                        disabled={index === 0}
                                        aria-label="Move certification up"
                                        className={`p-1 ${
                                            index === 0
                                                ? 'text-slate-300 cursor-not-allowed'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        ↑
                                    </button>

                                    {/* Move Down */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            moveCertification(certification.id, 'down');
                                        }}
                                        disabled={index === certifications.length - 1}
                                        aria-label="Move certification down"
                                        className={`p-1 ${
                                            index === certifications.length - 1
                                                ? 'text-slate-300 cursor-not-allowed'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        ↓
                                    </button>

                                    {/* Duplicate */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            duplicateCertification(certification.id);
                                        }}
                                        aria-label={`Duplicate ${certTitle || 'certification'}`}
                                        className="p-1 text-slate-500 hover:text-indigo-600"
                                        title={t('CertificationsStep.actions.duplicate', 'Duplicate')}
                                    >
                                        ⧉
                                    </button>

                                    {/* Expand/Collapse */}
                                    <button
                                        type="button"
                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg"
                                        title={
                                            isExpanded
                                                ? t('CertificationsStep.actions.collapse', 'Collapse')
                                                : t('CertificationsStep.actions.expand', 'Expand')
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCardExpansion(certification.id);
                                        }}
                                    >
                                        <MdKeyboardArrowDown
                                            className={`w-5 h-5 transition-transform duration-200 ${
                                                isExpanded ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeCertification(certification.id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title={t('CertificationsStep.actions.remove', 'Remove certification')}
                                    >
                                        <MdDelete className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded form body */}
                            {isExpanded && (
                                <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                                    {/* Certification name + issuing organization */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <InputField
                                            label={t('CertificationsStep.fields.title.label', 'Certification Name')}
                                            name={`certification-title-${certification.id}`}
                                            placeholder={t(
                                                'CertificationsStep.fields.title.placeholder',
                                                'e.g. AWS Solutions Architect'
                                            )}
                                            value={certification.title || certification.name || ''}
                                            onChange={(e) => updateCertification(certification.id, 'title', e.target.value)}
                                            required
                                        />
                                        <InputField
                                            label={t('CertificationsStep.fields.issuer.label', 'Issuing Organization')}
                                            name={`certification-issuer-${certification.id}`}
                                            placeholder={t(
                                                'CertificationsStep.fields.issuer.placeholder',
                                                'e.g. Amazon Web Services'
                                            )}
                                            value={certification.issuer || ''}
                                            onChange={(e) => updateCertification(certification.id, 'issuer', e.target.value)}
                                        />
                                    </div>

                                    {/* Date issued */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <InputField
                                            label={t('CertificationsStep.fields.date.label', 'Date Earned')}
                                            name={`certification-date-${certification.id}`}
                                            placeholder={t(
                                                'CertificationsStep.fields.date.placeholder',
                                                'e.g. 2024'
                                            )}
                                            value={certification.date || ''}
                                            onChange={(e) => updateCertification(certification.id, 'date', e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add Certification button */}
                <button
                    type="button"
                    onClick={addCertification}
                    className="w-full p-6 border-2 border-dashed border-indigo-300 rounded-xl text-indigo-600 hover:border-indigo-500 hover:text-indigo-700 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 flex items-center justify-center font-semibold text-base shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                    <MdAdd className="w-6 h-6 mr-3" />
                    {t('CertificationsStep.actions.addCertification', 'Add Certification')}
                </button>
            </div>
        </div>
    );
};

export default CertificationsStep;
