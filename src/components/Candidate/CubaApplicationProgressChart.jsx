import React, { useEffect, useState } from 'react';
import { getTrackedJobs } from '../../services/api/platform';
import { PROGRESS_SERIES, bucketTrackedJobs } from './analyticsLogic';

/**
 * CubaApplicationProgressChart — DIR-094 S2 (candidate Overview, bottom-left column).
 *
 * HONEST DATA CONTRACT, stated up front because this surface is where a chart is
 * most tempting to fake:
 *   • Every bar is a count of REAL `job_tracker` rows returned by the authenticated
 *     GET /api/jobs-data/tracker endpoint. There is no sample series, no seed array
 *     and no randomiser anywhere in this file.
 *   • The reference screenshot's Jan-Jun shape is ILLUSTRATIVE of the layout and is
 *     NOT reproduced. If the candidate has no dated pipeline the chart renders an
 *     explicit empty state rather than a plausible-looking series.
 *   • A job is placed in a month ONLY by its own date (`dateApplied`, else
 *     `createdAt`). A job with neither is EXCLUDED and counted as `undated`, never
 *     folded into the current month.
 *   • The x-window is the last six real calendar months ending with the month that
 *     contains the local clock's `now`; rows outside that window are dropped, not
 *     clamped into the edge month.
 *
 * SCOPE LIMIT, stated plainly: `job_tracker` stores a job's CURRENT status only, so a
 * role applied for in March that is now Interviewing is counted once, as Interviewing
 * in March. This is a snapshot of the current pipeline by application month — it is
 * NOT a transition history, and the accessible summary says so in words.
 *
 * There is no charting dependency: the bars are hand-built SVG (same approach as the
 * DIR-091 ATS donut), so nothing new is added to the bundle.
 */

const VIEW = Object.freeze({ w: 560, h: 190, padTop: 12, padRight: 6, padBottom: 28, padLeft: 30 });

/**
 * Hand-built grouped bar chart. The y-scale is derived from the REAL maximum, so the
 * bars cannot imply a shape the data does not have. `role="presentation"` is correct
 * here because the parent <figure> carries the accessible summary in text.
 */
const ApplicationBarChart = ({ months, max }) => {
    const innerW = VIEW.w - VIEW.padLeft - VIEW.padRight;
    const innerH = VIEW.h - VIEW.padTop - VIEW.padBottom;
    const groupW = innerW / months.length;
    const barW = Math.max(5, Math.min(16, (groupW - 12) / PROGRESS_SERIES.length));
    const groupPad = (groupW - barW * PROGRESS_SERIES.length) / 2;
    const baseline = VIEW.padTop + innerH;
    const yFor = (value) => (max > 0 ? baseline - (value / max) * innerH : baseline);
    const ticks = [...new Set([0, Math.ceil(max / 2), max])].sort((a, b) => a - b);

    return (
        <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="h-[190px] w-full" role="presentation" focusable="false">
            {ticks.map((tick) => (
                <g key={`tick-${tick}`}>
                    <line
                        x1={VIEW.padLeft}
                        y1={yFor(tick)}
                        x2={VIEW.w - VIEW.padRight}
                        y2={yFor(tick)}
                        stroke="var(--cuba-line)"
                        strokeWidth="1"
                        strokeDasharray={tick === 0 ? undefined : '3 3'}
                    />
                    <text x={VIEW.padLeft - 6} y={yFor(tick) + 3.5} textAnchor="end" fontSize="9" fill="var(--cuba-ink-subtle)">
                        {tick}
                    </text>
                </g>
            ))}
            {months.map((month, monthIndex) => {
                const groupX = VIEW.padLeft + monthIndex * groupW + groupPad;
                return (
                    <g key={month.key}>
                        {PROGRESS_SERIES.map((series, seriesIndex) => {
                            const value = month.counts[series.id];
                            if (value <= 0) return null; // a zero month draws no bar
                            const barH = max > 0 ? Math.max(2, (value / max) * innerH) : 0;
                            return (
                                <rect
                                    key={series.id}
                                    x={groupX + seriesIndex * barW}
                                    y={baseline - barH}
                                    width={Math.max(3, barW - 2)}
                                    height={barH}
                                    rx="1.5"
                                    fill={series.color}
                                />
                            );
                        })}
                        <text
                            x={VIEW.padLeft + monthIndex * groupW + groupW / 2}
                            y={VIEW.h - 10}
                            textAnchor="middle"
                            fontSize="10"
                            fill="var(--cuba-ink-muted)"
                        >
                            {month.label}
                        </text>
                    </g>
                );
            })}
            <line x1={VIEW.padLeft} y1={baseline} x2={VIEW.w - VIEW.padRight} y2={baseline} stroke="var(--cuba-line-strong)" strokeWidth="1" />
        </svg>
    );
};

const Legend = () => (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {PROGRESS_SERIES.map((series) => (
            <li key={series.id} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-cuba-ink-muted">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: series.color }} aria-hidden="true" />
                {series.label}
            </li>
        ))}
    </ul>
);

const CubaApplicationProgressChart = () => {
    // null = not yet measured. It is never coerced to [] on failure, so an
    // unreadable pipeline renders "Unavailable" instead of a confident zero.
    const [jobs, setJobs] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        getTrackedJobs()
            .then((rows) => {
                if (!active) return;
                setJobs(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!active) return;
                setJobs(null);
                setFailed(true);
            });
        return () => { active = false; };
    }, []);

    const loading = jobs === null && !failed;
    const { months, undated, total } = bucketTrackedJobs(jobs, new Date());
    const max = months.reduce(
        (peak, month) => Math.max(peak, month.counts.applied, month.counts.interview, month.counts.offer),
        0,
    );
    const hasData = total > 0;

    const summary = hasData
        ? `Application progress over the last six months by current pipeline stage: ${months
            .map((month) => `${month.label} ${month.counts.applied} applied, ${month.counts.interview} interviewing, ${month.counts.offer} offers`)
            .join('; ')}.`
        : 'No applications with a recorded date fall inside the last six months.';

    return (
        <section
            data-testid="cuba-application-progress"
            aria-labelledby="cuba-application-progress-title"
            className="flex min-w-0 flex-col rounded-cuba-lg border border-cuba-line bg-cuba-card p-3.5 shadow-xs"
        >
            <header className="mb-2 flex items-center justify-between">
                <div className="min-w-0">
                    <h2 id="cuba-application-progress-title" className="text-sm font-bold text-cuba-ink flex items-center gap-1.5">
                        <span className="text-[#7366ff]">📊</span> Application Progress
                    </h2>
                    <p className="text-[11px] text-cuba-ink-subtle">Last 6 months · current pipeline stage</p>
                </div>
                <a href="/dashboard/applied-jobs" className="text-[11px] font-bold text-[#7366ff] hover:underline">
                    View Details
                </a>
            </header>

            <p className="sr-only" data-testid="cuba-application-progress-summary">{summary}</p>

            {loading && (
                <p className="py-10 text-center text-xs text-cuba-ink-subtle" data-testid="cuba-application-progress-loading">
                    Loading your pipeline…
                </p>
            )}

            {!loading && failed && (
                <p className="py-10 text-center text-xs text-cuba-ink-subtle" data-testid="cuba-application-progress-unavailable">
                    Pipeline unavailable right now.
                </p>
            )}

            {!loading && !failed && !hasData && (
                <div className="py-8 text-center" data-testid="cuba-application-progress-empty">
                    <p className="text-xs font-semibold text-cuba-ink">No applications yet</p>
                    <p className="mx-auto mt-1 max-w-[34ch] text-[11px] text-cuba-ink-subtle">
                        Track a job on your board and its real stage will appear here by month.
                    </p>
                </div>
            )}

            {!loading && !failed && hasData && (
                <figure className="m-0">
                    <ApplicationBarChart months={months} max={max} />
                    <div className="mt-2.5 pt-2 border-t border-cuba-line/50 flex items-center justify-center">
                        <Legend />
                    </div>
                    <figcaption className="sr-only mt-1 text-[11px] text-cuba-ink-subtle">
                        {`${total} tracked ${total === 1 ? 'role' : 'roles'} in this window`}
                        {undated > 0 ? ` · ${undated} with no recorded date excluded` : ''}
                        {' · snapshot of current stage, not a transition history'}
                    </figcaption>
                </figure>
            )}
        </section>
    );
};

export default CubaApplicationProgressChart;


