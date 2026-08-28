import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicPortfolios } from '../../services/api/platform';
import modernMinimalPreview from '../../assets/portfolioPreview/modern-minimal.png';
import executivePreview from '../../assets/portfolioPreview/executive.png';
import creativeDarkPreview from '../../assets/portfolioPreview/creative-dark.png';
import premiumTechPreview from '../../assets/portfolioPreview/premium-tech.png';

const PortfolioGallery = () => {
    const [portfolios, setPortfolios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTheme, setSelectedTheme] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const themes = [
        { value: '', label: 'All Themes' },
        { value: 'default', label: 'Default' },
        { value: 'dark', label: 'Dark Theme' },
        { value: 'minimal', label: 'Minimal' },
        { value: 'creative', label: 'Creative' },
        { value: 'professional', label: 'Professional' },
    ];

    useEffect(() => {
        loadPortfolios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTheme]);

    const loadPortfolios = async () => {
        try {
            setLoading(true);
            const data = await getPublicPortfolios(20, selectedTheme || null);
            setPortfolios(data);
        } catch (error) {
            console.error('Error loading portfolios:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredPortfolios = portfolios.filter(
        (portfolio) =>
            portfolio.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (portfolio.metadata?.description && portfolio.metadata.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (portfolio.metadata?.tags && portfolio.metadata.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    const getThemeColor = (theme) => {
        const colors = {
            default: 'bg-blue-100 text-blue-800',
            dark: 'bg-gray-800 text-white',
            minimal: 'bg-gray-100 text-gray-800',
            creative: 'bg-purple-100 text-purple-800',
            professional: 'bg-slate-100 text-slate-800',
        };
        return colors[theme] || colors.default;
    };

    const getPreviewImage = (portfolio) => {
        const template = portfolio.data?.templateKey || portfolio.data?.template || portfolio.template;
        const theme = portfolio.theme || 'default';
        if (template === 'modernMinimal' || theme === 'minimal') return modernMinimalPreview;
        if (template === 'executive' || theme === 'professional') return executivePreview;
        if (template === 'creativeDark' || theme === 'creative') return creativeDarkPreview;
        if (template === 'premiumTech' || theme === 'dark') return premiumTechPreview;
        return modernMinimalPreview;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-900 mb-4">Portfolio Gallery</h1>
                        <p className="text-lg text-gray-600 mb-8">Discover amazing portfolios created by our community</p>

                        {/* Search and Filter */}
                        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Search portfolios..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="sm:w-48">
                                <select
                                    value={selectedTheme}
                                    onChange={(e) => setSelectedTheme(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    {themes.map((theme) => (
                                        <option key={theme.value} value={theme.value}>
                                            {theme.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Portfolio Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <>
                        <div className="mb-6">
                            <p className="text-gray-600">
                                {filteredPortfolios.length} portfolio{filteredPortfolios.length !== 1 ? 's' : ''} found
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredPortfolios.map((portfolio) => (
                                <div key={portfolio.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                                    {/* Preview Image */}
                                    <div className="h-48 relative overflow-hidden bg-slate-100">
                                        <img
                                            src={getPreviewImage(portfolio)}
                                            alt={`${portfolio.title} preview`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.parentElement.classList.add('bg-gradient-to-br', 'from-slate-400', 'to-purple-500');
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black bg-opacity-20 hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
                                            <div className="text-white text-center">
                                                <h3 className="text-lg font-bold mb-1">{portfolio.title}</h3>
                                                <p className="text-xs font-medium">View Portfolio</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Portfolio Info */}
                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-lg font-semibold text-gray-900 truncate">{portfolio.title}</h3>
                                            <span className={`px-2 py-1 text-xs font-medium rounded ${getThemeColor(portfolio.theme)}`}>{portfolio.theme}</span>
                                        </div>

                                        {portfolio.metadata?.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{portfolio.metadata.description}</p>}

                                        {portfolio.metadata?.tags && portfolio.metadata.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-4">
                                                {portfolio.metadata.tags.slice(0, 3).map((tag, index) => (
                                                    <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                                {portfolio.metadata.tags.length > 3 && (
                                                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">+{portfolio.metadata.tags.length - 3} more</span>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-gray-500">{portfolio.views || 0} views</div>
                                            <Link
                                                to={`/portfolio/${portfolio.slug}`}
                                                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors">
                                                View Portfolio
                                                <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                    />
                                                </svg>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {filteredPortfolios.length === 0 && !loading && (
                            <div className="text-center py-12">
                                <div className="text-6xl mb-4">🎨</div>
                                <h3 className="text-xl font-medium text-gray-900 mb-2">No portfolios found</h3>
                                <p className="text-gray-600 mb-6">{searchTerm || selectedTheme ? 'Try adjusting your search or filter criteria.' : 'Be the first to publish a portfolio!'}</p>
                                <Link to="/portfolio/builder?create=1" className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
                                    Create Portfolio
                                    <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </Link>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PortfolioGallery;
