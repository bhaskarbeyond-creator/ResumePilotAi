/**
 * CubaAppShell â€” the universal authenticated chrome (Â§15).
 *
 * PRESENTATION ONLY. It deliberately holds no authorization logic: routes stay
 * guarded by `RequireAuthenticated` in `src/main.jsx` plus server-side RBAC. The
 * shell receives an already-authorised navigation model as `navigation`, which
 * the caller derives from the REAL route tree â€” the shell can therefore never
 * link to a route that does not exist (Â§16, zero dead links).
 *
 * Layout contract:
 *   - Desktop: 260px sidebar, collapsible to 72px (Â§15).
 *   - Mobile:  slide-in drawer with backdrop, Escape, focus trap and focus
 *              restoration via the shared `useDialogA11y` contract (Â§14).
 *   - Content scrolls in the main column only; the shell never introduces a
 *     second nested scrollbar (Â§36).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiMenu, FiSearch, FiSun, FiMoon, FiX } from 'react-icons/fi';
import AiEngineStatus from './AiEngineStatus';
import CubaCommandPalette from './CubaCommandPalette';
import { useDialogA11y } from './useDialogA11y';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const COLLAPSE_KEY = 'cuba_sidebar_collapsed';

const readCollapsed = () => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
};

/**
 * Sidebar / drawer navigation. Group headings are real headings so a screen
 * reader can navigate by structure, and the active item carries `aria-current`
 * rather than colour alone (Â§37).
 */
export const CubaNavGroups = ({ groups, collapsed = false, onNavigate, headingId = 'cuba-nav-heading' }) => (
    <nav aria-labelledby={headingId} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groups.map((group) => (
            <div key={group.id} className="mb-5 last:mb-0">
                {!collapsed && (
                    <h2 id={`${headingId}-${group.id}`} className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-cuba-ink-subtle">
                        {group.label}
                    </h2>
                )}
                <ul className="space-y-0.5">
                    {group.items.map((item) => {
                        const active = item.active === true;
                        const Icon = item.icon;
                        return (
                            <li key={item.id}>
                                <a
                                    href={item.href}
                                    aria-current={active ? 'page' : undefined}
                                    title={collapsed ? item.label : undefined}
                                    onClick={() => onNavigate?.(item)}
                                    className={cx(
                                        'cuba-focusable flex items-center gap-3 rounded-cuba-sm px-3 py-2.5 text-sm font-medium transition-colors duration-200',
                                        collapsed && 'justify-center px-0',
                                        active
                                            ? 'bg-cuba-primary-fill text-cuba-on-primary shadow-cuba-sm'
                                            : 'text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-cuba-ink',
                                    )}
                                >
                                    {Icon && <Icon className="h-[18px] w-[18px] flex-none" aria-hidden="true" />}
                                    {!collapsed && <span className="truncate">{item.label}</span>}
                                    {collapsed && <span className="cuba-sr-only">{item.label}</span>}
                                    {!collapsed && item.badge ? (
                                        <span className="ml-auto rounded-full bg-cuba-primary-soft px-2 py-0.5 text-[11px] font-bold text-cuba-primary-ink-strong">
                                            {item.badge}
                                        </span>
                                    ) : null}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </div>
        ))}
    </nav>
);

const CubaAppShell = ({
    navigation = [],
    breadcrumb = null,
    theme = 'light',
    onToggleTheme,
    aiStatus = 'unknown',
    commands = [],
    toolbar = null,
    user = null,
    children,
}) => {
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const mobileCloseRef = useRef(null);
    const { panelRef } = useDialogA11y({
        open: mobileOpen,
        onClose: () => setMobileOpen(false),
        initialFocusRef: mobileCloseRef,
    });

    useEffect(() => {
        try { localStorage.setItem(COLLAPSE_KEY, String(collapsed)); } catch { /* optional */ }
    }, [collapsed]);

    // âŒ˜K / Ctrl+K (Â§25). Registered ONLY when the caller supplied real,
    // reachable commands â€” an empty palette must not hijack a browser shortcut.
    useEffect(() => {
        if (commands.length === 0) return undefined;
        const onKeyDown = (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setPaletteOpen((open) => !open);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [commands.length]);

    const groups = useMemo(() => navigation, [navigation]);
    const onMobileNavigate = useCallback(() => setMobileOpen(false), []);

    return (
        <div className="flex min-h-screen flex-col bg-cuba-canvas text-cuba-ink">
            <a
                href="#cuba-main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-cuba-sm focus:bg-cuba-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cuba-ink focus:shadow-cuba-md"
            >
                Skip to main content
            </a>

            {/* ---- App bar. Glass here because it floats over scrolling content. */}
            <header className="cuba-glass sticky top-0 z-50 flex h-[var(--cuba-header-h)] flex-none items-center gap-3 border-x-0 border-t-0 px-3 sm:px-5">
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open navigation"
                    aria-expanded={mobileOpen}
                    className="cuba-focusable inline-flex h-10 w-10 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft lg:hidden"
                >
                    <FiMenu className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                    type="button"
                    onClick={() => setCollapsed((value) => !value)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-pressed={collapsed}
                    className="cuba-focusable hidden h-10 w-10 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft lg:inline-flex"
                >
                    <FiChevronLeft
                        className={cx('h-5 w-5 transition-transform duration-200', collapsed && 'rotate-180')}
                        aria-hidden="true"
                    />
                </button>

                {breadcrumb ? (
                    <div className="min-w-0 flex-1 truncate text-sm text-cuba-ink-muted">{breadcrumb}</div>
                ) : (
                    <div className="min-w-0 flex-1" />
                )}

                {commands.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        className="cuba-focusable hidden items-center gap-2 rounded-cuba-sm border border-cuba-line bg-cuba-card px-3 py-2 text-sm text-cuba-ink-subtle transition-colors hover:border-cuba-primary/50 md:inline-flex"
                    >
                        <FiSearch className="h-4 w-4" aria-hidden="true" />
                        <span>Search</span>
                        <kbd className="ml-2 rounded border border-cuba-line px-1.5 py-0.5 text-[10px] font-semibold">âŒ˜K</kbd>
                    </button>
                )}

                {toolbar}

                <AiEngineStatus status={aiStatus} className="hidden sm:inline-flex" />

                {onToggleTheme && (
                    <button
                        type="button"
                        onClick={onToggleTheme}
                        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                        className="cuba-focusable inline-flex h-10 w-10 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft"
                    >
                        {theme === 'dark'
                            ? <FiSun className="h-5 w-5" aria-hidden="true" />
                            : <FiMoon className="h-5 w-5" aria-hidden="true" />}
                    </button>
                )}

                {user && (
                    <span className="hidden max-w-[10rem] truncate pl-1 text-sm font-medium text-cuba-ink sm:block">
                        {user.name}
                    </span>
                )}
            </header>

            <div className="flex min-h-0 flex-1">
                <aside
                    className={cx(
                        'cuba-glass sticky top-[var(--cuba-header-h)] hidden h-[calc(100vh-var(--cuba-header-h))] flex-none flex-col border-y-0 border-l-0 lg:flex',
                        collapsed ? 'w-[var(--cuba-sidebar-w-collapsed)]' : 'w-[var(--cuba-sidebar-w)]',
                    )}
                    data-testid="cuba-sidebar"
                >
                    <CubaNavGroups groups={groups} collapsed={collapsed} headingId="cuba-nav-heading" />
                </aside>

                {mobileOpen && (
                    <div className="fixed inset-0 lg:hidden" style={{ zIndex: 'var(--cuba-z-drawer)' }}>
                        <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
                        <div
                            ref={panelRef}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Navigation"
                            data-testid="cuba-mobile-drawer"
                            className="cuba-glass-strong absolute inset-y-0 left-0 flex w-[min(84vw,var(--cuba-sidebar-w))] flex-col shadow-cuba-lg"
                        >
                            <div className="flex h-[var(--cuba-header-h)] flex-none items-center justify-between border-b border-cuba-line px-3">
                                <span className="text-sm font-bold tracking-tight text-cuba-ink">Navigate</span>
                                <button
                                    ref={mobileCloseRef}
                                    type="button"
                                    onClick={() => setMobileOpen(false)}
                                    aria-label="Close navigation"
                                    className="cuba-focusable inline-flex h-9 w-9 items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft"
                                >
                                    <FiX className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </div>
                            <CubaNavGroups groups={groups} onNavigate={onMobileNavigate} headingId="cuba-drawer-heading" />
                        </div>
                    </div>
                )}

                <main id="cuba-main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden">
                    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
                </main>
            </div>

            <CubaCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
        </div>
    );
};

export default CubaAppShell;
