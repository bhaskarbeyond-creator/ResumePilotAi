import React, { useState, useEffect } from 'react';
import { getFrontendStats, setFrontendStats } from '../../../firestore/dbOperations';
import { FiSave, FiRefreshCw, FiEye } from 'react-icons/fi';

const LandingPages = () => {
    const [activeTab, setActiveTab] = useState('jobs');
    const [stats, setStats] = useState({
        // Jobs Landing Hero
        activeJobs: '10,000+',
        rating: '4.8',
        
        // Jobs Landing Top Companies
        partnerCompanies: '500+',
        successfulHires: '50,000+',
        
        // Jobs Landing Featured
        featuredJobs: '2,500+',
        successRate: '95',
        topCompanies: '500+',
    });
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const fetchedStats = await getFrontendStats();
            if (fetchedStats) {
                setStats({ ...stats, ...fetchedStats });
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
            setMessage('Error loading stats');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (field, value) => {
        setStats(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const result = await setFrontendStats(stats);
            if (result.success) {
                setMessage('Stats updated successfully!');
                setTimeout(() => setMessage(''), 3000);
            } else {
                setMessage('Error updating stats: ' + result.message);
            }
        } catch (error) {
            console.error('Error saving stats:', error);
            setMessage('Error saving stats');
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = () => {
        window.open('/jobs-landing', '_blank');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Landing Pages Management</h1>
                <p className="text-gray-600">Manage statistics and content for your landing pages</p>
            </div>

            {/* Tab Navigation */}
            <div className="mb-8">
                <nav className="flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('jobs')}
                        className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'jobs'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Jobs Landing Page
                    </button>
                    <button
                        onClick={() => setActiveTab('resume')}
                        className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'resume'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Resume Builder (Coming Soon)
                    </button>
                </nav>
            </div>

            {/* Jobs Landing Page Tab */}
            {activeTab === 'jobs' && (
                <div className="space-y-8">
                    {/* Hero Section Stats */}
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Hero Section</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Active Jobs Count
                                </label>
                                <input
                                    type="text"
                                    value={stats.activeJobs}
                                    onChange={(e) => handleInputChange('activeJobs', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 10,000+"
                                />
                                <p className="text-xs text-gray-500 mt-1">Displayed as "{stats.activeJobs} Active Jobs"</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Rating (out of 5)
                                </label>
                                <input
                                    type="text"
                                    value={stats.rating}
                                    onChange={(e) => handleInputChange('rating', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 4.8"
                                />
                                <p className="text-xs text-gray-500 mt-1">Displayed as "{stats.rating}/5 Rating"</p>
                            </div>
                        </div>
                    </div>

                    {/* Top Companies Section Stats */}
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Companies Section</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Partner Companies
                                </label>
                                <input
                                    type="text"
                                    value={stats.partnerCompanies}
                                    onChange={(e) => handleInputChange('partnerCompanies', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 500+"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Active Jobs
                                </label>
                                <input
                                    type="text"
                                    value={stats.activeJobs}
                                    onChange={(e) => handleInputChange('activeJobs', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 10,000+"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Successful Hires
                                </label>
                                <input
                                    type="text"
                                    value={stats.successfulHires}
                                    onChange={(e) => handleInputChange('successfulHires', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 50,000+"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Featured Jobs Section Stats */}
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Featured Jobs Section</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Featured Jobs
                                </label>
                                <input
                                    type="text"
                                    value={stats.featuredJobs}
                                    onChange={(e) => handleInputChange('featuredJobs', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 2,500+"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Success Rate (%)
                                </label>
                                <input
                                    type="text"
                                    value={stats.successRate}
                                    onChange={(e) => handleInputChange('successRate', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 95"
                                />
                                <p className="text-xs text-gray-500 mt-1">Displayed as "{stats.successRate}%"</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Top Companies
                                </label>
                                <input
                                    type="text"
                                    value={stats.topCompanies}
                                    onChange={(e) => handleInputChange('topCompanies', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g., 500+"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Resume Builder Tab (Placeholder) */}
            {activeTab === 'resume' && (
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="text-center py-12">
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Resume Builder Landing Page</h2>
                        <p className="text-gray-600">This section will be available in a future update.</p>
                    </div>
                </div>
            )}

            {/* Message Display */}
            {message && (
                <div className={`mt-4 p-4 rounded-md ${
                    message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                    {message}
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
                <button
                    onClick={handlePreview}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <FiEye className="w-4 h-4" />
                    Preview Landing Page
                </button>
                
                <div className="flex gap-3">
                    <button
                        onClick={fetchStats}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        <FiSave className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LandingPages;
