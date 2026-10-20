import React, { useCallback, useEffect, useState, useRef } from 'react';
import { isCubaShellEnabled } from '../cuba/cubaShellFlag';

// Phase 7: Cuba admin chrome. Lazy so the default console never downloads it.
const AdminPortalCuba = React.lazy(() => import('./AdminPortalCuba'));
import Sidebar from './sidebar/sidebar';
import './Admin.scss';
import Dashboard from './dashboard/dashboard';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Settings from './settings/Settings';
import UserEdit from './userEdit/UserEdit';
import UsersManager from './usersManager/UsersManager';
import Phrases from './phrases/Phrases';
import Messages from './messages/Messages';
import HelpDesk from './HelpDesk';
import fire from '../../conf/fire';
import { checkIfAdmin } from '../../services/api/platform';
import signOutUser from '../../utils/signOut';
import Reviews from './reviews/Reviews';
import TrustedBy from './TrustedBy/TrustedBy';
import EmployerApplications from './employerApplications/EmployerApplications';
import JobsManager from './jobsManager/JobsManager';
import CompanyManagement from './companyManagement/CompanyManagement';
import BlogManagement from './blogManagement/BlogManagement';
import LandingPages from './landingPages/LandingPages';
import AdminAuditLogs from './audit/AdminAuditLogs';
import PlatformQueues from './queues/PlatformQueues';
import PlatformTenants from './tenants/PlatformTenants';
import PlatformSecurity from './security/PlatformSecurity';
import PlatformOperations from './operations/PlatformOperations';
import PlatformAttention from './attention/PlatformAttention';
import PlatformOperators from './operators/PlatformOperators';
import PlatformHealth from './health/PlatformHealth';
import AiSettings from './settings/AiSettings';
import AdminCommandPalette from './command/AdminCommandPalette';
import { AdminProvider } from './AdminContext';
import { FaCircle, FaExternalLinkAlt, FaSignOutAlt, FaChevronRight, FaSyncAlt, FaCrown, FaBars, FaChevronDown, FaCheck } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import AdminReauthPrompt from './AdminReauthPrompt';
import ContextSwitcher from '../common/ContextSwitcher';

const ROLE_DEFINITIONS = [
    { id: 'SUPER_ADMIN', label: 'Super Admin', icon: '👑', desc: 'Full authority across all 26 control modules' },
    { id: 'ADMIN', label: 'Admin', icon: '🛡️', desc: 'System & operations (without master overrides)' },
    { id: 'SUPPORT', label: 'Support', icon: '🎧', desc: 'Customer support, tickets & user accounts' },
    { id: 'AUDITOR', label: 'Auditor', icon: '📋', desc: 'Read-only compliance & audit inspections' },
    { id: 'USER', label: 'User', icon: '👤', desc: 'Standard candidate resume builder experience' }
];

const ENTERPRISE_ROLE_DEFINITIONS = [
    { id: 'ENTERPRISE_OWNER', label: 'Owner', icon: '👑', desc: 'Full tenant authority across all modules' },
    { id: 'ENTERPRISE_ADMIN', label: 'Admin', icon: '🛡️', desc: 'Tenant management, IAM, security & AI' },
    { id: 'ENTERPRISE_MANAGER', label: 'Manager', icon: '📋', desc: 'Workspaces, teams & talent assets' },
    { id: 'ENTERPRISE_MEMBER', label: 'Member', icon: '👥', desc: 'Talent drafting & AI generation' },
    { id: 'ENTERPRISE_VIEWER', label: 'Viewer', icon: '👁️', desc: 'Read-only candidate talent inspection' }
];

/**
 * DIR-012: resolves a Firebase ID token for the server-side audit write.
 *
 * WHY A FALLBACK EXISTS:
 *   `fire.auth().currentUser` is populated asynchronously by the Firebase SDK's
 *   persistence restore. The role-view switcher is reachable as soon as the console
 *   paints, which can be BEFORE that restore settles — `currentUser` is then null,
 *   `getIdToken()` yields undefined, and the audit POST was silently skipped. A
 *   Super Admin impersonation that leaves no row in `admin_audit_logs` is exactly
 *   the trail this feature exists to create, so the gap had to be closed.
 *
 * HOW THE FALLBACK WORKS (and why it is safe):
 *   The Firebase JS SDK persists the signed-in user in localStorage under
 *   `firebase:authUser:<apiKey>:[DEFAULT]`, with the current ID token in
 *   `stsTokenManager.accessToken`. That is the SAME token `getIdToken()` would
 *   return — it is not a second credential, a service key, or a decode of anything
 *   secret, so no new secret is introduced and nothing is logged. The SDK remains
 *   the source of truth; this only reads what the SDK already wrote, and only after
 *   the SDK has declined to answer. Anything unparseable resolves to null and the
 *   caller reports the miss rather than firing an unauthenticated request.
 */
const resolveAdminIdToken = async () => {
    try {
        const token = await fire?.auth?.()?.currentUser?.getIdToken();
        if (token) return token;
    } catch (_) { /* fall through to the persisted-session read */ }

    try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith('firebase:authUser:')) continue;
            const stored = JSON.parse(window.localStorage.getItem(key) || 'null');
            const accessToken = stored?.stsTokenManager?.accessToken;
            if (accessToken) return accessToken;
        }
    } catch (_) { /* unreadable or malformed storage is simply no token */ }

    return null;
};

/**
 * DIR-012: the glyph shown beside "Simulating console as <ROLE>".
 *
 * Sourced from the SAME definition tables the role switcher renders, so the banner
 * can never advertise a role the switcher does not offer, and the two can never
 * disagree. `SUPER_ADMIN` is never asked for (the banner only renders for a
 * non-null `viewAsRole`), so the fallback is deliberately neutral rather than the
 * 👑 crown: an unknown or future role must not be dressed as the Super Admin the
 * simulation exists to step outside of.
 */
const viewRoleIcon = (roleId) => (
    ROLE_DEFINITIONS.find((r) => r.id === roleId)
    || ENTERPRISE_ROLE_DEFINITIONS.find((r) => r.id === roleId)
)?.icon || '🎭';

/**
 * DIR-012 — the rendered refusal for a simulated role that satisfies NO tab.
 *
 * The console's redirect contract is "a denied tab lands on the first tab this
 * role can enter". `/admin/dashboard` was the only route of 23 mounted without a
 * `required` prop, so it silently doubled as the universal redirect target even
 * for roles that `PATH_PERMS` hides it from. Now that the dashboard is gated to
 * mirror `PATH_PERMS`, a role matching none of the branches below (the `USER`
 * role-view simulation holds only `profile.read` / `profile.update`) has nowhere
 * valid to land.
 *
 * Redirecting it anyway would bounce between two denied routes forever. Showing
 * this panel is the honest terminal state, it states plainly that the underlying
 * Super Admin session is untouched, and it never grants a capability (§7).
 */
const AdminNoAccessibleTab = ({ onReturnToSuperAdmin }) => (
    <div
        role="status"
        data-testid="admin-no-accessible-tab"
        className="cuba-glass-strong mx-auto max-w-2xl rounded-cuba-xl border border-cuba-line p-6"
    >
        <h2 className="mb-2 text-base font-bold text-cuba-ink">
            No control-plane tab is available to this role
        </h2>
        <p className="text-sm text-cuba-ink-muted">
            The role currently being simulated holds none of the permissions the Platform Admin console
            requires, so every tab is denied by <code className="font-semibold">RequireTabPerm</code>.
            Nothing was altered: the underlying Super Admin session keeps full authority and this view is
            a read-only simulation of another role.
        </p>
        {onReturnToSuperAdmin && (
            <button
                type="button"
                onClick={onReturnToSuperAdmin}
                data-testid="no-accessible-tab-return"
                className="cuba-btn-primary mt-4"
            >
                Return to Super Admin
            </button>
        )}
    </div>
);

const AdminHeader = ({ userEmail, isSuperAdminUser, viewAsRole, onSelectRole, onLogout, onOpenCommandPalette, onToggleMobileNav, embedded = false }) => {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const currentTab = new URLSearchParams(location.search).get('tab');
    const [health, setHealth] = useState({ loading: true, reachable: false, db: 'MariaDB', auth: true });
    const [roleMenuOpen, setRoleMenuOpen] = useState(false);
    const [availableTenants, setAvailableTenants] = useState([]);
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const roleMenuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (roleMenuRef.current && !roleMenuRef.current.contains(e.target)) {
                setRoleMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isSuperAdminUser) return;
        let isMounted = true;
        (async () => {
            try {
                const token = await fire?.auth?.().currentUser?.getIdToken();
                const headers = token ? { Authorization: `Bearer ${token}` } : {};
                const res = await fetch('/api/enterprise/tenants', { headers });
                const data = await res.json();
                if (isMounted && Array.isArray(data.tenants)) {
                    setAvailableTenants(data.tenants);
                    const savedTenant = sessionStorage.getItem('superadmin_enterprise_tenant');
                    if (savedTenant && data.tenants.some(t => t.id === savedTenant)) {
                        setSelectedTenantId(savedTenant);
                    } else if (data.tenants.length > 0) {
                        setSelectedTenantId(data.tenants[0].id);
                    }
                }
            } catch (_) {}
        })();
        return () => { isMounted = false; };
    }, [isSuperAdminUser]);

    const checkHealth = useCallback(async () => {
        setHealth(current => ({ ...current, loading: true }));
        try {
            const response = await fetch('/api/healthz', { cache: 'no-store' });
            const result = await response.json();
            const reachable = response.ok && result.status === 'ok';
            const authConfigured = Boolean(result.identityProviderConfigured ?? result.firebaseAdminConfigured);
            const dbEngine = result.authoritativeDatabase || 'MariaDB';
            setHealth({ loading: false, reachable, db: dbEngine, auth: authConfigured });
        } catch {
            setHealth({ loading: false, reachable: false, db: 'MariaDB', auth: false });
        }
    }, []);

    useEffect(() => { checkHealth(); }, [checkHealth]);
    const statusLabel = health.loading
        ? 'Checking platform health...'
        : !health.reachable
            ? 'API unavailable'
            : health.auth
                ? 'API & MariaDB Ready • Auth Active'
                : 'API & MariaDB Ready';
    const statusTone = health.loading
        ? 'bg-slate-100 text-slate-600 border-slate-200'
        : health.reachable
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs'
            : 'bg-rose-50 text-rose-800 border-rose-200';

    const roleButtonLabel = viewAsRole
        ? (viewAsRole.startsWith('ENTERPRISE_') ? `Ent. ${viewAsRole.replace('ENTERPRISE_', '')}` : viewAsRole)
        : 'Super Admin';

    // DIR-011 UNIVERSAL CHROME CONTRACT.
    // When the Cuba M3 AppHeader is mounted (the §49 flag on) it ALREADY owns the
    // breadcrumbs, the command search, the workspace switcher, the notification bell,
    // the account menu and sign-out. Rendering this toolbar again underneath it put
    // TWO <header> landmarks on /admin, so a screen-reader user was handed two
    // competing banner regions with no way to tell which was authoritative.
    //
    // In `embedded` mode the element therefore degrades from a landmark <header> to a
    // plain labelled group and keeps ONLY the controls the universal header genuinely
    // cannot provide: the admin backend health pill, the Super Admin role-view
    // switcher, and an explicit sign-out. No administrative capability is removed —
    // authorization still lives in `RequireTabPerm` and the backend policy (§7).
    const Wrapper = embedded ? 'div' : 'header';
    const wrapperA11y = embedded
        ? { role: 'group', 'aria-label': 'Platform admin session controls' }
        : {};

    return (
        <Wrapper
            {...wrapperA11y}
            className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-2xs backdrop-blur-md sm:px-6"
        >
            <div className="min-w-0">
                {!embedded && (
                <nav aria-label="Admin breadcrumbs" className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
                    <Link to="/admin/dashboard" className="font-bold hover:text-indigo-600">Admin Console</Link>
                    {pathSegments.slice(1).map((segment, index) => (
                        <React.Fragment key={`${segment}-${index}`}>
                            <FaChevronRight className="h-2.5 w-2.5 flex-none text-slate-300" aria-hidden="true" />
                            <span className="truncate font-extrabold capitalize text-slate-800">{currentTab ? currentTab.replace('Settings', '') : segment.replaceAll('-', ' ')}</span>
                        </React.Fragment>
                    ))}
                </nav>
                )}
                <button type="button" onClick={checkHealth} disabled={health.loading} className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${statusTone}`} aria-label={`${statusLabel}. Check again`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${health.reachable ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} aria-hidden="true" />
                    {statusLabel}
                </button>
            </div>

            {/* DIR-011: under the universal M3 chrome the workspace switcher (sidebar
                rail), the command palette and the account menu are already owned by
                CubaAppShell, so they are suppressed here to avoid two competing copies
                of the same control (§40: one owner per control). The health pill and
                the role view stay — the shell has no equivalent of either. */}
            {!embedded && (
                <>
                    <div className="hidden md:block md:w-56 lg:w-64">
                        <ContextSwitcher variant="header" />
                    </div>
                </>
            )}

            <div className="flex items-center gap-2 sm:gap-3">
                {!embedded && (
                <>
                <button type="button" onClick={onToggleMobileNav} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-700 lg:hidden" aria-label="Open admin navigation">
                    <FaBars />
                </button>
                <button
                    type="button"
                    onClick={onOpenCommandPalette}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition"
                    title="Open Command Palette (Ctrl+K)"
                >
                    <FiSearch className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Command Menu</span>
                    <kbd className="hidden md:inline text-[9px] bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-400 font-mono">⌘K</kbd>
                </button>
                </>
                )}

                <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition">
                    <FaExternalLinkAlt className="h-3 w-3" aria-hidden="true" /><span className="hidden sm:inline">Live site</span>
                </a>

                <div className="relative border-l border-slate-200 pl-3">
                    {isSuperAdminUser ? (
                        <div className="relative" ref={roleMenuRef}>
                            <button
                                type="button"
                                onClick={() => setRoleMenuOpen(prev => !prev)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                                    viewAsRole
                                        ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs'
                                        : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                                }`}
                                aria-haspopup="true"
                                aria-expanded={roleMenuOpen}
                                aria-label="Switch Dashboard Role View"
                                data-testid="role-switcher-button"
                            >
                                <FaCrown className="text-amber-500 h-3.5 w-3.5" />
                                <span className="truncate max-w-[130px] sm:max-w-none">
                                    {viewAsRole ? `Viewing: ${roleButtonLabel}` : 'Super Admin'}
                                </span>
                                <FaChevronDown className={`h-2 w-2 text-slate-500 transition-transform ${roleMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {roleMenuOpen && (
                                <div
                                    className="absolute right-0 mt-2 w-76 sm:w-80 max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100"
                                    role="menu"
                                    data-testid="role-switcher-dropdown"
                                >
                                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">View Dashboard As</p>
                                        <p className="text-xs font-bold text-slate-700 truncate">{userEmail}</p>
                                    </div>

                                    {/* Section 1: Platform Roles */}
                                    <div className="px-3 pt-1.5 pb-1">
                                        <span className="text-[9px] font-black tracking-wider uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                                            Platform Roles
                                        </span>
                                    </div>
                                    <div className="py-1 space-y-0.5">
                                        {ROLE_DEFINITIONS.map(r => {
                                            const isSelected = (viewAsRole || 'SUPER_ADMIN') === r.id;
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setRoleMenuOpen(false);
                                                        onSelectRole(r.id);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-indigo-50 text-indigo-950 font-black'
                                                            : 'text-slate-700 font-semibold hover:bg-slate-50'
                                                    }`}
                                                    role="menuitem"
                                                    data-testid={`role-option-${r.id.toLowerCase()}`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-sm">{r.icon}</span>
                                                        <div>
                                                            <div className="font-bold">{r.label}</div>
                                                            <div className="text-[10px] text-slate-400 font-normal leading-tight">{r.desc}</div>
                                                        </div>
                                                    </div>
                                                    {isSelected && <FaCheck className="h-3 w-3 text-indigo-600 flex-none" />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Section 2: Enterprise Organization Roles */}
                                    <div className="border-t border-slate-100 my-1 pt-2">
                                        <div className="px-3 pb-1.5 flex items-center justify-between">
                                            <span className="text-[9px] font-black tracking-wider uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                                                Enterprise Organization
                                            </span>
                                        </div>

                                        {availableTenants.length > 0 ? (
                                            <>
                                                <div className="px-3 py-1">
                                                    <label htmlFor="enterprise-org-select" className="sr-only">Select Enterprise Organization</label>
                                                    <select
                                                        id="enterprise-org-select"
                                                        value={selectedTenantId}
                                                        onChange={(e) => {
                                                            setSelectedTenantId(e.target.value);
                                                            sessionStorage.setItem('superadmin_enterprise_tenant', e.target.value);
                                                        }}
                                                        className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                                                        data-testid="enterprise-tenant-selector"
                                                    >
                                                        {availableTenants.map(t => (
                                                            <option key={t.id} value={t.id}>
                                                                {t.displayName || t.slug}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="py-1 space-y-0.5">
                                                    {ENTERPRISE_ROLE_DEFINITIONS.map(r => {
                                                        const isSelected = viewAsRole === r.id;
                                                        return (
                                                            <button
                                                                key={r.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setRoleMenuOpen(false);
                                                                    onSelectRole(r.id, selectedTenantId);
                                                                }}
                                                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition cursor-pointer ${
                                                                    isSelected
                                                                        ? 'bg-amber-50 text-amber-950 font-black'
                                                                        : 'text-slate-700 font-semibold hover:bg-slate-50'
                                                                }`}
                                                                role="menuitem"
                                                                data-testid={`enterprise-role-option-${r.id.toLowerCase()}`}
                                                            >
                                                                <div className="flex items-center gap-2.5">
                                                                    <span className="text-sm">{r.icon}</span>
                                                                    <div>
                                                                        <div className="font-bold">{r.label}</div>
                                                                        <div className="text-[10px] text-slate-400 font-normal leading-tight">{r.desc}</div>
                                                                    </div>
                                                                </div>
                                                                {isSelected && <FaCheck className="h-3 w-3 text-amber-600 flex-none" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="px-3 py-2 text-[11px] text-slate-400 italic">
                                                No enterprise organizations found in database.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className="text-xs font-extrabold text-slate-900">Platform Admin</div>
                            <div className="max-w-48 truncate text-[10px] text-slate-500" title={userEmail}>{userEmail || 'Authenticated admin'}</div>
                        </div>
                    )}
                </div>

                <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition" aria-label="Sign out of admin console">
                    <FaSignOutAlt aria-hidden="true" /><span className="hidden sm:inline">Sign out</span>
                </button>
            </div>
        </Wrapper>
    );
};

/**
 * The universal Cuba chrome (`isCubaChrome`) is received as a PROP, never re-read
 * from the flag module here.
 *
 * Why: `Admin` above decides which tree to mount from its own `cubaChrome` state.
 * If this component re-read `isCubaShellEnabled()` itself, the two could disagree
 * — the shell would be mounted while the inner console believed it was in legacy
 * mode (or the reverse) — and the console would then hide or double-render chrome
 * that the shell either already owns or never supplied. One source of truth: the
 * branch that mounted us.
 */
const AdminConsoleInner = ({ isCubaChrome = false }) => {
    const navigate = useNavigate();
    const [authState, setAuthState] = useState({ checking: true, allowed: false, isSuperAdmin: false, mfaVerified: false, mfaEnrolled: false, hasMfa: false, user: null, permissions: [], role: '' });
    const [viewAsRole, setViewAsRole] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = sessionStorage.getItem('superadmin_role_view');
            return stored && stored !== 'SUPER_ADMIN' ? stored : null;
        }
        return null;
    });
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('adminSidebarCollapsed') === 'true'; } catch { return false; }
    });

    const ROLE_PERMISSIONS = {
        SUPER_ADMIN: ['*'],
        ADMIN: [
            'users.read','users.create','users.update','users.delete','users.roles.manage',
            'tenants.read','tenants.write','tenants.manage',
            'email.template.manage','email.logs.read',
            'payments.manage','payments.read',
            'notifications.send','ai.entitlements.manage','ai.usage.read',
            'audit.read','security.read','tickets.manage'
        ],
        SUPPORT: ['users.read','email.logs.read','tenants.read','tickets.manage'],
        AUDITOR: ['users.read','tenants.read','email.logs.read','payments.read','ai.usage.read','audit.read','security.read'],
        USER: ['profile.read', 'profile.update']
    };

    const handleSetRoleView = async (targetRole, tenantId = null) => {
        if (!authState.isSuperAdmin) return;
        const normalized = targetRole === 'SUPER_ADMIN' ? null : targetRole;
        setViewAsRole(normalized);
        if (typeof window !== 'undefined') {
            if (normalized) {
                sessionStorage.setItem('superadmin_role_view', normalized);
                if (tenantId) {
                    sessionStorage.setItem('superadmin_enterprise_tenant', tenantId);
                }
            } else {
                sessionStorage.removeItem('superadmin_role_view');
                sessionStorage.removeItem('superadmin_enterprise_tenant');
            }
        }

        // Send auditable role-view switch to backend
        try {
            const token = await resolveAdminIdToken();
            if (token) {
                const auditPayload = { targetRole: targetRole || 'SUPER_ADMIN' };
                const activeTenant = tenantId || sessionStorage.getItem('superadmin_enterprise_tenant');
                if (normalized && normalized.startsWith('ENTERPRISE_') && activeTenant) {
                    auditPayload.tenantId = activeTenant;
                }
                await fetch('/api/platform/role-view-audit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(auditPayload)
                });
            } else {
                // Never silently skip the audit trail. A Super Admin changing their
                // view must always leave a row in MariaDB admin_audit_logs, so an
                // absent token is an explicit, visible failure rather than a
                // no-op that makes the action look as though it was recorded.
                console.warn('[Admin] Role view audit skipped: no ID token available');
            }
        } catch (err) {
            console.warn('[Admin] Role view audit log failed:', err.message);
        }

        if (targetRole === 'USER') {
            navigate('/dashboard?superadmin_view=1');
        } else if (normalized && normalized.startsWith('ENTERPRISE_')) {
            const activeTenant = tenantId || sessionStorage.getItem('superadmin_enterprise_tenant') || '';
            navigate(`/enterprise?tenant=${activeTenant}&superadmin_view=1`);
        } else if (normalized === 'SUPPORT') {
            navigate('/admin/users');
        } else if (normalized === 'AUDITOR') {
            navigate('/admin/audit-logs');
        } else {
            navigate('/admin/dashboard');
        }
    };

    // DIR-012: the single "leave the simulation" affordance shared by the role-view
    // banner and the no-accessible-tab refusal. Only offered to a real Super Admin —
    // `handleSetRoleView` already no-ops for anyone else, but rendering a button that
    // does nothing is worse than not rendering it.
    const onReturnToSuperAdmin = authState.isSuperAdmin ? () => handleSetRoleView('SUPER_ADMIN') : undefined;

    // DIR-011: the legacy Ctrl+K binding is registered ONLY in legacy mode.
    //
    // CubaAppShell owns the command palette and binds Ctrl+K / Cmd+K itself. If
    // this listener stayed mounted under Cuba chrome, one keystroke would open
    // TWO palettes (this one and the shell's), both calling preventDefault(), so
    // which surface won would depend on mount order rather than on intent.
    // Gating the listener keeps exactly one owner per shortcut (§25/§40).
    useEffect(() => {
        if (isCubaChrome) return undefined;
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCubaChrome]);

    useEffect(() => fire.auth().onAuthStateChanged(async user => {
        if (!user) {
            setAuthState({ checking: false, allowed: false, isSuperAdmin: false, mfaVerified: false, mfaEnrolled: false, hasMfa: false, user: null, permissions: [], role: '' });
            return;
        }
        let isSuperAdminUser = false;
        let mfaVerified = false;
        let mfaEnrolled = false;
        let token = null;
        let role = '';
        let permissions = [];
        try {
            token = await user.getIdTokenResult();
            const tokenRole = String(token?.claims?.role || '').toUpperCase();
            role = tokenRole;
            // Mirror backend/security/auth.js PERMISSIONS map client-side for UI gating only.
            // The server is the authoritative gate; this only controls visibility/redirect.
            permissions = Array.isArray(token?.claims?.permissions) ? token.claims.permissions : [];
            if (tokenRole === 'SUPER_ADMIN' || permissions.includes('*')) {
                isSuperAdminUser = true;
                permissions = ['*'];
            } else if (tokenRole === 'ADMIN') {
                permissions = [...new Set([...permissions,
                    'users.read','users.create','users.update','users.delete','users.roles.manage',
                    'tenants.read','tenants.write','tenants.manage',
                    'email.template.manage','email.logs.read',
                    'payments.manage','payments.read',
                    'notifications.send','ai.entitlements.manage','ai.usage.read',
                    'audit.read','security.read','tickets.manage'])];
            } else if (tokenRole === 'AUDITOR') {
                permissions = [...new Set([...permissions,
                    'users.read','tenants.read','email.logs.read',
                    'payments.read','ai.usage.read','audit.read','security.read'])];
            } else if (tokenRole === 'SUPPORT') {
                permissions = [...new Set([...permissions,
                    'users.read','email.logs.read','tenants.read','tickets.manage'])];
            }
            mfaVerified = Boolean(token?.claims?.firebase?.sign_in_second_factor || token?.claims?.sign_in_second_factor);
            mfaEnrolled = Array.isArray(user.multiFactor?.enrolledFactors) && user.multiFactor.enrolledFactors.length > 0;
        } catch {
            // Fail closed: an unreadable token means "not verified", never "verified".
            mfaVerified = false;
        }
        const claimsRole = String(token?.claims?.role || '').toUpperCase();
        const hasAdminClaim = ['ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'SUPPORT'].includes(claimsRole) || token?.claims?.admin === true || token?.claims?.superAdmin === true || token?.claims?.permissions?.includes('*');
        const allowed = hasAdminClaim || (await checkIfAdmin(user.uid));

        setAuthState({ checking: false, allowed, isSuperAdmin: isSuperAdminUser, mfaVerified, mfaEnrolled, hasMfa: mfaVerified, user, permissions, role });
    }), []);

    const handleLogout = async () => {
        try { await signOutUser(); } catch (error) { console.error('Sign out error', error); }
    };

    if (authState.checking) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 font-medium" role="status">Verifying administrator access…</div>;
    if (!authState.allowed) return <Navigate to={authState.user ? "/dashboard" : "/"} replace />;

    // Effective permissions and role based on Super Admin Role View Mode
    const effectiveIsSuperAdmin = authState.isSuperAdmin && (!viewAsRole || viewAsRole === 'SUPER_ADMIN');
    const effectiveRole = viewAsRole || authState.role;
    const effectivePermissions = effectiveIsSuperAdmin
        ? ['*']
        : (ROLE_PERMISSIONS[viewAsRole] || authState.permissions);

    // Client-side permission gating (UI simulation; backend is authoritative).
    const hasPerm = (p) => effectiveIsSuperAdmin || effectivePermissions.includes('*') || effectivePermissions.includes(p);
    const hasAnyPerm = (...ps) => ps.some(hasPerm);

    // Compute the first accessible tab for this role (used as redirect target when deep-link is forbidden).
    //
    // DIR-012: every branch below now returns a tab this role can ACTUALLY enter.
    // Before, the terminal fallback returned 'dashboard' — a route that rendered for
    // any admin because it was the single ungated `RequireTabPerm` in the table. Once
    // the dashboard is gated to mirror PATH_PERMS, that fallback would redirect a
    // role into a route that redirects straight back here: an infinite loop.
    // `null` is the honest answer when a role satisfies no tab at all, and every
    // consumer below turns it into a rendered refusal instead of a Navigate (§7).
    const FIRST_ACCESSIBLE_TAB = (() => {
        if (effectiveIsSuperAdmin) return 'dashboard';
        if (hasPerm('audit.read') && !hasPerm('system.config.write')) return 'audit-logs';
        if (hasPerm('tickets.manage') && !hasPerm('system.config.write')) return 'help-desk';
        if (hasPerm('users.read')) return 'users';
        if (hasPerm('audit.read')) return 'audit-logs';
        if (hasPerm('tickets.manage')) return 'help-desk';
        return null;
    })();
    const RequireTabPerm = ({ required, children }) => {
        if (!required) return children;
        const need = Array.isArray(required) ? required : [required];
        if (need.some((p) => p === '*' ? effectiveIsSuperAdmin : hasPerm(p))) return children;
        // Refuse in place when no tab is reachable: a redirect to a route this role
        // also cannot enter would bounce between two denials forever.
        if (!FIRST_ACCESSIBLE_TAB) return <AdminNoAccessibleTab onReturnToSuperAdmin={onReturnToSuperAdmin} />;
        return <Navigate to={`/admin/${FIRST_ACCESSIBLE_TAB}`} replace />;
    };

    return (
        <AdminProvider value={{
            isSuperAdmin: effectiveIsSuperAdmin,
            realIsSuperAdmin: authState.isSuperAdmin,
            viewAsRole,
            onSelectRole: handleSetRoleView,
            userEmail: authState.user?.email || '',
            uid: authState.user?.uid || '',
            hasMfa: authState.mfaVerified === true,
            mfaVerified: authState.mfaVerified === true,
            mfaEnrolled: authState.mfaEnrolled === true,
            permissions: effectivePermissions,
            role: effectiveRole,
            hasPerm,
            hasAnyPerm
        }}>
        <div className="admin min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* DIR-011: the legacy sidebar is NOT mounted under Cuba chrome.
                CubaAppShell already owns the single navigation rail, the collapse
                control and the command-palette trigger. Leaving this mounted meant a
                SECOND palette trigger in the DOM and a SECOND `getHealthIndicator()`
                poll (every 120s) running against the same backend. CSS alone cannot
                prevent either — `display:none` hides pixels, it does not unmount
                components or cancel their timers — so the duplicate work was real
                even though the duplicate was invisible. Matches the DIR-008 pattern
                in EnterpriseConsole.jsx. */}
            {!isCubaChrome && (
            <div className="admin__left">
                <Sidebar
                    onSidebarToggle={setSidebarCollapsed}
                    sidebarCollapsed={sidebarCollapsed}
                    mobileOpen={mobileNavOpen}
                    onCloseMobile={() => setMobileNavOpen(false)}
                    onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                />
            </div>
            )}
            <div className={`admin__right ${sidebarCollapsed ? 'admin__right--sidebar-collapsed' : ''} flex min-h-screen flex-col bg-slate-50`}>
                <AdminHeader
                    embedded={isCubaChrome}
                    userEmail={authState.user?.email}
                    isSuperAdminUser={authState.isSuperAdmin}
                    viewAsRole={viewAsRole}
                    onSelectRole={handleSetRoleView}
                    onLogout={handleLogout}
                    onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                    onToggleMobileNav={() => setMobileNavOpen(true)}
                />

                {/* Persistent Super Admin Role View Indicator Banner */}
                {viewAsRole && (
                    /* DIR-012 (was P1 + P2).
                     *
                     * STICKY OFFSET. This banner pinned itself to `top-[57px]`, a hardcoded
                     * guess made for the legacy toolbar. Under Cuba chrome — which is the
                     * DEFAULT shell (cubaShellFlag.js:47-51) — the M3 app bar is
                     * `sticky top-0 z-50` at exactly `var(--cuba-header-h)` = 68px, so the
                     * banner stuck 11px too high and slid underneath it, clipping its top
                     * border and text. In legacy mode 57px is equally wrong because
                     * `AdminHeader` is `flex-wrap` with a variable height. Reading the
                     * offset from the shell's own layout (rather than a literal) is the
                     * only value that is correct in both.
                     *
                     * ROLE ICON. Every simulated role used to wear the 👑 crown, so an
                     * AUDITOR or SUPPORT simulation announced itself as the Super Admin it
                     * was explicitly pretending NOT to be. The icon now comes from the same
                     * definition tables the switcher renders, with a neutral fallback.
                     *
                     * CONTRAST (DIR-012, found by measurement, not by inspection). This band
                     * is the one control that tells a Super Admin they are looking at a
                     * SIMULATED console, so its ink has to survive WCAG 2.1 AA. The live
                     * probe measured the old `from-amber-500 via-amber-600` ramp against
                     * white text at 2.15:1 and 3.19:1 — far below the 4.5:1 body-text floor,
                     * i.e. the most security-relevant sentence in the console was its least
                     * readable one. Darkening the ramp to `from-amber-700 via-amber-800`
                     * yields 5.02:1 at its lightest stop. The ramp is a theme scale step, not
                     * a new hex, so it still re-tunes with the theme (§ zero random colors).
                     */
                    <div
                        role="status"
                        aria-live="polite"
                        data-testid="role-view-active-banner"
                        data-role-view={viewAsRole}
                        style={{ top: isCubaChrome ? 'var(--cuba-header-h)' : 0 }}
                        className="sticky z-30 flex flex-wrap items-center justify-between gap-3 border-b border-amber-800 bg-linear-to-r from-amber-700 via-amber-800 to-amber-700 px-4 py-2.5 text-white shadow-sm sm:px-6"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold">
                            {/* The icon chip and the role badge both sit ON the gradient, so
                                their own contrast has to hold, not just the paragraph's.
                                `bg-white/20` over amber-500 was a 1.6:1 wash — decorative,
                                and it carried the only glyph identifying the simulated role.
                                `bg-black/25` instead darkens toward the ink, keeping the white
                                glyph at 7.0:1. */}
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/25 text-xs" aria-hidden="true">{viewRoleIcon(viewAsRole)}</span>
                            <span>
                                <strong>Super Admin Role View Mode:</strong> Simulating console as{' '}
                                <span className="rounded bg-black/25 px-2 py-0.5 font-black uppercase tracking-wider">{viewAsRole}</span>.
                                Underlying Super Admin identity &amp; database authority remain 100% active.
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onReturnToSuperAdmin}
                            disabled={!onReturnToSuperAdmin}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-black text-amber-950 transition hover:bg-amber-100 cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-70"
                            aria-label="Return to full Super Admin view"
                            data-testid="return-to-superadmin-button"
                        >
                            Return to Super Admin
                        </button>
                    </div>
                )}

                <AdminReauthPrompt />
                {/* DIR-012: the legacy palette owns the Ctrl+K shortcut AND the
                    `searchPlatform` entity search. Under Cuba chrome every one of its
                    three openers was already unmounted, so rendering it mounted a second
                    dialog that could never be opened, kept a stale permission filter
                    alive, and left its async search unreachable. It is now strictly the
                    flag-OFF fallback; Cuba chrome uses CubaAppShell's palette (below). */}
                {!isCubaChrome && (
                    <AdminCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
                )}
                {authState.isSuperAdmin && !authState.mfaVerified && (
                    <div role="status" data-testid="superadmin-mfa-banner" className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6">
                        {/* DIR-012 (P2): was raw Tailwind amber (`border-amber-300
                            bg-amber-50 text-amber-950`), i.e. magic hexes that ignore both
                            themes and cannot be re-tuned centrally. `--cuba-warning` on
                            `--cuba-warning-soft` measures 4.6:1 — AA body text in light and
                            dark — and it is the same token the rest of the console uses. */}
                        <div className="rounded-2xl border border-cuba-warning bg-cuba-warning-soft px-4 py-3 text-xs text-cuba-warning">
                            {authState.mfaEnrolled
                                ? <>This session is not MFA-verified, so Super Admin destructive operations are blocked. Sign out and sign in again, completing the authenticator challenge at the second-factor prompt.</>
                                : <>Super Admin destructive operations require TOTP MFA in production. Enroll a second factor in{' '}
                                    <a className="font-extrabold underline" href="/dashboard/settings">account settings</a>, then sign in again.</>}
                        </div>
                    </div>
                )}
                <div className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-6" tabIndex={-1}>
                    <Routes>
                        <Route path="/" element={FIRST_ACCESSIBLE_TAB
                            ? <Navigate to={FIRST_ACCESSIBLE_TAB} replace />
                            : <AdminNoAccessibleTab onReturnToSuperAdmin={onReturnToSuperAdmin} />}
                        />
                        {/* DIR-012 (P0): this was the ONLY route of 23 mounted without a
                            `required` prop, so it rendered for ANY admin role while
                            PATH_PERMS (sidebar.jsx:15) declares it needs
                            ['system.config.read','users.read','audit.read'] — the sidebar hid
                            Command Center from a SUPPORT/AUDITOR-shaped permission set but a
                            typed URL handed it over anyway. The backend policy engine still
                            denied the data, so this was a client-side authorization PARITY
                            break rather than an exfiltration hole; mirroring PATH_PERMS here
                            restores "zero ungated paths" without touching the gate's semantics. */}
                        <Route path="dashboard" element={
                            <RequireTabPerm required={['system.config.read', 'users.read', 'audit.read']}>
                                <Dashboard />
                            </RequireTabPerm>
                        } />
                        <Route path="audit-logs" element={
                            <RequireTabPerm required="audit.read">
                                <AdminAuditLogs />
                            </RequireTabPerm>
                        } />
                        <Route path="queues" element={
                            <RequireTabPerm required={['system.config.read','security.read']}>
                                <PlatformQueues />
                            </RequireTabPerm>
                        } />
                        <Route path="tenants" element={
                            <RequireTabPerm required="tenants.read">
                                <PlatformTenants />
                            </RequireTabPerm>
                        } />
                        <Route path="security" element={
                            <RequireTabPerm required={['security.read','system.config.read']}>
                                <PlatformSecurity />
                            </RequireTabPerm>
                        } />
                        <Route path="operations" element={
                            <RequireTabPerm required={['system.config.read','security.read']}>
                                <PlatformOperations />
                            </RequireTabPerm>
                        } />
                        <Route path="attention" element={
                            <RequireTabPerm required={['system.config.read','tickets.manage']}>
                                <PlatformAttention />
                            </RequireTabPerm>
                        } />
                        <Route path="health" element={
                            <RequireTabPerm required="security.read">
                                <PlatformHealth />
                            </RequireTabPerm>
                        } />
                        <Route path="operators" element={
                            <RequireTabPerm required="*">
                                <PlatformOperators />
                            </RequireTabPerm>
                        } />
                        <Route path="settings" element={
                            <RequireTabPerm required="*">
                                <Settings />
                            </RequireTabPerm>
                        } />
                        <Route path="ai-settings" element={
                            <RequireTabPerm required={['system.config.write', 'system.config.read']}>
                                <AiSettings />
                            </RequireTabPerm>
                        } />
                        <Route path="user/ss" element={
                            <RequireTabPerm required={['users.read','users.update']}>
                                <UserEdit />
                            </RequireTabPerm>
                        } />
                        <Route path="users" element={
                            <RequireTabPerm required="users.read">
                                <UsersManager />
                            </RequireTabPerm>
                        } />
                        <Route path="messages" element={
                            <RequireTabPerm required="notifications.send">
                                <Messages />
                            </RequireTabPerm>
                        } />
                        <Route path="help-desk" element={
                            <RequireTabPerm required={['tickets.manage','email.logs.read']}>
                                <HelpDesk />
                            </RequireTabPerm>
                        } />
                        <Route path="reviews" element={
                            <RequireTabPerm required="system.config.write">
                                <Reviews />
                            </RequireTabPerm>
                        } />
                        <Route path="trustedby" element={
                            <RequireTabPerm required="system.config.write">
                                <TrustedBy />
                            </RequireTabPerm>
                        } />
                        <Route path="employer-applications" element={
                            <RequireTabPerm required={['applications.review','users.read']}>
                                <EmployerApplications />
                            </RequireTabPerm>
                        } />
                        <Route path="jobs-manager" element={
                            <RequireTabPerm required={['jobs.manage','system.config.write']}>
                                <JobsManager />
                            </RequireTabPerm>
                        } />
                        <Route path="company-management" element={
                            <RequireTabPerm required={['jobs.manage','system.config.write']}>
                                <CompanyManagement />
                            </RequireTabPerm>
                        } />
                        <Route path="blog-management" element={
                            <RequireTabPerm required="system.config.write">
                                <BlogManagement />
                            </RequireTabPerm>
                        } />
                        <Route path="landing-pages" element={
                            <RequireTabPerm required="system.config.write">
                                <LandingPages />
                            </RequireTabPerm>
                        } />
                        <Route path="phrases" element={
                            <RequireTabPerm required="system.config.write">
                                <Phrases />
                            </RequireTabPerm>
                        } />
                        <Route path="*" element={FIRST_ACCESSIBLE_TAB
                            ? <Navigate to={FIRST_ACCESSIBLE_TAB} replace />
                            : <AdminNoAccessibleTab onReturnToSuperAdmin={onReturnToSuperAdmin} />}
                        />
                    </Routes>
                </div>
            </div>
        </div>
        </AdminProvider>
    );
};

/**
 * Platform Admin entry point.
 *
 * Phase 7 rollout switch (§49). `AdminConsoleInner` is the entire existing
 * console — the MFA gate, the Super Admin role-view banner, `RequireTabPerm` on
 * every tab, the settings detection and every `/api/admin/*` call. It is mounted
 * unchanged in both branches, so no administrative capability is ever
 * conditional on the Cuba flag.
 *
 * Authorization is untouched: route gating stays in `src/main.jsx`, tab gating
 * stays in `RequireTabPerm`, and the authoritative decision stays in
 * `backend/security/policy.js`. This wrapper decides nothing (§7).
 */
const Admin = () => {
  const [cubaChrome, setCubaChrome] = React.useState(() => isCubaShellEnabled());

  React.useEffect(() => { setCubaChrome(isCubaShellEnabled()); }, []);

  return cubaChrome ? (
    <React.Suspense fallback={<div className="min-h-screen bg-cuba-canvas" aria-busy="true" />}>
      <AdminPortalCuba>
        <AdminConsoleInner isCubaChrome />
      </AdminPortalCuba>
    </React.Suspense>
  ) : (
    <AdminConsoleInner />
  );
};

export default Admin;

