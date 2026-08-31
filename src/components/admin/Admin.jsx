import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from './sidebar/sidebar';
import './Admin.scss';
import Dashboard from './dashboard/dashboard';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
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
import { FaCircle, FaExternalLinkAlt, FaSignOutAlt, FaChevronRight, FaSyncAlt, FaCrown, FaBars } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import AdminReauthPrompt from './AdminReauthPrompt';

const AdminHeader = ({ userEmail, isSuperAdminUser, onLogout, onOpenCommandPalette, onToggleMobileNav }) => {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const currentTab = new URLSearchParams(location.search).get('tab');
    const [health, setHealth] = useState({ loading: true, reachable: false, db: 'MariaDB', auth: true });

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
                    {health.loading ? <FaSyncAlt className="animate-spin" aria-hidden="true" /> : <FaCircle className="h-1.5 w-1.5" aria-hidden="true" />}
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

                <div className="hidden border-l border-slate-200 pl-3 sm:block">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                        {isSuperAdminUser ? (
                            <span className="inline-flex items-center gap-1 text-purple-700 font-black">
                                <FaCrown className="text-amber-500 h-3 w-3" /> Super Admin
                            </span>
                        ) : (
                            'Platform Admin'
                        )}
                    </div>
                    <div className="max-w-48 truncate text-[10px] text-slate-500" title={userEmail}>{userEmail || 'Authenticated admin'}</div>
                </div>

                <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition" aria-label="Sign out of admin console">
                    <FaSignOutAlt aria-hidden="true" /><span className="hidden sm:inline">Sign out</span>
                </button>
            </div>
        </header>
    );
};

const Admin = () => {
    const [authState, setAuthState] = useState({ checking: true, allowed: false, isSuperAdmin: false, mfaVerified: false, mfaEnrolled: false, hasMfa: false, user: null, permissions: [], role: '' });
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('adminSidebarCollapsed') === 'true'; } catch { return false; }
    });

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
                    'system.config.read','system.config.write',
                    'payments.manage','payments.read',
                    'notifications.send','ai.entitlements.manage','ai.usage.read',
                    'audit.read','security.read','tickets.manage'])];
            } else if (tokenRole === 'AUDITOR') {
                permissions = [...new Set([...permissions,
                    'users.read','tenants.read','email.logs.read','system.config.read',
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

    // Client-side permission gating (UI only; backend is authoritative).
    const hasPerm = (p) => authState.isSuperAdmin || authState.permissions.includes('*') || authState.permissions.includes(p);
    const hasAnyPerm = (...ps) => ps.some(hasPerm);
    // Compute the first accessible tab for this role (used as redirect target when deep-link is forbidden).
    const FIRST_ACCESSIBLE_TAB = (() => {
        // Ordered by breadth: dashboard > users > help-desk > audit-logs for least-privilege.
        if (hasPerm('users.read')) return 'users';
        if (hasPerm('tickets.manage')) return 'help-desk';
        if (hasPerm('audit.read')) return 'audit-logs';
        return 'dashboard';
    })();
    const RequireTabPerm = ({ required, children }) => {
        if (!required) return children;
        const need = Array.isArray(required) ? required : [required];
        if (need.some((p) => p === '*' ? authState.isSuperAdmin : hasPerm(p))) return children;
        return <Navigate to={`/adm/${FIRST_ACCESSIBLE_TAB}`} replace />;
    };

    return (
        <AdminProvider value={{ isSuperAdmin: authState.isSuperAdmin, userEmail: authState.user?.email || '', uid: authState.user?.uid || '', hasMfa: authState.mfaVerified === true, mfaVerified: authState.mfaVerified === true, mfaEnrolled: authState.mfaEnrolled === true, permissions: authState.permissions, role: authState.role, hasPerm, hasAnyPerm }}>
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
                    onLogout={handleLogout}
                    onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                    onToggleMobileNav={() => setMobileNavOpen(true)}
                />
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
                            <RequireTabPerm required="users.roles.manage">
                                <PlatformOperators />
                            </RequireTabPerm>
                        } />
                        <Route path="settings" element={
                            <RequireTabPerm required={['system.config.read','system.config.write','payments.manage']}>
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

