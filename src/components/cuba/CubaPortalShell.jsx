import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    FiGrid, FiBriefcase, FiUsers, FiMessageSquare, FiHome, FiSettings,
    FiActivity, FiHeart, FiCpu, FiSliders, FiAlertTriangle, FiFileText,
    FiShield, FiHelpCircle, FiUserCheck, FiSend, FiCheckSquare, FiLayers,
    FiDatabase, FiEdit3, FiLayout, FiStar, FiAward, FiGlobe, FiZap,
    FiLock, FiBarChart2, FiMail, FiCommand
} from 'react-icons/fi';
import CubaAppShell from './CubaAppShell';
import { useAiEngineStatus } from '../../hooks/useAiEngineStatus';
import { generateUserAiContent } from '../../services/aiService';
import { COPILOT_PORTALS } from './copilotActions';
import { AuthContext } from '../../context/AuthContext';
import fire from '../../conf/fire';
import { resolveActiveItem } from '../Candidate/navigationState';
import { buildPortalCommands } from './portalCommands';
import { ACCOUNT_PORTALS, accountLinksFor } from './accountLinks';
// DIR-074: clean identity parsing (strips a parenthetical role from the name).
import { parseUserIdentity } from './userIdentity';

/**
 * Modern icon map for recruiter, enterprise, and platform admin navigation items.
 */
const ICON_MAP = {
    // Recruiter / Employer
    'employer-overview': FiGrid,
    'employer-jobs': FiBriefcase,
    'employer-applicants': FiUsers,
    'employer-messages': FiMessageSquare,
    'employer-company': FiHome,
    'employer-settings': FiSettings,

    // Platform Admin
    'admin-dashboard': FiActivity,
    'admin-health': FiHeart,
    'admin-queues': FiCpu,
    'admin-operations': FiSliders,
    'admin-attention': FiAlertTriangle,
    'admin-audit-logs': FiFileText,
    'admin-security': FiShield,
    'admin-help-desk': FiHelpCircle,
    'admin-users': FiUsers,
    'admin-operators': FiUserCheck,
    'admin-messages': FiSend,
    'admin-employer-applications': FiCheckSquare,
    'admin-jobs-manager': FiBriefcase,
    'admin-company-management': FiLayers,
    'admin-tenants': FiDatabase,
    'admin-blog-management': FiEdit3,
    'admin-landing-pages': FiLayout,
    'admin-reviews': FiStar,
    'admin-trustedby': FiAward,
    'admin-phrases': FiGlobe,
    'admin-settings': FiSettings,

    // Enterprise / Organization
    overview: FiActivity,
    resumes: FiFileText,
    members: FiUsers,
    teams: FiUsers,
    workspaces: FiSliders,
    access: FiShield,
    ai: FiZap,
    security: FiLock,
    usage: FiBarChart2,
    email: FiMail,
    audit: FiFileText,
    support: FiHelpCircle,
    settings: FiSettings,
// DIR-016: the platform provisioning tab needs a real icon. FiCommand is the
    // same glyph EnterpriseConsole.jsx already uses for this tab, so the Cuba
    // sidebar and the console's own rail stay visually identical for one module.
    platform: FiCommand,
};

/**
 * CubaPortalShell — the shared chrome for the recruiter, organization and admin
 * consoles (Phases 5–7).
 */
const CubaPortalShell = ({
    persona,
    navigation,
    navigationLabel,
    user,
    title,
    toolbar = null,
    // DIR-025: which portal's console this shell is wrapping. It selects the
    // account-menu target table in `accountLinks.js` — WITHOUT it this shell would
    // send an admin's "Security & MFA" into the candidate workspace. Defaults to
    // the candidate table, which is the only value that was correct before DIR-025.
    portal = ACCOUNT_PORTALS.CANDIDATE,
    // DIR-025: the server-resolved tenant slug, used only by the enterprise portal
    // to build its canonical `/org/<slug>/<tab>` targets.
    tenantSlug = '',
    // DIR-012: optional async entity-search provider for the shared palette.
    // Returns raw hits ({ id, label, group, to, ... }); the shell attaches the
    // router-aware `run` handler so navigation stays SPA-internal and consistent
    // with how it already handles navigation commands.
    commandSearchProvider = null,
    // DIR-021: which portal this shell is. The copilot resolves its
    // context-aware chips from this plus the real route, so a recruiter never
    // sees candidate resume actions.
    copilotPortal = null,
    // DIR-021: optional override of the copilot's AI entry point. Supplied by a
    // console only when it needs to ground the payload in its own real records
    // (as the recruiter/enterprise/admin consoles do not); otherwise the shell's
    // plain authenticated aiService caller is used.
    copilotDispatch: copilotDispatchOverride = null,
    children,
}) => {
    const location = useLocation();
    const routerNavigate = useNavigate();
    const aiStatus = useAiEngineStatus();
    const [theme, setTheme] = useState(() => {
        try {
            const saved = localStorage.getItem('cuba_theme') || localStorage.getItem('theme');
            if (saved === 'dark' || saved === 'light') return saved;
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch (_) {
            return 'light';
        }
    });

    const defaultNavLabel = useMemo(() => {
        if (navigationLabel) return navigationLabel;
        if (/recruiter|hiring|employer/i.test(persona || '')) return 'Employer navigation';
        if (/admin/i.test(persona || '')) return 'Platform admin navigation';
        if (/enterprise|organization/i.test(persona || '')) return 'Organization navigation';
        return 'Portal navigation';
    }, [navigationLabel, persona]);

    const groups = useMemo(() => navigation || [], [navigation]);

    const active = useMemo(
        () => resolveActiveItem(location.pathname, groups),
        [location.pathname, groups],
    );

    const decoratedGroups = useMemo(() => groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
            ...item,
            icon: item.icon || ICON_MAP[item.id] || FiGrid,
            href: item.href || item.to,
            active: active?.id === item.id,
        })),
    })), [groups, active]);

    // Commands are generated from the SAME navigation the sidebar renders, so a
    // palette entry can never point somewhere the sidebar does not (§25).
    //
    // The `run` handlers use react-router navigation exclusively (no full page
    // reload): the shell is mounted inside a <Router>, so internal targets stay
    // client-side. Anything that looks external is still assigned directly.
    const commands = useMemo(
        () => buildPortalCommands(groups, active?.label).map((command) => {
            const target = command.to || command.href;
            return {
                ...command,
                run: target ? () => {
                    if (/^(https?:)?\/\//i.test(String(target)) || String(target).startsWith('mailto:')) {
                        window.location.assign(target);
                    } else {
                        routerNavigate(target);
                    }
                } : undefined,
            };
        }),
        [groups, active, routerNavigate],
    );

    const navigate = useCallback((target) => {
        const to = typeof target === 'string' ? target : (target?.href || target?.to);
        if (!to) return;
        if (/^(https?:)?\/\//i.test(String(to)) || String(to).startsWith('mailto:')) {
            window.location.assign(to);
            return;
        }
        routerNavigate(to);
    }, [routerNavigate]);

    /**
     * DIR-012: normalises raw entity hits into runnable palette commands.
     *
     * The provider owns the DATA; the shell owns the NAVIGATION. Keeping the split
     * here means a portal can add a search source without re-implementing SPA-safe
     * routing, and it means a hit can never arrive without a `run` handler — the
     * palette already discards hits that lack one.
     *
     * A provider that throws is contained to an empty result set so a search
     * outage can never take down the navigation commands underneath it.
     */
    const entitySearch = useMemo(() => {
        if (typeof commandSearchProvider !== 'function') return null;
        return async (term) => {
            let raw;
            try {
                raw = await commandSearchProvider(term);
            } catch {
                return [];
            }
            if (!Array.isArray(raw)) return [];
            return raw
                .filter((hit) => hit && typeof hit === 'object' && typeof hit.to === 'string' && hit.to)
                .map((hit) => ({ ...hit, run: () => navigate(hit.to) }));
        };
    }, [commandSearchProvider, navigate]);

    const onToggleTheme = useCallback(
        () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
        [],
    );

    /**
     * DIR-011: the account chip must show the REAL authenticated identity.
     *
     * The recruiter console used to hardcode `user={{ name: 'Recruiter' }}` and the
     * organization console `user={{ name: tenantLabel }}`. Both are persona or
     * organization labels, not a person: the header therefore could not display an
     * email, and its "Sign out" control belonged to nobody in particular.
     *
     * Resolution order is deliberate and preserves every existing caller:
     *   1. Anything the caller explicitly passed wins (organization still supplies
     *      its tenant label, which it legitimately owns).
     *   2. Otherwise the session from AuthContext is used.
     * The merge means adding the real identity never removes information a portal
     * was already showing. Absent fields stay empty strings rather than becoming
     * invented placeholders (§40).
     */
    const session = useContext(AuthContext);

    const headerUser = useMemo(() => {
        const explicitName = String(user?.name || '').trim();
        const explicitEmail = String(user?.email || '').trim();

        const sessionName = String(session?.displayName || '').trim();
        const sessionEmail = String(session?.email || '').trim();
        const claimRole = String(
            user?.role
            || session?.role
            || session?.customClaims?.role
            || session?.customClaims?.accountType
            || '',
        ).trim();

        // DIR-074: split a parenthetical role out of the display name so the
        // account menu never renders 'Name (Role)'. The explicit claim stays
        // authoritative; the parenthetical is only a fallback.
        const identity = parseUserIdentity({
            name: explicitName || sessionName,
            email: explicitEmail || sessionEmail,
            role: claimRole,
        });
        const name = identity.name;
        const email = identity.email;
        const role = claimRole || identity.role;

        if (!name && !email) return null;
        // DIR-025: the account-menu targets are ROLE-SCOPED.
        //
        // This shell is the chrome behind the recruiter, organization AND platform
        // admin consoles, so defaulting all three to the candidate `/dashboard/*`
        // paths made an admin's "Security & MFA" navigate into a candidate
        // workspace. `accountLinksFor` is the single table that keeps every portal
        // on a route that is actually mounted, and it is the same table the
        // crawler and the unit tests assert against.
        const defaults = accountLinksFor(portal, { slug: tenantSlug });
        return {
            name,
            email,
            role,
            profileHref: user?.profileHref || defaults.profile,
            settingsHref: user?.settingsHref || defaults.settings,
            securityHref: user?.securityHref || defaults.security,
        };
    }, [user, session, portal, tenantSlug]);

    /** Sign-out delegates to the existing Firebase session; nothing is re-invented. */
    const onSignOut = useCallback(async () => {
        try {
            await fire.auth().signOut();
        } catch (error) {
            console.error('Sign out failed', error);
            return;
        }
        routerNavigate('/');
    }, [routerNavigate]);

    /**
     * DIR-021: the single authenticated AI entry point for the copilot.
     *
     * INV-2: `generateUserAiContent` is the SAME authenticated, same-origin
     * wrapper every other AI surface uses. It attaches the Firebase bearer token
     * and the active tenant header, and it is the only path the palette takes —
     * so a prompt can never reach a URL query, storage key or third party.
     *
     * INV-3: this wrapper does not reimplement quota. The server counts against
     * the authenticated user's MariaDB daily allowance and answers 429
     * `AI_DAILY_QUOTA_EXCEEDED`; that error propagates untouched to the palette,
     * which renders it. Nothing here counts, caches or predicts a balance.
     */
    const copilotDispatch = useCallback(
        (operation, payload) => generateUserAiContent(operation, payload),
        [],
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        try {
            localStorage.setItem('cuba_theme', theme);
        } catch (_) {}
    }, [theme]);

    return (
        <CubaAppShell
            navigation={decoratedGroups}
            navigationLabel={defaultNavLabel}
            onNavigate={navigate}
            breadcrumbs={[
                { label: persona },
                { label: active?.label || title },
            ]}
            theme={theme}
            onToggleTheme={onToggleTheme}
            aiStatus={aiStatus}
            commands={commands}
            commandSearchProvider={entitySearch}
            copilotPortal={copilotPortal}
            copilotDispatch={copilotPortal ? (copilotDispatchOverride || copilotDispatch) : null}
            toolbar={toolbar}
            user={headerUser}
            onSignOut={onSignOut}
        >
            <div className="container-fluid p-0 cuba-portal-stage flex-1 min-w-0">
                {children}
            </div>
        </CubaAppShell>
    );
};

export default CubaPortalShell;
