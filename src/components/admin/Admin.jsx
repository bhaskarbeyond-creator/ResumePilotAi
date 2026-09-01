import React, { useCallback, useEffect, useState, useRef } from 'react';
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
import AdminCommandPalette from './command/AdminCommandPalette';
import { AdminProvider } from './AdminContext';
import { FaCircle, FaExternalLinkAlt, FaSignOutAlt, FaChevronRight, FaSyncAlt, FaCrown, FaBars, FaChevronDown, FaCheck } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import AdminReauthPrompt from './AdminReauthPrompt';

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

const AdminHeader = ({ userEmail, isSuperAdminUser, viewAsRole, onSelectRole, onLogout, onOpenCommandPalette, onToggleMobileNav }) => {
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

    return (
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-2xs backdrop-blur-md sm:px-6">
            <div className="min-w-0">
                <nav aria-label="Admin breadcrumbs" className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-500">
                    <Link to="/adm/dashboard" className="font-bold hover:text-indigo-600">Admin Console</Link>
                    {pathSegments.slice(1).map((segment, index) => (
                        <React.Fragment key={`${segment}-${index}`}>
                            <FaChevronRight className="h-2.5 w-2.5 flex-none text-slate-300" aria-hidden="true" />
                            <span className="truncate font-extrabold capitalize text-slate-800">{currentTab ? currentTab.replace('Settings', '') : segment.replaceAll('-', ' ')}</span>
                        </React.Fragment>
                    ))}
                </nav>
                <button type="button" onClick={checkHealth} disabled={health.loading} className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${statusTone}`} aria-label={`${statusLabel}. Check again`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${health.reachable ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} aria-hidden="true" />
                    {statusLabel}
                </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
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
        </header>
    );
};

const Admin = () => {
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
            const token = await fire.auth().currentUser?.getIdToken();
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
            navigate('/adm/users');
        } else if (normalized === 'AUDITOR') {
            navigate('/adm/audit-logs');
        } else {
            navigate('/adm/dashboard');
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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
    const FIRST_ACCESSIBLE_TAB = (() => {
        if (effectiveIsSuperAdmin) return 'dashboard';
        if (hasPerm('audit.read') && !hasPerm('system.config.write')) return 'audit-logs';
        if (hasPerm('tickets.manage') && !hasPerm('system.config.write')) return 'help-desk';
        if (hasPerm('users.read')) return 'users';
        if (hasPerm('audit.read')) return 'audit-logs';
        if (hasPerm('tickets.manage')) return 'help-desk';
        return 'dashboard';
    })();
    const RequireTabPerm = ({ required, children }) => {
        if (!required) return children;
        const need = Array.isArray(required) ? required : [required];
        if (need.some((p) => p === '*' ? effectiveIsSuperAdmin : hasPerm(p))) return children;
        return <Navigate to={`/adm/${FIRST_ACCESSIBLE_TAB}`} replace />;
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
            <div className="admin__left">
                <Sidebar
                    onSidebarToggle={setSidebarCollapsed}
                    sidebarCollapsed={sidebarCollapsed}
                    mobileOpen={mobileNavOpen}
                    onCloseMobile={() => setMobileNavOpen(false)}
                    onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                />
            </div>
            <div className={`admin__right ${sidebarCollapsed ? 'admin__right--sidebar-collapsed' : ''} flex min-h-screen flex-col bg-slate-50`}>
                <AdminHeader
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
                    <div role="status" aria-live="polite" data-testid="role-view-active-banner" className="sticky top-[57px] z-30 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-linear-to-r from-amber-500 via-amber-600 to-amber-500 px-4 py-2.5 text-white shadow-sm sm:px-6">
                        <div className="flex items-center gap-2 text-xs font-bold">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">👑</span>
                            <span>
                                <strong>Super Admin Role View Mode:</strong> Simulating console as{' '}
                                <span className="rounded bg-white/25 px-2 py-0.5 font-black uppercase tracking-wider">{viewAsRole}</span>.
                                Underlying Super Admin identity & database authority remain 100% active.
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleSetRoleView('SUPER_ADMIN')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-black text-amber-900 transition hover:bg-amber-50 cursor-pointer shadow-xs"
                            aria-label="Return to full Super Admin view"
                            data-testid="return-to-superadmin-button"
                        >
                            Return to Super Admin
                        </button>
                    </div>
                )}

                <AdminReauthPrompt />
                <AdminCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
                {authState.isSuperAdmin && !authState.mfaVerified && (
                    <div role="status" data-testid="superadmin-mfa-banner" className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6">
                        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                            {authState.mfaEnrolled
                                ? <>This session is not MFA-verified, so Super Admin destructive operations are blocked. Sign out and sign in again, completing the authenticator challenge at the second-factor prompt.</>
                                : <>Super Admin destructive operations require TOTP MFA in production. Enroll a second factor in{' '}
                                    <a className="font-extrabold underline" href="/dashboard/settings">account settings</a>, then sign in again.</>}
                        </div>
                    </div>
                )}
                <div className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-6" tabIndex={-1}>
                    <Routes>
                        <Route path="/" element={<Navigate to={FIRST_ACCESSIBLE_TAB} replace />} />
                        <Route path="dashboard" element={
                            <RequireTabPerm>
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
                        <Route path="*" element={<Navigate to={FIRST_ACCESSIBLE_TAB} replace />} />
                    </Routes>
                </div>
            </div>
        </div>
        </AdminProvider>
    );
};

export default Admin;

