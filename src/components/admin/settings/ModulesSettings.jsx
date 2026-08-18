import React, { useState, useEffect } from 'react';
import {
    FaCubes,
    FaDownload,
    FaBriefcase,
    FaGlobe,
    FaFileAlt,
    FaMagic,
    FaChartLine,
    FaShareAlt,
    FaCheckCircle,
    FaSave,
    FaSpinner,
    FaInfoCircle,
    FaTag,
    FaGoogle,
    FaFacebook,
    FaLinkedin,
    FaGithub,
    FaEnvelope,
    FaShieldAlt
} from 'react-icons/fa';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';

const ModulesSettings = () => {
    const [modulesConfig, setModulesConfig] = useState({
        enableGoogleAuthModule: true,
        enableFacebookAuthModule: true,
        enableLinkedinAuthModule: true,
        enableGithubAuthModule: true,
        enableImportModule: false, // Default OFF as requested
        enableEmailVerification: false, // Default OFF — preserves current behavior
        enableJobScraperModule: true,
        enablePortfolioModule: true,
        enableCoverLetterModule: true,
        enableAiSuggestionsModule: true,
        enableAtsScoreModule: true,
        enablePublicSharingModule: true,
        enableCouponsModule: true,
        enableSalesTaxModule: true,
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingKey, setSavingKey] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            const mods = (settings && settings.modules) || {};
            const ai = (settings && settings.ai) || {};
            const sa = (settings && settings.socialAuth) || {};

            setModulesConfig({
                enableGoogleAuthModule: mods.enableGoogleAuthModule !== undefined ? mods.enableGoogleAuthModule : true,
                enableFacebookAuthModule: mods.enableFacebookAuthModule !== undefined ? mods.enableFacebookAuthModule : true,
                enableLinkedinAuthModule: mods.enableLinkedinAuthModule !== false && mods.enableLinkedinLogin !== false && sa.enableLinkedinLogin !== false,
                enableGithubAuthModule: mods.enableGithubAuthModule !== false && mods.enableGithubLogin !== false && sa.enableGithubLogin !== false,
                enableImportModule: mods.enableImportModule !== undefined
                    ? mods.enableImportModule
                    : (ai.enableImportModule !== undefined ? ai.enableImportModule : false),
                enableEmailVerification: mods.enableEmailVerification !== undefined ? mods.enableEmailVerification : false,
                enableJobScraperModule: mods.enableJobScraperModule !== undefined ? mods.enableJobScraperModule : true,
                enablePortfolioModule: mods.enablePortfolioModule !== undefined ? mods.enablePortfolioModule : true,
                enableCoverLetterModule: mods.enableCoverLetterModule !== undefined ? mods.enableCoverLetterModule : true,
                enableAiSuggestionsModule: mods.enableAiSuggestionsModule !== undefined ? mods.enableAiSuggestionsModule : true,
                enableAtsScoreModule: mods.enableAtsScoreModule !== undefined ? mods.enableAtsScoreModule : true,
                enablePublicSharingModule: mods.enablePublicSharingModule !== undefined ? mods.enablePublicSharingModule : true,
                enableCouponsModule: mods.enableCouponsModule !== undefined ? mods.enableCouponsModule : true,
                enableSalesTaxModule: mods.enableSalesTaxModule !== undefined ? mods.enableSalesTaxModule : true,
            });
            setLoading(false);
        }).catch((err) => {
            console.error('Error loading module settings:', err);
            setLoading(false);
        });
    }, []);

    const persistModules = async (nextConfig, targetKey = null) => {
        if (targetKey) setSavingKey(targetKey);
        setSaving(true);
        setToastMessage(null);

        try {
            const updatedModules = {
                ...nextConfig,
                enableLinkedinLogin: nextConfig.enableLinkedinAuthModule,
                enableGithubLogin: nextConfig.enableGithubAuthModule,
            };

            // Save module settings under category 'modules'
            await saveSystemSettings('modules', updatedModules);

            // Best-effort sync to auth and socialAuth namespaces without blocking modules
            try {
                await saveSystemSettings('auth', { enableEmailVerification: nextConfig.enableEmailVerification });
            } catch (authErr) {
                console.warn('Auth sync notice:', authErr);
            }

            try {
                const currentSettings = (await getSystemSettings()) || {};
                await saveSystemSettings('socialAuth', {
                    ...(currentSettings.socialAuth || {}),
                    enableLinkedinLogin: nextConfig.enableLinkedinAuthModule,
                    enableGithubLogin: nextConfig.enableGithubAuthModule,
                });
            } catch (socialErr) {
                console.warn('Social auth sync notice:', socialErr);
            }

            // Dispatch global event so all open tabs / components update state in real-time
            window.dispatchEvent(new CustomEvent('systemSettingsUpdated', {
                detail: {
                    modules: updatedModules,
                    socialAuth: {
                        enableLinkedinLogin: nextConfig.enableLinkedinAuthModule,
                        enableGithubLogin: nextConfig.enableGithubAuthModule,
                    },
                    ai: { enableImportModule: nextConfig.enableImportModule }
                }
            }));

            setToastMessage({ type: 'success', text: 'Module settings saved successfully!' });
        } catch (error) {
            console.error('Error saving module settings:', error);
            setToastMessage({ type: 'error', text: error?.message || 'Failed to save module settings. Please try again.' });
        } finally {
            setSaving(false);
            if (targetKey) setTimeout(() => setSavingKey(null), 1500);
            setTimeout(() => setToastMessage(null), 4000);
        }
    };

    const toggleModule = async (moduleKey) => {
        const nextValue = !modulesConfig[moduleKey];
        const nextConfig = {
            ...modulesConfig,
            [moduleKey]: nextValue,
        };
        setModulesConfig(nextConfig);
        await persistModules(nextConfig, moduleKey);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        await persistModules(modulesConfig);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <FaSpinner className="w-6 h-6 text-slate-600 animate-spin mr-3" />
                <span className="text-sm font-medium text-slate-600">Loading Addon Module Settings...</span>
            </div>
        );
    }

    const moduleItems = [
        {
            key: 'enableGoogleAuthModule',
            title: 'Google Single Sign-On (OAuth 2.0) Module',
            subtitle: 'Social Authentication',
            description: 'Enables 1-click Google Sign-in and Sign-up across login modals and auth forms. Turning this OFF hides the Google login button platform-wide.',
            icon: FaGoogle,
            badgeColor: modulesConfig.enableGoogleAuthModule ? 'indigo' : 'slate',
            statusText: modulesConfig.enableGoogleAuthModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableFacebookAuthModule',
            title: 'Facebook Single Sign-On (OAuth 2.0) Module',
            subtitle: 'Social Authentication',
            description: 'Enables 1-click Facebook Sign-in and Sign-up across login modals and auth forms. Turning this OFF hides the Facebook login button platform-wide.',
            icon: FaFacebook,
            badgeColor: modulesConfig.enableFacebookAuthModule ? 'blue' : 'slate',
            statusText: modulesConfig.enableFacebookAuthModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableLinkedinAuthModule',
            title: 'LinkedIn Single Sign-On (OAuth 2.0) Module',
            subtitle: 'Social Authentication',
            description: 'Enables 1-click LinkedIn Sign-in and Sign-up via server-side OAuth 2.0. Turning this OFF hides the LinkedIn login button platform-wide.',
            icon: FaLinkedin,
            badgeColor: modulesConfig.enableLinkedinAuthModule ? 'sky' : 'slate',
            statusText: modulesConfig.enableLinkedinAuthModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableGithubAuthModule',
            title: 'GitHub Single Sign-On (OAuth 2.0) Module',
            subtitle: 'Social Authentication',
            description: 'Enables 1-click GitHub Sign-in and Sign-up via server-side OAuth 2.0. Turning this OFF hides the GitHub login button platform-wide.',
            icon: FaGithub,
            badgeColor: modulesConfig.enableGithubAuthModule ? 'slate' : 'slate',
            statusText: modulesConfig.enableGithubAuthModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableImportModule',
            title: 'AI Resume Import Module',
            subtitle: 'Default: OFF',
            description: 'Allows candidates to upload existing PDF, DOCX, DOC, TXT, or Image resumes. AI parses and auto-fills all builder fields automatically.',
            icon: FaDownload,
            badgeColor: modulesConfig.enableImportModule ? 'purple' : 'slate',
            statusText: modulesConfig.enableImportModule ? 'ENABLED' : 'DISABLED (DEFAULT OFF)',
        },
        {
            key: 'enableEmailVerification',
            title: 'Email Address Verification Module',
            subtitle: 'Security — Default: OFF',
            description: 'Requires new users who register via email/password to verify their email address. A verification link is sent on sign-up. Users access the platform immediately, but a banner prompts them to verify. OAuth users (Google, Facebook, etc.) are always exempt.',
            icon: FaEnvelope,
            badgeColor: modulesConfig.enableEmailVerification ? 'indigo' : 'slate',
            statusText: modulesConfig.enableEmailVerification ? 'ENABLED' : 'DISABLED (DEFAULT OFF)',
        },
        {
            key: 'enableCouponsModule',
            title: 'Promo Coupons & Discount Module',
            subtitle: 'Checkout Discounts',
            description: 'Enables promo coupon codes, discount calculations, and quick coupon pills on subscription plans and checkout steps.',
            icon: FaTag,
            badgeColor: modulesConfig.enableCouponsModule ? 'emerald' : 'slate',
            statusText: modulesConfig.enableCouponsModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableSalesTaxModule',
            title: 'Sales Tax & GST / VAT Module',
            subtitle: 'Checkout Tax & Compliance',
            description: 'Enables dynamic Sales Tax, GST (18%), VAT calculations, company GSTIN numbers, and B2B tax invoice receipts.',
            icon: FaCubes,
            badgeColor: modulesConfig.enableSalesTaxModule ? 'indigo' : 'slate',
            statusText: modulesConfig.enableSalesTaxModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableJobScraperModule',
            title: 'Job Portal & Naukri Scraper Module',
            subtitle: 'Recruitment & Job Search',
            description: 'Enables job listings, keyword search, location filtering, and automated Naukri & LinkedIn job scraping.',
            icon: FaBriefcase,
            badgeColor: modulesConfig.enableJobScraperModule ? 'blue' : 'slate',
            statusText: modulesConfig.enableJobScraperModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enablePortfolioModule',
            title: 'Online Portfolio Builder Module',
            subtitle: 'Personal Websites',
            description: 'Allows users to build, customize, and host responsive personal portfolio websites with custom themes.',
            icon: FaGlobe,
            badgeColor: modulesConfig.enablePortfolioModule ? 'indigo' : 'slate',
            statusText: modulesConfig.enablePortfolioModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableCoverLetterModule',
            title: 'Cover Letter Generator Module',
            subtitle: 'Document Generator',
            description: 'Provides dedicated cover letter templates and AI draft generation tailored to target job descriptions.',
            icon: FaFileAlt,
            badgeColor: modulesConfig.enableCoverLetterModule ? 'emerald' : 'slate',
            statusText: modulesConfig.enableCoverLetterModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableAiSuggestionsModule',
            title: 'AI Bullet & Content Generator Module',
            subtitle: 'AI Writing Assistant',
            description: 'Generates live X-Y-Z formula work experience bullets, executive summaries, and ATS skills recommendations.',
            icon: FaMagic,
            badgeColor: modulesConfig.enableAiSuggestionsModule ? 'amber' : 'slate',
            statusText: modulesConfig.enableAiSuggestionsModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enableAtsScoreModule',
            title: 'ATS Score Checker & Optimization Meter',
            subtitle: 'ATS Diagnostics',
            description: 'Calculates real-time ATS score metrics, keyword matching feedback, and formatting diagnostics.',
            icon: FaChartLine,
            badgeColor: modulesConfig.enableAtsScoreModule ? 'cyan' : 'slate',
            statusText: modulesConfig.enableAtsScoreModule ? 'ENABLED' : 'DISABLED',
        },
        {
            key: 'enablePublicSharingModule',
            title: 'Public Link & URL Sharing Module',
            subtitle: 'Sharing & Export',
            description: 'Enables public web links and custom URL access for online resumes and candidate profiles.',
            icon: FaShareAlt,
            badgeColor: modulesConfig.enablePublicSharingModule ? 'teal' : 'slate',
            statusText: modulesConfig.enablePublicSharingModule ? 'ENABLED' : 'DISABLED',
        },
    ];

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-xl border border-indigo-900/60 shadow-md text-white">
                <div className="flex items-center space-x-3 mb-2">
                    <div className="p-3 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300">
                        <FaCubes className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Addon & Feature Modules Manager</h3>
                        <p className="text-xs text-indigo-200/80 mt-0.5">
                            Enable or disable platform capabilities on-demand. Turn modules ON/OFF instantly across user dashboards and builder steps.
                        </p>
                    </div>
                </div>
            </div>

            {/* Notification Toast */}
            {toastMessage && (
                <div className={`p-4 rounded-xl border text-sm font-medium flex items-center space-x-2 ${
                    toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-red-50 text-red-800 border-red-300'
                }`}>
                    <FaCheckCircle className="w-4 h-4 shrink-0" />
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* Module Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {moduleItems.map((mod) => {
                    const Icon = mod.icon;
                    const isEnabled = modulesConfig[mod.key];

                    return (
                        <div
                            key={mod.key}
                            className={`p-5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                                isEnabled
                                    ? 'bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-500/10'
                                    : 'bg-slate-50 border-slate-200 opacity-80'
                            }`}
                        >
                            <div>
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2.5 rounded-lg border ${
                                            isEnabled
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                : 'bg-slate-200 border-slate-300 text-slate-500'
                                        }`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-base font-bold text-slate-800">{mod.title}</h4>
                                            <span className="text-[11px] font-medium text-slate-600">{mod.subtitle}</span>
                                        </div>
                                    </div>

                                    {/* Toggle Switch */}
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => toggleModule(mod.key)}
                                        className="flex items-center space-x-2 focus:outline-none shrink-0 disabled:opacity-60"
                                        title={isEnabled ? 'Click to Disable' : 'Click to Enable'}
                                    >
                                        <div className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                                            isEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                                        }`}>
                                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                                isEnabled ? 'translate-x-6' : 'translate-x-0'
                                            }`} />
                                        </div>
                                    </button>
                                </div>

                                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                                    {mod.description}
                                </p>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                                    isEnabled
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                                }`}>
                                    {mod.statusText}
                                </span>
                                <span className="text-[11px] font-medium text-slate-600">
                                    {savingKey === mod.key ? (
                                        <span className="text-indigo-600 font-semibold flex items-center gap-1">
                                            <FaSpinner className="w-3 h-3 animate-spin" /> Saving...
                                        </span>
                                    ) : (
                                        isEnabled ? 'Active in App' : 'Disabled'
                                    )}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Information Banner */}
            <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl flex items-start space-x-3 text-xs text-amber-900">
                <FaInfoCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold mb-0.5">Note on Default Off State:</p>
                    <p>
                        The <strong>AI Resume Import Module</strong> and <strong>Email Address Verification Module</strong> are <strong>OFF (Disabled) by default</strong>. Toggle them to <strong>ENABLED</strong> and click "Save Module Changes" to activate for your platform.
                    </p>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg text-sm transition-all duration-200 shadow-md hover:shadow-lg flex items-center space-x-2 disabled:opacity-50"
                >
                    {saving ? (
                        <>
                            <FaSpinner className="w-4 h-4 animate-spin" />
                            <span>Saving Changes...</span>
                        </>
                    ) : (
                        <>
                            <FaSave className="w-4 h-4" />
                            <span>Save Module Changes</span>
                        </>
                    )}
                </button>
            </div>
        </form>
    );
};

export default ModulesSettings;
