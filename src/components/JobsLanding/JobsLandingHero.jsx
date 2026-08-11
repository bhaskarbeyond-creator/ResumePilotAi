import { useState, useEffect, useRef, useContext } from 'react';
import { FiSearch, FiMapPin, FiBriefcase, FiUsers, FiStar, FiTrendingUp } from 'react-icons/fi';
import { BiCheckCircle, BiBuilding } from 'react-icons/bi';
import { withTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../main';
import { motion, AnimatePresence } from 'framer-motion';
import CustomLocationAutocomplete from '../JobsListings/CustomLocationAutocomplete';
import { getFrontendStats } from '../../firestore/dbOperations';

// Job-focused sentences for the typing effect
const defaultSentences = ['Find your dream job today', 'Connect with top employers', 'Advance your career journey', 'Discover remote opportunities', 'Join leading companies'];

const JobsLandingHero = ({ t, authBtnHandler, user: propUser }) => {
    const user = propUser || useContext(AuthContext);
    const navigate = useNavigate();
    const [displayText, setDisplayText] = useState('');
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const [isTyping, setIsTyping] = useState(true);
    const [cursorVisible, setCursorVisible] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [locationQuery, setLocationQuery] = useState('');
    const [frontendStats, setFrontendStats] = useState({});
    const [statsLoading, setStatsLoading] = useState(true);

    // Use translated sentences if available or fall back to defaults
    const sentences = [
        t('JobsUpdate.JobsLandingHero.typingEffect.sentence1', defaultSentences[0]),
        t('JobsUpdate.JobsLandingHero.typingEffect.sentence2', defaultSentences[1]),
        t('JobsUpdate.JobsLandingHero.typingEffect.sentence3', defaultSentences[2]),
        t('JobsUpdate.JobsLandingHero.typingEffect.sentence4', defaultSentences[3]),
        t('JobsUpdate.JobsLandingHero.typingEffect.sentence5', defaultSentences[4]),
    ];

    const timeoutRef = useRef(null);

    useEffect(() => {
        const currentSentence = sentences[currentSentenceIndex];

        if (isTyping) {
            if (displayText.length < currentSentence.length) {
                timeoutRef.current = setTimeout(() => {
                    setDisplayText(currentSentence.slice(0, displayText.length + 1));
                }, 80);
            } else {
                timeoutRef.current = setTimeout(() => {
                    setIsTyping(false);
                }, 2000);
            }
        } else {
            if (displayText.length > 0) {
                timeoutRef.current = setTimeout(() => {
                    setDisplayText(displayText.slice(0, -1));
                }, 40);
            } else {
                setCurrentSentenceIndex((prev) => (prev + 1) % sentences.length);
                setIsTyping(true);
            }
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [displayText, isTyping, currentSentenceIndex]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setStatsLoading(true);
                const stats = await getFrontendStats();
                setFrontendStats(stats || {});
            } catch (error) {
                console.error('Error fetching frontend stats:', error);
                setFrontendStats({});
            } finally {
                setStatsLoading(false);
            }
        };
        fetchStats();
    }, []);

    useEffect(() => {
        const cursorInterval = setInterval(() => {
            setCursorVisible((prev) => !prev);
        }, 500);

        return () => clearInterval(cursorInterval);
    }, []);

    const handleJobSearch = () => {
        // Navigate to jobs portal with query parameters
        const params = new URLSearchParams();
        if (searchQuery) params.append('q', searchQuery);
        if (locationQuery) params.append('location', locationQuery);
        navigate(`/jobs/portal?${params.toString()}`);
    };

    const handleBrowseJobs = () => {
        navigate('/jobs/portal');
    };

    const handlePostJob = () => {
        if (user) {
            // User is logged in, navigate to dashboard (since /jobs/post doesn't exist yet)
            navigate('/dashboard');
        } else {
            // User not logged in, show auth modal
            if (authBtnHandler) {
                authBtnHandler();
            } else {
                navigate('/auth?redirect=/dashboard');
            }
        }
    };

    return (
        <section className="relative min-h-screen py-6 sm:py-12 md:py-16 lg:py-24 overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-10 right-4 sm:top-20 sm:right-20 w-48 h-48 sm:w-72 sm:h-72 bg-gradient-to-br from-blue-400/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" />
            <div
                className="absolute bottom-10 left-4 sm:bottom-20 sm:left-20 w-64 h-64 sm:w-96 sm:h-96 bg-gradient-to-tr from-purple-400/15 to-pink-500/15 rounded-full blur-3xl animate-pulse"
                style={{ animationDelay: '1s' }}
            />

            <div className="relative z-10 w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                {/* Header Content */}
                <div className="text-center w-full mx-auto mb-8 sm:mb-12 md:mb-16 lg:mb-20">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <FiBriefcase className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('JobsUpdate.JobsLandingHero.badge', 'Jobs Portal')}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>

                    {/* Main Heading with Typewriter */}
                    <div className="mb-4 sm:mb-6 md:mb-8 min-h-[80px] sm:min-h-[100px] md:min-h-[120px]">
                        <h1 className="text-xl xs:text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-2 sm:mb-4 leading-tight px-1 sm:px-2 md:px-0 break-words">
                            <span className="block text-transparent py-2 text-6xl bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800">
                                {displayText}
                                <span className="text-blue-600 ml-1" style={{ opacity: cursorVisible ? 1 : 0 }}>
                                    |
                                </span>
                            </span>
                        </h1>
                    </div>

                    {/* Description */}
                    <p className="text-sm sm:text-base md:text-md lg:text-md text-gray-600 w-full max-w-3xl mx-auto mb-6 sm:mb-8 md:mb-10 leading-relaxed font-light px-2 sm:px-4 md:px-0">
                        {t('JobsUpdate.JobsLandingHero.description', "Discover thousands of job opportunities from top companies. Whether you're looking for remote work, career advancement, or your first job, we connect talented professionals with their perfect match.")}
                    </p>

                    {/* Job Search Bar */}
                    <div className="w-full max-w-4xl mx-auto mb-8 sm:mb-12 md:mb-16 px-2 sm:px-4 md:px-0 relative z-50">
                        <div className="bg-white/90 backdrop-blur-sm p-4 sm:p-6 rounded-2xl shadow-lg border border-blue-100/50 hover:shadow-xl transition-all duration-300">
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                                {/* Job Title/Keywords Input */}
                                <div className="flex-1 relative">
                                    <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        placeholder={t('JobsUpdate.JobsLandingHero.searchPlaceholder', 'Job title, keywords, or company')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleJobSearch()}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 placeholder-gray-400"
                                    />
                                </div>

                                {/* Location Input with Google Maps Autocomplete */}
                                <div className="flex-1 relative z-[100]">
                                    <CustomLocationAutocomplete
                                        value={locationQuery}
                                        onChange={setLocationQuery}
                                        placeholder={t('JobsUpdate.JobsLandingHero.locationPlaceholder', 'City, state, or remote')}
                                        className="focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                {/* Search Button */}
                                <button
                                    onClick={handleJobSearch}
                                    className="px-6 py-3 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-2 min-w-[120px]">
                                    <FiSearch className="w-4 h-4" />
                                    <span>{t('JobsUpdate.JobsLandingHero.searchButton', 'Search Jobs')}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mb-8 sm:mb-12 md:mb-16 px-2 sm:px-4 md:px-0 relative z-10">
                        {/* Browse Jobs - Primary */}
                        <button
                            onClick={handleBrowseJobs}
                            className="cursor-pointer relative flex items-center justify-center gap-2 px-5 py-3 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px] group">
                            <FiBriefcase className="w-4 h-4" />
                            <span>{t('JobsUpdate.JobsLandingHero.browseJobs', 'Browse Jobs')}</span>
                            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                {t('JobsUpdate.JobsLandingHero.hotBadge', 'HOT')}
                            </span>
                        </button>

                        {/* Post a Job - Secondary */}
                        <button
                            onClick={handlePostJob}
                            className="relative flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#4a6cf7] text-[#4a6cf7] rounded-lg hover:bg-blue-50 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px] group">
                            <BiBuilding className="w-4 h-4" />
                            <span>{t('JobsUpdate.JobsLandingHero.postJob', 'Post a Job')}</span>
                            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                {t('JobsUpdate.JobsLandingHero.employerBadge', 'EMPLOYER')}
                            </span>
                        </button>

                        {/* Career Resources */}
                        <Link
                            to="/career-resources"
                            className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px]">
                            <FiTrendingUp className="w-4 h-4" />
                            <span>{t('JobsUpdate.JobsLandingHero.careerResources', 'Career Tips')}</span>
                        </Link>
                    </div>

                    {/* Simple explanation */}
                    <div className="text-center text-xs text-gray-500 mb-6 max-w-lg mx-auto">
                        <span className="font-medium text-[#4a6cf7]">{t('JobsUpdate.JobsLandingHero.browse', 'Browse')}</span> - {t('JobsUpdate.JobsLandingHero.browseDesc', 'Explore all opportunities')} •{' '}
                        <span className="font-medium text-[#4a6cf7]">{t('JobsUpdate.JobsLandingHero.post', 'Post')}</span> - {t('JobsUpdate.JobsLandingHero.postDesc', 'Hire top talent')} •{' '}
                        <span className="font-medium text-gray-600">{t('JobsUpdate.JobsLandingHero.resources', 'Resources')}</span> - {t('JobsUpdate.JobsLandingHero.resourcesDesc', 'Career guidance & tips')}
                    </div>

                    {/* Social Proof - Mobile Responsive */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 text-gray-600 bg-white/80 backdrop-blur-sm p-3 sm:p-4 md:p-5 rounded-2xl shadow-sm border border-blue-100/50 hover:shadow-md transition-all duration-300 ease-out mx-2 sm:mx-auto w-auto max-w-3xl">
                        {/* Stats Section */}
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-[#4a6cf7] to-[#6366f1] flex items-center justify-center text-white shadow-md">
                                <FiBriefcase className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-gray-800 text-sm sm:text-md">
                                    {statsLoading ? (
                                        <div className="animate-pulse">
                                            <div className="h-4 bg-gray-200 rounded w-24 inline-block"></div>
                                        </div>
                                    ) : (
                                        <>{frontendStats.activeJobs || '10,000+'} Active Jobs</>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <FiStar key={i} className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
                                    ))}
                                    <span className="ml-1 text-xs sm:text-md font-medium text-gray-700">
                                        {statsLoading ? (
                                            <div className="animate-pulse">
                                                <div className="h-3 bg-gray-200 rounded w-16 inline-block"></div>
                                            </div>
                                        ) : (
                                            <>{frontendStats.rating || '4.8'}/5 Rating</>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="hidden sm:block h-10 w-px bg-gray-200 mx-2"></div>

                        {/* Feature badges */}
                        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-md flex-wrap justify-center">
                            <div className="flex items-center gap-1.5 bg-green-50/80 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-green-100 hover:bg-green-100/80 transition-all duration-300 ease-out">
                                <BiCheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                                <span className="font-medium text-green-700">{t('JobsUpdate.JobsLandingHero.features.freeToApply', 'Free to Apply')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-blue-50/80 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-blue-100 hover:bg-blue-100/80 transition-all duration-300 ease-out">
                                <BiCheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-[#4a6cf7]" />
                                <span className="font-medium text-blue-700">{t('JobsUpdate.JobsLandingHero.features.verifiedEmployers', 'Verified Employers')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Animations */}
            <style jsx="true">{`
                @keyframes float {
                    0%,
                    100% {
                        transform: translateY(0px) rotate(0deg);
                    }
                    50% {
                        transform: translateY(-20px) rotate(5deg);
                    }
                }

                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }

                /* Mobile-specific optimizations */}
                @media (max-width: 640px) {
                    .min-h-screen {
                        min-height: 100vh;
                    }

                    section {
                        overflow-x: hidden;
                    }
                }

                @media (max-width: 475px) {
                    h1 {
                        font-size: 1.5rem !important;
                        line-height: 1.3 !important;
                        padding-left: 0.5rem !important;
                        padding-right: 0.5rem !important;
                    }

                    p {
                        font-size: 0.875rem !important;
                        line-height: 1.4 !important;
                    }

                    .min-h-screen {
                        min-height: 100dvh;
                    }
                }

                @media (max-width: 360px) {
                    h1 {
                        font-size: 1.25rem !important;
                        line-height: 1.2 !important;
                    }

                    p {
                        font-size: 0.8rem !important;
                    }
                }

                /* Custom xs breakpoint */}
                @media (min-width: 475px) {
                    .xs\\:text-2xl {
                        font-size: 1.5rem;
                        line-height: 2rem;
                    }
                }
            `}</style>
        </section>
    );
};

const MyComponent = withTranslation('common')(JobsLandingHero);
export default MyComponent;
