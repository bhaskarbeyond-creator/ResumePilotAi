import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-085 — the compact metric capsule strip.
 *
 * The Overview used four full-height stat cards (~120px each) to show four numbers that
 * the right rail ALSO reported, which is the duplication the user reported. A capsule is
 * the same fact at a fraction of the height, so the four headline metrics fit in one
 * tight row (~48px) and leave the fold to the resume workspace.
 *
 * Honesty rule: a capsule renders exactly the value it is given. When a value is not yet
 * known the caller passes an explicit placeholder (for example an em dash), so the strip
 * can never present a fabricated zero as a measurement.
 */

const TONES = {
    primary: 'bg-cuba-primary-soft text-cuba-primary-ink-strong',
    success: 'bg-cuba-success-soft text-cuba-success',
    warning: 'bg-cuba-warning-soft text-cuba-warning',
    info: 'bg-cuba-info-soft text-cuba-info',
    neutral: 'bg-cuba-card text-cuba-ink-muted',
};

export const CubaMetricCapsule = ({ label, value, hint, icon = null, tone = 'neutral' }) => (
    <li
        data-testid="cuba-metric-capsule"
        className="flex min-w-0 flex-1 basis-[8.5rem] items-center gap-2 rounded-cuba-sm border border-cuba-line/70 bg-cuba-card/70 px-3 py-1.5"
    >
        {icon && (
            <span
                aria-hidden="true"
                className={cx('flex h-7 w-7 flex-none items-center justify-center rounded-full', TONES[tone] || TONES.neutral)}
            >
                {icon}
            </span>
        )}
        <span className="min-w-0">
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-cuba-ink-subtle">
                {label}
            </span>
            <span className="block truncate text-sm font-bold leading-tight text-cuba-ink">
                {value}
                {hint && <span className="ml-1.5 text-[10px] font-medium text-cuba-ink-muted">{hint}</span>}
            </span>
        </span>
    </li>
);

export const CubaMetricCapsuleStrip = ({ items = [], className = '', label = 'Key metrics' }) => {
    if (!items.length) return null;
    return (
        <ul
            data-testid="cuba-metric-capsules"
            aria-label={label}
            className={cx(
                'cuba-glass flex flex-wrap items-stretch gap-2 rounded-cuba-lg border border-cuba-line p-1.5',
                className,
            )}
        >
            {items.map((item) => (
                <CubaMetricCapsule key={item.label} {...item} />
            ))}
        </ul>
    );
};

export default CubaMetricCapsuleStrip;
