import React, { useEffect, useState, useMemo } from 'react';
import { FiBriefcase, FiAward, FiFileText, FiZap, FiRefreshCw } from 'react-icons/fi';
// DIR-085: the compact Copilot HUD replaced the tall gradient banner and the four
// full-height stat cards.
// DIR-091: the authoritative reference brings back a high-density metric card row, now
// carrying a real ATS donut, in place of the DIR-085 capsule strip.
import CopilotHeroHud from './CopilotHeroHud';
import CubaMetricCardRow from './CubaMetricCardRow';
import { getResumes, getTrackedJobs, getStatesOfUser } from '../../services/api/platform';
import { summariseResumes } from './briefingLogic';

const CubaCandidateHero = ({ displayName = 'Candidate', onNavigate }) => {
    const [resumes, setResumes] = useState(null);
    const [trackedJobs, setTrackedJobs] = useState(null);
    // DIR-058: the real application count (was previously mislabelled — the
    // "Job Applications" card used to show the Kanban TRACKED-jobs count).
    const [applications, setApplications] = useState(null);
    const [apiError, setApiError] = useState(false);
    const [loading, setLoading] = useState(true);

    // DIR-053 RCA-3 / S4: never mask an API outage as an empty account. A failed
    // load sets `apiError` (rendered as a Cuba reconnect badge) and the loader
    // auto-retries every 4s until the API server is back — no page refresh needed.
    useEffect(() => {
        let active = true;
        let retryTimer = null;
        const stopRetry = () => { if (retryTimer) { clearInterval(retryTimer); retryTimer = null; } };
        const load = async () => {
            let resumesFailed = false;
            let jobsFailed = false;
            try {
                const resumeData = await getResumes();
                if (resumeData?.apiError) throw new Error('API server unreachable');
                if (!active) return;
                const list = Array.isArray(resumeData)
                    ? resumeData
                    : (resumeData?.allResumes || resumeData?.resumes || []);
                setResumes(list);
            } catch {
                resumesFailed = true;
            }
            try {
                const jobs = await getTrackedJobs();
                if (active) setTrackedJobs(Array.isArray(jobs) ? jobs.length : 0);
            } catch {
                // trackedJobs stays null → the KPI renders an honest dash, never a fake 0.
                jobsFailed = true;
            }
            try {
                // DIR-058: the REAL submitted-application count for the KPI card.
                const stats = await getStatesOfUser();
                if (active && stats && !stats.apiError) setApplications(stats.applications);
            } catch {
                // applications stays null → the KPI renders an honest dash.
            }
            if (!active) return;
            setApiError(resumesFailed);
            setLoading(false);
            if (resumesFailed || jobsFailed) {
                if (!retryTimer) retryTimer = setInterval(load, 4000);
            } else {
                stopRetry();
            }
        };
        load();
        return () => { active = false; stopRetry(); };
    }, []);

    const summary = useMemo(() => summariseResumes(resumes || []), [resumes]);

    const count = summary.count;
    const bestScore = summary.bestScore;

    // DIR-085: a real, derived insight line. Every branch is computed from values that
    // already exist (the measured resume count and the real ATS score); when neither is
    // known the line is omitted rather than invented.
    const insight = loading
        ? ''
        : count === 0
            ? 'Create your first resume to unlock ATS scoring and template matching.'
            : bestScore !== null && bestScore >= 75
                ? `Your top resume scores ${bestScore}% ATS - recruiter ready.`
                : bestScore !== null
                    ? `Lift your top resume from ${bestScore}% toward the 80% recruiter benchmark.`
                    : 'Your resumes are ready - run an ATS check to see how recruiters score them.';

    // DIR-091: the capsule array was retired with the strip. The metric card row consumes the
    // same real values (count / bestScore / applications) directly.

    return (
        <div className="space-y-2.5">
            {/* DIR-085: the page keeps ONE top-level heading even though the tall banner is
                gone, so the Overview still exposes an h1 to assistive technology. */}
            <h1 className="sr-only">{displayName} candidate overview</h1>

            <div data-testid="cuba-candidate-hero">
                <CopilotHeroHud insight={insight} onNavigate={onNavigate} />
            </div>

            {/* DIR-053 S4: honest connectivity banner. It only appears when the API
                server is unreachable - a genuinely empty account shows 0s, never this
                badge - and it self-heals with a 4s retry loop. */}
            {apiError && (
                <div
                    data-testid="cuba-api-reconnect"
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-3 rounded-[14px] border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-sm font-semibold text-amber-900 shadow-[0_6px_18px_-8px_rgba(217,119,6,0.45)] dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100"
                >
                    <FiRefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    <span>
                        Connecting to API Server...
                        <span className="ml-2 font-normal text-amber-800/90 dark:text-amber-100">
                            Your data is safe - retrying automatically every 4 seconds.
                        </span>
                    </span>
                </div>
            )}

            {/* DIR-091: the authoritative reference replaces the capsule strip with four
                high-density metric cards carrying a real ATS donut. The values come from the
                SAME real sources the capsules used - nothing is hardcoded. */}
            <CubaMetricCardRow
                loading={loading}
                count={count}
                bestScore={bestScore}
                applications={applications}
            />
        </div>
    );
};

export default CubaCandidateHero;

