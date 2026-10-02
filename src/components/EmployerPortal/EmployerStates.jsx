import React from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

/**
 * Shared employer portal state components.
 *
 * Each state is explicit so a failed or empty read is never presented as a
 * working screen, and no placeholder content stands in for real API data.
 */

export function EmployerPageHeader({ eyebrow, title, description, actions }) {
    return (
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                {eyebrow && (
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>
                )}
                <h1 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">{title}</h1>
                {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}

export function EmployerLoading({ label = 'Loading hiring workspace…' }) {
    return (
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-600">{label}</p>
        </div>
    );
}

export function EmployerErrorState({ error, onRetry, title = 'We could not load your hiring workspace' }) {
    const message = error?.message || 'The hiring service did not respond as expected.';
    return (
        <div
            className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center sm:p-8"
            role="alert"
        >
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <FiAlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-extrabold text-rose-900">{title}</h2>
            <p className="mt-2 text-sm text-rose-800">{message}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                >
                    <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
                    Try again
                </button>
            )}
        </div>
    );
}

export function EmployerEmptyState({ icon, title, description, action }) {
    return (
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center sm:p-10">
            {icon && <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">{icon}</span>}
            <h2 className="mt-4 text-base font-extrabold text-slate-900">{title}</h2>
            {description && <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">{description}</p>}
            {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
        </div>
    );
}

export function EmployerStatCard({ icon, label, value, hint, trend, tone = 'indigo' }) {
    const tones = {
        indigo: { bubble: 'border-indigo-200', chip: 'bg-indigo-50 text-indigo-600', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
        emerald: { bubble: 'border-emerald-200', chip: 'bg-emerald-50 text-emerald-600', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        amber: { bubble: 'border-amber-200', chip: 'bg-amber-50 text-amber-600', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
        slate: { bubble: 'border-slate-200', chip: 'bg-slate-100 text-slate-600', pill: 'bg-slate-100 text-slate-600 border-slate-200' },
    };
    const active = tones[tone] || tones.indigo;
    return (
        <div className="rounded-[15px] border border-cuba-line bg-cuba-card p-5 shadow-[0_9px_20px_rgba(46,35,94,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(46,35,94,0.12)] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-3">
                {icon && (
                    <div className={`relative flex-none p-1 rounded-full border border-dashed transition-transform duration-300 ${active.bubble}`}>
                        <div className={`flex h-11 w-11 items-center justify-center rounded-full shadow-xs transition-transform ${active.chip}`}>
                            {icon}
                        </div>
                    </div>
                )}
                {trend && (
                    <span className={`flex-none inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold border whitespace-nowrap ${active.pill}`}>
                        {trend}
                    </span>
                )}
            </div>
            <div className="space-y-0.5">
                <p className="text-2xl sm:text-3xl font-black tracking-tight text-cuba-ink tabular-nums font-rubik leading-tight">
                    {value}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-cuba-ink-subtle">
                    {label}
                </p>
                {hint && <p className="text-[11px] font-medium text-cuba-ink-muted leading-tight pt-0.5">{hint}</p>}
            </div>
        </div>
    );
}
