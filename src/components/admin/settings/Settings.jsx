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
import EmailSmtpSettings from './EmailSmtpSettings';
import ExportPdfSettings from './ExportPdfSettings';
import JobScraperSettings from './JobScraperSettings';
import IntegrationsSettings from './IntegrationsSettings';
import BrandingSettings from './BrandingSettings';
import TemplateManagerSettings from './TemplateManagerSettings';
import SecurityLimitsSettings from './SecurityLimitsSettings';
import SystemHealthSettings from './SystemHealthSettings';
import FirebaseSettings from './FirebaseSettings';
import DatabaseSettings from './DatabaseSettings';
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
import FeatureFlagsSettings from './FeatureFlagsSettings';
import PlatformConfigSettings from './PlatformConfigSettings';
import PlatformCurrencySettings from './PlatformCurrencySettings';
import { FaCircle } from 'react-icons/fa';
import { getAdminSystemSettings } from '../../../services/api/platform';
import { useAdminSession } from '../AdminContext';
import { FiShield, FiLock } from 'react-icons/fi';

// All settings metadata
const ALL_SETTINGS = [
    { key: 'modulesSettings', label: 'Addon Modules', group: 'Modules', description: 'Feature toggles & addon modules', permission: 'system.config.write' },
    { key: 'websiteSettings', label: 'Brand Identity & Meta', group: 'General', description: 'Site title, description & SEO', permission: 'system.config.write' },
    { key: 'brandingSettings', label: 'Branding', group: 'General', description: 'Logos, icons & avatars', permission: 'system.config.write' },
    { key: 'geoSeoSettings', label: 'Indian Geo-SEO', group: 'General', description: 'Google India SEO & Geo tags', permission: 'system.config.write' },
    { key: 'llmGeoSettings', label: 'LLM GEO (AI Search)', group: 'General', description: 'ChatGPT, Perplexity & llms.txt', permission: 'system.config.write' },
    { key: 'firebaseSettings', label: 'Firebase Identity', group: 'General', description: 'Authentication & OAuth credentials', superAdminOnly: true },
    { key: 'databaseSettings', label: 'Database & Persistence Engine', group: 'General', description: 'Authoritative MariaDB storage and durable outboxes', superAdminOnly: true },
    { key: 'socialAuthSettings', label: 'Social Sign-On & OAuth', group: 'General', description: 'Facebook, LinkedIn & GitHub OAuth', superAdminOnly: true },
    { key: 'facebookAuthSettings', label: 'Social Sign-On & OAuth', group: 'General', description: 'Facebook, LinkedIn & GitHub OAuth', superAdminOnly: true },
    { key: 'emailSettings', label: 'Email & SMTP', group: 'General', description: 'Outbound SMTP, Inbound IMAP & Dynamic Templates', permission: 'email.template.manage' },
    { key: 'storageSettings', label: 'Cloud Storage', group: 'AI & Services', description: 'S3 & Cloudinary CDN', superAdminOnly: true },
    { key: 'aiSettings', label: 'AI & Gemini', group: 'AI & Services', description: 'AI model & API key', superAdminOnly: true },
    { key: 'exportPdfSettings', label: 'PDF Exporter', group: 'AI & Services', description: 'Puppeteer render engine', permission: 'system.config.write' },
    { key: 'jobScraperSettings', label: 'Job & Naukri Scraper', group: 'AI & Services', description: 'Naukri & LinkedIn config', superAdminOnly: true },
    { key: 'twilioSmsSettings', label: 'Twilio SMS', group: 'AI & Services', description: 'SMS Notification alerts', superAdminOnly: true },
    { key: 'currencySettings', label: 'Platform Currency', group: 'Payments', description: 'Authoritative currency standard, ISO-4217 & multi-currency', permission: 'system.config.read' },
    { key: 'ordersManagement', label: 'Orders & Transactions', group: 'Payments', description: 'Master customer invoices & 1-Click refunds', permission: 'payments.read' },
    { key: 'watermarkSettings', label: 'PDF Watermark', group: 'Payments', description: 'Free Tier Watermarks', permission: 'system.config.write' },
    { key: 'subscriptionsSettings', label: 'Subscriptions & Gateways', group: 'Payments', description: 'Razorpay, Stripe, pricing & GST', permission: 'payments.read' },
    { key: 'paymentSettings', label: 'Subscriptions & Gateways', group: 'Payments', description: 'Razorpay, Stripe, pricing & GST', permission: 'payments.read' },
    { key: 'integrationsSettings', label: 'Maps & Keys', group: 'Security & Health', description: 'Google Maps & reCAPTCHA', superAdminOnly: true },
    { key: 'securityLimitsSettings', label: 'Security & Limits', group: 'Security & Health', description: 'Upload caps & rate limits', superAdminOnly: true },
    { key: 'systemHealthSettings', label: 'System Health', group: 'Security & Health', description: 'Maintenance & Diagnostics', permission: 'security.read' },
    { key: 'featureFlagsSettings', label: 'Feature Flags', group: 'Security & Health', description: 'Platform-wide feature gates & rollout controls', superAdminOnly: true },
    { key: 'platformConfigSettings', label: 'Platform Config', group: 'Security & Health', description: 'Infrastructure & runtime configuration census', superAdminOnly: true },
    { key: 'codeInjectionSettings', label: 'Code Injection', group: 'Security & Health', description: 'Head & Body Scripting', superAdminOnly: true },
    { key: 'gdprLegalSettings', label: 'GDPR & Legal', group: 'Security & Health', description: 'Cookie Banner & Policies', permission: 'system.config.write' },
    { key: 'templateManagerSettings', label: 'Templates', group: 'Content & Media', description: '51 CV & Cover controls', permission: 'system.config.write' },
    { key: 'pages', label: 'Pages', group: 'Content & Media', description: 'Page management', permission: 'system.config.write' },
    { key: 'blog', label: 'Blog Engine', group: 'Content & Media', description: 'Blog settings & categories', permission: 'system.config.write' },
    { key: 'socialSettings', label: 'Social Links', group: 'Content & Media', description: 'Social media links', permission: 'system.config.write' },
    { key: 'analytics', label: 'Analytics', group: 'Content & Media', description: 'Tracking & metrics', permission: 'system.config.write' },
    { key: 'ads', label: 'Ads Manager', group: 'Content & Media', description: 'Advertisement settings', permission: 'system.config.write' },
];

class SettingsContent extends Component {
    state = { configurationWarning: null };

    handleConfigurationUnavailable = (event) => {
        if (event?.detail?.scope !== 'admin') return;
        this.setState({ configurationWarning: event.detail.message || 'Authoritative configuration is unavailable.' });
    };

    handleConfigurationAvailable = (event) => {
        if (event?.detail?.scope !== 'admin') return;
        this.setState({ configurationWarning: null });
    };

    componentDidMount() {
        this._mounted = true;
        window.addEventListener('systemSettingsUnavailable', this.handleConfigurationUnavailable);
        window.addEventListener('systemSettingsAvailable', this.handleConfigurationAvailable);
        getAdminSystemSettings().then((settings) => {
            if (!this._mounted) return;
            this.setState({ configurationWarning: settings?._settingsStale === true
                ? (settings._settingsError || 'Authoritative configuration is unavailable.')
                : null });
        }).catch(() => {
            if (this._mounted) this.setState({ configurationWarning: 'Authoritative MariaDB admin configuration is unavailable.' });
        });
    }

    componentWillUnmount() {
        this._mounted = false;
        window.removeEventListener('systemSettingsUnavailable', this.handleConfigurationUnavailable);
        window.removeEventListener('systemSettingsAvailable', this.handleConfigurationAvailable);
    }

    render() {
        const step = this.props.activeTab || 'modulesSettings';
        const current = ALL_SETTINGS.find(s => s.key === step) || ALL_SETTINGS[0];
        const badgeClass = 'bg-slate-50 text-slate-700 border-slate-200';

        return (
            <div className="space-y-6">
                {/* Executive Panel Header Banner */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">{current.label}</h1>
                            <span className={`px-3 py-1 text-xs font-black rounded-full flex items-center gap-1.5 border ${badgeClass}`}>
                                <FaCircle className="w-2 h-2" aria-hidden="true" />
                                Configuration panel
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

                {this.state.configurationWarning && (
                    <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
                        {this.state.configurationWarning} Refresh after database recovery before making changes.
                    </div>
                )}

                {/* Main Settings Form Container */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    {step === 'modulesSettings' && <ModulesSettings />}
                    {step === 'websiteSettings' && <WebsiteSettings />}
                    {step === 'brandingSettings' && <BrandingSettings />}
                    {step === 'geoSeoSettings' && <GeoSeoSettings />}
                    {step === 'llmGeoSettings' && <LlmGeoSettings />}
                    {step === 'firebaseSettings' && <FirebaseSettings />}
                    {step === 'databaseSettings' && <DatabaseSettings />}
                    {step === 'facebookAuthSettings' && <FacebookAuthSettings />}
                    {step === 'socialAuthSettings' && <SocialAuthSettings />}
                    {step === 'emailSettings' && <EmailSmtpSettings />}
                    {step === 'storageSettings' && <StorageSettings />}
                    {step === 'aiSettings' && <AiSettings />}
                    {step === 'exportPdfSettings' && <ExportPdfSettings />}
                    {step === 'jobScraperSettings' && <JobScraperSettings />}
                    {step === 'twilioSmsSettings' && <TwilioSmsSettings />}
                    {step === 'currencySettings' && <PlatformCurrencySettings />}
                    {step === 'ordersManagement' && <SubscriptionSetting defaultTab="invoices" />}
                    {step === 'watermarkSettings' && <WatermarkSettings />}
                    {(step === 'subscriptionsSettings' || step === 'paymentSettings') && <SubscriptionSetting defaultTab="gateways" />}
                    {step === 'integrationsSettings' && <IntegrationsSettings />}
                    {step === 'securityLimitsSettings' && <SecurityLimitsSettings />}
                    {step === 'systemHealthSettings' && <SystemHealthSettings />}
                    {step === 'featureFlagsSettings' && <FeatureFlagsSettings />}
                    {step === 'platformConfigSettings' && <PlatformConfigSettings />}
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
    const adminSession = useAdminSession();

    const targetSetting = ALL_SETTINGS.find(s => s.key === activeTab);
    const isSuperAdmin = adminSession?.isSuperAdmin === true;
    const permissions = adminSession?.permissions || [];
    const hasPerm = (p) => isSuperAdmin || permissions.includes('*') || (Array.isArray(p) ? p.some(x => permissions.includes(x)) : permissions.includes(p));

    const isDenied = targetSetting && (
        (targetSetting.superAdminOnly && !isSuperAdmin) ||
        (targetSetting.permission && !hasPerm(targetSetting.permission))
    );

    if (isDenied) {
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center shadow-xs">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-inner">
                        <FiLock className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-lg font-black text-rose-950">Settings Access Restricted</h2>
                    <p className="mx-auto mt-2 max-w-md text-xs font-semibold text-rose-800">
                        Your active role ({adminSession?.role || 'OPERATOR'}) does not have permission to view or manage <strong>{targetSetting.label}</strong>.
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700 border border-rose-200 shadow-2xs">
                        <FiShield className="text-rose-500" />
                        <span>Required: {targetSetting.superAdminOnly ? 'SUPER_ADMIN Privilege' : targetSetting.permission}</span>
                    </div>
                </div>
            </div>
        );
    }

    return <SettingsContent activeTab={activeTab} />;
}

export default SettingsWrapper;
