import React, { useState, useEffect } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaStamp, FaCheck, FaTimes, FaSpinner, FaEye } from 'react-icons/fa';

const WatermarkSettings = () => {
    const [watermarkConfig, setWatermarkConfig] = useState({
        allowFreePdfDownload: false,
        allowFreeDocxDownload: false,
        allowFreeShareLink: false,
        enableFreeWatermark: true,
        watermarkText: 'Created with IME365 (Free Plan)',
        opacity: 0.15,
        position: 'bottom-center', // diagonal, bottom-center, header
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getAdminSystemSettings().then((settings) => {
            if (settings && settings.watermark) {
                setWatermarkConfig((prev) => ({ ...prev, ...settings.watermark }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setWatermarkConfig((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('watermark', watermarkConfig);
            setStatusMessage({ type: 'success', text: 'Free tier export & watermarking rules saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading watermark settings...</span>
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

            {/* Granular Free Tier Allowances */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaStamp className="text-indigo-600" /> Free Tier Export & Share Allowances
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Control whether non-paying (Free) candidates can download or share their resumes. When disabled, candidates must purchase the Pro Career Pass.
                </p>

                <div className="space-y-3">
                    {/* Toggle 1: PDF */}
                    <div className="flex items-center justify-between p-3 bg-white rounded border border-slate-200">
                        <div>
                            <label htmlFor="allowFreePdfDownload" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                Allow Free Candidates to Download PDF
                            </label>
                            <p className="text-xs text-slate-500">
                                If enabled, free users download PDF with the watermark below. If disabled, clicking Download PDF opens PRO CAREER PASS.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            id="allowFreePdfDownload"
                            name="allowFreePdfDownload"
                            checked={Boolean(watermarkConfig.allowFreePdfDownload)}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5 cursor-pointer"
                        />
                    </div>

                    {/* Toggle 2: DOCX */}
                    <div className="flex items-center justify-between p-3 bg-white rounded border border-slate-200">
                        <div>
                            <label htmlFor="allowFreeDocxDownload" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                Allow Free Candidates to Download Word (DOCX)
                            </label>
                            <p className="text-xs text-slate-500">
                                If enabled, free users download DOCX with an editorial branding notice. If disabled, clicking Download Word opens PRO CAREER PASS.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            id="allowFreeDocxDownload"
                            name="allowFreeDocxDownload"
                            checked={Boolean(watermarkConfig.allowFreeDocxDownload)}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5 cursor-pointer"
                        />
                    </div>

                    {/* Toggle 3: Share Link */}
                    <div className="flex items-center justify-between p-3 bg-white rounded border border-slate-200">
                        <div>
                            <label htmlFor="allowFreeShareLink" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                Allow Free Candidates to Share Public Review Link
                            </label>
                            <p className="text-xs text-slate-500">
                                If enabled, free users can generate public web links displaying brand banner. If disabled, clicking Share Resume opens PRO CAREER PASS.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            id="allowFreeShareLink"
                            name="allowFreeShareLink"
                            checked={Boolean(watermarkConfig.allowFreeShareLink)}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5 cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Watermark Styling & Configuration */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaStamp className="text-indigo-600" /> Free Tier Watermark & Branding Rules
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Customize branding watermarks applied to free exports when downloads/shares are permitted.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-3 bg-white rounded border border-slate-200">
                        <input
                            type="checkbox"
                            id="enableFreeWatermark"
                            name="enableFreeWatermark"
                            checked={watermarkConfig.enableFreeWatermark !== false}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5 cursor-pointer"
                        />
                        <div>
                            <label htmlFor="enableFreeWatermark" className="text-sm font-semibold text-slate-800 cursor-pointer">
                                Apply Watermark to Free Tier Exports
                            </label>
                            <p className="text-xs text-slate-500">
                                Paid/Premium subscribers will always download clean, 100% watermark-free resumes.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Watermark Display Text
                        </label>
                        <input
                            type="text"
                            name="watermarkText"
                            value={watermarkConfig.watermarkText}
                            onChange={handleChange}
                            placeholder="Created with IME365 (Free Plan)"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Watermark Placement Position
                            </label>
                            <select
                                name="position"
                                value={watermarkConfig.position}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            >
                                <option value="diagonal">Diagonal Across Page</option>
                                <option value="bottom-center">Footer Center</option>
                                <option value="header">Header Banner</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Text Opacity ({watermarkConfig.opacity})
                            </label>
                            <input
                                type="range"
                                name="opacity"
                                min="0.05"
                                max="0.5"
                                step="0.05"
                                value={watermarkConfig.opacity}
                                onChange={handleChange}
                                className="w-full accent-indigo-600 cursor-pointer"
                            />
                        </div>
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
                    <span>Save Watermark Rules</span>
                </button>
            </div>
        </form>
    );
};

export default WatermarkSettings;
