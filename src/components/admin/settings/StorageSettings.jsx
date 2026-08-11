import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaCloud, FaCheck, FaTimes, FaSpinner, FaHdd, FaAws, FaEye, FaEyeSlash } from 'react-icons/fa';

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
    const [showCloudinarySecret, setShowCloudinarySecret] = useState(false);
    const [showS3Secret, setShowS3Secret] = useState(false);
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
            await saveSystemSettings('storage', storageConfig);
            setStatusMessage({ type: 'success', text: 'Cloud storage engine settings saved successfully!' });
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
                <p className="text-xs text-slate-500 mb-4">
                    Select where uploaded avatars, logos, and user attachments will be permanently stored.
                </p>

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
                        <option value="firebase">Firebase Storage (Default)</option>
                        <option value="cloudinary">Cloudinary CDN Engine</option>
                        <option value="s3">Amazon Web Services (AWS S3)</option>
                    </select>
                </div>

                {storageConfig.provider === 'cloudinary' && (
                    <div className="p-4 bg-white rounded border border-slate-200 space-y-4">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cloudinary Settings</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Cloud Name</label>
                                <input
                                    type="text"
                                    name="cloudinaryCloudName"
                                    value={storageConfig.cloudinaryCloudName}
                                    onChange={handleChange}
                                    placeholder="demo_cloud"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">API Key</label>
                                <input
                                    type="text"
                                    name="cloudinaryApiKey"
                                    value={storageConfig.cloudinaryApiKey}
                                    onChange={handleChange}
                                    placeholder="123456789012345"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">API Secret</label>
                                <div className="relative">
                                    <input
                                        type={showCloudinarySecret ? "text" : "password"}
                                        name="cloudinaryApiSecret"
                                        value={storageConfig.cloudinaryApiSecret}
                                        onChange={handleChange}
                                        placeholder="secret_key"
                                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCloudinarySecret(!showCloudinarySecret)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                        title={showCloudinarySecret ? "Hide Secret" : "Show Secret"}
                                    >
                                        {showCloudinarySecret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Preset</label>
                                <input
                                    type="text"
                                    name="cloudinaryUploadPreset"
                                    value={storageConfig.cloudinaryUploadPreset}
                                    onChange={handleChange}
                                    placeholder="unsigned_preset"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {storageConfig.provider === 's3' && (
                    <div className="p-4 bg-white rounded border border-slate-200 space-y-4">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                            <FaAws className="text-amber-500 text-lg" /> AWS S3 Bucket Settings
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">AWS Access Key ID</label>
                                <input
                                    type="text"
                                    name="s3AccessKeyId"
                                    value={storageConfig.s3AccessKeyId}
                                    onChange={handleChange}
                                    placeholder="AKIA..."
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">AWS Secret Access Key</label>
                                <div className="relative">
                                    <input
                                        type={showS3Secret ? "text" : "password"}
                                        name="s3SecretAccessKey"
                                        value={storageConfig.s3SecretAccessKey}
                                        onChange={handleChange}
                                        placeholder="Secret Key"
                                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowS3Secret(!showS3Secret)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                        title={showS3Secret ? "Hide Secret" : "Show Secret"}
                                    >
                                        {showS3Secret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">S3 Bucket Name</label>
                                <input
                                    type="text"
                                    name="s3BucketName"
                                    value={storageConfig.s3BucketName}
                                    onChange={handleChange}
                                    placeholder="my-resume-bucket"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">AWS Region</label>
                                <input
                                    type="text"
                                    name="s3Region"
                                    value={storageConfig.s3Region}
                                    onChange={handleChange}
                                    placeholder="us-east-1"
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                                />
                            </div>
                        </div>
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
