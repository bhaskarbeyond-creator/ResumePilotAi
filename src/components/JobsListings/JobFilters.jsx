import React, { useState } from 'react';
import { FaChevronDown, FaChevronUp, FaBriefcase, FaGraduationCap, FaLaptop, FaDollarSign, FaFilter, FaTrashAlt } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';

const JobFilters = ({
    selectedFilters,
    handleFilterChange,
    clearAllFilters,
    expandedFilter,
    setExpandedFilter,
    showFilters,
    filterCounts = {},
    currency = 'USD',
    currencySymbol = '$',
    t,
}) => {
    // Multi-section expanded state - open Job Type and Work Mode by default for immediate discoverability
    const [openSections, setOpenSections] = useState({
        jobType: true,
        workMode: true,
        experienceLevel: true,
        salaryRange: false,
    });

    const filterOptions = {
        jobType: [
            { value: 'full-time', label: t('JobsUpdate.JobFilters.jobType.fullTime', 'Full-time') },
            { value: 'part-time', label: t('JobsUpdate.JobFilters.jobType.partTime', 'Part-time') },
            { value: 'contract', label: t('JobsUpdate.JobFilters.jobType.contract', 'Contract') },
            { value: 'freelance', label: t('JobsUpdate.JobFilters.jobType.freelance', 'Freelance') },
        ],
        workMode: [
            { value: 'remote', label: t('JobsUpdate.JobFilters.workMode.remote', 'Remote') },
            { value: 'hybrid', label: t('JobsUpdate.JobFilters.workMode.hybrid', 'Hybrid') },
            { value: 'on-site', label: t('JobsUpdate.JobFilters.workMode.onSite', 'On-site') },
        ],
        experienceLevel: [
            { value: 'entry-level', label: t('JobsUpdate.JobFilters.experienceLevel.entryLevel', 'Entry Level') },
            { value: 'junior', label: t('JobsUpdate.JobFilters.experienceLevel.junior', 'Junior') },
            { value: 'mid-level', label: t('JobsUpdate.JobFilters.experienceLevel.midLevel', 'Mid Level') },
            { value: 'senior', label: t('JobsUpdate.JobFilters.experienceLevel.senior', 'Senior') },
            { value: 'senior-level', label: t('JobsUpdate.JobFilters.experienceLevel.seniorLevel', 'Senior Level') },
            { value: 'executive', label: t('JobsUpdate.JobFilters.experienceLevel.executive', 'Executive / Director') },
        ],
        salaryRange: [
            { value: '$40k - $60k', label: currencySymbol && currencySymbol !== '$' ? `${currencySymbol}40k - ${currencySymbol}60k` : t('JobsUpdate.JobFilters.salaryRange.range1', '$40k - $60k') },
            { value: '$60k - $80k', label: currencySymbol && currencySymbol !== '$' ? `${currencySymbol}60k - ${currencySymbol}80k` : t('JobsUpdate.JobFilters.salaryRange.range2', '$60k - $80k') },
            { value: '$80k - $120k', label: currencySymbol && currencySymbol !== '$' ? `${currencySymbol}80k - ${currencySymbol}120k` : t('JobsUpdate.JobFilters.salaryRange.range3', '$80k - $120k') },
            { value: '$120k+', label: currencySymbol && currencySymbol !== '$' ? `${currencySymbol}120k+` : t('JobsUpdate.JobFilters.salaryRange.range4', '$120k+') },
        ],
    };

    const sectionIcons = {
        jobType: FaBriefcase,
        workMode: FaLaptop,
        experienceLevel: FaGraduationCap,
        salaryRange: FaDollarSign,
    };

    const toggleFilterSection = (filterName) => {
        setOpenSections((prev) => ({
            ...prev,
            [filterName]: !prev[filterName],
        }));
        if (setExpandedFilter) {
            setExpandedFilter(expandedFilter === filterName ? null : filterName);
        }
    };

    const totalActiveFilters = Object.values(selectedFilters).reduce(
        (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
        0
    );

    const renderFilterSection = (title, key, options) => {
        const isExpanded = openSections[key] ?? (expandedFilter === key);
        const Icon = sectionIcons[key] || FaFilter;
        const activeCountInSection = selectedFilters[key]?.length || 0;

        return (
            <div className="border-b border-slate-100 last:border-b-0 pb-4 last:pb-0">
                <button
                    type="button"
                    onClick={() => toggleFilterSection(key)}
                    className="w-full flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-slate-50 transition-all duration-200 group text-left">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 flex items-center justify-center transition-colors">
                            <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">
                            {title}
                        </span>
                        {activeCountInSection > 0 && (
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                                {activeCountInSection}
                            </span>
                        )}
                    </div>
                    <div className="p-1 rounded-md text-slate-400 group-hover:text-blue-600 transition-colors">
                        {isExpanded ? <FaChevronUp className="w-3 h-3" /> : <FaChevronDown className="w-3 h-3" />}
                    </div>
                </button>

                {isExpanded && (
                    <div className="mt-2.5 space-y-1 pl-2 pr-1">
                        {options.map((option) => {
                            const optionValue = typeof option === 'object' ? option.value : option;
                            const optionLabel = typeof option === 'object' ? option.label : option;
                            const isSelected = selectedFilters[key]?.includes(optionValue);
                            const count = filterCounts[key]?.[optionValue] || 0;

                            return (
                                <label
                                    key={optionValue}
                                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all duration-150 select-none group/item ${
                                        isSelected
                                            ? 'bg-blue-50/80 border border-blue-200/80 text-blue-900 font-medium shadow-2xs'
                                            : 'hover:bg-slate-50 border border-transparent text-slate-700'
                                    }`}>
                                    <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleFilterChange(key, optionValue)}
                                            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 focus:ring-offset-0 transition-colors cursor-pointer accent-blue-600"
                                        />
                                        <span className={`text-sm truncate ${isSelected ? 'font-semibold text-blue-900' : 'group-hover/item:text-slate-900'}`}>
                                            {optionLabel}
                                        </span>
                                    </div>
                                    <span
                                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold transition-all duration-150 ${
                                            isSelected
                                                ? 'bg-blue-200/70 text-blue-800'
                                                : 'bg-slate-100 text-slate-500 group-hover/item:bg-slate-200/80'
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
        <aside className={`lg:w-72 flex-shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sticky top-24 shadow-sm hover:shadow-md transition-all duration-200 max-h-[calc(100vh-7rem)] flex flex-col">
                {/* Filter Card Header */}
                <div className="flex-shrink-0 flex items-center justify-between pb-3.5 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                            <FaFilter className="w-3.5 h-3.5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 leading-tight">
                                {t('JobsUpdate.JobFilters.title', 'Filter Jobs')}
                            </h2>
                            <p className="text-[11px] text-slate-500 font-medium">
                                {totalActiveFilters > 0
                                    ? `${totalActiveFilters} active filter${totalActiveFilters === 1 ? '' : 's'}`
                                    : t('JobsUpdate.JobFilters.refineResults', 'Refine your search')}
                            </p>
                        </div>
                    </div>

                    {totalActiveFilters > 0 && (
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-all duration-150">
                            <FaTrashAlt className="w-2.5 h-2.5" />
                            <span>{t('JobsUpdate.JobFilters.clearAll', 'Clear All')}</span>
                        </button>
                    )}
                </div>

                {/* Filter Sections - Independent Scrollable Container */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                    {renderFilterSection(t('JobsUpdate.JobFilters.jobTypeTitle', 'Job Type'), 'jobType', filterOptions.jobType)}
                    {renderFilterSection(t('JobsUpdate.JobFilters.workModeTitle', 'Work Mode'), 'workMode', filterOptions.workMode)}
                    {renderFilterSection(t('JobsUpdate.JobFilters.experienceLevelTitle', 'Experience Level'), 'experienceLevel', filterOptions.experienceLevel)}
                    {renderFilterSection(t('JobsUpdate.JobFilters.salaryRangeTitle', 'Salary Range'), 'salaryRange', filterOptions.salaryRange)}
                </div>
            </div>
        </aside>
    );
};

const MyComponent = withTranslation('common')(JobFilters);
export default MyComponent;
