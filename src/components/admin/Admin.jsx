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
import fire from '../../conf/fire';
import { checkIfAdmin } from '../../firestore/dbOperations';
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
import AdminCommandPalette from './command/AdminCommandPalette';
import { AdminProvider } from './AdminContext';
import { FaCircle, FaExternalLinkAlt, FaSignOutAlt, FaChevronRight, FaSyncAlt, FaCrown, FaBars } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import AdminReauthPrompt from './AdminReauthPrompt';

const AdminHeader = ({ userEmail, isSuperAdminUser, onLogout, onOpenCommandPalette, onToggleMobileNav }) => {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const currentTab = new URLSearchParams(location.search).get('tab');
    const [health, setHealth] = useState({ loading: true, reachable: false, firebase: false });

    const checkHealth = useCallback(async () => {
        setHealth(current => ({ ...current, loading: true }));
        try {
            const response = await fetch('/api/healthz', { cache: 'no-store' });
            const result = await response.json();
            setHealth({ loading: false, reachable: response.ok && result.status === 'ok', firebase: Boolean(result.firebaseAdminConfigured) });
        } catch {
            setHealth({ loading: false, reachable: false, firebase: false });
        }
    }, []);

    useEffect(() => { checkHealth(); }, [checkHealth]);
    const statusLabel = health.loading ? 'Checking services' : !health.reachable ? 'API unavailable' : health.firebase ? 'API & Firebase ready' : 'API ready; Firebase offline';
    const statusTone = health.loading ? 'bg-slate-100 text-slate-600 border-slate-200' : health.reachable && health.firebase ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200';

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
                            'Administrator'
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
    const [authState, setAuthState] = useState({ checking: true, allowed: false, isSuperAdmin: false, user: null });
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
            setAuthState({ checking: false, allowed: false, isSuperAdmin: false, user: null });
            return;
        }
        const allowed = await checkIfAdmin(user.uid);
        let isSuperAdminUser = false;
        try {
            const token = await user.getIdTokenResult();
            isSuperAdminUser = String(token.claims?.role || '').toUpperCase() === 'SUPER_ADMIN' || token.claims?.permissions?.includes('*');
        } catch { /* ignore */ }
        setAuthState({ checking: false, allowed, isSuperAdmin: isSuperAdminUser, user });
    }), []);

    const handleLogout = async () => {
        try { await signOutUser(); } catch (error) { console.error('Sign out error', error); }
    };

    if (authState.checking) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 font-medium" role="status">Verifying administrator access…</div>;
    if (!authState.allowed) return <Navigate to="/" replace />;

    return (
        <AdminProvider value={{ isSuperAdmin: authState.isSuperAdmin, userEmail: authState.user?.email || '', uid: authState.user?.uid || '' }}>
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
                <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-6">
                    <Routes>
                        <Route path="/" element={<Navigate to="dashboard" replace />} />
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="audit-logs" element={<AdminAuditLogs />} />
                        <Route path="queues" element={<PlatformQueues />} />
                        <Route path="tenants" element={<PlatformTenants />} />
                        <Route path="security" element={<PlatformSecurity />} />
                        <Route path="operations" element={<PlatformOperations />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="user/ss" element={<UserEdit />} />
                        <Route path="users" element={<UsersManager />} />
                        <Route path="messages" element={<Messages />} />
                        <Route path="reviews" element={<Reviews />} />
                        <Route path="trustedby" element={<TrustedBy />} />
                        <Route path="employer-applications" element={<EmployerApplications />} />
                        <Route path="jobs-manager" element={<JobsManager />} />
                        <Route path="company-management" element={<CompanyManagement />} />
                        <Route path="blog-management" element={<BlogManagement />} />
                        <Route path="landing-pages" element={<LandingPages />} />
                        <Route path="phrases" element={<Phrases />} />
                        <Route path="*" element={<Navigate to="dashboard" replace />} />
                    </Routes>
                </main>
            </div>
        </div>
        </AdminProvider>
    );
};

export default Admin;

