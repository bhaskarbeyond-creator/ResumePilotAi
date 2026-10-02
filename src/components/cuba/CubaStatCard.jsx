import React from 'react';
import { FiTrendingDown, FiTrendingUp } from 'react-icons/fi';
import CubaCard from './CubaCard';
import CubaSkeleton from './CubaSkeleton';
import './cuba-skeleton.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const ACCENT_TOKENS = {
    primary: {
        border: 'border-[#7366ff]',
        bg: 'bg-[#7366ff]/10 text-[#7366ff]',
        badge: 'bg-[#7366ff]/10 text-[#7366ff] border-[#7366ff]/20',
    },
    success: {
        border: 'border-emerald-500',
        bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    info: {
        border: 'border-sky-500',
        bg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    },
    warning: {
        border: 'border-amber-500',
        bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    danger: {
        border: 'border-rose-500',
        bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    },
};

/**
 * CubaStatCard — authentic Cuba Executive widget-1 metric surface.
 *
 * Truthfulness guarantee (§46):
 * `value` is rendered verbatim by the caller. This component never substitutes
 * 0 for a missing metric; `loading` is an explicit prop so "no data yet" is
 * visually distinct from "the value is genuinely zero".
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
    const tokens = ACCENT_TOKENS[accent] || ACCENT_TOKENS.primary;

    return (
        <CubaCard
            className={cx(
                'cuba-stat-card cuba-widget-texture relative overflow-hidden rounded-[15px] border border-cuba-line bg-cuba-card p-5 shadow-[0_9px_20px_rgba(46,35,94,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(46,35,94,0.12)] flex flex-col justify-between',
                className
            )}
        >
            {/* Top row: Icon bubble on left, trend badge on right */}
            <div className="flex items-center justify-between gap-2 mb-3">
                {icon && (
                    <div className={cx('relative flex-none p-1 rounded-full border border-dashed transition-transform duration-300', tokens.border)}>
                        <div className={cx('cuba-stat-icon flex h-11 w-11 items-center justify-center rounded-full shadow-xs transition-transform', tokens.bg)}>
                            {icon}
                        </div>
                    </div>
                )}
                {trend && !loading && (
                    <div className={cx(
                        'flex-none flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold border whitespace-nowrap',
                        trend.tone === 'down'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    )}>
                        {trend.tone === 'down' ? (
                            <FiTrendingDown className="h-3 w-3" aria-hidden="true" />
                        ) : (
                            <FiTrendingUp className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{trend.label}</span>
                    </div>
                )}
            </div>

            {/* Bottom section: Metric value, Category label, and Hint */}
            <div className="space-y-0.5">
                {loading ? (
                    <CubaSkeleton className="mt-1" height="1.75rem" width="4rem" text={`Loading ${label}`} />
                ) : (
                    <p className="text-2xl sm:text-3xl font-black tracking-tight text-cuba-ink tabular-nums font-rubik leading-tight">
                        {value}
                    </p>
                )}
                <p className="text-xs font-semibold uppercase tracking-wider text-cuba-ink-subtle">
                    {label}
                </p>
                {hint && !loading && (
                    <p className="text-[11px] font-medium text-cuba-ink-muted leading-tight pt-0.5">
                        {hint}
                    </p>
                )}
            </div>
        </CubaCard>
    );
};

export default CubaStatCard;
