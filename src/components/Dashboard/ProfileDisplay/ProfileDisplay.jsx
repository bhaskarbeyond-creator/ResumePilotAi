import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { FiGrid, FiSettings, FiFileText, FiBarChart, FiMousePointer, FiDownload, FiSearch, FiChevronLeft, FiChevronRight, FiSun, FiMoon, FiSidebar, FiX, FiUser, FiShield, FiLogOut, FiBell } from 'react-icons/fi';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import { FaRegComments, FaBriefcase, FaBuilding } from 'react-icons/fa';
import { FaListCheck } from 'react-icons/fa6';
import logo from '../../../assets/logo/logo.png';
import userPlaceholder from '../../../assets/user.png';
import { Link, useLocation } from 'react-router-dom';
import { checkIsEmployer, getSystemSettings } from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';
import fire from '../../../conf/fire';
import NotificationPanel from './NotificationPanel';
import { useUnreadMessages } from '../../../hooks/useUnreadMessages';
import { useUnreadNotifications } from '../../../hooks/useUnreadNotifications';
import conf from '../../../conf/configuration';

const ProfileDisplay = ({ profile, image, user, onSidebarToggle, sidebarCollapsed }) => {
    const { t } = useTranslation('common');
    const [darkMode, setDarkMode] = useState(false);
    const [isEmployer, setIsEmployer] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [modulesConfig, setModulesConfig] = useState({
        enablePortfolioModule: true,
        enableJobScraperModule: true,
        enableCoverLetterModule: true,
    });

    const location = useLocation(); // Get current location
    const authUser = useContext(AuthContext); // Get authenticated user from context
    const { unreadCount } = useUnreadMessages(); // Get unread messages count
    const { unreadNotificationCount, refreshCount } = useUnreadNotifications(); // Get unread notifications count
    const [liveProfileImage, setLiveProfileImage] = useState(null);
    const [liveProfileName, setLiveProfileName] = useState(null);

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

    // Check if current user is admin — must be declared BEFORE userMembershipTier uses it
    const isAdmin = authUser?.email === conf.adminEmail;

    const userMembershipTier =
        (isAdmin ? 'Admin Tier' : null) ||
        (profile?.membership && profile.membership !== ';' && profile.membership !== 'Basic' ? profile.membership : null) ||
        (image?.membership && image.membership !== ';' && image.membership !== 'Basic' ? image.membership : null) ||
        'Pro Tier';

    // Check system modules settings
    useEffect(() => {
        const loadModules = () => {
            getSystemSettings().then((settings) => {
                const m = settings?.modules || {};
                setModulesConfig({
                    enablePortfolioModule: m.enablePortfolioModule !== undefined ? m.enablePortfolioModule : true,
                    enableJobScraperModule: m.enableJobScraperModule !== undefined ? m.enableJobScraperModule : true,
                    enableCoverLetterModule: m.enableCoverLetterModule !== undefined ? m.enableCoverLetterModule : true,
                });
            }).catch(() => {});
        };
        loadModules();
        window.addEventListener('systemSettingsUpdated', loadModules);
        return () => window.removeEventListener('systemSettingsUpdated', loadModules);
    }, []);

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

    const toggleDarkMode = () => {
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
    }, []);

    return (
        <>
            <style jsx="true" global="true">{`
                .dashboardContentWrapper,
                .dashboardGrid {
                    margin-left: 240px !important;
                    width: calc(100% - 240px) !important;
                    box-sizing: border-box !important;
                    transition: margin-left 0.3s ease, width 0.3s ease !important;
                }

                .dashboardContentWrapper.sidebar-collapsed,
                .dashboardGrid.sidebar-collapsed {
                    margin-left: 60px !important;
                    width: calc(100% - 60px) !important;
                }

                @media only screen and (max-width: 1023px) {
                    .mobile-sidebar-enter {
                        transform: translateX(-100%);
                        opacity: 0;
                    }

                    .mobile-sidebar-enter-active {
                        transform: translateX(0);
                        opacity: 1;
                        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out;
                    }

                    .mobile-sidebar-exit {
                        transform: translateX(0);
                        opacity: 1;
                    }

                    .mobile-sidebar-exit-active {
                        transform: translateX(-100%);
                        opacity: 0;
                        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-in;
                    }

                    .mobile-sidebar-touch {
                        will-change: transform;
                        -webkit-transform: translateZ(0);
                        transform: translateZ(0);
                    }

                    .mobile-sidebar {
                        transform: translateX(-100%);
                        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
                        will-change: transform;
                        -webkit-transform: translateZ(0);
                        transform: translateZ(0);
                    }

                    .mobile-sidebar.open {
                        transform: translateX(0);
                    }
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

                @media only screen and (max-width: 768px) {
                    .dashboardContentWrapper,
                    .dashboardGrid {
                        margin-left: 0 !important;
                        width: 100% !important;
                    }

                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
                        margin-left: 0 !important;
                        width: 100% !important;
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

            <div
                className={`fixed inset-0 bg-black mobile-overlay z-40 lg:hidden transition-all duration-300 ease-in-out ${!sidebarCollapsed ? 'opacity-25' : 'opacity-0 pointer-events-none'}`}
                onClick={toggleSidebar}
            />

            <div
                className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-100 z-50 flex flex-col transition-all duration-300 ease-in-out ${
                    sidebarCollapsed ? 'w-[60px] min-w-[60px]' : 'w-[240px]'
                }
                lg:flex lg:shadow-none
                ${sidebarCollapsed ? 'max-lg:-translate-x-full' : 'max-lg:translate-x-0 shadow-2xl lg:shadow-none'}
                `}>
                <div className={`transition-all duration-300 ${sidebarCollapsed ? 'p-3' : 'px-4 py-4'}`}>
                    {sidebarCollapsed ? (
                        <div className="space-y-5">
                            <div className="flex justify-center">
                                <button onClick={toggleSidebar} className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors duration-200">
                                    <GoSidebarCollapse className="w-5 h-5 text-gray-600" />
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
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Link to="/">
                                        <img src={logo} alt="Logo" className="w-[120px]" />
                                    </Link>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={toggleSidebar} className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors duration-200">
                                        <GoSidebarExpand className="w-5 h-5 text-gray-600" />
                                    </button>
                                </div>
                            </div>

                            <Link to="/dashboard/settings" className="block text-slate-900 hover:opacity-95 transition-opacity" title="Master Profile & Settings">
                                <div className="bg-white p-3 rounded-xl flex items-center gap-3 border border-slate-200 shadow-2xs hover:border-indigo-300 transition-all cursor-pointer">
                                    <div className="relative flex-shrink-0">
                                        <div className="w-12 h-12 rounded-full ring-2 ring-indigo-500/20 overflow-hidden bg-indigo-50">
                                            <img
                                                src={userAvatarUrl}
                                                alt="User Avatar"
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src = userPlaceholder;
                                                }}
                                            />
                                        </div>
                                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white"></div>
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                        <p className="text-xs font-bold text-slate-900 truncate whitespace-nowrap overflow-hidden text-ellipsis mb-0.5" title={candidateDisplayName}>
                                            {candidateDisplayName}
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate whitespace-nowrap overflow-hidden text-ellipsis mb-1.5" title={authUser?.email || profile?.email}>
                                            {authUser?.email || profile?.email || ''}
                                        </p>
                                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${
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

                {/* Navigation Menu */}
                <div className="flex-1 overflow-y-auto">
                    {!sidebarCollapsed && (
                        <div className="px-4 py-1">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{t('JobsUpdate.ProfileDisplay2.navigation')}</p>
                        </div>
                    )}

                    <div className="px-2">
                        <Link to="/dashboard">
                            <div
                                className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === '/dashboard' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                <FiGrid className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.dashboard', 'Dashboard')}</span>}
                            </div>
                        </Link>

                        {/* Show Admin Panel only for admin users */}
                        {isAdmin && (
                            <Link to="/adm">
                                <div
                                    className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                        location.pathname.startsWith('/adm') ? 'bg-red-100 text-red-900 font-medium' : 'text-red-600 hover:bg-red-50 hover:text-red-800'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                    <FiShield className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.adminPanel', 'Admin Panel')}</span>}
                                </div>
                            </Link>
                        )}

                        <Link to="/dashboard/interview">
                            <div
                                className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === '/dashboard/interview' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                <FaRegComments className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.interviews', 'Interviews')}</span>}
                            </div>
                        </Link>

                        <Link to="/dashboard/cover-letters">
                            <div
                                className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === '/dashboard/cover-letters' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                <FiFileText className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                {!sidebarCollapsed && <span className="flex-1">Cover Letters</span>}
                            </div>
                        </Link>

                        {modulesConfig.enablePortfolioModule && (
                            <Link to="/dashboard/portfolios">
                                <div
                                    className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                        location.pathname === '/dashboard/portfolios' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                    <FiFileText className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.portfolios', 'Portfolios')}</span>}
                                </div>
                            </Link>
                        )}

                        {modulesConfig.enableJobScraperModule && (
                            <Link to="/dashboard/applied-jobs">
                                <div
                                    className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                        location.pathname === '/dashboard/applied-jobs' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                    <FaBriefcase className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.appliedJobs', 'Applied Jobs')}</span>}
                                </div>
                            </Link>
                        )}

                        {/* Messages */}
                        <Link to="/dashboard/messages">
                            <div
                                className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === '/dashboard/messages' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                <FaRegComments className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                {!sidebarCollapsed && (
                                    <>
                                        <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.messages', 'Messages')}</span>
                                        {unreadCount > 0 && (
                                            <span className="ml-2 bg-gray-900 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full min-w-[18px] h-4 flex items-center justify-center">{unreadCount}</span>
                                        )}
                                    </>
                                )}
                            </div>
                        </Link>

                        {/* Show My Employments only for employers */}
                        {isEmployer && modulesConfig.enableJobScraperModule && (
                            <Link to="/dashboard/my-employments">
                                <div
                                    className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                        location.pathname === '/dashboard/my-employments' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                    <FaBriefcase className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.myJobs', 'My Jobs')}</span>}
                                </div>
                            </Link>
                        )}

                        {/* Show My Companies only for employers */}
                        {isEmployer && (
                            <Link to="/dashboard/my-companies">
                                <div
                                    className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                        location.pathname === '/dashboard/my-companies' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                    } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                    <FaBuilding className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.myCompanies', 'My Companies')}</span>}
                                </div>
                            </Link>
                        )}

                        <Link to="/dashboard/settings">
                            <div
                                className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === '/dashboard/settings' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                                <FiSettings className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                {!sidebarCollapsed && <span className="flex-1">{t('JobsUpdate.ProfileDisplay2.menu.settings', 'Settings')}</span>}
                            </div>
                        </Link>

                        {/* Separate Notifications Item */}
                        <div
                            onClick={() => setShowNotifications(!showNotifications)}
                            className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 cursor-pointer font-medium ${
                                showNotifications ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            } ${sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'}`}>
                            <div className="relative flex items-center">
                                <FiBell className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                {unreadNotificationCount > 0 && sidebarCollapsed && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full"></span>
                                )}
                            </div>
                            {!sidebarCollapsed && (
                                <>
                                    <span className="flex-1">Notifications</span>
                                    {unreadNotificationCount > 0 && (
                                        <span className="ml-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] h-4 flex items-center justify-center">
                                            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Sign Out Action Button */}
                        <div
                            onClick={() => {
                                fire.auth().signOut().then(() => {
                                    localStorage.removeItem('currentResumeId');
                                    localStorage.removeItem('currentResumeItem');
                                    window.location.href = '/';
                                });
                            }}
                            className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer font-medium ${
                                sidebarCollapsed ? 'p-2.5 justify-center' : 'p-2.5'
                            }`}>
                            <FiLogOut className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                            {!sidebarCollapsed && <span className="flex-1">{t('common.signOut', 'Sign Out')}</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Notification Panel */}
            <NotificationPanel isOpen={showNotifications} onClose={() => setShowNotifications(false)} sidebarCollapsed={sidebarCollapsed} />
        </>
    );
};

export default ProfileDisplay;
