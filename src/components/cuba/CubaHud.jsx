import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-082 — the compact HUD strip.
 *
 * Market leaders (Novoresume, Huntr, Stripe) put the few numbers that matter in a
 * single dense row so the page opens with orientation and no scroll. The HUD is
 * purely presentational: it renders ONLY the items the caller passes, and renders
 * nothing at all when there are none, so a page can never show an invented metric.
 */
const CubaHud = ({ items = [], className = '', label = 'Key metrics', dense = false }) => {
    if (!items.length) return null;
    return (
        <dl
            data-testid="cuba-hud"
            aria-label={label}
            className={cx(
                'cuba-glass flex flex-wrap items-stretch gap-2 rounded-cuba-lg border border-cuba-line',
                dense ? 'p-2' : 'p-3',
                className,
            )}
        >
            {items.map((item) => (
                <div
                    key={item.label}
                    className="flex min-w-0 flex-1 basis-[7.5rem] items-center gap-2 rounded-cuba-sm bg-cuba-card/70 px-3 py-2"
                >
                    {item.icon && (
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-cuba-sm bg-cuba-primary-soft text-cuba-primary-ink-strong" aria-hidden="true">
                            {item.icon}
                        </span>
                    )}
                    <div className="min-w-0">
                        <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-cuba-ink-subtle">{item.label}</dt>
                        <dd className="truncate text-base font-bold leading-tight text-cuba-ink">{item.value}</dd>
                        {item.hint && <p className="truncate text-[11px] text-cuba-ink-muted">{item.hint}</p>}
                    </div>
                </div>
            ))}
        </dl>
    );
};

export default CubaHud;
