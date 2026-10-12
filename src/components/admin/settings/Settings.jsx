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
import SettingsNavigator from './SettingsNavigator';
import { canAccessSetting, ALL_SETTINGS } from './settingsAccess';
import { FaCircle } from 'react-icons/fa';
import { getAdminSystemSettings } from '../../../services/api/platform';
import { useAdminSession } from '../AdminContext';
import { FiShield, FiLock } from 'react-icons/fi';

// DIR-105: the inventory now lives in `settingsAccess.js` so the settings hub,
// the denial gate and the command palette all read ONE list. The parallel
// `SETTINGS_GROUPS` in the legacy sidebar had drifted to 31 keys against these 33.

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

    // DIR-105: authorization is resolved by ONE predicate, shared with the
    // navigator, so the hub can never offer a panel this gate would refuse.
    const isDenied = Boolean(targetSetting)
        && !canAccessSetting(targetSetting, { isSuperAdmin, permissions });

    // Rendered on both branches: a denied operator must still be able to reach
    // the panels they ARE entitled to (previously they were stranded).
    const navigator = (
        <SettingsNavigator
            settings={ALL_SETTINGS}
            isSuperAdmin={isSuperAdmin}
            permissions={permissions}
        />
    );

    if (isDenied) {
        return (
            <div className="space-y-6">
                {navigator}
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

    return (
        <div className="space-y-6">
            {navigator}
            <SettingsContent activeTab={activeTab} />
        </div>
    );
}

export default SettingsWrapper;
