import React, { useContext, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiBriefcase, FiUsers, FiMessageSquare, FiSettings, FiLogOut, FiX, FiGrid } from 'react-icons/fi';
import { FaCrown, FaBuilding } from 'react-icons/fa';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import logo from '../../assets/logo/logo.png';
import { AuthContext } from '../../context/AuthContext';
import signOutUser from '../../utils/signOut';
import ContextSwitcher from '../common/ContextSwitcher';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { resolveMessagesVisibility } from '../../utils/moduleFlags';
import { getSystemSettings } from '../../services/api/platform';

// DIR-026 / AC-2 & AC-3: the recruiter's Candidate Messages entry carries the same
// live unread total as the candidate shell — it is the SAME conversation list read
// through the SAME owner-scoped endpoint, so the two surfaces can never disagree.
//
// The navigation model itself stays a frozen module-level export (several tests
// and the link crawler import `EMPLOYER_NAV` directly), so the module gate is
// applied to the projected groups at render time rather than by mutating the
// shared constant. Gating here rather than in the constant means the crawler
// still sees the route (it exists), while a disabled module is never linked.
export const EMPLOYER_MESSAGES_PATH = '/employer/messages';

/**
 * Project the recruiter navigation through the administrator's module flag and
 * the live unread count. Pure and framework-free so it can be asserted in Node.
 */
export function buildEmployerNavGroups(groups, { messagesAllowed, unreadCount = 0, unreadStatus = 'ready' } = {}) {
    // An unread read that failed must not render as "0 / all clear" (see the
    // hook's fail-visible contract); '!' is the honest "status unknown" state.
    const badge = unreadStatus === 'error' ? '!' : unreadCount > 0 ? String(unreadCount) : null;
    return groups
        .map((group) => ({
            ...group,
            items: group.items
                .filter((item) => item.path !== EMPLOYER_MESSAGES_PATH || messagesAllowed !== false)
                .map((item) => (item.path === EMPLOYER_MESSAGES_PATH && badge ? { ...item, badge } : item)),
        }))
        .filter((group) => group.items.length > 0);
}

// Employer portal information architecture. Recruiter capability is deliberately
// separate from the candidate sidebar: there are no resume-builder or admin
// control-plane entries here, and no candidate-only asset links.
export const EMPLOYER_NAV = [
    {
        group: 'HIRING COMMAND',
        items: [
            { label: 'Recruiter Overview', path: '/employer', icon: FiGrid, exact: true },
        ],
    },
    {
        group: 'REQUISITIONS & APPLICANTS',
        items: [
            { label: 'Job Postings', path: '/employer/jobs', icon: FiBriefcase },
            { label: 'Applicant ATS Pipeline', path: '/employer/applicants', icon: FiUsers },
            { label: 'Candidate Messages', path: '/employer/messages', icon: FiMessageSquare },
        ],
    },
    {
        group: 'BRAND & SETTINGS',
        items: [
            { label: 'Company Profile', path: '/employer/company', icon: FaBuilding },
            { label: 'Hiring Preferences', path: '/employer/settings', icon: FiSettings },
        ],
    },
];

export const EMPLOYER_NAV_PATHS = EMPLOYER_NAV.flatMap(group => group.items.map(item => item.path));


const EmployerNavList = ({ isActive, onNavigate, label, groups }) => {
    return (
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label={label}>
            {groups.map((group) => (
                <div key={group.group}>
                    <p className="px-2 mb-1 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">
                        {group.group}
                    </p>
                    <ul className="space-y-0.5 list-none p-0 m-0">
                        {group.items.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path, item.exact);
                            return (
                                <li key={item.path}>
                                    <Link
                                        to={item.path}
                                        onClick={onNavigate}
                                        aria-current={active ? 'page' : undefined}
                                    >
                                        <div className={`flex items-center text-xs transition-all duration-150 rounded-xl ${active ? 'cuba-fill-pill cuba-focusable font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'} px-2.5 py-2`}>
                                            <Icon className="text-base min-w-[18px] mr-2.5" aria-hidden="true" />
                                            <span className="flex-1 truncate">{item.label}</span>
                                            {/* DIR-026 / AC-2: the live unread total, on the
                                                audited badge token pair so AA contrast
                                                holds in both themes (INV-4). */}
                                            {item.badge && (
                                                <span
                                                    data-testid="employer-messages-badge"
                                                    className="ml-2 inline-flex h-4 min-w-[18px] flex-none items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none"
                                                    style={{
                                                        backgroundColor: 'var(--cuba-header-badge-fill)',
                                                        color: 'var(--cuba-header-badge-ink)',
                                                    }}
                                                >
                                                    {item.badge}
                                                    <span className="cuba-sr-only">
                                                        {item.badge === '!' ? 'unread status unavailable' : 'unread messages'}
                                                    </span>
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );
};

const PortalUtilities = ({ collapsed, onNavigate, isAdmin, onLogout }) => {
    return (
        <div className="px-2 py-2 border-t border-slate-100 space-y-0.5">
            {!collapsed && (
                <div className="mb-2 px-0.5">
                    <ContextSwitcher variant="sidebar" onNavigate={onNavigate} />
                </div>
            )}
            <Link to="/dashboard" onClick={onNavigate}>
                <div className={`flex items-center text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium rounded-xl transition-all ${collapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                    <FiHome className="text-base min-w-[18px] mr-2.5" aria-hidden="true" />
                    <span className="truncate">Candidate Dashboard</span>
                </div>
            </Link>
            {isAdmin && (
                <Link to="/admin" onClick={onNavigate}>
                    <div className={`flex items-center text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium rounded-xl transition-all ${collapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                        <FaCrown className="text-base min-w-[18px] mr-2.5" aria-hidden="true" />
                        <span className="truncate">Admin Console</span>
                    </div>
                </Link>
            )}
            <button
                type="button"
                onClick={onLogout}
                className={`w-full flex items-center text-xs text-rose-600 hover:bg-rose-50 font-medium rounded-xl transition-all ${collapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}
            >
                <FiLogOut className="text-base min-w-[18px] mr-2.5" aria-hidden="true" />
                <span className="truncate">Sign Out</span>
            </button>
        </div>
    );
};



const EmployerSidebar = ({ sidebarCollapsed, onSidebarToggle, mobileMenuOpen, onCloseMobile }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const authUser = useContext(AuthContext);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let active = true;
        if (!authUser?.getIdTokenResult) { setIsAdmin(false); return () => { active = false; }; }
        authUser.getIdTokenResult().then(result => {
            if (active) setIsAdmin(['ADMIN', 'SUPER_ADMIN'].includes(String(result.claims.role || '').toUpperCase()));
        }).catch(() => { if (active) setIsAdmin(false); });
        return () => { active = false; };
    }, [authUser]);

    const isActive = (path, exact) => {
        if (exact) return location.pathname === path;
        return location.pathname === path || location.pathname.startsWith(path + '/');
    };

    // DIR-026 / AC-3 + AC-2: one authoritative module flag and one live unread
    // total, projected into every sidebar variant below (expanded desktop,
    // collapsed icon rail and mobile drawer) so the recruiter can never see a
    // contradictory count or a link to a disabled surface.
    const [messagesAllowed, setMessagesAllowed] = useState(undefined);
    useEffect(() => {
        let cancelled = false;
        getSystemSettings()
            .then((settings) => { if (!cancelled) setMessagesAllowed(resolveMessagesVisibility(settings) === true); })
            .catch(() => { if (!cancelled) setMessagesAllowed(false); });
        return () => { cancelled = true; };
    }, []);

    const { unreadCount: unreadMessages, status: unreadStatus } = useUnreadMessages();
    const navGroups = buildEmployerNavGroups(EMPLOYER_NAV, {
        messagesAllowed,
        unreadCount: unreadMessages,
        unreadStatus,
    });

    const handleLogout = async () => {
        await signOutUser();
        navigate('/');
    };


    return (
        <>
            <aside
                className={`employerSidebar employerDesktopSidebar hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 shrink-0 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
                aria-label="Employer sidebar"
            >
                <div className="flex items-center gap-2 px-3 py-4 border-b border-slate-100">
                    <Link to="/employer" className="flex items-center gap-2 min-w-0 flex-1">
                        <img src={logo} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
                        {!sidebarCollapsed && (
                            <span className="flex flex-col min-w-0">
                                <span className="text-sm font-extrabold text-slate-900 truncate">IME365</span>
                                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Hiring Portal</span>
                            </span>
                        )}
                    </Link>
                    {!sidebarCollapsed && (
                        <button
                            type="button"
                            onClick={onSidebarToggle}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                            aria-label="Collapse sidebar"
                        >
                            <GoSidebarCollapse className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {sidebarCollapsed ? (
                    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Employer navigation icons">
                        <ul className="space-y-1 list-none p-0 m-0">
                            {navGroups.flatMap(g => g.items).map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.path, item.exact);
                                return (
                                    <li key={item.path}>
                                        <Link to={item.path} title={item.label} aria-label={item.badge ? `${item.label}, ${item.badge === '!' ? 'unread status unavailable' : `${item.badge} unread`}` : item.label} aria-current={active ? 'page' : undefined}>
                                            <span className={`flex items-center justify-center p-2.5 rounded-xl transition-all ${active ? 'cuba-fill-pill' : 'text-slate-500 hover:bg-slate-100'}`}>
                                                <Icon className="text-base" aria-hidden="true" />
                                                {item.badge && (
                                                    <span
                                                        data-testid="employer-messages-badge"
                                                        className="absolute ml-4 -mt-4 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                                                        style={{
                                                            backgroundColor: 'var(--cuba-header-badge-fill)',
                                                            color: 'var(--cuba-header-badge-ink)',
                                                        }}
                                                    >
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                ) : (
                    <EmployerNavList isActive={isActive} onNavigate={undefined} label="Employer navigation" groups={navGroups} />
                )}

                <PortalUtilities collapsed={sidebarCollapsed} onNavigate={undefined} isAdmin={isAdmin} onLogout={handleLogout} />

                {sidebarCollapsed && (
                    <div className="px-2 py-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onSidebarToggle}
                            className="w-full p-2 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"
                            aria-label="Expand sidebar"
                        >
                            <GoSidebarExpand className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </aside>

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />
            )}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 shadow-xl transform transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
                aria-label="Mobile employer sidebar"
                aria-hidden={mobileMenuOpen ? undefined : 'true'}
            >
                <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
                    <span className="text-sm font-bold text-slate-800">Hiring Portal</span>
                    <button
                        type="button"
                        onClick={onCloseMobile}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                        aria-label="Close navigation"
                    >
                        <FiX className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex flex-col h-[calc(100%-57px)]">
                    <EmployerNavList isActive={isActive} onNavigate={onCloseMobile} label="Mobile employer navigation" groups={navGroups} />
                    <PortalUtilities collapsed={false} onNavigate={onCloseMobile} isAdmin={isAdmin} onLogout={handleLogout} />
                </div>
            </aside>
        </>
    );
};

export default EmployerSidebar;
