import { useEffect, useState } from 'react';
import { getTrustedBy } from '../../../firestore/dbOperations';
import { useTranslation } from 'react-i18next';

const HomepageCompatibility = () => {
    const { t } = useTranslation('common');
    const [trustedCompanies, setTrustedCompanies] = useState([]);
    const [shouldAnimate, setShouldAnimate] = useState(true);

    useEffect(() => {
        const fetchTrustedCompanies = async () => {
            const companies = await getTrustedBy();
            setTrustedCompanies(companies);
            // Only animate if we have enough logos
            setShouldAnimate(companies.length > 3);
        };
        fetchTrustedCompanies();
    }, []);
    return (
        <section className="py-10 bg-gray-50/50">
            <div className="max-w-6xl mx-auto px-4">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full shadow-sm mb-3">
                        {t('HomepageTrustedBy.badge')}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">{t('HomepageTrustedBy.title')}</h2>
                    <p className="text-gray-600 text-base max-w-2xl mx-auto mb-8">{t('HomepageTrustedBy.description')}</p>

                    {/* Logo Cloud - Simplified & Polished */}
                    <div className="relative">
                        {/* Gradient fades */}
                        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-gray-50/90 to-transparent z-10"></div>
                        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-50/90 to-transparent z-10"></div>

                        {/* Logo container */}
                        <div className="overflow-hidden rounded-xl bg-white">
                            <div className="flex overflow-hidden py-6 px-4">
                                {/* Animated logo marquee - with duplication for continuous effect */}
                                <div className={`flex gap-8 items-center ${shouldAnimate ? 'animate-marquee' : 'justify-center w-full'}`}>
                                    {/* Original set of logos */}
                                    {trustedCompanies.map((company, index) => (
                                        <div key={`original-${index}`} className="w-[120px] flex-shrink-0">
                                            <img src={company.imageUrl} alt={company.name} className="object-contain h-12 mx-auto" />
                                        </div>
                                    ))}

                                    {/* Duplicate logos for continuous animation effect when there are enough logos */}
                                    {shouldAnimate &&
                                        trustedCompanies.map((company, index) => (
                                            <div key={`duplicate-${index}`} className="w-[120px] flex-shrink-0">
                                                <img src={company.imageUrl} alt={`${company.name}-dup`} className="object-contain h-12 mx-auto" />
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Trust indicators */}
                    <div className="flex justify-center items-center gap-8 mt-8 text-sm text-gray-600 flex-wrap">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span>{t('HomepageTrustedBy.trustIndicators.platforms')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span>{t('HomepageTrustedBy.trustIndicators.countries')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span>{t('HomepageTrustedBy.trustIndicators.technology')}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add marquee animation */}
            <style jsx="true">{`
                @keyframes marquee {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                    width: fit-content;
                }
            `}</style>
        </section>
    );
};

export default HomepageCompatibility;
