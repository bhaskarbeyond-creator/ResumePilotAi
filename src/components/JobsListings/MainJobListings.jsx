import React, { useState, useEffect, useContext } from 'react';
import { useTranslation, withTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FaSearch, FaPlus, FaBriefcase, FaRocket } from 'react-icons/fa';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import JobSearchBar from './JobSearchBar';
import JobFilters from './JobFilters';
import JobCard from './JobCard';
import JobDetailsModal from './JobDetailsModal';
import JobApplicationModal from './JobApplicationModal';
import CreateJobModal from './CreateJobModal';
import FavoritesModal from './FavoritesModal';
import { AuthContext } from '../../main';
import fire from '../../conf/fire';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';
import { getActiveJobs, getJobFavourites, toggleJobFavourite, getJobById } from '../../firestore/dbOperations';

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
    
 

    // Google Maps API key - you should move this to environment variables
    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY;

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

        // Initialize counts with database values
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

        // Count jobs for each filter option
        allJobs.forEach((job) => {
            // Count job types
            if (job.jobType && counts.jobType[job.jobType] !== undefined) {
                counts.jobType[job.jobType]++;
            }

            // Count experience levels
            if (job.experienceLevel && counts.experienceLevel[job.experienceLevel] !== undefined) {
                counts.experienceLevel[job.experienceLevel]++;
            }

            // Count work modes
            if (job.workMode && counts.workMode[job.workMode] !== undefined) {
                counts.workMode[job.workMode]++;
            }

            // Count salary ranges
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

        
            // Prepare filters for server-side processing
            const filters = {
                searchTerm: searchTerm,
                locationFilter: locationFilter,
                jobType: selectedFilters.jobType,
                workMode: selectedFilters.workMode,
                experienceLevel: selectedFilters.experienceLevel,
                salaryRange: selectedFilters.salaryRange,
            };
            

            // Fetch jobs from database with server-side filtering
            const result = await getActiveJobs(page, jobsPerPage, filters);

            if (result.success) {
                setJobs(result.jobs);
                setPagination(result.pagination);
                setCurrentPage(page);

                // Calculate and set filter counts from all available jobs
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
    }, [jobIdFromPath]); // Only run once on mount

    // Reload favorites when user changes
    useEffect(() => {
        loadUserFavorites();
    }, [user]);

    // Reload jobs when filters change
    useEffect(() => {
        // Always reload when filters change (after initial load)
        if (!loading) {
            loadJobs(1);
        }
    }, [selectedFilters]);

    // Reload jobs when search term or location changes (with debounce)
    useEffect(() => {
        // Always reload when search/location changes (after initial load)
        if (!loading) {
            const timeoutId = setTimeout(() => {
                loadJobs(1);
            }, 500); // 500ms debounce

            return () => clearTimeout(timeoutId);
        }
    }, [searchTerm, locationFilter]);

    const handleFilterChange = (category, value) => {
        setSelectedFilters((prev) => ({
            ...prev,
            [category]: prev[category].includes(value) ? prev[category].filter((item) => item !== value) : [...prev[category], value],
        }));
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

    const toggleSavedJob = async (jobId) => {
        // Check if user is authenticated
        if (!user || !user.uid) {
            authBtnHandler(); // Open auth modal
            return;
        }

        try {
            // Toggle in database
            const isAdded = await toggleJobFavourite(user.uid, jobId);
            
            // Update local state
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
        setIsModalOpen(false); // Close job details modal
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

    const handleJobCreated = (jobData) => {
        // Refresh the job list to show the new job (if it's active)
        // Note: Since new jobs are "pending" by default, they won't appear in the list
        // until an admin approves them
        loadJobs(false, true);
    };

    const handleOpenFavorites = async () => {
        // Reload favorites when opening the modal to ensure fresh data
        await loadUserFavorites();
        setIsFavoritesModalOpen(true);
    };

    const handleCloseFavorites = () => {
        setIsFavoritesModalOpen(false);
    };

    // Function to handle favorite toggle with state refresh
    const handleToggleFavoriteWithRefresh = async (jobId) => {
        const result = await toggleSavedJob(jobId);
        // Reload favorites to ensure count is accurate
        await loadUserFavorites();
        return result;
    };

    return (
            <div className="wrapper min-h-screen bg-slate-50">
                <HomepageNavbar user={user} authBtnHandler={authBtnHandler} logout={logout} />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] pb-8">
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
                    />

                    {/* Main Layout */}
                    <div className="flex flex-col lg:flex-row gap-5 mt-6">
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

                        {/* Right Content - Job Listings */}
                        <div className="flex-1">
                            {/* Results Header */}
                            <div className="flex items-center justify-between mb-4 py-3 px-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                                    <span className="text-sm font-semibold text-slate-900">
                                        {pagination.totalItems} {pagination.totalItems === 1 ? t('JobsUpdate.MainJobListings.jobSingular', 'job') : t('JobsUpdate.MainJobListings.jobPlural', 'jobs')} {t('JobsUpdate.MainJobListings.found', 'found')}
                                    </span>
                                    {pagination.totalPages > 1 && (
                                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                            {t('JobsUpdate.MainJobListings.page', 'Page')} {currentPage} {t('JobsUpdate.MainJobListings.of', 'of')} {pagination.totalPages}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-slate-600">{t('JobsUpdate.MainJobListings.sort', 'Sort:')}:</span>
                                    <select className="text-sm bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer">
                                        <option value="newest">{t('JobsUpdate.MainJobListings.sortNewest', 'Newest')}</option>
                                        <option value="salary-high">{t('JobsUpdate.MainJobListings.sortSalaryDesc', 'Salary ↓')}</option>
                                        <option value="salary-low">{t('JobsUpdate.MainJobListings.sortSalaryAsc', 'Salary ↑')}</option>
                                        <option value="company">{t('JobsUpdate.MainJobListings.sortCompany', 'Company')}</option>
                                        <option value="relevance">{t('JobsUpdate.MainJobListings.sortRelevance', 'Relevance')}</option>
                                    </select>
                                </div>
                            </div>

                            {/* Job Cards */}
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 animate-pulse shadow-sm">
                                            <div className="flex items-start space-x-3">
                                                <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
                                                <div className="flex-1 space-y-2">
                                                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                                                    <div className="h-3 bg-slate-200 rounded w-full"></div>
                                                    <div className="flex gap-2 mt-3">
                                                        <div className="h-5 bg-slate-200 rounded w-16"></div>
                                                        <div className="h-5 bg-slate-200 rounded w-20"></div>
                                                        <div className="h-5 bg-slate-200 rounded w-24"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : jobs.length === 0 ? (
                                <div className="bg-white border border-slate-200 rounded-lg p-8 text-center shadow-sm">
                                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                                        <FaSearch className="w-6 h-6 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-2">{t('JobsUpdate.MainJobListings.noJobsFound', 'No jobs found')}</h3>
                                    <p className="text-slate-600 mb-6 text-sm max-w-sm mx-auto">{t('JobsUpdate.MainJobListings.tryAdjusting', 'Try adjusting your search criteria or filters to discover more opportunities.')}</p>
                                    <button
                                        onClick={clearAllFilters}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 text-sm shadow-sm">
                                        {t('JobsUpdate.MainJobListings.clearAllFilters', 'Clear All Filters')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        {jobs.map((job) => (
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

                                    {/* Pagination Controls */}
                                    {pagination.totalPages > 1 && (
                                        <div className="mt-6 flex justify-center items-center gap-2">
                                            <button
                                                onClick={() => loadJobs(currentPage - 1)}
                                                disabled={!pagination.hasPreviousPage || loading}
                                                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium">
                                                {t('JobsUpdate.MainJobListings.previous', 'Previous')}
                                            </button>

                                            <div className="flex items-center gap-1">
                                                {/* Page numbers */}
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
                                                            className={`px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium ${
                                                                pageNum === currentPage ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                                                            }`}>
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                onClick={() => loadJobs(currentPage + 1)}
                                                disabled={!pagination.hasNextPage || loading}
                                                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium">
                                                {t('JobsUpdate.MainJobListings.next', 'Next')}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <HomepageFooter />

                {/* Job Details Modal */}
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
                <CreateJobModal isOpen={isCreateJobModalOpen} onClose={handleCloseCreateJobModal} onJobCreated={handleJobCreated} />

                {/* Favorites Modal */}
                <FavoritesModal isOpen={isFavoritesModalOpen} onClose={handleCloseFavorites} savedJobs={savedJobs} jobs={jobs} onToggleSaved={toggleSavedJob} onViewDetails={handleViewDetails} user={user} />

                {/* Auth Modal */}
                {isAuthModalOpen && <AuthWrapper closeModal={closeAuthModal} />}
            </div>
    );
};

const MyComponent = withTranslation('common')(MainJobListings);
export default MyComponent;
