import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation, withTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FaSearch, FaBriefcase, FaTimes, FaSortAmountDown } from 'react-icons/fa';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import JobSearchBar from './JobSearchBar';
import JobFilters from './JobFilters';
import JobCard from './JobCard';
import JobDetailsModal from './JobDetailsModal';
import JobApplicationModal from './JobApplicationModal';
import CreateJobModal from './CreateJobModal';
import FavoritesModal from './FavoritesModal';
import { AuthContext } from '../../context/AuthContext';
import fire from '../../conf/fire';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';
import { getActiveJobs, getJobFavourites, toggleJobFavourite, getJobById } from '../../services/api/platform';

const MainJobListings = () => {
    const { t } = useTranslation('common');
    const { pathname } = useLocation();
    
    // Extract job ID from URL - only if we're on /jobs/portal/:jobId route
    const jobIdFromPath = pathname.includes('/jobs/portal/') && pathname.split('/').length === 4 
        ? pathname.split('/').slice(-1)[0] 
        : null;

    // Get user from AuthContext
    const user = useContext(AuthContext);
    
    // URL parameters handling
    const [searchParams] = useSearchParams();
    const initialSearchTerm = searchParams.get('q') || '';
    const initialLocationFilter = searchParams.get('location') || '';

    // Authentication handlers
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const authBtnHandler = () => {
        setIsAuthModalOpen(!isAuthModalOpen);
    };

    const closeAuthModal = () => {
        setIsAuthModalOpen(false);
    };

    const logout = () => {
        fire.auth().signOut();
        localStorage.removeItem('user');
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
    };

    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
    const [locationFilter, setLocationFilter] = useState(initialLocationFilter);
    const [sortBy, setSortBy] = useState('newest');
    const [selectedFilters, setSelectedFilters] = useState({
        jobType: [],
        experienceLevel: [],
        salaryRange: [],
        workMode: [],
    });
    const [showFilters, setShowFilters] = useState(false);
    const [savedJobs, setSavedJobs] = useState(new Set());
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedFilter, setExpandedFilter] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isJobApplicationModalOpen, setIsJobApplicationModalOpen] = useState(false);
    const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
    const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
    });
    const [filterCounts, setFilterCounts] = useState({});
    const jobsPerPage = 8;

    // Calculate filter counts from all available jobs
    const calculateFilterCounts = (allJobs) => {
        const counts = {
            jobType: {},
            experienceLevel: {},
            workMode: {},
            salaryRange: {},
        };

        const filterOptions = {
            jobType: ['full-time', 'part-time', 'contract', 'freelance'],
            experienceLevel: ['entry-level', 'junior', 'mid-level', 'senior', 'senior-level', 'executive'],
            workMode: ['remote', 'on-site', 'hybrid'],
            salaryRange: ['$40k - $60k', '$60k - $80k', '$80k - $120k', '$120k+'],
        };

        Object.keys(filterOptions).forEach((filterType) => {
            filterOptions[filterType].forEach((option) => {
                counts[filterType][option] = 0;
            });
        });

        allJobs.forEach((job) => {
            if (job.jobType && counts.jobType[job.jobType] !== undefined) {
                counts.jobType[job.jobType]++;
            }

            if (job.experienceLevel && counts.experienceLevel[job.experienceLevel] !== undefined) {
                counts.experienceLevel[job.experienceLevel]++;
            }

            if (job.workMode && counts.workMode[job.workMode] !== undefined) {
                counts.workMode[job.workMode]++;
            }

            const jobMinSalary = job.minSalary || 0;
            const jobMaxSalary = job.maxSalary || 0;

            if (jobMinSalary > 0 || jobMaxSalary > 0) {
                if (jobMinSalary >= 120000 || jobMaxSalary >= 120000) {
                    counts.salaryRange['$120k+']++;
                } else if ((jobMinSalary >= 80000 && jobMinSalary < 120000) || (jobMaxSalary >= 80000 && jobMaxSalary < 120000)) {
                    counts.salaryRange['$80k - $120k']++;
                } else if ((jobMinSalary >= 60000 && jobMinSalary < 80000) || (jobMaxSalary >= 60000 && jobMaxSalary < 80000)) {
                    counts.salaryRange['$60k - $80k']++;
                } else if ((jobMinSalary >= 40000 && jobMinSalary < 60000) || (jobMaxSalary >= 40000 && jobMaxSalary < 60000)) {
                    counts.salaryRange['$40k - $60k']++;
                }
            }
        });

        return counts;
    };

    // Load jobs function
    const loadJobs = async (page = 1) => {
        try {
            setLoading(true);

            const filters = {
                searchTerm: searchTerm,
                locationFilter: locationFilter,
                jobType: selectedFilters.jobType,
                workMode: selectedFilters.workMode,
                experienceLevel: selectedFilters.experienceLevel,
                salaryRange: selectedFilters.salaryRange,
            };

            const result = await getActiveJobs(page, jobsPerPage, filters);

            if (result.success) {
                setJobs(result.jobs);
                setPagination(result.pagination);
                setCurrentPage(page);

                if (result.allJobs) {
                    const counts = calculateFilterCounts(result.allJobs);
                    setFilterCounts(counts);
                }
            } else {
                console.error('Failed to load jobs:', result.error);
                alert('Failed to load jobs. Please try again.');
            }
        } catch (error) {
            console.error('Error loading jobs:', error);
            alert('An error occurred while loading jobs. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Load user's favorites when component mounts or user changes
    const loadUserFavorites = async () => {
        if (user && user.uid) {
            try {
                const jobFavorites = await getJobFavourites(user.uid);
                setSavedJobs(new Set(jobFavorites));
            } catch (error) {
                console.error('Error loading user favorites:', error);
            }
        } else {
            setSavedJobs(new Set());
        }
    };

    // Load jobs on component mount with URL parameters
    useEffect(() => {
        loadJobs(1);
        loadUserFavorites();

        if (jobIdFromPath) {
            (async () => {
                const job = await getJobById(jobIdFromPath);
                if (job) {
                    setSelectedJob(job);
                    setIsModalOpen(true);
                }
            })();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobIdFromPath]);

    // Reload favorites when user changes
    useEffect(() => {
        loadUserFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Reload jobs when filters change
    useEffect(() => {
        if (!loading) {
            loadJobs(1);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFilters]);

    // Reload jobs when search term or location changes (with debounce)
    useEffect(() => {
        if (!loading) {
            const timeoutId = setTimeout(() => {
                loadJobs(1);
            }, 500);

            return () => clearTimeout(timeoutId);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, locationFilter]);

    const handleFilterChange = (category, value) => {
        setSelectedFilters((prev) => ({
            ...prev,
            [category]: prev[category].includes(value) ? prev[category].filter((item) => item !== value) : [...prev[category], value],
        }));
    };

    const handleQuickFilter = (category, value) => {
        if (category === 'clear') {
            clearAllFilters();
            return;
        }
        setSelectedFilters((prev) => {
            const currentList = prev[category] || [];
            const isIncluded = currentList.includes(value);
            return {
                ...prev,
                [category]: isIncluded ? currentList.filter((item) => item !== value) : [...currentList, value],
            };
        });
    };

    const clearAllFilters = () => {
        setSelectedFilters({
            jobType: [],
            experienceLevel: [],
            salaryRange: [],
            workMode: [],
        });
        setSearchTerm('');
        setLocationFilter('');
    };

    const removeSpecificFilter = (category, value) => {
        setSelectedFilters((prev) => ({
            ...prev,
            [category]: prev[category].filter((v) => v !== value),
        }));
    };

    const toggleSavedJob = async (jobId) => {
        if (!user || !user.uid) {
            authBtnHandler();
            return;
        }

        try {
            const isAdded = await toggleJobFavourite(user.uid, jobId);
            setSavedJobs((prev) => {
                const newSaved = new Set(prev);
                if (isAdded) {
                    newSaved.add(jobId);
                } else {
                    newSaved.delete(jobId);
                }
                return newSaved;
            });
        } catch (error) {
            console.error('Error toggling job favorite:', error);
            alert('Failed to update favorites. Please try again.');
        }
    };

    const handleViewDetails = (job) => {
        setSelectedJob(job);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedJob(null);
    };

    const handleOpenJobApplication = (job) => {
        setSelectedJob(job);
        setIsJobApplicationModalOpen(true);
        setIsModalOpen(false);
    };

    const handleCloseJobApplicationModal = () => {
        setIsJobApplicationModalOpen(false);
    };

    const handleSubmitJob = () => {
        setIsCreateJobModalOpen(true);
    };

    const handleCloseCreateJobModal = () => {
        setIsCreateJobModalOpen(false);
    };

    const handleJobCreated = (_jobData) => {
        loadJobs(1);
    };

    const handleOpenFavorites = async () => {
        await loadUserFavorites();
        setIsFavoritesModalOpen(true);
    };

    const handleCloseFavorites = () => {
        setIsFavoritesModalOpen(false);
    };

    // Correctly assigned favorite toggle handler with state refresh
    const handleToggleFavoriteWithRefresh = async (jobId) => {
        const result = await toggleSavedJob(jobId);
        await loadUserFavorites();
        return result;
    };

    // Client-side display sorting
    const displayedJobs = useMemo(() => {
        const list = [...jobs];
        if (sortBy === 'salary-high') {
            return list.sort((a, b) => (b.maxSalary || 0) - (a.maxSalary || 0));
        }
        if (sortBy === 'salary-low') {
            return list.sort((a, b) => (a.minSalary || 0) - (b.minSalary || 0));
        }
        if (sortBy === 'company') {
            return list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
        }
        return list;
    }, [jobs, sortBy]);

    // Check if any filters are active
    const hasActiveFilters = Boolean(
        searchTerm ||
        locationFilter ||
        Object.values(selectedFilters).some((arr) => arr.length > 0)
    );

    return (
        <div className="wrapper min-h-screen bg-slate-50/50 flex flex-col">
            <HomepageNavbar user={user} authBtnHandler={authBtnHandler} logout={logout} />

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] pb-12">
                <JobSearchBar
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    locationFilter={locationFilter}
                    setLocationFilter={setLocationFilter}
                    showFilters={showFilters}
                    setShowFilters={setShowFilters}
                    onSubmitJob={handleSubmitJob}
                    onOpenFavorites={handleOpenFavorites}
                    savedJobsCount={savedJobs.size}
                    user={user}
                    onQuickFilter={handleQuickFilter}
                    onSearch={() => loadJobs(1)}
                />

                {/* Main Content Layout */}
                <div className="flex flex-col lg:flex-row gap-6 mt-2">
                    {/* Left Sidebar - Filters */}
                    <JobFilters
                        selectedFilters={selectedFilters}
                        handleFilterChange={handleFilterChange}
                        clearAllFilters={clearAllFilters}
                        expandedFilter={expandedFilter}
                        setExpandedFilter={setExpandedFilter}
                        showFilters={showFilters}
                        filterCounts={filterCounts}
                    />

                    {/* Right Content - Results & Listings */}
                    <div className="flex-1 min-w-0">
                        {/* Results Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 py-3.5 px-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-sm font-bold text-slate-900">
                                    {pagination.totalItems} {pagination.totalItems === 1 ? t('JobsUpdate.MainJobListings.jobSingular', 'job') : t('JobsUpdate.MainJobListings.jobPlural', 'jobs')} {t('JobsUpdate.MainJobListings.found', 'found')}
                                </span>
                                {pagination.totalPages > 1 && (
                                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                        {t('JobsUpdate.MainJobListings.page', 'Page')} {currentPage} {t('JobsUpdate.MainJobListings.of', 'of')} {pagination.totalPages}
                                    </span>
                                )}
                            </div>

                            {/* Sort Dropdown (CTRL-1700 Certified) */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                    <FaSortAmountDown className="w-3 h-3 text-slate-400" />
                                    {t('JobsUpdate.MainJobListings.sort', 'Sort:')}:
                                </span>
                                <div className="relative inline-block">
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="text-xs sm:text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer transition-colors">
                                        <option value="newest">{t('JobsUpdate.MainJobListings.sortNewest', 'Newest')}</option>
                                        <option value="salary-high">{t('JobsUpdate.MainJobListings.sortSalaryDesc', 'Salary ↓')}</option>
                                        <option value="salary-low">{t('JobsUpdate.MainJobListings.sortSalaryAsc', 'Salary ↑')}</option>
                                        <option value="company">{t('JobsUpdate.MainJobListings.sortCompany', 'Company')}</option>
                                        <option value="relevance">{t('JobsUpdate.MainJobListings.sortRelevance', 'Relevance')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Active Filter Chips Strip */}
                        {hasActiveFilters && (
                            <div className="flex items-center gap-2 flex-wrap mb-4 px-1">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Active:
                                </span>
                                {searchTerm && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                        <span>"{searchTerm}"</span>
                                        <button type="button" onClick={() => setSearchTerm('')} className="hover:text-blue-950">
                                            <FaTimes className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                )}
                                {locationFilter && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        <span>📍 {locationFilter}</span>
                                        <button type="button" onClick={() => setLocationFilter('')} className="hover:text-emerald-950">
                                            <FaTimes className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                )}
                                {Object.entries(selectedFilters).map(([category, values]) =>
                                    values.map((val) => (
                                        <span
                                            key={`${category}-${val}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                            <span className="capitalize">{val}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeSpecificFilter(category, val)}
                                                className="hover:text-indigo-950">
                                                <FaTimes className="w-2.5 h-2.5" />
                                            </button>
                                        </span>
                                    ))
                                )}
                                <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 underline ml-1">
                                    Reset all
                                </button>
                            </div>
                        )}

                        {/* Job Cards Listing */}
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="bg-white border border-slate-200/90 rounded-2xl p-6 animate-pulse shadow-xs">
                                        <div className="flex items-start gap-4">
                                            <div className="w-14 h-14 bg-slate-200 rounded-2xl flex-shrink-0"></div>
                                            <div className="flex-1 space-y-2.5">
                                                <div className="h-5 bg-slate-200 rounded-md w-2/5"></div>
                                                <div className="h-3.5 bg-slate-200 rounded-md w-1/4"></div>
                                                <div className="h-3.5 bg-slate-200 rounded-md w-full pt-2"></div>
                                                <div className="flex gap-2 pt-3">
                                                    <div className="h-6 bg-slate-200 rounded-lg w-20"></div>
                                                    <div className="h-6 bg-slate-200 rounded-lg w-24"></div>
                                                    <div className="h-6 bg-slate-200 rounded-lg w-28"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : displayedJobs.length === 0 ? (
                            <div className="bg-white border border-slate-200/90 rounded-2xl p-10 sm:p-14 text-center shadow-xs">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                                    <FaSearch className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">
                                    {t('JobsUpdate.MainJobListings.noJobsFound', 'No jobs found matching your criteria')}
                                </h3>
                                <p className="text-slate-600 mb-6 text-sm max-w-md mx-auto leading-relaxed">
                                    {t('JobsUpdate.MainJobListings.tryAdjusting', 'Try broadening your search keywords, resetting your filters, or browsing all available roles.')}
                                </p>
                                <button
                                    onClick={clearAllFilters}
                                    className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all duration-200 text-sm shadow-sm hover:shadow-md active:scale-95">
                                    {t('JobsUpdate.MainJobListings.clearAllFilters', 'Clear All Filters')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-4">
                                    {displayedJobs.map((job) => (
                                        <JobCard 
                                            key={job.id} 
                                            job={job} 
                                            isSaved={savedJobs.has(job.id)} 
                                            onToggleSaved={toggleSavedJob} 
                                            onViewDetails={handleViewDetails} 
                                            onAuthRequired={authBtnHandler}
                                        />
                                    ))}
                                </div>

                                {/* Pagination Controls (CTRL-1697, CTRL-1698, CTRL-1699 Certified) */}
                                {pagination.totalPages > 1 && (
                                    <div className="mt-8 flex justify-center items-center gap-2 flex-wrap">
                                        <button
                                            onClick={() => loadJobs(currentPage - 1)}
                                            disabled={!pagination.hasPreviousPage || loading}
                                            className="px-4 py-2 border border-slate-200 bg-white rounded-xl text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 text-sm font-bold shadow-xs">
                                            {t('JobsUpdate.MainJobListings.previous', 'Previous')}
                                        </button>

                                        <div className="flex items-center gap-1.5">
                                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                                let pageNum;
                                                if (pagination.totalPages <= 5) {
                                                    pageNum = i + 1;
                                                } else if (currentPage <= 3) {
                                                    pageNum = i + 1;
                                                } else if (currentPage >= pagination.totalPages - 2) {
                                                    pageNum = pagination.totalPages - 4 + i;
                                                } else {
                                                    pageNum = currentPage - 2 + i;
                                                }

                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => loadJobs(pageNum)}
                                                        disabled={loading}
                                                        className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 text-sm font-bold ${
                                                            pageNum === currentPage
                                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                                                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                                                        }`}>
                                                        {pageNum}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <button
                                            onClick={() => loadJobs(currentPage + 1)}
                                            disabled={!pagination.hasNextPage || loading}
                                            className="px-4 py-2 border border-slate-200 bg-white rounded-xl text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 text-sm font-bold shadow-xs">
                                            {t('JobsUpdate.MainJobListings.next', 'Next')}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>

            <HomepageFooter />

            {/* Job Details Drawer Modal */}
            <JobDetailsModal 
                job={selectedJob} 
                isOpen={isModalOpen} 
                onClose={handleCloseModal} 
                isSaved={selectedJob ? savedJobs.has(selectedJob.id) : false} 
                onToggleSaved={toggleSavedJob}
                onApplyNow={handleOpenJobApplication}
            />

            {/* Job Application Modal */}
            <JobApplicationModal 
                job={selectedJob} 
                isOpen={isJobApplicationModalOpen} 
                onClose={handleCloseJobApplicationModal} 
            />

            {/* Create Job Modal */}
            <CreateJobModal 
                isOpen={isCreateJobModalOpen} 
                onClose={handleCloseCreateJobModal} 
                onJobCreated={handleJobCreated} 
            />

            {/* Favorites Modal */}
            <FavoritesModal 
                isOpen={isFavoritesModalOpen} 
                onClose={handleCloseFavorites} 
                savedJobs={savedJobs} 
                jobs={jobs} 
                onToggleSaved={handleToggleFavoriteWithRefresh} 
                onViewDetails={handleViewDetails} 
                user={user} 
            />

            {/* Auth Modal */}
            {isAuthModalOpen && <AuthWrapper closeModal={closeAuthModal} />}
        </div>
    );
};

const MyComponent = withTranslation('common')(MainJobListings);
export default MyComponent;
