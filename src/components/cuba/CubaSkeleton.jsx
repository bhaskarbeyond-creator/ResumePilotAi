import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaSkeleton — shimmer placeholder for asynchronous content.
 *
 * Exposed to assistive tech as a busy region rather than as content, and the
 * shimmer is disabled under reduced motion (§27). It never reserves a wrong
 * height, so it cannot cause CLS.
 */
const CubaSkeleton = ({ className = '', width, height = '1rem', rounded = 'rounded-cuba-sm', text }) => (
    <span
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cx('cuba-skeleton block', rounded, className)}
        style={{ width, height }}
    >
        <span className="cuba-sr-only">{text || 'Loading content'}</span>
    </span>
);

export default CubaSkeleton;
