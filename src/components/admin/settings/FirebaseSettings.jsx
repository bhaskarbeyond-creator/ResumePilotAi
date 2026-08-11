import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaFire, FaCheck, FaTimes, FaSpinner, FaKey, FaDatabase, FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';

const FirebaseSettings = () => {
    const [firebaseConfig, setFirebaseConfig] = useState({
        apiKey: '',
        authDomain: '',
        databaseURL: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        enableGoogleAuth: true,
        enableFacebookAuth: true,
    });
    const [showApiKey, setShowApiKey] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

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

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFirebaseConfig((prev) => {
            const next = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };
            if (type !== 'checkbox' && (name === 'apiKey' || name === 'appId') && value.trim() !== '') {
                next.enableGoogleAuth = true;
                next.enableFacebookAuth = true;
            }
            return next;
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('firebase', firebaseConfig);
            setStatusMessage({ type: 'success', text: 'Firebase configuration settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading Firebase settings...</span>
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
                    <FaFire className="text-amber-500 text-xl" /> Firebase Project Credentials
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    View and update your Firebase Web App credentials (Firestore, Auth & Realtime DB).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Firebase Web API Key
                        </label>
                        <div className="relative">
                            <input
                                type={showApiKey ? "text" : "password"}
                                name="apiKey"
                                value={firebaseConfig.apiKey}
                                onChange={handleChange}
                                placeholder="AIzaSy..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showApiKey ? "Hide API Key" : "Show API Key"}
                            >
                                {showApiKey ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Auth Domain
                        </label>
                        <input
                            type="text"
                            name="authDomain"
                            value={firebaseConfig.authDomain}
                            onChange={handleChange}
                            placeholder="my-project.firebaseapp.com"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Project ID
                        </label>
                        <input
                            type="text"
                            name="projectId"
                            value={firebaseConfig.projectId}
                            onChange={handleChange}
                            placeholder="my-project-id"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Database URL (Realtime DB)
                        </label>
                        <input
                            type="text"
                            name="databaseURL"
                            value={firebaseConfig.databaseURL}
                            onChange={handleChange}
                            placeholder="https://my-project-default-rtdb.firebaseio.com"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Storage Bucket
                        </label>
                        <input
                            type="text"
                            name="storageBucket"
                            value={firebaseConfig.storageBucket}
                            onChange={handleChange}
                            placeholder="my-project.appspot.com"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Messaging Sender ID
                        </label>
                        <input
                            type="text"
                            name="messagingSenderId"
                            value={firebaseConfig.messagingSenderId}
                            onChange={handleChange}
                            placeholder="123456789012"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            App ID
                        </label>
                        <input
                            type="text"
                            name="appId"
                            value={firebaseConfig.appId}
                            onChange={handleChange}
                            placeholder="1:123456789012:web:abcdef"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="enableGoogleAuth"
                            name="enableGoogleAuth"
                            checked={firebaseConfig.enableGoogleAuth}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                        />
                        <label htmlFor="enableGoogleAuth" className="text-sm font-medium text-slate-700">
                            Enable Google One-Tap & Sign-In Modal
                        </label>
                    </div>

                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="enableFacebookAuth"
                            name="enableFacebookAuth"
                            checked={firebaseConfig.enableFacebookAuth}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                        />
                        <label htmlFor="enableFacebookAuth" className="text-sm font-medium text-slate-700">
                            Enable Firebase Facebook Authentication
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
                    <span>Save Firebase Credentials</span>
                </button>
            </div>
        </form>
    );
};

export default FirebaseSettings;
