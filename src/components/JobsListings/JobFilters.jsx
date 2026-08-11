import React from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';

const JobFilters = ({ selectedFilters, handleFilterChange, clearAllFilters, expandedFilter, setExpandedFilter, showFilters, filterCounts = {}, t }) => {
    const filterOptions = {
        jobType: [
            { value: 'full-time', label: t('JobsUpdate.JobFilters.jobType.fullTime', 'Full-time') },
            { value: 'part-time', label: t('JobsUpdate.JobFilters.jobType.partTime', 'Part-time') },
            { value: 'contract', label: t('JobsUpdate.JobFilters.jobType.contract', 'Contract') },
            { value: 'freelance', label: t('JobsUpdate.JobFilters.jobType.freelance', 'Freelance') },
        ],
        experienceLevel: [
            { value: 'entry-level', label: t('JobsUpdate.JobFilters.experienceLevel.entryLevel', 'Entry Level') },
            { value: 'junior', label: t('JobsUpdate.JobFilters.experienceLevel.junior', 'Junior') },
            { value: 'mid-level', label: t('JobsUpdate.JobFilters.experienceLevel.midLevel', 'Mid Level') },
            { value: 'senior', label: t('JobsUpdate.JobFilters.experienceLevel.senior', 'Senior') },
            { value: 'senior-level', label: t('JobsUpdate.JobFilters.experienceLevel.seniorLevel', 'Senior Level') },
            { value: 'executive', label: t('JobsUpdate.JobFilters.experienceLevel.executive', 'Executive/Director') },
        ],
        salaryRange: [
            { value: '$40k - $60k', label: t('JobsUpdate.JobFilters.salaryRange.range1', '$40k - $60k') },
            { value: '$60k - $80k', label: t('JobsUpdate.JobFilters.salaryRange.range2', '$60k - $80k') },
            { value: '$80k - $120k', label: t('JobsUpdate.JobFilters.salaryRange.range3', '$80k - $120k') },
            { value: '$120k+', label: t('JobsUpdate.JobFilters.salaryRange.range4', '$120k+') },
        ],
        workMode: [
            { value: 'remote', label: t('JobsUpdate.JobFilters.workMode.remote', 'Remote') },
            { value: 'on-site', label: t('JobsUpdate.JobFilters.workMode.onSite', 'On-site') },
            { value: 'hybrid', label: t('JobsUpdate.JobFilters.workMode.hybrid', 'Hybrid') },
        ],
    };

    const toggleFilterSection = (filterName) => {
        setExpandedFilter(expandedFilter === filterName ? null : filterName);
    };

    const renderFilterSection = (title, key, options) => {
        const isExpanded = expandedFilter === key;

        return (
            <div className="border-b border-slate-200 last:border-b-0 pb-3 last:pb-0">
                <button onClick={() => toggleFilterSection(key)} className="w-full flex items-center justify-between py-2 hover:bg-slate-50 transition-all duration-200 rounded-lg px-2 group">
                    <span className="font-semibold text-slate-900 text-sm group-hover:text-blue-600 transition-colors duration-200">{title}</span>
                    <div className="p-1 rounded group-hover:bg-blue-100 transition-all duration-200">
                        {isExpanded ? (
                            <FaChevronUp className="text-slate-500 group-hover:text-blue-600 w-3 h-3 transition-colors duration-200" />
                        ) : (
                            <FaChevronDown className="text-slate-500 group-hover:text-blue-600 w-3 h-3 transition-colors duration-200" />
                        )}
                    </div>
                </button>

                {isExpanded && (
                    <div className="mt-2 space-y-1 px-2">
                        {options.map((option) => {
                            const optionValue = typeof option === 'object' ? option.value : option;
                            const optionLabel = typeof option === 'object' ? option.label : option;
                            const isSelected = selectedFilters[key].includes(optionValue);
                            // Get the count for this option from filterCounts prop
                            const count = filterCounts[key]?.[optionValue] || 0;

                            return (
                                <label key={optionValue} className="flex items-center justify-between cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-all duration-200 group/item">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterChange(key, optionValue)}
                                            className="w-4 h-4 text-blue-600 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500 transition-all duration-200"
                                        />
                                        <span className="text-slate-700 select-none text-sm group-hover/item:text-slate-900 transition-colors duration-200">{optionLabel}</span>
                                    </div>
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded font-medium transition-all duration-200 ${
                                            isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 group-hover/item:bg-slate-200'
                                        }`}>
                                        {count}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`lg:w-72 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white border border-slate-200 rounded-lg p-4 sticky top-20 shadow-sm">
                {/* Filter Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                        <h2 className="text-lg font-bold text-slate-900">{t('JobsUpdate.JobFilters.title', 'Filters')}</h2>
                    </div>
                    {Object.values(selectedFilters).some((arr) => arr.length > 0) && (
                        <button
                            onClick={clearAllFilters}
                            className="text-blue-600 hover:text-blue-700 font-semibold text-xs bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-all duration-200">
                            {t('JobsUpdate.JobFilters.clearAll', 'Clear All')}
                        </button>
                    )}
                </div>

                {/* Filter Sections */}
                <div className="space-y-4">
                    {renderFilterSection(t('JobsUpdate.JobFilters.jobTypeTitle', 'Job Type'), 'jobType', filterOptions.jobType)}
                    {renderFilterSection(t('JobsUpdate.JobFilters.experienceLevelTitle', 'Experience Level'), 'experienceLevel', filterOptions.experienceLevel)}
                    {renderFilterSection(t('JobsUpdate.JobFilters.workModeTitle', 'Work Mode'), 'workMode', filterOptions.workMode)}
                    {renderFilterSection(t('JobsUpdate.JobFilters.salaryRangeTitle', 'Salary Range'), 'salaryRange', filterOptions.salaryRange)}
                </div>
            </div>
        </div>
    );
};

const MyComponent = withTranslation('common')(JobFilters);
export default MyComponent;
