import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiGrid, FiSettings, FiUsers, FiFileText, FiMail, FiLogOut, FiSearch, FiShield, FiBriefcase, FiLayers, FiGlobe, FiChevronDown, FiChevronRight, FiEdit, FiActivity, FiLock, FiTool, FiAlertTriangle, FiType, FiExternalLink, FiHelpCircle } from 'react-icons/fi';
import { FaRegBuilding, FaCog, FaCreditCard, FaShareAlt, FaChartLine, FaFile, FaBullhorn, FaRobot, FaEnvelope, FaFilePdf, FaSearch as FaSearchIcon, FaMapMarkerAlt, FaPaintBrush, FaFileCode, FaShieldAlt, FaHeartbeat, FaFire, FaFacebook, FaCloud, FaLinkedin, FaStamp, FaCode, FaCookieBite, FaCommentAlt, FaGlobeAsia, FaBrain, FaCubes, FaReceipt, FaServer, FaDatabase } from 'react-icons/fa';
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
    { label: 'Modules & Addons', icon: FaCubes, badgeColor: 'bg-indigo-50 text-indigo-600 border-indigo-100', items: [
        { key: 'modulesSettings', label: 'Addon Modules', icon: FaCubes },
    ]},
    { label: 'General & Branding', icon: FaCog, badgeColor: 'bg-blue-50 text-blue-600 border-blue-100', items: [
        { key: 'websiteSettings', label: 'Brand Identity & Meta', icon: FaCog },
        { key: 'brandingSettings', label: 'Branding & Assets', icon: FaPaintBrush },
        { key: 'geoSeoSettings', label: 'Indian Geo-SEO', icon: FaGlobeAsia },
        { key: 'llmGeoSettings', label: 'LLM GEO (AI Search)', icon: FaBrain },
        { key: 'firebaseSettings', label: 'Firebase Identity', icon: FaFire },
        { key: 'databaseSettings', label: 'Database & Persistence Engine', icon: FaDatabase },
        { key: 'socialAuthSettings', label: 'Social Sign-On & OAuth', icon: FaFacebook },
        { key: 'emailSettings', label: 'Email & SMTP', icon: FaEnvelope },
    ]},
    { label: 'AI Engine & Services', icon: FaRobot, badgeColor: 'bg-violet-50 text-violet-600 border-violet-100', items: [
        { key: 'storageSettings', label: 'Cloud Storage', icon: FaCloud },
        { key: 'aiSettings', label: 'AI & Gemini Providers', icon: FaRobot },
        { key: 'exportPdfSettings', label: 'PDF Exporter', icon: FaFilePdf },
        { key: 'jobScraperSettings', label: 'Job & Naukri Scraper', icon: FaSearchIcon },
        { key: 'twilioSmsSettings', label: 'Twilio SMS Gateway', icon: FaCommentAlt },
    ]},
    { label: 'Payments & Gateways', icon: FaCreditCard, badgeColor: 'bg-emerald-50 text-emerald-600 border-emerald-100', items: [
        { key: 'ordersManagement', label: 'Orders & Transactions', icon: FaReceipt },
        { key: 'subscriptionsSettings', label: 'Subscriptions & Gateways', icon: FaCreditCard },
        { key: 'watermarkSettings', label: 'PDF Watermark', icon: FaStamp },
    ]},
    { label: 'Security & Health', icon: FaShieldAlt, badgeColor: 'bg-rose-50 text-rose-600 border-rose-100', items: [
        { key: 'integrationsSettings', label: 'Maps & API Keys', icon: FaMapMarkerAlt },
        { key: 'securityLimitsSettings', label: 'Security & Limits', icon: FaShieldAlt },
        { key: 'systemHealthSettings', label: 'System Health', icon: FaHeartbeat },
        { key: 'featureFlagsSettings', label: 'Feature Flags', icon: FaCode },
        { key: 'platformConfigSettings', label: 'Platform Config', icon: FaServer },
        { key: 'codeInjectionSettings', label: 'Code Injection', icon: FaCode },
        { key: 'gdprLegalSettings', label: 'GDPR & Legal Compliance', icon: FaCookieBite },
    ]},
    { label: 'Content & Media', icon: FaFileCode, badgeColor: 'bg-amber-50 text-amber-600 border-amber-100', items: [
        { key: 'templateManagerSettings', label: 'Templates Manager', icon: FaFileCode },
        { key: 'pages', label: 'Pages & CMS', icon: FaFile },
        { key: 'blog', label: 'Blog Engine', icon: FiEdit },
        { key: 'socialSettings', label: 'Social Channels', icon: FaShareAlt },
        { key: 'analytics', label: 'Analytics & Tracking', icon: FaChartLine },
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
                { path: '/adm/dashboard', icon: FiGrid, label: 'Command Center', badgeColor: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                { path: '/adm/tenants', icon: FaServer, label: 'Tenants Registry', badgeColor: 'bg-sky-50 text-sky-600 border-sky-100' },
                { path: '/adm/audit-logs', icon: FiShield, label: 'Admin Audit Trail', badgeColor: 'bg-purple-50 text-purple-600 border-purple-100' },
                { path: '/adm/security', icon: FiLock, label: 'Security Events', badgeColor: 'bg-rose-50 text-rose-600 border-rose-100' },
                { path: '/adm/queues', icon: FiActivity, label: 'Queue & DLQ Monitor', badgeColor: 'bg-amber-50 text-amber-600 border-amber-100' },
                { path: '/adm/operations', icon: FiTool, label: 'Platform Operations', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200' },
                { path: '/adm/attention', icon: FiAlertTriangle, label: 'Attention', badgeColor: 'bg-orange-50 text-orange-600 border-orange-100' },
                { path: '/adm/health', icon: FaHeartbeat, label: 'Platform Health', healthIndicator: true, badgeColor: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
            ],
        },
        {
            label: 'Identity',
            items: [
                { path: '/adm/users', icon: FiUsers, label: 'Users Manager', badgeColor: 'bg-blue-50 text-blue-600 border-blue-100' },
                { path: '/adm/operators', icon: FiLock, label: 'Platform Operators', badgeColor: 'bg-teal-50 text-teal-600 border-teal-100' },
            ],
        },
        {
            label: 'Consumer Product',
            items: [
                { path: '/adm/employer-applications', icon: FiBriefcase, label: 'Employer Applications', badgeColor: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
                { path: '/adm/jobs-manager', icon: FiLayers, label: 'Jobs Manager', badgeColor: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                { path: '/adm/company-management', icon: FaRegBuilding, label: 'Company Management', badgeColor: 'bg-violet-50 text-violet-600 border-violet-100' },
                { path: '/adm/blog-management', icon: FiFileText, label: 'Blog Management', badgeColor: 'bg-amber-50 text-amber-600 border-amber-100' },
                { path: '/adm/landing-pages', icon: FiGlobe, label: 'Landing Pages', badgeColor: 'bg-sky-50 text-sky-600 border-sky-100' },
                { path: '/adm/reviews', icon: MdOutlineReviews, label: 'Reviews', badgeColor: 'bg-pink-50 text-pink-600 border-pink-100' },
                { path: '/adm/trustedby', icon: FiShield, label: 'Trusted by', badgeColor: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
                { path: '/adm/messages', icon: FiMail, label: 'Messages', badgeColor: 'bg-purple-50 text-purple-600 border-purple-100' },
                { path: '/adm/help-desk', icon: FiHelpCircle, label: 'Help Desk', badgeColor: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                { path: '/adm/phrases', icon: FiType, label: 'Phrases', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200' },
            ],
        },
    ];

    return (
        <>
            {/* Custom styles for global content adjustment (same as ProfileDisplay) */}
            <style>{`
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

                @media only screen and (max-width: 1050px) {
                    .dashboardContentWrapper,
                    .dashboardGrid {
                        padding-left: 0 !important; /* On smaller screens, default to no padding */
                    }

                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
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
                                <Link to="/adm/dashboard" className="flex items-center gap-2.5 group">
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
                <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-4">
                    {/* Primary Navigation Groups */}
                    {navGroups.map(group => (
                        <div key={group.label}>
                            {!sidebarCollapsed && (
                                <div className="px-2 pt-1 pb-1">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{group.label}</p>
                                </div>
                            )}
                            <div className="space-y-0.5">
                                {group.items.map(item => {
                                    const isCurrent = location.pathname === item.path || (item.path !== '/adm/dashboard' && location.pathname.startsWith(item.path));
                                    return (
                                        <Link to={item.path} key={item.path} onClick={onCloseMobile}>
                                            <div
                                                className={`group relative flex items-center text-[0.84rem] transition-all duration-200 rounded-xl cursor-pointer ${
                                                    isCurrent
                                                        ? 'bg-indigo-50/90 text-indigo-950 font-extrabold border border-indigo-200/70 shadow-2xs before:absolute before:inset-y-1.5 before:left-0 before:w-[3.5px] before:rounded-r-[3px] before:bg-indigo-600'
                                                        : 'text-slate-700 font-bold hover:bg-slate-50 hover:text-slate-950'
                                                } ${sidebarCollapsed ? 'p-[9px] justify-center' : 'py-2 px-3'}`}
                                            >
                                                <div className={`flex items-center justify-center shrink-0 rounded-lg transition-all ${
                                                    sidebarCollapsed ? 'w-8 h-8' : 'w-7 h-7 mr-2.5'
                                                } ${isCurrent ? 'bg-indigo-600 text-white shadow-xs' : `${item.badgeColor || 'bg-slate-100 text-slate-600 border-slate-200'} border group-hover:scale-105`}`}>
                                                    <item.icon className="text-[0.95rem]" />
                                                </div>
                                                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                                                {item.healthIndicator && (
                                                    <span
                                                        className={`flex-none rounded-full ${healthDotClass} ${sidebarCollapsed ? 'absolute right-1.5 top-1.5 h-2 w-2 ring-2 ring-white' : 'h-2 w-2'}`}
                                                        role="img"
                                                        aria-label={healthDotLabel}
                                                        title={healthDotLabel}
                                                        data-testid="sidebar-health-indicator"
                                                        data-indicator={healthIndicator.state === 'ready' ? healthIndicator.indicator : healthIndicator.state}
                                                    />
                                                )}
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* ── System Settings Section ── */}
                    <div>
                        {!sidebarCollapsed && (
                            <div className="px-2 pt-1 pb-1">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">SYSTEM CONFIGURATION</p>
                            </div>
                        )}
                        <div className="space-y-1">
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
                                className={`group relative flex items-center text-[0.84rem] transition-all duration-200 rounded-xl cursor-pointer ${
                                    isSettingsPage
                                        ? 'bg-indigo-50/90 text-indigo-950 font-extrabold border border-indigo-200/70 shadow-2xs before:absolute before:inset-y-1.5 before:left-0 before:w-[3.5px] before:rounded-r-[3px] before:bg-indigo-600'
                                        : 'text-slate-700 font-bold hover:bg-slate-50 hover:text-slate-950'
                                } ${sidebarCollapsed ? 'p-[9px] justify-center' : 'py-2 px-3'}`}
                            >
                                <div className={`flex items-center justify-center shrink-0 rounded-lg transition-all ${
                                    sidebarCollapsed ? 'w-8 h-8' : 'w-7 h-7 mr-2.5'
                                } ${isSettingsPage ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 border border-slate-200 group-hover:scale-105'}`}>
                                    <FiSettings className="text-[0.95rem]" />
                                </div>
                                {!sidebarCollapsed && (
                                    <>
                                        <span className="flex-1 truncate">Platform Settings</span>
                                        {settingsOpen
                                            ? <FiChevronDown className="w-3.5 h-3.5 text-slate-500 transition-transform duration-200" />
                                            : <FiChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" />}
                                    </>
                                )}
                            </div>

                            {/* Modernized Settings Category Sub-menu */}
                            {settingsOpen && !sidebarCollapsed && (
                                <div className="ml-3 mt-1.5 border-l-2 border-indigo-100 pl-2 space-y-1 animate-fade-in">
                                    {SETTINGS_GROUPS.map((group) => {
                                        const isGroupCollapsed = collapsedGroups[group.label];
                                        const groupHasActive = group.items.some(i => i.key === activeTab);
                                        const GroupIcon = group.icon;
                                        return (
                                            <div key={group.label} className="rounded-xl overflow-hidden bg-slate-50/60 border border-slate-200/60 mb-1">
                                                {/* Group header button */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(group.label)}
                                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition-all cursor-pointer ${
                                                        groupHasActive ? 'bg-indigo-50/80 text-indigo-900 font-extrabold' : 'text-slate-700 font-bold hover:bg-slate-100/80'
                                                    }`}
                                                >
                                                    <span className="flex items-center gap-2 text-xs">
                                                        <GroupIcon className={`w-3 h-3 ${groupHasActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                                                        <span className="font-bold text-[11px]">{group.label}</span>
                                                    </span>
                                                    {isGroupCollapsed
                                                        ? <FiChevronRight className="w-3 h-3 text-slate-400" />
                                                        : <FiChevronDown className="w-3 h-3 text-indigo-600" />}
                                                </button>
                                                {/* Group items */}
                                                {!isGroupCollapsed && (
                                                    <div className="bg-white p-1 space-y-0.5 border-t border-slate-200/50">
                                                        {group.items.map((item) => {
                                                            const Icon = item.icon;
                                                            const isActive = activeTab === item.key && isSettingsPage;
                                                            return (
                                                                <button
                                                                    key={item.key}
                                                                    type="button"
                                                                    onClick={() => handleSettingsTabClick(item.key)}
                                                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                                                                        isActive
                                                                            ? 'bg-indigo-50 text-indigo-700 font-extrabold border-l-2 border-indigo-600 shadow-2xs'
                                                                            : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900 border-l-2 border-transparent'
                                                                    }`}
                                                                >
                                                                    <Icon className={`w-3 h-3 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                                                                    <span className="truncate text-[11px]">{item.label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Utilities Section: Public Portal & Sign Out ── */}
                    <div>
                        {!sidebarCollapsed && (
                            <div className="px-2 pt-1 pb-1">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">PORTAL UTILITIES</p>
                            </div>
                        )}
                        <div className="space-y-0.5">
                            {/* Live Public Website Link */}
                            <Link to="/" onClick={onCloseMobile}>
                                <div className={`group flex items-center text-[0.84rem] font-bold transition-all duration-200 rounded-xl text-slate-700 hover:bg-slate-50 hover:text-slate-950 ${sidebarCollapsed ? 'p-[9px] justify-center' : 'py-2 px-3'}`}>
                                    <div className={`flex items-center justify-center shrink-0 rounded-lg transition-all ${
                                        sidebarCollapsed ? 'w-8 h-8' : 'w-7 h-7 mr-2.5'
                                    } bg-slate-100 text-slate-600 border border-slate-200 group-hover:scale-105`}>
                                        <FiExternalLink className="text-[0.95rem]" />
                                    </div>
                                    {!sidebarCollapsed && (
                                        <div className="flex items-center justify-between flex-1">
                                            <span className="truncate">Public Website</span>
                                            <span className="text-[9px] uppercase font-bold text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">Live</span>
                                        </div>
                                    )}
                                </div>
                            </Link>

                            {/* Sign Out */}
                            <div
                                onClick={handleLogout}
                                className={`group flex items-center text-[0.84rem] font-bold transition-all duration-200 rounded-xl cursor-pointer text-slate-700 hover:bg-rose-50 hover:text-rose-700 ${sidebarCollapsed ? 'p-[9px] justify-center' : 'py-2 px-3'}`}>
                                <div className={`flex items-center justify-center shrink-0 rounded-lg transition-all ${
                                    sidebarCollapsed ? 'w-8 h-8' : 'w-7 h-7 mr-2.5'
                                } bg-rose-50 text-rose-600 border border-rose-100 group-hover:scale-105`}>
                                    <FiLogOut className="text-[0.95rem]" />
                                </div>
                                {!sidebarCollapsed && <span className="flex-1 truncate">Sign Out</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
