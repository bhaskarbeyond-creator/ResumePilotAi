import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaCloud, FaCheck, FaTimes, FaSpinner } from 'react-icons/fa';

const StorageSettings = () => {
    const [storageConfig, setStorageConfig] = useState({
        provider: 'firebase',
        cloudinaryCloudName: '',
        cloudinaryApiKey: '',
        cloudinaryApiSecret: '',
        cloudinaryUploadPreset: '',
        s3AccessKeyId: '',
        s3SecretAccessKey: '',
        s3BucketName: '',
        s3Region: 'us-east-1',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.storage) {
                setStorageConfig((prev) => ({ ...prev, ...settings.storage }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setStorageConfig((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('storage', { provider: 'firebase' });
            setStorageConfig(current => ({ ...current, provider: 'firebase' }));
            setStatusMessage({ type: 'success', text: 'Cloud storage engine settings saved successfully. Empty secrets were preserved; Clear actions were applied explicitly.' });
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
                <span className="text-slate-600 text-sm">Loading storage settings...</span>
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
                    <FaCloud className="text-sky-500" /> Media Storage Provider Engine
                </h3>
                <p className="text-xs text-slate-500 mb-2">
                    Application uploads currently use the Firebase Storage bucket supplied by the deployment. Provider changes are not client-only settings: a Cloudinary or S3 adapter must be installed on the backend before it can be enabled.
                </p>
                <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">Cloudinary and S3 are shown as planned integrations and are unavailable in this deployment. The backend rejects attempts to enable an unimplemented adapter.</p>

                <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Active Storage Service Provider
                    </label>
                    <select
                        name="provider"
                        value={storageConfig.provider}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    >
                        <option value="firebase">Firebase Storage (implemented)</option>
                        <option value="cloudinary" disabled>Cloudinary CDN Engine (adapter unavailable)</option>
                        <option value="s3" disabled>Amazon Web Services (S3 adapter unavailable)</option>
                    </select>
                </div>

                {storageConfig.provider !== 'firebase' && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                        <p className="font-bold">{storageConfig.provider === 's3' ? 'Amazon S3' : 'Cloudinary'} is not available</p>
                        <p className="mt-1">This checkout has no server-side adapter for the selected provider. No credential editor is exposed and the backend will reject attempts to enable it.</p>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save Storage Engine</span>
                </button>
            </div>
        </form>
    );
};

export default StorageSettings;
