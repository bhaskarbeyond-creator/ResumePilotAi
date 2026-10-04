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
import M3Breadcrumbs from './M3Breadcrumbs';
import M3UserMenu from './M3UserMenu';
import M3NotificationCenter from './M3NotificationCenter';
import ContextSwitcher from '../common/ContextSwitcher';
import { useDialogA11y } from './useDialogA11y';
import { useLocation } from 'react-router-dom';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const COLLAPSE_KEY = 'cuba_sidebar_collapsed';

const readCollapsed = () => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
};

/**
 * Sidebar / drawer navigation. Group headings are real headings so a screen
 * reader can navigate by structure, and the active item carries `aria-current`
 * rather than colour alone (§37).
 *
 * `onNavigate(item, event)` receives the raw click event so the shell can
 * decide whether to intercept: internal targets are routed through react-router
 * (no document reload), while external/mailto targets keep the browser default.
 */
export const CubaNavGroups = ({ groups, collapsed = false, onNavigate, headingId = 'cuba-nav-heading', navigationLabel = 'Candidate workspace navigation' }) => (
    <nav aria-label={navigationLabel} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
        {groups.map((group) => (
            // DIR-017 AC-5: these group headings are 11px-bold text, so they are
            // held to the 4.5:1 AA bar in BOTH themes. The previous
            // `text-slate-400/90 dark:text-slate-500` pair resolved to slate-500 in
            // dark mode, which measures only 4.02:1 on the dark canvas. The semantic
            // ink token is AA-safe in both themes (light 4.97:1, dark 7.49:1) and
            // removes the last hardcoded slate ramp from this chrome.
            <div key={group.id} className="space-y-1">
                {!collapsed && (
                    <h2 id={`${headingId}-${group.id}`} className="px-3 text-[11px] font-bold uppercase tracking-wider text-cuba-ink-subtle mb-1.5">
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
                                    onClick={(event) => onNavigate?.(item, event)}
                                    className={cx(
                                        'cuba-focusable flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                                        collapsed && 'justify-center px-0 h-10 w-10 mx-auto',
                                        active
                                            ? 'cuba-fill-pill shadow-[0_4px_14px_rgba(115,102,255,0.35)] font-semibold'
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
    /**
     * Structured breadcrumb trail (DIR-011). When supplied it is rendered as a
     * semantic `<nav aria-label="Breadcrumb">` with clickable ancestors.
     * `breadcrumb` below is the LEGACY free-form node and is still honoured for
     * any caller not yet migrated, so no portal loses its context label.
     */
    breadcrumbs = null,
    breadcrumb = null,
    theme = 'light',
    onToggleTheme,
    aiStatus = 'unknown',
    commands = [],
    // DIR-012: forwarded verbatim to CubaCommandPalette. The shell never calls it,
    // never inspects it and never assumes anything about what it returns — the
    // portal that owns the data owns the provider. Keeping the shell ignorant is
    // what stops a design layer from becoming a second source of truth (§7).
    commandSearchProvider = null,
    toolbar = null,
    user = null,
    onSignOut,
    onNavigate,
    // ---- DIR-021: AI Career Copilot wiring ---------------------------------
    // All optional and all forwarded verbatim to CubaCommandPalette. The shell
    // never calls `copilotDispatch` itself: the palette owns the request so the
    // authenticated aiService boundary stays in one place (INV-2).
    copilotPortal = null,
    copilotDispatch = null,
    copilotContext = null,
    copilotOnApply = null,
    children,
}) => {
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    // DIR-021: the copilot's chips are resolved from the REAL route, so the
    // shell reports where the user actually is. `useLocation` is read
    // defensively: this shell also renders under non-router hosts in tests.
    const location = useLocation();
    const copilotPathname = location?.pathname || '';
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

    /**
     * SPA route jump: intercept left-clicks on INTERNAL hrefs only and hand them
     * to the shell's router-aware handler (react-router `navigate`) so palette,
     * sidebar and drawer jumps never reload the document (§25). Modifier-clicks
     * (new tab / download) and external/mailto targets keep native behaviour.
     */
    const handleNavClick = useCallback((item, event) => {
        const href = String(item?.href || '');
        const isInternal = href.startsWith('/') && !href.startsWith('//');
        const intercepted = isInternal
            && event
            && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
            && event.button === 0;
        if (intercepted && typeof onNavigate === 'function') {
            event.preventDefault();
            onNavigate(href);
        }
    }, [onNavigate]);

    return (
        <div className="w-full flex min-h-screen flex-col bg-cuba-canvas text-cuba-ink">
            <a
                href="#cuba-main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-cuba-sm focus:bg-cuba-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cuba-ink focus:shadow-cuba-md"
            >
                Skip to main content
            </a>

            {/* ---- App bar (DIR-011: universal Google M3 header) -------------------
                Single row at every viewport (320px → 4K). Left rail = navigation
                controls; centre = the dominant command search; right rail =
                status + identity. `flex-wrap` with `min-w-0` truncation is what
                keeps it one clean row instead of letting any item overflow. */}
            <header className="cuba-glass sticky top-0 z-50 flex h-[var(--cuba-header-h)] flex-none items-center gap-2 border-x-0 border-t-0 px-3 sm:gap-3 sm:px-5">
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

                {/* Left rail: semantic trail. Hidden below md so the centred search
                    keeps the visual centre of mass on small screens. */}
                <div className="hidden min-w-0 flex-1 md:block">
                    {breadcrumbs ? (
                        <M3Breadcrumbs items={breadcrumbs} onNavigate={onNavigate} />
                    ) : breadcrumb ? (
                        <div className="min-w-0 truncate text-sm font-medium text-cuba-ink-muted">{breadcrumb}</div>
                    ) : null}
                </div>

                {/* CENTRE: Material 3 pill command search — the header's dominant
                    affordance, replacing the old small right-aligned trigger.
                    Rendered only when the caller supplied REAL commands, so an
                    empty palette is never advertised (§25).

                    RESPONSIVE CONTRACT (DIR-011 §"Full Responsive Scaling"):
                    at >=768px the full pill shows its placeholder + shortcut badge;
                    below 768px the same control collapses to an ICON-ONLY button of
                    the same 40px hit area as the neighbouring rail buttons. It is a
                    real <button> with an accessible name (not a bare <FiSearch/>),
                    so it is reachable by keyboard and announced as a control, and it
                    opens the identical palette — the mobile collapse is a change of
                    presentation, never a loss of function. */}
                {commands.length > 0 && (
                    <div className="mx-auto flex w-full max-w-xl flex-none items-center justify-center md:w-auto md:flex-1">
                        <button
                            type="button"
                            onClick={() => setPaletteOpen(true)}
                            data-testid="cuba-command-search"
                            aria-label="Search or run a command"
                            aria-keyshortcuts="Control+K Meta+K"
                            className="cuba-focusable group hidden w-full items-center gap-2.5 rounded-full border border-cuba-header-search-border px-4 py-2.5 text-left shadow-cuba-sm transition-colors hover:bg-cuba-header-search-hover md:flex"
                            style={{ backgroundColor: 'var(--cuba-header-search-bg)' }}
                        >
                            <FiSearch className="h-4 w-4 flex-none text-cuba-ink-subtle" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm text-cuba-ink-muted">
                                Search or run a command
                            </span>
                            <kbd
                                data-testid="cuba-command-search-shortcut"
                                className="hidden flex-none items-center gap-0.5 rounded-md border border-cuba-line px-1.5 py-0.5 font-mono text-[10px] font-bold sm:inline-flex"
                                style={{
                                    backgroundColor: 'var(--cuba-header-kbd-bg)',
                                    color: 'var(--cuba-header-kbd-ink)',
                                }}
                            >
                                <span className="cuba-sr-only">Keyboard shortcut: </span>Ctrl K
                            </kbd>
                        </button>

                        {/* Mobile (<768px) collapsed trigger — same action, same a11y. */}
                        <button
                            type="button"
                            onClick={() => setPaletteOpen(true)}
                            data-testid="cuba-command-search-mobile"
                            aria-label="Search or run a command"
                            aria-keyshortcuts="Control+K Meta+K"
                            className="cuba-focusable inline-flex h-10 w-10 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft md:hidden"
                        >
                            <FiSearch className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                )}

                {/* Below md the trail has no room; give the search the full width and
                    keep only the controls on one row. */}
                {commands.length === 0 && <div className="min-w-0 flex-1 md:hidden" />}

                {/* Right rail: context, status, identity. */}
                <div className="ml-auto flex flex-none items-center gap-1.5 sm:gap-2">
                    {toolbar}

                    <AiEngineStatus status={aiStatus} className="hidden sm:inline-flex" />

                    <M3NotificationCenter
                        onNavigate={onNavigate}
                        onOpenAll={toolbar ? undefined : (onNavigate ? () => onNavigate('/dashboard') : undefined)}
                    />

                    <M3UserMenu
                        user={user}
                        theme={theme}
                        onToggleTheme={onToggleTheme}
                        onNavigate={onNavigate}
                        onSignOut={onSignOut}
                    />
                </div>
            </header>

            <div className="w-full flex min-h-0 flex-1">
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
                    <a
                        href="/dashboard"
                        onClick={(event) => {
                            if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                                event.preventDefault();
                                onNavigate('/dashboard');
                            }
                        }}
                        className="flex items-center gap-2.5 min-w-0 text-cuba-ink"
                    >
                            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-tr from-[#7366ff] to-[#5949d6] text-white font-black text-xs shadow-[0_3px_10px_rgba(115,102,255,0.35)]">
                                ✦
                            </div>
                            {!collapsed && (
                                <div className="min-w-0 truncate">
                                    <div className="text-sm font-extrabold tracking-tight text-cuba-ink flex items-center gap-1.5">
                                        <span>IME365</span>
                                        {/* DIR-017 AC-5: the "AI" chip label is 8px text, so it is
                                            held to the full 4.5:1 AA bar, not the 3:1 large-text
                                            bar. The raw brand violet #7366ff is only 3.8:1 on the
                                            light canvas, so the chip uses the AA-safe primary ink
                                            (6.92:1) over the existing soft primary wash. */}
                                        <span className="rounded bg-cuba-primary-soft px-1 py-0.5 text-[8px] font-black text-cuba-primary-ink-strong uppercase tracking-wider">AI</span>
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
                    <CubaNavGroups groups={groups} collapsed={collapsed} onNavigate={handleNavClick} headingId="cuba-nav-heading" navigationLabel={navigationLabel} />
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
                            <CubaNavGroups
                                groups={groups}
                                headingId="cuba-drawer-heading"
                                navigationLabel={navigationLabel}
                                onNavigate={(item, event) => {
                                    onMobileNavigate();
                                    handleNavClick(item, event);
                                }}
                            />
                        </div>
                    </div>
                )}

                <main id="cuba-main-content" tabIndex={-1} className="w-full min-w-0 flex-1 overflow-x-hidden">
                    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
                </main>
            </div>

            <CubaCommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                commands={commands}
                searchProvider={commandSearchProvider}
                onNavigate={onNavigate}
                copilotPortal={copilotPortal}
                copilotPathname={copilotPathname}
                copilotDispatch={copilotDispatch}
                copilotOnApply={copilotOnApply}
                data-testid="cuba-command-palette"
            />
        </div>
    );
};

export default CubaAppShell;
