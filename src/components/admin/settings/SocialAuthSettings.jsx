import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaLinkedin, FaGithub, FaCheck, FaTimes, FaSpinner, FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';

const SocialAuthSettings = () => {
    const [socialAuthConfig, setSocialAuthConfig] = useState({
        linkedinClientId: '',
        linkedinClientSecret: '',
        enableLinkedinLogin: false,
        githubClientId: '',
        githubClientSecret: '',
        enableGithubLogin: false,
    });
    const [showLinkedinSecret, setShowLinkedinSecret] = useState(false);
    const [showGithubSecret, setShowGithubSecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.socialAuth) {
                const sa = settings.socialAuth;
                const hasLinkedin = !!(sa.linkedinClientId && sa.linkedinClientId.trim());
                const hasGithub = !!(sa.githubClientId && sa.githubClientId.trim());
                setSocialAuthConfig({
                    linkedinClientId: sa.linkedinClientId || '',
                    linkedinClientSecret: sa.linkedinClientSecret || '',
                    enableLinkedinLogin: sa.enableLinkedinLogin !== undefined ? sa.enableLinkedinLogin : hasLinkedin,
                    githubClientId: sa.githubClientId || '',
                    githubClientSecret: sa.githubClientSecret || '',
                    enableGithubLogin: sa.enableGithubLogin !== undefined ? sa.enableGithubLogin : hasGithub,
                });
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSocialAuthConfig((prev) => {
            const next = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };
            if (type !== 'checkbox' && (name === 'linkedinClientId' || name === 'linkedinClientSecret') && value.trim() !== '') {
                next.enableLinkedinLogin = true;
            }
            if (type !== 'checkbox' && (name === 'githubClientId' || name === 'githubClientSecret') && value.trim() !== '') {
                next.enableGithubLogin = true;
            }
            return next;
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('socialAuth', socialAuthConfig);
            setStatusMessage({ type: 'success', text: 'LinkedIn & GitHub OAuth settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading OAuth settings...</span>
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

            {/* LinkedIn */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaLinkedin className="text-sky-600 text-xl" /> LinkedIn Single Sign-On (OAuth)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Allow users to register and log in instantly using their professional LinkedIn profile.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            LinkedIn Client ID
                        </label>
                        <input
                            type="text"
                            name="linkedinClientId"
                            value={socialAuthConfig.linkedinClientId}
                            onChange={handleChange}
                            placeholder="77..."
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            LinkedIn Client Secret
                        </label>
                        <div className="relative">
                            <input
                                type={showLinkedinSecret ? "text" : "password"}
                                name="linkedinClientSecret"
                                value={socialAuthConfig.linkedinClientSecret}
                                onChange={handleChange}
                                placeholder="Secret..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowLinkedinSecret(!showLinkedinSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showLinkedinSecret ? "Hide Secret" : "Show Secret"}
                            >
                            </button>
                        </div>
                    </div>
                </div>

                {/* Helpful Redirect URL Copy Box */}
                <div className="my-3 p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                        <span>📌 Authorized Redirect URL for LinkedIn Developer Portal:</span>
                    </p>
                    <code className="block p-2 bg-white border border-sky-200 rounded font-mono text-[11px] select-all text-slate-800 break-all">
                        {`https://${window.location.host}/api/auth/linkedin/callback`}
                    </code>
                    <p className="text-[11px] text-sky-700">
                        Copy this exact URL and paste it under <strong>LinkedIn Developer Portal ➔ Auth ➔ OAuth 2.0 settings ➔ Authorized redirect URLs</strong>.
                    </p>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                    <input
                        type="checkbox"
                        id="enableLinkedinLogin"
                        name="enableLinkedinLogin"
                        checked={socialAuthConfig.enableLinkedinLogin}
                        onChange={handleChange}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                    />
                    <label htmlFor="enableLinkedinLogin" className="text-sm font-medium text-slate-700">
                        Enable "Log in with LinkedIn" button
                    </label>
                </div>
            </div>

            {/* GitHub */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaGithub className="text-slate-900 text-xl" /> GitHub Single Sign-On (OAuth)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Allow developers and tech professionals to sign up with their GitHub credentials.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            GitHub Client ID
                        </label>
                        <input
                            type="text"
                            name="githubClientId"
                            value={socialAuthConfig.githubClientId}
                            onChange={handleChange}
                            placeholder="Ov23..."
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-800 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            GitHub Client Secret
                        </label>
                        <div className="relative">
                            <input
                                type={showGithubSecret ? "text" : "password"}
                                name="githubClientSecret"
                                value={socialAuthConfig.githubClientSecret}
                                onChange={handleChange}
                                placeholder="Secret..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-800 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowGithubSecret(!showGithubSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showGithubSecret ? "Hide Secret" : "Show Secret"}
                            >
                                {showGithubSecret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                    <input
                        type="checkbox"
                        id="enableGithubLogin"
                        name="enableGithubLogin"
                        checked={socialAuthConfig.enableGithubLogin}
                        onChange={handleChange}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-800 h-4 w-4"
                    />
                    <label htmlFor="enableGithubLogin" className="text-sm font-medium text-slate-700">
                        Enable "Log in with GitHub" button
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
                    <span>Save OAuth Settings</span>
                </button>
            </div>
        </form>
    );
};

export default SocialAuthSettings;
