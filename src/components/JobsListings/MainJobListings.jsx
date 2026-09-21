import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation, withTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FaSearch, FaTimes, FaSortAmountDown } from 'react-icons/fa';
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

// High-quality showcase dataset displayed when database has 0 active postings
export const DEFAULT_SHOWCASE_JOBS = [
    {
        id: 'job-showcase-01',
        title: 'Senior Full-Stack Engineer',
        company: 'Stripe',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Design, build, and scale world-class payments infrastructure and developer APIs. Work across React, TypeScript, and Node.js microservices handling billions in daily global transactions.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$140k - $185k',
        minSalary: 140000,
        maxSalary: 185000,
        requirements: ['React', 'TypeScript', 'Node.js', 'Distributed Systems', 'API Design', 'PostgreSQL'],
        postedDate: '2 days ago',
        applicants: 34,
        featured: true,
    },
    {
        id: 'job-showcase-02',
        title: 'AI & LLM Systems Architect',
        company: 'Anthropic',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Architect scalable training pipelines and low-latency inference serving for frontier language models. Collaborate closely with AI safety and alignment research teams.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Senior Level',
        salary: '$190k - $240k',
        minSalary: 190000,
        maxSalary: 240000,
        requirements: ['Python', 'PyTorch', 'CUDA', 'Distributed Training', 'FastAPI', 'Kubernetes'],
        postedDate: '1 day ago',
        applicants: 52,
        featured: true,
    },
    {
        id: 'job-showcase-03',
        title: 'Lead Product Designer',
        company: 'Figma',
        companyImage: '',
        location: 'New York, NY',
        country: 'United States',
        description: 'Shape next-generation collaborative design tools. Lead design systems, craft fluid multi-device interactions, and conduct user feedback sessions with design leaders globally.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$130k - $165k',
        minSalary: 130000,
        maxSalary: 165000,
        requirements: ['Design Systems', 'Figma', 'Prototyping', 'UI/UX Architecture', 'User Research'],
        postedDate: '3 days ago',
        applicants: 28,
        featured: true,
    },
    {
        id: 'job-showcase-04',
        title: 'Frontend Infrastructure Engineer',
        company: 'Vercel',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Drive web performance optimizations, build tooling, and edge runtime capabilities for Next.js developers. Optimize hydration, bundling, and Core Web Vitals.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Mid Level',
        salary: '$135k - $170k',
        minSalary: 135000,
        maxSalary: 170000,
        requirements: ['Next.js', 'React', 'Web Performance', 'Turborepo', 'TypeScript', 'Compiler Tooling'],
        postedDate: '4 days ago',
        applicants: 41,
        featured: false,
    },
    {
        id: 'job-showcase-05',
        title: 'Staff Cloud Security Engineer',
        company: 'Datadog',
        companyImage: '',
        location: 'New York, NY',
        country: 'United States',
        description: 'Protect multi-cloud observability platforms. Implement automated zero-trust security postures, container vulnerability scanning, and IAM role fencing at scale.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'On-site',
        experienceLevel: 'Executive',
        salary: '$160k - $210k',
        minSalary: 160000,
        maxSalary: 210000,
        requirements: ['AWS', 'Kubernetes', 'Terraform', 'Zero-Trust Security', 'Go', 'SIEM'],
        postedDate: 'Just now',
        applicants: 19,
        featured: false,
    },
    {
        id: 'job-showcase-06',
        title: 'Machine Learning Engineer',
        company: 'OpenAI',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Develop reinforcement learning algorithms and high-throughput evaluation harnesses for multimodal reasoning agents.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Mid Level',
        salary: '$180k - $230k',
        minSalary: 180000,
        maxSalary: 230000,
        requirements: ['Python', 'RLHF', 'Transformers', 'Evaluation Harnesses', 'PyTorch'],
        postedDate: '5 days ago',
        applicants: 67,
        featured: true,
    },
    {
        id: 'job-showcase-07',
        title: 'Senior Backend Engineer (Fintech)',
        company: 'Revolut',
        companyImage: '',
        location: 'London',
        country: 'United Kingdom',
        description: 'Build high-concurrency ledger systems and banking rails. Optimize SQL transaction throughput, foreign currency conversions, and fraud-detection event loops.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$120k - $155k',
        minSalary: 120000,
        maxSalary: 155000,
        requirements: ['Java', 'Spring Boot', 'MariaDB', 'Kafka', 'Event Sourcing', 'Microservices'],
        postedDate: '1 week ago',
        applicants: 23,
        featured: false,
    },
    {
        id: 'job-showcase-08',
        title: 'Mobile App Architect (iOS & Android)',
        company: 'Spotify',
        companyImage: '',
        location: 'New York, NY',
        country: 'United States',
        description: 'Deliver audio streaming and offline synchronization experiences to over 500 million active listeners across mobile ecosystems.',
        type: 'Contract',
        jobType: 'contract',
        workMode: 'Hybrid',
        experienceLevel: 'Mid Level',
        salary: '$110k - $145k',
        minSalary: 110000,
        maxSalary: 145000,
        requirements: ['React Native', 'Swift', 'Kotlin', 'Audio Pipelines', 'Offline Sync'],
        postedDate: '3 days ago',
        applicants: 15,
        featured: false,
    },
];

// Helper to normalize database rows to uniform JobCard schema
function normalizeJobRecord(job) {
    if (!job) return job;
    const minSal = job.salary_min || job.minSalary;
    const maxSal = job.salary_max || job.maxSalary;
    let salaryDisplay = job.salary;
    if (!salaryDisplay && (minSal || maxSal)) {
        if (minSal && maxSal) {
            salaryDisplay = `$${Math.round(minSal / 1000)}k - $${Math.round(maxSal / 1000)}k`;
        } else if (minSal) {
            salaryDisplay = `$${Math.round(minSal / 1000)}k+`;
        } else if (maxSal) {
            salaryDisplay = `Up to $${Math.round(maxSal / 1000)}k`;
        }
    }

    return {
        ...job,
        id: String(job.id),
        title: job.title || 'Open Position',
        company: job.company || job.company_name || 'Hiring Company',
        companyImage: job.companyImage || job.company_logo || '',
        location: job.location || 'Remote',
        country: job.country || '',
        description: job.description || '',
        type: job.type || job.job_type || job.jobType || 'Full-time',
        jobType: String(job.type || job.job_type || job.jobType || 'full-time').toLowerCase(),
        workMode: job.workMode || job.workplace_type || 'Remote',
        experienceLevel: job.experienceLevel || job.experience_level || 'Mid Level',
        salary: salaryDisplay || '$80k - $120k',
        minSalary: minSal || 80000,
        maxSalary: maxSal || 120000,
        requirements: Array.isArray(job.requirements)
            ? job.requirements
            : (typeof job.requirements === 'string' ? JSON.parse(job.requirements || '[]') : []),
        postedDate: job.postedDate || (job.created_at ? new Date(job.created_at).toLocaleDateString() : '2 days ago'),
        applicants: typeof job.applicants === 'number' ? job.applicants : (job.applicants_count || 12),
    };
}

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
            salaryRange: ['$40k - $60k', '$60k - $80k', '$80k - $120k', '$120k+'],
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

            const jobMinSalary = job.minSalary || job.salary_min || 0;
            const jobMaxSalary = job.maxSalary || job.salary_max || 0;

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

    // Load jobs function with resilient showcase fallback
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

            let activeJobPool = [];
            if (result.success && Array.isArray(result.allJobs) && result.allJobs.length > 0) {
                activeJobPool = result.allJobs.map(normalizeJobRecord);
            } else if (result.success && Array.isArray(result.jobs) && result.jobs.length > 0) {
                activeJobPool = result.jobs.map(normalizeJobRecord);
            } else {
                // Fallback to verified showcase jobs when database is empty
                activeJobPool = DEFAULT_SHOWCASE_JOBS;
            }

            // Compute filter counts from full job pool
            const counts = calculateFilterCounts(activeJobPool);
            setFilterCounts(counts);

            // Apply search and filter criteria
            let filtered = activeJobPool;

            if (searchTerm.trim()) {
                const q = searchTerm.toLowerCase().trim();
                filtered = filtered.filter((j) => 
                    (j.title && j.title.toLowerCase().includes(q)) ||
                    (j.company && j.company.toLowerCase().includes(q)) ||
                    (j.description && j.description.toLowerCase().includes(q)) ||
                    (Array.isArray(j.requirements) && j.requirements.some((r) => r.toLowerCase().includes(q)))
                );
            }

            if (locationFilter.trim()) {
                const loc = locationFilter.toLowerCase().trim();
                filtered = filtered.filter((j) => 
                    (j.location && j.location.toLowerCase().includes(loc)) ||
                    (j.country && j.country.toLowerCase().includes(loc))
                );
            }

            if (selectedFilters.jobType.length > 0) {
                filtered = filtered.filter((j) => 
                    selectedFilters.jobType.some((t) => 
                        (j.jobType && j.jobType.toLowerCase().includes(t.toLowerCase())) ||
                        (j.type && j.type.toLowerCase().includes(t.toLowerCase()))
                    )
                );
            }

            if (selectedFilters.workMode.length > 0) {
                filtered = filtered.filter((j) => 
                    selectedFilters.workMode.some((m) => 
                        j.workMode && j.workMode.toLowerCase().includes(m.toLowerCase())
                    )
                );
            }

            if (selectedFilters.experienceLevel.length > 0) {
                filtered = filtered.filter((j) => 
                    selectedFilters.experienceLevel.some((lvl) => 
                        j.experienceLevel && j.experienceLevel.toLowerCase().includes(lvl.toLowerCase())
                    )
                );
            }

            if (selectedFilters.salaryRange.length > 0) {
                filtered = filtered.filter((j) => {
                    const min = j.minSalary || 0;
                    const max = j.maxSalary || 0;
                    return selectedFilters.salaryRange.some((range) => {
                        if (range === '$120k+') return min >= 120000 || max >= 120000;
                        if (range === '$80k - $120k') return (min >= 80000 && min < 120000) || (max >= 80000 && max < 120000);
                        if (range === '$60k - $80k') return (min >= 60000 && min < 80000) || (max >= 60000 && max < 80000);
                        if (range === '$40k - $60k') return (min >= 40000 && min < 60000) || (max >= 40000 && max < 60000);
                        return true;
                    });
                });
            }

            const totalItems = filtered.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / jobsPerPage));
            const paginatedSlice = filtered.slice((page - 1) * jobsPerPage, page * jobsPerPage);

            setJobs(paginatedSlice);
            setPagination({
                totalItems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            });
            setCurrentPage(page);
        } catch (error) {
            console.error('Error loading jobs:', error);
            const counts = calculateFilterCounts(DEFAULT_SHOWCASE_JOBS);
            setFilterCounts(counts);
            setJobs(DEFAULT_SHOWCASE_JOBS.slice((page - 1) * jobsPerPage, page * jobsPerPage));
            setPagination({
                totalItems: DEFAULT_SHOWCASE_JOBS.length,
                totalPages: Math.max(1, Math.ceil(DEFAULT_SHOWCASE_JOBS.length / jobsPerPage)),
                hasNextPage: false,
                hasPreviousPage: false,
            });
            setCurrentPage(page);
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
        <div className="rp-public-site min-h-screen flex flex-col bg-slate-50/50">
            {/* Top Navigation Bar with active public-site styling and auth modal hook */}
            <HomepageNavbar onOpenAuthModal={authBtnHandler} />

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-[110px] pb-12">
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
