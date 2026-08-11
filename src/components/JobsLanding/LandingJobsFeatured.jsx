import React, { useState, useEffect } from 'react';
import { withTranslation } from 'react-i18next';
import { FiBriefcase, FiMapPin, FiClock, FiDollarSign, FiStar, FiTrendingUp, FiArrowRight } from 'react-icons/fi';
import { BiBuilding, BiTime } from 'react-icons/bi';
import { getFrontendStats, getFeaturedJobs } from '../../firestore/dbOperations';


const JobCard = ({ job, onApply, t }) => (
    <div className="group relative bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-md border border-gray-200/60 hover:shadow-xl hover:border-blue-200 transition-all duration-300 cursor-pointer transform hover:scale-[1.02]">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-4">
            {job.featured && (
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-2 py-1 rounded-full font-semibold shadow-md">
                    {/* Featured */}
                    {t('JobsUpdate.LandingJobsFeatured.JobCard.badges.featured', '⭐ Featured')}
                </div>
            )}
            {job.urgent && (
                <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs px-2 py-1 rounded-full font-semibold shadow-md">
                    {t('JobsUpdate.LandingJobsFeatured.JobCard.badges.urgent', '🔥 Urgent')}
                </div>
            )}
            {job.remote && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs px-2 py-1 rounded-full font-semibold shadow-md">
                    {t('JobsUpdate.JobCard.badges.remote', '🌍 Remote')}
                </div>
            )}
        </div>

        {/* Company Logo & Info */}
        <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0 w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-blue-50 transition-colors duration-300">
                <img 
                    src={job.companyLogo} 
                    alt={job.company}
                    className="h-8 w-auto object-contain filter group-hover:brightness-110 transition-all duration-300"
                />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-600 transition-colors duration-300 truncate">
                    {job.title}
                </h3>
                <p className="text-gray-600 font-medium">{job.company}</p>
            </div>
        </div>

        {/* Job Details */}
        <div className="space-y-2 mb-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
                <FiMapPin className="w-4 h-4 text-gray-400" />
                <span>{job.location}</span>
            </div>
            <div className="flex items-center gap-2">
                <FiBriefcase className="w-4 h-4 text-gray-400" />
                <span>{job.type}</span>
            </div>
            <div className="flex items-center gap-2">
                <FiDollarSign className="w-4 h-4 text-green-500" />
                <span className="font-medium text-green-600">{job.salary}</span>
            </div>
            <div className="flex items-center gap-2">
                <BiTime className="w-4 h-4 text-gray-400" />
                <span>{job.postedTime}</span>
            </div>
        </div>

        {/* Description */}
        <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-2">
            {job.description}
        </p>

        {/* Skills */}
        <div className="flex flex-wrap gap-2 mb-4">
            {job.skills.slice(0, 3).map((skill, index) => (
                <span 
                    key={index}
                    className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-md border border-blue-100"
                >
                    {skill}
                </span>
            ))}
            {job.skills.length > 3 && (
                <span className="px-2 py-1 bg-gray-50 text-gray-500 text-xs font-medium rounded-md border border-gray-100">
                    {t('JobsUpdate.LandingJobsFeatured.JobCard.skills.moreSkills', '+{0} more', { 0: job.skills.length - 3 })}
                </span>
            )}
        </div>

        {/* Apply Button */}
        <button
            onClick={() => onApply(job)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-300 font-medium text-sm shadow-md hover:shadow-lg group/btn"
        >
            <span>{t('JobsUpdate.LandingJobsFeatured.JobCard.buttons.applyNow', 'Apply Now')}</span>
            <FiArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-300" />
        </button>

        {/* Hover Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
);

const LandingJobsFeatured = ({ t }) => {
    const [frontendStats, setFrontendStats] = useState({});
    const [featuredJobs, setFeaturedJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                console.log('🔍 Fetching featured jobs and stats...');
                
                // Fetch both stats and featured jobs
                const [stats, jobs] = await Promise.all([
                    getFrontendStats(),
                    getFeaturedJobs(6) // Get 6 featured jobs
                ]);
                
                console.log('✅ Fetched stats:', stats);
                console.log('✅ Fetched featured jobs:', jobs);
                
                setFrontendStats(stats);
                setFeaturedJobs(jobs);
                setError(null);
            } catch (err) {
                console.error('❌ Error fetching data:', err);
                setError(err.message);
                // Keep mock data as fallback
                setFeaturedJobs(mockFeaturedJobs);
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, []);

    const handleApply = (job) => {
        // Navigate to job portal with job ID to auto-open modal
        window.location.href = `/jobs/portal/${job.id}`;
    };

    const handleViewAllJobs = () => {
        // Navigate to all jobs page
        window.location.href = '/jobs/browse';
    };

    return (
        <section className="py-16 sm:py-20 md:py-24">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-12 sm:mb-16">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <FiStar className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('JobsUpdate.LandingJobsFeatured.badge', 'Featured Jobs')}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
                        {t('JobsUpdate.LandingJobsFeatured.title', 'Discover Your Next')}
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800">
                            {t('JobsUpdate.LandingJobsFeatured.titleHighlight', 'Dream Opportunity')}
                        </span>
                    </h2>

                    {/* Description */}
                    <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                        {t('JobsUpdate.LandingJobsFeatured.description', 'Explore hand-picked opportunities from top companies. These featured positions offer exceptional career growth, competitive compensation, and amazing work environments.')}
                    </p>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="text-center py-12">
                        <div className="inline-flex items-center gap-3 px-6 py-3 bg-blue-50 text-blue-600 rounded-full">
                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="font-medium">Loading featured jobs...</span>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="text-center py-8 mb-8">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
                            <span className="text-sm">⚠️ Using demo data (Firestore connection issue)</span>
                        </div>
                    </div>
                )}

                {/* Jobs Grid */}
                {!loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
                        {featuredJobs.map((job) => (
                            <JobCard
                                key={job.id} 
                                job={job} 
                                onApply={handleApply}
                                t={t}
                            />
                        ))}
                    </div>
                )}

                {/* Stats & CTA Section */}
                <div className="bg-white/80 backdrop-blur-sm p-8 sm:p-12 rounded-2xl shadow-lg border border-blue-100/50">
                    <div className="text-center mb-8">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                            {t('JobsUpdate.LandingJobsFeatured.statsTitle', 'Join Thousands of Successful Professionals')}
                        </h3>
                        <p className="text-gray-600 max-w-2xl mx-auto">
                            {t('JobsUpdate.LandingJobsFeatured.statsDescription', 'Our platform has helped countless professionals find their dream jobs at top companies worldwide.')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center mb-8">
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3 group-hover:bg-blue-200 transition-colors duration-300">
                                <FiBriefcase className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.featuredJobs || '2,500+'}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobsFeatured.stats.jobs', 'Featured Jobs')}</div>
                        </div>
                        
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 group-hover:bg-green-200 transition-colors duration-300">
                                <FiTrendingUp className="w-6 h-6 text-green-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.successRate || '95%'}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobsFeatured.stats.success', 'Success Rate')}</div>
                        </div>
                        
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mx-auto mb-3 group-hover:bg-purple-200 transition-colors duration-300">
                                <BiBuilding className="w-6 h-6 text-purple-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.topCompanies || '500+'}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobsFeatured.stats.companies', 'Top Companies')}</div>
                        </div>
                    </div>

                    {/* CTA Button */}
                    <div className="text-center">
                        <button
                            onClick={handleViewAllJobs}
                            className="inline-flex items-center gap-2 px-8 py-4 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-300 font-semibold text-base shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]">
                            <FiBriefcase className="w-5 h-5" />
                            <span>{t('JobsUpdate.LandingJobsFeatured.viewAll', 'View All Jobs')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

const MyComponent = withTranslation('common')(LandingJobsFeatured);
export default MyComponent;
