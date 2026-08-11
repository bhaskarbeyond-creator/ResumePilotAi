import React from 'react';
import { FaSearch, FaFilter, FaPlus, FaBriefcase, FaHeart } from 'react-icons/fa';
import CustomLocationAutocomplete from './CustomLocationAutocomplete';
import { withTranslation } from 'react-i18next';

const JobSearchBar = ({ searchTerm, setSearchTerm, locationFilter, setLocationFilter, showFilters, setShowFilters, onSubmitJob, onOpenFavorites, savedJobsCount, user, t }) => {
    return (
        <div className="mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">{t('JobsUpdate.JobSearchBar.heading', 'Find Your Next Opportunity')}</h1>
                    <p className="text-sm text-slate-600">{t('JobsUpdate.JobSearchBar.subheading', 'Discover jobs from top companies worldwide')}</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Favorites Button */}
                    <button
                        onClick={onOpenFavorites}
                        className="relative flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-all duration-200 font-medium text-sm">
                        <FaHeart className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('JobsUpdate.JobSearchBar.favorites', 'Favorites')}</span>
                        {savedJobsCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                {savedJobsCount > 99 ? '99+' : savedJobsCount}
                            </span>
                        )}
                    </button>

                    {/* Compact Submit a Job Button - Only show for authenticated users */}
                    {user && (
                        <button
                            onClick={onSubmitJob}
                            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 font-semibold text-sm">
                            <FaBriefcase className="w-4 h-4" />
                            <span>{t('JobsUpdate.JobSearchBar.postJob', 'Post Job')}</span>
                            <FaPlus className="w-3 h-3" />
                        </button>
                    )}

                    {/* Mobile Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="lg:hidden flex items-center space-x-2 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-all duration-200 font-medium text-sm">
                        <FaFilter className="w-4 h-4" />
                        <span>{t('JobsUpdate.JobSearchBar.filters', 'Filters')}</span>
                    </button>
                </div>
            </div>

            {/* Compact Search Bar */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder={t('JobsUpdate.JobSearchBar.searchPlaceholder', 'Search jobs, companies, keywords...')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg bg-white text-sm placeholder-slate-400
                                     focus:outline-none focus:border-blue-500 transition-all duration-200"
                        />
                    </div>
                    <div className="sm:w-64">
                        <CustomLocationAutocomplete value={locationFilter} onChange={setLocationFilter} placeholder={t('JobsUpdate.JobSearchBar.locationPlaceholder', 'Location (city, state, country)')} />
                    </div>
                    <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-200 text-sm whitespace-nowrap">{t('JobsUpdate.JobSearchBar.searchButton', 'Search')}</button>
                </div>
            </div>
        </div>
    );
};

const MyComponent = withTranslation('common')(JobSearchBar);
export default MyComponent;
