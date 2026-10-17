import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-085 — the friendly native AI Copilot mascot.
 *
 * The Overview previously led with a cold circular radar gauge, which read as sterile
 * rather than as a native AI engine. This is a warm, character-led counterpart: an
 * inline-SVG robot avatar sitting inside a glowing aurora halo.
 *
 * Design constraints honoured here:
 *   - NO new binary asset and NO new dependency: the whole mascot is inline SVG.
 *   - The halo is driven by the EXISTING design tokens (--cuba-ai-aurora-a /
 *     --cuba-ai-aurora-b / --cuba-ai-border), so it follows light AND dark themes.
 *   - It is DECORATION with a real text equivalent: role="img" plus an accessible
 *     name, and the glyph itself is aria-hidden so a screen reader announces one
 *     meaningful label instead of the individual shapes.
 *   - The pulse is suppressed under prefers-reduced-motion via motion-reduce.
 */
const CubaCopilotMascot = ({ size = 44, className = '', active = true, label = 'PilotAI Copilot' }) => (
    <span
        data-testid="cuba-copilot-mascot"
        role="img"
        aria-label={label}
        className={cx('relative inline-flex flex-none items-center justify-center rounded-full', className)}
        style={{
            width: size,
            height: size,
            background: 'radial-gradient(circle at 32% 26%, var(--cuba-ai-aurora-a), var(--cuba-ai-aurora-b))',
            boxShadow: '0 0 0 1px var(--cuba-ai-border), 0 8px 20px -8px var(--cuba-ai-aurora-b)',
        }}
    >
        {/* The halo only pulses while the copilot is genuinely active. */}
        {active && (
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full animate-pulse motion-reduce:animate-none"
                style={{ boxShadow: '0 0 0 4px color-mix(in srgb, var(--cuba-ai-aurora-b) 28%, transparent)' }}
            />
        )}
        <svg
            viewBox="0 0 32 32"
            width={Math.round(size * 0.64)}
            height={Math.round(size * 0.64)}
            aria-hidden="true"
            focusable="false"
            className="badge rounded-pill relative"
        >
            {/* antenna */}
            <path d="M16 7.4V4.6" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16" cy="3.3" r="1.6" fill="rgba(255,255,255,0.95)" />
            {/* head */}
            <rect x="6.6" y="7.4" width="18.8" height="15.2" rx="5.4" fill="rgba(255,255,255,0.95)" />
            {/* eyes */}
            <circle cx="12.5" cy="14.3" r="1.85" fill="#2b2440" />
            <circle cx="19.5" cy="14.3" r="1.85" fill="#2b2440" />
            {/* warm smile */}
            <path
                d="M12.4 17.9c1.05 1.45 2.35 2.15 3.6 2.15s2.55-.7 3.6-2.15"
                stroke="#2b2440"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
            />
            {/* shoulders */}
            <rect x="11" y="23.7" width="10" height="4.4" rx="2.2" fill="rgba(255,255,255,0.85)" />
        </svg>
    </span>
);

export default CubaCopilotMascot;
