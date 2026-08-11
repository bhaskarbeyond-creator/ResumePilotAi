import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaMapMarkerAlt, FaCheck, FaTimes, FaSpinner, FaShieldAlt, FaEye, FaEyeSlash } from 'react-icons/fa';

const IntegrationsSettings = () => {
    const [integrationsConfig, setIntegrationsConfig] = useState({
        googleMapsApiKey: '',
        recaptchaSiteKey: '',
        recaptchaSecretKey: '',
        gaMeasurementId: '',
        facebookPixelId: '',
    });
    const [showMapsKey, setShowMapsKey] = useState(false);
    const [showRecaptchaSecret, setShowRecaptchaSecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            const ig = (settings && settings.integrations) || {};
            setIntegrationsConfig({
                googleMapsApiKey: ig.googleMapsApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY || '',
                recaptchaSiteKey: ig.recaptchaSiteKey || '',
                recaptchaSecretKey: ig.recaptchaSecretKey || '',
                gaMeasurementId: ig.gaMeasurementId || import.meta.env.VITE_MEASUREMENT_ID || import.meta.env.VITE_GA_MEASUREMENT_ID || '',
                facebookPixelId: ig.facebookPixelId || '',
            });
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setIntegrationsConfig((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('integrations', integrationsConfig);
            setStatusMessage({ type: 'success', text: 'Integrations & Maps settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading integration settings...</span>
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

            {/* Google Maps */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaMapMarkerAlt className="text-red-500" /> Google Maps API
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Enable Google Maps geocoding and location auto-complete for job listings.
                </p>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Google Maps Javascript API Key
                    </label>
                    <div className="relative">
                        <input
                            type={showMapsKey ? "text" : "password"}
                            name="googleMapsApiKey"
                            value={integrationsConfig.googleMapsApiKey}
                            onChange={handleChange}
                            placeholder="AIzaSy..."
                            className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={() => setShowMapsKey(!showMapsKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                            title={showMapsKey ? "Hide API Key" : "Show API Key"}
                        >
                            {showMapsKey ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* reCAPTCHA Bot Protection */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaShieldAlt className="text-emerald-600" /> Google reCAPTCHA Security
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Protect sign-up and contact forms against automated spam bots.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            reCAPTCHA Site Key (Public)
                        </label>
                        <input
                            type="text"
                            name="recaptchaSiteKey"
                            value={integrationsConfig.recaptchaSiteKey}
                            onChange={handleChange}
                            placeholder="6LeIx..."
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            reCAPTCHA Secret Key (Private)
                        </label>
                        <div className="relative">
                            <input
                                type={showRecaptchaSecret ? "text" : "password"}
                                name="recaptchaSecretKey"
                                value={integrationsConfig.recaptchaSecretKey}
                                onChange={handleChange}
                                placeholder="6LeIx..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowRecaptchaSecret(!showRecaptchaSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showRecaptchaSecret ? "Hide Secret" : "Show Secret"}
                            >
                                {showRecaptchaSecret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Analytics IDs */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Google Analytics 4 Measurement ID
                        </label>
                        <input
                            type="text"
                            name="gaMeasurementId"
                            value={integrationsConfig.gaMeasurementId}
                            onChange={handleChange}
                            placeholder="G-XXXXXXXXXX"
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
                            value={integrationsConfig.facebookPixelId}
                            onChange={handleChange}
                            placeholder="123456789012345"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
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
                    <span>Save Integrations</span>
                </button>
            </div>
        </form>
    );
};

export default IntegrationsSettings;
