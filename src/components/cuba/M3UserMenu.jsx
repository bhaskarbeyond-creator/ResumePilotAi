import React, { useRef, useState } from 'react';
import {
    FiUser, FiSettings, FiShield, FiLogOut, FiSun, FiMoon, FiChevronDown, FiMail,
} from 'react-icons/fi';
import { useHeaderPopover } from './useHeaderPopover';
import { ACCOUNT_PORTALS, accountLinksFor } from './accountLinks';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * M3UserMenu — the Google Account-style identity chip and menu for the universal
 * app header (DIR-011).
 *
 * WHAT WAS WRONG BEFORE:
 *   The header rendered a static `<div>` of initials beside a `<span>` of the
 *   user's first name. It was not focusable, not clickable, announced nothing
 *   about the account, and offered no way to reach the profile, settings,
 *   security or sign-out. The user's own name was, in the recruiter and
 *   organization consoles, a hardcoded placeholder string.
 *
 * THE CONTRACT:
 *   - The trigger is a real `<button>` carrying `aria-haspopup="menu"`,
 *     `aria-expanded` and `aria-controls`, so the relationship between the chip
 *     and the menu is exposed rather than merely visual.
 *   - The panel is `role="menu"` with `role="menuitem"` children and roving
 *     arrow-key navigation (ArrowDown/ArrowUp/Home/End), so it is operable by
 *     keyboard end to end — not merely dismissible by it.
 *   - Dismissal (Escape, click-outside, focus restoration) is delegated to the
 *     shared `useHeaderPopover` contract, identical for both header popovers.
 *
 * IDENTITY HONESTY (zero fabrication):
 *   Every value rendered here comes from the `user` prop the caller resolved from
 *   the authenticated session. Nothing is defaulted to a persona label, and no
 *   field is invented: `initialsOf` degrades to a neutral '?' when the session
 *   carries no name, and the menu shows exactly the email and role the session
 *   actually holds.
 */
const initialsOf = (name, email) => {
    const source = String(name || '').trim();
    if (source) {
        const parts = source.split(/\s+/).filter(Boolean);
        const initials = parts.slice(0, 2).map((p) => p[0]).join('');
        if (initials) return initials.toUpperCase();
    }
    // No name in the session: fall back to the mailbox name, never to a persona.
    const mailbox = String(email || '').split('@')[0] || '';
    const fromMail = mailbox.split(/[._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('');
    return fromMail ? fromMail.toUpperCase() : '?';
};

const AVATAR_STYLE = {
    backgroundImage: 'linear-gradient(135deg, var(--cuba-header-avatar-from), var(--cuba-header-avatar-to))',
};

const M3UserMenu = ({ user, theme = 'light', onToggleTheme, onNavigate, onSignOut }) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const itemRefs = useRef([]);

    useHeaderPopover({ open, onClose: () => setOpen(false), triggerRef, panelRef });

    const name = String(user?.name || '').trim();
    const email = String(user?.email || '').trim();
    const role = String(user?.role || '').trim();

    if (!name && !email) return null;

    const initials = initialsOf(name, email);
    const closeThen = (fn) => () => { setOpen(false); fn?.(); };

    /** Roving arrow-key navigation across the menu items. */
    const onMenuKeyDown = (event) => {
        const items = itemRefs.current.filter(Boolean);
        if (items.length === 0) return;
        const current = items.findIndex((el) => el === document.activeElement);
        let next = -1;
        if (event.key === 'ArrowDown') next = (current + 1 + items.length) % items.length;
        else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else return;
        event.preventDefault();
        items[next]?.focus();
    };

    // DIR-025: the three targets are ROLE-SCOPED and resolved by the shared
    // `accountLinks` table upstream (the candidate shell and `CubaPortalShell`,
    // which backs the recruiter, enterprise and admin consoles). The literals
    // below are only the last-resort fallback for a shell that supplies no
    // `user` object at all, and they are the CANDIDATE paths, so they can never
    // send an admin into a candidate workspace.
    const menuItems = [
        { key: 'profile', label: 'Your profile', href: user?.profileHref || accountLinksFor(ACCOUNT_PORTALS.CANDIDATE).profile, Icon: FiUser },
        { key: 'settings', label: 'Settings', href: user?.settingsHref || accountLinksFor(ACCOUNT_PORTALS.CANDIDATE).settings, Icon: FiSettings },
        { key: 'security', label: 'Security & MFA', href: user?.securityHref || accountLinksFor(ACCOUNT_PORTALS.CANDIDATE).security, Icon: FiShield },
    ];

    return (
        <div className="relative flex-none">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? 'cuba-user-menu' : undefined}
                aria-label={`Account menu for ${name || email}`}
                data-testid="cuba-user-menu-trigger"
                className={cx(
                    'cuba-focusable flex items-center gap-2 rounded-full py-1 pl-1 pr-1.5 transition-colors',
                    open ? 'bg-cuba-primary-soft' : 'hover:bg-cuba-primary-soft',
                )}
            >
                <span className="relative flex-none">
                    <span
                        aria-hidden="true"
                        data-testid="cuba-user-initials"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-cuba-sm"
                        style={AVATAR_STYLE}
                    >
                        {initials}
                    </span>
                    <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-cuba-card"
                        style={{ backgroundColor: 'var(--cuba-header-presence)' }}
                    />
                </span>
                <span className="hidden min-w-0 max-w-[9rem] flex-col items-start leading-tight sm:flex">
                    <span className="w-full truncate text-xs font-semibold text-cuba-ink">
                        {name || email}
                    </span>
                    {role && (
                        <span className="w-full truncate text-[10px] font-medium uppercase tracking-wide text-cuba-ink-subtle">
                            {role}
                        </span>
                    )}
                </span>
                <FiChevronDown
                    className={cx('hidden h-3.5 w-3.5 flex-none text-cuba-ink-subtle transition-transform sm:block', open && 'rotate-180')}
                    aria-hidden="true"
                />
            </button>

            {open && (
                <div
                    ref={panelRef}
                    id="cuba-user-menu"
                    role="menu"
                    aria-label="Account"
                    data-testid="cuba-user-menu"
                    onKeyDown={onMenuKeyDown}
                    style={{ zIndex: 'var(--cuba-z-popover)' }}
                    className="absolute right-0 top-[calc(100%+0.5rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-cuba-lg border border-cuba-header-menu-border bg-cuba-header-menu shadow-cuba-lg"
                >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                        <span
                            aria-hidden="true"
                            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-bold text-white"
                            style={AVATAR_STYLE}
                        >
                            {initials}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p data-testid="cuba-user-menu-name" className="truncate text-sm font-semibold text-cuba-ink">
                                {name || '—'}
                            </p>
                            {email && (
                                <p data-testid="cuba-user-menu-email" className="flex items-center gap-1.5 truncate text-xs text-cuba-ink-muted">
                                    <FiMail className="h-3 w-3 flex-none" aria-hidden="true" />
                                    <span className="truncate">{email}</span>
                                </p>
                            )}
                            {role && (
                                <span
                                    data-testid="cuba-user-menu-role"
                                    className="mt-1.5 inline-block rounded-full bg-cuba-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cuba-primary-ink-strong"
                                >
                                    {role}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="h-px" style={{ backgroundColor: 'var(--cuba-header-divider)' }} />
<div className="p-1.5">
                        {menuItems.map((item, index) => {
                            const Icon = item.Icon;
                            return (
                                <button
                                    key={item.key}
                                    ref={(node) => { if (node) itemRefs.current[index] = node; }}
                                    type="button"
                                    role="menuitem"
                                    onClick={closeThen(() => onNavigate?.(item.href))}
                                    className="cuba-focusable flex w-full items-center gap-3 rounded-cuba-sm px-3 py-2 text-left text-sm text-cuba-ink-muted transition-colors hover:bg-cuba-primary-soft hover:text-cuba-ink"
                                >
                                    <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
                                    {item.label}
                                </button>
                            );
                        })}

                        {onToggleTheme && (
                            <button
                                ref={(node) => { if (node) itemRefs.current[menuItems.length] = node; }}
                                type="button"
                                role="menuitem"
                                data-testid="cuba-user-menu-theme"
                                onClick={closeThen(onToggleTheme)}
                                className="cuba-focusable flex w-full items-center gap-3 rounded-cuba-sm px-3 py-2 text-left text-sm text-cuba-ink-muted transition-colors hover:bg-cuba-primary-soft hover:text-cuba-ink"
                            >
                                {theme === 'dark'
                                    ? <FiSun className="h-4 w-4 flex-none text-amber-400" aria-hidden="true" />
                                    : <FiMoon className="h-4 w-4 flex-none" aria-hidden="true" />}
                                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                            </button>
                        )}
                    </div>

                    <div className="h-px" style={{ backgroundColor: 'var(--cuba-header-divider)' }} />

                    <div className="p-1.5">
                        <button
                            ref={(node) => { if (node) itemRefs.current[itemRefs.current.length] = node; }}
                            type="button"
                            role="menuitem"
                            data-testid="cuba-user-menu-signout"
                            onClick={closeThen(onSignOut)}
                            className="cuba-focusable flex w-full items-center gap-3 rounded-cuba-sm px-3 py-2 text-left text-sm font-medium text-cuba-danger transition-colors hover:bg-cuba-danger-soft"
                        >
                            <FiLogOut className="h-4 w-4 flex-none" aria-hidden="true" />
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default M3UserMenu;