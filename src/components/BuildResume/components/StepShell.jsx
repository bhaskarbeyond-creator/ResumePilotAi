import React, { useMemo } from 'react';
import { MdCheck } from 'react-icons/md';
import { getCandidateContext } from '../../../utils/candidateContext.js';
import { calculateAtsScore } from '../../../utils/atsScore.js';
import StepGuide from './StepGuide.jsx';

/**
 * StepShell — the one panel of truth per step. Replaces StepWorkspaceLayout.
 *
 * Header: step number, name, purpose, completion state. No ATS-weight pill,
 * no decorative chrome, no second mobile toggle.
 * Body: content (children) + a single optional Guide rail on lg+ screens,
 * derived entirely from deterministic evidence (gaps + real ATS findings).
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

    return (
        <div className="w-full space-y-3">
            <header className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 sm:px-5 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
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
            </header>

            <div className={`grid grid-cols-1 ${hideGuide ? '' : 'lg:grid-cols-12'} gap-4 lg:gap-6 items-start`}>
                <main className={`min-w-0 ${hideGuide ? '' : 'lg:col-span-8 xl:col-span-9'}`}>
                    {children}
                </main>

                {!hideGuide && (
                    <aside aria-label="Section guide" className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-[120px] self-start">
                        <StepGuide stepPath={stepPath} gaps={gaps} atsSection={atsSection}>
                            {guideChildren}
                        </StepGuide>
                    </aside>
                )}
            </div>
        </div>
    );
}
