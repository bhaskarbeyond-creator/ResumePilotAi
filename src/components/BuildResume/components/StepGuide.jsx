import React from 'react';
import { MdCheckCircle, MdCircle } from 'react-icons/md';

/**
 * StepGuide — the ONLY right rail in the builder. Replaces StepAtsCompanion.
 *
 * Everything shown here is deterministic evidence:
 *   - section status derived from the candidate's actual data (gaps),
 *   - real ATS findings for this section (the engine's own text, no invented
 *     statistics anywhere),
 *   - one optional contextual AI offer (rendered by the step).
 */

const SECTION_ATS_MAP = {
    heading: 'contact',
    summary: 'summary',
    'work-history': 'experience',
    education: 'education',
    skills: 'skills',
    projects: 'evidence',
};

export default function StepGuide({
    stepPath,
    gaps = [],
    atsSection = null,
    candidateContext = null,
    title = 'Guide',
    children = null,
}) {
    const missing = Array.isArray(gaps) ? gaps.filter(Boolean).slice(0, 4) : [];
    const atsId = SECTION_ATS_MAP[stepPath];
    const findings = atsSection && atsId === atsSection.id ? atsSection.findings : (atsSection?.findings || []);
    const openFindings = (Array.isArray(findings) ? findings : []).filter(f => !f.ok).slice(0, 4);
    const ready = missing.length === 0 && openFindings.length === 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{title}</h2>
                <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        ready
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                >
                    <MdCheckCircle className="w-3 h-3" />
                    {ready ? 'Ready' : 'Needs attention'}
                </span>
            </div>

            {missing.length > 0 && (
                <ul className="mt-3 space-y-1.5" aria-label="What is missing in this section">
                    {missing.map((gap, index) => (
                        <li key={`${gap}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug text-slate-600">
                            <MdCircle className="mt-1 w-2.5 h-2.5 shrink-0 text-amber-400" />
                            <span>{gap}</span>
                        </li>
                    ))}
                </ul>
            )}

            {openFindings.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        What the ATS check says
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                        {openFindings.map((finding, index) => (
                            <li key={`${finding.text}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug text-slate-600">
                                <MdCircle className="mt-1 w-2.5 h-2.5 shrink-0 text-slate-300" />
                                <span>{finding.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {candidateContext?.domainLabel && stepPath === 'work-history' && Array.isArray(candidateContext?.actionVerbs) && candidateContext.actionVerbs.length > 0 && (
                <div className="mt-3.5 rounded-lg border border-indigo-100 bg-indigo-50/70 p-2.5 text-xs text-indigo-900">
                    <p className="font-semibold text-indigo-950 flex items-center gap-1">
                        <span>💡 Recruiter screening tip</span>
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-indigo-800">
                        Lead bullet points with active verbs like <span className="font-semibold">{candidateContext.actionVerbs.slice(0, 3).join(', ')}</span> and anchor results to tangible outcomes.
                    </p>
                </div>
            )}

            {ready && (
                <div className="mt-3 space-y-1.5 rounded-lg border border-emerald-200/90 bg-emerald-50/70 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                        <MdCheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Optimized for screening ✓</span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-emerald-700/90">
                        All essential fields and formatting checks for this section are satisfied.
                    </p>
                </div>
            )}

            {children}
        </div>
    );
}
