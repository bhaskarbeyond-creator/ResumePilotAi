import React from 'react';
import CubaCard from './CubaCard';
import CubaSkeleton from './CubaSkeleton';
import './cuba-skeleton.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaStatCard — a metric surface that refuses to lie.
 *
 * `value` is rendered verbatim by the caller. This component never substitutes
 * 0 for a missing metric and never derives a percentage the platform did not
 * compute; `isLoading` is an explicit prop so "no data yet" is visually distinct
 * from "the value is genuinely zero" (§46).
 */
const CubaStatCard = ({
    label,
    value,
    hint,
    icon,
    trend,
    loading = false,
    accent = 'primary',
    className = '',
}) => {
    const accentClass = {
        primary: 'bg-cuba-primary-soft text-cuba-primary',
        success: 'bg-cuba-success-soft text-cuba-success',
        info: 'bg-cuba-info-soft text-cuba-info',
        warning: 'bg-cuba-warning-soft text-cuba-warning',
        danger: 'bg-cuba-danger-soft text-cuba-danger',
    }[accent] || 'bg-cuba-primary-soft text-cuba-primary';

    return (
        <CubaCard className={cx('flex items-start gap-4', className)}>
            {icon && (
                <span className={cx('flex h-11 w-11 flex-none items-center justify-center rounded-cuba-md', accentClass)} aria-hidden="true">
                    {icon}
                </span>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cuba-ink-subtle">{label}</p>
                {loading ? (
                    <CubaSkeleton className="mt-2" height="1.35rem" width="4rem" text={`Loading ${label}`} />
                ) : (
                    <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-cuba-ink tabular-nums">
                        {value}
                    </p>
                )}
                {hint && !loading && <p className="mt-1.5 text-xs text-cuba-ink-muted">{hint}</p>}
                {trend && !loading && (
                    <p className={cx('mt-1.5 text-xs font-semibold', trend.tone === 'down' ? 'text-cuba-danger' : 'text-cuba-success')}>
                        {trend.label}
                    </p>
                )}
            </div>
        </CubaCard>
    );
};

export default CubaStatCard;
