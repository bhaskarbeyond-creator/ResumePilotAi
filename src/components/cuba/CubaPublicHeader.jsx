import React, { useState } from 'react';
import { FiMenu, FiX } from 'react-icons/fi';
import CubaButton from './CubaButton';
import { PUBLIC_NAV_LINKS, PUBLIC_AUTH_LINKS } from './publicNavigation';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * CubaPublicHeader — the glassmorphic marketing app bar (Phase 8, §28).
 *
 * Design rules honoured here:
 *   - Sticky, frosted, real hairline border. Glass is applied because the bar
 *     floats above scrolling marketing content, which is the one place
 *     translucency is appropriate (§10).
 *   - No invented claims; links come from the real public route table.
 *   - The mobile menu is a labelled disclosure with `aria-expanded`, and closes
 *     on Escape so a keyboard user is never trapped (§37).
 *   - The bar never overflows: the wordmark truncates and actions are
 *     `flex-none`, so 320px stays clean (§36).
 */
const CubaPublicHeader = ({ brand = 'IME365', signedIn = false, currentPath = '' }) => {
    const [open, setOpen] = useState(false);
    const guestLinks = PUBLIC_AUTH_LINKS.filter((l) => !l.requiresAuth);
    const isActive = (to) => currentPath === to || (to !== '/' && currentPath.startsWith(to));

return (
        <header
            className="cuba-glass sticky top-0 z-50 w-full border-x-0 border-t-0"
            data-testid="cuba-public-header"
        >
            <nav aria-label="Primary" className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
                <a
                    href="/"
                    className="cuba-focusable min-w-0 flex-none truncate rounded-cuba-sm text-base font-bold tracking-tight text-cuba-ink"
                >
                    {brand}
                </a>

                <ul className="ml-4 hidden min-w-0 flex-1 items-center gap-1 lg:flex">
                    {PUBLIC_NAV_LINKS.map((link) => (
                        <li key={link.id}>
                            <a
                                href={link.to}
                                aria-current={isActive(link.to) ? 'page' : undefined}
                                className={cx(
                                    'cuba-focusable inline-block rounded-cuba-sm px-3 py-2 text-sm font-medium transition-colors',
                                    isActive(link.to)
                                        ? 'bg-cuba-primary-soft text-cuba-primary-ink-strong'
                                        : 'text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-cuba-ink',
                                )}
                            >
                                {link.label}
                            </a>
                        </li>
                    ))}
                </ul>

                <div className="ml-auto flex flex-none items-center gap-2">
                    <div className="hidden items-center gap-2 sm:flex">
                        {guestLinks.map((link) => (
                            <a
                                key={link.id}
                                href={link.to}
                                className="cuba-focusable rounded-cuba-sm px-3 py-2 text-sm font-semibold text-cuba-ink-muted transition-colors hover:bg-cuba-primary-soft hover:text-cuba-ink"
                            >
                                {link.label}
                            </a>
                        ))}
                        {signedIn && (
                            <CubaButton size="sm" as="a" href="/dashboard">Open workspace</CubaButton>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        aria-expanded={open}
                        aria-controls="cuba-public-menu"
                        className="cuba-focusable inline-flex h-10 w-10 items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft lg:hidden"
                    >
                        {open
                            ? <FiX className="h-5 w-5" aria-hidden="true" />
                            : <FiMenu className="h-5 w-5" aria-hidden="true" />}
                    </button>
                </div>
            </nav>

{open && (
                <div
                    id="cuba-public-menu"
                    className="cuba-glass-strong border-x-0 border-t lg:hidden"
                    onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
                >
                    <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
                        {PUBLIC_NAV_LINKS.map((link) => (
                            <li key={link.id}>
                                <a
                                    href={link.to}
                                    aria-current={isActive(link.to) ? 'page' : undefined}
                                    onClick={() => setOpen(false)}
                                    className={cx(
                                        'cuba-focusable block rounded-cuba-sm px-3 py-2.5 text-sm font-medium',
                                        isActive(link.to)
                                            ? 'bg-cuba-primary-soft text-cuba-primary-ink-strong'
                                            : 'text-cuba-ink-muted hover:bg-cuba-primary-soft',
                                    )}
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                        {guestLinks.map((link) => (
                            <li key={link.id}>
                                <a
                                    href={link.to}
                                    onClick={() => setOpen(false)}
                                    className="cuba-focusable block rounded-cuba-sm px-3 py-2.5 text-sm font-semibold text-cuba-ink"
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                        {signedIn && (
                            <li>
                                <CubaButton size="sm" fullWidth as="a" href="/dashboard">Open workspace</CubaButton>
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </header>
    );
};

export default CubaPublicHeader;
