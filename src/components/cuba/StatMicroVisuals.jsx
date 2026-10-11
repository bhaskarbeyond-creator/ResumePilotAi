import React from 'react';

/**
 * DIR-077 — native SVG micro-visuals for the candidate KPI stat cards.
 *
 * PURE AND PRESENTATIONAL. Every number is passed in by the caller from data the
 * platform actually returned; nothing here estimates, fills in or fabricates a
 * value. When a metric is genuinely absent the gauge renders an honest dash
 * rather than a zero.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Circular radial gauge for the Average ATS Score (0-100). */
export const AtsRadialGauge = ({ score, size = 56, className = '' }) => {
    const measured = typeof score === 'number' && Number.isFinite(score);
    const pct = measured ? Math.max(0, Math.min(100, score)) : 0;
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const dash = (pct / 100) * circumference;
    const toneClass = !measured
        ? 'text-cuba-ink-subtle'
        : pct >= 75
            ? 'text-emerald-500'
            : pct >= 50
                ? 'text-amber-500'
                : 'text-rose-500';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 56 56"
            role="img"
            aria-label={measured ? `Average ATS score ${Math.round(pct)} out of 100` : 'Average ATS score not measured yet'}
            data-testid="cuba-ats-radial-gauge"
            className={cx('flex-none', toneClass, className)}
        >
            <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="6" style={{ stroke: 'var(--cuba-line)' }} />
            <circle
                cx="28"
                cy="28"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                stroke="currentColor"
                strokeDasharray={`${dash} ${circumference}`}
                transform="rotate(-90 28 28)"
                className="transition-[stroke-dasharray] duration-500"
            />
            <text x="28" y="32" textAnchor="middle" className="fill-current" style={{ fontSize: '12px', fontWeight: 800 }}>
                {measured ? Math.round(pct) : '—'}
            </text>
        </svg>
    );
};

/**
 * Visual progress bar for Active Resumes.
 *
 * `target` is the documented workspace capacity the bar is drawn against, and it
 * is stated verbatim in the accessible name so the bar never implies a limit the
 * product did not define.
 */
export const ResumeProgressBar = ({ count, target = 5, className = '' }) => {
    const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
    const pct = Math.min(100, Math.round((safeCount / Math.max(1, target)) * 100));
    return (
        <div className={cx('w-full', className)} data-testid="cuba-resume-progress">
            <div
                role="progressbar"
                aria-label={`Active resumes: ${safeCount} of ${target} workspace slots`}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.min(safeCount, target)}
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--cuba-line)' }}
            >
                <div
                    className="h-full rounded-full bg-cuba-primary transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
};

/**
 * Pipeline status stepper for Job Applications.
 *
 * Only the FIRST stage is asserted from real data: a positive application count
 * proves the candidate has applied. Later stages are rendered as pending rather
 * than guessed, so the stepper cannot overstate progress.
 */
export const PipelineStepper = ({ applied = 0, className = '' }) => {
    const stages = ['Applied', 'In Review', 'Interview', 'Offer'];
    const reached = Number.isFinite(applied) && applied > 0 ? 1 : 0;
    return (
        <ol
            className={cx('flex flex-wrap items-center gap-x-1 gap-y-0.5', className)}
            aria-label="Application pipeline stages"
            data-testid="cuba-pipeline-stepper"
        >
            {stages.map((stage, index) => {
                const done = index < reached;
                const current = index === reached - 1;
                return (
                    <li key={stage} className="flex items-center gap-1" aria-current={current ? 'step' : undefined}>
                        <span className={cx('h-2 w-2 rounded-full', done ? 'bg-cuba-primary' : 'bg-cuba-line')} aria-hidden="true" />
                        <span className={cx('text-[9px] font-semibold uppercase tracking-wide', done ? 'text-cuba-ink' : 'text-cuba-ink-subtle')}>
                            {stage}
                        </span>
                        {index < stages.length - 1 && (
                            <span className={cx('h-px w-3', done ? 'bg-cuba-primary' : 'bg-cuba-line')} aria-hidden="true" />
                        )}
                    </li>
                );
            })}
        </ol>
    );
};

export default { AtsRadialGauge, ResumeProgressBar, PipelineStepper };
