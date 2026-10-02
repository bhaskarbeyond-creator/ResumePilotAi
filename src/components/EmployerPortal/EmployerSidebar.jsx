import React, { useContext, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiBriefcase, FiUsers, FiMessageSquare, FiSettings, FiLogOut, FiX, FiGrid } from 'react-icons/fi';
import { FaCrown, FaBuilding } from 'react-icons/fa';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import logo from '../../assets/logo/logo.png';
import { AuthContext } from '../../context/AuthContext';
import signOutUser from '../../utils/signOut';
import ContextSwitcher from '../common/ContextSwitcher';

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


const EmployerNavList = ({ isActive, onNavigate, label }) => {
    return (
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label={label}>
            {EMPLOYER_NAV.map((group) => (
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
                                        <div className={`flex items-center text-xs transition-all duration-150 rounded-xl ${active ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'} px-2.5 py-2`}>
                                            <Icon className="text-base min-w-[18px] mr-2.5" aria-hidden="true" />
                                            <span className="flex-1 truncate">{item.label}</span>
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

    const handleLogout = async () => {
        await signOutUser();
        navigate('/');
    };


    return (
        <>
            <aside
                className={`employerSidebar employerDesktopSidebar hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 shrink-0 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
                aria-label="Employer navigation"
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
                            {EMPLOYER_NAV.flatMap(g => g.items).map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.path, item.exact);
                                return (
                                    <li key={item.path}>
                                        <Link to={item.path} title={item.label} aria-label={item.label} aria-current={active ? 'page' : undefined}>
                                            <span className={`flex items-center justify-center p-2.5 rounded-xl transition-all ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                                                <Icon className="text-base" aria-hidden="true" />
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                ) : (
                    <EmployerNavList isActive={isActive} onNavigate={undefined} label="Employer navigation" />
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
                aria-label="Mobile employer navigation"
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
                    <EmployerNavList isActive={isActive} onNavigate={onCloseMobile} label="Mobile employer navigation" />
                    <PortalUtilities collapsed={false} onNavigate={onCloseMobile} isAdmin={isAdmin} onLogout={handleLogout} />
                </div>
            </aside>
        </>
    );
};

export default EmployerSidebar;
