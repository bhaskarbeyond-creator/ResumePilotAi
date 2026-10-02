/**
 * CubaAppShell — the universal authenticated chrome (§15).
 *
 * PRESENTATION ONLY. It deliberately holds no authorization logic: routes stay
 * guarded by `RequireAuthenticated` in `src/main.jsx` plus server-side RBAC. The
 * shell receives an already-authorised navigation model as `navigation`, which
 * the caller derives from the REAL route tree — the shell can therefore never
 * link to a route that does not exist (§16, zero dead links).
 *
 * Layout contract:
 *   - Desktop: 260px sidebar, collapsible to 72px (§15).
 *   - Mobile:  slide-in drawer with backdrop, Escape, focus trap and focus
 *              restoration via the shared `useDialogA11y` contract (§14).
 *   - Content scrolls in the main column only; the shell never introduces a
 *     second nested scrollbar (§36).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiMenu, FiSearch, FiSun, FiMoon, FiX } from 'react-icons/fi';
import AiEngineStatus from './AiEngineStatus';
import CubaCommandPalette from './CubaCommandPalette';
import ContextSwitcher from '../Common/ContextSwitcher';
import { useDialogA11y } from './useDialogA11y';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const COLLAPSE_KEY = 'cuba_sidebar_collapsed';

const readCollapsed = () => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
};

/**
 * Sidebar / drawer navigation. Group headings are real headings so a screen
 * reader can navigate by structure, and the active item carries `aria-current`
 * rather than colour alone (§37).
 */
export const CubaNavGroups = ({ groups, collapsed = false, onNavigate, headingId = 'cuba-nav-heading', navigationLabel = 'Candidate workspace navigation' }) => (
    <nav aria-label={navigationLabel} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
        {groups.map((group) => (
            <div key={group.id} className="space-y-1">
                {!collapsed && (
                    <h2 id={`${headingId}-${group.id}`} className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400/90 dark:text-slate-500 mb-1.5">
                        {group.label}
                    </h2>
                )}
                <ul className="space-y-1">
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
                                        'cuba-focusable flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                                        collapsed && 'justify-center px-0 h-10 w-10 mx-auto',
                                        active
                                            ? 'bg-[#7366ff] text-white shadow-[0_4px_14px_rgba(115,102,255,0.35)] font-semibold'
                                            : 'text-slate-600 hover:bg-[#f3f4fd] hover:text-[#7366ff] dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-[#7366ff]',
                                    )}
                                >
                                    {Icon && <Icon className={cx('h-[18px] w-[18px] flex-none', active ? 'text-white' : 'text-slate-400')} aria-hidden="true" />}
                                    {!collapsed && <span className="truncate">{item.label}</span>}
                                    {collapsed && <span className="cuba-sr-only">{item.label}</span>}
                                    {!collapsed && item.badge ? (
                                        <span className={cx(
                                            'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold',
                                            active
                                                ? 'bg-white/20 text-white'
                                                : 'bg-[#7366ff]/10 text-[#7366ff]'
                                        )}>
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
    navigationLabel = 'Candidate workspace navigation',
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

    // ⌘K / Ctrl+K (§25). Registered ONLY when the caller supplied real,
    // reachable commands — an empty palette must not hijack a browser shortcut.
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
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-cuba-ink-muted">{breadcrumb}</div>
                ) : (
                    <div className="min-w-0 flex-1" />
                )}

                {commands.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        className="cuba-focusable hidden items-center gap-2 rounded-xl border border-cuba-line bg-cuba-card px-3.5 py-1.5 text-xs text-cuba-ink-subtle shadow-xs transition-colors hover:border-[#7366ff]/50 md:inline-flex"
                    >
                        <FiSearch className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        <span>Search</span>
                        <kbd className="ml-2 rounded-md bg-slate-100 dark:bg-slate-800 border border-cuba-line px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-500">⌘K</kbd>
                    </button>
                )}

                {toolbar}

                <AiEngineStatus status={aiStatus} className="hidden sm:inline-flex" />

                {onToggleTheme && (
                    <button
                        type="button"
                        onClick={onToggleTheme}
                        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                        className="cuba-focusable inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl text-cuba-ink-muted hover:bg-cuba-primary-soft hover:text-[#7366ff] transition-colors"
                    >
                        {theme === 'dark'
                            ? <FiSun className="h-4 w-4 text-amber-400" aria-hidden="true" />
                            : <FiMoon className="h-4 w-4" aria-hidden="true" />}
                    </button>
                )}

                {user && (
                    <div className="hidden items-center gap-2 pl-2 sm:flex">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#7366ff] to-[#5949d6] text-xs font-bold text-white shadow-xs">
                            {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                        </div>
                        <span className="max-w-[10rem] truncate text-xs font-semibold text-cuba-ink">
                            {user.name}
                        </span>
                    </div>
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
                    <div className={cx(
                        'flex items-center h-14 px-4 border-b border-cuba-line/50 flex-none',
                        collapsed ? 'justify-center px-1' : 'justify-between'
                    )}>
                        <a href="/dashboard" className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-tr from-[#7366ff] to-[#5949d6] text-white font-black text-xs shadow-[0_3px_10px_rgba(115,102,255,0.35)]">
                                ✦
                            </div>
                            {!collapsed && (
                                <div className="min-w-0 truncate">
                                    <div className="text-sm font-extrabold tracking-tight text-cuba-ink flex items-center gap-1.5">
                                        <span>IME365</span>
                                        <span className="rounded bg-[#7366ff]/10 px-1 py-0.2 text-[8px] font-black text-[#7366ff] uppercase tracking-wider">AI</span>
                                    </div>
                                    <div className="text-[9px] font-semibold text-cuba-ink-subtle uppercase tracking-wider">Executive Suite</div>
                                </div>
                            )}
                        </a>
                    </div>
                    {!collapsed && (
                        <div className="px-3 pt-3 pb-2 border-b border-cuba-line/40">
                            <ContextSwitcher variant="sidebar" />
                        </div>
                    )}
                    <CubaNavGroups groups={groups} collapsed={collapsed} headingId="cuba-nav-heading" navigationLabel={navigationLabel} />
                </aside>

                {mobileOpen && (
                    <div className="fixed inset-0 lg:hidden" style={{ zIndex: 'var(--cuba-z-drawer)' }}>
                        <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs" onClick={() => setMobileOpen(false)} aria-hidden="true" />
                        <div
                            ref={panelRef}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Navigation"
                            data-testid="cuba-mobile-drawer"
                            className="cuba-glass-strong absolute inset-y-0 left-0 flex w-[min(84vw,var(--cuba-sidebar-w))] flex-col shadow-cuba-lg"
                        >
                            <div className="flex h-14 flex-none items-center justify-between border-b border-cuba-line/60 px-4">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-tr from-[#7366ff] to-[#5949d6] text-white font-black text-xs shadow-[0_3px_10px_rgba(115,102,255,0.35)]">
                                        ✦
                                    </div>
                                    <span className="text-sm font-extrabold tracking-tight text-cuba-ink">IME365 Career Suite</span>
                                </div>
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
                            <div className="px-3 py-2.5 border-b border-cuba-line/40">
                                <ContextSwitcher variant="sidebar" onNavigate={onMobileNavigate} />
                            </div>
                            <CubaNavGroups groups={groups} onNavigate={onMobileNavigate} headingId="cuba-drawer-heading" navigationLabel={navigationLabel} />
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
