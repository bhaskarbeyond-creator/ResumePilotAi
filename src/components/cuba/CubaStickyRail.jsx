import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-082 — a sticky rail that pins under the shell header.
 *
 * The benchmark found only 2 of 14 candidate pages used any sticky region, so
 * filters, KPI strips and settings navigation all scrolled away. A rail sticks
 * below the shell header (never under it) and becomes a normal block on mobile,
 * where a pinned column would waste the viewport.
 */
const CubaStickyRail = ({ className = '', label, children, ...rest }) => (
    <aside
        data-testid="card bs-sticky-rail sticky-top cuba-sticky-rail"
        aria-label={label}
        className={cx(
            'card bs-sticky-rail min-w-0 md:sticky md:top-[calc(var(--cuba-header-h)+0.75rem)]',
            'md:max-h-[calc(100vh-var(--cuba-header-h)-1.5rem)] md:overflow-y-auto cuba-scrollbar',
            className,
        )}
        {...rest}
    >
        {children}
    </aside>
);

export default CubaStickyRail;
