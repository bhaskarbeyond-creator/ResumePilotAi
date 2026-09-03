import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdSpeed, MdExpandMore, MdExpandLess, MdCheck, MdChevronRight } from 'react-icons/md';
import StepAtsCompanion from './StepAtsCompanion';
import { ATS_WEIGHTS } from '../../../utils/atsScore';

const SECTION_WEIGHT_MAP = {
    heading: ATS_WEIGHTS.contact,
    'work-history': ATS_WEIGHTS.experience,
    education: ATS_WEIGHTS.education,
    skills: ATS_WEIGHTS.skills,
    projects: 6,
    certifications: 4,
    languages: 2,
    summary: ATS_WEIGHTS.summary,
    achievements: 4,
    references: 2,
    custom: 2,
    review: 100
};

export default function StepWorkspaceLayout({
    stepNumber = 1,
    stepPath = 'heading',
    title = '',
    subtitle = '',
    isComplete = false,
    statusBadge = '',
    resumeData = {},
    onNavigate,
    onAction,
    gridCols = 'lg:grid-cols-12',
    mainCols = 'lg:col-span-8',
    asideCols = 'lg:col-span-4',
    children
}) {
    const { t } = useTranslation('common');
    const [isMobileCompanionOpen, setIsMobileCompanionOpen] = useState(false);
    const weight = SECTION_WEIGHT_MAP[stepPath] || 10;

    return (
        <div className="w-full space-y-2.5">
            {/* Unified Professional Studio Header */}
            <header className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Step indicator, Name, Badges */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div 
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs sm:text-sm font-black shrink-0 shadow-xs transition-all ${
                                isComplete 
                                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-500/15' 
                                    : 'bg-slate-900 text-white ring-4 ring-slate-900/10'
                            }`}
                            aria-label={`Step ${stepNumber} of 11`}
                        >
                            {isComplete ? <MdCheck className="w-5 h-5 stroke-[1.5]" /> : stepNumber}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                    Step {stepNumber} of 11
                                </span>
                                <h1 className="text-sm sm:text-base lg:text-lg font-black tracking-tight text-slate-900">
                                    {title}
                                </h1>

                                {statusBadge && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        {statusBadge}
                                    </span>
                                )}

                                {isComplete ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <MdCheck className="w-3 h-3" />
                                        <span>Complete</span>
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        In Progress
                                    </span>
                                )}
                            </div>
                            {subtitle && (
                                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed max-w-2xl">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right: ATS Weight & Mobile Co-Pilot Trigger */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Desktop ATS Weight Pill */}
                        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100/80 text-slate-800 text-xs font-bold shadow-2xs">
                            <MdSpeed className="w-4 h-4 text-indigo-600" />
                            <span>ATS Weight: <strong className="text-indigo-700 font-extrabold">{weight}%</strong></span>
                        </div>

                        {/* Mobile Co-Pilot Toggle Button */}
                        <button
                            type="button"
                            onClick={() => setIsMobileCompanionOpen(prev => !prev)}
                            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                            aria-expanded={isMobileCompanionOpen}
                            aria-label="Toggle ATS Section Intelligence"
                        >
                            <MdSpeed className="w-4 h-4 text-indigo-600" />
                            <span>ATS Intelligence ({weight}%)</span>
                            {isMobileCompanionOpen ? <MdExpandLess className="w-4 h-4" /> : <MdExpandMore className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Collapsible ATS Co-Pilot Drawer */}
            {isMobileCompanionOpen && (
                <div className="lg:hidden animate-in fade-in duration-200">
                    <StepAtsCompanion 
                        stepPath={stepPath}
                        resumeData={resumeData}
                        onNavigate={onNavigate}
                        onAction={onAction}
                        compactMode={true}
                    />
                </div>
            )}

            {/* Responsive Studio Workspace Grid */}
            <div className={`grid grid-cols-1 ${gridCols} gap-4 lg:gap-6 items-start`}>
                {/* Main Drafting Canvas */}
                <main className={`${mainCols} min-w-0`}>
                    {children}
                </main>

                {/* Desktop Sticky ATS Intelligence Inspector */}
                <aside 
                    aria-label="ATS Section Intelligence Co-Pilot" 
                    className={`hidden lg:block ${asideCols} sticky top-[120px] self-start space-y-3`}
                >
                    <StepAtsCompanion 
                        stepPath={stepPath}
                        resumeData={resumeData}
                        onNavigate={onNavigate}
                        onAction={onAction}
                    />
                </aside>
            </div>
        </div>
    );
}
