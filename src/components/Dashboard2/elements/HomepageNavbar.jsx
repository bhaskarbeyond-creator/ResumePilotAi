import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { checkIfAdmin, getSystemSettings } from '../../../firestore/dbOperations';
import logo from '../../../assets/logo/logo.png';
import { FaEnvelope, FaBars, FaTimes, FaChevronDown, FaArrowRight, FaShieldAlt, FaSmile, FaLifeRing, FaBook, FaVideo, FaUsers, FaGraduationCap, FaNewspaper, FaQuestionCircle, FaExternalLinkAlt, FaDownload, FaHeart, FaPlay, FaStar, FaRocket, FaFileAlt, FaSignOutAlt } from 'react-icons/fa';
import { FiTarget, FiTrendingUp, FiAward, FiFileText, FiZap, FiEdit3 } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import HomepageLanguages from './HomepageLanguages';
const HomepageNavbar = ({ authBtnHandler, user, logout }) => {
    const { t } = useTranslation('common');
    const [isOpen, setIsOpen] = useState(false);
    const [featuresOpen, setFeaturesOpen] = useState(false);
    const [_resourcesOpen, setResourcesOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [activeMobileDropdown, setActiveMobileDropdown] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [enableJobScraperModule, setEnableJobScraperModule] = useState(true);

    useEffect(() => {
        const loadModules = (event) => {
            if (event?.detail?.modules) {
                const m = event.detail.modules;
                if (m.enableJobScraperModule !== undefined) {
                    setEnableJobScraperModule(m.enableJobScraperModule === true);
                }
                return;
            }
            getSystemSettings().then((settings) => {
                const m = settings?.modules || {};
                if (m.enableJobScraperModule !== undefined) {
                    setEnableJobScraperModule(m.enableJobScraperModule === true);
                }
            }).catch(() => {});
        };
        loadModules();
        window.addEventListener('systemSettingsUpdated', loadModules);
        return () => window.removeEventListener('systemSettingsUpdated', loadModules);
    }, []);
    // Refs for managing dropdown hover states
    const featuresTimeoutRef = useRef(null);
    const resourcesTimeoutRef = useRef(null);
    const featuresDropdownRef = useRef(null);
    const resourcesDropdownRef = useRef(null);

    // Note: Language initialization is now handled globally in main.jsx
    // This effect is kept for backward compatibility but does nothing
    useEffect(() => {
        // Language initialization is now handled globally - no action needed
    }, [user]);

    useEffect(() => {
        if (user) {
            checkIfAdmin(user.uid)
                .then((isAdminUser) => {
                    setIsAdmin(isAdminUser);
                })
                .catch((_error) => {
                    setIsAdmin(false);
                });
        } else {
            setIsAdmin(false);
        }
    }, [user]);
    // Scroll effect
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (featuresDropdownRef.current && !featuresDropdownRef.current.contains(event.target)) {
                clearTimeout(featuresTimeoutRef.current);
                setFeaturesOpen(false);
            }
            if (resourcesDropdownRef.current && !resourcesDropdownRef.current.contains(event.target)) {
                clearTimeout(resourcesTimeoutRef.current);
                setResourcesOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            // Cleanup timeouts when component unmounts
            clearTimeout(featuresTimeoutRef.current);
            clearTimeout(resourcesTimeoutRef.current);
        };
    }, []);

    // Compact and refined features data
    const featuresData = [
        {
            icon: FiTarget,
            title: t('navbar.features.atsOptimization.title'),
            description: t('navbar.features.atsOptimization.description'),
            gradient: 'from-violet-500 to-purple-600',
            href: '/features/ats-optimization',
            badge: t('navbar.features.atsOptimization.badge'),
            popular: true,
        },
        {
            icon: FiEdit3,
            title: t('navbar.features.aiBuilder.title'),
            description: t('navbar.features.aiBuilder.description'),
            gradient: 'from-emerald-500 to-teal-600',
            href: '/features/ai-builder',
            badge: t('navbar.features.aiBuilder.badge'),
        },
        {
            icon: FiTrendingUp,
            title: t('navbar.features.templates.title'),
            description: t('navbar.features.templates.description'),
            gradient: 'from-blue-500 to-indigo-600',
            href: '/features/templates',
        },

        {
            icon: FaShieldAlt,
            title: t('navbar.features.security.title'),
            description: t('navbar.features.security.description'),
            gradient: 'from-green-500 to-emerald-600',
            href: '/features/security',
            badge: t('navbar.features.security.badge'),
        }
    ];

    // Dropdown hover handlers with delays for better UX
    const handleDropdownEnter = (dropdown) => {
        if (dropdown === 'features') {
            clearTimeout(featuresTimeoutRef.current);
            setFeaturesOpen(true);
        } else if (dropdown === 'resources') {
            clearTimeout(resourcesTimeoutRef.current);
            setResourcesOpen(true);
        }
    };

    const handleDropdownLeave = (dropdown) => {
        if (dropdown === 'features') {
            clearTimeout(featuresTimeoutRef.current);
            featuresTimeoutRef.current = setTimeout(() => {
                setFeaturesOpen(false);
            }, 200);
        } else if (dropdown === 'resources') {
            clearTimeout(resourcesTimeoutRef.current);
            resourcesTimeoutRef.current = setTimeout(() => {
                setResourcesOpen(false);
            }, 200);
        }
    };

    const clearStorage = (e) => {
        e.preventDefault();
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
        window.location.href = '/';
    };

    const toggleMobileDropdown = (dropdown) => {
        setActiveMobileDropdown(activeMobileDropdown === dropdown ? null : dropdown);
    };

    return (
        <nav
            className={`fixed top-0 w-full z-[10000] transition-all duration-300 ${
                scrolled ? 'bg-white/98 backdrop-blur-md border-b border-gray-200 shadow-sm' : 'bg-white border-b border-gray-100'
            }`}>
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex-shrink-0">
                        <Link to="/" onClick={clearStorage} className="flex items-center transition-opacity hover:opacity-80">
                            <img className="h-10 w-auto" src={logo} alt="ResumePilot" />
                        </Link>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="desktop-nav-container lg:block">
                        <div className="flex items-center flex-1 justify-center">
                            <div className="flex items-center space-x-8">
                                {/* Home Link */}
                                <Link 
                                    to="/" 
                                    onClick={clearStorage} 
                                    className="text-gray-700 hover:text-purple-600 font-medium transition-colors duration-200 relative group"
                                >
                                    {t('navbar.home')}
                                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-purple-600 transition-all duration-200 group-hover:w-full"></span>
                                </Link>

                                {/* Features Dropdown */}
                                <div className="relative" ref={featuresDropdownRef}>
                                    <button
                                        className="flex items-center text-gray-700 hover:text-purple-600 font-medium transition-colors duration-200 relative group"
                                        onMouseEnter={() => handleDropdownEnter('features')}
                                        onMouseLeave={() => handleDropdownLeave('features')}>
                                        {t('navbar.featuresNav')}
                                        <FaChevronDown className={`ml-2 w-3 h-3 transition-transform duration-200 ${featuresOpen ? 'rotate-180' : ''}`} />
                                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-purple-600 transition-all duration-200 group-hover:w-full"></span>
                                    </button>

                                    {/* Features Dropdown */}
                                    {featuresOpen && (
                                        <div
                                            className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 opacity-100 visible transition-all duration-200 animate-fadeIn"
                                            onMouseEnter={() => handleDropdownEnter('features')}
                                            onMouseLeave={() => handleDropdownLeave('features')}>
                                            <div className="w-[480px] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
                                                {/* Compact Header */}
                                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                                                                <FaRocket className="text-purple-500 mr-1.5 w-3 h-3" />
                                                                {t('navbar.resumeBuilderFeatures')}
                                                            </h3>
                                                            <p className="text-gray-500 text-xs mt-0.5">{t('navbar.featureTagline')}</p>
                                                        </div>
                                                        <div className="flex items-center text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-md">
                                                            <FaHeart className="text-red-500 mr-1 w-2.5 h-2.5" />
                                                            <span className="font-medium text-xs">{t('navbar.userCount')}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Features Grid */}
                                                <div className="p-4">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {featuresData.map((feature, index) => (
                                                            <div
                                                                key={index}
                                                                className="group/item cursor-pointer relative p-3 rounded-lg hover:bg-purple-50 transition-all duration-200 border border-transparent hover:border-purple-200">
                                                                {/* Badge */}
                                                                {feature.badge && (
                                                                    <div className="absolute -top-0.5 -right-0.5 z-10">
                                                                        <span
                                                                            className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded-md text-white ${
                                                                                feature.badge === 'Smart'
                                                                                    ? 'bg-purple-500'
                                                                                    : feature.badge === 'AI'
                                                                                    ? 'bg-emerald-500'
                                                                                    : feature.badge === 'Secure'
                                                                                    ? 'bg-blue-500'
                                                                                    : feature.badge === 'Pro'
                                                                                    ? 'bg-orange-500'
                                                                                    : 'bg-gray-500'
                                                                            }`}>
                                                                            {feature.badge}
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* Popular indicator */}
                                                                {feature.popular && (
                                                                    <div className="absolute -top-2 left-1 flex items-center text-xs font-medium text-purple-600">
                                                                        <FaStar className="w-2.5 h-2.5 mr-0.5" />
                                                                        <span className="text-xs">{t('navbar.popular')}</span>
                                                                    </div>
                                                                )}

                                                                <div className="flex items-start space-x-2.5">
                                                                    {/* Icon */}
                                                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${feature.gradient} flex items-center justify-center`}>
                                                                        <feature.icon className="w-3.5 h-3.5 text-white" />
                                                                    </div>

                                                                    {/* Content */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <h4 className="font-medium text-gray-900 text-xs mb-0.5 group-hover/item:text-purple-600 transition-colors duration-200">
                                                                            {feature.title}
                                                                        </h4>
                                                                        <p className="text-xs text-gray-500 leading-tight">{feature.description}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* CTA */}
                                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                                        <div className="flex items-center justify-between">
                                                            <Link
                                                                to="/features"
                                                                className="inline-flex items-center px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 font-medium text-xs group/cta">
                                                                <FiZap className="mr-1.5 w-3 h-3" />
                                                                {t('navbar.exploreFeatures')}
                                                                <FaArrowRight className="ml-1.5 w-2.5 h-2.5 group-hover/cta:translate-x-0.5 transition-transform duration-200" />
                                                            </Link>

                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-500">⚡ {t('navbar.startBuilding')}</div>
                                                                <div className="font-medium text-purple-600 text-xs">{t('navbar.freeToTry')}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {enableJobScraperModule && (
                                    <a 
                                        href="/jobs" 
                                        className="text-gray-700 hover:text-purple-600 font-medium transition-colors duration-200 relative group"
                                    >
                                        {t('JobsUpdate.JobsLandingHero.badge')}
                                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-purple-600 transition-all duration-200 group-hover:w-full"></span>
                                    </a>
                                )}

                                {/* Blog Link */}
                                <Link 
                                    to="/blog" 
                                    className="text-gray-700 hover:text-purple-600 font-medium transition-colors duration-200 relative group"
                                >
                                    {t('navbar.blog', 'Blog')}
                                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-purple-600 transition-all duration-200 group-hover:w-full"></span>
                                </Link>

                                {/* Pricing Link */}
                                <Link 
                                    to="/billing/plans" 
                                    className="text-gray-700 hover:text-purple-600 font-medium transition-colors duration-200 relative group"
                                >
                                    {t('navbar.pricing')}
                                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-purple-600 transition-all duration-200 group-hover:w-full"></span>
                                </Link>

                                {/* Enterprise Link */}
                                <Link 
                                    to="/enterprise" 
                                    className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors duration-200 relative group"
                                >
                                    Enterprise
                                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-indigo-600 transition-all duration-200 group-hover:w-full"></span>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Auth Buttons */}
                    <div className="desktop-auth-container lg:flex items-center space-x-6">
                        {user && isAdmin && (
                            <Link 
                                to="/adm/dashboard" 
                                className="text-gray-700 hover:text-purple-600 font-medium transition-colors duration-200 relative group"
                            >
                                {t('selectionAction.admin')}
                                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-purple-600 transition-all duration-200 group-hover:w-full"></span>
                            </Link>
                        )}
                        
                        <HomepageLanguages />
                        
                        {user ? (
                            <>
                                <button 
                                    onClick={() => logout && logout()} 
                                    className="flex items-center text-gray-700 hover:text-red-600 font-medium transition-colors duration-200 group"
                                >
                                    <FaSignOutAlt className="mr-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                                    {t('navbar.signOut')}
                                </button>
                                
                                <Link
                                    to="/dashboard"
                                    className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
                                >
                                    {user.plan || t('navbar.dashboard')}
                                    <FiTarget className="ml-2 w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                                </Link>
                            </>
                        ) : (
                            <button
                                onClick={() => authBtnHandler && authBtnHandler()}
                                className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
                            >
                                {t('navbar.signIn')}
                                <FiZap className="ml-2 w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
                            </button>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <div className="lg:hidden flex items-center space-x-4">
                        <HomepageLanguages />
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50 transition-all duration-200"
                            aria-label="Toggle menu">
                            {isOpen ? <FaTimes className="w-5 h-5" /> : <FaBars className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Navigation Menu */}
                <div className={`lg:hidden transition-all duration-300 ${isOpen ? 'max-h-[80vh] opacity-100 visible overflow-y-auto' : 'max-h-0 opacity-0 invisible overflow-hidden'}`}>
                    <div className="px-6 pt-4 pb-6 space-y-4 bg-white rounded-2xl mt-4 border border-gray-200 shadow-xl mx-4">
                        {/* Mobile Links */}
                        <Link to="/" onClick={clearStorage} className="block px-3 py-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50/70 transition-all duration-300 font-medium">
                            {t('navbar.home')}
                        </Link>

                        {/* Mobile Features */}
                        <div className="space-y-2">
                            <button
                                onClick={() => toggleMobileDropdown('features')}
                                className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50/70 transition-all duration-300 font-medium">
                                {t('navbar.featuresNav')}
                                <FaChevronDown className={`w-3 h-3 transition-transform duration-300 ${activeMobileDropdown === 'features' ? 'rotate-180' : ''}`} />
                            </button>

                            {activeMobileDropdown === 'features' && (
                                <div className="pl-2 sm:pl-4 space-y-2 animate-fadeIn">
                                    {featuresData.slice(0, 4).map((feature, index) => (
                                        <Link key={index} to={feature.href} className="flex items-center space-x-3 px-2 sm:px-3 py-2 rounded-lg hover:bg-purple-50/70 transition-all duration-300">
                                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-r ${feature.gradient} flex items-center justify-center`}>
                                                <feature.icon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                                            </div>
                                            <span className="text-sm text-gray-700 font-medium">{feature.title}</span>
                                            {feature.badge && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium hidden sm:inline">{feature.badge}</span>}
                                        </Link>
                                    ))}
                                    <Link to="/features" className="flex items-center space-x-2 px-2 sm:px-3 py-2 ml-8 sm:ml-11 text-sm text-purple-600 hover:text-purple-700 font-medium">
                                        <span>{t('navbar.viewAllFeatures', 'View all features')}</span>
                                        <FaArrowRight className="w-3 h-3" />
                                    </Link>
                                </div>
                            )}
                        </div>

                        <Link to="/billing/plans" className="block px-3 py-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50/70 transition-all duration-300 font-medium">
                            {t('navbar.pricing')}
                        </Link>
                        <Link to="/blog" className="block px-3 py-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50/70 transition-all duration-300 font-medium">
                            {t('navbar.blog', 'Blog')}
                        </Link>
                        <Link to="/contact" className="block px-3 py-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50/70 transition-all duration-300 font-medium">
                            {t('navbar.contact')}
                        </Link>
                        <Link to="/enterprise" className="block px-3 py-2 rounded-lg text-indigo-600 font-semibold hover:bg-indigo-50/70 transition-all duration-300">
                            Enterprise Workspace
                        </Link>

                        {/* Mobile Auth Buttons */}
                        <div className="pt-4 space-y-2 border-t border-gray-200/50">
                            {user ? (
                                <>
                                    {user && isAdmin && (
                                        <Link
                                            to="/admin"
                                            className="flex items-center justify-center w-full px-4 py-2.5 text-gray-700 hover:text-purple-600 font-medium transition-colors duration-300 rounded-lg hover:bg-purple-50/70">
                                            {t('selectionAction.admin', 'Admin')}
                                        </Link>
                                    )}
                                    <Link
                                        to="/dashboard"
                                        className="flex items-center justify-center w-full px-4 py-2.5 text-gray-700 hover:text-purple-600 font-medium transition-colors duration-300 rounded-lg hover:bg-purple-50/70">
                                        <FiTarget className="mr-2" />
                                        {user.plan || t('navbar.dashboard')}
                                    </Link>
                                    <button
                                        onClick={() => logout && logout()}
                                        className="flex items-center justify-center w-full px-4 py-2.5 text-gray-700 hover:text-red-600 font-medium transition-all duration-300 rounded-lg hover:bg-red-50/70 group">
                                        <FaSignOutAlt className="mr-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                                        {t('navbar.signOut')}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => authBtnHandler && authBtnHandler()}
                                    className="block w-full text-center px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-300">
                                    {t('navbar.signIn')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Backdrop for mobile menu */}
            {isOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-sm md:hidden z-[-1]" onClick={() => setIsOpen(false)} />}

            <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        /* Custom responsive classes to avoid global .hidden conflict */
        .desktop-nav-container {
          display: none;
        }
        .desktop-auth-container {
          display: none;
        }
        
        /* Compact text sizing */
        nav {
          font-size: 0.9em;
        }
        
        @media (min-width: 768px) {
          .desktop-nav-container {
            display: block;
          }
          .desktop-auth-container {
            display: flex;
          }
        }
      `}</style>
        </nav>
    );
};

export default HomepageNavbar;
