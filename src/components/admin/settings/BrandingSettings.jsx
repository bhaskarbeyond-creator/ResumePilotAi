import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaPaintBrush, FaCheck, FaTimes, FaSpinner, FaImage, FaUserCircle, FaMoon, FaSun, FaGlobe, FaRedo } from 'react-icons/fa';

const BrandingSettings = () => {
    const [brandingConfig, setBrandingConfig] = useState({
        brandName: 'ResumePilot AI',
        logoUrl: '/src/assets/logo/logo.png',
        darkLogoUrl: '/src/assets/logo/logo.png',
        faviconUrl: '/favicon-32x32.png',
        defaultAvatarUrl: '/src/assets/user.png',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.branding) {
                setBrandingConfig((prev) => ({
                    ...prev,
                    ...settings.branding,
                    logoUrl: settings.branding.logoUrl || '/src/assets/logo/logo.png',
                    darkLogoUrl: settings.branding.darkLogoUrl || '/src/assets/logo/logo.png',
                    faviconUrl: settings.branding.faviconUrl || '/favicon.ico',
                    defaultAvatarUrl: settings.branding.defaultAvatarUrl || '/src/assets/user.png',
                }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setBrandingConfig((prev) => ({ ...prev, [name]: value }));
    };

    const resetHighStandardAssets = () => {
        setBrandingConfig({
            brandName: 'ResumePilot AI',
            logoUrl: '/src/assets/logo/logo.png',
            darkLogoUrl: '/src/assets/logo/logo.png',
            faviconUrl: '/favicon-32x32.png',
            defaultAvatarUrl: '/src/assets/user.png',
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('branding', brandingConfig);
            setStatusMessage({ type: 'success', text: 'Branding & High-Standard Media Assets saved successfully!' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading branding settings...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {statusMessage && (
                <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-0.5">
                            <FaPaintBrush className="text-purple-600" /> Platform Branding & High-Standard Media Assets
                        </h3>
                        <p className="text-xs text-slate-500">
                            Configure main header logos, dark mode variants, favicon badges, and default user profile avatars.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={resetHighStandardAssets}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                        <FaRedo className="w-3 h-3 text-slate-500" />
                        <span>Restore Standard Assets</span>
                    </button>
                </div>

                {/* Brand Title Input */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Official Platform Brand Name
                    </label>
                    <input
                        type="text"
                        name="brandName"
                        value={brandingConfig.brandName}
                        onChange={handleChange}
                        placeholder="ResumePilot AI"
                        className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-800 focus:outline-none bg-white font-semibold text-slate-900"
                    />
                </div>

                {/* Asset Input & Live Preview Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Header Logo (Light Mode) */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <FaSun className="text-amber-500" />
                                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    Header Logo (Light Theme)
                                </label>
                            </div>
                            <input
                                type="text"
                                name="logoUrl"
                                value={brandingConfig.logoUrl}
                                onChange={handleChange}
                                placeholder="/src/assets/logo/logo.png"
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-800 focus:outline-none mb-3"
                            />
                        </div>

                        <div className="h-20 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center p-2">
                            {brandingConfig.logoUrl ? (
                                <img
                                    src={brandingConfig.logoUrl}
                                    alt="Light Logo Preview"
                                    className="max-h-12 max-w-full object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <span className="text-xs text-slate-400">Light Logo Preview</span>
                            )}
                        </div>
                    </div>

                    {/* Header Logo (Dark Mode) */}
                    <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <FaMoon className="text-blue-400" />
                                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                                    Header Logo (Dark Theme)
                                </label>
                            </div>
                            <input
                                type="text"
                                name="darkLogoUrl"
                                value={brandingConfig.darkLogoUrl}
                                onChange={handleChange}
                                placeholder="/src/assets/logo/logo.png"
                                className="w-full px-3 py-2 text-xs border border-slate-700 bg-slate-800 text-slate-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none mb-3"
                            />
                        </div>

                        <div className="h-20 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center p-2">
                            {brandingConfig.darkLogoUrl ? (
                                <img
                                    src={brandingConfig.darkLogoUrl}
                                    alt="Dark Logo Preview"
                                    className="max-h-12 max-w-full object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <span className="text-xs text-slate-500">Dark Logo Preview</span>
                            )}
                        </div>
                    </div>

                    {/* Favicon URL */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <FaGlobe className="text-emerald-600" />
                                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    Browser Favicon Badge
                                </label>
                            </div>
                            <input
                                type="text"
                                name="faviconUrl"
                                value={brandingConfig.faviconUrl}
                                onChange={handleChange}
                                placeholder="/favicon.ico"
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-800 focus:outline-none mb-3"
                            />
                        </div>

                        <div className="h-16 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center space-x-3 p-2">
                            {brandingConfig.faviconUrl ? (
                                <img
                                    src={brandingConfig.faviconUrl}
                                    alt="Favicon Preview"
                                    className="w-8 h-8 object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <span className="text-xs text-slate-400">Favicon Preview</span>
                            )}
                            <span className="text-xs font-semibold text-slate-600">32x32 Favicon Icon</span>
                        </div>
                    </div>

                    {/* Default User Avatar */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                        <div>
                            <div className="flex items-center space-x-2 mb-2">
                                <FaUserCircle className="text-purple-600" />
                                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    Default User Profile Avatar
                                </label>
                            </div>
                            <input
                                type="text"
                                name="defaultAvatarUrl"
                                value={brandingConfig.defaultAvatarUrl}
                                onChange={handleChange}
                                placeholder="/src/assets/user.png"
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-800 focus:outline-none mb-3"
                            />
                        </div>

                        <div className="h-16 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center space-x-3 p-2">
                            {brandingConfig.defaultAvatarUrl ? (
                                <img
                                    src={brandingConfig.defaultAvatarUrl}
                                    alt="Avatar Preview"
                                    className="w-10 h-10 rounded-full object-cover border border-slate-200"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <FaUserCircle className="w-8 h-8 text-slate-300" />
                            )}
                            <span className="text-xs font-semibold text-slate-600">User Placeholder Avatar</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center space-x-2 shadow-md transition-all"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save High-Standard Media Assets</span>
                </button>
            </div>
        </form>
    );
};

export default BrandingSettings;
