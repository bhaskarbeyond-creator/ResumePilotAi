import React, { Component } from 'react';
import WebsiteSettings from './websiteSettings';
import SubscriptionSetting from './subscriptionsSettings';
import SocialSettings from './socialSettings';
import AnalyticsSettings from './anlyticsSettings';
import PagesSettings from './pagesSettings';
import AdsSettings from './adsSettings';
import BlogSettings from './blogSettings';

// Configurable Settings Panels
import AiSettings from './AiSettings';
import PaymentSettings from './PaymentSettings';
import EmailSmtpSettings from './EmailSmtpSettings';
import ExportPdfSettings from './ExportPdfSettings';
import JobScraperSettings from './JobScraperSettings';
import IntegrationsSettings from './IntegrationsSettings';
import BrandingSettings from './BrandingSettings';
import TemplateManagerSettings from './TemplateManagerSettings';
import SecurityLimitsSettings from './SecurityLimitsSettings';
import SystemHealthSettings from './SystemHealthSettings';
import FirebaseSettings from './FirebaseSettings';
import FacebookAuthSettings from './FacebookAuthSettings';
import StorageSettings from './StorageSettings';
import SocialAuthSettings from './SocialAuthSettings';
import WatermarkSettings from './WatermarkSettings';
import CodeInjectionSettings from './CodeInjectionSettings';
import GdprLegalSettings from './GdprLegalSettings';
import TwilioSmsSettings from './TwilioSmsSettings';
import GeoSeoSettings from './GeoSeoSettings';
import LlmGeoSettings from './LlmGeoSettings';
import ModulesSettings from './ModulesSettings';

import { getSystemSettings } from '../../../firestore/dbOperations';
import fire from '../../../conf/fire';

// React Icons
import {
  FaCog,
  FaCreditCard,
  FaShareAlt,
  FaChartLine,
  FaFile,
  FaBullhorn,
  FaRobot,
  FaEnvelope,
  FaFilePdf,
  FaSearch,
  FaMapMarkerAlt,
  FaPaintBrush,
  FaFileCode,
  FaShieldAlt,
  FaHeartbeat,
  FaSlidersH,
  FaLayerGroup,
  FaFire,
  FaFacebook,
  FaCloud,
  FaLinkedin,
  FaStamp,
  FaCode,
  FaCookieBite,
  FaCommentAlt,
  FaGlobeAsia,
  FaBrain,
  FaCircle,
  FaCubes
} from 'react-icons/fa';
import { FiEdit } from 'react-icons/fi';

class Settings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            step: 'websiteSettings',
            activeCategory: 'All',
            searchQuery: '',
            systemSettings: null,
        };
        this.setStep = this.setStep.bind(this);
        this.setCategory = this.setCategory.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.loadSettings = this.loadSettings.bind(this);
    }

    componentDidMount() {
        this.loadSettings();
        this.updateListener = () => this.loadSettings();
        window.addEventListener('systemSettingsUpdated', this.updateListener);
    }

    componentWillUnmount() {
        if (this.updateListener) {
            window.removeEventListener('systemSettingsUpdated', this.updateListener);
        }
    }

    loadSettings() {
        getSystemSettings().then((settings) => {
            if (settings) {
                this.setState({ systemSettings: settings });
            }
        });
    }

    setStep(stepName) {
        this.setState({ step: stepName });
    }

    setCategory(categoryName) {
        this.setState({ activeCategory: categoryName });
    }

    handleSearch(e) {
        this.setState({ searchQuery: e.target.value });
    }

    getStatusBadge(key) {
        const s = this.state.systemSettings;
        
        // Active Firebase App options as fallback check
        const activeFirebaseKey = s?.firebase?.apiKey || fire?.apps?.[0]?.options?.apiKey || import.meta.env.VITE_FIREBASE_KEY;
        const activeGeminiKey = s?.ai?.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY;
        const activeRazorpayKey = s?.payments?.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID;

        switch (key) {
            case 'modulesSettings': {
                const m = s?.modules || {};
                const ai = s?.ai || {};
                const isImportOn = m.enableImportModule !== undefined ? m.enableImportModule : ai.enableImportModule;
                return isImportOn
                    ? { color: 'green', label: 'Import Enabled' }
                    : { color: 'amber', label: 'Import Disabled (Default)' };
            }

            case 'firebaseSettings':
                return activeFirebaseKey
                    ? { color: 'green', label: 'Connected & Active' }
                    : { color: 'red', label: 'Missing Firebase Key' };

            case 'aiSettings': {
                const ai = s?.ai || {};
                const provider = ai.provider || 'gemini';
                if (provider === 'nvidia' && (ai.nvidiaApiKey || import.meta.env.VITE_NVIDIA_API_KEY)) {
                    return { color: 'green', label: 'NVIDIA NIM Active' };
                }
                if (provider === 'openai' && (ai.openaiApiKey || import.meta.env.VITE_OPENAI_API_KEY)) {
                    return { color: 'green', label: 'OpenAI Active' };
                }
                if (provider === 'groq' && (ai.groqApiKey || import.meta.env.VITE_GROQ_API_KEY)) {
                    return { color: 'green', label: 'Groq Cloud Active' };
                }
                if (provider === 'openrouter' && (ai.openrouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY)) {
                    return { color: 'green', label: 'OpenRouter Active' };
                }
                if (provider === 'deepseek' && (ai.deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY)) {
                    return { color: 'green', label: 'DeepSeek Active' };
                }
                if (provider === 'ollama') {
                    return { color: 'green', label: 'Local Ollama Active' };
                }
                if (activeGeminiKey) {
                    return { color: 'green', label: 'Gemini 2.0 Active' };
                }
                return { color: 'red', label: 'AI Key Missing' };
            }

            case 'paymentSettings':
                if (activeRazorpayKey || s?.payments?.stripePublishableKey) {
                    return { color: 'green', label: 'Razorpay UPI Active' };
                }
                return { color: 'amber', label: 'Sandbox / Demo Mode' };

            case 'geoSeoSettings':
                return s?.geoSeo?.enableGeoSeo !== false
                    ? { color: 'green', label: 'India Geo-SEO Active' }
                    : { color: 'red', label: 'Disabled' };

            case 'llmGeoSettings':
                return s?.llmGeo?.enableLlmGeo !== false
                    ? { color: 'green', label: 'LLM GEO Active' }
                    : { color: 'red', label: 'Disabled' };

            case 'facebookAuthSettings':
                if (!s?.facebook?.facebookAppId) return { color: 'amber', label: 'Not Configured' };
                return s?.facebook?.enableFacebookLogin ? { color: 'green', label: 'Facebook Active' } : { color: 'amber', label: 'Disabled' };

            case 'socialAuthSettings':
                if (s?.socialAuth?.linkedinClientId && s?.socialAuth?.githubClientId) {
                    return { color: 'green', label: 'OAuth Ready' };
                }
                if (s?.socialAuth?.linkedinClientId || s?.socialAuth?.githubClientId) {
                    return { color: 'amber', label: 'Partial OAuth' };
                }
                return { color: 'amber', label: 'Not Configured' };

            case 'emailSettings':
                return (s?.smtp?.username && s?.smtp?.password)
                    ? { color: 'green', label: 'SMTP Connected' }
                    : { color: 'amber', label: 'Default Mailer' };

            case 'storageSettings':
                return { color: 'green', label: 'Firebase Storage Active' };

            case 'exportPdfSettings':
                return { color: 'green', label: 'Puppeteer PDF Engine Ready' };

            case 'jobScraperSettings':
                return s?.jobScraper?.naukriEnabled !== false
                    ? { color: 'green', label: 'Naukri & LinkedIn Active' }
                    : { color: 'amber', label: 'LinkedIn Only' };

            case 'twilioSmsSettings':
                if (!s?.twilio?.accountSid) return { color: 'amber', label: 'Not Configured' };
                return s?.twilio?.enableSmsAlerts ? { color: 'green', label: 'SMS Active' } : { color: 'amber', label: 'Disabled' };

            case 'watermarkSettings':
                return s?.watermark?.enableFreeWatermark !== false
                    ? { color: 'green', label: 'Free Watermark ON' }
                    : { color: 'amber', label: 'Watermark Off' };

            case 'integrationsSettings':
                return (s?.integrations?.googleMapsApiKey || s?.integrations?.gaMeasurementId)
                    ? { color: 'green', label: 'Integrations Connected' }
                    : { color: 'amber', label: 'Optional Keys Missing' };

            case 'systemHealthSettings':
                return s?.systemHealth?.maintenanceMode
                    ? { color: 'red', label: 'Maintenance Mode ON' }
                    : { color: 'green', label: 'Operational (100%)' };

            case 'codeInjectionSettings':
                return (s?.codeInjection?.headerScripts || s?.codeInjection?.footerScripts)
                    ? { color: 'green', label: 'Scripts Injected' }
                    : { color: 'amber', label: 'No Scripts' };

            case 'gdprLegalSettings':
                return s?.gdpr?.enableCookieBanner !== false
                    ? { color: 'green', label: 'GDPR Active' }
                    : { color: 'amber', label: 'Banner Off' };

            case 'websiteSettings':
            case 'brandingSettings':
            case 'subscriptionsSettings':
            case 'securityLimitsSettings':
            case 'templateManagerSettings':
            case 'pages':
            case 'blog':
            case 'socialSettings':
            case 'analytics':
            case 'ads':
                return { color: 'green', label: 'Connected & Active' };

            default:
                return { color: 'green', label: 'Active' };
        }
    }

    render() {
        const settingsMenuItems = [
            {
                key: 'modulesSettings',
                label: 'Addon Modules',
                category: 'Modules',
                icon: FaCubes,
                description: 'Enable or disable AI resume import, job scraper & feature modules'
            },
            {
                key: 'websiteSettings',
                label: 'Brand Identity & Meta',
                category: 'General',
                icon: FaCog,
                description: 'Site title, description & SEO metadata'
            },
            {
                key: 'brandingSettings',
                label: 'Branding',
                category: 'General',
                icon: FaPaintBrush,
                description: 'Logos, icons & avatars'
            },
            {
                key: 'geoSeoSettings',
                label: 'Indian Geo-SEO',
                category: 'General',
                icon: FaGlobeAsia,
                description: 'Google India SEO & Geo tags'
            },
            {
                key: 'llmGeoSettings',
                label: 'LLM GEO (AI Search)',
                category: 'General',
                icon: FaBrain,
                description: 'ChatGPT, Perplexity & llms.txt'
            },
            {
                key: 'firebaseSettings',
                label: 'Firebase',
                category: 'General',
                icon: FaFire,
                description: 'Firestore & Auth Keys'
            },
            {
                key: 'facebookAuthSettings',
                label: 'Facebook OAuth',
                category: 'General',
                icon: FaFacebook,
                description: 'Facebook Login & Pixel'
            },
            {
                key: 'socialAuthSettings',
                label: 'LinkedIn & GitHub',
                category: 'General',
                icon: FaLinkedin,
                description: 'LinkedIn & GitHub OAuth'
            },
            {
                key: 'emailSettings',
                label: 'Email & SMTP',
                category: 'General',
                icon: FaEnvelope,
                description: 'Outgoing mail server'
            },
            {
                key: 'storageSettings',
                label: 'Cloud Storage',
                category: 'AI & Services',
                icon: FaCloud,
                description: 'S3 & Cloudinary CDN'
            },
            {
                key: 'aiSettings',
                label: 'AI & Gemini',
                category: 'AI & Services',
                icon: FaRobot,
                description: 'AI model & API key'
            },
            {
                key: 'exportPdfSettings',
                label: 'PDF Exporter',
                category: 'AI & Services',
                icon: FaFilePdf,
                description: 'Puppeteer render engine'
            },
            {
                key: 'jobScraperSettings',
                label: 'Job & Naukri Scraper',
                category: 'AI & Services',
                icon: FaSearch,
                description: 'Naukri & LinkedIn config'
            },
            {
                key: 'twilioSmsSettings',
                label: 'Twilio SMS',
                category: 'AI & Services',
                icon: FaCommentAlt,
                description: 'SMS & OTP Gateway'
            },
            {
                key: 'watermarkSettings',
                label: 'PDF Watermark',
                category: 'Payments',
                icon: FaStamp,
                description: 'Free Tier Watermarks'
            },
            {
                key: 'paymentSettings',
                label: 'Payment & Razorpay',
                category: 'Payments',
                icon: FaCreditCard,
                description: 'Razorpay UPI, Stripe & PayPal'
            },
            {
                key: 'subscriptionsSettings',
                label: 'Subscriptions',
                category: 'Payments',
                icon: FaCreditCard,
                description: 'Payment plans'
            },
            {
                key: 'integrationsSettings',
                label: 'Maps & Keys',
                category: 'Security & Health',
                icon: FaMapMarkerAlt,
                description: 'Google Maps & reCAPTCHA'
            },
            {
                key: 'securityLimitsSettings',
                label: 'Security & Limits',
                category: 'Security & Health',
                icon: FaShieldAlt,
                description: 'Upload caps & rate limits'
            },
            {
                key: 'systemHealthSettings',
                label: 'System Health',
                category: 'Security & Health',
                icon: FaHeartbeat,
                description: 'Maintenance & Diagnostics'
            },
            {
                key: 'codeInjectionSettings',
                label: 'Code Injection',
                category: 'Security & Health',
                icon: FaCode,
                description: 'Head & Body Scripting'
            },
            {
                key: 'gdprLegalSettings',
                label: 'GDPR & Legal',
                category: 'Security & Health',
                icon: FaCookieBite,
                description: 'Cookie Banner & Policies'
            },
            {
                key: 'templateManagerSettings',
                label: 'Templates',
                category: 'Content & Media',
                icon: FaFileCode,
                description: '51 CV & Cover controls'
            },
            {
                key: 'pages',
                label: 'Pages',
                category: 'Content & Media',
                icon: FaFile,
                description: 'Page management'
            },
            {
                key: 'blog',
                label: 'Blog Engine',
                category: 'Content & Media',
                icon: FiEdit,
                description: 'Blog settings & categories'
            },
            {
                key: 'socialSettings',
                label: 'Social Links',
                category: 'Content & Media',
                icon: FaShareAlt,
                description: 'Social media'
            },
            {
                key: 'analytics',
                label: 'Analytics',
                category: 'Content & Media',
                icon: FaChartLine,
                description: 'Tracking & metrics'
            },
            {
                key: 'ads',
                label: 'Ads Manager',
                category: 'Content & Media',
                icon: FaBullhorn,
                description: 'Advertisement settings'
            }
        ];

        const categories = ['All', 'Modules', 'General', 'AI & Services', 'Payments', 'Security & Health', 'Content & Media'];

        // Filter menu items by Category & Search query
        const filteredMenuItems = settingsMenuItems.filter((item) => {
            const matchesCategory = this.state.activeCategory === 'All' || item.category === this.state.activeCategory;
            const matchesSearch = this.state.searchQuery === '' ||
                item.label.toLowerCase().includes(this.state.searchQuery.toLowerCase()) ||
                item.description.toLowerCase().includes(this.state.searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });

        const currentItem = settingsMenuItems.find(item => item.key === this.state.step) || settingsMenuItems[0];
        const currentBadge = this.getStatusBadge(currentItem.key);

        return (
            <div className="min-h-screen bg-slate-50 px-4 py-6">
                {/* Header */}
                <div className="mb-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-white shadow-sm">
                                    <FaSlidersH className="w-5 h-5" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-slate-900">Platform Configuration Center</h1>
                                    <p className="text-xs text-slate-500 mt-0.5">Real-Time Connection Status: 🟢 Connected & Active | 🟡 Sandbox / Optional | 🔴 Action Required</p>
                                </div>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="relative w-full md:w-72">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                            <input
                                type="text"
                                placeholder="Search settings (e.g., Razorpay, Geo-SEO)..."
                                value={this.state.searchQuery}
                                onChange={this.handleSearch}
                                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-800 focus:bg-white focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2 mt-6 border-t border-slate-100 pt-4">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2 flex items-center gap-1">
                            <FaLayerGroup className="w-3 h-3" /> Filter:
                        </span>
                        {categories.map((cat) => {
                            const isActive = this.state.activeCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => this.setCategory(cat)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                        isActive
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {cat}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Tabbed Container */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Multi-Line Wrapping Tab Strip (No Scroll Bar) */}
                    <div className="border-b border-slate-200 bg-slate-50/50 p-3 flex flex-wrap items-center gap-2">
                        {filteredMenuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = this.state.step === item.key;
                            const badge = this.getStatusBadge(item.key);
                            
                            const badgeColorClass = badge.color === 'green'
                                ? 'bg-emerald-500'
                                : badge.color === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-red-500';

                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => this.setStep(item.key)}
                                    className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all relative ${
                                        isActive
                                            ? 'bg-slate-900 text-white shadow-sm font-semibold'
                                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${badgeColorClass} shadow-sm shrink-0`} title={badge.label} />
                                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                        {filteredMenuItems.length === 0 && (
                            <span className="text-xs text-slate-400 py-3">No settings matching "{this.state.searchQuery}"</span>
                        )}
                    </div>

                    {/* Active Section Info Header */}
                    <div className="border-b border-slate-100 px-6 py-4 bg-white flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            {currentItem && (
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                                    {React.createElement(currentItem.icon, { className: 'w-4 h-4' })}
                                </div>
                            )}
                            <div>
                                <div className="flex items-center space-x-2">
                                    <h2 className="text-base font-bold text-slate-900">
                                        {currentItem ? currentItem.label : 'Settings'}
                                    </h2>
                                    {currentBadge && (
                                        <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1.5 ${
                                            currentBadge.color === 'green'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : currentBadge.color === 'amber'
                                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                : 'bg-red-50 text-red-700 border border-red-200'
                                        }`}>
                                            <FaCircle className="w-1.5 h-1.5 animate-pulse" />
                                            {currentBadge.label}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500">
                                    {currentItem ? currentItem.description : 'Configure parameters'}
                                </p>
                            </div>
                        </div>
                        {currentItem && (
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md">
                                {currentItem.category}
                            </span>
                        )}
                    </div>

                    {/* Active Tab Panel Content */}
                    <div className="p-6">
                        {this.state.step === 'modulesSettings' && <ModulesSettings />}
                        {this.state.step === 'websiteSettings' && <WebsiteSettings />}
                        {this.state.step === 'brandingSettings' && <BrandingSettings />}
                        {this.state.step === 'geoSeoSettings' && <GeoSeoSettings />}
                        {this.state.step === 'llmGeoSettings' && <LlmGeoSettings />}
                        {this.state.step === 'firebaseSettings' && <FirebaseSettings />}
                        {this.state.step === 'facebookAuthSettings' && <FacebookAuthSettings />}
                        {this.state.step === 'socialAuthSettings' && <SocialAuthSettings />}
                        {this.state.step === 'emailSettings' && <EmailSmtpSettings />}
                        {this.state.step === 'storageSettings' && <StorageSettings />}
                        {this.state.step === 'aiSettings' && <AiSettings />}
                        {this.state.step === 'exportPdfSettings' && <ExportPdfSettings />}
                        {this.state.step === 'jobScraperSettings' && <JobScraperSettings />}
                        {this.state.step === 'twilioSmsSettings' && <TwilioSmsSettings />}
                        {this.state.step === 'watermarkSettings' && <WatermarkSettings />}
                        {this.state.step === 'paymentSettings' && <PaymentSettings />}
                        {this.state.step === 'subscriptionsSettings' && <SubscriptionSetting />}
                        {this.state.step === 'integrationsSettings' && <IntegrationsSettings />}
                        {this.state.step === 'securityLimitsSettings' && <SecurityLimitsSettings />}
                        {this.state.step === 'systemHealthSettings' && <SystemHealthSettings />}
                        {this.state.step === 'codeInjectionSettings' && <CodeInjectionSettings />}
                        {this.state.step === 'gdprLegalSettings' && <GdprLegalSettings />}
                        {this.state.step === 'templateManagerSettings' && <TemplateManagerSettings />}
                        {this.state.step === 'pages' && <PagesSettings />}
                        {this.state.step === 'blog' && <BlogSettings />}
                        {this.state.step === 'socialSettings' && <SocialSettings />}
                        {this.state.step === 'analytics' && <AnalyticsSettings />}
                        {this.state.step === 'ads' && <AdsSettings />}
                    </div>
                </div>
            </div>
        );
    }
}

export default Settings;
