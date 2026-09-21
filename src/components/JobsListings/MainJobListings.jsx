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
import { getActiveJobs, getJobFavourites, toggleJobFavourite, getJobById, getSubscriptionStatus, checkIsEmployer } from '../../services/api/platform';

// High-quality showcase dataset displayed when database has 0 active postings
export const DEFAULT_SHOWCASE_JOBS = [
    {
        id: 'job-str-01',
        title: 'Senior Full-Stack Engineer (Payments Engine)',
        company: 'Stripe',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Design and build high-reliability payment APIs and developer infrastructure. Work across modern React frontends and distributed Node.js/Go services processing hundreds of billions in global commerce volume.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$155k - $195k',
        minSalary: 155000,
        maxSalary: 195000,
        requirements: ['React', 'TypeScript', 'Node.js', 'Distributed Systems', 'PostgreSQL', 'API Design'],
        postedDate: '2 days ago',
        applicants: 42,
        featured: true,
    },
    {
        id: 'job-ant-02',
        title: 'AI & LLM Systems Infrastructure Architect',
        company: 'Anthropic',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Lead the architecture of low-latency inference serving and scalable model evaluation pipelines for frontier generative models. Collaborate with safety research and core product engineering teams.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Senior Level',
        salary: '$190k - $250k',
        minSalary: 190000,
        maxSalary: 250000,
        requirements: ['Python', 'PyTorch', 'CUDA', 'FastAPI', 'Kubernetes', 'LLM Serving'],
        postedDate: '1 day ago',
        applicants: 67,
        featured: true,
    },
    {
        id: 'job-fig-03',
        title: 'Staff Product Designer (Design Systems)',
        company: 'Figma',
        companyImage: '',
        location: 'New York, NY',
        country: 'United States',
        description: 'Craft the next generation of collaborative canvas tools and design token specifications used by millions of designers and developers worldwide. Define design patterns and micro-interactions.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Lead / Executive',
        salary: '$145k - $180k',
        minSalary: 145000,
        maxSalary: 180000,
        requirements: ['Figma', 'Design Systems', 'Design Tokens', 'Prototyping', 'User Research', 'UI/UX'],
        postedDate: '3 days ago',
        applicants: 31,
        featured: true,
    },
    {
        id: 'job-ver-04',
        title: 'Lead Frontend Infrastructure Engineer (Next.js)',
        company: 'Vercel',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Push the frontier of web performance, edge server rendering, and compiler optimizations for Next.js and the Vercel Edge Network. Drive Core Web Vitals tooling and hydration efficiency.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$160k - $210k',
        minSalary: 160000,
        maxSalary: 210000,
        requirements: ['Next.js', 'React', 'Turbopack', 'Rust', 'TypeScript', 'Web Performance'],
        postedDate: '4 days ago',
        applicants: 53,
        featured: true,
    },
    {
        id: 'job-lin-05',
        title: 'Senior Frontend & Interactions Engineer',
        company: 'Linear',
        companyImage: '',
        location: 'London',
        country: 'United Kingdom',
        description: 'Build lightning-fast, keyboard-first desktop and web software. Obsess over 120fps animations, client-side sync engines, and flawless craftsmanship in project planning and issue tracking.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$135k - $175k',
        minSalary: 135000,
        maxSalary: 175000,
        requirements: ['TypeScript', 'React', 'WebGL', 'State Synchronization', 'IndexedDB', 'TailwindCSS'],
        postedDate: '5 days ago',
        applicants: 48,
        featured: true,
    },
    {
        id: 'job-raz-06',
        title: 'Principal Backend Architect (Banking Platform)',
        company: 'Razorpay',
        companyImage: '',
        location: 'Bengaluru',
        country: 'India',
        description: 'Scale banking rails, merchant settlements, and UPI transaction processing across millions of businesses. Lead architectural decisions for fault-tolerant, double-entry financial ledgers.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Lead / Executive',
        salary: '$120k - $160k',
        minSalary: 120000,
        maxSalary: 160000,
        requirements: ['Golang', 'Java', 'MariaDB', 'Kafka', 'Redis', 'High Concurrency'],
        postedDate: '2 days ago',
        applicants: 89,
        featured: true,
    },
    {
        id: 'job-can-07',
        title: 'Senior UX / UI Product Designer',
        company: 'Canva',
        companyImage: '',
        location: 'Sydney',
        country: 'Australia',
        description: 'Design intuitive, accessible graphic creation tools for enterprise teams. Work on collaborative templates, asset management, and AI-assisted generation workflows.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$125k - $155k',
        minSalary: 125000,
        maxSalary: 155000,
        requirements: ['Figma', 'Visual Design', 'Design Systems', 'Micro-interactions', 'Information Architecture'],
        postedDate: '1 week ago',
        applicants: 27,
        featured: false,
    },
    {
        id: 'job-rev-08',
        title: 'DevOps & Cloud Site Reliability Engineer',
        company: 'Revolut',
        companyImage: '',
        location: 'London',
        country: 'United Kingdom',
        description: 'Maintain 99.999% availability for multi-region financial infrastructure on AWS and GCP. Manage Terraform GitOps, Kubernetes clusters, and automated chaos engineering drills.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Senior Level',
        salary: '$115k - $150k',
        minSalary: 115000,
        maxSalary: 150000,
        requirements: ['Kubernetes', 'Terraform', 'AWS', 'Docker', 'Prometheus', 'CI/CD Pipelines'],
        postedDate: '3 days ago',
        applicants: 36,
        featured: false,
    },
    {
        id: 'job-dat-09',
        title: 'Senior Data Engineer (Distributed Telemetry)',
        company: 'Datadog',
        companyImage: '',
        location: 'Boston, MA',
        country: 'United States',
        description: 'Construct real-time streaming analytics pipelines processing petabytes of log, trace, and metric events every second. Optimize ClickHouse, Kafka, and Apache Flink consumers.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$140k - $185k',
        minSalary: 140000,
        maxSalary: 185000,
        requirements: ['Golang', 'Python', 'Kafka', 'ClickHouse', 'Flink', 'Distributed Systems'],
        postedDate: '4 days ago',
        applicants: 22,
        featured: false,
    },
    {
        id: 'job-not-10',
        title: 'Full-Stack Software Engineer (AI Experiences)',
        company: 'Notion',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Build next-generation knowledge management and AI-augmented workspace features. Work seamlessly across React client editors and backend search indexing services.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Mid Level',
        salary: '$140k - $180k',
        minSalary: 140000,
        maxSalary: 180000,
        requirements: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Elasticsearch', 'Vector Search'],
        postedDate: '2 days ago',
        applicants: 58,
        featured: false,
    },
    {
        id: 'job-spo-11',
        title: 'Mobile Application Engineer (iOS & React Native)',
        company: 'Spotify',
        companyImage: '',
        location: 'Stockholm',
        country: 'Sweden',
        description: 'Develop audio playback and offline synchronization capabilities for over 500 million active listeners. Optimize memory footprint and battery efficiency.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Mid Level',
        salary: '$105k - $140k',
        minSalary: 105000,
        maxSalary: 140000,
        requirements: ['Swift', 'iOS SDK', 'React Native', 'TypeScript', 'Audio Core', 'GraphQL'],
        postedDate: '6 days ago',
        applicants: 45,
        featured: false,
    },
    {
        id: 'job-air-12',
        title: 'Senior Security Operations & AppSec Engineer',
        company: 'Airbnb',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Safeguard candidate and guest data. Conduct threat modeling, penetration testing, and automate continuous security code analysis in high-velocity deployment pipelines.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$150k - $190k',
        minSalary: 150000,
        maxSalary: 190000,
        requirements: ['AppSec', 'Threat Modeling', 'OAuth / OIDC', 'Cloud Security', 'SAST/DAST', 'Python'],
        postedDate: '3 days ago',
        applicants: 19,
        featured: false,
    },
    {
        id: 'job-goo-13',
        title: 'Solutions Architect (Enterprise Cloud Migration)',
        company: 'Google Cloud',
        companyImage: '',
        location: 'Chicago, IL',
        country: 'United States',
        description: 'Partner with Fortune 500 engineering leaders to architect scalable cloud-native migrations on Google Kubernetes Engine, BigQuery, and Anthos multi-cloud.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Lead / Executive',
        salary: '$165k - $215k',
        minSalary: 165000,
        maxSalary: 215000,
        requirements: ['Cloud Architecture', 'GCP', 'Kubernetes', 'Terraform', 'Technical Consulting', 'DevOps'],
        postedDate: '1 day ago',
        applicants: 38,
        featured: true,
    },
    {
        id: 'job-sho-14',
        title: 'Frontend Developer (Merchant Admin Experiences)',
        company: 'Shopify',
        companyImage: '',
        location: 'Toronto',
        country: 'Canada',
        description: 'Build high-converting storefront analytics and store administration dashboards used by millions of merchants. Utilize React, Polaris design system, and GraphQL.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Mid Level',
        salary: '$110k - $145k',
        minSalary: 110000,
        maxSalary: 145000,
        requirements: ['React', 'TypeScript', 'GraphQL', 'CSS Modules', 'Design Systems', 'Web Standards'],
        postedDate: '4 days ago',
        applicants: 61,
        featured: false,
    },
    {
        id: 'job-swi-15',
        title: 'Staff Machine Learning Engineer (Dispatch & Routing)',
        company: 'Swiggy',
        companyImage: '',
        location: 'Bengaluru',
        country: 'India',
        description: 'Optimize real-time hyperlocal dispatch, ETA prediction, and fleet routing algorithms handling millions of daily on-demand delivery orders.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'On-site',
        experienceLevel: 'Senior Level',
        salary: '$95k - $135k',
        minSalary: 95000,
        maxSalary: 135000,
        requirements: ['Python', 'Machine Learning', 'Reinforcement Learning', 'Spark', 'Kafka', 'FastAPI'],
        postedDate: '2 days ago',
        applicants: 73,
        featured: false,
    },
    {
        id: 'job-git-16',
        title: 'Technical Writer & Developer Documentation Lead',
        company: 'GitHub',
        companyImage: '',
        location: 'Remote',
        country: 'United States',
        description: 'Author authoritative guides, interactive code samples, and comprehensive API specifications for GitHub Actions, Copilot extensibility, and security tooling.',
        type: 'Contract',
        jobType: 'contract',
        workMode: 'Remote',
        experienceLevel: 'Mid Level',
        salary: '$85k - $115k',
        minSalary: 85000,
        maxSalary: 115000,
        requirements: ['Technical Writing', 'Markdown', 'API Documentation', 'Git & GitHub', 'JavaScript', 'Developer Tools'],
        postedDate: '5 days ago',
        applicants: 29,
        featured: false,
    },
    {
        id: 'job-atl-17',
        title: 'Junior Software Engineer (Cloud Core)',
        company: 'Atlassian',
        companyImage: '',
        location: 'Bengaluru',
        country: 'India',
        description: 'Join the Core Cloud Platform team. Contribute to high-scale microservices, automated unit/integration test suites, and internal developer experience tooling.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Entry Level',
        salary: '$45k - $65k',
        minSalary: 45000,
        maxSalary: 65000,
        requirements: ['Java', 'Python', 'Git', 'Data Structures', 'REST APIs', 'Spring Boot'],
        postedDate: '1 week ago',
        applicants: 114,
        featured: false,
    },
    {
        id: 'job-fre-18',
        title: 'Prompt Engineering & Benchmark Specialist',
        company: 'Frontier AI Labs',
        companyImage: '',
        location: 'Remote Worldwide',
        country: 'Global',
        description: 'Design comprehensive reasoning evaluation datasets, write adversarial validation prompts, and benchmark frontier language models against coding benchmarks.',
        type: 'Freelance',
        jobType: 'freelance',
        workMode: 'Remote',
        experienceLevel: 'Mid Level',
        salary: '$60k - $85k',
        minSalary: 60000,
        maxSalary: 85000,
        requirements: ['Python', 'Prompt Engineering', 'LLM Evaluation', 'JSON Schema', 'Quality Assurance'],
        postedDate: '3 days ago',
        applicants: 39,
        featured: false,
    },
    {
        id: 'job-msf-19',
        title: 'Senior Cloud Security Architect (Azure Sentinel)',
        company: 'Microsoft',
        companyImage: '',
        location: 'Redmond, WA',
        country: 'United States',
        description: 'Design zero-trust telemetry and automated threat hunting workflows for global enterprise clients. Implement modern SIEM event correlation and compliance governance.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Senior Level',
        salary: '$160k - $210k',
        minSalary: 160000,
        maxSalary: 210000,
        requirements: ['Azure', 'Cloud Security', 'SIEM', 'Threat Hunting', 'PowerShell', 'Python'],
        postedDate: '2 days ago',
        applicants: 51,
        featured: true,
    },
    {
        id: 'job-ube-20',
        title: 'Distributed Systems Platform Engineer',
        company: 'Uber',
        companyImage: '',
        location: 'Seattle, WA',
        country: 'United States',
        description: 'Scale real-time messaging, geo-indexing, and dynamic matching infrastructure handling tens of thousands of requests per second with sub-10ms response times.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$155k - $195k',
        minSalary: 155000,
        maxSalary: 195000,
        requirements: ['Golang', 'Kafka', 'Redis', 'Cassandra', 'Distributed Systems', 'gRPC'],
        postedDate: '4 days ago',
        applicants: 62,
        featured: false,
    },
    {
        id: 'job-sno-21',
        title: 'Database Kernel & Query Optimization Engineer',
        company: 'Snowflake',
        companyImage: '',
        location: 'San Mateo, CA',
        country: 'United States',
        description: 'Work on vectorized query execution, cost-based optimizer heuristics, and metadata storage partitioning in next-generation cloud database engines.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'Hybrid',
        experienceLevel: 'Senior Level',
        salary: '$175k - $235k',
        minSalary: 175000,
        maxSalary: 235000,
        requirements: ['C++', 'Rust', 'Database Internals', 'Query Optimization', 'Memory Management'],
        postedDate: '3 days ago',
        applicants: 24,
        featured: true,
    },
    {
        id: 'job-fli-22',
        title: 'Senior Frontend Engineer (Mobile Web Performance)',
        company: 'Flipkart',
        companyImage: '',
        location: 'Bengaluru',
        country: 'India',
        description: 'Drive ultra-low bandwidth mobile web performance and headless PWA experiences for millions of shoppers during festive peak sales.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'On-site',
        experienceLevel: 'Senior Level',
        salary: '$80k - $110k',
        minSalary: 80000,
        maxSalary: 110000,
        requirements: ['React', 'TypeScript', 'PWA', 'Web Performance', 'Service Workers', 'Webpack'],
        postedDate: '5 days ago',
        applicants: 85,
        featured: false,
    },
    {
        id: 'job-air-23',
        title: 'Research Engineer (Model Evaluation & Benchmarking)',
        company: 'OpenAI',
        companyImage: '',
        location: 'San Francisco, CA',
        country: 'United States',
        description: 'Design scalable inference evaluation harnesses, multi-turn reasoning assessments, and human feedback scoring pipelines for next-generation intelligence models.',
        type: 'Full-time',
        jobType: 'full-time',
        workMode: 'On-site',
        experienceLevel: 'Lead / Executive',
        salary: '$210k - $280k',
        minSalary: 210000,
        maxSalary: 280000,
        requirements: ['Python', 'PyTorch', 'Distributed Computing', 'LLM Fine-Tuning', 'Statistics'],
        postedDate: '1 day ago',
        applicants: 98,
        featured: true,
    },
    {
        id: 'job-par-24',
        title: 'Part-Time UI / Visual Designer',
        company: 'TechFlow Studio',
        companyImage: '',
        location: 'Remote',
        country: 'United States',
        description: 'Create high-fidelity marketing illustrations, interactive landing page prototypes, and branded asset packages for fast-growing B2B software products.',
        type: 'Part-time',
        jobType: 'part-time',
        workMode: 'Remote',
        experienceLevel: 'Mid Level',
        salary: '$40k - $55k',
        minSalary: 40000,
        maxSalary: 55000,
        requirements: ['Figma', 'Visual Design', 'Illustration', 'Prototyping', 'Brand Identity'],
        postedDate: '2 days ago',
        applicants: 41,
        featured: false,
    },
    {
        id: 'job-con-25',
        title: 'Contract Terraform & AWS Automation Consultant',
        company: 'CloudScale Consulting',
        companyImage: '',
        location: 'Remote',
        country: 'United States',
        description: 'Execute infrastructure-as-code refactoring project. Migrate legacy VPC and EC2 environments to ECS Fargate and multi-account AWS Organizations.',
        type: 'Contract',
        jobType: 'contract',
        workMode: 'Remote',
        experienceLevel: 'Senior Level',
        salary: '$90k - $130k',
        minSalary: 90000,
        maxSalary: 130000,
        requirements: ['Terraform', 'AWS', 'Docker', 'ECS Fargate', 'CI/CD', 'Bash'],
        postedDate: '1 week ago',
        applicants: 33,
        featured: false,
    },
];

// Helper to normalize database rows to uniform JobCard schema with dynamic currency support
export function normalizeJobRecord(job, currency = 'INR', currencySymbol = '₹') {
    if (!job) return job;
    const minSal = job.salary_min || job.minSalary;
    const maxSal = job.salary_max || job.maxSalary;
    let salaryDisplay = job.salary;

    // If salaryDisplay has hardcoded '$' but active system currency is different, adapt it
    if (salaryDisplay && currencySymbol && currencySymbol !== '$' && salaryDisplay.includes('$')) {
        salaryDisplay = salaryDisplay.replace(/\$/g, currencySymbol);
    }

    if (!salaryDisplay && (minSal || maxSal)) {
        if (minSal && maxSal) {
            salaryDisplay = `${currencySymbol}${Math.round(minSal / 1000)}k - ${currencySymbol}${Math.round(maxSal / 1000)}k`;
        } else if (minSal) {
            salaryDisplay = `${currencySymbol}${Math.round(minSal / 1000)}k+`;
        } else if (maxSal) {
            salaryDisplay = `Up to ${currencySymbol}${Math.round(maxSal / 1000)}k`;
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
        salary: salaryDisplay || `${currencySymbol}80k - ${currencySymbol}120k`,
        minSalary: minSal || 80000,
        maxSalary: maxSal || 120000,
        requirements: Array.isArray(job.requirements)
            ? job.requirements
            : (typeof job.requirements === 'string' ? JSON.parse(job.requirements || '[]') : []),
        postedDate: job.postedDate || (job.created_at ? new Date(job.created_at).toLocaleDateString() : '2 days ago'),
        applicants: typeof job.applicants === 'number' ? job.applicants : (job.applicants_count || 12),
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

    // Load jobs function with resilient authentic showcase fallback
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

            // Request up to 100 jobs to fetch complete active catalog from MariaDB
            const result = await getActiveJobs(1, 100, filters);

            let activeJobPool = [];
            if (result.success && Array.isArray(result.allJobs) && result.allJobs.length > 0) {
                activeJobPool = result.allJobs.map((j) => normalizeJobRecord(j, currencyConfig.currency, currencyConfig.currencySymbol));
            } else if (result.success && Array.isArray(result.jobs) && result.jobs.length > 0) {
                activeJobPool = result.jobs.map((j) => normalizeJobRecord(j, currencyConfig.currency, currencyConfig.currencySymbol));
            } else {
                // Fallback to verified authentic showcase jobs when database is empty
                activeJobPool = DEFAULT_SHOWCASE_JOBS.map((j) => normalizeJobRecord(j, currencyConfig.currency, currencyConfig.currencySymbol));
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
            const normalizedShowcase = DEFAULT_SHOWCASE_JOBS.map((j) => normalizeJobRecord(j, currencyConfig.currency, currencyConfig.currencySymbol));
            const counts = calculateFilterCounts(normalizedShowcase);
            setFilterCounts(counts);
            setJobs(normalizedShowcase.slice((page - 1) * jobsPerPage, page * jobsPerPage));
            setPagination({
                totalItems: normalizedShowcase.length,
                totalPages: Math.max(1, Math.ceil(normalizedShowcase.length / jobsPerPage)),
                hasNextPage: page < Math.ceil(normalizedShowcase.length / jobsPerPage),
                hasPreviousPage: page > 1,
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
        <div className={`${isInsideDashboard ? 'w-full' : 'rp-public-site'} min-h-screen flex flex-col bg-slate-50/50`}>
            {/* Top Navigation Bar with active public-site styling and auth modal hook */}
            {!isInsideDashboard && <HomepageNavbar onOpenAuthModal={authBtnHandler} />}

            <main className={`flex-1 w-full ${isInsideDashboard ? 'max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} ${isInsideDashboard ? 'py-6 sm:py-8 max-lg:pt-16' : 'pt-[110px] pb-12'}`}>
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
                    canPostJob={canPostJob}
                    onQuickFilter={handleQuickFilter}
                    onSearch={() => loadJobs(1)}
                    currency={currencyConfig.currency}
                    currencySymbol={currencyConfig.currencySymbol}
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
                        currencySymbol={currencyConfig.currencySymbol}
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
                                        const displayLabel = category === 'salaryRange' && currencyConfig.currencySymbol !== '$'
                                            ? val.replace(/\$/g, currencyConfig.currencySymbol)
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
