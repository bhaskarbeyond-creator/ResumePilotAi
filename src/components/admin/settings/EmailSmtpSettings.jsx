import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import config from '../../../conf/configuration';
import { FaEnvelope, FaCheck, FaTimes, FaSpinner, FaPaperPlane, FaEye, FaEyeSlash } from 'react-icons/fa';

const EmailSmtpSettings = () => {
    const [smtpConfig, setSmtpConfig] = useState({
        host: 'smtp.gmail.com',
        port: 587,
        encryption: 'tls',
        username: '',
        password: '',
        senderName: 'AI Resume Builder',
        adminEmail: 'bhaskar.beyond@gmail.com',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            const sm = (settings && settings.smtp) || {};
            setSmtpConfig({
                host: sm.host || 'smtp.gmail.com',
                port: sm.port || 587,
                encryption: sm.encryption || 'tls',
                username: sm.username || '',
                password: sm.password || '',
                senderName: sm.senderName || config?.brand?.name || 'AI Resume Builder',
                adminEmail: sm.adminEmail || config?.adminEmail || 'bhaskar.beyond@gmail.com',
            });
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSmtpConfig((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('smtp', smtpConfig);
            setStatusMessage({ type: 'success', text: 'Email & SMTP settings saved successfully!' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    const handleTestEmail = async () => {
        setTesting(true);
        try {
            const response = await fetch('http://localhost:8080/api/admin/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'smtp', ...smtpConfig })
            });
            const data = await response.json();
            if (data.success) {
                setStatusMessage({ type: 'success', text: `Test mail sent successfully to ${smtpConfig.adminEmail}!` });
            } else {
                setStatusMessage({ type: 'error', text: `SMTP test failed: ${data.error}` });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Backend error: ${err.message}` });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading email settings...</span>
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
                    <FaEnvelope className="text-blue-600" /> Mail & SMTP Configuration
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure your outgoing SMTP server for sending welcome emails, password resets, and user notifications.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            SMTP Host
                        </label>
                        <input
                            type="text"
                            name="host"
                            value={smtpConfig.host}
                            onChange={handleChange}
                            placeholder="smtp.gmail.com / smtp.mailgun.org"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Port
                        </label>
                        <input
                            type="number"
                            name="port"
                            value={smtpConfig.port}
                            onChange={handleChange}
                            placeholder="587 / 465"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Encryption Security
                        </label>
                        <select
                            name="encryption"
                            value={smtpConfig.encryption}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="tls">TLS (STARTTLS - Port 587)</option>
                            <option value="ssl">SSL (Port 465)</option>
                            <option value="none">None (Plaintext - Port 25)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            SMTP Username
                        </label>
                        <input
                            type="text"
                            name="username"
                            value={smtpConfig.username}
                            onChange={handleChange}
                            placeholder="user@domain.com"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            SMTP Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                name="password"
                                value={smtpConfig.password}
                                onChange={handleChange}
                                placeholder="App Password / Key"
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showPassword ? "Hide Password" : "Show Password"}
                            >
                                {showPassword ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Sender Display Name
                        </label>
                        <input
                            type="text"
                            name="senderName"
                            value={smtpConfig.senderName}
                            onChange={handleChange}
                            placeholder="AI Resume Builder Team"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Admin Notification Recipient Email
                        </label>
                        <input
                            type="email"
                            name="adminEmail"
                            value={smtpConfig.adminEmail}
                            onChange={handleChange}
                            placeholder="admin@domain.com"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-2">
                <button
                    type="button"
                    onClick={handleTestEmail}
                    disabled={testing}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 flex items-center space-x-2"
                >
                    {testing ? <FaSpinner className="animate-spin text-slate-500" /> : <FaPaperPlane className="text-blue-600" />}
                    <span>Send Test Email</span>
                </button>

                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save SMTP Settings</span>
                </button>
            </div>
        </form>
    );
};

export default EmailSmtpSettings;
