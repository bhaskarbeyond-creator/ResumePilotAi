import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    FiHome, FiGrid, FiSettings, FiUsers, FiFileText,
    FiMail, FiLogOut, FiSearch, FiShield, FiBriefcase,
    FiLayers, FiGlobe, FiChevronDown, FiChevronRight, FiEdit,
    FiActivity, FiLock, FiTool, FiAlertTriangle, FiType,
} from 'react-icons/fi';
import {
    FaRegBuilding, FaCog, FaCreditCard, FaShareAlt, FaChartLine,
    FaFile, FaBullhorn, FaRobot, FaEnvelope, FaFilePdf, FaSearch as FaSearchIcon,
    FaMapMarkerAlt, FaPaintBrush, FaFileCode, FaShieldAlt, FaHeartbeat,
    FaFire, FaFacebook, FaCloud, FaLinkedin, FaStamp, FaCode,
    FaCookieBite, FaCommentAlt, FaGlobeAsia, FaBrain, FaCubes, FaReceipt,
    FaServer,
} from 'react-icons/fa';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import { MdOutlineReviews } from 'react-icons/md';
import fire from '../../../conf/fire';
import { getHealthIndicator } from '../../../services/platformApi';
import { INDICATOR_TONE } from '../../../utils/healthPresentation';

// Selection state uses the left rail marker. The only status dot in this
// navigation is the Platform Health indicator, and it is driven exclusively by
// the backend operational-status collector — never by a local assumption.
const HEALTH_POLL_MS = 120_000;
const readSidebarPreference = () => {
    try { return localStorage.getItem('adminSidebarCollapsed'); } catch { return null; }
};
const writeSidebarPreference = value => {
    try { localStorage.setItem('adminSidebarCollapsed', String(value)); } catch { /* preference storage is optional */ }
};

// Helper function for toggling content area classes (similar to ProfileDisplay)
const toggleContentAreaClasses = (isCollapsed) => {
    const mainContent = document.querySelector('.dashboardGridCenter');
    const dashboardContent = document.querySelector('.dashboardMainContent');
    const contentWrapper = document.querySelector('.dashboardContentWrapper');
    const dashboardGrid = document.querySelector('.dashboardGrid');

    const elementsToToggle = [mainContent, dashboardContent, contentWrapper, dashboardGrid].filter(Boolean);

    elementsToToggle.forEach((el) => {
        if (el) {
            if (isCollapsed) {
                el.classList.add('sidebar-collapsed');
            } else {
                el.classList.remove('sidebar-collapsed');
            }
        }
    });
};

// Settings sub-navigation groups
const SETTINGS_GROUPS = [
    { label: 'Modules', items: [
        { key: 'modulesSettings', label: 'Addon Modules', icon: FaCubes },
    ]},
    { label: 'General', items: [
        { key: 'websiteSettings', label: 'Brand Identity & Meta', icon: FaCog },
        { key: 'brandingSettings', label: 'Branding', icon: FaPaintBrush },
        { key: 'geoSeoSettings', label: 'Indian Geo-SEO', icon: FaGlobeAsia },
        { key: 'llmGeoSettings', label: 'LLM GEO (AI Search)', icon: FaBrain },
        { key: 'firebaseSettings', label: 'Firebase', icon: FaFire },
        { key: 'socialAuthSettings', label: 'Social Sign-On & OAuth', icon: FaFacebook },
        { key: 'emailSettings', label: 'Email & SMTP', icon: FaEnvelope },
    ]},
    { label: 'AI & Services', items: [
        { key: 'storageSettings', label: 'Cloud Storage', icon: FaCloud },
        { key: 'aiSettings', label: 'AI & Gemini', icon: FaRobot },
        { key: 'exportPdfSettings', label: 'PDF Exporter', icon: FaFilePdf },
        { key: 'jobScraperSettings', label: 'Job & Naukri Scraper', icon: FaSearchIcon },
        { key: 'twilioSmsSettings', label: 'Twilio SMS', icon: FaCommentAlt },
    ]},
    { label: 'Payments', items: [
        { key: 'ordersManagement', label: 'Orders & Transactions', icon: FaReceipt },
        { key: 'subscriptionsSettings', label: 'Subscriptions & Gateways', icon: FaCreditCard },
        { key: 'watermarkSettings', label: 'PDF Watermark', icon: FaStamp },
    ]},
    { label: 'Security & Health', items: [
        { key: 'integrationsSettings', label: 'Maps & Keys', icon: FaMapMarkerAlt },
        { key: 'securityLimitsSettings', label: 'Security & Limits', icon: FaShieldAlt },
        { key: 'systemHealthSettings', label: 'System Health', icon: FaHeartbeat },
        { key: 'codeInjectionSettings', label: 'Code Injection', icon: FaCode },
        { key: 'gdprLegalSettings', label: 'GDPR & Legal', icon: FaCookieBite },
    ]},
    { label: 'Content & Media', items: [
        { key: 'templateManagerSettings', label: 'Templates', icon: FaFileCode },
        { key: 'pages', label: 'Pages', icon: FaFile },
        { key: 'blog', label: 'Blog Engine', icon: FiEdit },
        { key: 'socialSettings', label: 'Social Links', icon: FaShareAlt },
        { key: 'analytics', label: 'Analytics', icon: FaChartLine },
        { key: 'ads', label: 'Ads Manager', icon: FaBullhorn },
    ]},
];

const Sidebar = ({ sidebarCollapsed: initialSidebarCollapsed, onSidebarToggle: notifyParentOfToggle, onOpenCommandPalette, mobileOpen = false, onCloseMobile }) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const stored = readSidebarPreference();
        return stored === null ? Boolean(initialSidebarCollapsed) : stored === 'true';
    });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState(() =>
        Object.fromEntries(SETTINGS_GROUPS.map(g => [g.label, true]))
    );
    const location = useLocation();
    const navigate = useNavigate();
    const [healthIndicator, setHealthIndicator] = useState({ state: 'loading', indicator: null, overall: null, attentionCount: null });

    const loadHealthIndicator = useCallback(async () => {
        try {
            const data = await getHealthIndicator();
            setHealthIndicator({ state: 'ready', indicator: data.indicator, overall: data.overall, attentionCount: data.attentionCount });
        } catch {
            // An unreachable collector is reported as unknown, never as green.
            setHealthIndicator({ state: 'unavailable', indicator: null, overall: null, attentionCount: null });
        }
    }, []);

    useEffect(() => {
        loadHealthIndicator();
        const timer = setInterval(loadHealthIndicator, HEALTH_POLL_MS);
        return () => clearInterval(timer);
    }, [loadHealthIndicator]);

    const healthDotClass = healthIndicator.state === 'ready'
        ? (INDICATOR_TONE[healthIndicator.indicator] || 'bg-slate-300')
        : healthIndicator.state === 'unavailable' ? 'bg-slate-400' : 'bg-slate-200 animate-pulse';
    const healthDotLabel = healthIndicator.state === 'ready'
        ? (healthIndicator.overall === 'OPERATIONAL'
            ? 'All critical services operational'
            : healthIndicator.overall === 'CRITICAL'
                ? 'A critical platform service is unavailable'
                : `${healthIndicator.attentionCount} service(s) need attention`)
        : healthIndicator.state === 'unavailable' ? 'Platform health status unavailable' : 'Checking platform health';

    const isSettingsPage = location.pathname.startsWith('/adm/settings');
    const searchParams = new URLSearchParams(location.search);
    const activeTab = searchParams.get('tab') || 'modulesSettings';

    // Auto-open settings accordion when on settings page
    useEffect(() => {
        if (isSettingsPage) setSettingsOpen(true);
    }, [isSettingsPage]);

    useEffect(() => {
        writeSidebarPreference(sidebarCollapsed);
        if (notifyParentOfToggle) notifyParentOfToggle(sidebarCollapsed);
        toggleContentAreaClasses(sidebarCollapsed);
    }, [sidebarCollapsed, notifyParentOfToggle]);

    const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

    const toggleGroup = (label) => {
        setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
    };

    const handleSettingsTabClick = (tabKey) => {
        navigate(`/adm/settings?tab=${tabKey}`);
    };

    const handleLogout = () => {
        fire.auth().signOut().catch((error) => console.error('Sign out error', error));
    };

    const navGroups = [
        {
            label: 'Control Plane',
            items: [
                { path: '/adm/dashboard', icon: FiGrid, label: 'Command Center' },
                { path: '/adm/tenants', icon: FaServer, label: 'Tenants Registry' },
                { path: '/adm/audit-logs', icon: FiShield, label: 'Admin Audit Trail' },
                { path: '/adm/security', icon: FiLock, label: 'Security Events' },
                { path: '/adm/queues', icon: FiActivity, label: 'Queue & DLQ Monitor' },
                { path: '/adm/operations', icon: FiTool, label: 'Platform Operations' },
                { path: '/adm/attention', icon: FiAlertTriangle, label: 'Attention' },
                { path: '/adm/health', icon: FaHeartbeat, label: 'Platform Health', healthIndicator: true },
            ],
        },
        {
            label: 'Identity',
            items: [
                { path: '/adm/users', icon: FiUsers, label: 'Users Manager' },
                { path: '/adm/operators', icon: FiLock, label: 'Platform Operators' },
            ],
        },
        {
            label: 'Consumer Product',
            items: [
                { path: '/adm/employer-applications', icon: FiBriefcase, label: 'Employer Applications' },
                { path: '/adm/jobs-manager', icon: FiLayers, label: 'Jobs Manager' },
                { path: '/adm/company-management', icon: FaRegBuilding, label: 'Company Management' },
                { path: '/adm/blog-management', icon: FiFileText, label: 'Blog Management' },
                { path: '/adm/landing-pages', icon: FiGlobe, label: 'Landing Pages' },
                { path: '/adm/reviews', icon: MdOutlineReviews, label: 'Reviews' },
                { path: '/adm/trustedby', icon: FiShield, label: 'Trusted by' },
                { path: '/adm/messages', icon: FiMail, label: 'Messages' },
                { path: '/adm/phrases', icon: FiType, label: 'Phrases' },
            ],
        },
    ];
    const homeItem = { path: '/', icon: FiHome, label: 'Home' };

    return (
        <>
            {/* Custom styles for global content adjustment (same as ProfileDisplay) */}
            <style jsx global>{`
                .dashboardContentWrapper,
                .dashboardGrid {
                    padding-left: 280px !important; /* Standard expanded width */
                    box-sizing: border-box !important;
                    transition: padding-left 0.3s ease !important;
                }

                .dashboardContentWrapper.sidebar-collapsed,
                .dashboardGrid.sidebar-collapsed {
                    padding-left: 70px !important; /* Standard collapsed width */
                }

                /* If you have a .dashboardGridLeft specific to the old layout and want to hide it */
                /* .dashboardGridLeft {
                    display: none !important;
                } */

                @media only screen and (max-width: 1050px) {
                    .dashboardContentWrapper,
                    .dashboardGrid {
                        padding-left: 0 !important; /* On smaller screens, default to no padding */
                    }

                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
                        /* On smaller screens, if collapsed, it might overlay or have specific behavior */
                        /* For now, let's assume it still pushes content if visible */
                        padding-left: 70px !important;
                    }
                }
            `}</style>

            {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" aria-label="Close admin navigation" onClick={onCloseMobile} />}
            <div
                className={`fixed left-0 top-0 bottom-0 h-screen bg-white border-r border-gray-100 z-50 flex flex-col transition-all duration-300 ease-in-out ${
                    sidebarCollapsed ? 'w-[70px] min-w-[70px]' : 'w-[280px]'
                } ${mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0'}`}>
                {/* Top Header Section */}
                <div className={`transition-all duration-300 ${sidebarCollapsed ? 'p-4' : 'px-6 py-5'}`}>
                    {sidebarCollapsed ? (
                        <div className="space-y-5">
                            <div className="flex justify-center">
                                <button
                                    onClick={toggleSidebar}
                                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Expand sidebar">
                                    <GoSidebarCollapse className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            <div className="flex justify-center">
                                <button
                                    onClick={onOpenCommandPalette}
                                    className="w-10 h-10 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Quick Actions (Ctrl+K)">
                                    <FiSearch className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                {/* Brand Name aligned with Enterprise Console */}
                                <Link to="/" className="flex items-center gap-2.5 group">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm shadow-indigo-600/20">R</span>
                                    <span className="font-bold text-[0.95rem] text-slate-900 group-hover:text-indigo-700 transition-colors tracking-tight">ResumePilot <span className="font-normal opacity-75">Admin</span></span>
                                </Link>

                                <button
                                    onClick={toggleSidebar}
                                    className="w-8 h-8 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center transition-colors duration-200 border border-slate-200/60"
                                    aria-label="Collapse sidebar">
                                    <GoSidebarExpand className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>
                            
                            {/* Quick Actions Search Bar */}
                            <button
                                type="button"
                                onClick={onOpenCommandPalette}
                                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 text-xs text-slate-500 font-medium transition cursor-pointer shadow-2xs"
                            >
                                <span className="flex items-center gap-2">
                                    <FiSearch className="h-3.5 w-3.5 text-slate-400" />
                                    Quick actions…
                                </span>
                                <kbd className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-400 shadow-2xs">
                                    ⌘K
                                </kbd>
                            </button>
                        </div>
                    )}
                </div>

                {/* Navigation Menu */}
                <div className="flex-1 overflow-y-auto">
                    {!sidebarCollapsed && (
                        <div className="px-6 py-2">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">NAVIGATION</p>
                        </div>
                    )}

                    <div className="px-3">
                        <Link to={homeItem.path} onClick={onCloseMobile}>
                            <div className={`group relative flex items-center text-[0.82rem] transition-all duration-200 rounded-lg mb-1 ${
                                location.pathname === homeItem.path
                                    ? 'bg-indigo-50/60 text-indigo-700 font-bold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-indigo-600 before:shadow-[0_0_6px_rgba(79,70,229,0.4)]'
                                    : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'
                            } ${sidebarCollapsed ? 'p-[10px] justify-center' : 'py-2.5 px-3.5'}`}>
                                <homeItem.icon className={`text-[1.1rem] min-w-[20px] transition-colors ${
                                    location.pathname === homeItem.path ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                                } ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                {!sidebarCollapsed && <span className="flex-1">{homeItem.label}</span>}
                            </div>
                        </Link>

                        {/* ── Settings Accordion ── */}
                        <div className="mb-1">
                            {/* Settings Header Row */}
                            <div
                                onClick={() => {
                                    if (sidebarCollapsed) {
                                        navigate('/adm/settings?tab=modulesSettings');
                                    } else {
                                        setSettingsOpen((prev) => !prev);
                                        if (!isSettingsPage) navigate('/adm/settings?tab=modulesSettings');
                                    }
                                }}
                                className={`group relative flex items-center text-[0.82rem] transition-all duration-200 rounded-lg cursor-pointer ${
                                    isSettingsPage
                                        ? 'bg-indigo-50/60 text-indigo-700 font-bold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-indigo-600 before:shadow-[0_0_6px_rgba(79,70,229,0.4)]'
                                        : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'
                                } ${sidebarCollapsed ? 'p-[10px] justify-center' : 'py-2.5 px-3.5'}`}
                            >
                                <FiSettings className={`text-[1.1rem] min-w-[20px] transition-colors ${
                                    isSettingsPage ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                                } ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                {!sidebarCollapsed && (
                                    <>
                                        <span className="flex-1">Settings</span>
                                        {settingsOpen
                                            ? <FiChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                            : <FiChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                    </>
                                )}
                            </div>

                            {/* Settings Sub-menu — only when expanded & sidebar not collapsed */}
                            {settingsOpen && !sidebarCollapsed && (
                                <div className="ml-4 mt-0.5 border-l-2 border-purple-100 pl-2 space-y-0">
                                    {SETTINGS_GROUPS.map((group) => {
                                        const isGroupCollapsed = collapsedGroups[group.label];
                                        const groupHasActive = group.items.some(i => i.key === activeTab);
                                        return (
                                            <div key={group.label}>
                                                {/* Group header */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(group.label)}
                                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left transition-all cursor-pointer mt-1 ${
                                                        groupHasActive ? 'text-purple-700' : 'text-gray-400 hover:text-gray-700'
                                                    }`}
                                                >
                                                    <span className="text-[9px] font-extrabold uppercase tracking-widest">{group.label}</span>
                                                    {isGroupCollapsed
                                                        ? <FiChevronRight className="w-2.5 h-2.5" />
                                                        : <FiChevronDown className="w-2.5 h-2.5" />}
                                                </button>
                                                {/* Group items */}
                                                {!isGroupCollapsed && group.items.map((item) => {
                                                    const Icon = item.icon;
                                                    const isActive = activeTab === item.key && isSettingsPage;
                                                    return (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() => handleSettingsTabClick(item.key)}
                                                            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                                                                isActive
                                                                    ? 'bg-purple-50 text-purple-700 font-bold border-l-2 border-purple-600 shadow-2xs'
                                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-transparent'
                                                            }`}
                                                        >
                                                            <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                                                            <span className="truncate">{item.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {navGroups.map(group => (
                            <div key={group.label} className="mb-2">
                                {!sidebarCollapsed && <p className="px-3 pt-3 pb-1 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">{group.label}</p>}
                                {group.items.map(item => (
                                    <Link to={item.path} key={item.path} onClick={onCloseMobile}>
                                        <div
                                            className={`group relative flex items-center text-[0.82rem] transition-all duration-200 rounded-lg mb-1 cursor-pointer ${
                                                location.pathname === item.path || location.pathname.startsWith(item.path)
                                                    ? 'bg-indigo-50/60 text-indigo-700 font-bold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-indigo-600 before:shadow-[0_0_6px_rgba(79,70,229,0.4)]'
                                                    : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'
                                            } ${sidebarCollapsed ? 'p-[10px] justify-center' : 'py-2 px-3.5'}`}
                                        >
                                            <item.icon className={`text-[1.1rem] min-w-[20px] transition-colors ${
                                                location.pathname === item.path || location.pathname.startsWith(item.path) ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                                            } ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                                            {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                                            {item.healthIndicator && (
                                                <span
                                                    className={`flex-none rounded-full ${healthDotClass} ${sidebarCollapsed ? 'absolute right-1.5 top-1.5 h-1.5 w-1.5' : 'h-2 w-2'}`}
                                                    role="img"
                                                    aria-label={healthDotLabel}
                                                    title={healthDotLabel}
                                                    data-testid="sidebar-health-indicator"
                                                    data-indicator={healthIndicator.state === 'ready' ? healthIndicator.indicator : healthIndicator.state}
                                                />
                                            )}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ))}

                        {/* Logout */}
                        <div
                            onClick={handleLogout}
                            className={`group flex items-center text-[0.82rem] font-medium transition-all duration-200 rounded-lg mb-1 cursor-pointer text-slate-600 hover:bg-red-50 hover:text-red-700 ${sidebarCollapsed ? 'p-[10px] justify-center' : 'py-2.5 px-3.5'}`}>
                            <FiLogOut className={`text-[1.1rem] min-w-[20px] transition-colors text-slate-400 group-hover:text-red-600 ${sidebarCollapsed ? 'mr-0' : 'mr-2.5'}`} />
                            {!sidebarCollapsed && <span className="flex-1">Logout</span>}
                        </div>
                    </div>
                </div>

                {/* Optional: Bottom Section (e.g., for dark mode, user profile, etc.) */}
                {/* If you need a bottom fixed section like ProfileDisplay's dark mode toggle, add it here */}
            </div>
        </>
    );
};

export default Sidebar;
