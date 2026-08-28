import { useEffect, useState } from 'react';
import { withTranslation } from 'react-i18next';
import { FiBriefcase, FiTrendingUp, FiUsers, FiMapPin } from 'react-icons/fi';
import { BiBuilding } from 'react-icons/bi';
import { getFeaturedCompanies, getFrontendStats } from '../../services/api/platform';
import { sanitizeImageUrl } from '../../utils/sanitizeHtml';

const LandingJobTopCompanies = ({ t }) => {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [companiesUnavailable, setCompaniesUnavailable] = useState(false);
    const [frontendStats, setFrontendStats] = useState({});

    useEffect(() => {
        const fetchFeaturedCompanies = async () => {
            try {
                setLoading(true);
                // Operational company records and audited marketing claims have
                // independent failure domains; one must not fabricate or suppress the other.
                const [companiesResult, marketingResult] = await Promise.allSettled([
                    getFeaturedCompanies(8),
                    getFrontendStats()
                ]);
                const featuredCompanies = companiesResult.status === 'fulfilled' ? companiesResult.value : [];
                setCompaniesUnavailable(companiesResult.status === 'rejected');
                setFrontendStats(marketingResult.status === 'fulfilled' ? marketingResult.value : {});

                if (featuredCompanies && featuredCompanies.length > 0) {
                    // Normalize API records to the component view model
                    const transformedCompanies = featuredCompanies.map(company => ({
                        id: company.id,
                        name: company.name || 'Employer name unavailable',
                        logo: sanitizeImageUrl(company.companyImage),
                        industry: company.industry || 'Industry not provided',
                        location: company.location || 'Location not provided',
                        featured: true // All fetched companies are featured
                    }));

                    setCompanies(transformedCompanies);
                } else {
                    setCompanies([]);
                }
            } catch (error) {
                console.error('Error fetching featured companies:', error);
                setCompaniesUnavailable(true);
                setCompanies([]);
            } finally {
                setLoading(false);
            }
        };

        fetchFeaturedCompanies();
    }, []);

    // Removed company click functionality as requested

    const handleViewAllCompanies = () => {
        window.location.href = '/jobs/portal';
    };
    const evidenceUrl = sanitizeImageUrl(frontendStats.sourceUrl);
    const evidenceDate = new Date(frontendStats.verifiedAt);
    const hasPublishedEvidence = Boolean(evidenceUrl && Number.isFinite(evidenceDate.getTime()));

    return (
        <section className="py-16 sm:py-20 md:py-24 bg-gray-50/50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                <div className="text-center mb-12 sm:mb-16">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <BiBuilding className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('JobsUpdate.LandingJobTopCompanies.badge', 'Featured Employers')}

                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
                        {t('JobsUpdate.LandingJobTopCompanies.title', 'Browse Employer Profiles')}
                    </h2>

                    {/* Description */}
                    <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-3xl mx-auto mb-8 sm:mb-12 leading-relaxed">
                        {t('JobsUpdate.LandingJobTopCompanies.description', 'Browse featured employer profiles with active listings. Open the jobs portal to review current roles and application details.')}
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
                    ) : companies.length === 0 ? (
                        <div className="col-span-full rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">{companiesUnavailable ? t('JobsUpdate.LandingJobTopCompanies.unavailable', 'Featured employers are temporarily unavailable.') : t('JobsUpdate.LandingJobTopCompanies.empty', 'No employers are currently featured.')}</div>
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
                                    {company.logo ? <img
                                        src={company.logo}
                                        alt={`${company.name} logo`}
                                        loading="lazy"
                                        className="max-h-18 max-w-full w-auto h-auto object-contain filter group-hover:brightness-110 transition-all rounded-md duration-300"
                                    /> : <BiBuilding className="h-10 w-10 text-gray-400" aria-hidden="true" />}
                                </div>

                                {/* Company Info */}
                                <div className="text-center">
                                    <h3 className="font-semibold text-gray-900 text-lg mb-2 group-hover:text-blue-600 transition-colors duration-300">
                                        {company.name}
                                    </h3>

                                    <div className="space-y-2 text-sm text-gray-600">
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

                {/* Evidence-backed claims are omitted when their authoritative revision is unavailable. */}
                {(hasPublishedEvidence && frontendStats.partnerCompanies && frontendStats.activeJobs && frontendStats.successfulHires) && <div className="bg-white/80 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-lg border border-blue-100/50 mb-8 sm:mb-12">
                    <div className="mb-6 text-center">
                        <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-700 underline">
                            {t('JobsUpdate.LandingJobTopCompanies.evidenceReviewed', 'Evidence reviewed')} {evidenceDate.toLocaleDateString()}
                        </a>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center">
                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3 group-hover:bg-blue-200 transition-colors duration-300">
                                <BiBuilding className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.partnerCompanies}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobTopCompanies.stats.companies', 'Partner Companies')}</div>
                        </div>

                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-3 group-hover:bg-green-200 transition-colors duration-300">
                                <FiBriefcase className="w-6 h-6 text-green-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.activeJobs}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobTopCompanies.stats.jobs', 'Active Jobs')}</div>
                        </div>

                        <div className="group">
                            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mx-auto mb-3 group-hover:bg-purple-200 transition-colors duration-300">
                                <FiUsers className="w-6 h-6 text-purple-600" />
                            </div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{frontendStats.successfulHires}</div>
                            <div className="text-sm text-gray-600">{t('JobsUpdate.LandingJobTopCompanies.stats.hires', 'Successful Hires')}</div>
                        </div>
                    </div>
                </div>}

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
