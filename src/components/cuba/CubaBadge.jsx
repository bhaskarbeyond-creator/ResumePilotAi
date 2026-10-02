import React from 'react';

const TONES = {
    primary: 'bg-cuba-primary-soft text-cuba-primary',
    success: 'bg-cuba-success-soft text-cuba-success',
    info: 'bg-cuba-info-soft text-cuba-info',
    warning: 'bg-cuba-warning-soft text-cuba-warning',
    danger: 'bg-cuba-danger-soft text-cuba-danger',
    neutral: 'bg-cuba-line/60 text-cuba-ink-muted',
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
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
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
