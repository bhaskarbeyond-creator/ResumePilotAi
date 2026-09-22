import React, { useState, useEffect } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaGlobeAsia, FaCheck, FaTimes, FaSpinner, FaSearchLocation, FaCode } from 'react-icons/fa';

const GeoSeoSettings = () => {
    const [geoSeoConfig, setGeoSeoConfig] = useState({
        enableGeoSeo: true,
        targetRegion: 'IN',
        targetCity: 'Bengaluru',
        targetCountry: 'India',
        metaKeywords: 'AI Resume Builder India, Free CV Maker, Biodata Format, Naukri Resume, Professional CV Bengaluru',
        canonicalUrl: import.meta.env.VITE_WEBSITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://ime365.com'),
        enableJobPostingSchema: true,
        enableOrganizationSchema: true,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getAdminSystemSettings().then((settings) => {
            if (settings && settings.geoSeo) {
                setGeoSeoConfig((prev) => ({ ...prev, ...settings.geoSeo }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setGeoSeoConfig((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('geoSeo', geoSeoConfig);
            setStatusMessage({ type: 'success', text: 'Autonomous Indian Geo-SEO configuration saved!' });
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
                <span className="text-slate-600 text-sm">Loading Geo-SEO settings...</span>
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
                    <FaGlobeAsia className="text-emerald-600 text-xl" /> Autonomous Geo-SEO for Indian Search Engines
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Optimize search engine indexing for Google India, Bing India, and local regional search queries.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center space-x-3 p-3 bg-white rounded border border-slate-200">
                        <input
                            type="checkbox"
                            id="enableGeoSeo"
                            name="enableGeoSeo"
                            checked={geoSeoConfig.enableGeoSeo}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-5 w-5"
                        />
                        <div>
                            <label htmlFor="enableGeoSeo" className="text-sm font-semibold text-slate-800">
                                Enable Indian Geo-Targeting Tags (&lt;meta name="geo.region" content="IN" /&gt;)
                            </label>
                            <p className="text-xs text-slate-500">
                                Injects ISO country and location metadata for Google India ranking priority.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Target Country Code
                            </label>
                            <input
                                type="text"
                                name="targetRegion"
                                value={geoSeoConfig.targetRegion}
                                onChange={handleChange}
                                placeholder="IN"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Primary Tech Hub City
                            </label>
                            <select
                                name="targetCity"
                                value={geoSeoConfig.targetCity}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                            >
                                <option value="Visakhapatnam">Visakhapatnam (Vizag IT Hub / Fintech Valley)</option>
                                <option value="Bengaluru">Bengaluru (Bangalore)</option>
                                <option value="Hyderabad">Hyderabad (HITEC City)</option>
                                <option value="Delhi-NCR">Delhi-NCR (Gurugram / Noida)</option>
                                <option value="Mumbai">Mumbai</option>
                                <option value="Pune">Pune (Hinjawadi / Kharadi)</option>
                                <option value="Chennai">Chennai (OMR / IT Corridor)</option>
                                <option value="Kochi">Kochi (InfoPark / SmartCity)</option>
                                <option value="Ahmedabad">Ahmedabad (GIFT City)</option>
                                <option value="Chandigarh">Chandigarh Tricity (Mohali / Panchkula)</option>
                                <option value="Indore">Indore (Super Corridor Tech Hub)</option>
                                <option value="Bhubaneswar">Bhubaneswar (Infocity)</option>
                                <option value="Coimbatore">Coimbatore (TIDEL Park)</option>
                                <option value="Jaipur">Jaipur (Mahindra World City)</option>
                                <option value="Kolkata">Kolkata (Salt Lake Sector V / New Town)</option>
                                <option value="Thiruvananthapuram">Thiruvananthapuram (Technopark)</option>
                                <option value="Nagpur">Nagpur (MIHAN IT SEZ)</option>
                                <option value="Vijayawada">Vijayawada / Amaravati</option>
                                <option value="Pan-India">Pan-India / Remote Jobs</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Target Country Name
                            </label>
                            <input
                                type="text"
                                name="targetCountry"
                                value={geoSeoConfig.targetCountry}
                                onChange={handleChange}
                                placeholder="India"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Indian Targeted Keywords (Comma Separated)
                        </label>
                        <textarea
                            name="metaKeywords"
                            rows="2"
                            value={geoSeoConfig.metaKeywords}
                            onChange={handleChange}
                            placeholder="AI Resume Builder India, Free CV Maker..."
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        ></textarea>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2 pt-1">
                            <input
                                type="checkbox"
                                id="enableJobPostingSchema"
                                name="enableJobPostingSchema"
                                checked={geoSeoConfig.enableJobPostingSchema}
                                onChange={handleChange}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                            />
                            <label htmlFor="enableJobPostingSchema" className="text-xs font-medium text-slate-700">
                                Auto-generate Schema.org JobPosting JSON-LD for Indian Listings
                            </label>
                        </div>

                        <div className="flex items-center space-x-2 pt-1">
                            <input
                                type="checkbox"
                                id="enableOrganizationSchema"
                                name="enableOrganizationSchema"
                                checked={geoSeoConfig.enableOrganizationSchema}
                                onChange={handleChange}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                            />
                            <label htmlFor="enableOrganizationSchema" className="text-xs font-medium text-slate-700">
                                Inject Schema.org LocalBusiness / Organization Structured Data
                            </label>
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
                    <span>Save Geo-SEO Rules</span>
                </button>
            </div>
        </form>
    );
};

export default GeoSeoSettings;
