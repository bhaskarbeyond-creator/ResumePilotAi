import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdCheckCircle,
    MdWarning,
    MdArrowForward,
    MdVisibility,
    MdFileDownload,
    MdSearch,
    MdCheck,
    MdAutoAwesome,
} from 'react-icons/md';
import { calculateAtsScore } from '../../../utils/atsScore';
import { generateUserAiContent } from '../../../services/aiService';

const personalFields = ['firstname', 'lastname'];

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Review — the ATS command center. The engine's own findings drive every
 * displayed claim (no invented statistics). The JD matcher shows real
 * MATCHED / PARTIAL / MISSING buckets. Export/preview unchanged.
 */
export default function ReviewStep({
    resumeData = {},
    templateName = '',
    saveState,
    updateResumeData,
    onNavigate,
    onChooseTemplate,
    onPreview,
    onDownload,
    isDownloading = false
}) {
    const { t } = useTranslation('common');
    const [targetJd, setTargetJd] = useState(resumeData.targetJobDescription || '');
    const [isJdInputOpen, setIsJdInputOpen] = useState(false);
    const [isGeneratingJd, setIsGeneratingJd] = useState(false);

    const handleAutofillJd = async () => {
        const effectiveRole = String(resumeData.targetRole || resumeData.occupation || '').trim();
        if (!effectiveRole) {
            alert('Please specify a target role or occupation in Step 1 (Heading) first.');
            return;
        }
        if (targetJd && targetJd.trim().length >= 30) {
            const confirmed = window.confirm(
                `Your target requirements already contain text. Do you want to replace it with AI-generated requirements for "${effectiveRole}"?`
            );
            if (!confirmed) return;
        }
        setIsGeneratingJd(true);
        try {
            const res = await generateUserAiContent('generate-job-description', {
                targetRole: effectiveRole,
                occupation: resumeData.occupation || '',
            });
            const generatedText = typeof res?.jobDescription === 'string'
                ? res.jobDescription
                : (typeof res?.text === 'string' ? res.text : '');
            if (generatedText) {
                setTargetJd(generatedText);
                targetJdRef.current = generatedText;
                if (typeof updateResumeData === 'function') {
                    updateResumeData({ targetJobDescription: generatedText });
                }
            }
        } catch (err) {
            console.error('[ReviewStep] Failed to generate requirements:', err);
        } finally {
            setIsGeneratingJd(false);
        }
    };

    // Sync targetJd if resumeData is updated externally (e.g. via top ATS gauge)
    useEffect(() => {
        if (resumeData.targetJobDescription !== undefined && resumeData.targetJobDescription !== targetJd) {
            setTargetJd(resumeData.targetJobDescription || '');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeData.targetJobDescription]);

    // Persist the JD into the resume document so other steps (summary,
    // skills) see the same target. Debounced; additive field only.
    useEffect(() => {
        if (typeof updateResumeData !== 'function') return undefined;
        const timer = setTimeout(() => {
            updateResumeData({ targetJobDescription: targetJd });
        }, 600);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetJd]);

    // Unmount flush: immediately commit pending targetJd when leaving the step
    const targetJdRef = useRef(targetJd);
    const updateResumeDataRef = useRef(updateResumeData);
    useEffect(() => { targetJdRef.current = targetJd; }, [targetJd]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => () => {
        if (typeof updateResumeDataRef.current === 'function') {
            updateResumeDataRef.current({ targetJobDescription: targetJdRef.current });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const atsResult = useMemo(() => {
        return calculateAtsScore(resumeData, { jobDescription: targetJd }) || {
            qualityScore: 0,
            status: { id: 'getting-started', label: 'Getting Started' },
            sections: [],
            improvements: [],
            strengths: [],
            jdMatch: { score: null, matched: [], partial: [], missing: [] }
        };
    }, [resumeData, targetJd]);

    const missingPersonalFields = personalFields.filter((field) => !hasText(resumeData?.[field]));
    const requiredReady = missingPersonalFields.length === 0;
    const saved = saveState?.status === 'saved';

    const getScoreTheme = (score) => {
        if (score >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800', solid: 'bg-emerald-600' };
        if (score >= 60) return { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-800', solid: 'bg-indigo-600' };
        if (score >= 40) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800', solid: 'bg-amber-600' };
        return { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-800', solid: 'bg-rose-600' };
    };

    const overallTheme = getScoreTheme(atsResult.qualityScore);

    return (
        <div className="w-full max-w-[1440px] mx-auto space-y-4" aria-labelledby="review-export-title">
            {/* Header — calm, factual */}
            <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                        <div className="flex items-center gap-2.5">
                            <h1 id="review-export-title" className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                                Review and export
                            </h1>
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${overallTheme.badge}`}>
                                {atsResult.qualityScore}/100 ATS Score
                            </span>
                        </div>
                        <p className="text-slate-500 text-xs leading-relaxed">
                            How each section of your resume checks against ATS parsing and recruiter screening —
                            every claim below comes from the check itself.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => setIsJdInputOpen(prev => !prev)}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                            <MdSearch className="w-4 h-4 text-indigo-600" />
                            <span>{targetJd ? 'Update Job Description' : 'Match Target Job'}</span>
                        </button>

                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
                            <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-white ${overallTheme.solid}`}>
                                <span className="text-base font-bold tabular-nums leading-none">
                                    {atsResult.qualityScore}
                                </span>
                                <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5 opacity-70">
                                    / 100
                                </span>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-900">
                                    {atsResult.status?.label || 'In Progress'}
                                </div>
                                <div className={`text-[10px] mt-0.5 font-medium ${requiredReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {requiredReady ? '✓ Core details complete' : '⚠ Required fields missing'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Target Job Description Matcher */}
            {isJdInputOpen && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">Target job description</h3>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleAutofillJd}
                                disabled={isGeneratingJd}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg px-2.5 py-1 transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                                title="Auto-fill realistic requirements using AI"
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
                            <button
                                type="button"
                                onClick={() => setIsJdInputOpen(false)}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Paste the job description you are applying for. Matching checks which of its distinctive terms
                        your resume uses — matched, partially, or not at all.
                    </p>
                    <textarea
                        value={targetJd}
                        onChange={(e) => setTargetJd(e.target.value)}
                        aria-label="Target job description duties, requirements, and keywords"
                        rows={4}
                        className="w-full text-xs p-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-y"
                    />
                    {atsResult.jdMatch?.score !== null && (
                        <div className="pt-2 space-y-2">
                            <span className="text-xs font-semibold text-slate-700">
                                Match: <strong className="text-indigo-700">{atsResult.jdMatch.score}%</strong>
                                <span className="text-slate-400 font-normal">
                                    {' '}· {atsResult.jdMatch.matched.length} matched · {atsResult.jdMatch.partial?.length || 0} partial · {atsResult.jdMatch.missing.length} missing
                                </span>
                            </span>
                            {atsResult.jdMatch.matched?.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-500">Matched:</span>
                                    {atsResult.jdMatch.matched.slice(0, 8).map((term, i) => (
                                        <span key={`m-${i}`} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                            ✓ {term}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {atsResult.jdMatch.partial?.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-500">Partial:</span>
                                    {atsResult.jdMatch.partial.slice(0, 8).map((term, i) => (
                                        <span key={`p-${i}`} className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {atsResult.jdMatch.missing?.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] font-semibold text-slate-500">Not in your resume:</span>
                                    {atsResult.jdMatch.missing.slice(0, 8).map((term, i) => (
                                        <button
                                            key={`x-${i}`}
                                            type="button"
                                            onClick={() => onNavigate('skills')}
                                            className="px-2 py-0.5 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold transition-colors"
                                            title={`Consider whether “${term}” should appear in your Skills`}
                                        >
                                            {term}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="text-[11px] text-slate-400">
                                Add terms only when they are true for you — partial matches often mean your resume uses
                                a different word for the same thing, which is fine.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* 2-Column Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Section-by-Section Breakdown */}
                <main className="lg:col-span-8 space-y-4 min-w-0">
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
                        <div className="mb-4">
                            <h2 className="text-sm sm:text-base font-bold text-slate-900">
                                Section readiness
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Click any section to review and refine content directly.
                            </p>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {atsResult.sections.map((sec) => {
                                const secPct = sec.maxScore > 0 ? Math.round((sec.score / sec.maxScore) * 100) : 0;
                                const secTheme = getScoreTheme(secPct);

                                return (
                                    <div
                                        key={sec.id}
                                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                                    >
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${secTheme.bg} ${secTheme.text} border ${secTheme.border}`}>
                                                {sec.score}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-xs font-bold text-slate-900">
                                                        {sec.name}
                                                    </h3>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${secTheme.badge}`}>
                                                        {secPct}%
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                                                    {sec.action || sec.reason || 'Section content reviewed.'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={() => onNavigate(sec.navigateTo || 'heading')}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200/70 transition-colors"
                                            >
                                                <span>Edit</span>
                                                <MdArrowForward className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Strengths & Improvements — engine findings only */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <MdCheckCircle className="w-4 h-4 text-emerald-600" />
                                What is working
                            </h3>
                            <ul className="space-y-1.5">
                                {atsResult.strengths?.length > 0 ? (
                                    atsResult.strengths.map((str, idx) => (
                                        <li key={idx} className="text-xs text-emerald-950 flex items-start gap-1.5 leading-relaxed">
                                            <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                            <span>{str}</span>
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-xs text-slate-500">
                                        Add detailed roles and skills to see what is working.
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                <MdWarning className="w-4 h-4 text-amber-600" />
                                What to fix first
                            </h3>
                            <ul className="space-y-1.5">
                                {atsResult.improvements?.length > 0 ? (
                                    atsResult.improvements.slice(0, 4).map((imp, idx) => (
                                        <li key={idx} className="text-xs text-amber-950 flex items-start justify-between gap-2 leading-relaxed">
                                            <span className="flex items-start gap-1.5">
                                                <span className="text-amber-600 font-bold shrink-0">•</span>
                                                <span>{typeof imp === 'string' ? imp : imp.text}</span>
                                            </span>
                                            {typeof imp === 'object' && imp.navigateTo && (
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigate(imp.navigateTo)}
                                                    className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 shrink-0"
                                                >
                                                    Fix
                                                </button>
                                            )}
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-xs text-emerald-800 font-semibold">
                                        No critical gaps found.
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </main>

                {/* Right: Template, Preview & Export */}
                <aside className="lg:col-span-4 sticky top-[125px] self-start space-y-4" aria-label="Template and export actions">
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Active presentation
                            </span>
                            <h2 className="text-base font-bold text-slate-900 mt-0.5">
                                {templateName || 'Modern Template'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Text-first layout, readable by ATS parsers.
                            </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onChooseTemplate}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-800 text-xs font-semibold transition-all"
                            >
                                <span>Change template</span>
                            </button>
                            <button
                                type="button"
                                onClick={onPreview}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition-all"
                            >
                                <MdVisibility className="w-4 h-4 text-indigo-600" />
                                <span>Open preview</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-md space-y-3">
                        <div className="flex items-center gap-2">
                            <MdFileDownload className="w-5 h-5 text-indigo-300" />
                            <h3 className="text-sm font-bold text-white">
                                Download
                            </h3>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Export a PDF with the selected template.
                        </p>

                        <button
                            type="button"
                            onClick={requiredReady ? onDownload : () => onNavigate?.('heading')}
                            disabled={isDownloading}
                            aria-describedby={!requiredReady ? 'export-requirement' : undefined}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                            <MdFileDownload className="w-4 h-4" />
                            <span>{isDownloading ? 'Preparing export…' : requiredReady ? 'Download Resume (PDF)' : 'Complete Name to Download (Step 1)'}</span>
                        </button>

                        {!requiredReady && (
                            <p id="export-requirement" className="text-[11px] text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-800/60 leading-snug">
                                Add your name in Step 1 before downloading.
                            </p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
