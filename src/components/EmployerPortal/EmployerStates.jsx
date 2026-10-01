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

export function EmployerStatCard({ icon, label, value, hint, tone = 'indigo' }) {
    const tones = {
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
        slate: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tones[tone] || tones.indigo}`}>
                    {icon}
                </span>
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="employerEmptyStat mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
                    {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
                </div>
            </div>
        </div>
    );
}
