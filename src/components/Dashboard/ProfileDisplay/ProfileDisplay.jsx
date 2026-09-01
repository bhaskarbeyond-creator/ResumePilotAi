import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { FiGrid, FiSettings, FiFileText, FiBarChart, FiMousePointer, FiDownload, FiSearch, FiChevronLeft, FiChevronRight, FiChevronDown, FiSun, FiMoon, FiSidebar, FiX, FiUser, FiShield, FiLogOut, FiBell, FiMenu, FiMessageSquare } from 'react-icons/fi';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import { FaRegComments, FaBriefcase, FaBuilding, FaCrown } from 'react-icons/fa';
import { FaListCheck } from 'react-icons/fa6';
import logo from '../../../assets/logo/logo.png';
import userPlaceholder from '../../../assets/user.png';
import { Link, useLocation } from 'react-router-dom';
import { checkIsEmployer, getSystemSettings } from '../../../services/api/platform';
import { AuthContext } from '../../../context/AuthContext';
import signOutUser from '../../../utils/signOut';
import NotificationPanel from './NotificationPanel';
import { useUnreadMessages } from '../../../hooks/useUnreadMessages';
import { useUnreadNotifications } from '../../../hooks/useUnreadNotifications';
import { useServiceAvailability } from '../../../hooks/useServiceAvailability';

const ProfileDisplay = ({ profile, image, user, onSidebarToggle, sidebarCollapsed }) => {
    const { t } = useTranslation('common');
    const [darkMode, setDarkMode] = useState(false);
    const [isEmployer, setIsEmployer] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [modulesConfig, setModulesConfig] = useState({
        enablePortfolioModule: false,
        enableJobScraperModule: false,
        enableCoverLetterModule: false,
        enableMessagesModule: false,
        enableJobTrackerModule: false,
        enableAppliedJobsModule: false,
    });

    const location = useLocation(); // Get current location
    const authUser = useContext(AuthContext); // Get authenticated user from context
    const { unreadCount } = useUnreadMessages(); // Get unread messages count
    const { unreadNotificationCount, refreshCount } = useUnreadNotifications(); // Get unread notifications count
    const [liveProfileImage, setLiveProfileImage] = useState(null);
    const [liveProfileName, setLiveProfileName] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let active = true;
        if (!authUser?.getIdTokenResult) { setIsAdmin(false); return () => { active = false; }; }
        authUser.getIdTokenResult().then(result => {
            if (active) setIsAdmin(['ADMIN', 'SUPER_ADMIN'].includes(String(result.claims.role || '').toUpperCase()));
        }).catch(() => { if (active) setIsAdmin(false); });
        return () => { active = false; };
    }, [authUser]);

    // CM360 / DV360 Categorized Navigation Accordion State
    const [openGroups, setOpenGroups] = useState({
        career: true,
        jobIntel: true,
        billing: true, // Always expanded by default
    });

    const toggleNavGroup = (groupKey) => {
        setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };

    // Auto-expand accordion when active path matches a sub-item
    useEffect(() => {
        const p = location.pathname;
        if (p.startsWith('/build-resume') || p.startsWith('/create-resume') || p === '/dashboard/cover-letters' || p === '/dashboard/portfolios') {
            setOpenGroups(prev => ({ ...prev, career: true }));
        } else if (p === '/dashboard/applied-jobs' || p === '/dashboard/job-tracker' || p === '/dashboard/interview' || p === '/dashboard/messages' || p === '/dashboard/my-employments' || p === '/dashboard/my-companies') {
            setOpenGroups(prev => ({ ...prev, jobIntel: true }));
        } else if (p === '/dashboard/settings' || p === '/dashboard/plans') {
            setOpenGroups(prev => ({ ...prev, billing: true }));
        }
    }, [location.pathname]);

    // Listen for live profile updates from Settings
    useEffect(() => {
        const handleProfileUpdate = (e) => {
            if (e?.detail) {
                if (e.detail.selectedImage || e.detail.image) {
                    setLiveProfileImage(e.detail.selectedImage || e.detail.image);
                }
                const nameStr = (e.detail.name && e.detail.name.trim()) || `${e.detail.firstname || ''} ${e.detail.lastname || ''}`.trim();
                if (nameStr) setLiveProfileName(nameStr);
            }
        };
        window.addEventListener('profileUpdated', handleProfileUpdate);
        return () => window.removeEventListener('profileUpdated', handleProfileUpdate);
    }, []);

    const userAvatarUrl =
        liveProfileImage ||
        profile?.selectedImage ||
        profile?.image ||
        image?.selectedImage ||
        image?.image ||
        authUser?.photoURL ||
        userPlaceholder;

    const candidateDisplayName = (
        liveProfileName ||
        (profile?.name && profile.name.trim()) ||
        (`${profile?.firstname || ''} ${profile?.lastname || ''}`.trim()) ||
        authUser?.displayName ||
        (authUser?.email ? authUser.email.split('@')[0] : '') ||
        'Master User'
    ).replace(/\s+/g, ' ').trim();

    const userMembershipTier = isAdmin ? 'Admin Tier' : (profile?.membership || 'Basic');
    // Enterprise tenancy is opt-in and dark by default, preserving the certified
    // personal dashboard until the server-side data-plane gates are approved.
    // The build-time flag alone is not sufficient: if the client is built with
    // tenancy on but the backend has it dark, this link produces a 404. We
    // therefore require the backend to confirm tenancy is actually served.
    const buildTimeEnterpriseFlag = import.meta.env?.VITE_ENTERPRISE_TENANCY_ENABLED === 'true';
    const { availability: platformAvailability, status: availabilityStatus } = useServiceAvailability();
    const enterpriseEnabled = availabilityStatus === 'ready'
        && (buildTimeEnterpriseFlag || platformAvailability?.enterpriseTenancy === true)
        && platformAvailability?.enterpriseTenancy === true;

    // Check system modules settings
    useEffect(() => {
        const loadModules = (event) => {
            if (event?.detail?.modules) {
                const m = event.detail.modules;
                setModulesConfig({
                    enablePortfolioModule: m.enablePortfolioModule === true,
                    enableJobScraperModule: m.enableJobScraperModule === true,
                    enableCoverLetterModule: m.enableCoverLetterModule === true,
                    enableMessagesModule: m.enableMessagesModule === true,
                    enableJobTrackerModule: m.enableJobTrackerModule === true,
                    enableAppliedJobsModule: m.enableAppliedJobsModule === true,
                });
                return;
            }
            getSystemSettings().then((settings) => {
                const m = settings?.modules || {};
                setModulesConfig({
                    enablePortfolioModule: m.enablePortfolioModule === true,
                    enableJobScraperModule: m.enableJobScraperModule === true,
                    enableCoverLetterModule: m.enableCoverLetterModule === true,
                    enableMessagesModule: m.enableMessagesModule === true,
                    enableJobTrackerModule: m.enableJobTrackerModule === true,
                    enableAppliedJobsModule: m.enableAppliedJobsModule === true,
                });
            }).catch(() => {});
        };
        loadModules();
        window.addEventListener('systemSettingsUpdated', loadModules);
        return () => window.removeEventListener('systemSettingsUpdated', loadModules);
    }, []);

    const closeMobileSidebar = () => {
        if (window.innerWidth < 1024 && !sidebarCollapsed) {
            // On mobile, collapse = hidden
            if (onSidebarToggle) onSidebarToggle(true);
            document.body.classList.remove('mobile-sidebar-open');
        }
    };

    const toggleSidebar = () => {
        const newCollapsed = !sidebarCollapsed;
        if (onSidebarToggle) {
            onSidebarToggle(newCollapsed);
        }

        // Mobile body scroll prevention
        const isMobile = window.innerWidth < 1024;
        if (isMobile) {
            if (newCollapsed) {
                document.body.classList.remove('mobile-sidebar-open');
            } else {
                document.body.classList.add('mobile-sidebar-open');
            }
        }

        const contentWrapper = document.querySelector('.dashboardContentWrapper');
        const dashboardGrid = document.querySelector('.dashboardGrid');

        const elementsToToggle = [contentWrapper, dashboardGrid].filter(Boolean);

        elementsToToggle.forEach((el) => {
            if (el) {
                if (newCollapsed) {
                    el.classList.add('sidebar-collapsed');
                } else {
                    el.classList.remove('sidebar-collapsed');
                }
            }
        });
    };

    () => {;
        setDarkMode(!darkMode);
    };

    useEffect(() => {
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState) {
            const isCollapsed = savedState === 'true';
            if (onSidebarToggle) {
                onSidebarToggle(isCollapsed);
            }

            const contentWrapper = document.querySelector('.dashboardContentWrapper');
            const dashboardGrid = document.querySelector('.dashboardGrid');

            const elementsToToggle = [contentWrapper, dashboardGrid].filter(Boolean);

            elementsToToggle.forEach((el) => {
                if (el) {
                    if (isCollapsed) {
                        el.classList.add('sidebar-collapsed');
                    } else {
                        el.classList.remove('sidebar-collapsed');
                    }
                }
            });
        }
    }, [onSidebarToggle]);

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    }, [sidebarCollapsed]);

    useEffect(() => {
        if (user) {
            checkIsEmployer(user)
                .then((employerStatus) => {
                    setIsEmployer(employerStatus);
                })
                .catch((error) => {
                    console.error('Error checking employer status:', error);
                    setIsEmployer(false);
                });
        } else {
            setIsEmployer(false);
        }
    }, [user]);

    useEffect(() => {
        const handleNotificationsUpdated = () => {
            refreshCount();
        };

        window.addEventListener('notificationsUpdated', handleNotificationsUpdated);
        return () => {
            window.removeEventListener('notificationsUpdated', handleNotificationsUpdated);
        };
    }, [refreshCount]);

    useEffect(() => {
        const handleMobileToggle = () => {
            toggleSidebar();
        };

        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                document.body.classList.remove('mobile-sidebar-open');
            }
        };

        window.addEventListener('toggleMobileSidebar', handleMobileToggle);
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('toggleMobileSidebar', handleMobileToggle);
            window.removeEventListener('resize', handleResize);
            document.body.classList.remove('mobile-sidebar-open');
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <style>{`
                .dashboardContentWrapper,
                .dashboardGrid {
                    margin-left: 280px !important;
                    width: calc(100% - 280px) !important;
                    box-sizing: border-box !important;
                    transition: margin-left 0.3s ease, width 0.3s ease !important;
                }

                .dashboardContentWrapper.sidebar-collapsed,
                .dashboardGrid.sidebar-collapsed {
                    margin-left: 60px !important;
                    width: calc(100% - 60px) !important;
                }

                @media only screen and (max-width: 1050px) {
                    .dashboardContentWrapper,
                    .dashboardGrid {
                        margin-left: 0 !important;
                        width: 100% !important;
                    }

                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
                        margin-left: 60px !important;
                        width: calc(100% - 60px) !important;
                    }
                }

                @media only screen and (max-width: 1023px) {
                    /* Content shifts down for mobile top bar + up for bottom nav */
                    .dashboardContentWrapper,
                    .dashboardGrid {
                        margin-left: 0 !important;
                        width: 100% !important;
                        padding-top: 56px !important;
                        padding-bottom: 68px !important;
                    }

                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
                        margin-left: 0 !important;
                        width: 100% !important;
                    }

                    /* Sidebar becomes an overlay drawer */
                    body.mobile-sidebar-open {
                        overflow: hidden;
                    }

                    .mobile-overlay {
                        backdrop-filter: blur(4px);
                        -webkit-backdrop-filter: blur(4px);
                        background: rgba(15, 23, 42, 0.35);
                    }
                }

                @media only screen and (max-width: 480px) {
                    .dashboardContentWrapper,
                    .dashboardGrid,
                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
                        padding-left: 0 !important;
                        width: 100% !important;
                    }
                }

                @media only screen and (max-width: 1023px) {
                    .mobile-overlay {
                        backdrop-filter: blur(4px);
                        -webkit-backdrop-filter: blur(4px);
                        background: rgba(0, 0, 0, 0.25);
                    }

                    .mobile-overlay-enter {
                        opacity: 0;
                        backdrop-filter: blur(0px);
                        -webkit-backdrop-filter: blur(0px);
                    }

                    .mobile-overlay-enter-active {
                        opacity: 1;
                        backdrop-filter: blur(4px);
                        -webkit-backdrop-filter: blur(4px);
                        transition: opacity 0.25s ease-out, backdrop-filter 0.3s ease-out;
                    }

                    body.mobile-sidebar-open {
                        overflow: hidden;
                        position: fixed;
                        width: 100%;
                    }
                }
            `}</style>

            {/* ── MOBILE TOP BAR ────────────────────────────────────────────── */}
            <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-100 z-[60] lg:hidden flex items-center justify-between px-4 shadow-sm">
                {/* Hamburger */}
                <button
                    onClick={toggleSidebar}
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
                    aria-label="Open menu"
                >
                    {!sidebarCollapsed ? (
                        <FiX className="w-5 h-5 text-gray-700" />
                    ) : (
                        <FiMenu className="w-5 h-5 text-gray-700" />
                    )}
                </button>

                {/* Logo centred */}
                <Link to="/dashboard" className="absolute left-1/2 -translate-x-1/2">
                    <img src={logo} alt="Logo" className="h-7 w-auto" />
                </Link>

                {/* Right actions: Bell */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors relative"
                        aria-label="Notifications"
                    >
                        <FiBell className="w-5 h-5 text-gray-700" />
                        {unreadNotificationCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-600 rounded-full"></span>
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile backdrop */}
            <div
                className={`fixed inset-0 bg-black mobile-overlay z-40 lg:hidden transition-opacity duration-300 ease-in-out ${!sidebarCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={toggleSidebar}
            />

            <div
                className={`fixed left-0 top-0 h-screen bg-slate-50 border-r border-slate-200/90 z-50 flex flex-col transition-all duration-300 ease-in-out text-slate-700 ${
                    sidebarCollapsed ? 'lg:w-[60px] lg:min-w-[60px] w-[280px]' : 'w-[280px] lg:w-[280px]'
                }
                lg:flex lg:shadow-none
                ${sidebarCollapsed ? 'max-lg:-translate-x-full' : 'max-lg:translate-x-0 shadow-2xl lg:shadow-none'}
                `}>
                <div className={`transition-all duration-300 border-b border-slate-200/80 bg-white ${sidebarCollapsed ? 'p-3' : 'px-4 py-4'}`}>
                    {sidebarCollapsed ? (
                        <div className="space-y-5">
                            <div className="flex justify-center">
                                <button onClick={toggleSidebar} className="w-10 h-10 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-center transition-colors duration-200 cursor-pointer">
                                    <GoSidebarCollapse className="w-5 h-5 text-slate-600" />
                                </button>
                            </div>
                            <div className="flex justify-center">
                                <Link to="/dashboard/settings" title="Master Profile & Settings">
                                    <div className="relative cursor-pointer">
                                        <div className="w-10 h-10 rounded-full ring-2 ring-indigo-500/20 overflow-hidden bg-indigo-50">
                                            <img
                                                src={userAvatarUrl}
                                                alt="User Avatar"
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src = userPlaceholder;
                                                }}
                                            />
                                        </div>
                                        {unreadNotificationCount > 0 && (
                                            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white text-[10px] leading-none rounded-full flex items-center justify-center font-bold border border-white">
                                                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                                            </div>
                                        )}
                                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white"></div>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Link to="/">
                                        <img src={logo} alt="Logo" className="w-[120px]" />
                                    </Link>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={toggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar" className="w-9 h-9 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl flex items-center justify-center transition-colors duration-200 cursor-pointer shadow-2xs">
                                        <GoSidebarExpand className="w-4 h-4" aria-hidden="true" focusable="false" />
                                    </button>
                                </div>
                            </div>

                            <Link to="/dashboard/settings" className="block text-slate-900 hover:opacity-95 transition-opacity" title="Master Profile & Settings">
                                <div className="bg-white p-3 rounded-xl flex items-center gap-3 border border-slate-200 shadow-2xs hover:border-indigo-300 transition-all cursor-pointer">
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full ring-2 ring-indigo-500/20 overflow-hidden bg-indigo-50">
                                            <img
                                                src={userAvatarUrl}
                                                alt="User Avatar"
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src = userPlaceholder;
                                                }}
                                            />
                                        </div>
                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                        <p className="text-xs font-bold text-slate-900 truncate whitespace-nowrap overflow-hidden text-ellipsis mb-0.5" title={candidateDisplayName}>
                                            {candidateDisplayName}
                                        </p>
                                        <p className="text-[10px] text-slate-500 truncate whitespace-nowrap overflow-hidden text-ellipsis mb-1" title={authUser?.email || profile?.email}>
                                            {authUser?.email || profile?.email || ''}
                                        </p>
                                        <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-extrabold rounded-full border ${
                                            userMembershipTier.includes('Admin')
                                                ? 'text-red-700 bg-red-50 border-red-200'
                                                : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                                userMembershipTier.includes('Admin') ? 'bg-red-500' : 'bg-indigo-600 animate-pulse'
                                            }`}></span>
                                            {userMembershipTier}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Navigation Menu — CM360 Light Categorized Dropdowns */}
                <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3 custom-scrollbar">
                    {/* ── 1. MAIN WORKSPACE ── */}
                    <div>
                        {!sidebarCollapsed && (
                            <p className="text-[9px] font-extrabold text-slate-600 uppercase tracking-widest px-2 mb-1.5">Main Workspace</p>
                        )}
                        <Link to="/dashboard" onClick={closeMobileSidebar}>
                            <div
                                className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                    location.pathname === '/dashboard'
                                        ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                <FiGrid className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                {!sidebarCollapsed && <span className="flex-1">Overview &amp; Resumes</span>}
                            </div>
                        </Link>
                        {enterpriseEnabled && (
                            <Link to="/enterprise" onClick={closeMobileSidebar}>
                                <div
                                    className={`flex items-center text-xs transition-all duration-150 rounded-xl mt-1 ${
                                        location.pathname.startsWith('/enterprise')
                                            ? 'bg-violet-50 text-violet-700 font-bold border-l-3 border-violet-600 shadow-2xs pl-2.5'
                                            : 'text-violet-700 hover:bg-violet-50 hover:text-violet-800 font-semibold'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                    <FiShield className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">Enterprise Workspace</span>}
                                </div>
                            </Link>
                        )}
                    </div>

                    {/* ── 2. CAREER SUITE (Dropdown) ── */}
                    <div>
                        {!sidebarCollapsed ? (
                            <button
                                type="button"
                                onClick={() => toggleNavGroup('career')}
                                className="w-full flex items-center justify-between px-2 py-1 text-[9px] font-extrabold text-slate-600 uppercase tracking-widest hover:text-slate-900 transition-colors cursor-pointer mb-1">
                                <span>Career Suite</span>
                                {openGroups.career ? <FiChevronDown className="w-3 h-3 text-slate-400" /> : <FiChevronRight className="w-3 h-3 text-slate-400" />}
                            </button>
                        ) : null}

                        {(openGroups.career || sidebarCollapsed) && (
                            <div className="space-y-0.5">
                                <Link to="/dashboard" onClick={closeMobileSidebar}>
                                    <div
                                        className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                            location.pathname === '/dashboard' || location.pathname.startsWith('/build-resume') || location.pathname.startsWith('/create-resume')
                                                ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                        } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                        <FiFileText className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                        {!sidebarCollapsed && <span className="flex-1">AI Resumes &amp; Master CV</span>}
                                    </div>
                                </Link>

                                {modulesConfig.enableCoverLetterModule && (
                                <Link to="/dashboard/cover-letters" onClick={closeMobileSidebar}>
                                    <div
                                        className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                            location.pathname === '/dashboard/cover-letters'
                                                ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                        } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                        <FiFileText className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                        {!sidebarCollapsed && <span className="flex-1">Cover Letters</span>}
                                    </div>
                                </Link>
                                )}

                                {modulesConfig.enablePortfolioModule && (
                                    <Link to="/dashboard/portfolios" onClick={closeMobileSidebar}>
                                        <div
                                            className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                                location.pathname === '/dashboard/portfolios'
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                            <FiBarChart className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && <span className="flex-1">Portfolios &amp; Web CV</span>}
                                        </div>
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── 3. JOB INTELLIGENCE (Dropdown) ── */}
                    <div>
                        {!sidebarCollapsed ? (
                            <button
                                type="button"
                                onClick={() => toggleNavGroup('jobIntel')}
                                className="w-full flex items-center justify-between px-2 py-1 text-[9px] font-extrabold text-slate-600 uppercase tracking-widest hover:text-slate-900 transition-colors cursor-pointer mb-1">
                                <span>Job Intelligence</span>
                                {openGroups.jobIntel ? <FiChevronDown className="w-3 h-3 text-slate-400" /> : <FiChevronRight className="w-3 h-3 text-slate-400" />}
                            </button>
                        ) : null}

                        {(openGroups.jobIntel || sidebarCollapsed) && (
                            <div className="space-y-0.5">
                                {modulesConfig.enableJobTrackerModule && (
                                    <Link to="/dashboard/job-tracker" onClick={closeMobileSidebar}>
                                        <div
                                            className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                                location.pathname === '/dashboard/job-tracker'
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                            <FaBriefcase className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && <span className="flex-1">Job Tracker</span>}
                                        </div>
                                    </Link>
                                )}
                                {modulesConfig.enableAppliedJobsModule && (
                                    <Link to="/dashboard/applied-jobs" onClick={closeMobileSidebar}>
                                        <div
                                            className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                                location.pathname === '/dashboard/applied-jobs'
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                            <FaBriefcase className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && <span className="flex-1">My Applications</span>}
                                        </div>
                                    </Link>
                                )}

                                <Link to="/dashboard/interview" onClick={closeMobileSidebar}>
                                    <div
                                        className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                            location.pathname === '/dashboard/interview'
                                                ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                        } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                        <FaRegComments className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                        {!sidebarCollapsed && <span className="flex-1">AI Interview Coach</span>}
                                    </div>
                                </Link>

                                {modulesConfig.enableMessagesModule && (
                                    <Link to="/dashboard/messages" onClick={closeMobileSidebar}>
                                        <div
                                            className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                                location.pathname === '/dashboard/messages'
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                            <FiMessageSquare className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && (
                                                <>
                                                    <span className="flex-1">Messages &amp; Chat</span>
                                                    {unreadCount > 0 && (
                                                        <span className="ml-2 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] h-4 flex items-center justify-center">{unreadCount}</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </Link>
                                )}

                                {isEmployer && modulesConfig.enableJobScraperModule && (
                                    <Link to="/dashboard/my-employments" onClick={closeMobileSidebar}>
                                        <div
                                            className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                                location.pathname === '/dashboard/my-employments'
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                            <FaBriefcase className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && <span className="flex-1">My Posted Jobs</span>}
                                        </div>
                                    </Link>
                                )}

                                {isEmployer && (
                                    <Link to="/dashboard/my-companies" onClick={closeMobileSidebar}>
                                        <div
                                            className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                                location.pathname === '/dashboard/my-companies'
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                            <FaBuilding className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && <span className="flex-1">My Companies</span>}
                                        </div>
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── 4. BILLING & ACCOUNT (Dropdown) ── */}
                    <div>
                        {!sidebarCollapsed ? (
                            <button
                                type="button"
                                onClick={() => toggleNavGroup('billing')}
                                className="w-full flex items-center justify-between px-2 py-1 text-[9px] font-extrabold text-slate-600 uppercase tracking-widest hover:text-slate-900 transition-colors cursor-pointer mb-1">
                                <span>Account &amp; Security</span>
                                {openGroups.billing ? <FiChevronDown className="w-3 h-3 text-slate-400" /> : <FiChevronRight className="w-3 h-3 text-slate-400" />}
                            </button>
                        ) : null}

                        {(openGroups.billing || sidebarCollapsed) && (
                            <div className="space-y-0.5">
                                <Link to="/dashboard/plans" onClick={closeMobileSidebar}>
                                    <div
                                        className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                            location.pathname === '/dashboard/plans'
                                                ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                        } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                        <FiSettings className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                        {!sidebarCollapsed && <span className="flex-1">Subscription &amp; Plans</span>}
                                    </div>
                                </Link>

                                <Link to="/dashboard/settings?tab=Profile" onClick={closeMobileSidebar}>
                                    <div
                                        className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                            location.pathname === '/dashboard/settings' && (!location.search || location.search.includes('Profile'))
                                                ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                        } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                        <FiUser className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                        {!sidebarCollapsed && <span className="flex-1">Master Profile Data</span>}
                                    </div>
                                </Link>

                                <Link to="/dashboard/settings?tab=Account" onClick={closeMobileSidebar}>
                                    <div
                                        className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                            location.pathname === '/dashboard/settings' && location.search.includes('Account')
                                                ? 'bg-indigo-50 text-indigo-700 font-bold border-l-3 border-indigo-600 shadow-2xs pl-2.5'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                                        } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                        <FiShield className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                        {!sidebarCollapsed && <span className="flex-1">Security &amp; 2FA Hub</span>}
                                    </div>
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* ── 5. ADMIN PANEL (If Admin) ── */}
                    {isAdmin && (
                        <div>
                            {!sidebarCollapsed && (
                                <p className="text-[9px] font-extrabold text-red-600 uppercase tracking-widest px-2 mb-1.5">System Admin</p>
                            )}
                            <Link to="/adm/dashboard" onClick={closeMobileSidebar}>
                                <div
                                    className={`flex items-center text-xs transition-all duration-150 rounded-xl ${
                                        location.pathname.startsWith('/adm')
                                            ? 'bg-red-50 text-red-700 font-bold border-l-3 border-red-600 shadow-2xs pl-2.5'
                                            : 'text-red-600/90 hover:bg-red-50 hover:text-red-800 font-medium'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                                    <FiShield className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">Admin Control Panel</span>}
                                </div>
                            </Link>
                        </div>
                    )}

                </div>
                {/* END scrollable nav */}

                {/* ── FIXED BOTTOM SIDEBAR SECTION (never scrolls) ── */}
                <div className={`flex-shrink-0 border-t border-slate-200/80 bg-slate-50 ${ sidebarCollapsed ? 'px-2 py-2' : 'px-2.5 py-2' }`}>

                    {/* Notifications & Sign Out */}
                    <div className="space-y-0.5 mb-2">
                        <div
                            onClick={() => setShowNotifications(!showNotifications)}
                            className={`flex items-center text-xs transition-all duration-150 rounded-xl cursor-pointer ${
                                showNotifications ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'}`}>
                            <div className="relative flex items-center">
                                <FiBell className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                {unreadNotificationCount > 0 && sidebarCollapsed && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-600 rounded-full"></span>
                                )}
                            </div>
                            {!sidebarCollapsed && (
                                <>
                                    <span className="flex-1">Notifications</span>
                                    {unreadNotificationCount > 0 && (
                                        <span className="ml-2 bg-indigo-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full min-w-[18px] h-4 flex items-center justify-center">
                                            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        <div
                            onClick={() => {
                                signOutUser().then(() => {
                                    window.location.href = '/';
                                });
                            }}
                            className={`flex items-center text-xs font-semibold transition-all duration-150 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer ${
                                sidebarCollapsed ? 'p-2.5 justify-center' : 'px-2.5 py-2'
                            }`}>
                            <FiLogOut className={`text-base min-w-[18px] ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                            {!sidebarCollapsed && <span className="flex-1">{t('common.signOut', 'Sign Out')}</span>}
                        </div>
                    </div>

                    {/* Plans & Upgrades CTA — always visible at bottom */}
                    <Link to="/dashboard/plans" onClick={closeMobileSidebar}>
                        {sidebarCollapsed ? (
                            <div className={`flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer ${
                                location.pathname === '/dashboard/plans'
                                    ? 'bg-gradient-to-br from-indigo-600 to-purple-700 shadow-lg shadow-indigo-500/30'
                                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-md shadow-indigo-400/25'
                            }`}>
                                <FaCrown className="w-4 h-4 text-amber-300" />
                            </div>
                        ) : (
                            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer group ${
                                location.pathname === '/dashboard/plans'
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-700 shadow-lg shadow-indigo-500/30'
                                    : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-md shadow-indigo-400/20 hover:shadow-lg hover:shadow-indigo-500/30'
                            }`}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:'rgba(255,255,255,0.15)'}}>
                                    <FaCrown className="w-3.5 h-3.5 text-amber-300 group-hover:scale-110 transition-transform duration-200" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-extrabold text-white leading-tight">Plans &amp; Upgrades</p>
                                    <p className="text-[10px] text-indigo-200 font-medium leading-tight">Manage subscription</p>
                                </div>
                                <FiChevronRight className="w-3.5 h-3.5 text-white/60 shrink-0" />
                            </div>
                        )}
                    </Link>
                </div>
            </div>

            {/* ── MOBILE BOTTOM NAV BAR ─────────────────────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 h-[68px] bg-white border-t border-gray-100 z-[60] lg:hidden flex items-stretch shadow-lg">
                <Link
                    to="/dashboard"
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                        location.pathname === '/dashboard' ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                >
                    <FiGrid className="w-5 h-5 mb-0.5" />
                    <span>Home</span>
                </Link>

                {modulesConfig.enableCoverLetterModule ? (
                <Link
                    to="/dashboard/cover-letters"
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                        location.pathname === '/dashboard/cover-letters' ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                >
                    <FiFileText className="w-5 h-5 mb-0.5" />
                    <span>Letters</span>
                </Link>
                ) : (
                <Link
                    to="/dashboard/job-tracker"
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                        location.pathname === '/dashboard/job-tracker' ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                >
                    <FaBriefcase className="w-5 h-5 mb-0.5" />
                    <span>Jobs</span>
                </Link>
                )}

                <Link
                    to="/dashboard/settings"
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                        location.pathname === '/dashboard/settings' ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                >
                    <FiSettings className="w-5 h-5 mb-0.5" />
                    <span>Profile</span>
                </Link>

                {modulesConfig.enableMessagesModule && (
                    <Link
                        to="/dashboard/messages"
                        className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative ${
                            location.pathname === '/dashboard/messages' ? 'text-indigo-600' : 'text-gray-500'
                        }`}
                    >
                        <div className="relative">
                            <FiMessageSquare className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </div>
                        <span className="mt-0.5">Messages</span>
                    </Link>
                )}

                <button
                    onClick={toggleSidebar}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative ${
                        !sidebarCollapsed ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                >
                    <div className="relative">
                        <FiMenu className="w-5 h-5" />
                        {unreadNotificationCount > 0 && (
                            <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                        )}
                    </div>
                    <span>More</span>
                </button>
            </div>

            {/* Notification Panel */}
            <NotificationPanel isOpen={showNotifications} onClose={() => setShowNotifications(false)} sidebarCollapsed={sidebarCollapsed} />
        </>
    );
};

export default ProfileDisplay;
