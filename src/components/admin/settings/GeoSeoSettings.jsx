import React, { useEffect, useState } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaCheck, FaGlobeAsia, FaSpinner, FaTimes } from 'react-icons/fa';

const DEFAULT_GEO_SEO = Object.freeze({
    enableGeoSeo: false,
    targetRegion: '',
    targetCity: '',
    targetCountry: '',
    metaKeywords: '',
    canonicalUrl: '',
    enableJobPostingSchema: false,
    enableOrganizationSchema: false,
});

const TARGET_CITIES = [
    'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai',
];

function isSafeCanonicalOrigin(value) {
    if (!String(value || '').trim()) return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:'
            && !parsed.username
            && !parsed.password
            && !parsed.search
            && !parsed.hash
            && (!parsed.pathname || parsed.pathname === '/');
    } catch {
        return false;
    }
}

const GeoSeoSettings = () => {
    const [geoSeoConfig, setGeoSeoConfig] = useState({ ...DEFAULT_GEO_SEO });
    const [loading, setLoading] = useState(true);
    const [authoritativeLoaded, setAuthoritativeLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        let active = true;
        getAdminSystemSettings().then((settings) => {
            if (!active) return;
            setGeoSeoConfig({ ...DEFAULT_GEO_SEO, ...(settings?.geoSeo || {}) });
            setAuthoritativeLoaded(true);
        }).catch((error) => {
            if (!active) return;
            setStatusMessage({ type: 'error', text: error.message || 'Authoritative Geo-SEO settings are unavailable.' });
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, []);

    const handleChange = (event) => {
        const { name, value, type, checked } = event.target;
        setGeoSeoConfig(previous => ({
            ...previous,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSave = async (event) => {
        event.preventDefault();
        if (!authoritativeLoaded) {
            setStatusMessage({ type: 'error', text: 'Reload authoritative settings before saving.' });
            return;
        }
        if (!isSafeCanonicalOrigin(geoSeoConfig.canonicalUrl)) {
            setStatusMessage({ type: 'error', text: 'Canonical URL must be an HTTPS origin without credentials, path, query, or fragment.' });
            return;
        }
        setSaving(true);
        try {
            await saveSystemSettings('geoSeo', geoSeoConfig);
            setStatusMessage({ type: 'success', text: 'Geo-discovery settings saved. Regional listings use published MariaDB job data only.' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: error.message || 'Unable to save Geo-SEO settings.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8" role="status" aria-live="polite">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" aria-hidden="true" />
                <span className="text-slate-600 text-sm">Loading authoritative Geo-SEO settings…</span>
            </div>
        );
    }

    const inputsDisabled = !authoritativeLoaded || saving;

    return (
        <form onSubmit={handleSave} className="space-y-6" aria-label="Regional search and structured data settings">
            {statusMessage && (
                <div
                    role={statusMessage.type === 'error' ? 'alert' : 'status'}
                    aria-live={statusMessage.type === 'error' ? 'assertive' : 'polite'}
                    className={`p-4 rounded-lg flex items-center gap-2 text-sm ${statusMessage.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border border-red-200 text-red-800'}`}
                >
                    {statusMessage.type === 'success'
                        ? <FaCheck className="shrink-0" aria-hidden="true" />
                        : <FaTimes className="shrink-0" aria-hidden="true" />}
                    <span>{statusMessage.text}</span>
                </div>
            )}

            <section className="bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 space-y-5" aria-labelledby="geo-seo-heading">
                <div>
                    <h2 id="geo-seo-heading" className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-1">
                        <FaGlobeAsia className="text-indigo-600" aria-hidden="true" /> Regional search discovery
                    </h2>
                    <p className="text-sm text-slate-600">
                        These optional tags and regional job hubs are disabled until an administrator enables them. A hub displays only current, published MariaDB job records; empty regions are never filled with samples or estimated counts.
                    </p>
                </div>

                <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-slate-200">
                    <input
                        type="checkbox"
                        id="enableGeoSeo"
                        name="enableGeoSeo"
                        checked={geoSeoConfig.enableGeoSeo === true}
                        onChange={handleChange}
                        disabled={inputsDisabled}
                        aria-describedby="enableGeoSeo-help"
                        className="mt-0.5 rounded border-slate-400 text-indigo-700 focus:ring-indigo-600 h-5 w-5"
                    />
                    <div>
                        <label htmlFor="enableGeoSeo" className="text-sm font-semibold text-slate-900">
                            Enable regional discovery and location metadata
                        </label>
                        <p id="enableGeoSeo-help" className="text-sm text-slate-600 mt-1">
                            Publishes the regional directory and allows populated, verified job hubs to be indexed. This is not a ranking or traffic guarantee.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="targetRegion" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Target region code
                        </label>
                        <input
                            id="targetRegion"
                            type="text"
                            name="targetRegion"
                            value={geoSeoConfig.targetRegion || ''}
                            onChange={handleChange}
                            maxLength={8}
                            placeholder="IN"
                            disabled={inputsDisabled}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60"
                        />
                    </div>
                    <div>
                        <label htmlFor="targetCity" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Primary location (optional)
                        </label>
                        <select
                            id="targetCity"
                            name="targetCity"
                            value={geoSeoConfig.targetCity || ''}
                            onChange={handleChange}
                            disabled={inputsDisabled}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60"
                        >
                            <option value="">No primary location</option>
                            {geoSeoConfig.targetCity && !TARGET_CITIES.includes(geoSeoConfig.targetCity) && (
                                <option value={geoSeoConfig.targetCity}>{geoSeoConfig.targetCity} (saved setting)</option>
                            )}
                            {TARGET_CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="targetCountry" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Target country (optional)
                        </label>
                        <input
                            id="targetCountry"
                            type="text"
                            name="targetCountry"
                            value={geoSeoConfig.targetCountry || ''}
                            onChange={handleChange}
                            maxLength={120}
                            placeholder="India"
                            disabled={inputsDisabled}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="metaKeywords" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Optional keywords (comma separated)
                    </label>
                    <textarea
                        id="metaKeywords"
                        name="metaKeywords"
                        rows={2}
                        maxLength={500}
                        value={geoSeoConfig.metaKeywords || ''}
                        onChange={handleChange}
                        placeholder="Leave blank unless these terms accurately describe the service."
                        disabled={inputsDisabled}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60"
                    />
                    <p className="text-xs text-slate-500 mt-1">Keywords do not guarantee visibility or rankings.</p>
                </div>

                <div>
                    <label htmlFor="canonicalUrl" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Canonical HTTPS origin (optional)
                    </label>
                    <input
                        id="canonicalUrl"
                        type="url"
                        name="canonicalUrl"
                        value={geoSeoConfig.canonicalUrl || ''}
                        onChange={handleChange}
                        maxLength={300}
                        placeholder="https://example.com"
                        disabled={inputsDisabled}
                        aria-describedby="canonicalUrl-help"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60"
                    />
                    <p id="canonicalUrl-help" className="text-xs text-slate-500 mt-1">Use an origin only, such as https://example.com — no path or query string.</p>
                </div>

                <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold text-slate-900">Structured data</legend>
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="enableJobPostingSchema"
                            name="enableJobPostingSchema"
                            checked={geoSeoConfig.enableJobPostingSchema === true}
                            onChange={handleChange}
                            disabled={inputsDisabled}
                            className="mt-0.5 rounded border-slate-400 text-indigo-700 focus:ring-indigo-600 h-4 w-4"
                        />
                        <label htmlFor="enableJobPostingSchema" className="text-sm text-slate-700">
                            Emit JobPosting data only when a public active listing has the required verified fields.
                        </label>
                    </div>
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="enableOrganizationSchema"
                            name="enableOrganizationSchema"
                            checked={geoSeoConfig.enableOrganizationSchema === true}
                            onChange={handleChange}
                            disabled={inputsDisabled}
                            className="mt-0.5 rounded border-slate-400 text-indigo-700 focus:ring-indigo-600 h-4 w-4"
                        />
                        <label htmlFor="enableOrganizationSchema" className="text-sm text-slate-700">
                            Emit Organization data using confirmed public brand and contact settings.
                        </label>
                    </div>
                </fieldset>
            </section>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={inputsDisabled}
                    className="px-5 py-2 text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 rounded-md flex items-center gap-2 shadow-sm disabled:opacity-60"
                >
                    {saving && <FaSpinner className="animate-spin text-white" aria-hidden="true" />}
                    <span>{saving ? 'Saving…' : 'Save discovery settings'}</span>
                </button>
            </div>
        </form>
    );
};

export default GeoSeoSettings;
