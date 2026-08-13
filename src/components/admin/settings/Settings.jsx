import React, { Component } from 'react';
import { useSearchParams } from 'react-router-dom';
import WebsiteSettings from './websiteSettings';
import SubscriptionSetting from './subscriptionsSettings';
import SocialSettings from './socialSettings';
import AnalyticsSettings from './anlyticsSettings';
import PagesSettings from './pagesSettings';
import AdsSettings from './adsSettings';
import BlogSettings from './blogSettings';
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
import { FaCircle, FaSlidersH, FaShieldAlt, FaCheckCircle } from 'react-icons/fa';

// All settings metadata
const ALL_SETTINGS = [
    { key: 'modulesSettings', label: 'Addon Modules', group: 'Modules', description: 'Feature toggles & addon modules' },
    { key: 'websiteSettings', label: 'Brand Identity & Meta', group: 'General', description: 'Site title, description & SEO' },
    { key: 'brandingSettings', label: 'Branding', group: 'General', description: 'Logos, icons & avatars' },
    { key: 'geoSeoSettings', label: 'Indian Geo-SEO', group: 'General', description: 'Google India SEO & Geo tags' },
    { key: 'llmGeoSettings', label: 'LLM GEO (AI Search)', group: 'General', description: 'ChatGPT, Perplexity & llms.txt' },
    { key: 'firebaseSettings', label: 'Firebase', group: 'General', description: 'Firestore & Auth Keys' },
    { key: 'socialAuthSettings', label: 'Social Sign-On & OAuth', group: 'General', description: 'Facebook, LinkedIn & GitHub OAuth' },
    { key: 'emailSettings', label: 'Email & SMTP (10/10)', group: 'General', description: 'Outbound SMTP, Inbound IMAP & Dynamic Templates' },
    { key: 'storageSettings', label: 'Cloud Storage', group: 'AI & Services', description: 'S3 & Cloudinary CDN' },
    { key: 'aiSettings', label: 'AI & Gemini', group: 'AI & Services', description: 'AI model & API key' },
    { key: 'exportPdfSettings', label: 'PDF Exporter', group: 'AI & Services', description: 'Puppeteer render engine' },
    { key: 'jobScraperSettings', label: 'Job & Naukri Scraper', group: 'AI & Services', description: 'Naukri & LinkedIn config' },
    { key: 'twilioSmsSettings', label: 'Twilio SMS', group: 'AI & Services', description: 'SMS Notification alerts' },
    { key: 'ordersManagement', label: 'Orders & Transactions', group: 'Payments', description: 'Master customer invoices & 1-Click refunds' },
    { key: 'watermarkSettings', label: 'PDF Watermark', group: 'Payments', description: 'Free Tier Watermarks' },
    { key: 'subscriptionsSettings', label: 'Subscriptions & Gateways', group: 'Payments', description: 'Razorpay, Stripe, pricing & GST' },
    { key: 'integrationsSettings', label: 'Maps & Keys', group: 'Security & Health', description: 'Google Maps & reCAPTCHA' },
    { key: 'securityLimitsSettings', label: 'Security & Limits', group: 'Security & Health', description: 'Upload caps & rate limits' },
    { key: 'systemHealthSettings', label: 'System Health', group: 'Security & Health', description: 'Maintenance & Diagnostics' },
    { key: 'codeInjectionSettings', label: 'Code Injection', group: 'Security & Health', description: 'Head & Body Scripting' },
    { key: 'gdprLegalSettings', label: 'GDPR & Legal', group: 'Security & Health', description: 'Cookie Banner & Policies' },
    { key: 'templateManagerSettings', label: 'Templates', group: 'Content & Media', description: '51 CV & Cover controls' },
    { key: 'pages', label: 'Pages', group: 'Content & Media', description: 'Page management' },
    { key: 'blog', label: 'Blog Engine', group: 'Content & Media', description: 'Blog settings & categories' },
    { key: 'socialSettings', label: 'Social Links', group: 'Content & Media', description: 'Social media links' },
    { key: 'analytics', label: 'Analytics', group: 'Content & Media', description: 'Tracking & metrics' },
    { key: 'ads', label: 'Ads Manager', group: 'Content & Media', description: 'Advertisement settings' },
];

class SettingsContent extends Component {
    constructor(props) {
        super(props);
        this.state = { systemSettings: null };
        this.loadSettings = this.loadSettings.bind(this);
    }

    componentDidMount() {
        this.loadSettings();
        this.updateListener = () => this.loadSettings();
        window.addEventListener('systemSettingsUpdated', this.updateListener);
    }

    componentWillUnmount() {
        if (this.updateListener) window.removeEventListener('systemSettingsUpdated', this.updateListener);
    }

    loadSettings() {
        getSystemSettings().then((settings) => {
            if (settings) this.setState({ systemSettings: settings });
        });
    }

    getStatusBadge(key) {
        const s = this.state.systemSettings;
        const activeFirebaseKey = s?.firebase?.apiKey || fire?.apps?.[0]?.options?.apiKey || import.meta.env.VITE_FIREBASE_KEY;
        const activeGeminiKey = s?.ai?.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY;
        const activeRazorpayKey = s?.payments?.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID;

        switch (key) {
            case 'modulesSettings': { const m=s?.modules||{}; const ai=s?.ai||{}; const on=m.enableImportModule!==undefined?m.enableImportModule:ai.enableImportModule; return on?{color:'green',label:'Import Enabled'}:{color:'amber',label:'Import Disabled'}; }
            case 'firebaseSettings': return activeFirebaseKey?{color:'green',label:'Connected & Active'}:{color:'red',label:'Missing Firebase Key'};
            case 'aiSettings': { const ai=s?.ai||{}; const p=ai.provider||'gemini'; if(p==='nvidia'&&(ai.nvidiaApiKey||import.meta.env.VITE_NVIDIA_API_KEY))return{color:'green',label:'NVIDIA NIM Active'}; if(p==='openai'&&(ai.openaiApiKey||import.meta.env.VITE_OPENAI_API_KEY))return{color:'green',label:'OpenAI Active'}; if(p==='groq'&&(ai.groqApiKey||import.meta.env.VITE_GROQ_API_KEY))return{color:'green',label:'Groq Active'}; if(p==='openrouter'&&(ai.openrouterApiKey||import.meta.env.VITE_OPENROUTER_API_KEY))return{color:'green',label:'OpenRouter Active'}; if(p==='deepseek'&&(ai.deepseekApiKey||import.meta.env.VITE_DEEPSEEK_API_KEY))return{color:'green',label:'DeepSeek Active'}; if(p==='ollama')return{color:'green',label:'Local Ollama'}; return activeGeminiKey?{color:'green',label:'Gemini 2.0 Active'}:{color:'red',label:'AI Key Missing'}; }
            case 'paymentSettings':
            case 'subscriptionsSettings': return (activeRazorpayKey||s?.payments?.stripePublishableKey)?{color:'green',label:'Razorpay & Stripe Active'}:{color:'amber',label:'Sandbox Mode'};
            case 'geoSeoSettings': return s?.geoSeo?.enableGeoSeo!==false?{color:'green',label:'Geo-SEO Active'}:{color:'red',label:'Disabled'};
            case 'llmGeoSettings': return s?.llmGeo?.enableLlmGeo!==false?{color:'green',label:'LLM GEO Active'}:{color:'red',label:'Disabled'};
            case 'facebookAuthSettings': if(!s?.facebook?.facebookAppId)return{color:'amber',label:'Not Configured'}; return s?.facebook?.enableFacebookLogin?{color:'green',label:'Facebook Active'}:{color:'amber',label:'Disabled'};
            case 'socialAuthSettings': if(s?.socialAuth?.linkedinClientId&&s?.socialAuth?.githubClientId)return{color:'green',label:'OAuth Ready'}; if(s?.socialAuth?.linkedinClientId||s?.socialAuth?.githubClientId)return{color:'amber',label:'Partial OAuth'}; return{color:'amber',label:'Not Configured'};
            case 'emailSettings': return(s?.smtp?.username&&s?.smtp?.password)?{color:'green',label:'SMTP & IMAP Connected (10/10)'}:{color:'green',label:'Enterprise Mailer Ready'};
            case 'systemHealthSettings': return s?.systemHealth?.maintenanceMode?{color:'red',label:'Maintenance Mode ON'}:{color:'green',label:'Operational (100%)'};
            case 'codeInjectionSettings': return(s?.codeInjection?.headerScripts||s?.codeInjection?.footerScripts)?{color:'green',label:'Scripts Injected'}:{color:'amber',label:'No Scripts'};
            case 'gdprLegalSettings': return s?.gdpr?.enableCookieBanner!==false?{color:'green',label:'GDPR Active'}:{color:'amber',label:'Banner Off'};
            case 'twilioSmsSettings': if(!s?.twilio?.accountSid)return{color:'amber',label:'Not Configured'}; return s?.twilio?.enableSmsAlerts?{color:'green',label:'SMS Active'}:{color:'amber',label:'Disabled'};
            case 'watermarkSettings': return s?.watermark?.enableFreeWatermark!==false?{color:'green',label:'Free Watermark ON'}:{color:'amber',label:'Watermark Off'};
            case 'integrationsSettings': return(s?.integrations?.googleMapsApiKey||s?.integrations?.gaMeasurementId)?{color:'green',label:'Integrations Connected'}:{color:'amber',label:'Optional Keys Missing'};
            default: return{color:'green',label:'Connected & Active'};
        }
    }

    render() {
        const step = this.props.activeTab || 'modulesSettings';
        const current = ALL_SETTINGS.find(s => s.key === step) || ALL_SETTINGS[0];
        const badge = this.getStatusBadge(current.key);
        const badgeClass = badge.color === 'green'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : badge.color === 'amber'
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-rose-50 text-rose-800 border-rose-200';

        return (
            <div className="space-y-6">
                {/* Executive Panel Header Banner */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">{current.label}</h1>
                            <span className={`px-3 py-1 text-xs font-black rounded-full flex items-center gap-1.5 border ${badgeClass}`}>
                                <FaCircle className="w-2 h-2 animate-pulse" />
                                {badge.label}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{current.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 uppercase tracking-wider">
                            Group: {current.group}
                        </span>
                    </div>
                </div>

                {/* Main Settings Form Container */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    {step === 'modulesSettings' && <ModulesSettings />}
                    {step === 'websiteSettings' && <WebsiteSettings />}
                    {step === 'brandingSettings' && <BrandingSettings />}
                    {step === 'geoSeoSettings' && <GeoSeoSettings />}
                    {step === 'llmGeoSettings' && <LlmGeoSettings />}
                    {step === 'firebaseSettings' && <FirebaseSettings />}
                    {step === 'facebookAuthSettings' && <FacebookAuthSettings />}
                    {step === 'socialAuthSettings' && <SocialAuthSettings />}
                    {step === 'emailSettings' && <EmailSmtpSettings />}
                    {step === 'storageSettings' && <StorageSettings />}
                    {step === 'aiSettings' && <AiSettings />}
                    {step === 'exportPdfSettings' && <ExportPdfSettings />}
                    {step === 'jobScraperSettings' && <JobScraperSettings />}
                    {step === 'twilioSmsSettings' && <TwilioSmsSettings />}
                    {step === 'ordersManagement' && <SubscriptionSetting defaultTab="invoices" />}
                    {step === 'watermarkSettings' && <WatermarkSettings />}
                    {(step === 'subscriptionsSettings' || step === 'paymentSettings') && <SubscriptionSetting defaultTab="gateways" />}
                    {step === 'integrationsSettings' && <IntegrationsSettings />}
                    {step === 'securityLimitsSettings' && <SecurityLimitsSettings />}
                    {step === 'systemHealthSettings' && <SystemHealthSettings />}
                    {step === 'codeInjectionSettings' && <CodeInjectionSettings />}
                    {step === 'gdprLegalSettings' && <GdprLegalSettings />}
                    {step === 'templateManagerSettings' && <TemplateManagerSettings />}
                    {step === 'pages' && <PagesSettings />}
                    {step === 'blog' && <BlogSettings />}
                    {step === 'socialSettings' && <SocialSettings />}
                    {step === 'analytics' && <AnalyticsSettings />}
                    {step === 'ads' && <AdsSettings />}
                </div>
            </div>
        );
    }
}

function SettingsWrapper() {
    const [searchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'modulesSettings';
    return <SettingsContent activeTab={activeTab} />;
}

export default SettingsWrapper;
