import React, { useMemo, useState } from 'react';
import { MdCheck, MdCheckCircle, MdExpandMore } from 'react-icons/md';
import { getCandidateContext } from '../../../utils/candidateContext.js';
import { calculateAtsScore } from '../../../utils/atsScore.js';
import StepGuide from './StepGuide.jsx';

/**
 * StepShell — the one panel of truth per step. Replaces StepWorkspaceLayout.
 *
 * Header: step number, name, purpose, completion state.
 * Mobile (<lg): responsive, accessible progressive disclosure accordion for section checklist.
 * Desktop (lg+): sleek sticky Guide rail derived entirely from deterministic evidence.
 */

const STEP_GAP_KEYS = {
    heading: 'heading',
    'work-history': 'workHistory',
    education: 'education',
    skills: 'skills',
    projects: 'projects',
    certifications: 'certifications',
    languages: 'languages',
    summary: 'summary',
    achievements: 'achievements',
    references: 'references',
    custom: 'custom',
};

export default function StepShell({
    stepNumber = 1,
    stepPath = 'heading',
    title = '',
    subtitle = '',
    isComplete = false,
    statusBadge = '',
    resumeData = {},
    targetJd = '',
    totalSteps = 12,
    hideGuide = false,
    guideChildren = null,
    children,
}) {
    const [isMobileGuideOpen, setIsMobileGuideOpen] = useState(false);
    const [isDesktopGuideCollapsed, setIsDesktopGuideCollapsed] = useState(false);

    const candidateContext = useMemo(
        () => getCandidateContext(resumeData || {}, targetJd || resumeData.targetJobDescription || ''),
        [resumeData, targetJd],
    );
    const atsResult = useMemo(
        () => calculateAtsScore(resumeData || {}, { jobDescription: targetJd || resumeData.targetJobDescription || '' }),
        [resumeData, targetJd],
    );

    const gapKey = STEP_GAP_KEYS[stepPath];
    const gaps = gapKey ? (candidateContext.gaps?.[gapKey] || []) : [];
    const atsSection = Array.isArray(atsResult?.sections)
        ? atsResult.sections.find(section => section.id === ({
            heading: 'contact', summary: 'summary', 'work-history': 'experience',
            education: 'education', skills: 'skills', projects: 'evidence',
        }[stepPath]))
        : null;

    const openFindingsCount = (Array.isArray(atsSection?.findings) ? atsSection.findings : []).filter(f => !f.ok).length;
    const isSectionReady = gaps.length === 0 && openFindingsCount === 0;

    return (
        <div className="w-full space-y-3 pb-8 sm:pb-0">
            <header className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5 shadow-2xs">
                <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                            className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg text-xs sm:text-sm font-bold ${
                                isComplete ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                            }`}
                            aria-label={`Step ${stepNumber} of ${totalSteps}`}
                        >
                            {isComplete ? <MdCheck className="w-4 h-4" /> : stepNumber}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900">{title}</h1>
                                {statusBadge ? (
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                        {statusBadge}
                                    </span>
                                ) : null}
                                <span
                                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                                        isComplete
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-amber-200 bg-amber-50 text-amber-700'
                                    }`}
                                >
                                    {isComplete ? 'Complete' : 'In progress'}
                                </span>
                            </div>
                            {subtitle ? (
                                <p className="mt-0.5 text-xs leading-relaxed text-slate-500 max-w-2xl">{subtitle}</p>
                            ) : null}
                        </div>
                    </div>

                    {!hideGuide && (
                        <div className="shrink-0 hidden lg:block">
                            <button
                                type="button"
                                onClick={() => setIsDesktopGuideCollapsed(prev => !prev)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
                                title={isDesktopGuideCollapsed ? 'Show Section Guide' : 'Expand workspace width'}
                            >
                                <span>{isDesktopGuideCollapsed ? 'Show Guide' : 'Expand View'}</span>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Mobile Section Guide & ATS Readiness Accordion (Progressive Disclosure on <lg screens) */}
            {!hideGuide && (
                <div className="lg:hidden rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setIsMobileGuideOpen(prev => !prev)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-slate-50/75 hover:bg-slate-100/90 transition-colors"
                        aria-expanded={isMobileGuideOpen}
                        aria-controls={`mobile-guide-${stepPath}`}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-slate-800">
                                Section Guide & ATS Insights
                            </span>
                            <span
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                    isSectionReady
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                            >
                                <MdCheckCircle className="w-3 h-3" />
                                {isSectionReady ? 'Ready ✓' : `${gaps.length + openFindingsCount} to review`}
                            </span>
                        </div>
                        <MdExpandMore
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                                isMobileGuideOpen ? 'rotate-180 text-indigo-600' : ''
                            }`}
                        />
                    </button>
                    {isMobileGuideOpen && (
                        <div id={`mobile-guide-${stepPath}`} className="p-3 border-t border-slate-100">
                            <StepGuide stepPath={stepPath} gaps={gaps} atsSection={atsSection} candidateContext={candidateContext}>
                                {guideChildren}
                            </StepGuide>
                        </div>
                    )}
                </div>
            )}

            <div className={`grid grid-cols-1 ${hideGuide || isDesktopGuideCollapsed ? '' : 'lg:grid-cols-12'} gap-4 lg:gap-6 items-start`}>
                <main className={`min-w-0 ${hideGuide || isDesktopGuideCollapsed ? 'w-full' : 'lg:col-span-8 xl:col-span-9'}`}>
                    {children}
                </main>

                {!hideGuide && !isDesktopGuideCollapsed && (
                    <aside aria-label="Section guide" className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-[120px] self-start">
                        <StepGuide stepPath={stepPath} gaps={gaps} atsSection={atsSection} candidateContext={candidateContext}>
                            {guideChildren}
                        </StepGuide>
                    </aside>
                )}
            </div>
        </div>
    );
}
