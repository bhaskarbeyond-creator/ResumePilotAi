import React, { useMemo } from 'react';
import { getEducationHealth } from '../../../../utils/bulletQuality.js';
import { MdCheckCircle, MdWarningAmber, MdSchool, MdAutoAwesome } from 'react-icons/md';

/**
 * EducationHealthCard
 * Displays instant, qualification-level ATS readiness feedback for a single education entry.
 * Evaluates Institution, Degree Level, Field of Study, Timeline, Honors/GPA, Coursework & JD Alignment.
 */
export default function EducationHealthCard({ education = {}, targetJd = '' }) {
    const health = useMemo(() => {
        return getEducationHealth(education, targetJd);
    }, [education, targetJd]);

    if (!education.school && !education.degree) {
        return null;
    }

    const getScoreBadge = (score) => {
        if (score >= 85) {
            return {
                label: 'ATS Ready',
                bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                dot: 'bg-emerald-500',
            };
        }
        if (score >= 70) {
            return {
                label: 'Strong',
                bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                dot: 'bg-indigo-500',
            };
        }
        if (score >= 45) {
            return {
                label: 'In Progress',
                bg: 'bg-amber-50 text-amber-700 border-amber-200',
                dot: 'bg-amber-500',
            };
        }
        return {
            label: 'Needs Details',
            bg: 'bg-slate-100 text-slate-600 border-slate-200',
            dot: 'bg-slate-400',
        };
    };

    const badge = getScoreBadge(health.score);

    return (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 space-y-2 transition-all">
            {/* Top Bar: Label + Score */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <MdSchool className="w-3.5 h-3.5 text-indigo-600" />
                        Academic ATS Health
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label} · {health.score}/100
                    </span>
                </div>

                {health.jdMatches.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        <MdAutoAwesome className="w-3 h-3 text-indigo-500" />
                        {health.jdMatches.length} Target JD Keywords Matched
                    </span>
                )}
            </div>

            {/* Checklist Micro-Pills */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
                {health.pills.map((pill) => {
                    const isOk = pill.ok;
                    let style = 'bg-white text-slate-600 border-slate-200';
                    if (pill.color === 'emerald') {
                        style = 'bg-emerald-50/90 text-emerald-800 border-emerald-200';
                    } else if (pill.color === 'amber') {
                        style = 'bg-amber-50/90 text-amber-800 border-amber-200';
                    } else if (pill.color === 'indigo') {
                        style = 'bg-indigo-50/90 text-indigo-800 border-indigo-200';
                    } else if (pill.color === 'slate') {
                        style = 'bg-slate-100/90 text-slate-600 border-slate-200';
                    }

                    return (
                        <span
                            key={pill.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium shadow-2xs ${style}`}
                        >
                            {isOk ? (
                                <MdCheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                                <MdWarningAmber className="w-3 h-3 text-amber-600 shrink-0" />
                            )}
                            <span>{pill.label}</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
