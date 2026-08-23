import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import { FaLinkedin, FaGithub, FaFacebook, FaGoogle, FaCheck, FaTimes, FaSpinner, FaLock, FaEye, FaEyeSlash, FaInfoCircle, FaShieldAlt } from 'react-icons/fa';
import { useAdminSession } from '../AdminContext';

const SocialAuthSettings = () => {
    const { isSuperAdmin } = useAdminSession();
    const [socialAuthConfig, setSocialAuthConfig] = useState({
        googleClientId: '',
        googleClientSecret: '',
        facebookAppId: '',
        facebookAppSecret: '',
        facebookPixelId: '',
        linkedinClientId: '',
        linkedinClientSecret: '',
        enableLinkedinLogin: false,
        githubClientId: '',
        githubClientSecret: '',
        enableGithubLogin: false,
    });
    const [showGoogleSecret, setShowGoogleSecret] = useState(false);
    const [showFbSecret, setShowFbSecret] = useState(false);
    const [showLinkedinSecret, setShowLinkedinSecret] = useState(false);
    const [showGithubSecret, setShowGithubSecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);
    const [clearSecrets, setClearSecrets] = useState({});

    useEffect(() => {
        getSystemSettings().then((settings) => {
            const sa = (settings && settings.socialAuth) || {};
            const fb = (settings && settings.facebook) || {};
            const g = (settings && settings.google) || {};
            const hasLinkedin = !!(sa.linkedinClientId && sa.linkedinClientId.trim());
            const hasGithub = !!(sa.githubClientId && sa.githubClientId.trim());

            setSocialAuthConfig({
                googleClientId: g.googleClientId || sa.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
                googleClientSecret: g.googleClientSecret || sa.googleClientSecret || '',
                facebookAppId: fb.facebookAppId || sa.facebookAppId || '',
                facebookAppSecret: fb.facebookAppSecret || sa.facebookAppSecret || '',
                facebookPixelId: fb.facebookPixelId || sa.facebookPixelId || '',
                linkedinClientId: sa.linkedinClientId || '',
                linkedinClientSecret: sa.linkedinClientSecret || '',
                enableLinkedinLogin: sa.enableLinkedinLogin !== undefined ? sa.enableLinkedinLogin : hasLinkedin,
                githubClientId: sa.githubClientId || '',
                githubClientSecret: sa.githubClientSecret || '',
                enableGithubLogin: sa.enableGithubLogin !== undefined ? sa.enableGithubLogin : hasGithub,
            });
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const secretFields = new Set(['googleClientSecret', 'facebookAppSecret', 'linkedinClientSecret', 'githubClientSecret']);
        if (secretFields.has(name)) setClearSecrets(prev => ({ ...prev, [name]: false }));
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

    const handleCredentialTest = async provider => {
        setStatusMessage(null);
        try {
            const { response, data } = await fetchAdminWithReauth(`/api/auth/${provider}/test-credentials`);
            if (!response.ok) throw new Error(data.error?.message || data.error || `${provider} configuration test failed.`);
            setStatusMessage({
                type: data.configured ? 'success' : 'error',
                text: data.configured
                    ? `${provider === 'linkedin' ? 'LinkedIn' : 'GitHub'} backend credentials are configured. Callback: ${data.callbackUrl}`
                    : data.note,
            });
        } catch (error) {
            setStatusMessage({ type: 'error', text: error.message || `${provider} configuration test failed.` });
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('socialAuth', socialAuthConfig, { clearSecrets });
            await saveSystemSettings('google', {
                googleClientId: socialAuthConfig.googleClientId,
                googleClientSecret: socialAuthConfig.googleClientSecret,
                enableGoogleLogin: !!(socialAuthConfig.googleClientId && socialAuthConfig.googleClientId.trim())
            }, { clearSecrets });
            await saveSystemSettings('facebook', {
                facebookAppId: socialAuthConfig.facebookAppId,
                facebookAppSecret: socialAuthConfig.facebookAppSecret,
                facebookPixelId: socialAuthConfig.facebookPixelId,
                enableFacebookLogin: !!(socialAuthConfig.facebookAppId && socialAuthConfig.facebookAppId.trim())
            }, { clearSecrets });
            // CRITICAL FIX: Also save enable flags to 'modules' namespace which Login/Register read
            await saveSystemSettings('modules', {
                enableLinkedinLogin: socialAuthConfig.enableLinkedinLogin,
                enableGithubLogin: socialAuthConfig.enableGithubLogin,
            });
            setClearSecrets({});
            setSocialAuthConfig(current => ({ ...current, googleClientSecret: '', facebookAppSecret: '', linkedinClientSecret: '', githubClientSecret: '' }));
            setStatusMessage({ type: 'success', text: 'OAuth settings saved. Empty secrets were preserved; explicit clear selections were applied and audited.' });
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
                <div role={statusMessage.type === 'success' ? 'status' : 'alert'} className={`p-4 rounded-lg flex items-center justify-between text-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            {/* Google & Facebook OAuth Architecture Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-xl border border-indigo-800/50 shadow-sm text-white">
                <div className="flex items-start space-x-3">
                    <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300 mt-0.5">
                        <FaShieldAlt className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>Google &amp; Facebook OAuth Centralization</span>
                            <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full uppercase">Unified Firebase Broker</span>
                        </h4>
                        <p className="text-xs text-indigo-200/90 leading-relaxed">
                            Google and Facebook Single Sign-On run through <strong>Firebase Auth SDK</strong>. Configure your OAuth Client Keys in <strong>Firebase Console → Authentication → Sign-in method</strong>, and toggle end-user visibility ON/OFF under <strong>Addon Modules</strong>.
                        </p>
                    </div>
                </div>
            </div>

            {/* Google Identity Services (GIS) Settings */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaGoogle className="text-red-500 text-xl" /> Google Identity Services (GIS) &amp; OAuth 2.0
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure your Google Web Client ID and Client Secret for direct Google Sign-In &amp; Scenario 3 fallback.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Google Web Client ID
                        </label>
                        <input
                            type="text"
                            name="googleClientId"
                            value={socialAuthConfig.googleClientId}
                            onChange={handleChange}
                            placeholder="e.g. 1234567890-abc123def456.apps.googleusercontent.com"
                            className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Google Client Secret (Optional)
                        </label>
                        <div className="relative">
                            <input
                                type={showGoogleSecret ? "text" : "password"}
                                name="googleClientSecret"
                                value={socialAuthConfig.googleClientSecret}
                                onChange={handleChange}
                                disabled={!isSuperAdmin}
                                placeholder="GOCSPX-..."
                                className="w-full p-2.5 pr-10 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                            >
                                {showGoogleSecret ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Facebook App & Pixel Settings */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaFacebook className="text-blue-600 text-xl" /> Facebook OAuth &amp; Pixel Integration
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Enter your Facebook App ID, App Secret, and Pixel ID for Facebook Ad Tracking &amp; SSO sync.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Facebook App ID
                        </label>
                        <input
                            type="text"
                            name="facebookAppId"
                            value={socialAuthConfig.facebookAppId}
                            onChange={handleChange}
                            placeholder="e.g. 1029384756102938"
                            className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Facebook App Secret
                        </label>
                        <div className="relative">
                            <input
                                type={showFbSecret ? "text" : "password"}
                                name="facebookAppSecret"
                                value={socialAuthConfig.facebookAppSecret}
                                onChange={handleChange}
                                disabled={!isSuperAdmin}
                                placeholder="App Secret..."
                                className="w-full p-2.5 pr-10 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => setShowFbSecret(!showFbSecret)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                            >
                                {showFbSecret ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Facebook Pixel ID (Ad Conversion Tracking)
                    </label>
                    <input
                        type="text"
                        name="facebookPixelId"
                        value={socialAuthConfig.facebookPixelId}
                        onChange={handleChange}
                        placeholder="e.g. 987654321012345"
                        className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono"
                    />
                </div>
            </div>

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
                                disabled={!isSuperAdmin}
                                placeholder="Secret..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowLinkedinSecret(!showLinkedinSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showLinkedinSecret ? "Hide Secret" : "Show Secret"}
                            >
                                {showLinkedinSecret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
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
                {/* Live credential test badge */}
                <div className="my-2 p-3 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-3 text-xs">
                    <span className="text-slate-600">Live backend check:</span>
                    <button
                        type="button"
                        className="px-3 py-1 bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 rounded-md font-medium transition-colors"
                        onClick={() => handleCredentialTest('linkedin')}
                    >
                        Test LinkedIn Config
                    </button>
                    <span className="text-slate-400 text-[10px]">Checks the active backend-only credential source</span>
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
                                disabled={!isSuperAdmin}
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

                {/* GitHub Redirect URL Copy Box */}
                <div className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                        <span>📌 Authorized Callback URL for GitHub OAuth App:</span>
                    </p>
                    <code className="block p-2 bg-white border border-slate-200 rounded font-mono text-[11px] select-all text-slate-800 break-all">
                        {`https://${window.location.host}/api/auth/github/callback`}
                    </code>
                    <p className="text-[11px] text-slate-600">
                        Copy this URL to <strong>GitHub Developer Settings → OAuth Apps → Authorization callback URL</strong>.
                    </p>
                </div>

                {/* Live credential test badge */}
                <div className="my-2 p-3 bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-3 text-xs">
                    <span className="text-slate-600">Live backend check:</span>
                    <button
                        type="button"
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white border border-slate-700 rounded-md font-medium transition-colors"
                        onClick={() => handleCredentialTest('github')}
                    >
                        Test GitHub Config
                    </button>
                    <span className="text-slate-400 text-[10px]">Checks the active backend-only credential source</span>
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

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-bold">Write-only secret controls</p>
                <p className="mt-1">Blank fields preserve the active server credential. Select a field only when you intentionally want to delete the stored secret, then save. Deployment-managed environment secrets cannot be cleared here.</p>
                <fieldset disabled={!isSuperAdmin} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><legend className="sr-only">OAuth secret deletion controls</legend><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.googleClientSecret === true} onChange={event => setClearSecrets(prev => ({ ...prev, googleClientSecret: event.target.checked }))} /> Clear Google client secret</label><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.facebookAppSecret === true} onChange={event => setClearSecrets(prev => ({ ...prev, facebookAppSecret: event.target.checked }))} /> Clear Facebook app secret</label><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.linkedinClientSecret === true} onChange={event => setClearSecrets(prev => ({ ...prev, linkedinClientSecret: event.target.checked }))} /> Clear LinkedIn client secret</label><label className="flex items-center gap-2"><input type="checkbox" checked={clearSecrets.githubClientSecret === true} onChange={event => setClearSecrets(prev => ({ ...prev, githubClientSecret: event.target.checked }))} /> Clear GitHub client secret</label></fieldset>
                {!isSuperAdmin && <p className="mt-2 text-[11px] font-semibold text-amber-800">Only Super Admin can replace or clear OAuth client secrets. Client IDs and provider visibility remain available for review.</p>}
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
