import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaPageHeader — the standard page title block (§15).
 *
 * Renders a real `<h1>` by default so every page has exactly one top-level
 * heading (a common screen-reader navigation failure). Pass `headingLevel="h2"`
 * when the page is nested inside another page's heading structure.
 */
const CubaPageHeader = ({
    title,
    subtitle,
    eyebrow,
    actions,
    breadcrumb = null,
    headingLevel: Heading = 'h1',
    className = '',
    children,
}) => (
    <header className={cx('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
        <div className="min-w-0">
            {breadcrumb}
            {eyebrow && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cuba-ink-subtle">
                    {eyebrow}
                </p>
            )}
            <Heading className="mt-1 text-2xl font-bold tracking-tight text-cuba-ink sm:text-[28px]">
                {title}
            </Heading>
            {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-cuba-ink-muted">{subtitle}</p>}
            {children}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
);

export default CubaPageHeader;
