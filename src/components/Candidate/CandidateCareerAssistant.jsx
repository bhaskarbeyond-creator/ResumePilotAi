import React, { useEffect, useMemo, useState } from 'react';
import {
    FiArrowRight,
    FiBarChart2,
    FiBriefcase,
    FiCheckCircle,
    FiClipboard,
    FiFileText,
    FiLightbulb,
    FiMessageSquare,
    FiRefreshCw,
    FiSearch,
    FiTarget,
    FiTrendingUp,
    FiZap,
} from 'react-icons/fi';
import { getActiveJobs, getTrackedJobs } from '../../services/api/platform';
import { calculateAtsScore } from '../../utils/atsScore';

/**
 * CandidateCareerAssistant
 *
 * This is deliberately a presentation layer over the candidate's own resume,
 * application-tracker and published-job data. It does not manufacture a match
 * percentage, application count or recommendation when the platform has not
 * loaded the underlying record. The dashboard already owns resume CRUD; this
 * panel only routes the candidate to those existing workflows.
 */

const asArray = (value) => (Array.isArray(value) ? value : []);

const resumePayload = (record) => {
    if (!record || typeof record !== 'object') return {};
    if (record.item && typeof record.item === 'object') return record.item;
    if (record.data && typeof record.data === 'object') return record.data;
    return record;
};

const resumeTitle = (record) => {
    const data = resumePayload(record);
    const title = String(data.title || '').trim();
    if (title && title !== 'Untitled Resume') return title;
    const name = `${data.firstname || ''} ${data.lastname || ''}`.trim();
    return name || 'Untitled resume';
};

const normaliseStatus = (job) => String(
    job?.status
    || job?.applicationStatus
    || job?.application_status
    || job?.stage
    || 'tracked',
).trim().toLowerCase();

const formatJobMeta = (job) => {
    const company = String(job?.company || job?.companyName || job?.employer || '').trim();
    const location = String(job?.location || job?.city || job?.workplace || '').trim();
    return [company, location].filter(Boolean).join(' · ');
};

const routeForGuidance = (query) => {
    const text = String(query || '').toLowerCase();
    if (/skill|keyword|tool|technology/.test(text)) return 'skills';
    if (/summary|profile|about/.test(text)) return 'summary';
    if (/work|experience|bullet|achievement|metric/.test(text)) return 'work-history';
    if (/education|degree|school/.test(text)) return 'education';
    return 'heading';
};

const EmptyLine = ({ children }) => (
    <p className="rounded-xl border border-dashed border-cuba-line bg-cuba-canvas px-3 py-2.5 text-xs leading-relaxed text-cuba-ink-subtle">
        {children}
    </p>
);

const TabButton = ({ active, icon, children, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`relative inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 border-b-2 px-1.5 py-2 text-[11px] font-bold transition-colors ${
            active
                ? 'border-[var(--cuba-primary)] text-[var(--cuba-primary-strong)]'
                : 'border-transparent text-cuba-ink-subtle hover:border-cuba-line hover:text-cuba-ink'
        }`}
    >
        {React.createElement(icon, { className: 'h-3.5 w-3.5', 'aria-hidden': true })}
        <span className="truncate">{children}</span>
    </button>
);

const CandidateCareerAssistant = ({
    resumes = [],
    onOpenResume,
    onNavigate,
    className = '',
}) => {
    const [activeTab, setActiveTab] = useState('suggestions');
    const [careerData, setCareerData] = useState({ status: 'loading', tracked: [], jobs: [], error: '' });
    const [guidanceQuery, setGuidanceQuery] = useState('');

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setCareerData((current) => ({ ...current, status: 'loading', error: '' }));
            const [trackedResult, jobsResult] = await Promise.allSettled([
                getTrackedJobs(),
                getActiveJobs(1, 3),
            ]);
            if (!mounted) return;

            const tracked = trackedResult.status === 'fulfilled' ? asArray(trackedResult.value) : [];
            const jobs = jobsResult.status === 'fulfilled' ? asArray(jobsResult.value?.jobs) : [];
            const error = trackedResult.status === 'rejected' && jobsResult.status === 'rejected'
                ? 'Career activity could not be refreshed right now.'
                : '';
            setCareerData({ status: error ? 'error' : 'ready', tracked, jobs, error });
        };
        load();
        return () => { mounted = false; };
    }, []);

    const scoredResumes = useMemo(() => asArray(resumes)
        .map((record) => {
            const data = resumePayload(record);
            return {
                record,
                data,
                title: resumeTitle(record),
                score: calculateAtsScore(data, { jobDescription: data.targetJobDescription || '' }),
            };
        })
        .sort((left, right) => Number(right.score?.qualityScore || 0) - Number(left.score?.qualityScore || 0)), [resumes]);

    const focusResume = scoredResumes[0] || null;
    const applicationSummary = useMemo(() => {
        const tracked = careerData.tracked;
        const applied = tracked.filter((item) => /applied|submitted|interview|offer|rejected/.test(normaliseStatus(item))).length;
        const interviewing = tracked.filter((item) => /interview/.test(normaliseStatus(item))).length;
        const offers = tracked.filter((item) => /offer/.test(normaliseStatus(item))).length;
        return { tracked: tracked.length, applied, interviewing, offers };
    }, [careerData.tracked]);

    const suggestions = focusResume?.score?.improvements || [];
    const strengths = focusResume?.score?.strengths || [];
    const jdMatch = focusResume?.score?.jdMatch;

    const handleGuidanceSubmit = (event) => {
        event.preventDefault();
        const destination = routeForGuidance(guidanceQuery);
        onNavigate?.(`/build-resume/${destination}`);
    };

    return (
        <aside
            aria-label="AI Career Assistant"
            className={`candidate-career-assistant card bs-card-executive overflow-hidden rounded-2xl border border-[var(--cuba-primary-line)] bg-white shadow-cuba-md ${className}`}
        >
            <div className="border-b border-[var(--cuba-primary)]/15 bg-[linear-gradient(135deg,rgba(115,102,255,0.12),rgba(56,189,248,0.09))] px-4 pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--cuba-primary)] text-white shadow-[var(--cuba-primary-glow)]">
                            <FiZap className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-extrabold tracking-tight text-cuba-ink">AI Career Assistant</h2>
                            <p className="mt-0.5 text-[11px] font-medium text-cuba-ink-subtle">Grounded in your saved career data</p>
                        </div>
                    </div>
                    <span className="badge rounded-pill inline-flex shrink-0 items-center gap-1 border border-cuba-success bg-cuba-success-soft px-2.5 py-1 text-[10px] font-bold text-cuba-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-cuba-success" aria-hidden="true" />
                        Live
                    </span>
                </div>
            </div>

            <div role="tablist" aria-label="Career assistant views" className="flex border-b border-cuba-line px-2">
                <TabButton active={activeTab === 'suggestions'} icon={FiLightbulb} onClick={() => setActiveTab('suggestions')}>Suggestions</TabButton>
                <TabButton active={activeTab === 'insights'} icon={FiBarChart2} onClick={() => setActiveTab('insights')}>Resume Insights</TabButton>
                <TabButton active={activeTab === 'match'} icon={FiTarget} onClick={() => setActiveTab('match')}>Job Match</TabButton>
            </div>

            <div className="space-y-3 p-4">
                {activeTab === 'suggestions' && (
                    <div className="space-y-3" role="tabpanel" aria-label="Suggestions">
                        {focusResume ? (
                            <>
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-cuba-line bg-cuba-canvas/80 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-bold text-cuba-ink">{focusResume.title}</p>
                                        <p className="mt-0.5 text-[11px] text-cuba-ink-subtle">ATS readiness: {focusResume.score.qualityScore}/100</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenResume?.(focusResume.record)}
                                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[var(--cuba-primary-strong)] hover:text-[var(--cuba-primary-ink-strong)]"
                                    >
                                        Improve <FiArrowRight className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                </div>
                                {suggestions.length > 0 ? (
                                    <ul className="space-y-2" aria-label="Data-based resume improvements">
                                        {suggestions.slice(0, 3).map((suggestion, index) => (
                                            <li key={`${suggestion?.text || suggestion}-${index}`} className="flex gap-2.5 rounded-xl border border-cuba-line px-3 py-2.5">
                                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cuba-primary)]/10 text-[10px] font-black text-[var(--cuba-primary-strong)]">{index + 1}</span>
                                                <span className="text-xs leading-relaxed text-cuba-ink-subtle">{suggestion?.text || suggestion}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <EmptyLine>Your current resume has no open deterministic improvement prompts.</EmptyLine>
                                )}
                            </>
                        ) : (
                            <EmptyLine>Create a resume to receive evidence-based readiness suggestions.</EmptyLine>
                        )}
                    </div>
                )}

                {activeTab === 'insights' && (
                    <div className="space-y-3" role="tabpanel" aria-label="Resume insights">
                        {focusResume ? (
                            <>
                                <div className="rounded-xl bg-cuba-ink p-3.5 text-white">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cuba-ink-subtle">Screening readiness</p>
                                            <p className="mt-1 text-2xl font-black tracking-tight">{focusResume.score.qualityScore}<span className="text-sm text-cuba-ink-subtle">/100</span></p>
                                        </div>
                                        <FiTrendingUp className="h-5 w-5 text-cuba-success" aria-hidden="true" />
                                    </div>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                                        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--cuba-success),var(--cuba-info))]" style={{ width: `${Math.max(0, Math.min(100, Number(focusResume.score.qualityScore) || 0))}%` }} />
                                    </div>
                                </div>
                                {strengths.length > 0 ? (
                                    <div>
                                        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-cuba-ink-subtle">What is working</p>
                                        <ul className="space-y-2">
                                            {strengths.slice(0, 3).map((strength, index) => (
                                                <li key={`${strength}-${index}`} className="flex gap-2 text-xs leading-relaxed text-cuba-ink-subtle">
                                                    <FiCheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cuba-success" aria-hidden="true" />
                                                    <span>{strength}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : <EmptyLine>Add more verified career detail to unlock resume insights.</EmptyLine>}
                            </>
                        ) : <EmptyLine>No saved resume is available to inspect yet.</EmptyLine>}
                    </div>
                )}

                {activeTab === 'match' && (
                    <div className="space-y-3" role="tabpanel" aria-label="Job match">
                        {focusResume && focusResume.score.hasJobDescription ? (
                            <>
                                <div className="flex items-center justify-between rounded-xl border border-cuba-info bg-cuba-info-soft p-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cuba-info">Target-job coverage</p>
                                        <p className="mt-1 text-xl font-black text-cuba-info">{jdMatch?.score == null ? '—' : `${jdMatch.score}%`}</p>
                                    </div>
                                    <FiTarget className="h-6 w-6 text-cuba-info" aria-hidden="true" />
                                </div>
                                {jdMatch?.missing?.length > 0 ? (
                                    <div>
                                        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-cuba-ink-subtle">Terms to verify before adding</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {jdMatch.missing.slice(0, 6).map((term) => (
                                                <span key={term} className="rounded-full border border-cuba-warning bg-cuba-warning-soft px-2 py-1 text-[10px] font-bold text-cuba-warning">{term}</span>
                                            ))}
                                        </div>
                                    </div>
                                ) : <EmptyLine>No unmatched target-job terms are currently detected.</EmptyLine>}
                            </>
                        ) : (
                            <EmptyLine>Add a target job description in Personal information to calculate real job-description coverage.</EmptyLine>
                        )}
                    </div>
                )}

                <form onSubmit={handleGuidanceSubmit} className="flex items-center gap-2 rounded-xl border border-cuba-line bg-white p-1.5 shadow-sm">
                    <FiSearch className="ml-1 h-3.5 w-3.5 shrink-0 text-cuba-ink-subtle" aria-hidden="true" />
                    <input
                        value={guidanceQuery}
                        onChange={(event) => setGuidanceQuery(event.target.value)}
                        aria-label="Find the right resume section"
                        placeholder="Find the right resume section"
                        className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-xs text-cuba-ink outline-none placeholder:text-cuba-ink-subtle"
                    />
                    <button type="submit" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--cuba-primary)] text-white transition-colors hover:bg-[var(--cuba-primary-strong)]" aria-label="Open relevant resume section">
                        <FiArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </form>
            </div>

            <div className="border-t border-cuba-line bg-cuba-canvas/60 p-4">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold text-cuba-ink">Application Progress</h3>
                    <button type="button" onClick={() => onNavigate?.('/dashboard/job-tracker')} className="text-[11px] font-bold text-[var(--cuba-primary-strong)] hover:text-[var(--cuba-primary-ink-strong)]">View tracker</button>
                </div>
                {careerData.status === 'loading' ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-cuba-ink-subtle"><FiRefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading career activity</div>
                ) : careerData.error ? (
                    <EmptyLine>{careerData.error}</EmptyLine>
                ) : (
                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                        {[
                            ['Tracked', applicationSummary.tracked, 'bg-cuba-ink-subtle'],
                            ['Applied', applicationSummary.applied, 'bg-[var(--cuba-primary)]'],
                            ['Interview', applicationSummary.interviewing, 'bg-cuba-info'],
                            ['Offers', applicationSummary.offers, 'bg-cuba-success'],
                        ].map(([label, value, tone]) => (
                            <div key={label} className="rounded-lg border border-cuba-line bg-white px-1.5 py-2 text-center">
                                <span className={`mx-auto mb-1 block h-1 w-5 rounded-full ${tone}`} aria-hidden="true" />
                                <strong className="block text-sm font-black text-cuba-ink">{value}</strong>
                                <span className="block truncate text-[9px] font-semibold text-cuba-ink-subtle">{label}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-4 border-t border-cuba-line pt-3">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-extrabold text-cuba-ink">Open roles</h3>
                        <button type="button" onClick={() => onNavigate?.('/dashboard/jobs')} className="text-[11px] font-bold text-[var(--cuba-primary-strong)] hover:text-[var(--cuba-primary-ink-strong)]">Browse jobs</button>
                    </div>
                    {careerData.status === 'ready' && careerData.jobs.length > 0 ? (
                        <ul className="mt-2.5 space-y-2">
                            {careerData.jobs.slice(0, 3).map((job, index) => (
                                <li key={job?.id || job?._id || `${job?.title || 'role'}-${index}`}>
                                    <button type="button" onClick={() => onNavigate?.('/dashboard/jobs')} className="group flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-white">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--cuba-primary)]/10 text-[var(--cuba-primary-strong)]"><FiBriefcase className="h-3.5 w-3.5" aria-hidden="true" /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[11px] font-bold text-cuba-ink-muted group-hover:text-[var(--cuba-primary-strong)]">{job?.title || 'Untitled role'}</span>
                                            {formatJobMeta(job) && <span className="block truncate text-[10px] text-cuba-ink-subtle">{formatJobMeta(job)}</span>}
                                        </span>
                                        <FiArrowRight className="h-3 w-3 shrink-0 text-cuba-ink-subtle group-hover:text-[var(--cuba-primary-strong)]" aria-hidden="true" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : careerData.status === 'ready' ? <EmptyLine>No published roles are available right now.</EmptyLine> : null}
                </div>

                <div className="mt-4 rounded-xl border border-[var(--cuba-primary-line)] bg-[linear-gradient(135deg,rgba(115,102,255,0.12),rgba(99,102,241,0.05))] p-3">
                    <div className="flex gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--cuba-primary-strong)] shadow-sm"><FiClipboard className="h-3.5 w-3.5" aria-hidden="true" /></span>
                        <div className="min-w-0">
                            <p className="text-xs font-extrabold text-cuba-ink">Your next step</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-cuba-ink-subtle">
                                {focusResume ? 'Review the highest-impact resume prompt, then tailor it to a target job description.' : 'Create your first resume to start your career workspace.'}
                            </p>
                            <button type="button" onClick={() => focusResume ? onOpenResume?.(focusResume.record) : onNavigate?.('/build-resume/heading?new=1')} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--cuba-primary-strong)] hover:text-[var(--cuba-primary-ink-strong)]">
                                {focusResume ? 'Open resume' : 'Create resume'} <FiArrowRight className="h-3 w-3" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default CandidateCareerAssistant;
