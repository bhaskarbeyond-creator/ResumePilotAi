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
import { FaCircle, FaExternalLinkAlt, FaSignOutAlt, FaChevronRight, FaSyncAlt } from 'react-icons/fa';

const AdminHeader = ({ userEmail, onLogout }) => {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const currentTab = new URLSearchParams(location.search).get('tab');
    const [health, setHealth] = useState({ loading: true, reachable: false, firebase: false });

    const checkHealth = useCallback(async () => {
        setHealth(current => ({ ...current, loading: true }));
        try {
            const response = await fetch('/healthz', { cache: 'no-store' });
            const result = await response.json();
            setHealth({ loading: false, reachable: response.ok && result.status === 'ok', firebase: Boolean(result.firebaseAdminConfigured) });
        } catch {
            setHealth({ loading: false, reachable: false, firebase: false });
        }
    }, []);

    useEffect(() => { checkHealth(); }, [checkHealth]);
    const statusLabel = health.loading ? 'Checking services' : !health.reachable ? 'API unavailable' : health.firebase ? 'API and Firebase ready' : 'API ready; Firebase unavailable';
    const statusTone = health.loading ? 'bg-slate-100 text-slate-600 border-slate-200' : health.reachable && health.firebase ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200';

    return (
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
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
                <button type="button" onClick={checkHealth} disabled={health.loading} className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${statusTone}`} aria-label={`${statusLabel}. Check again`}>
                    {health.loading ? <FaSyncAlt className="animate-spin" aria-hidden="true" /> : <FaCircle className="h-1.5 w-1.5" aria-hidden="true" />}
                    {statusLabel}
                </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
                <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
                    <FaExternalLinkAlt className="h-3 w-3" aria-hidden="true" /><span className="hidden sm:inline">Live site</span>
                </a>
                <div className="hidden border-l border-slate-200 pl-3 sm:block">
                    <div className="text-xs font-extrabold text-slate-900">Administrator</div>
                    <div className="max-w-48 truncate text-[10px] text-slate-500" title={userEmail}>{userEmail || 'Authenticated admin'}</div>
                </div>
                <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" aria-label="Sign out of admin console">
                    <FaSignOutAlt aria-hidden="true" /><span className="hidden sm:inline">Sign out</span>
                </button>
            </div>
        </header>
    );
};

const Admin = () => {
    const [authState, setAuthState] = useState({ checking: true, allowed: false, user: null });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('adminSidebarCollapsed') === 'true'; } catch { return false; }
    });

    useEffect(() => fire.auth().onAuthStateChanged(async user => {
        if (!user) {
            setAuthState({ checking: false, allowed: false, user: null });
            return;
        }
        const allowed = await checkIfAdmin(user.uid);
        setAuthState({ checking: false, allowed, user });
    }), []);

    const handleLogout = async () => {
        try { await signOutUser(); } catch (error) { console.error('Sign out error', error); }
    };

    if (authState.checking) return <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status">Verifying administrator access…</div>;
    if (!authState.allowed) return <Navigate to="/" replace />;

    return (
        <div className="admin min-h-screen bg-slate-50 font-sans text-slate-900">
            <div className="admin__left">
                <Sidebar onSidebarToggle={setSidebarCollapsed} sidebarCollapsed={sidebarCollapsed} />
            </div>
            <div className={`admin__right ${sidebarCollapsed ? 'admin__right--sidebar-collapsed' : ''} flex min-h-screen flex-col bg-slate-50`}>
                <AdminHeader userEmail={authState.user?.email} onLogout={handleLogout} />
                <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-6">
                    <Routes>
                        <Route path="/" element={<Navigate to="dashboard" replace />} />
                        <Route path="dashboard" element={<Dashboard />} />
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
    );
};

export default Admin;
