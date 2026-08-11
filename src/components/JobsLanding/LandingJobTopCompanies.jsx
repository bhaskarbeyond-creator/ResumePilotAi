import { useEffect, useState } from 'react';
import { withTranslation } from 'react-i18next';
import { FiBriefcase, FiTrendingUp, FiUsers, FiMapPin } from 'react-icons/fi';
import { BiBuilding } from 'react-icons/bi';
import { getFeaturedCompanies, getFrontendStats } from '../../firestore/dbOperations';

// Mock data for top companies - in a real app, this would come from your database
const topCompanies = [
    {
        id: 1,
        name: 'Google',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg',
        openJobs: 245,
        industry: 'Technology',
        location: 'Mountain View, CA',
        featured: true
    },
    {
        id: 2,
        name: 'Microsoft',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg',
        openJobs: 189,
        industry: 'Technology',
        location: 'Redmond, WA',
        featured: true
    },
    {
        id: 3,
        name: 'Apple',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg',
        openJobs: 156,
        industry: 'Technology',
        location: 'Cupertino, CA',
        featured: true
    },
    {
        id: 4,
        name: 'Amazon',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg',
        openJobs: 312,
        industry: 'E-commerce',
        location: 'Seattle, WA',
        featured: true
    },
    {
        id: 5,
        name: 'Meta',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg',
        openJobs: 98,
        industry: 'Social Media',
        location: 'Menlo Park, CA',
        featured: false
    },
    {
        id: 6,
        name: 'Netflix',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
        openJobs: 67,
        industry: 'Entertainment',
        location: 'Los Gatos, CA',
        featured: false
    },
    {
        id: 7,
        name: 'Tesla',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Tesla_T_symbol.svg',
        openJobs: 134,
        industry: 'Automotive',
        location: 'Austin, TX',
        featured: false
    },
    {
        id: 8,
        name: 'Spotify',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg',
        openJobs: 45,
        industry: 'Music',
        location: 'Stockholm, Sweden',
        featured: false
    }
];

const LandingJobTopCompanies = ({ t }) => {
    const [companies, setCompanies] = useState([]);
    const [shouldAnimate, setShouldAnimate] = useState(true);
    const [loading, setLoading] = useState(true);
    const [frontendStats, setFrontendStats] = useState({});

    useEffect(() => {
        const fetchFeaturedCompanies = async () => {
            try {
                setLoading(true);
                console.log('🔍 Fetching featured companies...');
                // Fetch featured companies and stats from Firestore
                const [featuredCompanies, stats] = await Promise.all([
                    getFeaturedCompanies(8),
                    getFrontendStats()
                ]);
                setFrontendStats(stats);
                console.log('📊 Featured companies result:', featuredCompanies);
                
                if (featuredCompanies && featuredCompanies.length > 0) {
                    console.log('✅ Found', featuredCompanies.length, 'featured companies');
                    // Transform Firestore data to match component expectations
                    const transformedCompanies = featuredCompanies.map(company => ({
                        id: company.id,
                        name: company.name || 'N/A',
                        logo: company.companyImage || '/api/placeholder/120/60',
                        openJobs: company.stats?.activeJobs || 0,
                        industry: company.industry || 'Various',
                        location: company.location || 'Global',
                        featured: true // All fetched companies are featured
                    }));
                    
                    console.log('🔄 Transformed companies:', transformedCompanies);
                    setCompanies(transformedCompanies);
                    setShouldAnimate(transformedCompanies.length > 4);
                } else {
                    console.log('❌ No featured companies found, using mock data');
                    // Fallback to mock data if no featured companies found
                    setCompanies(topCompanies);
                    setShouldAnimate(topCompanies.length > 4);
                }
            } catch (error) {
                console.error('Error fetching featured companies:', error);
                // Fallback to mock data on error
                setCompanies(topCompanies);
                setShouldAnimate(topCompanies.length > 4);
            } finally {
                setLoading(false);
            }
        };

        fetchFeaturedCompanies();
    }, []);

    // Removed company click functionality as requested

    const handleViewAllCompanies = () => {
        // Navigate to all companies page
        window.location.href = '/jobs/portal';
    };

    return (
        <section className="py-16 sm:py-20 md:py-24 bg-gray-50/50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                <div className="text-center mb-12 sm:mb-16">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <BiBuilding className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('JobsUpdate.LandingJobTopCompanies.badge', 'Top Employers')}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
                        {t('JobsUpdate.LandingJobTopCompanies.title', 'Join Leading Companies')}
                    </h2>

                    {/* Description */}
                    <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-3xl mx-auto mb-8 sm:mb-12 leading-relaxed">
                        {t('JobsUpdate.LandingJobTopCompanies.description', 'Discover opportunities at world-class companies that are actively hiring. From startups to Fortune 500, find your perfect match.')}
                    </p>
                </div>

                {/* Company Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
                    {loading ? (
                        // Loading skeleton cards
                        [...Array(8)].map((_, index) => (
                            <div key={index} className="bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-md border border-gray-200/60">
                                <div className="animate-pulse">
                                    <div className="h-16 bg-gray-200 rounded-lg mb-4"></div>
                                    <div className="h-6 bg-gray-200 rounded mb-2"></div>
                                    <div className="space-y-2">
                                        <div className="h-4 bg-gray-200 rounded"></div>
                                        <div className="h-4 bg-gray-200 rounded"></div>
                                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        companies.slice(0, 8).map((company) => (
                            <div
                                key={company.id}
                                className="group relative bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-md border border-gray-200/60 hover:shadow-xl hover:border-blue-200 transition-all duration-300 transform hover:scale-[1.02]">
                                
                                {/* Featured Badge */}
                                {company.featured && (
                                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-2 py-1 rounded-full font-semibold shadow-md">
                                        {t('JobsUpdate.LandingJobTopCompanies.featured', 'Featured')}
                                    </div>
                                )}
    
                                {/* Company Logo */}
                                <div className="flex items-center justify-center h-20 mb-4">
                                    <img 
                                        src={company.logo} 
                                        alt={company.name}
                                        className="max-h-18 max-w-full w-auto h-auto object-contain filter group-hover:brightness-110 transition-all rounded-md duration-300"
                                        onError={(e) => {
                                            e.target.src = '/api/placeholder/120/60';
                                        }}
                                    />
                                </div>
    
                                {/* Company Info */}
                                <div className="text-center">
                                    <h3 className="font-semibold text-gray-900 text-lg mb-2 group-hover:text-blue-600 transition-colors duration-300">
                                        {company.name}
                                    </h3>
                                    
                                    <div className="space-y-2 text-sm text-gray-600">
                                        {/* <div className="flex items-center justify-center gap-1">
                                            <FiBriefcase className="w-4 h-4 text-blue-500" />
                                            <span className="font-medium">{company.openJobs} open jobs</span>
                                        </div> */}
                                        
                                        <div className="flex items-center justify-center gap-1">
                                            <FiTrendingUp className="w-4 h-4 text-green-500" />
                                            <span>{company.industry}</span>
                                        </div>
                                        
                                        <div className="flex items-center justify-center gap-1">
                                            <FiMapPin className="w-4 h-4 text-gray-400" />
                                            <span className="text-xs">{company.location}</span>
                                        </div>
                                    </div>
                                </div>
    
                                {/* Hover Effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </div>
                        ))
                    )}
                </div>

                {/* Stats Section */}
                <div className="bg-white/80 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-lg border border-blue-100/50 mb-8 sm:mb-12">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center">
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3 group-hover:bg-blue-200 transition-colors duration-300">
                                <BiBuilding className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.partnerCompanies || '500+'}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobTopCompanies.stats.companies', 'Partner Companies')}</div>
                        </div>
                        
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 group-hover:bg-green-200 transition-colors duration-300">
                                <FiBriefcase className="w-6 h-6 text-green-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.activeJobs || '10,000+'}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobTopCompanies.stats.jobs', 'Active Jobs')}</div>
                        </div>
                        
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mx-auto mb-3 group-hover:bg-purple-200 transition-colors duration-300">
                                <FiUsers className="w-6 h-6 text-purple-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.successfulHires || '50,000+'}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobTopCompanies.stats.hires', 'Successful Hires')}</div>
                        </div>
                    </div>
                </div>

                {/* CTA Button */}
                <div className="text-center">
                    <button
                        onClick={handleViewAllCompanies}
                        className="inline-flex items-center gap-2 px-8 py-4 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-300 font-semibold text-base shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]">
                        <BiBuilding className="w-5 h-5" />
                        <span>{t('JobsUpdate.LandingJobTopCompanies.viewAll', 'View All Companies')}</span>
                    </button>
                </div>
            </div>
        </section>
    );
};

const MyComponent = withTranslation('common')(LandingJobTopCompanies);
export default MyComponent;
