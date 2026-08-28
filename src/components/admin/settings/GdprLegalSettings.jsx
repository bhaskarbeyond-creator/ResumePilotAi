import React, { useState, useEffect } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaCookieBite, FaCheck, FaTimes, FaSpinner, FaBalanceScale } from 'react-icons/fa';

const GdprLegalSettings = () => {
    const [gdprConfig, setGdprConfig] = useState({
        enableCookieBanner: true,
        cookieMessage: 'We use cookies to improve your resume building experience and analyze website traffic.',
        buttonText: 'Accept All Cookies',
        privacyPolicyUrl: '/p/privacy-policy',
        termsOfServiceUrl: '/p/terms-of-service',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getAdminSystemSettings().then((settings) => {
            if (settings && settings.gdpr) {
                setGdprConfig((prev) => ({ ...prev, ...settings.gdpr }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setGdprConfig((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const result = await saveSystemSettings('gdpr', gdprConfig);
            if (!result?.success) throw new Error(result?.error?.message || result?.error || 'Unable to save privacy settings');
            setGdprConfig((current) => ({ ...current, ...(result.settings || {}) }));
            setStatusMessage({ type: 'success', text: 'GDPR Cookie Notice & Legal settings saved!' });
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
                <span className="text-slate-600 text-sm">Loading legal settings...</span>
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
                    <FaCookieBite className="text-amber-600" /> GDPR Cookie Banner & Compliance
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure your cookie consent banner and legal page URL redirects.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-3 bg-white rounded border border-slate-200">
                        <input
                            type="checkbox"
                            id="enableCookieBanner"
                            name="enableCookieBanner"
                            checked={gdprConfig.enableCookieBanner}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-5 w-5"
                        />
                        <div>
                            <label htmlFor="enableCookieBanner" className="text-sm font-semibold text-slate-800">
                                Enable Floating GDPR Cookie Consent Banner
                            </label>
                            <p className="text-xs text-slate-500">
                                Display a bottom cookie consent notification bar to first-time website visitors.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Cookie Notification Message
                            </label>
                            <input
                                type="text"
                                name="cookieMessage"
                                value={gdprConfig.cookieMessage}
                                onChange={handleChange}
                                placeholder="We use cookies to improve your experience..."
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Accept Button Text
                            </label>
                            <input
                                type="text"
                                name="buttonText"
                                value={gdprConfig.buttonText}
                                onChange={handleChange}
                                placeholder="Accept All"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Privacy Policy Page URL
                            </label>
                            <input
                                type="text"
                                name="privacyPolicyUrl"
                                value={gdprConfig.privacyPolicyUrl}
                                onChange={handleChange}
                                placeholder="/p/privacy-policy"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Terms of Service Page URL
                            </label>
                            <input
                                type="text"
                                name="termsOfServiceUrl"
                                value={gdprConfig.termsOfServiceUrl}
                                onChange={handleChange}
                                placeholder="/p/terms-of-service"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save Legal Settings</span>
                </button>
            </div>
        </form>
    );
};

export default GdprLegalSettings;
