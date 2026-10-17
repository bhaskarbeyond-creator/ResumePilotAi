import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * AiSurface — the ambient AI aurora panel (§18, §23).
 *
 * Marks a region as AI-generated or AI-assisted using a restrained violet/cyan
 * glow and the ✦ mark. It is presentational only: it contains no telemetry, no
 * latency and no fabricated score. `status` is passed through from a REAL AI
 * operation and is rendered as text, never inferred.
 *
 * `children` decides what is shown. When there is no data, the caller renders an
 * explicit honest message — this component will not invent one.
 */
const AiSurface = ({
    title = 'AI Career Briefing',
    status = null,
    statusLabel,
    children,
    actions,
    className = '',
    compact = false,
}) => {
    const active = status === 'generating' || status === 'thinking' || status === 'streaming';

    return (
        <section
            className={cx('card bs-card-executive cuba-ai-panel', compact ? 'p-4' : 'p-5 sm:p-6', className)}
            data-testid="ai-surface"
            data-ai-status={status || 'idle'}
            aria-labelledby="ai-surface-title"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3
                    id="ai-surface-title"
                    className="flex items-center gap-2 text-sm font-bold tracking-tight text-cuba-ink"
                >
                    <span aria-hidden="true" className="cuba-ai-mark">✦</span>
                    <span className="cuba-sr-only">AI: </span>
                    {title}
                </h3>
                {(statusLabel || active) && (
                    <span
                        className="inline-flex items-center gap-2 text-xs font-medium text-cuba-ink-muted"
                        role={active ? 'status' : undefined}
                        aria-live={active ? 'polite' : undefined}
                    >
                        <span
                            className="cuba-ai-beacon text-cuba-ai"
                            data-active={active ? 'true' : 'false'}
                            aria-hidden="true"
                        />
                        {statusLabel}
                    </span>
                )}
            </div>
            <div className={cx('text-sm text-cuba-ink-muted', compact ? 'mt-2' : 'mt-3')}>{children}</div>
            {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
        </section>
    );
};

export default AiSurface;
