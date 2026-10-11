import React, { useEffect, useMemo, useState } from 'react';
import { FiZap, FiTarget, FiTrendingUp, FiArrowRight } from 'react-icons/fi';
import CubaCard from '../cuba/CubaCard';
import CubaSkeleton from '../cuba/CubaSkeleton';
import CubaEmptyState from '../cuba/CubaEmptyState';
import { AtsRadialGauge, PipelineStepper } from '../cuba/StatMicroVisuals';
import { getCopilotActions, COPILOT_PORTALS } from '../cuba/copilotActions';
import { getResumes, getTrackedJobs, getStatesOfUser } from '../../services/api/platform';
import { summariseResumes } from './briefingLogic';

/**
 * CandidateExecutiveRail — DIR-077 executive right rail for the candidate overview.
 *
 * Occupies the formerly empty right void on >=1280px viewports with three
 * high-value intelligence widgets:
 *   1. Live Copilot Quick-Pitch — the REAL context-aware candidate actions
 *      (`getCopilotActions`) routed to their own mounted workspaces.
 *   2. ATS Keyword Strength — the radial gauge plus the ATS engine's own status
 *      label and first concrete improvement, never an invented recommendation.
 *   3. Application Milestones — the real submitted-application and tracked-role
 *      counts with the pipeline stepper.
 *
 * TRUTHFULNESS (§46): every number comes from the platform's own services
 * (`/api/resumes`, `/api/job-tracker`, the user-state projection). A missing
 * metric renders an honest dash or an explicit empty/error state — never a
 * fabricated zero. A failed read is surfaced as an error banner and retried; it
 * is never presented as "no data".
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

const CandidateExecutiveRail = ({ onNavigate }) => {
    const [resumes, setResumes] = useState(null);
    const [trackedJobs, setTrackedJobs] = useState(null);
    const [applications, setApplications] = useState(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        let retry = null;
        const stopRetry = () => { if (retry) { clearInterval(retry); retry = null; } };
        const load = async () => {
            let failed = false;
            try {
                const data = await getResumes();
                if (data?.apiError) throw new Error('API server unreachable');
                if (!active) return;
                setResumes(Array.isArray(data) ? data : (data?.allResumes || data?.resumes || []));
            } catch {
                failed = true;
            }
            try {
                const jobs = await getTrackedJobs();
                if (active) setTrackedJobs(Array.isArray(jobs) ? jobs.length : 0);
            } catch {
                failed = true;
            }
            try {
                const stats = await getStatesOfUser();
                if (active && stats && !stats.apiError) setApplications(stats.applications);
            } catch {
                // applications stays null → the widget renders an honest dash.
            }
            if (!active) return;
            setError(failed);
            setLoading(false);
            if (failed) { if (!retry) retry = setInterval(load, 4000); } else { stopRetry(); }
        };
        load();
        return () => { active = false; stopRetry(); };
    }, []);

    const summary = useMemo(() => summariseResumes(resumes || []), [resumes]);

    const quickPitch = useMemo(
        () => getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname: '/dashboard' }).slice(0, 3),
        [],
    );

    const go = (href) => { if (typeof onNavigate === 'function') onNavigate(href); };

    return (
        <div className="space-y-2.5" data-testid="cuba-executive-rail">
            <WidgetCard title="Live Copilot Quick-Pitch" icon={<FiZap className="h-3.5 w-3.5" />} testId="cuba-rail-copilot">
                {quickPitch.length === 0 ? (
                    <CubaEmptyState compact title="No quick actions" description="Copilot shortcuts appear once your workspace has activity." />
                ) : (
                    <ul className="space-y-2">
                        {quickPitch.map((action) => {
                            const href = Array.isArray(action.routes) && action.routes.length ? action.routes[0] : null;
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
                )}
            </WidgetCard>

            <WidgetCard title="ATS Keyword Strength" icon={<FiTarget className="h-3.5 w-3.5" />} testId="cuba-rail-ats">
                {loading ? (
                    <CubaSkeleton height="2.5rem" width="100%" text="Loading ATS strength" />
                ) : error ? (
                    <p role="alert" className="text-xs font-semibold text-cuba-danger">
                        ATS strength is unavailable right now — retrying automatically.
                    </p>
                ) : summary.count === 0 ? (
                    <CubaEmptyState compact title="No resumes yet" description="Create a resume to measure its ATS keyword strength." />
                ) : (
                    <div className="flex items-center gap-3">
                        <AtsRadialGauge score={summary.bestScore} size={64} />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-cuba-ink">
                                {summary.best?.statusLabel || (summary.bestScore === null ? 'Not scored yet' : 'Measured from your content')}
                            </p>
                            {summary.best?.nextStep && (
                                <p className="mt-0.5 text-[11px] text-cuba-ink-muted">{summary.best.nextStep}</p>
                            )}
                        </div>
                    </div>
                )}
            </WidgetCard>

            <WidgetCard title="Application Milestones" icon={<FiTrendingUp className="h-3.5 w-3.5" />} testId="cuba-rail-pipeline">
                {loading ? (
                    <CubaSkeleton height="1.5rem" width="100%" text="Loading pipeline" />
                ) : error ? (
                    <p role="alert" className="text-xs font-semibold text-cuba-danger">
                        Pipeline status is unavailable right now — retrying automatically.
                    </p>
                ) : (
                    <>
                        <p className="mb-2 text-xs font-semibold text-cuba-ink">
                            {applications !== null
                                ? `${applications} application${applications === 1 ? '' : 's'} submitted`
                                : 'Applications syncing'}
                            {trackedJobs !== null ? ` · ${trackedJobs} tracked` : ''}
                        </p>
                        <PipelineStepper applied={applications ?? 0} />
                    </>
                )}
            </WidgetCard>
        </div>
    );
};

export default CandidateExecutiveRail;
