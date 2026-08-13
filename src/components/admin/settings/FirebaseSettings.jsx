import React, { useState, useEffect, useRef } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import {
    FaFire, FaCheck, FaTimes, FaSpinner, FaKey, FaLock,
    FaEye, FaEyeSlash, FaShieldAlt, FaServer, FaCloudUploadAlt,
    FaExclamationTriangle, FaCheckCircle, FaTimesCircle, FaInfoCircle,
    FaPaste, FaChevronDown, FaChevronUp
} from 'react-icons/fa';

// ─── Service Account Status Badge ─────────────────────────────────────────────
const SaBadge = ({ status }) => {
    const cfg = {
        loading:      { bg: 'bg-slate-100', text: 'text-slate-500', icon: <FaSpinner className="animate-spin" />, label: 'Checking...' },
        ready:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <FaCheckCircle />, label: 'Admin SDK Ready' },
        configured:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: <FaInfoCircle />,  label: 'Configured (SDK init pending)' },
        unconfigured: { bg: 'bg-red-50',     text: 'text-red-700',     icon: <FaTimesCircle />, label: 'Not Configured' },
        error:        { bg: 'bg-red-50',     text: 'text-red-700',     icon: <FaExclamationTriangle />, label: 'Connection Error' },
    };
    const c = cfg[status] || cfg.unconfigured;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
            {c.icon} {c.label}
        </span>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const FirebaseSettings = () => {
    // ── Web config state
    const [firebaseConfig, setFirebaseConfig] = useState({
        apiKey: '', authDomain: '', databaseURL: '', projectId: '',
        storageBucket: '', messagingSenderId: '', appId: '',
        enableGoogleAuth: true, enableFacebookAuth: true,
    });
    const [showApiKey, setShowApiKey] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [webStatusMsg, setWebStatusMsg] = useState(null);

    // ── Service Account state
    const [saStatus, setSaStatus] = useState('loading');
    const [saInfo, setSaInfo] = useState({ projectId: '', clientEmail: '', privateKeySet: false });
    const [saFields, setSaFields] = useState({ projectId: '', clientEmail: '', privateKey: '' });
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [saJsonPaste, setSaJsonPaste] = useState('');
    const [showJsonPaste, setShowJsonPaste] = useState(false);
    const [saJsonError, setSaJsonError] = useState('');
    const [savingSa, setSavingSa] = useState(false);
    const [saStatusMsg, setSaStatusMsg] = useState(null);
    const [showSaSection, setShowSaSection] = useState(false);

    // ── Load web config
    useEffect(() => {
        getSystemSettings().then((settings) => {
            const fb = (settings && settings.firebase) || {};
            const hasApiKey = !!(fb.apiKey || import.meta.env.VITE_FIREBASE_KEY);
            setFirebaseConfig({
                apiKey: fb.apiKey || import.meta.env.VITE_FIREBASE_KEY || '',
                authDomain: fb.authDomain || import.meta.env.VITE_FIREBASE_DOMAIN || '',
                databaseURL: fb.databaseURL || import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
                projectId: fb.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
                storageBucket: fb.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
                messagingSenderId: fb.messagingSenderId || import.meta.env.VITE_FIREBASE_SENDER_ID || '',
                appId: fb.appId || import.meta.env.VITE_FIREBASE_APP_ID || '',
                enableGoogleAuth: fb.enableGoogleAuth !== undefined ? fb.enableGoogleAuth : hasApiKey,
                enableFacebookAuth: fb.enableFacebookAuth !== undefined ? fb.enableFacebookAuth : hasApiKey,
            });
            setLoading(false);
        });
    }, []);

    // ── Load SA status from backend
    useEffect(() => { fetchSaStatus(); }, []);

    const fetchSaStatus = async () => {
        setSaStatus('loading');
        try {
            const res = await fetch('/api/admin/firebase-service-account');
            const data = await res.json();
            if (data.success) {
                setSaInfo({ projectId: data.projectId || '', clientEmail: data.clientEmail || '', privateKeySet: data.privateKeySet || false });
                if (data.adminSdkReady) setSaStatus('ready');
                else if (data.configured) setSaStatus('configured');
                else setSaStatus('unconfigured');
            } else {
                setSaStatus('error');
            }
        } catch {
            setSaStatus('error');
        }
    };

    // ── Web config handlers
    const handleWebChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFirebaseConfig((prev) => {
            const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
            if (type !== 'checkbox' && (name === 'apiKey' || name === 'appId') && value.trim() !== '') {
                next.enableGoogleAuth = true;
                next.enableFacebookAuth = true;
            }
            return next;
        });
    };

    const handleWebSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('firebase', firebaseConfig);
            setWebStatusMsg({ type: 'success', text: 'Firebase Web credentials saved successfully!' });
        } catch (error) {
            setWebStatusMsg({ type: 'error', text: `Failed to save: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setWebStatusMsg(null), 4000);
        }
    };

    // ── SA: Parse pasted JSON
    const handleJsonParse = () => {
        setSaJsonError('');
        try {
            const parsed = JSON.parse(saJsonPaste.trim());
            if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
                setSaJsonError('JSON is missing required fields: project_id, client_email, private_key.');
                return;
            }
            setSaFields({ projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key });
            setSaJsonPaste('');
            setShowJsonPaste(false);
        } catch {
            setSaJsonError('Invalid JSON. Paste the entire contents of serviceAccountKey.json.');
        }
    };

    // ── SA: Save handler
    const handleSaSave = async (e) => {
        e.preventDefault();
        const { projectId, clientEmail, privateKey } = saFields;
        if (!projectId.trim() || !clientEmail.trim() || !privateKey.trim()) {
            setSaStatusMsg({ type: 'error', text: 'All three fields are required.' });
            return;
        }
        setSavingSa(true);
        setSaStatusMsg(null);
        try {
            const res = await fetch('/api/admin/firebase-service-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: projectId.trim(), clientEmail: clientEmail.trim(), privateKey: privateKey.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setSaStatusMsg({ type: 'success', text: `Admin SDK active for project: ${data.projectId}` });
                setSaFields({ projectId: '', clientEmail: '', privateKey: '' });
                await fetchSaStatus();
                setShowSaSection(false);
            } else {
                setSaStatusMsg({ type: 'error', text: data.error || 'Validation failed. Check your credentials.' });
            }
        } catch (err) {
            setSaStatusMsg({ type: 'error', text: `Network error: ${err.message}` });
        } finally {
            setSavingSa(false);
            setTimeout(() => setSaStatusMsg(null), 6000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading Firebase settings...</span>
            </div>
        );
    }

    const inputCls = "w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white";
    const labelCls = "block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1";

    return (
        <div className="space-y-6">

            {/* ── Section 1: Web App Credentials ── */}
            <form onSubmit={handleWebSave} className="space-y-4">
                {webStatusMsg && (
                    <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${webStatusMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                        {webStatusMsg.type === 'success' ? <FaCheck /> : <FaTimes />}
                        <span>{webStatusMsg.text}</span>
                    </div>
                )}

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                        <FaFire className="text-amber-500 text-xl" /> Firebase Web App Credentials
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">Client-side credentials used by the browser (Firestore, Auth, Realtime DB).</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className={labelCls}>Firebase Web API Key</label>
                            <div className="relative">
                                <input type={showApiKey ? "text" : "password"} name="apiKey"
                                    value={firebaseConfig.apiKey} onChange={handleWebChange}
                                    placeholder="AIzaSy..." className={`${inputCls} pr-10`} />
                                <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                                    {showApiKey ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Auth Domain</label>
                            <input type="text" name="authDomain" value={firebaseConfig.authDomain}
                                onChange={handleWebChange} placeholder="my-project.firebaseapp.com" className={inputCls} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className={labelCls}>Project ID</label>
                            <input type="text" name="projectId" value={firebaseConfig.projectId}
                                onChange={handleWebChange} placeholder="my-project-id" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Database URL (Realtime DB)</label>
                            <input type="text" name="databaseURL" value={firebaseConfig.databaseURL}
                                onChange={handleWebChange} placeholder="https://my-project-default-rtdb.firebaseio.com" className={inputCls} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className={labelCls}>Storage Bucket</label>
                            <input type="text" name="storageBucket" value={firebaseConfig.storageBucket}
                                onChange={handleWebChange} placeholder="my-project.appspot.com" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Messaging Sender ID</label>
                            <input type="text" name="messagingSenderId" value={firebaseConfig.messagingSenderId}
                                onChange={handleWebChange} placeholder="123456789012" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>App ID</label>
                            <input type="text" name="appId" value={firebaseConfig.appId}
                                onChange={handleWebChange} placeholder="1:123456789012:web:abcdef" className={inputCls} />
                        </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200">
                        <div className="bg-slate-100 p-3 rounded-lg flex items-center justify-between text-xs text-slate-600">
                            <div className="flex items-center space-x-2">
                                <FaLock className="text-amber-600 shrink-0" />
                                <span>Google &amp; Facebook Sign-In toggles are managed under <strong>Addon Modules Manager</strong>.</span>
                            </div>
                            <a href="/admin/settings?tab=modules" className="text-amber-700 hover:text-amber-900 font-bold underline shrink-0 ml-2">
                                Manage Modules &rarr;
                            </a>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end">
                    <button type="submit" disabled={saving}
                        className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm disabled:opacity-60">
                        {saving && <FaSpinner className="animate-spin" />}
                        <span>Save Web Credentials</span>
                    </button>
                </div>
            </form>

            {/* ── Section 2: Service Account (Admin SDK) ── */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Header / toggle row */}
                <button type="button" onClick={() => setShowSaSection(!showSaSection)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-white hover:bg-slate-50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                        <FaShieldAlt className="text-indigo-600 text-lg shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Firebase Service Account (Admin SDK)</p>
                            <p className="text-xs text-slate-500 mt-0.5">Required for server-side auth: password resets, user management, email change</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                        <SaBadge status={saStatus} />
                        {showSaSection ? <FaChevronUp className="text-slate-400 text-sm" /> : <FaChevronDown className="text-slate-400 text-sm" />}
                    </div>
                </button>

                {/* Current config summary (visible when not loading/unconfigured) */}
                {(saStatus === 'ready' || saStatus === 'configured') && (
                    <div className="px-4 pb-3 pt-1 bg-white border-t border-slate-100">
                        <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                            {saInfo.projectId && (
                                <span className="flex items-center gap-1.5">
                                    <FaServer className="text-slate-400" />
                                    Project: <strong className="text-slate-800">{saInfo.projectId}</strong>
                                </span>
                            )}
                            {saInfo.clientEmail && (
                                <span className="flex items-center gap-1.5">
                                    <FaKey className="text-slate-400" />
                                    SA: <strong className="text-slate-800 font-mono">{saInfo.clientEmail}</strong>
                                </span>
                            )}
                            {saInfo.privateKeySet && (
                                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                                    <FaLock /> Private Key Set
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Expandable configuration form */}
                {showSaSection && (
                    <form onSubmit={handleSaSave} className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">

                        {saStatusMsg && (
                            <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${saStatusMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                                {saStatusMsg.type === 'success' ? <FaCheckCircle /> : <FaTimesCircle />}
                                <span>{saStatusMsg.text}</span>
                            </div>
                        )}

                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-indigo-800">
                            <FaInfoCircle className="text-indigo-500 mt-0.5 shrink-0" />
                            <div>
                                <strong>How to get this:</strong> Firebase Console &rarr; Project Settings &rarr; Service Accounts &rarr; Generate new private key.<br />
                                Credentials are stored in your server <code className="bg-indigo-100 px-1 rounded">.env</code> and hot-reloaded without a restart.
                            </div>
                        </div>

                        {/* JSON paste shortcut */}
                        <div>
                            <button type="button"
                                onClick={() => { setShowJsonPaste(v => !v); setSaJsonError(''); }}
                                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline">
                                <FaPaste /> {showJsonPaste ? 'Hide JSON paste' : 'Paste entire serviceAccountKey.json'} (fastest)
                            </button>

                            {showJsonPaste && (
                                <div className="mt-2 space-y-2">
                                    <textarea rows={6} value={saJsonPaste}
                                        onChange={e => { setSaJsonPaste(e.target.value); setSaJsonError(''); }}
                                        placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...",\n  "client_email": "..."\n}'}
                                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white resize-y"
                                    />
                                    {saJsonError && (
                                        <p className="text-xs text-red-600 flex items-center gap-1"><FaTimesCircle /> {saJsonError}</p>
                                    )}
                                    <button type="button" onClick={handleJsonParse}
                                        className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md flex items-center gap-1.5">
                                        <FaCloudUploadAlt /> Parse JSON and fill fields
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Manual fields */}
                        <div className="border-t border-slate-200 pt-3 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Project ID <span className="text-red-500">*</span></label>
                                    <input type="text" value={saFields.projectId}
                                        onChange={e => setSaFields(p => ({ ...p, projectId: e.target.value }))}
                                        placeholder="my-project-424cf" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Service Account Email <span className="text-red-500">*</span></label>
                                    <input type="text" value={saFields.clientEmail}
                                        onChange={e => setSaFields(p => ({ ...p, clientEmail: e.target.value }))}
                                        placeholder="firebase-adminsdk-xxx@my-project.iam.gserviceaccount.com"
                                        className={inputCls} />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Private Key (PEM) <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <textarea rows={showPrivateKey ? 6 : 2} value={saFields.privateKey}
                                        onChange={e => setSaFields(p => ({ ...p, privateKey: e.target.value }))}
                                        placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEv..."
                                        className={`${inputCls} font-mono text-xs resize-none pr-10`}
                                    />
                                    <button type="button" onClick={() => setShowPrivateKey(v => !v)}
                                        className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 p-1">
                                        {showPrivateKey ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">Paste as-is. Escaped <code>\n</code> sequences are normalised automatically.</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <button type="button" onClick={() => setShowSaSection(false)}
                                className="text-xs text-slate-500 hover:text-slate-700 underline">Cancel</button>
                            <button type="submit" disabled={savingSa}
                                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md flex items-center gap-2 shadow-sm disabled:opacity-60 transition-colors">
                                {savingSa ? <FaSpinner className="animate-spin" /> : <FaShieldAlt />}
                                <span>{savingSa ? 'Validating & Saving...' : 'Test & Save Credentials'}</span>
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FirebaseSettings;