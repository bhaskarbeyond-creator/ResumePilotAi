import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdCheckCircle,
    MdExpandLess,
    MdExpandMore,
    MdSpeed,
    MdWarning,
} from 'react-icons/md';
import {
    calculateAtsScore,
    readStoredJobDescription,
    writeStoredJobDescription,
} from '../../utils/atsScore';

export { calculateAtsScore } from '../../utils/atsScore';

const STATUS_THEME = {
    excellent: { stroke: '#059669', chip: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    strong: { stroke: '#4f46e5', chip: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
    'needs-improvement': { stroke: '#d97706', chip: 'bg-amber-50 border-amber-200 text-amber-800' },
    'getting-started': { stroke: '#475569', chip: 'bg-slate-100 border-slate-300 text-slate-800' },
};

const RadialGauge = ({ score, stroke, label }) => {
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
    return (
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
            <svg className="h-12 w-12 -rotate-90 transform" viewBox="0 0 56 56" aria-hidden="true">
                <circle cx="28" cy="28" r={radius} stroke="currentColor" strokeWidth="4.5" fill="transparent" className="text-slate-100" />
                <circle
                    cx="28"
                    cy="28"
                    r={radius}
                    stroke={stroke}
                    strokeWidth="4.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-black leading-none text-slate-900">{score}</span>
                <span className="text-[8px] font-bold text-slate-400">/100</span>
            </div>
            <span className="sr-only">{label}</span>
        </div>
    );
};

const AtsScoreMeter = ({ resumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [isExpanded, setIsExpanded] = useState(false);
    const [showMatcher, setShowMatcher] = useState(false);
    const [jdText, setJdText] = useState(() => readStoredJobDescription());
    const [jdDraft, setJdDraft] = useState(() => readStoredJobDescription());

    useEffect(() => {
        writeStoredJobDescription(jdText);
    }, [jdText]);

    const result = useMemo(
        () => calculateAtsScore(resumeData, { jobDescription: jdText }),
        [resumeData, jdText],
    );

    const theme = STATUS_THEME[result.status.id] || STATUS_THEME['getting-started'];
    const gaugeLabel = t(
        'AtsScoreMeter.gaugeLabel',
        'ATS readiness {{score}} out of 100, {{status}}',
        { score: result.qualityScore, status: result.status.label },
    );
    const matchLabel = result.jdMatch.score == null
        ? t('AtsScoreMeter.jdNotProvided', 'Not provided')
        : t('AtsScoreMeter.jdMatchPct', '{{score}}% match', { score: result.jdMatch.score });

    const applyJobDescription = () => {
        setJdText(jdDraft);
        setShowMatcher(true);
    };

    const clearJobDescription = () => {
        setJdDraft('');
        setJdText('');
    };

    const go = (path) => {
        if (typeof onNavigate === 'function' && path) onNavigate(path);
    };

    return (
        <section
            className="space-y-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm"
            aria-label={t('AtsScoreMeter.region', 'ATS readiness')}
            data-testid="ats-score-meter">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <RadialGauge score={result.qualityScore} stroke={theme.stroke} label={gaugeLabel} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <MdSpeed className="h-3.5 w-3.5 flex-shrink-0 text-indigo-600" aria-hidden="true" />
                            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-800">
                                {t('AtsScoreMeter.title', 'ATS readiness')}
                            </span>
                        </div>
                        <p className="text-[10px] font-semibold tabular-nums text-slate-500" data-testid="ats-readiness-score">
                            {result.qualityScore} / 100
                        </p>
                        <span className={`mt-0.5 inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${theme.chip}`}>
                            {result.status.label}
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsExpanded((value) => !value)}
                    className="flex-shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    aria-expanded={isExpanded}
                    aria-controls="ats-score-details"
                    title={t('AtsScoreMeter.toggle', 'Toggle detailed breakdown')}>
                    {isExpanded ? <MdExpandLess className="h-5 w-5" /> : <MdExpandMore className="h-5 w-5" />}
                    <span className="sr-only">{t('AtsScoreMeter.toggle', 'Toggle detailed breakdown')}</span>
                </button>
            </div>

            <p className="text-[10px] leading-snug text-slate-500" data-testid="ats-jd-match">
                <span className="font-bold text-slate-600">{t('AtsScoreMeter.jdTitle', 'Target job match')}</span>
                {': '}
                {matchLabel}
            </p>

            {result.language.nonEnglish && isExpanded && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                    {t('AtsScoreMeter.nonEnglish', 'Action-verb coaching is English-oriented. Your content is still scored on structure, evidence, and relevance.')}
                </p>
            )}

            {isExpanded && (
                <div id="ats-score-details" className="max-h-[min(22rem,50vh)] space-y-2.5 overflow-y-auto border-t border-slate-100 pt-2">
                    {result.improvements.length > 0 && (
                        <div>
                            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {t('AtsScoreMeter.improvements', 'Highest-value next steps')}
                            </h3>
                            <ol className="space-y-1">
                                {result.improvements.map((item, index) => (
                                    <li key={item.text} className="text-[10px] leading-snug text-slate-700">
                                        <span className="font-extrabold text-slate-500">{index + 1}.</span>{' '}
                                        {item.text}
                                        {item.navigateTo && typeof onNavigate === 'function' && (
                                            <button
                                                type="button"
                                                onClick={() => go(item.navigateTo)}
                                                className="ml-1 font-bold text-indigo-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                                {t('AtsScoreMeter.go', 'Go')}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {result.strengths.length > 0 && result.qualityScore >= 15 && (
                        <div>
                            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {t('AtsScoreMeter.strengths', 'Strengths')}
                            </h3>
                            <ul className="space-y-1">
                                {result.strengths.map((item) => (
                                    <li key={item} className="flex items-start gap-1.5 text-[10px] leading-snug text-emerald-800">
                                        <MdCheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            <span>{t('AtsScoreMeter.breakdown', 'Why this score')}</span>
                            <span>{t('AtsScoreMeter.points', 'Points')}</span>
                        </div>
                        {result.qualityScore < 15 && (
                            <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] leading-snug text-slate-600">
                                {t('AtsScoreMeter.emptyCoach', 'You are just getting started. Add contact details and one role — the score will move as the resume becomes real.')}
                            </p>
                        )}
                        {(result.qualityScore < 15 ? result.sections.filter((section) => ['contact', 'experience', 'summary'].includes(section.id)) : result.sections).map((section) => {
                            const percent = Math.round((section.score / section.maxScore) * 100);
                            const healthy = percent >= 70;
                            return (
                                <article key={section.id} className="space-y-1 rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <h4 className="truncate text-[11px] font-bold text-slate-700">{t(`AtsScoreMeter.categories.${section.id}`, section.name)}</h4>
                                        <span className="ml-1 text-[10px] font-extrabold tabular-nums text-slate-600">
                                            {section.score}/{section.maxScore}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                                        <div
                                            className={`h-1 rounded-full transition-all duration-500 ${healthy ? 'bg-indigo-600' : 'bg-amber-500'}`}
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] leading-tight text-slate-500">{section.action}</p>
                                    {section.navigateTo && typeof onNavigate === 'function' && section.score < section.maxScore && (
                                        <button
                                            type="button"
                                            onClick={() => go(section.navigateTo)}
                                            className="text-[10px] font-bold text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                            {t('AtsScoreMeter.improve', 'Improve')} {t(`AtsScoreMeter.categories.${section.id}`, section.name)}
                                        </button>
                                    )}
                                </article>
                            );
                        })}
                    </div>

                    <div className="border-t border-slate-200 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowMatcher((value) => !value)}
                            className="flex w-full items-center justify-between rounded-lg border border-indigo-200/70 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            aria-expanded={showMatcher}
                            data-testid="ats-jd-toggle">
                            <span>{t('AtsScoreMeter.jdPanelTitle', 'Target job description')}</span>
                            <span className="rounded bg-indigo-200/60 px-1.5 py-0.5 text-[10px] text-indigo-900">{matchLabel}</span>
                        </button>

                        {showMatcher && (
                            <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                                <label className="block text-[10px] font-semibold text-slate-600" htmlFor="ats-target-jd">
                                    {t('AtsScoreMeter.jdLabel', 'Paste the job you want. Matching stays on this device and is never sent to a server.')}
                                </label>
                                <textarea
                                    id="ats-target-jd"
                                    data-testid="ats-jd-input"
                                    value={jdDraft}
                                    onChange={(event) => setJdDraft(event.target.value)}
                                    placeholder={t('AtsScoreMeter.jdPlaceholder', 'Paste the job description to check role fit…')}
                                    className="h-16 w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        data-testid="ats-jd-apply"
                                        onClick={applyJobDescription}
                                        className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                        {t('AtsScoreMeter.applyJd', 'Update match')}
                                    </button>
                                    {jdText && (
                                        <button
                                            type="button"
                                            onClick={clearJobDescription}
                                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                            {t('AtsScoreMeter.clearJd', 'Clear')}
                                        </button>
                                    )}
                                </div>

                                {result.jdMatch.score != null && (
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex justify-between text-[11px] font-bold">
                                            <span className="text-emerald-700">
                                                {t('AtsScoreMeter.matched', 'Matched')} ({result.jdMatch.matched.length})
                                            </span>
                                            <span className="text-amber-700">
                                                {t('AtsScoreMeter.missing', 'Missing')} ({result.jdMatch.missing.length})
                                            </span>
                                        </div>
                                        {result.jdMatch.matched.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {result.jdMatch.matched.slice(0, 8).map((keyword) => (
                                                    <span key={keyword} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                                                        {keyword}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {Object.keys(result.jdMatch.groups || {}).slice(0, 3).map((group) => (
                                            <div key={group}>
                                                <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{group}</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {result.jdMatch.groups[group].slice(0, 4).map((keyword) => (
                                                        <span key={keyword} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                                                            {keyword}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <p className="flex items-start gap-1 text-[9px] leading-snug text-slate-400">
                        <MdWarning className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                        <span>
                            {t(
                                'AtsScoreMeter.disclaimer',
                                'Heuristic readiness estimate. It is not Workday, Greenhouse, Lever, or Taleo, and it does not predict interviews. Nothing is sent to a server to compute it.',
                            )}
                        </span>
                    </p>
                </div>
            )}
        </section>
    );
};

export default AtsScoreMeter;
