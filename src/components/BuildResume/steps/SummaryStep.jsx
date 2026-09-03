import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAutoAwesome, MdCheck } from 'react-icons/md';
import RichTextEditor from './components/RichTextEditor';
import { generateUserAiContent } from '../../../services/aiService';
import { calculateYearsOfExperience } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import StepWorkspaceLayout from '../components/StepWorkspaceLayout';
import QuickAddCommandBar from '../components/QuickAddCommandBar';
import AiDraftReviewModal from '../components/AiDraftReviewModal';

const TONES = [
    { id: 'balanced', label: 'Balanced' },
    { id: 'concise', label: 'Concise' },
    { id: 'technical', label: 'Specialized / Analytical' },
    { id: 'executive', label: 'Executive' },
];

const SummaryStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const candidateContext = React.useMemo(() => getCandidateContext(resumeData), [resumeData]);
    const [summary, setSummary] = useState(resumeData.summary || '');
    const [charCount, setCharCount] = useState(0);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [selectedTone, setSelectedTone] = useState('balanced');
    const [error, setError] = useState(null);
    const [reviewDraft, setReviewDraft] = useState('');
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const aiRequestControllerRef = useRef(null);

    useEffect(() => {
        if (resumeData.summary !== undefined) {
            setSummary(resumeData.summary || '');
            const plainText = String(resumeData.summary || '').replace(/<[^>]*>/g, '');
            setCharCount(plainText.length);
        }
    }, [resumeData.summary]);

    useEffect(() => {
        return () => {
            const controller = aiRequestControllerRef.current;
            aiRequestControllerRef.current = null;
            controller?.abort();
        };
    }, []);

    const handleSummaryChange = (text) => {
        setSummary(text);
        const plainText = text.replace(/<[^>]*>/g, '');
        setCharCount(plainText.length);
        updateResumeData({ summary: text });
    };

    const generateAISummary = async (toneToUse = selectedTone) => {
        setError(null);
        const targetOccupation = String(resumeData.occupation || resumeData.employments?.[0]?.jobTitle || '').trim();
        if (!targetOccupation) {
            setError('Enter your target occupation in Personal Info before generating an AI summary.');
            return;
        }

        const cleanText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const name = [resumeData.firstname, resumeData.lastname].map(cleanText).filter(Boolean).join(' ');
        const jobTitle = cleanText(targetOccupation);
        const yearsExp = calculateYearsOfExperience(resumeData.employments || []);
        const skills = (resumeData.skills || [])
            .map(skill => cleanText(typeof skill === 'string' ? skill : skill?.skillName || skill?.name))
            .filter(Boolean).slice(0, 20).join(', ');
        const workHistory = (resumeData.employments || []).map(emp => {
            const role = cleanText(emp?.jobTitle || emp?.position);
            const employer = cleanText(emp?.employer || emp?.company);
            const start = cleanText(emp?.begin || emp?.startDate);
            const end = emp?.current ? 'Present' : cleanText(emp?.end || emp?.endDate);
            const description = cleanText(emp?.description);
            const heading = [role, employer ? `${role ? 'at ' : ''}${employer}` : ''].filter(Boolean).join(' ');
            const dates = [start, end].filter(Boolean).join(' to ');
            return [heading, dates ? `Dates: ${dates}` : '', description].filter(Boolean).join('; ');
        }).filter(Boolean).join(' | ');
        const education = (resumeData.educations || []).map(edu => {
            const degree = cleanText(edu?.degree);
            const school = cleanText(edu?.school);
            const start = cleanText(edu?.started || edu?.startDate);
            const end = cleanText(edu?.finished || edu?.endDate);
            const description = cleanText(edu?.description);
            return [degree, school ? `${degree ? 'at ' : ''}${school}` : '', [start, end].filter(Boolean).join(' to '), description]
                .filter(Boolean).join('; ');
        }).filter(Boolean).join(' | ');
        const certifications = (resumeData.certifications || [])
            .map(cert => cleanText(typeof cert === 'string' ? cert : [cert?.title || cert?.name, cert?.issuer].filter(Boolean).join(' — ')))
            .filter(Boolean).join(', ');
        const projects = (resumeData.projects || [])
            .map(project => [cleanText(project?.title || project?.name), cleanText(project?.description)].filter(Boolean).join(': '))
            .filter(Boolean).join(' | ');
        const achievements = (resumeData.achievements || [])
            .map(item => [cleanText(item?.title || item?.name), cleanText(item?.description)].filter(Boolean).join(': '))
            .filter(Boolean).join(' | ');
        const existingText = cleanText(summary);

        aiRequestControllerRef.current?.abort();
        const requestController = new AbortController();
        aiRequestControllerRef.current = requestController;
        setIsGeneratingAI(true);
        try {
            const preferredLanguage = localStorage.getItem('preferredLanguage') || 'en';
            const targetJd = resumeData?.targetJd || localStorage.getItem('rpai.ats.targetJd') || '';
            const data = await generateUserAiContent('generate-summary', {
                name,
                jobTitle,
                occupation: jobTitle,
                experience: yearsExp,
                skills,
                workHistory,
                education,
                certifications,
                projects,
                achievement: achievements,
                existingText,
                tone: toneToUse,
                language: preferredLanguage,
                targetJd,
            }, { signal: requestController.signal });

            const generatedSummary = data?.summary;
            if (typeof generatedSummary !== 'string' || !generatedSummary.trim()) {
                throw new Error('Unable to generate summary');
            }
            const cleanSummary = generatedSummary.trim();
            // ZERO SILENT OVERWRITE: Open confirmation review modal
            setReviewDraft(cleanSummary);
            setIsReviewModalOpen(true);
        } catch (error) {
            if (error?.name === 'AbortError') return;
            const friendlyMessage = error.code === 'EMAIL_VERIFICATION_REQUIRED' || error.status === 403
                ? 'Verify your email address to use AI summary generation.'
                : error.code === 'AUTH_REQUIRED' || error.status === 401
                    ? 'Sign in to use AI summary generation.'
                    : error.code === 'RATE_LIMITED' || error.code === 'AI_DAILY_QUOTA_EXCEEDED' || error.status === 429
                        ? 'Daily AI quota limit reached. Please upgrade your plan or try again later.'
                        : error.code === 'AI_PROVIDER_UNAVAILABLE' || error.status === 503
                            ? 'AI provider is temporarily unavailable. Please try again in a moment.'
                            : error.code === 'INVALID_AI_INPUT' || error.code === 'INVALID_AI_REQUEST'
                                ? error.message
                                : (error.message && error.message !== 'AI request failed' ? error.message : 'Unable to generate summary at this moment.');
            setError(friendlyMessage);
        } finally {
            if (aiRequestControllerRef.current === requestController) {
                aiRequestControllerRef.current = null;
                setIsGeneratingAI(false);
            }
        }
    };

    const handleAcceptDraft = (acceptedText) => {
        const clean = String(acceptedText || '').trim();
        setSummary(clean);
        const plainText = clean.replace(/<[^>]*>/g, '');
        setCharCount(plainText.length);
        updateResumeData({ summary: clean });
    };

    const handleQuickAddAction = (actionId) => {
        switch (actionId) {
            case 'ai-align-jd':
                generateAISummary('executive');
                break;
            case 'ai-draft-summary':
            default:
                generateAISummary(selectedTone);
                break;
        }
    };

    const handleSave = () => {
        updateResumeData({ summary });

        const plainText = String(summary || '').replace(/<[^>]*>/g, '').trim();
        const completedSteps = [...(resumeData.completedSteps || [])];
        if (plainText.length >= 20) {
            if (!completedSteps.includes(8)) {
                completedSteps.push(8);
                updateResumeData({ summary, completedSteps });
            }
        } else if (completedSteps.includes(8) || completedSteps.includes(2)) {
            const updatedSteps = completedSteps.filter((step) => step !== 8 && step !== 2);
            updateResumeData({ summary, completedSteps: updatedSteps });
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summary]);

    const getProgressStatus = () => {
        if (charCount === 0) return { text: 'Empty', color: 'text-slate-400', bar: 'bg-slate-200' };
        if (charCount < 100) return { text: 'Getting Started', color: 'text-amber-600', bar: 'bg-amber-500' };
        if (charCount < 200) return { text: 'Good Length', color: 'text-blue-600', bar: 'bg-blue-500' };
        if (charCount <= 450) return { text: 'Optimal (ATS Recommended)', color: 'text-emerald-600', bar: 'bg-emerald-500' };
        return { text: 'Too Long', color: 'text-amber-600', bar: 'bg-amber-500' };
    };

    const progress = getProgressStatus();
    const hasSummary = charCount >= 80;

    return (
        <StepWorkspaceLayout
            stepNumber={8}
            stepPath="summary"
            title={t('SummaryStep.title', 'Professional Summary')}
            subtitle={t('SummaryStep.subtitle', 'Craft a high-impact 3–5 sentence executive summary highlighting your career achievements.')}
            isComplete={hasSummary}
            statusBadge={`${charCount} Characters`}
            resumeData={resumeData}
            onNavigate={onNavigate}
        >
            <div className="space-y-3">
                {/* Command Bar: Contextual Quick-Add Actions (Always Available) */}
                <QuickAddCommandBar
                    stepPath="summary"
                    onAction={handleQuickAddAction}
                    isAiLoading={isGeneratingAI}
                />

                {/* AI Draft Review Modal (Explicit Confirmation Gate) */}
                <AiDraftReviewModal
                    isOpen={isReviewModalOpen}
                    onClose={() => setIsReviewModalOpen(false)}
                    onAccept={handleAcceptDraft}
                    draftTitle="Executive Summary Draft"
                    draftContent={reviewDraft}
                    existingContent={summary}
                    targetFieldLabel="Executive Summary"
                    roleLabel={candidateContext.domainLabel || 'Professional'}
                    disclaimer="Grounded strictly in the career information and work history you provided. Verify all details before adding to your resume."
                />
                {/* Unified High-Density Summary Studio */}
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3.5">
                    {/* Header & Character Progress Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div>
                            <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                                Executive Profile & Career Pitch
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                A high-impact 3–5 sentence career narrative highlighting your core strengths.
                            </p>
                        </div>

                        {/* Density Meter */}
                        <div className="flex items-center gap-2.5 shrink-0 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                            <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className={`h-full ${progress.bar} transition-all duration-300`} 
                                    style={{ width: `${Math.min(100, (charCount / 400) * 100)}%` }} 
                                />
                            </div>
                            <span className={`text-[11px] font-bold ${progress.color}`}>
                                {charCount}/400 {charCount >= 100 && <MdCheck className="inline w-3 h-3 ml-0.5" />}
                            </span>
                        </div>
                    </div>

                    {/* AI Writing Studio Toolbar */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mr-1">
                                    Target Tone:
                                </span>
                                {TONES.map((tone) => (
                                    <button
                                        key={tone.id}
                                        type="button"
                                        onClick={() => setSelectedTone(tone.id)}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                            selectedTone === tone.id
                                                ? 'bg-purple-600 text-white shadow-2xs'
                                                : 'bg-white text-slate-600 border border-slate-200/80 hover:text-slate-900'
                                        }`}
                                    >
                                        {tone.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => generateAISummary(selectedTone)}
                                disabled={isGeneratingAI}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer ${
                                    isGeneratingAI
                                        ? 'bg-slate-100 text-slate-400 cursor-wait'
                                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                                }`}
                            >
                                <MdAutoAwesome className="w-3.5 h-3.5" />
                                <span>{isGeneratingAI ? 'Generating Narrative...' : '✨ AI Generate Summary'}</span>
                            </button>
                        </div>

                        {/* 1-Click Transformation Action Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-200/60">
                            <span className="text-[10px] font-bold text-slate-400">Quick AI Prompts:</span>
                            {[
                                { label: '✂ Make Concise', tone: 'concise' },
                                { label: '⚡ Add Quantified Impact', tone: 'balanced' },
                                { label: '👔 Executive Leadership', tone: 'executive' },
                                { label: '💻 Technical Deep-Dive', tone: 'technical' }
                            ].map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => {
                                        setSelectedTone(action.tone);
                                        generateAISummary(action.tone);
                                    }}
                                    disabled={isGeneratingAI}
                                    className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-purple-50 text-purple-700 rounded-md border border-purple-200/80 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error Notice */}
                    {error && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl font-medium">
                            {error}
                        </div>
                    )}

                    {/* Editor with Live Telemetry */}
                    <div className="space-y-1.5">
                        <div className="relative">
                            <RichTextEditor
                                value={summary}
                                onChange={handleSummaryChange}
                                rows={6}
                                placeholder={getDynamicPlaceholder('summary', 'text', candidateContext)}
                            />
                        </div>
                        {/* Word Count & Read Time Telemetry */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-medium">
                            <span>
                                {summary.replace(/<[^>]*>/g, ' ').trim() ? `${summary.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length} words` : '0 words'}
                                {' • '}
                                ~{Math.max(1, Math.round((summary.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length || 0) / 3))} sec read
                            </span>
                            <span className="text-slate-500">
                                Recommended: 3–5 sentences highlighting career achievements
                            </span>
                        </div>
                    </div>

                    {/* Executive Recruiter Pitch Card Preview */}
                    {summary.replace(/<[^>]*>/g, ' ').trim().length >= 40 && (
                        <div className="p-3.5 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl border border-indigo-100/90 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                                    <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Executive Recruiter Preview</span>
                                </span>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    Active Pitch
                                </span>
                            </div>
                            <p className="text-xs text-slate-800 leading-relaxed italic line-clamp-3">
                                "{summary.replace(/<[^>]*>/g, ' ').trim()}"
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </StepWorkspaceLayout>
    );
};

export default SummaryStep;
