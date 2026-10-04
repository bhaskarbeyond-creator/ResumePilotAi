import React from 'react';
import { FiChevronRight } from 'react-icons/fi';

/**
 * M3Breadcrumbs — semantic, accessible breadcrumb trail for the universal
 * app header (DIR-011).
 *
 * WHY A NEW PRIMITIVE:
 *   The shell previously rendered the breadcrumb as a bare `div` of caller-supplied
 *   text (`<div className="min-w-0 flex-1 truncate ...">{breadcrumb}</div>`). That
 *   is invisible to assistive technology: a screen-reader user cannot tell where
 *   they are, cannot hear the hierarchy, and cannot navigate back up. It also made
 *   it impossible to make an ancestor clickable, because the shell only ever
 *   received a finished node.
 *
 * THE CONTRACT THIS ESTABLISHES:
 *   - ONE `<nav aria-label="Breadcrumb">` wrapping an `<ol>`, the WAI-ARIA
 *     Authoring Practices breadcrumb pattern. Every portal mounts exactly one, so
 *     the landmark stays unique per authenticated route (§14, §37).
 *   - Ancestors are real buttons with an accessible name, so they are reachable by
 *     keyboard and announced as actionable; the TRAILING item is inert text
 *     carrying `aria-current="page"` and is bold. A current page must not be a
 *     link: linking to the page you are already on is a dead control.
 *   - `onNavigate(href)` is the SPA jump. The shell's router-aware handler
 *     intercepts it, so a breadcrumb never reloads the document (§25).
 *   - Separators are `aria-hidden` so they are not announced as content.
 *
 * NO FABRICATION: crumbs are rendered exactly as the caller derives them from the
 * real route tree. This component invents no path and links to nothing that is not
 * supplied by the same navigation model that renders the sidebar.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * @param {Array<{label: string, href?: string}>} items
 *   Ordered from root to current page. The last item is treated as the current
 *   page regardless of whether it carries an href.
 * @param {(href: string) => void} onNavigate SPA navigation handler.
 */
const M3Breadcrumbs = ({ items = [], onNavigate, className, label = 'Breadcrumb' }) => {
    const crumbs = items.filter((item) => item && item.label);
    if (crumbs.length === 0) return null;

    return (
        <nav
            aria-label={label}
            data-testid="cuba-breadcrumb"
            className={cx('min-w-0', className)}
        >
            <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                {crumbs.map((item, index) => {
                    const isCurrent = index === crumbs.length - 1;
                    return (
                        <li key={`${item.label}-${index}`} className="min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                                {index > 0 && (
                                    <FiChevronRight
                                        className="h-3.5 w-3.5 flex-none text-cuba-ink-subtle"
                                        aria-hidden="true"
                                    />
                                )}
                                {isCurrent || !item.href ? (
                                    /* The current page is emphasis, not a control: it is a
                                       plain span with aria-current, never a dead link to
                                       the page already displayed. */
                                    <span
                                        aria-current="page"
                                        data-testid="cuba-breadcrumb-current"
                                        className="truncate font-bold text-cuba-ink"
                                    >
                                        {item.label}
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onNavigate?.(item.href)}
                                        className="cuba-focusable truncate rounded-cuba-sm px-1 py-0.5 font-medium text-cuba-header-crumb transition-colors hover:bg-cuba-primary-soft hover:text-cuba-header-crumb-hover"
                                    >
                                        {item.label}
                                    </button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

export default M3Breadcrumbs;