import React, { useState, useEffect } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaCheck, FaTimes, FaSpinner, FaFileAlt, FaCheckCircle, FaRocket } from 'react-icons/fa';

const getActiveDomainUrl = () => import.meta.env.VITE_WEBSITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://ime365.com');


const buildFactualLlmsDocument = (domain) => `# IME365
> Browser-based resume and career-document application.

Website: ${domain}

## Product scope
- Guided resume and cover-letter editing
- Registered resume and cover-letter layouts
- Resume preview and supported export workflows
- Optional AI-assisted writing and job tools when enabled by an operator
- Firebase Authentication for identity and MariaDB for application data

## Accuracy note
Features, payment providers, pricing, and regional availability depend on current runtime configuration. Consult the website for current details. This document does not assert rankings, ratings, employment outcomes, or crawler endorsement.`;

const buildFactualFullDocument = (domain) => `# IME365 — detailed product information

Website: ${domain}

## Service overview
IME365 is a browser-based resume and career-document application. People can use the product to create and edit resumes and cover letters, preview documents, and use supported export workflows.

## Product areas
- Resume editing and registered resume layouts.
- Cover-letter editing and registered cover-letter layouts.
- Portfolio and job-search tools where those modules are available.
- Optional AI-assisted writing and job tools only when enabled in the current runtime configuration.

## Identity and application data
Firebase Authentication is used for identity. MariaDB is the authoritative store for application data. Availability and access depend on the current service configuration.

## Current information
Consult the website and its live settings for current feature availability, plans, billing providers, and regional support. This document is operator-maintained reference material; it does not promise rankings, reviews, user totals, hiring outcomes, or crawler citations.`;

const LlmGeoSettings = () => {
    const activeDomain = getActiveDomainUrl();
    const [llmGeoConfig, setLlmGeoConfig] = useState({
        enableLlmGeo: false,
        llmsTxtContent: buildFactualLlmsDocument(activeDomain),
        llmsFullTxtContent: buildFactualFullDocument(activeDomain),
    });
    const [loading, setLoading] = useState(true);
    const [authoritativeLoaded, setAuthoritativeLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        let active = true;
        getAdminSystemSettings().then((settings) => {
            if (!active) return;
            if (settings && settings.llmGeo) {
                setLlmGeoConfig((prev) => ({ ...prev, ...settings.llmGeo }));
            }
            setAuthoritativeLoaded(true);
            setLoading(false);
        }).catch((error) => {
            if (!active) return;
            setStatusMessage({ type: 'error', text: error.message || 'Authoritative discovery settings are unavailable.' });
            setLoading(false);
        });
        return () => { active = false; };
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setLlmGeoConfig((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const applyFactualPreset = () => {
        setLlmGeoConfig((prev) => ({
            ...prev,
            enableLlmGeo: false,
            llmsTxtContent: buildFactualLlmsDocument(activeDomain),
            llmsFullTxtContent: buildFactualFullDocument(activeDomain),
        }));
        setStatusMessage({ type: 'success', text: 'Loaded the factual default-off discovery preset. Review the document before publishing.' });
        setTimeout(() => setStatusMessage(null), 3000);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!authoritativeLoaded) {
            setStatusMessage({ type: 'error', text: 'Reload authoritative settings before saving.' });
            return;
        }
        setSaving(true);
        try {
            await saveSystemSettings('llmGeo', llmGeoConfig);
            setStatusMessage({ type: 'success', text: 'LLM discovery metadata settings saved.' });
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
                <FaSpinner className="animate-spin text-purple-600 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading discovery settings...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {statusMessage && (
                <div role={statusMessage.type === 'error' ? 'alert' : 'status'} className={`p-4 rounded-xl flex items-center justify-between text-sm shadow-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheckCircle className="text-emerald-600 w-4 h-4" /> : <FaTimes className="text-red-600 w-4 h-4" />}
                        <span className="font-medium">{statusMessage.text}</span>
                    </div>
                </div>
            )}

            {/* Factual discovery-metadata preset */}
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-xl p-5 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-2xl shrink-0">
                        🤖
                    </div>
                    <div>
                        <h3 className="text-base font-bold flex items-center gap-2">
                            LLM discovery metadata (/llms.txt)
                            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-extrabold bg-purple-500/30 border border-purple-300/30 text-purple-200 rounded">Recommended preset</span>
                        </h3>
                        <p className="text-xs text-purple-200/80 mt-0.5">
                            Publishes operator-reviewed product facts. It cannot guarantee crawling, indexing, citations, or ranking.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={applyFactualPreset}
                    disabled={!authoritativeLoaded}
                    className="px-4 py-2 text-xs font-bold text-slate-900 bg-purple-300 hover:bg-purple-200 rounded-lg transition-all shadow-md shrink-0 flex items-center gap-1.5"
                >
                    <FaRocket className="text-purple-900" />
                    <span>Apply Factual Default-Off Preset</span>
                </button>
            </div>

            {/* Core GEO Controls */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                {/* Enable Switch */}
                <div className="flex items-center justify-between p-4 bg-purple-50/50 rounded-xl border border-purple-100">
                    <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            id="enableLlmGeo"
                            name="enableLlmGeo"
                            checked={llmGeoConfig.enableLlmGeo}
                            onChange={handleChange}
                            disabled={!authoritativeLoaded}
                            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-5 w-5 cursor-pointer"
                        />
                        <div>
                            <label htmlFor="enableLlmGeo" className="text-sm font-bold text-slate-900 cursor-pointer">
                                Publish dynamic /llms.txt metadata
                            </label>
                            <p className="text-xs text-slate-500">
                                Exposes operator-reviewed machine-readable product information to clients that choose to request it.
                            </p>
                        </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${llmGeoConfig.enableLlmGeo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {llmGeoConfig.enableLlmGeo ? 'ACTIVE' : 'DISABLED'}
                    </span>
                </div>

                {/* Markdown /llms.txt Editor */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="llmsTxtContent" className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <FaFileAlt className="text-purple-600" /> Published /llms.txt document
                        </label>
                        <span className="text-[11px] text-slate-400 font-mono">Plain-text Markdown</span>
                    </div>
                    <textarea
                        id="llmsTxtContent"
                        name="llmsTxtContent"
                        rows="10"
                        value={llmGeoConfig.llmsTxtContent}
                        onChange={handleChange}
                        disabled={!authoritativeLoaded}
                        placeholder="# IME365..."
                        className="w-full px-4 py-3 text-xs font-mono border border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none bg-slate-950 text-purple-300 leading-relaxed"
                    ></textarea>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {llmGeoConfig.llmsTxtContent.length.toLocaleString()} / 20,000 characters. Publication validates unsupported claims on the server.
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="llmsFullTxtContent" className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <FaFileAlt className="text-indigo-600" /> Optional detailed /llms-full.txt document
                        </label>
                        <span className="text-[11px] text-slate-400 font-mono">Plain-text Markdown</span>
                    </div>
                    <textarea
                        id="llmsFullTxtContent"
                        name="llmsFullTxtContent"
                        rows={14}
                        maxLength={60000}
                        value={llmGeoConfig.llmsFullTxtContent || ''}
                        onChange={handleChange}
                        disabled={!authoritativeLoaded}
                        placeholder="# Detailed, verified product information…"
                        aria-describedby="llmsFullTxtHelp"
                        className="w-full px-4 py-3 text-xs font-mono border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-950 text-indigo-100 leading-relaxed"
                    />
                    <p id="llmsFullTxtHelp" className="mt-1 text-[11px] text-slate-500">
                        {String(llmGeoConfig.llmsFullTxtContent || '').length.toLocaleString()} / 60,000 characters. This optional companion shares the same publication switch and server-side factual-claims checks.
                    </p>
                </div>
            </div>

            {/* Submit Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="flex items-center text-xs text-slate-500">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></div>
                    <span>Crawlers control whether and when they request published metadata.</span>
                </div>
                <button
                    type="submit"
                    disabled={saving || !authoritativeLoaded}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-purple-900 hover:bg-purple-800 rounded-xl flex items-center space-x-2 shadow-md transition-colors"
                >
                    {saving ? <FaSpinner className="animate-spin text-white w-4 h-4" /> : <FaCheck className="w-4 h-4" />}
                    <span>Save Discovery Settings</span>
                </button>
            </div>
        </form>
    );
};

export default LlmGeoSettings;
