import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation, withTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FaSearch, FaTimes, FaSortAmountDown } from 'react-icons/fa';
import HomepageNavbar from '../Marketing/elements/HomepageNavbar';
import HomepageFooter from '../Marketing/elements/HomepageFooter';
import JobSearchBar from './JobSearchBar';
import JobFilters from './JobFilters';
import JobCard from './JobCard';
import RegionalHubsSection from './RegionalHubsSection';
import JobDetailsModal from './JobDetailsModal';
import JobApplicationModal from './JobApplicationModal';
import CreateJobModal from './CreateJobModal';
import FavoritesModal from './FavoritesModal';
import { AuthContext } from '../../context/AuthContext';
import fire from '../../conf/fire';
import { SALARY_FILTER_BANDS, formatSalaryBandLabel, salaryRowMatchesBand } from '../../services/jobs/salaryFilters';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';
import { getActiveJobs, getJobFavourites, toggleJobFavourite, getJobById, getSubscriptionStatus, checkIsEmployer } from '../../services/api/platform';

// Vacancy cards and counts are sourced only from public, active API results.
// Normalize only facts returned by the public job API. Missing salary, company,
// location, workplace, and engagement fields stay missing instead of acquiring
// demo defaults that would misrepresent a real requisition.
export function normalizeJobRecord(job) {
    if (!job || typeof job !== 'object') return null;
    const numeric = value => {
        const result = Number(value);
        return Number.isFinite(result) && result > 0 ? result : null;
    };
    const minSalary = numeric(job.salary_min ?? job.minSalary);
    const maxSalary = numeric(job.salary_max ?? job.maxSalary);
    const salaryCurrency = String(job.salary_currency ?? job.salaryCurrency ?? '').toUpperCase();
    let salary = typeof job.salary === 'string' ? job.salary.trim() : '';
    if (!salary && /^[A-Z]{3}$/.test(salaryCurrency) && (minSalary !== null || maxSalary !== null)) {
        try {
            const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: salaryCurrency, maximumFractionDigits: 0 });
            if (minSalary !== null && maxSalary !== null) salary = `${formatter.format(minSalary)} – ${formatter.format(maxSalary)}`;
            else if (minSalary !== null) salary = `${formatter.format(minSalary)}+`;
            else salary = `Up to ${formatter.format(maxSalary)}`;
        } catch {
            salary = '';
        }
    }
    let requirements = [];
    if (Array.isArray(job.requirements)) requirements = job.requirements;
    else if (typeof job.requirements === 'string') {
        try {
            const parsed = JSON.parse(job.requirements);
            if (Array.isArray(parsed)) requirements = parsed;
        } catch { /* malformed optional data is omitted */ }
    }
    const createdAt = job.created_at || job.createdAt || null;
    const postedDate = job.postedDate || (createdAt && Number.isFinite(new Date(createdAt).getTime()) ? createdAt : '');
    const applicantsValue = job.applicants_count ?? job.applicants ?? job.applicationsCount;
    const applicants = applicantsValue === null || applicantsValue === undefined || applicantsValue === ''
        ? null
        : Number.isFinite(Number(applicantsValue)) ? Number(applicantsValue) : null;

    return {
        ...job,
        id: String(job.id || ''),
        title: String(job.title || ''),
        company: String(job.company || job.company_name || job.companyName || ''),
        companyImage: String(job.companyImage || job.company_logo || job.companyLogo || ''),
        location: String(job.location || ''),
        country: String(job.country || ''),
        description: String(job.description || ''),
        type: String(job.type || job.job_type || job.jobType || ''),
        jobType: String(job.type || job.job_type || job.jobType || '').toLowerCase(),
        workMode: String(job.workMode || job.workplace_type || job.workplaceType || ''),
        experienceLevel: String(job.experienceLevel || job.experience_level || ''),
        salary,
        salary_currency: /^[A-Z]{3}$/.test(salaryCurrency) ? salaryCurrency : '',
        minSalary,
        maxSalary,
        requirements,
        postedDate,
        applicants,
    };
}

const MainJobListings = ({ isInsideDashboard: propIsInsideDashboard, showToast, sidebarCollapsed, handleSidebarToggle } = {}) => {
    const { t } = useTranslation('common');
    const { pathname } = useLocation();
    const isInsideDashboard = Boolean(propIsInsideDashboard || pathname.startsWith('/dashboard'));
    
    // Extract job ID from URL - supports both /jobs/portal/:jobId and /dashboard/jobs/portal/:jobId
    const jobIdFromPath = useMemo(() => {
        const match = pathname.match(/\/(?:dashboard\/)?jobs\/portal\/([^/?#]+)/);
        return match ? match[1] : null;
    }, [pathname]);

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
    const [jobsError, setJobsError] = useState(false);
    const [expandedFilter, setExpandedFilter] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isJobApplicationModalOpen, setIsJobApplicationModalOpen] = useState(false);
    const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
    const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);

    // Dynamic system currency state (sourced from authoritative MariaDB configuration, base default: INR / ₹)
    const [currencyConfig, setCurrencyConfig] = useState({ currency: 'INR', currencySymbol: '₹' });

    // Synchronize system default currency from authoritative platform settings
    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                const status = await getSubscriptionStatus();
                if (isMounted && status?.currency) {
                    setCurrencyConfig({
                        currency: status.currency,
                        currencySymbol: status.currencySymbol || (status.currency === 'USD' ? '$' : '₹'),
                    });
                }
            } catch {
                // Keep default INR / ₹
            }
        })();
        return () => { isMounted = false; };
    }, []);

    // Recruiter / Employer check: Only employers and admins may post jobs; hidden for candidates
    const [canPostJob, setCanPostJob] = useState(false);

    useEffect(() => {
        let active = true;
        if (!user?.uid) {
            setCanPostJob(false);
            return;
        }

        (async () => {
            try {
                const employerStatus = await checkIsEmployer(user.uid);
                if (!active) return;
                if (employerStatus) {
                    setCanPostJob(true);
                    return;
                }
                if (user?.getIdTokenResult) {
                    const tokenResult = await user.getIdTokenResult();
                    const role = String(tokenResult?.claims?.role || '').toUpperCase();
                    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
                        if (active) setCanPostJob(true);
                        return;
                    }
                }
                if (active) setCanPostJob(false);
            } catch {
                if (active) setCanPostJob(false);
            }
        })();

        return () => { active = false; };
    }, [user]);

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

    // Calculate filter counts from available jobs
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
            salaryRange: SALARY_FILTER_BANDS.map(band => band.key),
        };

        Object.keys(filterOptions).forEach((filterType) => {
            filterOptions[filterType].forEach((option) => {
                counts[filterType][option] = 0;
            });
        });

        allJobs.forEach((job) => {
            const jType = String(job.jobType || job.job_type || job.type || '').toLowerCase();
            if (counts.jobType[jType] !== undefined) {
                counts.jobType[jType]++;
            }

            const expLvl = String(job.experienceLevel || job.experience_level || '').toLowerCase();
            Object.keys(counts.experienceLevel).forEach((lvl) => {
                if (expLvl.includes(lvl)) {
                    counts.experienceLevel[lvl]++;
                }
            });

            const wMode = String(job.workMode || job.workplace_type || '').toLowerCase();
            if (wMode.includes('remote') && counts.workMode['remote'] !== undefined) {
                counts.workMode['remote']++;
            } else if (wMode.includes('hybrid') && counts.workMode['hybrid'] !== undefined) {
                counts.workMode['hybrid']++;
            } else if (wMode.includes('on-site') && counts.workMode['on-site'] !== undefined) {
                counts.workMode['on-site']++;
            }

            const salaryCurrency = String(job.salary_currency || job.salaryCurrency || '').toUpperCase();
            const jobMinSalary = Number(job.minSalary ?? job.salary_min) || 0;
            const jobMaxSalary = Number(job.maxSalary ?? job.salary_max) || 0;

            // Salary ranges compare like-for-like numeric amounts only. Never
            // mix rows denominated in another currency or without a currency.
            if (salaryCurrency === String(currencyConfig.currency).toUpperCase()) {
                SALARY_FILTER_BANDS.forEach(band => {
                    if (salaryRowMatchesBand(jobMinSalary, jobMaxSalary, band)) counts.salaryRange[band.key]++;
                });
            }
        });

        return counts;
    };

    // Only authoritative API rows become job cards. Empty results and
    // unavailable data have separate, truthful UI states; no local showcase is
    // substituted for a MariaDB read.
    const loadJobs = async (page = 1) => {
        setLoading(true);
        setJobsError(false);
        try {
            const filters = {
                searchTerm,
                locationFilter,
                jobType: selectedFilters.jobType,
                workMode: selectedFilters.workMode,
                experienceLevel: selectedFilters.experienceLevel,
                salaryRange: selectedFilters.salaryRange,
            };
            const result = await getActiveJobs(1, 100, filters);
            if (!result?.success || !Array.isArray(result.allJobs || result.jobs)) {
                throw new Error('Invalid public job response.');
            }

            const sourceRows = Array.isArray(result.allJobs) ? result.allJobs : result.jobs;
            const activeJobPool = sourceRows
                .map(row => normalizeJobRecord(row))
                .filter(job => job && job.id && job.title);
            setFilterCounts(calculateFilterCounts(activeJobPool));

            let filtered = activeJobPool;
            if (searchTerm.trim()) {
                const query = searchTerm.toLowerCase().trim();
                filtered = filtered.filter(job =>
                    job.title.toLowerCase().includes(query)
                    || job.company.toLowerCase().includes(query)
                    || job.description.toLowerCase().includes(query)
                    || job.requirements.some(requirement => String(requirement).toLowerCase().includes(query))
                );
            }
            if (locationFilter.trim()) {
                const location = locationFilter.toLowerCase().trim();
                filtered = filtered.filter(job => job.location.toLowerCase().includes(location)
                    || job.country.toLowerCase().includes(location));
            }
            if (selectedFilters.jobType.length > 0) {
                filtered = filtered.filter(job => selectedFilters.jobType.some(type =>
                    job.jobType.includes(type.toLowerCase()) || job.type.toLowerCase().includes(type.toLowerCase())));
            }
            if (selectedFilters.workMode.length > 0) {
                filtered = filtered.filter(job => selectedFilters.workMode.some(mode =>
                    job.workMode.toLowerCase().includes(mode.toLowerCase())));
            }
            if (selectedFilters.experienceLevel.length > 0) {
                filtered = filtered.filter(job => selectedFilters.experienceLevel.some(level =>
                    job.experienceLevel.toLowerCase().includes(level.toLowerCase())));
            }
            if (selectedFilters.salaryRange.length > 0) {
                filtered = filtered.filter(job => {
                    if (job.salary_currency !== String(currencyConfig.currency).toUpperCase()) return false;
                    return selectedFilters.salaryRange.some(key => {
                        const band = SALARY_FILTER_BANDS.find(item => item.key === key);
                        return band && salaryRowMatchesBand(job.minSalary, job.maxSalary, band);
                    });
                });
            }

            const totalItems = filtered.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / jobsPerPage));
            setJobs(filtered.slice((page - 1) * jobsPerPage, page * jobsPerPage));
            setPagination({ totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 });
            setCurrentPage(page);
        } catch (error) {
            // Keep database/provider details out of the browser and logs.
            console.error('[job listings]', { code: error?.code || 'JOB_LISTINGS_UNAVAILABLE' });
            setJobsError(true);
            setFilterCounts(calculateFilterCounts([]));
            setJobs([]);
            setPagination({ totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
            setCurrentPage(1);
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
                    setSelectedJob(normalizeJobRecord(job));
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
        if (sortBy === 'salary-high' || sortBy === 'salary-low') {
            const direction = sortBy === 'salary-high' ? -1 : 1;
            const activeCurrency = String(currencyConfig.currency).toUpperCase();
            return list.sort((a, b) => {
                const aMatchesCurrency = a.salary_currency === activeCurrency;
                const bMatchesCurrency = b.salary_currency === activeCurrency;
                if (aMatchesCurrency !== bMatchesCurrency) return aMatchesCurrency ? -1 : 1;
                const aAmount = sortBy === 'salary-high' ? (a.maxSalary || 0) : (a.minSalary || 0);
                const bAmount = sortBy === 'salary-high' ? (b.maxSalary || 0) : (b.minSalary || 0);
                return (aAmount - bAmount) * direction;
            });
        }
        if (sortBy === 'company') {
            return list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
        }
        return list;
    }, [jobs, sortBy, currencyConfig.currency]);

    // Check if any filters are active
    const hasActiveFilters = Boolean(
        searchTerm ||
        locationFilter ||
        Object.values(selectedFilters).some((arr) => arr.length > 0)
    );

    return (
        <div className={`${isInsideDashboard ? 'w-full' : 'rp-public-site'} min-h-screen flex flex-col bg-cuba-canvas text-cuba-ink`}>
            {/* Top Navigation Bar with active public-site styling and auth modal hook */}
            {!isInsideDashboard && <HomepageNavbar onOpenAuthModal={authBtnHandler} />}

            <main className={`flex-1 w-full ${isInsideDashboard ? 'max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} ${isInsideDashboard ? 'py-6 sm:py-8 max-lg:pt-16' : 'pt-[110px] pb-12'}`}>
                {!isInsideDashboard && <RegionalHubsSection />}
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
                    canPostJob={!isInsideDashboard && canPostJob}
                    isInsideDashboard={isInsideDashboard}
                    onQuickFilter={handleQuickFilter}
                    onSearch={() => loadJobs(1)}
                    currency={currencyConfig.currency}
                    selectedFilters={selectedFilters}
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
                        currency={currencyConfig.currency}
                    />

                    {/* Right Content - Results & Listings */}
                    <div className="flex-1 min-w-0">
                        {/* Results Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 py-3.5 px-5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-200">
                            <div className="flex items-center gap-2.5">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-sm font-bold text-slate-900">
                                    {pagination.totalItems} {pagination.totalItems === 1 ? t('JobsUpdate.MainJobListings.jobSingular', 'job') : t('JobsUpdate.MainJobListings.jobPlural', 'jobs')} {t('JobsUpdate.MainJobListings.found', 'found')}
                                </span>
                                {pagination.totalPages > 1 && (
                                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/60">
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
                                    values.map((val) => {
                                        const salaryBand = category === 'salaryRange'
                                            ? SALARY_FILTER_BANDS.find(band => band.key === val)
                                            : null;
                                        const displayLabel = salaryBand
                                            ? formatSalaryBandLabel(salaryBand, currencyConfig.currency)
                                            : val;
                                        return (
                                            <span
                                                key={`${category}-${val}`}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                                <span className="capitalize">{displayLabel}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeSpecificFilter(category, val)}
                                                    className="hover:text-indigo-950">
                                                    <FaTimes className="w-2.5 h-2.5" />
                                                </button>
                                            </span>
                                        );
                                    })
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
                        ) : jobsError ? (
                            <div className="rounded-cuba-xl border border-cuba-line bg-cuba-card p-10 text-center text-cuba-ink shadow-cuba-sm" role="alert">
                                <h3 className="text-xl font-bold">Job listings are temporarily unavailable</h3>
                                <p className="mx-auto mt-2 max-w-md text-sm text-cuba-ink-muted">The live job service could not return current listings. Please try again shortly.</p>
                                <button type="button" onClick={() => loadJobs(1)} className="cuba-btn-primary mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold">Try again</button>
                            </div>
                        ) : displayedJobs.length === 0 ? (
                            <div className="bg-white border border-slate-200/90 rounded-2xl p-10 sm:p-14 text-center shadow-xs">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                                    <FaSearch className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">
                                    {hasActiveFilters
                                        ? t('JobsUpdate.MainJobListings.noJobsFound', 'No jobs found matching your criteria')
                                        : 'No active job listings are currently available.'}
                                </h3>
                                <p className="text-slate-600 mb-6 text-sm max-w-md mx-auto leading-relaxed">
                                    {hasActiveFilters
                                        ? t('JobsUpdate.MainJobListings.tryAdjusting', 'Try broadening your search keywords, resetting your filters, or browsing all available roles.')
                                        : 'Check back later for newly published openings.'}
                                </p>
                                <button
                                    onClick={clearAllFilters}
                                    // DIR-009: this empty-state recovery CTA was the last
                                    // legacy `from-blue-600 to-indigo-600` gradient on the
                                    // candidate surface. .cuba-btn-primary owns the
                                    // gradient, white label, glow and easing, so the
                                    // hardcoded ramp and its hover:* overrides are
                                    // dropped rather than fought by specificity.
                                    className="cuba-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm active:scale-95">
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
                                            onApply={handleOpenJobApplication}
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
                                                                // DIR-009: a dense 36px pagination cell is the
                                                                // small-control case, so it takes the SOLID
                                                                // .cuba-fill-pill (--cuba-primary-fill #5949d6,
                                                                // 6.27:1 w/ white) rather than the 135deg
                                                                // gradient, whose leading stop would drop to
                                                                // 4.14:1 under a single digit. Selected state
                                                                // only; inactive pages keep the white surface.
                                                                ? 'cuba-fill-pill'
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

            {!isInsideDashboard && <HomepageFooter />}

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
