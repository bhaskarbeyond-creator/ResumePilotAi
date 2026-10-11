import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiZap, FiSend, FiCheckCircle, FiAlertTriangle, FiChevronRight, FiBriefcase } from 'react-icons/fi';
import CubaCard from '../cuba/CubaCard';
import CubaEmptyState from '../cuba/CubaEmptyState';
import { getCopilotActions, COPILOT_PORTALS, resolveActionHref } from '../cuba/copilotActions';
import { getResumes } from '../../services/api/platform';
import { summariseResumes } from './briefingLogic';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const WidgetCard = ({ title, icon, testId, headerAction, children }) => (
    <CubaCard className="p-4" data-testid={testId}>
        <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary-ink-strong"
                    aria-hidden="true"
                >
                    {icon}
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-cuba-ink-subtle">{title}</h2>
            </div>
            {headerAction}
        </div>
        {children}
    </CubaCard>
);

const TABS = [
    { id: 'suggestions', label: 'Suggestions' },
    { id: 'insights', label: 'Resume Insights' },
    { id: 'match', label: 'Job Match' },
];

const PROMPT_CHIPS = ['Improve my resume', 'Find jobs for me', 'Interview tips'];

/**
 * DIR-090 P0-1: the icon tile is the ONLY literal in the Today's Insights list. The copy
 * itself always comes from the measured `insights` memo below, so the row can never state a
 * number this component did not read. Tones map onto the existing Cuba soft-tint surfaces.
 */
const INSIGHT_TONES = {
    success: { icon: <FiCheckCircle className="h-4 w-4" />, tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
    warning: { icon: <FiAlertTriangle className="h-4 w-4" />, tile: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
    info: { icon: <FiBriefcase className="h-4 w-4" />, tile: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
};

const CandidateExecutiveRail = ({ onNavigate, onAsk }) => {
    const [tab, setTab] = useState('suggestions');
    const [prompt, setPrompt] = useState('');
    const [askState, setAskState] = useState({ status: 'idle', message: '' });
    const mounted = useRef(true);

    // The REAL platform actions for this portal + route. Never an invented shortcut.
    const quickActions = useMemo(
        () => getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname: '/dashboard' }).slice(0, 4),
        [],
    );

    // ONE real read, reused by the Resume Insights tab and the Today's Insights block.
    const [resumeState, setResumeState] = useState({ resumes: null, error: null });
    useEffect(() => {
        mounted.current = true;
        (async () => {
            try {
                const data = await getResumes();
                if (!mounted.current) return;
                const list = Array.isArray(data) ? data : (data?.allResumes || data?.resumes || []);
                setResumeState({ resumes: list, error: null });
            } catch (error) {
                if (!mounted.current) return;
                // A failed read is reported as a failure, never as "no resumes".
                setResumeState({ resumes: null, error: error?.message || 'Unable to read resumes.' });
            }
        })();
        return () => { mounted.current = false; };
    }, []);

    const summary = useMemo(() => summariseResumes(resumeState.resumes || []), [resumeState.resumes]);

    const go = useCallback((href) => { if (typeof onNavigate === 'function') onNavigate(href); }, [onNavigate]);

    const submitPrompt = useCallback(async (text) => {
        const value = String(text ?? prompt).trim();
        if (!value) return;
        setAskState({ status: 'running', message: 'Asking the Copilot...' });
        try {
            if (typeof onAsk === 'function') {
                await onAsk({ operation: 'generate-summary', prompt: value });
                if (mounted.current) setAskState({ status: 'done', message: 'Copilot finished - see the command palette.' });
            } else if (mounted.current) {
                setAskState({ status: 'unavailable', message: 'The Copilot is unavailable right now.' });
            }
        } catch (error) {
            if (mounted.current) {
                setAskState({ status: 'error', message: error?.message || 'The Copilot could not answer.' });
            }
        }
    }, [onAsk, prompt]);

    /**
     * Today's Insights — built ONLY from values this component actually measured. A row whose
     * value is unknown is OMITTED rather than filled with a plausible-looking claim.
     */
    const insights = useMemo(() => {
        const rows = [];
        if (resumeState.error) {
            rows.push({ id: 'unavailable', tone: 'warning', text: 'Your resume data could not be read just now.' });
            return rows;
        }
        if (resumeState.resumes === null) return rows;
        if (summary.count === 0) {
            rows.push({ id: 'start', tone: 'info', text: 'Create your first resume to unlock ATS scoring and job matching.' });
            return rows;
        }
        if (summary.bestScore !== null) {
            rows.push({
                id: 'ats',
                tone: summary.bestScore >= 80 ? 'success' : 'warning',
                text: summary.bestScore >= 80
                    ? `Your resume is ${summary.bestScore}% ATS ready.`
                    : `Your resume is ${summary.bestScore}% ATS ready. Add quantified achievements to reach 80%.`,
            });
        }
        rows.push({
            id: 'library',
            tone: 'success',
            text: `${summary.count} resume${summary.count === 1 ? '' : 's'} in your workspace.`,
        });
        return rows;
    }, [resumeState.resumes, resumeState.error, summary.count, summary.bestScore]);


    return (
        <div className="space-y-2.5" data-testid="cuba-executive-rail">
            <WidgetCard title="AI Career Assistant" icon={<FiZap className="h-3.5 w-3.5" />} testId="cuba-rail-copilot">
                <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-cuba-ink">Your Career Co-pilot</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cuba-success-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-cuba-success">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cuba-success" />
                        Live
                    </span>
                </div>
                <p className="mb-3 text-xs text-cuba-ink-muted">
                    Get personalised insights, improve your resume, and prepare for interviews.
                </p>

                <div role="tablist" aria-label="Career assistant views" className="mb-3 flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {TABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.id}
                            data-testid={`cuba-rail-tab-${item.id}`}
                            onClick={() => setTab(item.id)}
                            className={cx(
                                'cuba-focusable shrink-0 rounded-cuba-sm px-2.5 py-1 text-[11px] font-semibold transition-colors',
                                tab === item.id ? 'cuba-fill-pill' : 'border border-cuba-line bg-cuba-card text-cuba-ink-muted hover:bg-cuba-primary-soft',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {tab === 'suggestions' && (quickActions.length === 0 ? (
                    <CubaEmptyState compact title="No suggestions yet" description="Copilot suggestions appear once your workspace has activity." />
                ) : (
                    <ul className="space-y-2.5">
                        {quickActions.map((action) => {
                            const href = resolveActionHref(action);
                            const meta = action.id === 'candidate-ats-audit'
                                ? { subtitle: 'Get AI-powered suggestions', bg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', icon: '⚙️' }
                                : action.id === 'candidate-tailor-resume'
                                ? { subtitle: 'Optimise for a specific role', bg: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', icon: '📄' }
                                : action.id === 'candidate-cover-letter'
                                ? { subtitle: 'Create a professional cover letter', bg: 'bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400', icon: '✎' }
                                : { subtitle: 'Start a mock interview session', bg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400', icon: '🎙️' };
                            return (
                                <li key={action.id}>
                                    <button
                                        type="button"
                                        disabled={!href}
                                        onClick={() => href && go(href)}
                                        className={cx(
                                            'cuba-focusable flex w-full items-center gap-3 rounded-xl border border-cuba-line p-2.5 text-left transition-all',
                                            href ? 'hover:bg-cuba-primary-soft hover:border-[#7366ff]/40 shadow-xs' : 'opacity-50',
                                        )}
                                    >
                                        <span className={cx('flex h-8 w-8 flex-none items-center justify-center rounded-lg text-sm font-semibold', meta.bg)} aria-hidden="true">
                                            {meta.icon}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-bold text-cuba-ink">
                                                {action.id === 'candidate-tailor-resume'
                                                    ? 'Tailor to a job description'
                                                    : action.id === 'candidate-mock-interview'
                                                    ? 'Prepare for interview'
                                                    : action.label}
                                            </p>
                                            <p className="truncate text-[11px] text-cuba-ink-muted">{meta.subtitle}</p>
                                        </div>
                                        <FiChevronRight className="h-4 w-4 flex-none text-cuba-ink-subtle" aria-hidden="true" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ))}

                {tab === 'insights' && (
                    <dl className="space-y-2 text-xs" data-testid="cuba-rail-insights-panel">
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-cuba-ink-muted">Saved resumes</dt>
                            <dd className="font-bold text-cuba-ink">{resumeState.resumes === null ? '--' : String(summary.count)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-cuba-ink-muted">Best ATS score</dt>
                            <dd className="font-bold text-cuba-ink">{summary.bestScore === null ? 'Not scored' : `${summary.bestScore}%`}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-cuba-ink-muted">Recruiter target</dt>
                            <dd className="font-bold text-cuba-ink">80%+</dd>
                        </div>
                    </dl>
                )}

                {tab === 'match' && (
                    <div data-testid="cuba-rail-match-panel">
                        <CubaEmptyState compact title="No ranked matches yet" description="Browse the job portal to build your match history." />
                        <button
                            type="button"
                            onClick={() => go('/dashboard/jobs')}
                            className="cuba-focusable mt-2 w-full rounded-cuba-md border border-cuba-line bg-cuba-card px-3 py-2 text-xs font-bold text-cuba-ink hover:bg-cuba-primary-soft"
                        >
                            Open the job portal
                        </button>
                    </div>
                )}
                <form className="mt-3" onSubmit={(event) => { event.preventDefault(); submitPrompt(); }}>
                    <label className="sr-only" htmlFor="cuba-rail-prompt">Ask the AI Career Assistant</label>
                    <div className="flex items-center gap-2">
                        <input
                            id="cuba-rail-prompt"
                            type="text"
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="Ask me anything about your career..."
                            className="cuba-focusable min-w-0 flex-1 rounded-cuba-sm border border-cuba-line bg-cuba-card px-3 py-2 text-xs text-cuba-ink placeholder:text-cuba-ink-subtle"
                        />
                        <button
                            type="submit"
                            disabled={askState.status === 'running' || !prompt.trim()}
                            aria-label="Send to the AI Career Assistant"
                            data-testid="cuba-rail-prompt-send"
                            className="cuba-focusable inline-flex h-9 w-9 flex-none items-center justify-center rounded-cuba-sm cuba-btn-primary disabled:opacity-50"
                        >
                            <FiSend className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {PROMPT_CHIPS.map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => { setPrompt(chip); submitPrompt(chip); }}
                                className="cuba-focusable rounded-full border border-cuba-line bg-cuba-card px-2.5 py-1 text-[11px] font-semibold text-cuba-ink-muted hover:bg-cuba-primary-soft"
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                    {askState.message && (
                        <p role="status" aria-live="polite" className="mt-2 text-[11px] font-semibold text-cuba-ink-muted">
                            {askState.message}
                        </p>
                    )}
                </form>
            </WidgetCard>

            <WidgetCard title="Today's Insights" icon={<FiCheckCircle className="h-3.5 w-3.5" />} testId="cuba-rail-insights"
                headerAction={
                    <button type="button" onClick={() => go('/dashboard')} className="text-[11px] font-bold text-[#7366ff] hover:underline">
                        View All
                    </button>
                }
            >
                {insights.length === 0 ? (
                    <CubaEmptyState
                        compact
                        title={resumeState.resumes === null ? 'Reading your workspace' : 'No insights yet'}
                        description={resumeState.resumes === null
                            ? 'Insights appear as soon as your resume read resolves.'
                            : 'Add a resume to unlock ATS scoring and job matching.'}
                    />
                ) : (
                    <ul className="space-y-3" data-testid="cuba-rail-insights-list">
                        {insights.map((insight) => {
                            const meta = INSIGHT_TONES[insight.tone] || INSIGHT_TONES.info;
                            // The measured sentence is split into a bold lead and a muted detail
                            // line. Both halves are the SAME measured string — nothing is appended.
                            const [headline, ...rest] = String(insight.text).split('. ');
                            return (
                                <li key={insight.id} className="flex items-start gap-3">
                                    <span className={cx('flex h-8 w-8 flex-none items-center justify-center rounded-lg', meta.tile)} aria-hidden="true">
                                        {meta.icon}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-cuba-ink">{headline}</p>
                                        {rest.length > 0 && (
                                            <p className="text-[11px] text-cuba-ink-muted">{rest.join('. ')}</p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </WidgetCard>
        </div>
    );
};

export default CandidateExecutiveRail;
