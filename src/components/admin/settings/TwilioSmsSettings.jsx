import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaCommentAlt, FaCheck, FaTimes, FaSpinner, FaPhoneAlt, FaEye, FaEyeSlash } from 'react-icons/fa';

const TwilioSmsSettings = () => {
    const [twilioConfig, setTwilioConfig] = useState({
        accountSid: '',
        authToken: '',
        fromPhoneNumber: '',
        enableSmsAlerts: false,
    });
    const [showToken, setShowToken] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.twilio) {
                const tw = settings.twilio;
                const hasAccountSid = !!(tw.accountSid && tw.accountSid.trim());
                setTwilioConfig({
                    accountSid: tw.accountSid || '',
                    authToken: tw.authToken || '',
                    fromPhoneNumber: tw.fromPhoneNumber || '',
                    enableSmsAlerts: tw.enableSmsAlerts !== undefined ? tw.enableSmsAlerts : hasAccountSid,
                });
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setTwilioConfig((prev) => {
            const next = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };
            if (type !== 'checkbox' && (name === 'accountSid' || name === 'authToken') && value.trim() !== '') {
                next.enableSmsAlerts = true;
            }
            return next;
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('twilio', twilioConfig);
            setStatusMessage({ type: 'success', text: 'Twilio SMS gateway settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading SMS settings...</span>
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
                    <FaCommentAlt className="text-red-600" /> Twilio SMS & Phone Gateway
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure your Twilio credentials for sending OTP verification codes and SMS job alert notifications.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Twilio Account SID
                        </label>
                        <input
                            type="text"
                            name="accountSid"
                            value={twilioConfig.accountSid}
                            onChange={handleChange}
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Twilio Auth Token
                        </label>
                        <div className="relative">
                            <input
                                type={showToken ? "text" : "password"}
                                name="authToken"
                                value={twilioConfig.authToken}
                                onChange={handleChange}
                                placeholder="auth_token..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showToken ? "Hide Auth Token" : "Show Auth Token"}
                            >
                                {showToken ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Twilio Virtual Phone Number
                        </label>
                        <input
                            type="text"
                            name="fromPhoneNumber"
                            value={twilioConfig.fromPhoneNumber}
                            onChange={handleChange}
                            placeholder="+1234567890"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 focus:outline-none"
                        />
                    </div>

                    <div className="flex items-center space-x-2 pt-6">
                        <input
                            type="checkbox"
                            id="enableSmsAlerts"
                            name="enableSmsAlerts"
                            checked={twilioConfig.enableSmsAlerts}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-red-600 focus:ring-red-500 h-4 w-4"
                        />
                        <label htmlFor="enableSmsAlerts" className="text-sm font-medium text-slate-700">
                            Enable Outgoing SMS Notifications
                        </label>
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
                    <span>Save SMS Settings</span>
                </button>
            </div>
        </form>
    );
};

export default TwilioSmsSettings;
