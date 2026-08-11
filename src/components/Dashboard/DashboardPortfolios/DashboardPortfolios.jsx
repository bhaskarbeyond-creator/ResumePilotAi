import React, { useState, useEffect } from 'react';
import { withTranslation } from 'react-i18next';
import { FiPlus, FiEye, FiEdit3, FiTrash2, FiExternalLink, FiGrid, FiList } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import fire from '../../../conf/fire';
import { getUserPortfolios, deletePortfolio } from '../../../firestore/dbOperations';

// Import portfolio preview images
import darkCyberPreview from '../../../assets/portfolioPreview/Dark Cyber Portfolio.JPG';
import terminalPreview from '../../../assets/portfolioPreview/Terminal Portfolio.JPG';
import artistPreview from '../../../assets/portfolioPreview/Artist Portfolio.JPG';
import cyberSecurityPreview from '../../../assets/portfolioPreview/Cyber Security Portfolio.JPG';

const DashboardPortfolios = ({ t, showToast }) => {
    const [portfolios, setPortfolios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTheme, setSelectedTheme] = useState('');

    const themes = [
        { value: '', label: t('DashboardPortfolios.themes.allThemes') },
        { value: 'default', label: t('DashboardPortfolios.themes.default') },
        { value: 'dark', label: t('DashboardPortfolios.themes.darkTheme') },
        { value: 'minimal', label: t('DashboardPortfolios.themes.minimal') },
        { value: 'creative', label: t('DashboardPortfolios.themes.creative') },
        { value: 'professional', label: t('DashboardPortfolios.themes.professional') },
    ];

    useEffect(() => {
        loadUserPortfolios();
    }, []);

    const loadUserPortfolios = async () => {
        try {
            setLoading(true);
            const user = fire.auth().currentUser;
            if (user) {
                const userPortfolios = await getUserPortfolios(user.uid, true); // Include unpublished portfolios
                // Ensure we always have an array, even if the result is null or undefined
                setPortfolios(Array.isArray(userPortfolios) ? userPortfolios : []);
            } else {
                // No authenticated user, set empty portfolios
                setPortfolios([]);
            }
        } catch (error) {
            console.error('Error loading portfolios:', error);
            // Set empty portfolios on error to prevent undefined state
            setPortfolios([]);
            showToast && showToast('error', 'Error', t('DashboardPortfolios.messages.loadError'));
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePortfolio = async (portfolioId) => {
        if (window.confirm(t('DashboardPortfolios.deleteConfirmation'))) {
            try {
                const user = fire.auth().currentUser;
                if (user) {
                    await deletePortfolio(user.uid, portfolioId);
                    setPortfolios(portfolios.filter((p) => p.id !== portfolioId));
                    showToast && showToast('success', 'Success', t('DashboardPortfolios.messages.deleteSuccess'));
                }
            } catch (error) {
                console.error('Error deleting portfolio:', error);
                showToast && showToast('error', 'Error', t('DashboardPortfolios.messages.deleteError'));
            }
        }
    };

    const filteredPortfolios = portfolios.filter((portfolio) => {
        // Ensure portfolio object exists and has required properties
        if (!portfolio || typeof portfolio !== 'object') {
            return false;
        }
        
        const title = portfolio.title || '';
        const description = portfolio.metadata?.description || '';
        const theme = portfolio.theme || '';
        
        const matchesSearch = 
            title.toLowerCase().includes(searchTerm.toLowerCase()) || 
            description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTheme = !selectedTheme || theme === selectedTheme;
        return matchesSearch && matchesTheme;
    });

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
        // First check if portfolio has a specific template that matches our previews
        const template = portfolio.data?.template || portfolio.template;
        const theme = portfolio.theme || 'default';
        const title = portfolio.title?.toLowerCase() || '';

        // Match based on template, theme, or title keywords
        if (template === 'darkCyber' || theme === 'dark-cyber' || title.includes('cyber') || title.includes('dark')) {
            return darkCyberPreview;
        }
        if (template === 'terminal' || theme === 'terminal' || title.includes('terminal') || title.includes('developer')) {
            return terminalPreview;
        }
        if (template === 'artist' || theme === 'artist' || theme === 'creative' || title.includes('artist') || title.includes('creative')) {
            return artistPreview;
        }
        if (template === 'cyberSecurity' || theme === 'cybersecurity' || title.includes('security') || title.includes('cybersecurity')) {
            return cyberSecurityPreview;
        }

        // Default fallback based on theme
        switch (theme) {
            case 'dark':
                return darkCyberPreview;
            case 'creative':
                return artistPreview;
            case 'professional':
                return terminalPreview;
            case 'minimal':
                return terminalPreview;
            default:
                return artistPreview; // Default to artist portfolio as it's most generic
        }
    };

    const renderGridView = () => (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredPortfolios.map((portfolio) => (
                <div key={portfolio.id} className="bg-white rounded-lg border border-slate-200 hover:shadow-md transition-all duration-300">
                    {/* Preview */}
                    <div className="h-48 relative rounded-t-lg overflow-hidden bg-slate-100">
                        <img
                            src={getPreviewImage(portfolio)}
                            alt={`${portfolio.title} preview`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                // Fallback to gradient if image fails to load
                                e.target.style.display = 'none';
                                e.target.parentElement.classList.add('bg-gradient-to-br', 'from-slate-400', 'to-purple-500');
                            }}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-10 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
                            <div className="text-white text-center">
                                <FiEye className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm font-medium">{t('DashboardPortfolios.actions.viewPreview')}</p>
                            </div>
                        </div>
                        {/* Portfolio Status Badge */}
                        <div className="absolute top-3 right-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${portfolio.isPublished ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {portfolio.isPublished ? t('DashboardPortfolios.status.published') : t('DashboardPortfolios.status.draft')}
                            </span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">{portfolio.title}</h3>
                            <span className={`px-2 py-1 text-xs font-medium rounded ${getThemeColor(portfolio.theme)}`}>{portfolio.theme}</span>
                        </div>

                        {portfolio.metadata?.description ? (<p className="text-slate-600 text-xs mb-3 line-clamp-2 h-8">{portfolio.metadata.description}</p>) : (<div className="h-8 mb-3" />)}

                        <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                            <span>
                                {t('DashboardPortfolios.stats.views')}: {portfolio.views || 0}
                            </span>
                            <span>
                                {t('DashboardPortfolios.stats.updated')}: {portfolio.updatedAt ? new Date(portfolio.updatedAt?.toDate ? portfolio.updatedAt.toDate() : portfolio.updatedAt).toLocaleDateString() : 'N/A'}
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <Link
                                to={`/portfolio/${portfolio.slug}`}
                                className="w-full inline-flex items-center justify-center px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm">
                                <FiEye className="w-3.5 h-3.5 mr-2" />
                                {t('DashboardPortfolios.actions.view')}
                            </Link>
                            <div className="flex items-center gap-2">
                                <Link to={`/portfolio/builder?edit=${portfolio.id}`} className="flex-1 px-2.5 py-1.5 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-medium border border-slate-200 text-center">
                                    <FiEdit3 className="w-3.5 h-3.5 inline mr-1" />
                                    Edit
                                </Link>
                                <button onClick={() => handleDeletePortfolio(portfolio.id)} className="px-2.5 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-medium border border-red-200">
                                    <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderListView = () => (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-700">
                    <div className="col-span-4">{t('DashboardPortfolios.table.portfolio')}</div>
                    <div className="col-span-2">{t('DashboardPortfolios.table.theme')}</div>
                    <div className="col-span-2">{t('DashboardPortfolios.table.views')}</div>
                    <div className="col-span-2">{t('DashboardPortfolios.table.updated')}</div>
                    <div className="col-span-2">{t('DashboardPortfolios.table.actions')}</div>
                </div>
            </div>
            <div className="divide-y divide-slate-200">
                {filteredPortfolios.map((portfolio) => (
                    <div key={portfolio.id} className="px-6 py-4 hover:bg-slate-50">
                        <div className="grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-4">
                                <div className="flex items-center gap-3">
                                    {/* Mini Preview Image */}
                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                                        <img
                                            src={getPreviewImage(portfolio)}
                                            alt={`${portfolio.title} preview`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.parentElement.classList.add('bg-gradient-to-br', 'from-slate-400', 'to-purple-500');
                                            }}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-xs font-medium text-slate-900 truncate">{portfolio.title}</h3>
                                        {portfolio.metadata?.description && <p className="text-xs text-slate-500 truncate">{portfolio.metadata.description}</p>}
                                        <span
                                            className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${portfolio.isPublished ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {portfolio.isPublished ? t('DashboardPortfolios.status.published') : t('DashboardPortfolios.status.draft')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="col-span-2">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${getThemeColor(portfolio.theme)}`}>{portfolio.theme}</span>
                            </div>
                            <div className="col-span-2 text-xs text-slate-500">{portfolio.views || 0}</div>
                            <div className="col-span-2 text-xs text-slate-500">{portfolio.updatedAt ? new Date(portfolio.updatedAt?.toDate ? portfolio.updatedAt.toDate() : portfolio.updatedAt).toLocaleDateString() : 'N/A'}</div>
                            <div className="col-span-2">
                                <div className="flex items-center gap-2">
                                    <Link
                                        to={`/portfolio/${portfolio.slug}`}
                                        className="p-2 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                        title={t('DashboardPortfolios.tooltips.viewPortfolio')}>
                                        <FiEye className="w-4 h-4" />
                                    </Link>
                                    <Link
                                        to={`/portfolio/builder?edit=${portfolio.id}`}
                                        className="p-2 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                        title={t('DashboardPortfolios.tooltips.editPortfolio')}>
                                        <FiEdit3 className="w-4 h-4" />
                                    </Link>
                                    <button
                                        onClick={() => handleDeletePortfolio(portfolio.id)}
                                        className="p-2 text-red-600 hover:bg-red-100 rounded transition-colors"
                                        title={t('DashboardPortfolios.tooltips.deletePortfolio')}>
                                        <FiTrash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                            <FiGrid className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-slate-900">{t('DashboardPortfolios.title')}</h1>
                            <p className="text-sm text-slate-600 mt-0.5">{t('DashboardPortfolios.subtitle')}</p>
                        </div>
                    </div>
                    <Link to="/portfolio/builder" className="inline-flex items-center px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors text-sm shadow-sm">
                        <FiPlus className="w-4 h-4 mr-2" />
                        {t('DashboardPortfolios.createPortfolio')}
                    </Link>
                </div>

                {/* Filters and Controls */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        {/* Search and Filter */}
                        <div className="flex flex-col sm:flex-row gap-4 flex-1">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder={t('DashboardPortfolios.searchPlaceholder')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 placeholder-slate-400"
                                />
                            </div>
                            <div className="sm:w-48">
                                <select
                                    value={selectedTheme}
                                    onChange={(e) => setSelectedTheme(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white">
                                    {themes.map((theme) => (
                                        <option key={theme.value} value={theme.value}>
                                            {theme.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* View Toggle */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                <FiGrid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                <FiList className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                {filteredPortfolios.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
                        <div className="text-6xl mb-4">🎨</div>
                        <h3 className="text-lg font-medium text-slate-900 mb-2">{t('DashboardPortfolios.emptyState.title')}</h3>
                        <p className="text-slate-600 mb-6 text-sm">{searchTerm || selectedTheme ? t('DashboardPortfolios.emptyState.noSearchResults') : t('DashboardPortfolios.emptyState.noPortfolios')}</p>
                        <Link to="/portfolio/builder" className="inline-flex items-center px-5 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm text-sm">
                            <FiPlus className="w-5 h-5 mr-2" />
                            {t('DashboardPortfolios.emptyState.createFirstPortfolio')}
                        </Link>
                    </div>
                ) : (
                    <>{viewMode === 'grid' ? renderGridView() : renderListView()}</>
                )}
            </div>
        </div>
    );
};

export default withTranslation('common')(DashboardPortfolios);
