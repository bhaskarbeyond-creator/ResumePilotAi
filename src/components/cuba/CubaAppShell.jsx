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
import { FiMenu, FiSearch, FiSun, FiMoon, FiX } from 'react-icons/fi';
// DIR-079: the header brand block's sidebar toggle glyphs.
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
// DIR-092 area 7: the sidebar "Upgrade to Pro" promo card.
import CubaUpgradeCard from './CubaUpgradeCard';
import AiEngineStatus from './AiEngineStatus';
import CubaCommandPalette from './CubaCommandPalette';
// DIR-026 / AC-2: the live unread-message badge. It is its OWN header action
// (icon + server-sourced pill) rather than an `item.badge` string, because the
// count must come from the LIVE hook, not from the static navigation model.
import MessagesNavBadge from './MessagesNavBadge';
import M3Breadcrumbs from './M3Breadcrumbs';
import M3UserMenu from './M3UserMenu';
import M3NotificationCenter from './M3NotificationCenter';
import ContextSwitcher from '../common/ContextSwitcher';
import { useDialogA11y } from './useDialogA11y';
import { useLocation } from 'react-router-dom';
import { getSystemSettings } from '../../services/api/platform';
// DIR-078: the official bundled brand asset — the fallback when the Super Admin
// has not uploaded a logo (getSystemSettings().branding defaults to empty URLs).
import bundledLogo from '../../assets/logo/logo.png';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const COLLAPSE_KEY = 'cuba_sidebar_collapsed';

const readCollapsed = () => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
};

/**
 * DIR-048 S10: true while the viewport is in the tablet band (768–1023px).
 * In that band the shell renders a COMPACT icon rail built from the same
 * authorised navigation model — never a second, smaller opinion about routes.
 * `matchMedia` is feature-guarded so this module stays importable in plain
 * Node (source tests) where `window` does not exist.
 */
const TABLET_RAIL_QUERY = '(min-width: 768px) and (max-width: 1024px)';
const useTabletRail = () => {
    const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(TABLET_RAIL_QUERY).matches
        : false;
    const [isTabletRail, setIsTabletRail] = useState(read);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const query = window.matchMedia(TABLET_RAIL_QUERY);
        const onChange = (event) => setIsTabletRail(event.matches);
        setIsTabletRail(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);
    return isTabletRail;
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
                                            ? 'cuba-fill-pill shadow-cuba-primary font-semibold'
                                            : 'text-slate-600 hover:bg-cuba-primary-soft-hover hover:text-cuba-primary-ink-strong dark:text-slate-300 dark:hover:bg-cuba-primary-soft-hover',
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
                                                : 'bg-cuba-primary-soft text-cuba-primary-ink-strong'
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
     * DIR-092 area 7: whether the signed-in user is already on a Pro plan. The sidebar promo
     * card adapts its copy rather than upselling an existing subscriber. Defaults to false so
     * every existing caller keeps working; the shell never guesses a plan from a missing prop.
     */
    isPro = false,
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
    // DIR-055 S5: application-shell routes (the resume builder) render their OWN
    // full-featured header. Leaving this shell's top bar mounted produced the
    // double-header the user reported. Only the <header> element is skipped —
    // the sidebar, mobile drawer, bottom tab bar, skip link and command palette
    // all stay, so no navigation surface is lost.
    hideTopBar = false,
    user = null,
    onSignOut,
    onNavigate,
    // DIR-026 / AC-2: the REAL, role-scoped messages destination for the header
    // badge. The shell stays portal-agnostic: it defaults to the canonical
    // candidate route, but each portal passes the href it actually owns so the
    // badge can never advertise a surface its own routes do not mount. Without
    // this declaration a caller-supplied href was silently dropped and the
    // header badge never rendered at all.
    messagesHref = '/dashboard/messages',
    // ---- DIR-084: opt-in SINGLE-VIEWPORT lock -----------------------------
    // When true the shell owns its own height (h-[100dvh]) and <main> owns the
    // vertical scroll, so no candidate page can grow the DOCUMENT. Default false,
    // so the employer, admin and enterprise portals (CubaPortalShell) keep today's
    // document-scroll behaviour byte for byte.
    viewportLock = false,
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
    // DIR-048 S10: the tablet band always shows the compact rail, while the
    // user's desktop preference is preserved for the lg+ band.
    const tabletRail = useTabletRail();
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
    // The rail is collapsed at tablet regardless of the stored desktop choice.
    const railCollapsed = collapsed || tabletRail;

    /**
     * DIR-078: Super Admin branding ingestion.
     *
     * The brand tile previously rendered a hardcoded gradient star box and static
     * text, ignoring the logo / brandName the Super Admin uploads in
     * BrandingSettings.jsx. Branding is read BEST-EFFORT: the bundled asset renders
     * immediately (no layout shift), and a failed read or a broken image degrades
     * gracefully to a clean brand mark rather than an empty glass box.
     */
    const [branding, setBranding] = useState({ brandName: 'IME365', logoUrl: '', darkLogoUrl: '' });
    const [logoFailed, setLogoFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getSystemSettings()
            .then((settings) => {
                if (cancelled) return;
                const config = settings?.branding || {};
                setBranding({
                    brandName: String(config.brandName || '').trim() || 'IME365',
                    logoUrl: String(config.logoUrl || '').trim(),
                    darkLogoUrl: String(config.darkLogoUrl || '').trim(),
                });
            })
            .catch(() => {
                // Cosmetic read: keep the bundled default rather than surfacing an error.
            });
        return () => { cancelled = true; };
    }, []);

    const brandName = branding.brandName || 'IME365';
    // Dark theme prefers the dark logo; otherwise the light logo; otherwise the
    // bundled asset. Memoised so the resolution never causes an extra re-render.
    const activeLogo = useMemo(() => {
        if (theme === 'dark' && branding.darkLogoUrl) return branding.darkLogoUrl;
        if (branding.logoUrl) return branding.logoUrl;
        return bundledLogo;
    }, [theme, branding]);
    const showLogoImage = !logoFailed;

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

    /**
     * DIR-048 S10: the mobile tab bar is derived from the SAME authorised
     * navigation model the sidebar renders — real ids, real hrefs, real
     * labels. Nothing is invented here, and a portal that supplies no internal
     * destinations simply gets no tab bar.
     */
    const bottomNavItems = useMemo(() => {
        const seen = new Set();
        const items = [];
        for (const group of groups) {
            for (const item of group.items || []) {
                const href = String(item?.href || '');
                if (!href.startsWith('/') || href.startsWith('//')) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                items.push(item);
                if (items.length >= 4) return items;
            }
        }
        return items;
    }, [groups]);

    return (
        <div className={cx(
            'w-full flex flex-col bg-cuba-canvas text-cuba-ink',
            // DIR-084: with the lock the shell is exactly one viewport tall and clips,
            // so the only scrollbar in the app belongs to <main>.
            viewportLock ? 'h-[100dvh] min-h-0 overflow-hidden' : 'min-h-screen',
        )}>
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
            {!hideTopBar && (
            <header className="cuba-glass sticky top-0 z-50 flex h-[var(--cuba-header-h)] flex-none items-center gap-2 border-x-0 border-t-0 pl-3 pr-3 sm:gap-3 sm:pr-5 md:pl-0">
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open navigation"
                    aria-expanded={mobileOpen}
                    className="cuba-focusable inline-flex h-10 w-10 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted hover:bg-cuba-primary-soft md:hidden"
                >
                    <FiMenu className="h-5 w-5" aria-hidden="true" />
                </button>

                {/* DIR-079: ONE dedicated top-left brand block that spans the
                    sidebar width — [ authentic logo ] [ sidebar toggle tile ] |
                    vertical divider — so the header's left band aligns exactly with
                    the 260px sidebar and never opens as a dead glass void. */}
                <div
                    data-testid="cuba-header-brand-block"
                    className={cx(
                        'hidden h-full flex-none items-center border-r md:flex',
                        railCollapsed
                            ? 'w-[var(--cuba-sidebar-w-collapsed)] justify-center px-1'
                            : 'w-[var(--cuba-sidebar-w)] justify-between pl-3 pr-2 sm:pl-3.5 sm:pr-2.5',
                    )}
                    style={{ borderColor: 'var(--cuba-line)' }}
                >
                    {railCollapsed ? (
                        /* Compact rail: below 1025px the brand mark fills the 72px
                           band; at/above it the toggle is centred instead, because a
                           toggle inside the tablet band would be a dead control. */
                        <a
                            href="/dashboard"
                            onClick={(event) => {
                                if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                                    event.preventDefault();
                                    onNavigate('/dashboard');
                                }
                            }}
                            data-testid="cuba-header-brand-mark"
                            aria-label={`${brandName} home`}
                            className="cuba-focusable flex items-center justify-center min-[1025px]:hidden"
                        >
                            {showLogoImage ? (
                                <img
                                    src={activeLogo}
                                    alt={brandName}
                                    className="h-9 w-9 object-contain shrink-0"
                                    onError={() => setLogoFailed(true)}
                                />
                            ) : (
                                <span
                                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-cuba-primary text-white text-xs font-black"
                                    aria-hidden="true"
                                >
                                    {brandName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </a>
                    ) : (
                        <a
                            href="/dashboard"
                            onClick={(event) => {
                                if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                                    event.preventDefault();
                                    onNavigate('/dashboard');
                                }
                            }}
                            data-testid="cuba-header-brand"
                            aria-label={`${brandName} home`}
                            className="cuba-focusable flex min-w-0 items-center"
                        >
                            {showLogoImage ? (
                                <img
                                    src={activeLogo}
                                    alt={brandName}
                                    className="h-12 md:h-[50px] w-auto max-w-[200px] object-contain shrink-0"
                                    onError={() => setLogoFailed(true)}
                                />
                            ) : (
                                <span
                                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-cuba-primary text-white text-xs font-black"
                                    aria-hidden="true"
                                >
                                    {brandName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </a>
                    )}

                    <button
                        type="button"
                        onClick={() => setCollapsed((value) => !value)}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-pressed={collapsed}
                        data-testid="cuba-sidebar-toggle"
                        className="cuba-focusable hidden w-9 h-9 flex-none rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-cuba-line dark:bg-cuba-card text-slate-600 hover:text-slate-900 dark:text-slate-300 items-center justify-center transition-colors shadow-2xs min-[1025px]:inline-flex"
                    >
                        {collapsed
                            ? <GoSidebarExpand className="w-4 h-4" aria-hidden="true" />
                            : <GoSidebarCollapse className="w-4 h-4" aria-hidden="true" />}
                    </button>
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

                    {/* DIR-026 / AC-2: the live unread-messages action. Placed beside
                        the notification centre so both "things needing attention"
                        controls read as one group. The badge itself renders NOTHING
                        when the administrator has disabled the module, so this can
                        never contribute a dead control to the chrome. */}
                    <MessagesNavBadge
                        href={messagesHref}
                        onNavigate={onNavigate ? (event) => {
                            // Keep the SPA contract: an unmodified left-click on this
                            // INTERNAL href is routed by the shell, never a full reload.
                            // Modifier-clicks and non-primary buttons keep native
                            // new-tab behaviour, matching `handleNavClick`.
                            if (
                                event && event.button === 0
                                && !event.metaKey && !event.ctrlKey
                                && !event.shiftKey && !event.altKey
                            ) {
                                event.preventDefault();
                                onNavigate(messagesHref);
                            }
                        } : undefined}
                    />

                    <AiEngineStatus status={aiStatus} className="hidden sm:inline-flex" />

                    <M3NotificationCenter onNavigate={onNavigate} />

                    <M3UserMenu
                        user={user}
                        theme={theme}
                        onToggleTheme={onToggleTheme}
                        onNavigate={onNavigate}
                        onSignOut={onSignOut}
                    />
                </div>
            </header>
            )}

            <div className={cx('w-full flex min-h-0 flex-1', viewportLock && 'overflow-hidden')}>
                <aside
                    className={cx(
                        // DIR-048 S10: visible from md up — the tablet band gets the
                        // compact icon rail instead of no navigation at all.
                        // DIR-055 S5: when the top bar is hidden (an application
                        // route owns its own header) the sidebar sticks to the
                        // viewport top instead of leaving a phantom header-height gap.
                        // DIR-084: under the viewport lock the row is already exactly one
                        // viewport tall, so the rail fills it and no longer needs to stick.
                        viewportLock
                            ? 'cuba-glass hidden h-full flex-none flex-col border-y-0 border-l-0 md:flex'
                            : hideTopBar
                                ? 'cuba-glass sticky top-0 hidden h-screen flex-none flex-col border-y-0 border-l-0 md:flex'
                                : 'cuba-glass sticky top-[var(--cuba-header-h)] hidden h-[calc(100vh-var(--cuba-header-h))] flex-none flex-col border-y-0 border-l-0 md:flex',
                        railCollapsed ? 'w-[var(--cuba-sidebar-w-collapsed)]' : 'w-[var(--cuba-sidebar-w)]',
                    )}
                    data-testid="cuba-sidebar"
                >
                    {/* DIR-078: the brand identity now anchors the sticky header at
                        y=0, so the sidebar pill holds ONLY the context switcher when
                        expanded (no duplicated brand mark), and the collapsed icon
                        rail renders the authentic brand mark cleanly centered. */}
                    {collapsed ? (
                        <div className="flex h-14 flex-none items-center justify-center border-b border-cuba-line/50 px-1">
                            <a
                                href="/dashboard"
                                onClick={(event) => {
                                    if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
                                        event.preventDefault();
                                        onNavigate('/dashboard');
                                    }
                                }}
                                data-testid="cuba-sidebar-brand-mark"
                                aria-label={`${brandName} home`}
                                className="cuba-focusable flex items-center justify-center"
                            >
                                {showLogoImage ? (
                                    <img
                                        src={activeLogo}
                                        alt={brandName}
                                        className="h-9 w-9 object-contain shrink-0"
                                        onError={() => setLogoFailed(true)}
                                    />
                                ) : (
                                    <span
                                        className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-cuba-primary text-white text-xs font-black"
                                        aria-hidden="true"
                                    >
                                        {brandName.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </a>
                        </div>
                    ) : (
                        <div className="flex-none border-b border-cuba-line/40 px-3 pb-2 pt-3">
                            <div className="cuba-glass flex flex-col gap-2 rounded-cuba-lg border border-cuba-line p-2">
                                <ContextSwitcher variant="sidebar" />
                            </div>
                        </div>
                    )}
                    <CubaNavGroups groups={groups} collapsed={railCollapsed} onNavigate={handleNavClick} headingId="cuba-nav-heading" navigationLabel={navigationLabel} />
                    {/* DIR-092 area 7: the reference anchors a promo card at the FOOT of the
                        sidebar. CubaNavGroups is flex-1, so this sits below it without
                        stealing scroll from the nav list. */}
                    <CubaUpgradeCard
                        collapsed={railCollapsed}
                        isPro={Boolean(isPro)}
                        onNavigate={handleNavClick}
                    />
                </aside>

                {mobileOpen && (
                    <div className="fixed inset-0 md:hidden" style={{ zIndex: 'var(--cuba-z-drawer)' }}>
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
                                <div className="flex items-center gap-2.5 min-w-0" data-testid="cuba-drawer-brand">
                                    {showLogoImage ? (
                                        <img
                                            src={activeLogo}
                                            alt={brandName}
                                            className="h-10 w-auto max-w-[160px] object-contain shrink-0"
                                            onError={() => setLogoFailed(true)}
                                        />
                                    ) : (
                                        <span
                                            className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-cuba-primary text-white text-xs font-black"
                                            aria-hidden="true"
                                        >
                                            {brandName.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <span className="truncate text-sm font-extrabold tracking-tight text-cuba-ink">{brandName}</span>
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

                <main
                    id="cuba-main-content"
                    tabIndex={-1}
                    data-viewport-lock={viewportLock ? 'true' : 'false'}
                    className={cx(
                        'w-full min-w-0 flex-1 overflow-x-hidden',
                        // DIR-084: <main> owns the ONLY vertical scrollbar. The stable
                        // scrollbar gutter means its appearance can never shift layout.
                        viewportLock && 'min-h-0 overflow-y-auto cuba-scrollbar [scrollbar-gutter:stable]',
                    )}
                >
                    {/* DIR-048 S9: the single responsive gutter + width cap shared by
                        every portal, with `pb-24` on mobile reserving room for the
                        bottom tab bar so it can never cover content.
                        DIR-077: the cap is raised from max-w-7xl to max-w-[1680px] so
                        a wide executive viewport stops wasting ~30% of its width. */}
                    <div className="mx-auto w-full max-w-[1680px] min-h-0 px-4 pt-2 pb-24 sm:px-6 md:pt-2.5 md:pb-4 lg:px-8">
                        {/* DIR-077: the semantic trail now anchors the MAIN workspace
                            column at its left edge (exactly one Breadcrumb landmark),
                            instead of floating over the sidebar header. */}
                        {(breadcrumbs || breadcrumb) && (
                            <div className="mb-2 hidden min-w-0 md:block" data-testid="cuba-main-breadcrumbs">
                                {breadcrumbs ? (
                                    <M3Breadcrumbs items={breadcrumbs} onNavigate={onNavigate} />
                                ) : (
                                    <div className="min-w-0 truncate text-sm font-medium text-cuba-ink-muted">{breadcrumb}</div>
                                )}
                            </div>
                        )}
                        {children}
                    </div>
                </main>
            </div>

            {/* ---- Mobile app tab bar (DIR-048 S10, <768px) --------------------
                Native-app navigation: up to four REAL destinations from the
                authorised model plus a "More" control that opens the full
                drawer. Every target is ≥44px, and the bar is display:none from
                md up so it never adds a second landmark at tablet/desktop. */}
            {bottomNavItems.length > 0 && (
                <nav
                    aria-label="Primary mobile navigation"
                    data-testid="cuba-bottom-nav"
                    className="cuba-glass fixed inset-x-0 bottom-0 z-40 flex items-stretch border-x-0 border-b-0 md:hidden"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                    {bottomNavItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <a
                                key={item.id}
                                href={item.href}
                                aria-current={item.active === true ? 'page' : undefined}
                                onClick={(event) => handleNavClick(item, event)}
                                className={cx(
                                    'cuba-focusable flex min-h-[44px] flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold leading-tight',
                                    item.active === true ? 'text-cuba-primary' : 'text-cuba-ink-muted',
                                )}
                            >
                                {Icon
                                    ? <Icon className="h-5 w-5" aria-hidden="true" />
                                    : <span aria-hidden="true" className="text-base leading-none">•</span>}
                                <span className="max-w-full truncate">{item.label}</span>
                            </a>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        aria-label="More navigation options"
                        className="cuba-focusable flex min-h-[44px] flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold leading-tight text-cuba-ink-muted"
                    >
                        <FiMenu className="h-5 w-5" aria-hidden="true" />
                        <span>More</span>
                    </button>
                </nav>
            )}

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
