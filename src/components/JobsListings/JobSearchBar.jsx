import React from 'react';
import { FaSearch, FaFilter, FaPlus, FaBriefcase, FaHeart, FaTimes, FaFire, FaLaptop, FaBolt, FaStar, FaDollarSign, FaHandshake } from 'react-icons/fa';
import CustomLocationAutocomplete from './CustomLocationAutocomplete';
import { withTranslation } from 'react-i18next';

const JobSearchBar = ({
    searchTerm,
    setSearchTerm,
    locationFilter,
    setLocationFilter,
    showFilters,
    setShowFilters,
    onSubmitJob,
    onOpenFavorites,
    savedJobsCount,
    user,
    onQuickFilter,
    onSearch,
    t,
}) => {
    // Quick filter presets for instant discovery
    const quickFilters = [
        { id: 'all', label: 'All Jobs', icon: FaFire, category: null, value: null },
        { id: 'remote', label: 'Remote', icon: FaLaptop, category: 'workMode', value: 'remote' },
        { id: 'full-time', label: 'Full-time', icon: FaBolt, category: 'jobType', value: 'full-time' },
        { id: 'senior', label: 'Senior Level', icon: FaStar, category: 'experienceLevel', value: 'senior' },
        { id: 'salary100k', label: '$120k+', icon: FaDollarSign, category: 'salaryRange', value: '$120k+' },
        { id: 'contract', label: 'Contract', icon: FaHandshake, category: 'jobType', value: 'contract' },
    ];

    const handleQuickFilterClick = (qf) => {
        if (qf.id === 'all') {
            if (onQuickFilter) {
                onQuickFilter('clear');
            } else {
                setSearchTerm('');
                setLocationFilter('');
            }
            return;
        }

        if (onQuickFilter && qf.category) {
            onQuickFilter(qf.category, qf.value);
        } else {
            setSearchTerm(qf.label);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && onSearch) {
            onSearch();
        }
    };

    return (
        <div className="mb-8">
            {/* Top Hero Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/80 mb-3 shadow-xs">
                        <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
                        <span>{t('JobsUpdate.JobSearchBar.badge', 'Verified Opportunities • 10,000+ Active Roles')}</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                        {t('JobsUpdate.JobSearchBar.headingPrefix', 'Find Your Next')}{' '}
                        <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                            {t('JobsUpdate.JobSearchBar.headingHighlight', 'Career Breakthrough')}
                        </span>
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 mt-1.5 max-w-2xl font-normal">
                        {t('JobsUpdate.JobSearchBar.subheading', 'Connect with vetted employers, discover competitive compensation, and land your ideal role worldwide.')}
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    {/* Favorites Button */}
                    <button
                        onClick={onOpenFavorites}
                        type="button"
                        aria-label="View Saved Jobs"
                        className="relative group flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 font-semibold text-sm">
                        <FaHeart className={`w-4 h-4 transition-transform group-hover:scale-110 ${savedJobsCount > 0 ? 'text-rose-500' : 'text-slate-400 group-hover:text-rose-500'}`} />
                        <span>{t('JobsUpdate.JobSearchBar.favorites', 'Favorites')}</span>
                        {savedJobsCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-gradient-to-r from-rose-500 to-red-600 text-white text-[11px] rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center font-bold shadow-sm ring-2 ring-white animate-pulse">
                                {savedJobsCount > 99 ? '99+' : savedJobsCount}
                            </span>
                        )}
                    </button>

                    {/* Post Job Button - Visible for Authenticated Users */}
                    {user && (
                        <button
                            onClick={onSubmitJob}
                            type="button"
                            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 font-semibold text-sm hover:-translate-y-0.5 active:translate-y-0">
                            <FaBriefcase className="w-3.5 h-3.5" />
                            <span>{t('JobsUpdate.JobSearchBar.postJob', 'Post a Job')}</span>
                            <FaPlus className="w-2.5 h-2.5 ml-0.5 opacity-80" />
                        </button>
                    )}

                    {/* Mobile Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        type="button"
                        className={`lg:hidden flex items-center space-x-2 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all duration-200 ${
                            showFilters
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}>
                        <FaFilter className="w-3.5 h-3.5" />
                        <span>{t('JobsUpdate.JobSearchBar.filters', 'Filters')}</span>
                    </button>
                </div>
            </div>

            {/* Elevated Search Bar Dock */}
            <div className="bg-white rounded-2xl shadow-md hover:shadow-lg border border-slate-200/90 p-3 transition-all duration-300">
                <div className="flex flex-col md:flex-row gap-2.5">
                    {/* Search Keyword Input */}
                    <div className="relative flex-1 flex items-center">
                        <FaSearch className="absolute left-3.5 text-slate-400 w-4 h-4 pointer-events-none transition-colors group-focus-within:text-blue-500" />
                        <input
                            type="text"
                            placeholder={t('JobsUpdate.JobSearchBar.searchPlaceholder', 'Job title, keywords, tech stack, or company...')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full pl-10 pr-9 py-3 text-slate-900 placeholder-slate-400 bg-slate-50/60 hover:bg-slate-50 focus:bg-white rounded-xl border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-medium transition-all duration-200 outline-none"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200/60 transition-colors"
                                title="Clear search">
                                <FaTimes className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Location Autocomplete Input */}
                    <div className="md:w-72">
                        <CustomLocationAutocomplete
                            value={locationFilter}
                            onChange={setLocationFilter}
                            placeholder={t('JobsUpdate.JobSearchBar.locationPlaceholder', 'City, state, or Remote')}
                            className="bg-slate-50/60 hover:bg-slate-50 focus:bg-white border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-medium"
                        />
                    </div>

                    {/* Search CTA Button */}
                    <button
                        onClick={onSearch}
                        type="button"
                        className="px-7 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 text-sm flex items-center justify-center gap-2 whitespace-nowrap active:scale-[0.98]">
                        <FaSearch className="w-3.5 h-3.5" />
                        <span>{t('JobsUpdate.JobSearchBar.searchButton', 'Search Jobs')}</span>
                    </button>
                </div>

                {/* Quick Trending Filter Pills Strip */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap pl-1 mr-1">
                        {t('JobsUpdate.JobSearchBar.trending', 'Quick Filter:')}
                    </span>
                    <div className="flex items-center gap-1.5 flex-nowrap">
                        {quickFilters.map((qf) => {
                            const Icon = qf.icon;
                            return (
                                <button
                                    key={qf.id}
                                    type="button"
                                    onClick={() => handleQuickFilterClick(qf)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-transparent transition-all duration-150 whitespace-nowrap active:scale-95">
                                    <Icon className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                                    <span>{qf.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MyComponent = withTranslation('common')(JobSearchBar);
export default MyComponent;
