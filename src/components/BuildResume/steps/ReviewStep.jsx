import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdSpeed, 
    MdCheckCircle, 
    MdWarning, 
    MdLightbulb, 
    MdArrowForward, 
    MdVisibility, 
    MdFileDownload,
    MdAutoAwesome,
    MdSearch,
    MdTune,
    MdCheck
} from 'react-icons/md';
import { calculateAtsScore, ATS_WEIGHTS } from '../../../utils/atsScore';

const personalFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export default function ReviewStep({
    resumeData = {},
    templateName = '',
    saveState,
    onNavigate,
    onChooseTemplate,
    onPreview,
    onDownload,
    isDownloading = false
}) {
    const { t } = useTranslation('common');
    const [targetJd, setTargetJd] = useState(resumeData.targetJobDescription || '');
    const [isJdInputOpen, setIsJdInputOpen] = useState(false);

    // Run deterministic ATS calculation
    const atsResult = useMemo(() => {
        return calculateAtsScore(resumeData, { jobDescription: targetJd }) || {
            qualityScore: 0,
            status: { id: 'getting-started', label: 'Getting Started' },
            sections: [],
            improvements: [],
            strengths: [],
            jdMatch: { score: null, matched: [], missing: [] }
        };
    }, [resumeData, targetJd]);

    const missingPersonalFields = personalFields.filter((field) => !hasText(resumeData?.[field]));
    const requiredReady = missingPersonalFields.length === 0;
    const saved = saveState?.status === 'saved';

    // Theme based on overall ATS quality score
    const getScoreTheme = (score) => {
        if (score >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' };
        if (score >= 60) return { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', bar: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800' };
        if (score >= 40) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' };
        return { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800' };
    };

    const overallTheme = getScoreTheme(atsResult.qualityScore);

    return (
        <div className="w-full max-w-[1440px] mx-auto space-y-4" aria-labelledby="review-export-title">
            {/* Command Center Hero Header */}
            <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 max-w-2xl">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-indigo-200 text-xs font-bold backdrop-blur-md">
                            <MdSpeed className="w-3.5 h-3.5 text-indigo-400" />
                            <span>ATS Readiness Command Center</span>
                        </div>
                        <h1 id="review-export-title" className="text-xl sm:text-2xl font-black tracking-tight text-white">
                            Review and export
                        </h1>
                        <p className="text-slate-300 text-xs leading-relaxed">
                            Every section of your resume has been audited against standard applicant tracking systems and recruiter screening algorithms.
                        </p>
                    </div>

                    {/* Overall Score Dial / Card */}
                    <div className="flex items-center gap-3.5 bg-white/10 border border-white/15 rounded-xl p-3.5 sm:p-4 backdrop-blur-md shrink-0">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center shadow-md text-white">
                            <span className="text-xl font-black tabular-nums leading-none">
                                {atsResult.qualityScore}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-100 mt-0.5">
                                / 100
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] font-semibold text-indigo-200 uppercase tracking-wider">
                                Overall Status
                            </div>
                            <div className="text-sm font-black text-white mt-0.5">
                                {atsResult.status?.label || 'In Progress'}
                            </div>
                            <div className="text-[10px] text-slate-300 mt-0.5">
                                {requiredReady ? '✓ Core details complete' : '⚠ Required fields missing'}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Save Status Alert */}
            <div 
                className={`rounded-2xl border p-4 transition-colors flex items-center justify-between gap-3 ${
                    saved ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-amber-200 bg-amber-50/80 text-amber-900'
                }`}
                role="status" 
                aria-live="polite"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        saved ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                    }`}>
                        {saved ? '✓' : '!'}
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold truncate">
                            {saved ? 'All edits safely saved to server' : (saveState?.message || 'Syncing edits...')}
                        </p>
                        <p className="text-[11px] text-slate-600">
                            {saved ? 'Your resume state is synced and ready for high-fidelity export.' : 'Please wait for synchronization before leaving.'}
                        </p>
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsJdInputOpen(prev => !prev)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                        <MdSearch className="w-4 h-4 text-indigo-600" />
                        <span>{targetJd ? 'Update Job Description' : 'Match Target Job'}</span>
                    </button>
                </div>
            </div>

            {/* Target Job Description Matcher Drawer (Collapsible) */}
            {isJdInputOpen && (
                <div className="bg-white rounded-2xl border border-indigo-100 p-5 shadow-sm space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MdTune className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-sm font-bold text-slate-900">Target Job Description Matcher</h3>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsJdInputOpen(false)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                            Close
                        </button>
                    </div>
                    <p className="text-xs text-slate-600">
                        Paste the text of the job description you are applying for. The ATS engine will evaluate keyword match and density.
                    </p>
                    <textarea
                        value={targetJd}
                        onChange={(e) => setTargetJd(e.target.value)}
                        aria-label="Target job description duties, requirements, and keywords"
                        rows={4}
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-y"
                    />
                    {atsResult.jdMatch?.score !== null && (
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">
                                Match Score: <strong className="text-indigo-700">{atsResult.jdMatch.score}%</strong>
                            </span>
                            {atsResult.jdMatch.matched?.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[11px] font-semibold text-slate-500">Matched:</span>
                                    {atsResult.jdMatch.matched.slice(0, 6).map((term, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                            ✓ {term}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {atsResult.jdMatch.missing?.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] font-semibold text-slate-500">Missing keywords:</span>
                                    {atsResult.jdMatch.missing.slice(0, 6).map((term, i) => (
                                        <button 
                                            key={i} 
                                            type="button"
                                            onClick={() => onNavigate('skills')}
                                            className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold cursor-pointer transition-colors"
                                            title={`Click to add ${term} in Skills step`}
                                        >
                                            + {term}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 2-Column Command Center Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Section-by-Section ATS Breakdown (8 cols) */}
                <main className="lg:col-span-8 space-y-4 min-w-0">
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm sm:text-base font-black text-slate-900">
                                    Section Readiness & ATS Weight Distribution
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Click any section to review and refine content directly.
                                </p>
                            </div>
                        </div>

                        {/* Sections List */}
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
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${secTheme.bg} ${secTheme.text} border ${secTheme.border}`}>
                                                {sec.score}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-xs font-extrabold text-slate-900">
                                                        {sec.name}
                                                    </h3>
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        (Weight: {ATS_WEIGHTS[sec.id] || 10}%)
                                                    </span>
                                                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md ${secTheme.badge}`}>
                                                        {secPct}%
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                                                    {sec.action || sec.reason || 'Section content reviewed and verified.'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={() => onNavigate(sec.navigateTo || 'heading')}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200/70 transition-colors cursor-pointer"
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

                    {/* Top Strengths & Improvements Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Strengths Card */}
                        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
                            <h3 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <MdCheckCircle className="w-4 h-4 text-emerald-600" />
                                Key Strengths Detected
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
                                    <li className="text-xs text-slate-500 italic">
                                        Add more detailed roles and skills to unlock strength badges.
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Top Improvements Card */}
                        <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
                            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                <MdWarning className="w-4 h-4 text-amber-600" />
                                Priority Recommendations
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
                                                    className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 shrink-0 cursor-pointer"
                                                >
                                                    Fix
                                                </button>
                                            )}
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-xs text-emerald-800 font-semibold">
                                        No critical gaps found! Your resume passes standard ATS benchmarks.
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </main>

                {/* Right Column: Template, Preview & Export Actions (4 cols, Sticky) */}
                <aside className="lg:col-span-4 sticky top-[125px] self-start space-y-4" aria-label="Template and export actions">
                    {/* Presentation & Template Card */}
                    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Active Presentation
                            </span>
                            <h2 className="text-base font-black text-slate-900 mt-0.5">
                                {templateName || 'Modern Template'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Fully parsed layout formatted for ATS parsing and recruiter readability.
                            </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onChooseTemplate}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                            >
                                <span>Change Template Layout</span>
                            </button>
                            <button
                                type="button"
                                onClick={onPreview}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                            >
                                <MdVisibility className="w-4 h-4 text-indigo-600" />
                                <span>Open Fullscreen Preview</span>
                            </button>
                        </div>
                    </div>

                    {/* Final Export Action Card */}
                    <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-md space-y-3">
                        <div className="flex items-center gap-2">
                            <MdFileDownload className="w-5 h-5 text-indigo-300" />
                            <h3 className="text-sm font-black text-white">
                                Ready to Download
                            </h3>
                        </div>
                        <p className="text-xs text-indigo-200 leading-relaxed">
                            Generate a clean, high-fidelity PDF with optimal typography, ATS-parseable text layers, and perfect margins.
                        </p>

                        <button
                            type="button"
                            onClick={onDownload}
                            disabled={isDownloading || !requiredReady}
                            aria-describedby={!requiredReady ? 'export-requirement' : undefined}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-black shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                        >
                            <MdFileDownload className="w-4 h-4" />
                            <span>{isDownloading ? 'Preparing Export...' : 'Download Resume (PDF)'}</span>
                        </button>

                        {!requiredReady && (
                            <p id="export-requirement" className="text-[11px] text-amber-300 bg-amber-950/40 p-2.5 rounded-xl border border-amber-800/60 leading-snug">
                                ⚠ Please complete the required Personal & Contact details (Step 1) before downloading.
                            </p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
