import React, { useState, useEffect } from 'react';
import { sendSmsNotification } from '../../../firestore/dbOperations';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import { useAdminSession } from '../AdminContext';
import { FaCommentAlt, FaCheck, FaTimes, FaSpinner, FaPhoneAlt, FaEye, FaEyeSlash, FaPaperPlane } from 'react-icons/fa';

const TwilioSmsSettings = () => {
    const { isSuperAdmin } = useAdminSession();
    const [twilioConfig, setTwilioConfig] = useState({
        accountSid: '',
        authToken: '',
        fromPhoneNumber: '',
        enableSmsAlerts: false,
    });
    const [credentialStatus, setCredentialStatus] = useState({ configured: false, accountSidSuffix: '' });
    const [revision, setRevision] = useState(0);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);
    const [clearCredentials, setClearCredentials] = useState(false);

    useEffect(() => {
        let active = true;
        fetchAdminWithReauth('/api/admin/twilio-settings').then(({ response, data }) => {
            if (!active) return;
            if (!response.ok || !data.success) throw new Error(data.error?.message || data.error || 'SMS settings could not be loaded.');
            const settings = data.settings || {};
            setTwilioConfig(current => ({ ...current, accountSid: '', authToken: '', fromPhoneNumber: settings.fromPhoneNumber || '', enableSmsAlerts: settings.enableSmsAlerts === true }));
            setCredentialStatus({ configured: settings.accountSidConfigured === true && settings.authTokenConfigured === true && Boolean(settings.fromPhoneNumber), accountSidSuffix: settings.accountSidSuffix || '' });
            setRevision(Number(data.revision || 0));
            setSettingsLoaded(true);
        }).catch(error => {
            if (active) setStatusMessage({ type: 'error', text: `SMS settings were not loaded; saving is disabled. ${error.message}` });
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if ((name === 'accountSid' || name === 'authToken') && String(value).trim()) setClearCredentials(false);
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
        if (!settingsLoaded) {
            setStatusMessage({ type: 'error', text: 'SMS settings are unavailable. Reload before saving.' });
            return;
        }
        setSaving(true);
        try {
            const { response, data } = await fetchAdminWithReauth('/api/admin/twilio-settings', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...twilioConfig, clearCredentials, expectedRevision: revision }),
            });
            if (!response.ok || !data.success) throw Object.assign(new Error(data.error?.message || data.error || 'SMS settings could not be saved.'), { code: data.code });
            const settings = data.settings || {};
            setRevision(Number(data.revision || revision));
            setCredentialStatus({ configured: settings.accountSidConfigured === true && settings.authTokenConfigured === true && Boolean(settings.fromPhoneNumber), accountSidSuffix: settings.accountSidSuffix || '' });
            setTwilioConfig(current => ({ ...current, accountSid: '', authToken: '', fromPhoneNumber: settings.fromPhoneNumber || current.fromPhoneNumber, enableSmsAlerts: settings.enableSmsAlerts === true }));
            setClearCredentials(false);
            setStatusMessage({ type: 'success', text: 'Twilio SMS gateway settings saved to the trusted backend. Empty credentials were preserved; explicit clear actions were applied.' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
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
                <div role={statusMessage.type === 'success' ? 'status' : 'alert'} className={`p-4 rounded-lg flex items-center justify-between text-sm ${
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
                <p className="text-xs text-slate-500 mb-2">
                    Configure backend-only Twilio credentials for sending SMS alerts. Leave both credential fields blank to preserve the configured credential.
                </p>
                <p className={`mb-4 text-xs font-semibold ${credentialStatus.configured ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {credentialStatus.configured ? `Gateway credential configured${credentialStatus.accountSidSuffix ? ` (Account SID ending ${credentialStatus.accountSidSuffix})` : ''}.` : 'Gateway credential is not fully configured.'}
                </p>
                <label className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={clearCredentials} disabled={!isSuperAdmin} onChange={event => setClearCredentials(event.target.checked)} /> Clear stored Twilio Account SID and Auth Token on save</label>

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
                            disabled={!isSuperAdmin}
                            placeholder={isSuperAdmin ? (credentialStatus.configured ? 'Configured — enter both credentials to rotate' : 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') : 'Super Admin only — status is shown'}
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
                                disabled={!isSuperAdmin}
                                placeholder={isSuperAdmin ? (credentialStatus.configured ? 'Configured — leave blank to preserve' : 'Enter Twilio Auth Token') : 'Super Admin only — status is shown'}
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

            <div className="flex items-center justify-between pt-2">
                <button
                    type="button"
                    disabled={testing || !credentialStatus.configured || !isSuperAdmin}
                    onClick={async () => {
                        const testNumber = prompt('Enter recipient mobile phone number with country code (e.g. +14155552671 or +919876543210):');
                        if (!testNumber) return;
                        setTesting(true);
                        try {
                            const res = await sendSmsNotification(testNumber, 'Hello! This is a test SMS security alert from AI Resume Builder.', twilioConfig);
                            if (res.success) {
                                setStatusMessage({ type: 'success', text: `Test SMS sent successfully! (SID: ${res.messageSid || 'OK'})` });
                            } else {
                                setStatusMessage({ type: 'error', text: `SMS Dispatch Failed: ${res.error}` });
                            }
                        } catch (err) {
                            setStatusMessage({ type: 'error', text: `Error: ${err.message}` });
                        } finally {
                            setTesting(false);
                        }
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md flex items-center space-x-1.5 shadow-xs cursor-pointer">
                    {testing ? <FaSpinner className="animate-spin text-slate-600" /> : <FaPaperPlane className="text-indigo-600 w-3 h-3" />}
                    <span>{isSuperAdmin ? 'Send Test SMS' : 'Super Admin test only'}</span>
                </button>
                <button
                    type="submit"
                    disabled={saving || !settingsLoaded || !isSuperAdmin}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm cursor-pointer"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>{isSuperAdmin ? 'Save SMS Settings' : 'Super Admin only'}</span>
                </button>
            </div>
        </form>
    );
};

export default TwilioSmsSettings;
