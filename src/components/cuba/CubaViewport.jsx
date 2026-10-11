import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-082 — the bounded scroll region.
 *
 * Every candidate page previously scrolled the whole document, so acting on a row
 * pushed the page title and the toolbar out of view (the measured friction in the
 * DIR-082 benchmark: only 2 of 14 pages managed viewport height at all).
 *
 * `CubaViewport` bounds its own height to the shell header and owns the scroll, so
 * the frame's header and toolbar stay pinned while the content moves.
 */
const CubaViewport = ({ className = '', scroll = true, padded = true, children, ...rest }) => (
    <div
        data-testid="cuba-viewport"
        className={cx(
            'min-w-0 h-[calc(100vh-var(--cuba-header-h))] max-h-[calc(100vh-var(--cuba-header-h))]',
            'lg:h-[calc(100vh-var(--cuba-header-h))]',
            scroll ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden',
            padded ? 'px-4 pb-6 pt-4 sm:px-6 lg:px-8' : '',
            'cuba-scrollbar',
            className,
        )}
        {...rest}
    >
        {children}
    </div>
);

export default CubaViewport;
