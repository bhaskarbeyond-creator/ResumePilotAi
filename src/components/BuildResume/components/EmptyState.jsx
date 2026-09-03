import React from 'react';

/**
 * EmptyState — what a section shows when it has no entries yet.
 * A purpose sentence, ONE primary action, and an optional quiet secondary.
 * No sample data, no pill clouds, no profession content — the candidate's
 * resume is written by the candidate.
 */
export default function EmptyState({
    title,
    description,
    primaryAction = null,
    secondaryAction = null,
    children = null,
}) {
    return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 sm:py-10 text-center">
            <h3 className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
            {description ? (
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>
            ) : null}

            {(primaryAction || secondaryAction) && (
                <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                    {primaryAction && (
                        <button
                            type="button"
                            onClick={primaryAction.onClick}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30"
                        >
                            {primaryAction.icon}
                            <span>{primaryAction.label}</span>
                        </button>
                    )}
                    {secondaryAction && (
                        <button
                            type="button"
                            onClick={secondaryAction.onClick}
                            disabled={secondaryAction.disabled}
                            title={secondaryAction.reason || undefined}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {secondaryAction.icon}
                            <span>{secondaryAction.label}</span>
                        </button>
                    )}
                </div>
            )}

            {secondaryAction?.disabled && secondaryAction?.reason ? (
                <p className="mt-2 text-xs text-slate-400">{secondaryAction.reason}</p>
            ) : null}

            {children}
        </div>
    );
}
