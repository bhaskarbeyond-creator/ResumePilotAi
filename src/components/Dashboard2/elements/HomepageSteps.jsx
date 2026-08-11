import React from 'react';
import { FiTarget, FiTrendingUp, FiAward, FiStar, FiArrowRight, FiUsers, FiFileText, FiZap } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import backgroundImage from '../../../assets/Landing Page images/ddddddddddddddd.JPG';
import backgroundImage2 from '../../../assets/Landing Page images/dddd2.png';
import backgroundImage3 from '../../../assets/Landing Page images/dddd3.png';
import appPreviewImage from '../../../assets/Landing Page images/app.png';

const StatCard = ({ stat, index }) => (
    <div
        className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 animate-fade-in-up group"
        style={{ animationDelay: `${0.8 + index * 0.1}s` }}>
        <div className="text-center">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform duration-300">
                <stat.icon className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-600 mb-1">{stat.number}</p>
            <p className="text-xs text-gray-600 font-medium">{stat.label}</p>
        </div>
    </div>
);

const BenefitSection = ({ benefit, index, isReverse }) => (
    <div className={`grid lg:grid-cols-2 gap-12 xl:gap-16 items-center ${isReverse ? 'lg:grid-flow-col-dense' : ''}`}>
        {/* Content */}
        <div className={`space-y-6 animate-fade-in-left ${isReverse ? 'lg:col-start-2' : ''}`} style={{ animationDelay: `${1.2 + index * 0.2}s` }}>
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl flex items-center justify-center shadow-sm">
                        <benefit.icon className="w-7 h-7 text-purple-600" />
                    </div>
                </div>
                <div className="flex-1">
                    <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">{benefit.title}</h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-4">{benefit.description}</p>
                    <p className="text-purple-600 font-medium">{benefit.detail}</p>
                </div>
            </div>
        </div>

        {/* Visual Element */}
        <div className={`relative animate-fade-in-right ${isReverse ? 'lg:col-start-1' : ''}`} style={{ animationDelay: `${1.4 + index * 0.2}s` }}>
            <div
                className="relative rounded-3xl p-8 h-80 flex items-center justify-center bg-cover bg-center"
                style={index === 0 ? { backgroundImage: `url(${backgroundImage})` } : index === 1 ? { backgroundImage: `url(${backgroundImage2})` } : { backgroundImage: `url(${backgroundImage3})` }}>
                <div className="absolute inset-0 rounded-3xl bg-black/10"></div>
                <div className="relative text-center">
                    <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-4">
                        <benefit.icon className="w-10 h-10 text-purple-600" />
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2 shadow-sm">
                        <p className="text-sm font-semibold text-gray-700">{benefit.title}</p>
                    </div>
                </div>

                {/* Floating decorative elements */}
                <div className="absolute top-4 right-4 w-3 h-3 bg-purple-300 rounded-full animate-pulse"></div>
                <div className="absolute bottom-6 left-6 w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute top-1/2 right-8 w-1 h-1 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
        </div>
    </div>
);

const HomepageBenefitsPolished = () => {
    const { t } = useTranslation('common');

    // Get benefits from translations
    const benefits = [
        {
            icon: FiTarget,
            title: t('HomepageSteps.benefits.0.title'),
            description: t('HomepageSteps.benefits.0.description'),
            detail: t('HomepageSteps.benefits.0.detail'),
        },
        {
            icon: FiTrendingUp,
            title: t('HomepageSteps.benefits.1.title'),
            description: t('HomepageSteps.benefits.1.description'),
            detail: t('HomepageSteps.benefits.1.detail'),
        },
        {
            icon: FiAward,
            title: t('HomepageSteps.benefits.2.title'),
            description: t('HomepageSteps.benefits.2.description'),
            detail: t('HomepageSteps.benefits.2.detail'),
        },
    ];

    // Get stats from translations
    const stats = [
        { number: t('HomepageSteps.stats.0.number'), label: t('HomepageSteps.stats.0.label'), icon: FiUsers },
        { number: t('HomepageSteps.stats.1.number'), label: t('HomepageSteps.stats.1.label'), icon: FiTarget },
        { number: t('HomepageSteps.stats.2.number'), label: t('HomepageSteps.stats.2.label'), icon: FiFileText },
        { number: t('HomepageSteps.stats.3.number'), label: t('HomepageSteps.stats.3.label'), icon: FiZap },
    ];

    return (
        <section id="benefits" className="relative py-20 overflow-hidden">
            {/* Background with subtle pattern */}
            <div className="absolute inset-0 bg-gradient-to-b from-gray-50/80 via-white to-purple-50/30"></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(147,51,234,0.05),transparent_20%)]"></div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Enhanced Header */}
                <div className="text-center mb-20">
                    <div className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-purple-600 bg-white/80 backdrop-blur-sm border border-purple-200/50 rounded-full mb-8 shadow-lg animate-fade-in-up">
                        <FiStar className="w-4 h-4" />
                        {t('HomepageSteps.badge')}
                    </div>

                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <span className="text-purple-600">{t('HomepageSteps.title.part1')}</span> <span className="text-gray-900">{t('HomepageSteps.title.part2')}</span>{' '}
                        <span className="bg-gradient-to-r from-purple-600 to-purple-700 bg-clip-text text-transparent">{t('HomepageSteps.title.part3')}</span>
                    </h2>

                    <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        {t('HomepageSteps.description')}
                    </p>
                </div>

                {/* Main Content Sections */}
                <div className="space-y-24">
                    {benefits.map((benefit, index) => (
                        <BenefitSection key={index} benefit={benefit} index={index} isReverse={index % 2 === 1} />
                    ))}
                </div>

                {/* Featured Image Section */}
                <div className="mt-24 mb-20">
                    <div className="relative max-w-5xl mx-auto animate-fade-in-scale" style={{ animationDelay: '2s' }}>
                        <div className="relative group">
                            {/* Clean, modern image container */}
                            <div className="relative overflow-hidden rounded-2xl shadow-lg">
                                <img src={appPreviewImage} alt="Resume Builder Interface Preview" className="w-full h-auto object-cover" loading="lazy" />
                            </div>

                            {/* Clean floating badge */}
                            <div className="absolute -bottom-4 -right-4 bg-white rounded-xl shadow-md p-3 animate-float">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                                        <FiZap className="w-5 h-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{t('HomepageSteps.badges.aiPowered.title')}</p>
                                        <p className="text-xs text-gray-500">{t('HomepageSteps.badges.aiPowered.subtitle')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Clean success indicator */}
                            <div className="absolute -top-4 -left-4 bg-white rounded-xl shadow-md p-3 animate-float" style={{ animationDelay: '1s' }}>
                                <div className="text-center">
                                    <p className="text-xl font-bold text-green-600">{t('HomepageSteps.badges.atsOptimized.title')}</p>
                                    <p className="text-xs text-gray-500 font-medium">{t('HomepageSteps.badges.atsOptimized.subtitle')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Enhanced CTA Section */}
                <div className="text-center space-y-6">
                    <h3 className="text-2xl md:text-3xl font-bold text-gray-900 animate-fade-in-up" style={{ animationDelay: '2.2s' }}>
                        {t('HomepageSteps.cta.title')}
                    </h3>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '2.3s' }}>
                        {t('HomepageSteps.cta.description')}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up" style={{ animationDelay: '2.4s' }}>
                        <a
                            href="/sign-up"
                            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/25 group">
                            {t('HomepageSteps.cta.button')}
                            <FiArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" />
                        </a>

                        <p className="text-sm text-gray-500">{t('HomepageSteps.cta.noCredit')}</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HomepageBenefitsPolished;
