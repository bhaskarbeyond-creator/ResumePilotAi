import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdLightbulb } from 'react-icons/md';
import SectionCard from './components/SectionCard';
import RichTextEditor from './components/RichTextEditor';
import { generateUserAiContent } from '../../../services/aiService';
import { calculateYearsOfExperience } from '../../../utils/resumeData';

const SummaryStep = ({ resumeData, updateResumeData }) => {
    const { t, i18n } = useTranslation('common');
    const [summary, setSummary] = useState(resumeData.summary || '');

    useEffect(() => {
        if (resumeData.summary !== undefined) {
            setSummary(resumeData.summary || '');
            const plainText = (resumeData.summary || '').replace(/<[^>]*>/g, '');
            setCharCount(plainText.length);
        }
    }, [resumeData.summary]);
    const [charCount, setCharCount] = useState(0);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [selectedTone, setSelectedTone] = useState('executive');
    const [error, setError] = useState(null);
    const aiRequestControllerRef = useRef(null);
    useEffect(() => () => { const controller = aiRequestControllerRef.current; aiRequestControllerRef.current = null; controller?.abort(); }, []);

    const handleSummaryChange = (text) => {
        setSummary(text);
        // Remove HTML tags for character count
        const plainText = text.replace(/<[^>]*>/g, '');
        setCharCount(plainText.length);
        updateResumeData({ summary: text });
    };

    const generateAISummary = async (toneToUse = selectedTone) => {
        setIsGeneratingAI(true);
        setError(null);

        // Check if occupation exists and show error if not
        if (!resumeData.occupation) {
            setError('Please fill in your occupation in the Personal Info step first to generate an AI summary.');
            setIsGeneratingAI(false);
            return;
        }

        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;
        try {
            // Extract data from resumeData for AI generation
            const name = `${resumeData.firstname || ''} ${resumeData.lastname || ''}`.trim() || 'Professional';
            const jobTitle = resumeData.occupation || 'Professional';

            // Calculate precise experience based on employment history date intervals
            const yearsExp = calculateYearsOfExperience(resumeData.employments || []);

            // Extract skills (handling both string arrays and object arrays)
            const skills = Array.isArray(resumeData.skills) && resumeData.skills.length > 0
                ? resumeData.skills
                      .map((skill) => (typeof skill === 'string' ? skill : skill.skillName || skill.name || ''))
                      .filter(Boolean)
                      .slice(0, 10)
                      .join(', ')
                : '';

            // Extract work history text with actual dates and details
            const workHistory = (resumeData.employments || [])
                .map((emp) => `${emp.jobTitle || emp.position || 'Role'} at ${emp.employer || emp.company || 'Company'} (${emp.begin || emp.startDate || ''} - ${emp.current ? 'Present' : (emp.end || emp.endDate || '')})${emp.description ? ': ' + emp.description : ''}`)
                .filter((line) => line.trim().length > 3)
                .join('; ');

            // Extract education details
            const education = (resumeData.educations || [])
                .map((edu) => `${edu.degree || 'Degree'} from ${edu.school || 'Institution'} (${edu.started || edu.startDate || ''} - ${edu.finished || edu.endDate || ''})`)
                .filter((line) => line.trim().length > 3)
                .join('; ');

            // Extract certifications
            const certifications = (resumeData.certifications || [])
                .map((c) => (typeof c === 'string' ? c : `${c?.title || c?.name || ''}${c?.issuer ? ' (' + c.issuer + ')' : ''}`))
                .filter(Boolean)
                .join(', ');

            // Extract projects
            const projects = (resumeData.projects || [])
                .map((p) => `${p?.title || p?.name || 'Project'}${p?.description ? ': ' + p.description : ''}`)
                .filter(Boolean)
                .join('; ');

            // Extract a key achievement from work history
            let achievement = 'delivering high-impact solutions';
            if (resumeData.employments && resumeData.employments.length > 0) {
                const latestJob = resumeData.employments[0];
                if (latestJob.description && latestJob.description.trim()) {
                    const descLines = latestJob.description.split('\n');
                    const firstLine = descLines.find((line) => line.trim().length > 0);
                    if (firstLine) {
                        achievement = firstLine.replace(/^[•\-\*]\s*/, '').trim();
                    }
                }
            }

            const preferredLanguage = localStorage.getItem('preferredLanguage') || 'en';

            const data = await generateUserAiContent('generate-summary', {
                name: name,
                jobTitle: jobTitle,
                occupation: jobTitle,
                experience: yearsExp,
                skills: skills || 'industry-standard competencies',
                workHistory: workHistory,
                education: education,
                certifications: certifications,
                projects: projects,
                achievement: achievement,
                summaryType: toneToUse,
                tone: toneToUse,
                language: preferredLanguage,
            }, { signal: requestController.signal });

            const generatedSummary = data?.summary || data?.description || data?.text || data?.data?.summary || (typeof data === 'string' ? data : null);

            if (generatedSummary && typeof generatedSummary === 'string' && generatedSummary.trim().length > 0) {
                const cleanSummary = generatedSummary.trim();
                setSummary(cleanSummary);
                setCharCount(cleanSummary.length);
                setError(null);
                updateResumeData({ summary: cleanSummary });
            } else {
                throw new Error('AI provider returned an unexpected summary format');
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Error generating AI summary:', error);

            const friendlyMessage = error.code === 'EMAIL_VERIFICATION_REQUIRED'
                ? 'Please verify your email address to use AI generation features.'
                : error.code === 'AUTH_REQUIRED'
                ? 'Please sign in to generate an AI summary.'
                : error.code === 'AI_PROVIDER_UNAVAILABLE'
                ? 'AI generation service is temporarily busy. A smart draft summary has been created for you.'
                : (error.message || 'Failed to generate AI summary. A smart draft has been created for you.');

            setError(friendlyMessage);

            // Dynamic fallback summary generation based on language & resume data (ATS-optimized 3-sentence formula)
            const profession = resumeData.occupation || (resumeData.employments?.[0]?.jobTitle) || 'Professional';
            const skillsList = (resumeData.skills || []).map(s => typeof s === 'string' ? s : s.name || s.skillName).filter(Boolean).slice(0, 4).join(', ');
            const preferredLanguage = localStorage.getItem('preferredLanguage') || 'en';

            let fallbackSummary;
            if (preferredLanguage === 'es') {
                fallbackSummary = `${profession} con sólida trayectoria técnica y experiencia en ${skillsList || 'desarrollo de soluciones avanzadas'}. Especializado en optimizar el rendimiento de sistemas, liderar iniciativas clave y entregar valor medible en entornos colaborativos. Comprometido con la excelencia operativa y el cumplimiento de objetivos estratégicos.`;
            } else if (preferredLanguage === 'fr') {
                fallbackSummary = `${profession} avec une solide expertise technique et une expérience avérée en ${skillsList || 'développement de solutions innovantes'}. Spécialisé dans l'optimisation des performances, la direction de projets clés et la livraison de valeur mesurable. Engagé dans l'excellence opérationnelle et les méthodes agiles.`;
            } else {
                fallbackSummary = `${profession} with a strong track record architecting and delivering high-impact solutions${skillsList ? ` specializing in ${skillsList}` : ''}. Experienced in optimizing production workflows, collaborating across cross-functional teams, and driving measurable outcomes. Proficient in modern industry methodologies, performance tuning, and technical problem-solving.`;
            }

            setSummary(fallbackSummary);
            setCharCount(fallbackSummary.length);
            updateResumeData({ summary: fallbackSummary });
        } finally {
            if (aiRequestControllerRef.current === requestController) {
                aiRequestControllerRef.current = null;
                setIsGeneratingAI(false);
            }
        }
    };

    const handleSave = () => {
        updateResumeData({ summary });

        // Mark step as completed if summary is provided
        const plainText = summary.replace(/<[^>]*>/g, '').trim();
        const completedSteps = [...(resumeData.completedSteps || [])];
        if (plainText.length >= 20) {
            if (!completedSteps.includes(2)) {
                completedSteps.push(2);
                updateResumeData({ summary, completedSteps });
            }
        } else if (completedSteps.includes(2)) {
            const updatedSteps = completedSteps.filter((step) => step !== 2);
            updateResumeData({ summary, completedSteps: updatedSteps });
        }
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [summary]);

    // Update character count when summary changes from AI generation
    useEffect(() => {
        // Remove HTML tags for character count
        const plainText = summary.replace(/<[^>]*>/g, '');
        setCharCount(plainText.length);
    }, [summary]);

    const getProgressColor = () => {
        if (charCount < 50) return 'bg-red-500';
        if (charCount < 100) return 'bg-amber-500';
        if (charCount < 200) return 'bg-blue-500';
        return 'bg-emerald-500';
    };

    const getProgressText = () => {
        if (charCount < 50) return t('SummaryStep.progress.tooShort');
        if (charCount < 100) return t('SummaryStep.progress.gettingThere');
        if (charCount < 200) return t('SummaryStep.progress.goodLength');
        if (charCount < 400) return t('SummaryStep.progress.greatLength');
        return t('SummaryStep.progress.excellent');
    };

    const getProgressTextColor = () => {
        if (charCount < 50) return 'text-red-600';
        if (charCount < 100) return 'text-amber-600';
        if (charCount < 200) return 'text-blue-600';
        return 'text-emerald-600';
    };

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            {/* Header Section */}
            <div className="mb-4">
                <div className="flex items-center mb-2">
                    <div className="mr-3 sm:mr-4 flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center">
                            <MdLightbulb className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">{t('SummaryStep.title')}</h1>
                        <p className="text-slate-600 text-sm hidden sm:block">{t('SummaryStep.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {/* Professional Summary Section */}
                <div className="relative bg-gradient-to-r from-white to-slate-50 border border-gray-200 rounded-xl shadow-md">
                    {/* Accent Line */}
                    <div
                        className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${
                            charCount >= 100 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400'
                        }`}></div>

                    {/* Header */}
                    <div className="px-4 sm:px-6 py-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                {/* Icon Badge */}
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mr-3 sm:mr-4 flex-shrink-0 shadow-sm ${
                                        charCount >= 100
                                            ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-200'
                                            : 'bg-gradient-to-br from-purple-400 to-indigo-500 text-white shadow-purple-200'
                                    }`}>
                                    {charCount >= 100 ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                    )}
                                </div>

                                {/* Title and Description */}
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-sm sm:text-base text-gray-800 truncate">{t('SummaryStep.professionalSummary.title')}</h3>
                                    <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">{t('SummaryStep.professionalSummary.description')}</p>
                                </div>
                            </div>

                            {/* Status Indicator */}
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${charCount >= 100 ? 'bg-green-400' : 'bg-gray-300'}`}></div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-br from-white to-slate-50 rounded-b-xl">
                        {/* Progress Section */}
                        <div
                            className={`p-4 rounded-xl border ${
                                charCount >= 100 ? 'bg-emerald-50 border-emerald-200' : charCount >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
                            }`}>
                            <div className="flex items-center justify-between mb-3">
                                <span className={`text-sm font-semibold ${getProgressTextColor()}`}>{getProgressText()}</span>
                                <span className="text-sm font-bold text-slate-700">{t('SummaryStep.characterCount', { current: charCount, max: 400 })}</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 shadow-inner">
                                <div className={`h-2 rounded-full ${getProgressColor()} shadow-sm`} style={{ width: `${Math.min(100, (charCount / 400) * 100)}%` }}></div>
                            </div>
                        </div>

                        {/* AI Generation & Tone Selection Section */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Tone:</span>
                                {[
                                    { id: 'executive', label: 'Executive' },
                                    { id: 'technical', label: 'Technical' },
                                    { id: 'metric-focused', label: 'Metrics' },
                                    { id: 'creative', label: 'Creative' }
                                ].map((tone) => (
                                    <button
                                        key={tone.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedTone(tone.id);
                                            if (!isGeneratingAI) generateAISummary(tone.id);
                                        }}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all border ${
                                            selectedTone === tone.id
                                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-700'
                                        }`}>
                                        {tone.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => generateAISummary(selectedTone)}
                                disabled={isGeneratingAI}
                                className={`flex items-center justify-center text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg shadow-xs shrink-0 transition-all ${
                                    isGeneratingAI
                                        ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                        : 'text-purple-700 bg-gradient-to-r from-purple-100 to-pink-100 hover:from-purple-200 hover:to-pink-200 cursor-pointer shadow-purple-100 hover:shadow-purple-200'
                                }`}
                                title={t('SummaryStep.ai.tooltip')}>
                                {isGeneratingAI ? (
                                    <>
                                        <div className="w-4 h-4 mr-2 border-2 border-gray-300 border-t-purple-600 rounded-full animate-spin"></div>
                                        {t('SummaryStep.ai.generating')}
                                    </>
                                ) : (
                                    <>
                                        <MdLightbulb className="w-4 h-4 mr-2" />
                                        {t('SummaryStep.ai.generate')}
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-sm font-medium text-red-600">{error}</p>
                            </div>
                        )}

                        {/* Summary Rich Text Editor */}
                        <div className="relative">
                            <RichTextEditor
                                value={summary}
                                onChange={handleSummaryChange}
                                rows={6}
                                placeholder={t('SummaryStep.content.placeholder')}
                                className={summary.trim().length >= 100 ? 'border-green-300 bg-green-50' : ''}
                            />

                            {/* Success indicator */}
                            {charCount >= 100 && (
                                <div className="absolute top-3 right-3 flex items-center pointer-events-none">
                                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SummaryStep;
