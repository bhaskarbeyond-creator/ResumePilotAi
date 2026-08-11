import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaSearch, FaCheck, FaTimes, FaSpinner, FaBriefcase, FaGlobeAsia } from 'react-icons/fa';

const JobScraperSettings = () => {
    const [scraperConfig, setScraperConfig] = useState({
        keywords: 'software engineer, web developer',
        location: 'Bengaluru, India',
        portal: 'all',
        maxJobs: 25,
        scrapeIntervalHours: 24,
        naukriEnabled: true,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.jobScraper) {
                setScraperConfig((prev) => ({ ...prev, ...settings.jobScraper }));
            }
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setScraperConfig((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('jobScraper', scraperConfig);
            setStatusMessage({ type: 'success', text: 'Job Scraper & Naukri settings saved successfully!' });
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
                <span className="text-slate-600 text-sm">Loading job scraper settings...</span>
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
                    <FaBriefcase className="text-blue-600" /> Automated Job Scraper & Naukri.com Integration
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure search parameters, Naukri.com scraper options, and location targeting for Indian tech hubs.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                        <input
                            type="checkbox"
                            id="naukriEnabled"
                            name="naukriEnabled"
                            checked={scraperConfig.naukriEnabled}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <label htmlFor="naukriEnabled" className="text-sm font-semibold text-slate-800">
                            Enable Naukri.com Indian Job Market Scraper
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Target Job Portals
                            </label>
                            <select
                                name="portal"
                                value={scraperConfig.portal}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="all">All Portals (Naukri.com + LinkedIn + Indeed India)</option>
                                <option value="naukri">Naukri.com Only (India)</option>
                                <option value="linkedin">LinkedIn India Only</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Target Region / Hub City
                            </label>
                            <select
                                name="location"
                                value={scraperConfig.location}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                            >
                                <option value="Visakhapatnam, India">Visakhapatnam (Vizag IT Hub / Fintech Valley)</option>
                                <option value="Bengaluru, India">Bengaluru (Bangalore)</option>
                                <option value="Hyderabad, India">Hyderabad (HITEC City)</option>
                                <option value="Delhi NCR, India">Delhi NCR (Gurugram / Noida)</option>
                                <option value="Mumbai, India">Mumbai</option>
                                <option value="Pune, India">Pune (Hinjawadi / Kharadi)</option>
                                <option value="Chennai, India">Chennai (OMR / IT Corridor)</option>
                                <option value="Kochi, India">Kochi (InfoPark / SmartCity)</option>
                                <option value="Ahmedabad, India">Ahmedabad (GIFT City)</option>
                                <option value="Chandigarh, India">Chandigarh Tricity (Mohali / Panchkula)</option>
                                <option value="Indore, India">Indore (Super Corridor Tech Hub)</option>
                                <option value="Bhubaneswar, India">Bhubaneswar (Infocity)</option>
                                <option value="Coimbatore, India">Coimbatore (TIDEL Park)</option>
                                <option value="Jaipur, India">Jaipur (Mahindra World City)</option>
                                <option value="Kolkata, India">Kolkata (Salt Lake Sector V / New Town)</option>
                                <option value="Thiruvananthapuram, India">Thiruvananthapuram (Technopark)</option>
                                <option value="Nagpur, India">Nagpur (MIHAN IT SEZ)</option>
                                <option value="Vijayawada, India">Vijayawada / Amaravati</option>
                                <option value="India">Pan-India / Remote Jobs</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Default Target Job Keywords
                            </label>
                            <input
                                type="text"
                                name="keywords"
                                value={scraperConfig.keywords}
                                onChange={handleChange}
                                placeholder="software engineer, web developer"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Max Jobs Per Scrape Run
                            </label>
                            <input
                                type="number"
                                name="maxJobs"
                                value={scraperConfig.maxJobs}
                                onChange={handleChange}
                                placeholder="25"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    <span>Save Scraper & Naukri Settings</span>
                </button>
            </div>
        </form>
    );
};

export default JobScraperSettings;
