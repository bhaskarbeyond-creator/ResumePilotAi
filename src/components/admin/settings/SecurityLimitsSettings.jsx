import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaLock, FaCheck, FaTimes, FaSpinner, FaShieldAlt } from 'react-icons/fa';

const SecurityLimitsSettings = () => {
    const [securityConfig, setSecurityConfig] = useState({
        maxUploadSizeMb: 5,
        allowedExtensions: '.png,.jpg,.jpeg,.pdf,.doc,.docx',
        sessionTimeoutMinutes: 60,
        rateLimitRequests: 100,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.security) {
                setSecurityConfig({ ...securityConfig, ...settings.security });
            }
            setLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSecurityConfig((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('security', securityConfig);
            setStatusMessage({ type: 'success', text: 'Security & Limits settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading security settings...</span>
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
                    <FaShieldAlt className="text-slate-700" /> Security, Upload & Rate Limits
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Control file upload caps, allowed extensions, session inactivity timeouts, and request limits.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Max File Upload Size (MB)
                        </label>
                        <input
                            type="number"
                            name="maxUploadSizeMb"
                            value={securityConfig.maxUploadSizeMb}
                            onChange={handleChange}
                            placeholder="5"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Allowed Upload File Extensions
                        </label>
                        <input
                            type="text"
                            name="allowedExtensions"
                            value={securityConfig.allowedExtensions}
                            onChange={handleChange}
                            placeholder=".png,.jpg,.jpeg,.pdf,.doc,.docx"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Session Timeout (Minutes)
                        </label>
                        <input
                            type="number"
                            name="sessionTimeoutMinutes"
                            value={securityConfig.sessionTimeoutMinutes}
                            onChange={handleChange}
                            placeholder="60"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            API Rate Limit (Requests / Min per IP)
                        </label>
                        <input
                            type="number"
                            name="rateLimitRequests"
                            value={securityConfig.rateLimitRequests}
                            onChange={handleChange}
                            placeholder="100"
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
                    <span>Save Security Limits</span>
                </button>
            </div>
        </form>
    );
};

export default SecurityLimitsSettings;
