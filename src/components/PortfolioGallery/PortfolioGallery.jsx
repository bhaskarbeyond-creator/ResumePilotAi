import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicPortfolios } from '../../services/api/platform';
// DIR-081: PortfolioGallery was the last legacy-styled public surface — it now uses the
// real Cuba tokens, the shared page header, a skeleton grid and honest empty/error states.
import CubaPageHeader from '../cuba/CubaPageHeader';
import CubaEmptyState from '../cuba/CubaEmptyState';
import CubaErrorState from '../cuba/CubaErrorState';
import CubaSkeleton from '../cuba/CubaSkeleton';
import modernMinimalPreview from '../../assets/portfolioPreview/modern-minimal.png';
import executivePreview from '../../assets/portfolioPreview/executive.png';
import creativeDarkPreview from '../../assets/portfolioPreview/creative-dark.png';
import premiumTechPreview from '../../assets/portfolioPreview/premium-tech.png';

const PortfolioGallery = () => {
    const [portfolios, setPortfolios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTheme, setSelectedTheme] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    // DIR-081: the failure was previously swallowed to the console, so a broken read
    // silently rendered the "no portfolios found" empty state.
    const [loadError, setLoadError] = useState('');

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
            setLoadError('');
            const data = await getPublicPortfolios(20, selectedTheme || null);
            setPortfolios(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error loading portfolios:', error);
            setPortfolios([]);
            setLoadError(error?.message || 'The portfolio gallery could not be loaded.');
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

    // DIR-081: theme chips resolve through Cuba tokens instead of the legacy
    // blue/gray/purple/slate utility palette.
    const getThemeColor = (theme) => {
        const colors = {
            default: 'bg-cuba-primary-soft text-cuba-primary-ink-strong',
            dark: 'bg-cuba-ink text-cuba-canvas',
            minimal: 'bg-cuba-card text-cuba-ink border border-cuba-line',
            creative: 'bg-cuba-info-soft text-cuba-ink',
            professional: 'bg-cuba-success-soft text-cuba-ink',
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
        <div className="min-h-screen bg-cuba-canvas">
            {/* DIR-081: the shared Cuba page header replaces the legacy centred hero. */}
            <div className="border-b border-cuba-line bg-cuba-card">
                <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
                    <CubaPageHeader
                        eyebrow="Community"
                        title="Portfolio Gallery"
                        subtitle="Discover portfolios published by the IME365 community."
                    />

                    {/* Search and Filter */}
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex-1">
                            <label className="sr-only" htmlFor="portfolio-gallery-search">Search portfolios</label>
                            <input
                                id="portfolio-gallery-search"
                                type="search"
                                placeholder="Search portfolios..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="cuba-focusable w-full rounded-cuba-sm border border-cuba-line-strong bg-cuba-canvas px-4 py-2.5 text-sm text-cuba-ink"
                            />
                        </div>
                        <div className="sm:w-56">
                            <label className="sr-only" htmlFor="portfolio-gallery-theme">Filter by theme</label>
                            <select
                                id="portfolio-gallery-theme"
                                value={selectedTheme}
                                onChange={(e) => setSelectedTheme(e.target.value)}
                                className="cuba-focusable w-full rounded-cuba-sm border border-cuba-line-strong bg-cuba-canvas px-4 py-2.5 text-sm text-cuba-ink">
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

            {/* Portfolio Grid */}
            <div className="mx-auto max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
                {loadError ? (
                    <CubaErrorState
                        title="The portfolio gallery could not be loaded"
                        message={loadError}
                        onRetry={loadPortfolios}
                    />
                ) : loading ? (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="rounded-cuba-lg border border-cuba-line bg-cuba-card p-5">
                                <CubaSkeleton height="9rem" rounded="rounded-cuba-lg" text="Loading portfolio preview" />
                                <CubaSkeleton className="mt-4" height="1rem" width="70%" text="Loading portfolio title" />
                                <CubaSkeleton className="mt-2" height="0.8rem" width="45%" text="Loading portfolio metadata" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="mb-6">
                            <p className="text-sm font-medium text-cuba-ink-muted">
                                {filteredPortfolios.length} portfolio{filteredPortfolios.length !== 1 ? 's' : ''} found
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredPortfolios.map((portfolio) => (
                                <div key={portfolio.id} className="cuba-glass overflow-hidden rounded-cuba-lg border border-cuba-line transition-shadow hover:shadow-cuba-lg">
                                    {/* Preview Image */}
                                    <div className="relative h-48 overflow-hidden bg-cuba-canvas">
                                        <img
                                            src={getPreviewImage(portfolio)}
                                            alt={`${portfolio.title} preview`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.parentElement.classList.add('bg-cuba-primary-soft');
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 opacity-0 transition-all duration-200 hover:bg-opacity-40 hover:opacity-100">
                                            <div className="text-center text-white">
                                                <h3 className="mb-1 text-lg font-bold">{portfolio.title}</h3>
                                                <p className="text-xs font-medium">View Portfolio</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Portfolio Info */}
                                    <div className="p-6">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <h3 className="truncate text-lg font-semibold text-cuba-ink">{portfolio.title}</h3>
                                            <span className={`rounded-cuba-sm px-2 py-1 text-xs font-medium ${getThemeColor(portfolio.theme)}`}>{portfolio.theme}</span>
                                        </div>

                                        {portfolio.metadata?.description && <p className="mb-3 line-clamp-2 text-sm text-cuba-ink-muted">{portfolio.metadata.description}</p>}

                                        {portfolio.metadata?.tags && portfolio.metadata.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-4">
                                                {portfolio.metadata.tags.slice(0, 3).map((tag, index) => (
                                                    <span key={index} className="rounded-cuba-sm border border-cuba-line bg-cuba-card px-2 py-1 text-xs text-cuba-ink-muted">
                                                        {tag}
                                                    </span>
                                                ))}
                                                {portfolio.metadata.tags.length > 3 && (
                                                    <span className="rounded-cuba-sm border border-cuba-line bg-cuba-card px-2 py-1 text-xs text-cuba-ink-muted">+{portfolio.metadata.tags.length - 3} more</span>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-cuba-ink-subtle">{portfolio.views || 0} views</div>
                                            <Link
                                                to={`/portfolio/${portfolio.slug}`}
                                                className="cuba-btn-primary inline-flex items-center rounded-cuba-sm px-4 py-2 text-sm font-semibold">
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
                            /* DIR-081: the real Cuba empty state — no raw emoji placeholder and no
                               legacy blue button. A failed read is the error state above, not this. */
                            <CubaEmptyState
                                title="No portfolios found"
                                description={searchTerm || selectedTheme
                                    ? 'Try adjusting your search or filter criteria.'
                                    : 'Be the first to publish a portfolio!'}
                                action={(
                                    <Link to="/portfolio/builder?create=1" className="cuba-btn-primary inline-flex items-center rounded-cuba-sm px-6 py-3 font-semibold">
                                        Create Portfolio
                                    </Link>
                                )}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PortfolioGallery;
