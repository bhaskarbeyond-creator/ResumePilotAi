import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaFilePdf, FaCheck, FaTimes, FaSpinner } from 'react-icons/fa';

const ExportPdfSettings = () => {
    const [exportConfig, setExportConfig] = useState({
        websiteDomain: 'ai-resume-builder.local',
        backendExportUrl: '',
        renderTimeout: 60000,
        paperFormat: 'A4',
        chromiumPath: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.exportPdf) {
                setExportConfig({ ...exportConfig, ...settings.exportPdf });
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setExportConfig((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('exportPdf', exportConfig);
            setStatusMessage({ type: 'success', text: 'PDF Exporter settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading PDF exporter settings...</span>
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
                    <FaFilePdf className="text-red-600" /> Puppeteer PDF Exporter Options
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure backend rendering behavior when users generate and download PDF resumes.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Application Website Domain
                        </label>
                        <input
                            type="text"
                            name="websiteDomain"
                            value={exportConfig.websiteDomain}
                            onChange={handleChange}
                            placeholder="ai-resume-builder.local / mydomain.com"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Backend Export Service URL
                        </label>
                        <input
                            type="text"
                            name="backendExportUrl"
                            value={exportConfig.backendExportUrl}
                            onChange={handleChange}
                            placeholder="Same-origin /api"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Page Render Timeout (ms)
                        </label>
                        <input
                            type="number"
                            name="renderTimeout"
                            value={exportConfig.renderTimeout}
                            onChange={handleChange}
                            placeholder="60000"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Default Paper Format
                        </label>
                        <select
                            name="paperFormat"
                            value={exportConfig.paperFormat}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="A4">A4 (Standard International)</option>
                            <option value="Letter">Letter (US Standard)</option>
                            <option value="Legal">Legal</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Chromium Executable Path (Optional)
                        </label>
                        <input
                            type="text"
                            name="chromiumPath"
                            value={exportConfig.chromiumPath}
                            onChange={handleChange}
                            placeholder="/snap/bin/chromium"
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
                    <span>Save Exporter Settings</span>
                </button>
            </div>
        </form>
    );
};

export default ExportPdfSettings;
