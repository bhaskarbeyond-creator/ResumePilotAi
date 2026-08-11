import React from 'react';
import { withTranslation } from 'react-i18next';
import { FiSearch, FiFileText, FiSend, FiBriefcase, FiCheckCircle, FiStar } from 'react-icons/fi';
import { BiUser, BiBuilding } from 'react-icons/bi';
import { Link } from 'react-router-dom';

const ArrowSVG = ({ className = '' }) => (
    <svg className={`w-8 h-8 text-blue-400 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
);

const CurvedArrowSVG = ({ className = '' }) => (
    <svg className={`w-12 h-12 text-blue-300 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4c4 0 8 2 8 8" />
    </svg>
);

const ProcessStep = ({ step, index, isLast }) => (
    <div className="flex flex-col items-center text-center group">
        {/* Step Number & Icon */}
        <div className="relative mb-6">
            {/* Step Number Badge */}
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#4a6cf7] text-white text-xs font-bold rounded-full flex items-center justify-center z-10 shadow-md">{index + 1}</div>

            {/* Icon Container */}
            <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110 border border-blue-200/50">
                <step.icon className="w-8 h-8 text-[#4a6cf7] group-hover:scale-110 transition-transform duration-300" />
            </div>
        </div>

        {/* Content */}
        <div className="max-w-xs">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 group-hover:text-[#4a6cf7] transition-colors duration-300">{step.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
        </div>

        {/* Arrow (except for last step) */}
        {!isLast && (
            <div className="hidden lg:block absolute top-8 left-full transform translate-x-4 z-0">
                <ArrowSVG className="animate-pulse" />
            </div>
        )}
    </div>
);

const LandingJobsProcess = ({ t }) => {
    const steps = [
        {
            icon: FiSearch,
            title: t('JobsUpdate.LandingJobsProcess.steps.0.title', 'Search & Discover'),
            description: t(
                'JobsUpdate.LandingJobsProcess.steps.0.description',
                'Browse thousands of job opportunities from top companies. Use our advanced filters to find the perfect match for your skills and preferences.'
            ),
        },
        {
            icon: BiUser,
            title: t('JobsUpdate.LandingJobsProcess.steps.1.title', 'Create Profile'),
            description: t(
                'JobsUpdate.LandingJobsProcess.steps.1.description',
                'Build your professional profile with our resume builder. Showcase your skills, experience, and achievements to stand out from the crowd.'
            ),
        },
        {
            icon: FiSend,
            title: t('JobsUpdate.LandingJobsProcess.steps.2.title', 'Apply Instantly'),
            description: t('JobsUpdate.LandingJobsProcess.steps.2.description', 'Apply to multiple jobs with one click. Our smart application system automatically tailors your profile to each position.'),
        },
        {
            icon: FiBriefcase,
            title: t('JobsUpdate.LandingJobsProcess.steps.3.title', 'Get Hired'),
            description: t('JobsUpdate.LandingJobsProcess.steps.3.description', 'Connect with hiring managers, schedule interviews, and land your dream job. We support you throughout the entire process.'),
        },
    ];

    const features = [
        {
            icon: FiCheckCircle,
            title: t('JobsUpdate.LandingJobsProcess.features.0.title', 'AI-Powered Matching'),
            description: t('JobsUpdate.LandingJobsProcess.features.0.description', 'Our intelligent algorithm matches you with relevant opportunities'),
        },
        {
            icon: FiFileText,
            title: t('JobsUpdate.LandingJobsProcess.features.1.title', 'Resume Optimization'),
            description: t('JobsUpdate.LandingJobsProcess.features.1.description', 'Automatically optimize your resume for each application'),
        },
        {
            icon: BiBuilding,
            title: t('JobsUpdate.LandingJobsProcess.features.2.title', 'Verified Companies'),
            description: t('JobsUpdate.LandingJobsProcess.features.2.description', 'All employers are verified for authenticity and quality'),
        },
    ];

    return (
        <section className="py-16 sm:py-20 md:py-24">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-16 sm:mb-20">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <FiStar className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('JobsUpdate.LandingJobsProcess.badge', 'How It Works')}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
                        {t('JobsUpdate.LandingJobsProcess.title', 'Land Your Dream Job in')}
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800">
                            {t('JobsUpdate.LandingJobsProcess.titleHighlight', '4 Simple Steps')}
                        </span>
                    </h2>

                    {/* Description */}
                    <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                        {t(
                            'JobsUpdate.LandingJobsProcess.description',
                            'Our streamlined process makes job searching effortless. From discovery to hiring, we guide you every step of the way to ensure you find the perfect opportunity.'
                        )}
                    </p>
                </div>

                {/* Process Steps */}
                <div className="relative mb-16 sm:mb-20">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 relative">
                        {steps.map((step, index) => (
                            <ProcessStep key={index} step={step} index={index} isLast={index === steps.length - 1} />
                        ))}
                    </div>

                    {/* Mobile Arrows */}
                    <div className="lg:hidden flex justify-center mt-8 space-x-4">
                        {steps.slice(0, -1).map((_, index) => (
                            <CurvedArrowSVG key={index} className="opacity-30" />
                        ))}
                    </div>
                </div>

                {/* Features Section */}
                <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl p-8 sm:p-12 mb-12 sm:mb-16">
                    <div className="text-center mb-10">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4">{t('JobsUpdate.LandingJobsProcess.featuresTitle', 'Why Choose Our Platform?')}</h3>
                        <p className="text-gray-600 max-w-2xl mx-auto">
                            {t('JobsUpdate.LandingJobsProcess.featuresDescription', 'We provide cutting-edge tools and features to make your job search more effective and efficient.')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                        {features.map((feature, index) => (
                            <div key={index} className="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md border border-gray-200/60 hover:shadow-lg transition-all duration-300 group text-center">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <feature.icon className="w-6 h-6 text-[#4a6cf7]" />
                                </div>
                                <h4 className="font-semibold text-gray-900 mb-2 group-hover:text-[#4a6cf7] transition-colors duration-300">{feature.title}</h4>
                                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA Section */}
                <div className="text-center">
                    <div className="bg-gradient-to-r from-[#4a6cf7] to-[#3b5ce6] rounded-2xl p-8 sm:p-12 text-white">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4">{t('JobsUpdate.LandingJobsProcess.cta.title', 'Ready to Start Your Journey?')}</h3>
                        <p className="text-blue-100 mb-8 max-w-2xl mx-auto">
                            {t(
                                'JobsUpdate.LandingJobsProcess.cta.description',
                                'Join thousands of professionals who have found their dream jobs through our platform. Your next opportunity is just a click away.'
                            )}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link to="/jobs/portal" className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#4a6cf7] rounded-lg hover:bg-gray-50 transition-all duration-300 font-semibold text-base shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]">
                                <FiSearch className="w-5 h-5" />
                                <span>{t('JobsUpdate.LandingJobsProcess.cta.searchButton', 'Start Job Search')}</span>
                            </Link>
                            <Link to="/dashboard" className="inline-flex items-center gap-2 px-8 py-4 bg-transparent border-2 border-white text-white rounded-lg hover:bg-white hover:text-[#4a6cf7] transition-all duration-300 font-semibold text-base transform hover:scale-[1.02] active:scale-[0.98]">
                                <BiUser className="w-5 h-5" />
                                <span>{t('JobsUpdate.LandingJobsProcess.cta.profileButton', 'Create Profile')}</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const MyComponent = withTranslation('common')(LandingJobsProcess);
export default MyComponent;
