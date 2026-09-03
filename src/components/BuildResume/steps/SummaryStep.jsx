import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import RichTextEditor from './components/RichTextEditor';
import StepShell from '../components/StepShell.jsx';
import AiPromptCard from '../components/AiPromptCard.jsx';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { calculateAtsScore } from '../../../utils/atsScore';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

const TONES = [
    { id: 'balanced', label: 'Balanced' },
    { id: 'concise', label: 'Concise' },
    { id: 'technical', label: 'Technical' },
    { id: 'executive', label: 'Executive' },
];

/**
 * Summary — editor + counter + one AI action ("Draft from my profile").
 * The AI draft is always an editable draft with an explicit "Use this draft"
 * (and a replace warning when the field already has content). No silent
 * overwrites, no quick-prompt pills, no fake recruiter previews.
 */
const SummaryStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const candidateContext = React.useMemo(
        () => getCandidateContext(resumeData, resumeData.targetJobDescription || ''),
        [resumeData],
    );
    const targetJd = resumeData.targetJobDescription || '';

    const [summary, setSummary] = useState(resumeData.summary || '');
    const [charCount, setCharCount] = useState(0);
    const [selectedTone, setSelectedTone] = useState('balanced');
    const ai = useAiAssist();

    useEffect(() => {
        if (resumeData.summary !== undefined) {
            setSummary(resumeData.summary || '');
            setCharCount(String(resumeData.summary || '').replace(/<[^>]*>/g, '').length);
        }
    }, [resumeData.summary]);

    const handleSummaryChange = (text) => {
        setSummary(text);
        setCharCount(text.replace(/<[^>]*>/g, '').length);
        updateResumeData({ summary: text });
    };

    const aiReadiness = canRunAssistOperation('generate-summary', { resumeData, targetJd });

    const runDraft = () => {
        ai.run({
            operation: 'generate-summary',
            resumeData,
            targetJd,
            tone: selectedTone,
        });
    };

    const handleUseDraft = (text) => {
        const clean = String(text || '').trim();
        setSummary(clean);
        setCharCount(clean.replace(/<[^>]*>/g, '').length);
        updateResumeData({ summary: clean });
        ai.reset();
    };

    const handleAiAnswers = (answers) => {
        // Summary questions are profile-level; the answers travel with the
        // next request as candidate evidence (they are not summary text).
        const merged = { ...answers };
        ai.run({
            operation: 'generate-summary',
            resumeData,
            targetJd,
            tone: selectedTone,
            answers: merged,
        });
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
        } else if (completedSteps.includes(8)) {
            const updatedSteps = completedSteps.filter((step) => step !== 8);
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
        if (charCount < 100) return { text: 'Getting started', color: 'text-amber-600', bar: 'bg-amber-500' };
        if (charCount <= 450) return { text: 'Good length', color: 'text-emerald-600', bar: 'bg-emerald-500' };
        return { text: 'Long — consider trimming', color: 'text-amber-600', bar: 'bg-amber-500' };
    };

    const progress = getProgressStatus();
    const hasSummary = charCount >= 80;

    // JD alignment hint — real engine output only
    const atsResult = calculateAtsScore(resumeData, { jobDescription: targetJd });
    const jdMatch = atsResult?.jdMatch;

    const wordCount = summary.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;

    return (
        <StepShell
            stepNumber={8}
            stepPath="summary"
            title={t('SummaryStep.title', 'Professional summary')}
            subtitle={t('SummaryStep.subtitle', 'Two to four sentences on who you are professionally and what you do well.')}
            isComplete={hasSummary}
            statusBadge={`${charCount} characters`}
            resumeData={resumeData}
            targetJd={targetJd}
        >
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">Your summary</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Written in your own words — AI can draft from what you have already entered, never the other way around.
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                        <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                                className={`h-full ${progress.bar} transition-all duration-300`}
                                style={{ width: `${Math.min(100, (charCount / 400) * 100)}%` }}
                            />
                        </div>
                        <span className={`text-[11px] font-semibold ${progress.color}`}>{charCount}/400 · {progress.text}</span>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <RichTextEditor
                        value={summary}
                        onChange={handleSummaryChange}
                        rows={6}
                        placeholder={getDynamicPlaceholder('summary', 'summary', candidateContext) || t('SummaryStep.placeholder', 'Who you are professionally, what you have done, and what you do well — in your own words.')}
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-medium">
                        <span>{wordCount} words</span>
                        <span>Recommended: 2–4 sentences</span>
                    </div>
                </div>

                {targetJd && candidateContext.target.role && jdMatch && jdMatch.score !== null && (
                    <p className="text-xs text-slate-500 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        Your resume currently covers <strong className="text-slate-700">{jdMatch.matched.length}</strong> of the{' '}
                        <strong className="text-slate-700">{jdMatch.total}</strong> distinctive terms in the job description for{' '}
                        {candidateContext.target.role}.
                    </p>
                )}

                <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Tone preference">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Tone</span>
                        {TONES.map(tone => (
                            <button
                                key={tone.id}
                                type="button"
                                onClick={() => setSelectedTone(tone.id)}
                                aria-pressed={selectedTone === tone.id}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                                    selectedTone === tone.id
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
                                }`}
                            >
                                {tone.label}
                            </button>
                        ))}
                    </div>

                    <AiPromptCard
                        title="Draft from my profile"
                        buttonLabel="Draft from my profile"
                        evidenceHint="Uses only your work history, education, and skills — the draft is editable before you use it."
                        status={ai.status}
                        result={ai.result}
                        error={ai.error?.message}
                        disabled={!aiReadiness.ok}
                        disabledReason={aiReadiness.reason}
                        draftExisting={summary}
                        onRun={runDraft}
                        onUseDraft={handleUseDraft}
                        onAnswers={handleAiAnswers}
                        onDismiss={() => ai.reset()}
                    />
                </div>
            </div>
        </StepShell>
    );
};

export default SummaryStep;
