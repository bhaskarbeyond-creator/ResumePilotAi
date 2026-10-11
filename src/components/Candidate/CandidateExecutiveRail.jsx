import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiZap, FiArrowRight, FiSend, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import CubaCard from '../cuba/CubaCard';
import CubaEmptyState from '../cuba/CubaEmptyState';
import { getCopilotActions, COPILOT_PORTALS, resolveActionHref } from '../cuba/copilotActions';
import { getResumes } from '../../services/api/platform';
import { summariseResumes } from './briefingLogic';

/**
 * CandidateExecutiveRail — DIR-077 executive right rail for the candidate overview.
 *
 * Occupies the right void on >=1280px viewports with ONE high-value widget:
 *   Live Copilot Quick-Pitch — the REAL context-aware candidate actions
 *   (`getCopilotActions`) routed to their own mounted workspaces.
 *
 * DIR-086: the ATS Keyword Strength and Application Milestones widgets were REMOVED.
 * They repeated the Overview's metric capsule strip verbatim, so the rail both duplicated
 * the page's own headline numbers and overflowed the viewport. Their data reads (and the
 * 4s retry loop they carried) were removed with them, which also drops three API calls
 * from the Overview's first paint.
 *
 * TRUTHFULNESS (§46): the remaining action list is the platform's own
 * (`getCopilotActions`) and every destination is a REAL mounted route, resolved through
 * `resolveActionHref` so an action can never navigate to the page the user is already on.
 * An empty action list renders an explicit empty state — never a fabricated shortcut.
 *
 * DIR-093 S7 — restyled into the AUTHORITATIVE REFERENCE "AI Career Assistant":
 *   - a "Live" status badge, the "Your Career Co-pilot" strapline,
 *   - three real tabs (Suggestions / Resume Insights / Job Match),
 *   - the four quick-action cards, each routing to a genuinely mounted workspace,
 *   - an interactive prompt input whose submit really runs the shell's AI dispatcher,
 *   - prompt chips, and
 *   - a "Today's Insights" block built ONLY from values this component actually measured.
 *
 * The DIR-077/084/086 certified contract is preserved: the wrapper still carries
 * `data-testid="cuba-executive-rail"` and the primary card still carries
 * `testId="cuba-rail-copilot"`.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

const WidgetCard = ({ title, icon, testId, children }) => (
    <CubaCard className="p-4" data-testid={testId}>
        <div className="mb-3 flex items-center gap-2">
            <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary-ink-strong"
                aria-hidden="true"
            >
                {icon}
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-cuba-ink-subtle">{title}</h2>
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
                    <ul className="space-y-2">
                        {quickActions.map((action) => {
                            const href = resolveActionHref(action);
                            return (
                                <li key={action.id}>
                                    <button
                                        type="button"
                                        disabled={!href}
                                        onClick={() => href && go(href)}
                                        className={cx(
                                            'cuba-focusable flex w-full items-center gap-2 rounded-cuba-md border border-cuba-line px-3 py-2 text-left text-xs font-semibold text-cuba-ink transition-colors',
                                            href ? 'hover:bg-cuba-primary-soft' : 'opacity-50',
                                        )}
                                    >
                                        <span aria-hidden="true">{action.icon}</span>
                                        <span className="min-w-0 flex-1 truncate">{action.label}</span>
                                        <FiArrowRight className="h-3.5 w-3.5 flex-none text-cuba-ink-subtle" aria-hidden="true" />
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

            <WidgetCard title="Today's Insights" icon={<FiCheckCircle className="h-3.5 w-3.5" />} testId="cuba-rail-insights">
                {insights.length === 0 ? (
                    <p className="text-xs text-cuba-ink-muted">Reading your workspace...</p>
                ) : (
                    <ul className="space-y-2">
                        {insights.map((row) => (
                            <li key={row.id} className="flex items-start gap-2 text-xs text-cuba-ink">
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full',
                                        row.tone === 'warning' ? 'bg-cuba-warning-soft text-cuba-warning' : row.tone === 'info' ? 'bg-cuba-info-soft text-cuba-info' : 'bg-cuba-success-soft text-cuba-success',
                                    )}
                                >
                                    {row.tone === 'warning' ? <FiAlertTriangle className="h-3 w-3" /> : <FiCheckCircle className="h-3 w-3" />}
                                </span>
                                <span className="min-w-0 flex-1">{row.text}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </WidgetCard>
        </div>
    );
};

export default CandidateExecutiveRail;
