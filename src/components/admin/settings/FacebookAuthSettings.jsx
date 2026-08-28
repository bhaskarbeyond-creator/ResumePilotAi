import React, { useState, useEffect } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaFacebook, FaCheck, FaTimes, FaSpinner, FaKey, FaUserLock, FaEye, FaEyeSlash } from 'react-icons/fa';

const FacebookAuthSettings = () => {
    const [facebookConfig, setFacebookConfig] = useState({
        facebookAppId: '',
        facebookAppSecret: '',
        facebookClientToken: '',
        facebookPixelId: '',
        enableFacebookLogin: false,
    });
    const [showSecret, setShowSecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getAdminSystemSettings().then((settings) => {
            if (settings && settings.facebook) {
                const fb = settings.facebook;
                const hasAppId = !!(fb.facebookAppId && fb.facebookAppId.trim());
                const enableLogin = fb.enableFacebookLogin !== undefined ? fb.enableFacebookLogin : hasAppId;
                setFacebookConfig({
                    facebookAppId: fb.facebookAppId || '',
                    facebookAppSecret: fb.facebookAppSecret || '',
                    facebookClientToken: fb.facebookClientToken || '',
                    facebookPixelId: fb.facebookPixelId || '',
                    enableFacebookLogin: enableLogin,
                });
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFacebookConfig((prev) => {
            const next = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };
            // If user enters App ID or App Secret, auto-enable Facebook login
            if (type !== 'checkbox' && (name === 'facebookAppId' || name === 'facebookAppSecret') && value.trim() !== '') {
                next.enableFacebookLogin = true;
            }
            return next;
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('facebook', facebookConfig);
            setStatusMessage({ type: 'success', text: 'Facebook Integration & OAuth settings saved!' });
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
                <span className="text-slate-600 text-sm">Loading Facebook settings...</span>
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

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaFacebook className="text-blue-600 text-xl" /> Facebook Login & Pixel Integration
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure your Facebook App Credentials for single sign-on (OAuth) and Facebook Pixel ad tracking.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Facebook App ID
                        </label>
                        <input
                            type="text"
                            name="facebookAppId"
                            value={facebookConfig.facebookAppId}
                            onChange={handleChange}
                            placeholder="123456789012345"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Facebook App Secret
                        </label>
                        <div className="relative">
                            <input
                                type={showSecret ? "text" : "password"}
                                name="facebookAppSecret"
                                value={facebookConfig.facebookAppSecret}
                                onChange={handleChange}
                                placeholder="abcdef1234567890..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showSecret ? "Hide Secret" : "Show Secret"}
                            >
                                {showSecret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Facebook Client Token
                        </label>
                        <input
                            type="text"
                            name="facebookClientToken"
                            value={facebookConfig.facebookClientToken}
                            onChange={handleChange}
                            placeholder="token_string..."
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Facebook Pixel ID
                        </label>
                        <input
                            type="text"
                            name="facebookPixelId"
                            value={facebookConfig.facebookPixelId}
                            onChange={handleChange}
                            placeholder="123456789012345"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                    <input
                        type="checkbox"
                        id="enableFacebookLogin"
                        name="enableFacebookLogin"
                        checked={facebookConfig.enableFacebookLogin}
                        onChange={handleChange}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <label htmlFor="enableFacebookLogin" className="text-sm font-medium text-slate-700">
                        Enable "Log in with Facebook" button on Sign In / Sign Up modals
                    </label>
                </div>
            </div>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save Facebook Credentials</span>
                </button>
            </div>
        </form>
    );
};

export default FacebookAuthSettings;
