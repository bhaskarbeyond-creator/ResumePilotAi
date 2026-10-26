import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaCard — the universal content container.
 *
 * Glass is opt-in via `glass`. Tables, dense data grids and long-form reading
 * surfaces deliberately keep the opaque default, because translucency there
 * costs contrast and information density (§10).
 */
const CubaCard = ({
    glass = false,
    ai = false,
    padded = true,
    hover = false,
    className = '',
    children,
    ...rest
}) => (
    <Tag
        className={cx(
            'card bs-card-executive relative rounded-cuba-lg border border-cuba-line bg-cuba-card shadow-cuba-sm shadow-sm',
            glass && 'cuba-glass',
            ai && 'cuba-ai-panel',
            padded && 'p-4 p-md-5',
            hover && 'transition-[transform,box-shadow] duration-200 ease-cuba hover:-translate-y-0.5 hover:shadow-cuba-md motion-reduce:transform-none motion-reduce:transition-none',
            className,
        )}
        {...rest}
    >
        {children}
    </Tag>
);

export default CubaCard;
