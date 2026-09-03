import React, { useState } from 'react';
import { 
    MdAutoAwesome, 
    MdLightbulbOutline, 
    MdKeyboardArrowDown, 
    MdKeyboardArrowUp, 
    MdAdd,
    MdHelpOutline,
    MdCheckCircleOutline
} from 'react-icons/md';

/**
 * TrackGuidanceBanner — Guided Workspace Setup & Industry Orientation
 * 
 * Replaces dummy auto-filling cards with professional guidance:
 * - Highlights recommended industry focus areas
 * - Provides collapsible, clearly labelled examples (never pushed to user data)
 * - Prompts structured questions to elicit genuine candidate experience
 */
export default function TrackGuidanceBanner({
    candidateContext = {},
    stepName = 'Experience',
    stepPath = 'work-history',
    focusAreas = [],
    examples = [],
    onStartBlank = () => {},
    className = ''
}) {
    const [showExamples, setShowExamples] = useState(false);

    const domainLabel = candidateContext?.domainLabel || candidateContext?.profession || 'Professional';
    const profession = candidateContext?.profession || 'Specialist';

    // Default focus areas derived from domain competencies
    const effectiveFocus = focusAreas.length > 0 
        ? focusAreas 
        : (candidateContext?.domainData?.skills?.slice(0, 6) || [
            'Core Operational Deliverables',
            'Quality & Compliance Standards',
            'Process Optimization & Efficiencies',
            'Cross-Functional Leadership',
            'Measurable Business Outcomes',
            'Tools & Specialized Methodologies'
        ]);

    return (
        <div className={`bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4 shadow-2xs ${className}`}>
            {/* Header: Guided Direction */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                        <MdLightbulbOutline className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-slate-900">
                                Guided Setup: {domainLabel}
                            </h2>
                            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-wider">
                                Guidance
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">
                            Build your genuine {stepName.toLowerCase()} with tailored recommendations. Zero dummy data will be auto-filled.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onStartBlank}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 self-start sm:self-center"
                >
                    <MdAdd className="w-4 h-4" />
                    <span>+ Add Your Real {stepName}</span>
                </button>
            </div>

            {/* Guided Focus Recommendations */}
            <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <MdCheckCircleOutline className="w-3 h-3 text-emerald-500" />
                    <span>Recommended focus for {profession}:</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {effectiveFocus.map((focus, idx) => (
                        <span 
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700 font-medium"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            <span>{focus}</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Collapsible Inspiration & Examples (Visually Tagged as Inspiration) */}
            {examples.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                    <button
                        type="button"
                        onClick={() => setShowExamples(!showExamples)}
                        className="flex items-center justify-between w-full text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer py-1"
                    >
                        <span className="flex items-center gap-1.5">
                            <MdHelpOutline className="w-3.5 h-3.5 text-amber-500" />
                            <span>Need Inspiration? View Role Examples</span>
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.2 rounded border border-amber-200">
                                Samples only • Not auto-filled
                            </span>
                        </span>
                        {showExamples ? <MdKeyboardArrowUp className="w-4 h-4" /> : <MdKeyboardArrowDown className="w-4 h-4" />}
                    </button>

                    {showExamples && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 animate-in fade-in duration-150">
                            {examples.map((ex, exIdx) => (
                                <div 
                                    key={exIdx} 
                                    className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 space-y-1.5"
                                >
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-extrabold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded">
                                            Sample Inspiration #{exIdx + 1}
                                        </span>
                                        <span className="text-slate-400">Reference structure</span>
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-800">
                                        {ex.title || ex.jobTitle || ex.degree}
                                    </h4>
                                    <p className="text-[11px] text-slate-500 leading-relaxed italic">
                                        "{ex.description?.replace(/<[^>]*>/g, '').trim() || ex.bullets?.[0] || 'Detailed role accomplishments illustrating measurable impact.'}"
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
