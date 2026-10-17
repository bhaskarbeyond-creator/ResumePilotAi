import React from 'react';

const TONES = {
    primary: 'badge bg-primary-subtle text-primary bg-cuba-primary-soft text-cuba-primary',
    success: 'badge bg-success-subtle text-success bg-cuba-success-soft text-cuba-success',
    info: 'badge bg-info-subtle text-info bg-cuba-info-soft text-cuba-info',
    warning: 'badge bg-warning-subtle text-warning bg-cuba-warning-soft text-cuba-warning',
    danger: 'badge bg-danger-subtle text-danger bg-cuba-danger-soft text-cuba-danger',
    neutral: 'badge bg-secondary-subtle text-secondary bg-cuba-line/60 text-cuba-ink-muted',
};

/**
 * CubaBadge — a soft-tint status pill.
 *
 * `tone` maps to the semantic tokens, never to a raw colour. When a badge
 * conveys state on its own, pass `srLabel` so the meaning is available to screen
 * readers even when the visible label is abbreviated.
 */
const CubaBadge = ({ tone = 'neutral', icon = null, srLabel, className = '', children }) => (
    <span
        className={[
            'badge rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold',
            TONES[tone] || TONES.neutral,
            className,
        ].filter(Boolean).join(' ')}
    >
        {icon}
        {children}
        {srLabel && <span className="cuba-sr-only">{srLabel}</span>}
    </span>
);

export default CubaBadge;
