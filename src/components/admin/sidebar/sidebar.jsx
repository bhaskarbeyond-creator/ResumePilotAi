import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    FiHome, FiGrid, FiSettings, FiUsers, FiFileText,
    FiMail, FiLogOut, FiSearch, FiShield, FiBriefcase,
    FiLayers, FiGlobe, FiChevronDown, FiChevronRight, FiEdit,
} from 'react-icons/fi';
import {
    FaRegBuilding, FaCog, FaCreditCard, FaShareAlt, FaChartLine,
    FaFile, FaBullhorn, FaRobot, FaEnvelope, FaFilePdf, FaSearch as FaSearchIcon,
    FaMapMarkerAlt, FaPaintBrush, FaFileCode, FaShieldAlt, FaHeartbeat,
    FaFire, FaFacebook, FaCloud, FaLinkedin, FaStamp, FaCode,
    FaCookieBite, FaCommentAlt, FaGlobeAsia, FaBrain, FaCubes, FaReceipt,
} from 'react-icons/fa';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import { MdOutlineReviews } from 'react-icons/md';
import fire from '../../../conf/fire';
import { getSystemSettings } from '../../../firestore/dbOperations';

// Helper for status dots
const getStatusDotColor = (key, s) => {
    const activeFirebaseKey = s?.firebase?.apiKey || fire?.apps?.[0]?.options?.apiKey || import.meta.env.VITE_FIREBASE_KEY;
    const activeGeminiKey = s?.ai?.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY;
    const activeRazorpayKey = s?.payments?.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID;

    switch (key) {
        case 'modulesSettings': {
            const m = s?.modules || {};
            const ai = s?.ai || {};
            const on = m.enableImportModule !== undefined ? m.enableImportModule : ai.enableImportModule;
            return on ? 'bg-emerald-500' : 'bg-amber-400';
        }
        case 'firebaseSettings':
            return activeFirebaseKey ? 'bg-emerald-500' : 'bg-red-500';
        case 'aiSettings': {
            const ai = s?.ai || {};
            const p = ai.provider || 'gemini';
            if (p === 'nvidia' && (ai.nvidiaApiKey || import.meta.env.VITE_NVIDIA_API_KEY)) return 'bg-emerald-500';
            if (p === 'openai' && (ai.openaiApiKey || import.meta.env.VITE_OPENAI_API_KEY)) return 'bg-emerald-500';
            if (p === 'groq' && (ai.groqApiKey || import.meta.env.VITE_GROQ_API_KEY)) return 'bg-emerald-500';
            if (p === 'openrouter' && (ai.openrouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY)) return 'bg-emerald-500';
            if (p === 'deepseek' && (ai.deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY)) return 'bg-emerald-500';
            if (p === 'ollama') return 'bg-emerald-500';
            return activeGeminiKey ? 'bg-emerald-500' : 'bg-red-500';
        }
        case 'subscriptionsSettings':
        case 'paymentSettings':
            return (activeRazorpayKey || s?.payments?.stripePublishableKey) ? 'bg-emerald-500' : 'bg-amber-400';
        case 'geoSeoSettings':
            return s?.geoSeo?.enableGeoSeo !== false ? 'bg-emerald-500' : 'bg-red-500';
        case 'llmGeoSettings':
            return s?.llmGeo?.enableLlmGeo !== false ? 'bg-emerald-500' : 'bg-red-500';
        case 'facebookAuthSettings':
            if (!s?.facebook?.facebookAppId) return 'bg-amber-400';
            return s?.facebook?.enableFacebookLogin ? 'bg-emerald-500' : 'bg-amber-400';
        case 'socialAuthSettings':
            if (s?.socialAuth?.linkedinClientId && s?.socialAuth?.githubClientId) return 'bg-emerald-500';
            if (s?.socialAuth?.linkedinClientId || s?.socialAuth?.githubClientId) return 'bg-amber-400';
            return 'bg-amber-400';
        case 'emailSettings':
            return (s?.smtp?.username && s?.smtp?.password) ? 'bg-emerald-500' : 'bg-amber-400';
        case 'systemHealthSettings':
            return s?.systemHealth?.maintenanceMode ? 'bg-red-500' : 'bg-emerald-500';
        case 'codeInjectionSettings':
            return (s?.codeInjection?.headerScripts || s?.codeInjection?.footerScripts) ? 'bg-emerald-500' : 'bg-amber-400';
        case 'gdprLegalSettings':
            return s?.gdpr?.enableCookieBanner !== false ? 'bg-emerald-500' : 'bg-amber-400';
        case 'twilioSmsSettings':
            if (!s?.twilio?.accountSid) return 'bg-amber-400';
            return s?.twilio?.enableSmsAlerts ? 'bg-emerald-500' : 'bg-amber-400';
        case 'watermarkSettings':
            return s?.watermark?.enableFreeWatermark !== false ? 'bg-emerald-500' : 'bg-amber-400';
        case 'integrationsSettings':
            return (s?.integrations?.googleMapsApiKey || s?.integrations?.gaMeasurementId) ? 'bg-emerald-500' : 'bg-amber-400';
        default:
            return 'bg-emerald-500';
    }
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

const Sidebar = ({ sidebarCollapsed: initialSidebarCollapsed, onSidebarToggle: notifyParentOfToggle }) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        localStorage.getItem('adminSidebarCollapsed') === 'true'
    );
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState(() =>
        Object.fromEntries(SETTINGS_GROUPS.map(g => [g.label, true]))
    );
    const location = useLocation();
    const navigate = useNavigate();

    const isSettingsPage = location.pathname.startsWith('/adm/settings');
    const searchParams = new URLSearchParams(location.search);
    const activeTab = searchParams.get('tab') || 'modulesSettings';

    const [systemSettings, setSystemSettings] = useState(null);

    useEffect(() => {
        getSystemSettings().then((s) => { if (s) setSystemSettings(s); });
        const updateListener = () => {
            getSystemSettings().then((s) => { if (s) setSystemSettings(s); });
        };
        window.addEventListener('systemSettingsUpdated', updateListener);
        return () => window.removeEventListener('systemSettingsUpdated', updateListener);
    }, []);

    // Auto-open settings accordion when on settings page
    useEffect(() => {
        if (isSettingsPage) setSettingsOpen(true);
    }, [isSettingsPage]);

    useEffect(() => {
        const savedState = localStorage.getItem('adminSidebarCollapsed');
        let isCollapsed = false;
        if (savedState !== null) {
            isCollapsed = savedState === 'true';
        } else if (initialSidebarCollapsed !== undefined) {
            isCollapsed = initialSidebarCollapsed;
        }
        setSidebarCollapsed(isCollapsed);
        if (notifyParentOfToggle) notifyParentOfToggle(isCollapsed);
        toggleContentAreaClasses(isCollapsed);
    }, []);

    useEffect(() => {
        localStorage.setItem('adminSidebarCollapsed', sidebarCollapsed);
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

    const navItems = [
        { path: '/', icon: FiHome, label: 'Home' },
        { path: '/adm/dashboard', icon: FiGrid, label: 'Dashboard' },
        { path: '/adm/users', icon: FiUsers, label: 'Users Manager' },
        { path: '/adm/employer-applications', icon: FiBriefcase, label: 'Employer Applications' },
        { path: '/adm/jobs-manager', icon: FiLayers, label: 'Jobs Manager' },
        { path: '/adm/company-management', icon: FaRegBuilding, label: 'Company Management' },
        { path: '/adm/blog-management', icon: FiFileText, label: 'Blog Management' },
        { path: '/adm/landing-pages', icon: FiGlobe, label: 'Landing Pages' },
        { path: '/adm/reviews', icon: MdOutlineReviews, label: 'Reviews' },
        { path: '/adm/trustedby', icon: FiShield, label: 'Trusted by' },
        { path: '/adm/messages', icon: FiMail, label: 'Messages' },
    ];

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

            <div
                className={`fixed left-0 top-0 bottom-0 h-screen bg-white border-r border-gray-100 z-50 flex flex-col transition-all duration-300 ease-in-out ${
                    sidebarCollapsed ? 'w-[70px] min-w-[70px]' : 'w-[280px]'
                }`}>
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
                            {/* Optional: Search Icon placeholder like ProfileDisplay */}
                            <div className="flex justify-center">
                                <button
                                    // onClick={toggleSidebar} // Or some search action
                                    className="w-10 h-10 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Search">
                                    <FiSearch className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                {/* Brand Name - changed from Nolito SVG to text */}
                                <Link to="/" className="flex items-center gap-2 group">
                                    <span className="font-semibold text-xl text-gray-900 group-hover:text-purple-700 transition-colors">ResumePilot Admin</span>
                                </Link>

                                <button
                                    onClick={toggleSidebar}
                                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Collapse sidebar">
                                    <GoSidebarExpand className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            {/* Optional: Search Bar - omitted to keep functionality closer to original Sidebar */}
                            {/* If you want it, copy from ProfileDisplay */}
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
                        {/* Home & Dashboard */}
                        {navItems.slice(0, 2).map((item) => (
                            <Link to={item.path} key={item.path}>
                                <div className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                                        ? 'bg-purple-100 text-purple-700 font-medium'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                                } ${sidebarCollapsed ? 'p-3 justify-center' : 'p-3'}`}>
                                    <item.icon className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                                </div>
                            </Link>
                        ))}

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
                                className={`flex items-center text-sm transition-all duration-200 rounded-lg cursor-pointer ${
                                    isSettingsPage
                                        ? 'bg-purple-100 text-purple-700 font-medium'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                                } ${sidebarCollapsed ? 'p-3 justify-center' : 'p-3'}`}
                            >
                                <FiSettings className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
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
                                                    const dotColor = getStatusDotColor(item.key, systemSettings);
                                                    return (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() => handleSettingsTabClick(item.key)}
                                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-all cursor-pointer ${
                                                                isActive
                                                                    ? 'bg-purple-100 text-purple-700 font-semibold'
                                                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                                            }`}
                                                        >
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} title={item.label} />
                                                            <Icon className="w-3 h-3 shrink-0" />
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

                        {/* Rest of nav items */}
                        {navItems.slice(2).map((item) => (
                            <Link to={item.path} key={item.path}>
                                <div className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                    location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                                        ? 'bg-purple-100 text-purple-700 font-medium'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                                } ${sidebarCollapsed ? 'p-3 justify-center' : 'p-3'}`}>
                                    <item.icon className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                                </div>
                            </Link>
                        ))}

                        {/* Logout */}
                        <div
                            onClick={handleLogout}
                            className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 cursor-pointer text-gray-600 hover:bg-red-50 hover:text-red-700 ${sidebarCollapsed ? 'p-3 justify-center' : 'p-3'}`}>
                            <FiLogOut className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
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
