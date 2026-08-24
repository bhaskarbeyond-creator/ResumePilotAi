import { FaPen } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';
import Checkimage from '../../../assets/check.png';
import { getSubscriptionStatus } from '../../../firestore/dbOperations';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const HomepagePricing = ({ nextStep, t }) => {
    const [pricingData, setPricingData] = useState({
        currency: '',
        monthly: null,
        quartarly: null,
        yearly: null,
        isLoading: true,
    });

    const navigate = useNavigate();
    const location = useLocation();
    const isHomepage = location.pathname === '/';

    // Function to handle plan selection based on current page
    const handlePlanSelection = (planType) => {
        if (isHomepage) {
            // If on homepage, navigate to billing/plans
            navigate('/billing/plans');
        } else {
            // Otherwise use the nextStep function
            nextStep(planType);
        }
    };

    useEffect(() => {
        // Fetch pricing data directly in this component
        getSubscriptionStatus().then((data) => {
            setPricingData({
                monthly: data.monthlyPrice || 199,
                quartarly: data.quartarlyPrice || 399,
                yearly: data.yearlyPrice || 499,
                currency: data.currency === 'USD' ? '$' : (data.currency === 'EUR' ? '€' : (data.currency === 'GBP' ? '£' : '₹')),
                isLoading: false,
            });
        });
    }, []);

    const { currency, monthly, quartarly, yearly } = pricingData;
    return (
        <section id="pricing" className="py-20 scroll-mt-20 relative ">
            {/* Enhanced Background decorative elements */}
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/4 left-10 w-80 h-80 bg-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-0 right-10 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 bg-cyan-400/15 rounded-full blur-2xl animate-pulse delay-500"></div>
                <div className="absolute top-0 right-1/4 w-48 h-48 bg-indigo-400/10 rounded-full blur-xl animate-pulse delay-700"></div>
            </div>

            {/* Gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent -z-5"></div>

            <div className="max-w-7xl mx-auto px-4 relative z-10">
                {/* Enhanced Header section */}
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full backdrop-blur-sm hover:bg-[#4a6cf7]/15 transition-all duration-300 shadow-sm">
                        <FaPen className="w-4 h-4" />
                        {t('HomepagePricing.badge')}
                    </div>
                    <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight leading-tight">{t('HomepagePricing.header')}</h2>
                    <p className="text-gray-600 text-xl max-w-3xl mx-auto leading-relaxed">{t('HomepagePricing.description')}</p>
                </div>

                {/* Enhanced Pricing cards container with proper spacing for badges */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-16 relative px-4 pt-8 pb-4">
                    {/* Pricing Card 1 - Monthly */}
                    <div className="group relative h-full overflow-visible rounded-2xl transition-all duration-500 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-2 transform-gpu">
                        {/* Enhanced glass effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/95 to-white/85 backdrop-blur-xl border border-white/20 rounded-2xl"></div>

                        {/* Enhanced decorative elements */}
                        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-400/20 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
                        <div className="absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 blur-2xl group-hover:scale-110 transition-transform duration-700 delay-100"></div>

                        {/* Animated gradient border */}
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-x p-0.5">
                            <div className="h-full w-full rounded-2xl bg-white/90 backdrop-blur-xl"></div>
                        </div>

                        {/* Left accent bar with animation */}
                        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-blue-500 to-cyan-400 opacity-70 group-hover:opacity-100 group-hover:w-2 transition-all duration-300 rounded-l-2xl"></div>

                        {/* Content container */}
                        <div className="relative p-8 flex flex-col h-full z-10">
                            {/* Plan header */}
                            <div className="mb-8">
                                <div className="flex items-center gap-4 mb-6">
                                    {/* Enhanced plan icon */}
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg text-white group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                    </div>

                                    {/* Plan name */}
                                    <div>
                                        <h3 className="font-bold text-2xl text-gray-900 mb-1">{t('HomepagePricing.plans.monthly.title')}</h3>
                                        <p className="text-gray-500 text-base">{t('HomepagePricing.plans.monthly.description', { currency: currency, price: monthly })}</p>
                                    </div>
                                </div>

                                {/* Pricing */}
                                <div className="mb-4">
                                    <div className="flex items-baseline gap-2 text-gray-800">
                                        <span className="text-lg opacity-80">{currency}</span>
                                        <span className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                                            {monthly !== null &&
                                                monthly?.toLocaleString('en-US', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                        </span>
                                        <span className="text-lg opacity-80">/{t('HomepagePricing.plans.monthly.perMonth')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="mt-auto">
                                {/* Enhanced features list */}
                                <div className="space-y-4 mb-8">
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 group-hover/item:scale-125 group-hover/item:bg-blue-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.unlimitedPDF')}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 group-hover/item:scale-125 group-hover/item:bg-blue-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.unlimitedResumes')}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 group-hover/item:scale-125 group-hover/item:bg-blue-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.nonRecurring')}</span>
                                    </div>
                                </div>

                                {/* Enhanced button */}
                                <div className="mb-6">
                                    <button
                                        onClick={() => handlePlanSelection('monthly')}
                                        className="w-full py-4 px-6 bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95">
                                        {t('HomepagePricing.upgradeButton')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pricing Card 2 - Half Year (Most Popular) */}
                    <div className="group relative h-full overflow-visible rounded-2xl transition-all duration-500 hover:shadow-2xl hover:shadow-purple-500/30 scale-105 lg:scale-110 hover:scale-110 lg:hover:scale-115 z-20 transform-gpu">
                        {/* Enhanced glass effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/95 to-white/85 backdrop-blur-xl border-2 border-purple-200/50 rounded-2xl"></div>

                        {/* Enhanced decorative elements */}
                        <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-500/30 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
                        <div className="absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 blur-2xl group-hover:scale-110 transition-transform duration-700 delay-100"></div>

                        {/* Animated gradient border */}
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 p-0.5 group-hover:p-1 transition-all duration-500 animate-gradient-x">
                            <div className="h-full w-full rounded-2xl bg-white/90 backdrop-blur-xl"></div>
                        </div>

                        {/* Enhanced popular badge - positioned to be fully visible */}
                        <div className="absolute -top-4 left-0 right-0 z-30 flex justify-center">
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2.5 text-center text-sm font-bold text-white shadow-xl hover:shadow-2xl transition-shadow duration-300 hover:scale-105 rounded-full">
                                {t('HomepagePricing.plans.halfYear.mostPopular')}
                            </div>
                        </div>

                        {/* Content container with extra top padding for badges */}
                        <div className="relative p-8 pt-12 flex flex-col h-full z-10">
                            {/* Plan header */}
                            <div className="mb-8">
                                <div className="flex items-center gap-4 mb-6">
                                    {/* Enhanced plan icon */}
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg text-white group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86.46l1.92-6.02A1 1 0 0 0 11 14z" />
                                        </svg>
                                    </div>

                                    {/* Plan name */}
                                    <div>
                                        <h3 className="font-bold text-2xl text-gray-900 mb-1">{t('HomepagePricing.plans.halfYear.title')}</h3>
                                        <p className="text-gray-500 text-base">{t('HomepagePricing.plans.halfYear.description', { currency: currency, price: quartarly })}</p>
                                    </div>
                                </div>

                                {/* Pricing */}
                                <div className="mb-4">
                                    <div className="flex items-baseline gap-2 text-purple-600">
                                        <span className="text-lg opacity-80">{currency}</span>
                                        <span className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                                            {(quartarly / 6).toLocaleString('en-US', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        <span className="text-lg opacity-80">/{t('HomepagePricing.plans.halfYear.perMonth')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="mt-auto">
                                {/* Enhanced features list */}
                                <div className="space-y-4 mb-8">
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 group-hover/item:scale-125 group-hover/item:bg-purple-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.unlimitedPDF')}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 group-hover/item:scale-125 group-hover/item:bg-purple-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.unlimitedResumes')}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 group-hover/item:scale-125 group-hover/item:bg-purple-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.nonRecurring')}</span>
                                    </div>
                                </div>

                                {/* Enhanced button */}
                                <div className="mb-6">
                                    <button
                                        onClick={() => nextStep('halfYear')}
                                        className="w-full py-4 px-6 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 ring-2 ring-purple-500/20 hover:ring-purple-500/40">
                                        {t('HomepagePricing.upgradeButtonStar')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pricing Card 3 - Yearly */}
                    <div className="group relative h-full overflow-visible rounded-2xl transition-all duration-500 hover:shadow-2xl hover:shadow-orange-500/20 hover:-translate-y-2 transform-gpu">
                        {/* Enhanced glass effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/95 to-white/85 backdrop-blur-xl border border-white/20 rounded-2xl"></div>

                        {/* Enhanced decorative elements */}
                        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>
                        <div className="absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 blur-2xl group-hover:scale-110 transition-transform duration-700 delay-100"></div>

                        {/* Animated gradient border */}
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-x p-0.5">
                            <div className="h-full w-full rounded-2xl bg-white/90 backdrop-blur-xl"></div>
                        </div>

                        {/* Left accent bar with animation */}
                        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-amber-500 to-orange-500 opacity-70 group-hover:opacity-100 group-hover:w-2 transition-all duration-300 rounded-l-2xl"></div>

                        {/* Content container */}
                        <div className="relative p-8 flex flex-col h-full z-10">
                            {/* Plan header */}
                            <div className="mb-8">
                                <div className="flex items-center gap-4 mb-6">
                                    {/* Enhanced plan icon */}
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg text-white group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                                        </svg>
                                    </div>

                                    {/* Plan name */}
                                    <div>
                                        <h3 className="font-bold text-2xl text-gray-900 mb-1">{t('HomepagePricing.plans.yearly.title')}</h3>
                                        <p className="text-gray-500 text-base">{t('HomepagePricing.plans.yearly.description', { currency: currency, price: yearly })}</p>
                                    </div>
                                </div>

                                {/* Pricing */}
                                <div className="mb-4">
                                    <div className="flex items-baseline gap-2 text-gray-800">
                                        <span className="text-lg opacity-80">{currency}</span>
                                        <span className="text-5xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                                            {(yearly / 12).toLocaleString('en-US', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        <span className="text-lg opacity-80">/{t('HomepagePricing.plans.yearly.perMonth')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="mt-auto">
                                {/* Enhanced features list */}
                                <div className="space-y-4 mb-8">
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 group-hover/item:scale-125 group-hover/item:bg-amber-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.unlimitedPDF')}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 group-hover/item:scale-125 group-hover/item:bg-amber-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.unlimitedResumes')}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-gray-600 group/item">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 group-hover/item:scale-125 group-hover/item:bg-amber-500/20 transition-all duration-300">
                                            <img src={Checkimage} alt="check" className="w-4 h-4" />
                                        </div>
                                        <span className="text-base group-hover/item:text-gray-700 transition-colors duration-300">{t('HomepagePricing.features.nonRecurring')}</span>
                                    </div>
                                </div>

                                {/* Enhanced button */}
                                <div className="mb-6">
                                    <button
                                        onClick={() => handlePlanSelection('yearly')}
                                        className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95">
                                        {t('HomepagePricing.upgradeButton')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes gradient-x {
                    0%,
                    100% {
                        background-size: 200% 200%;
                        background-position: left center;
                    }
                    50% {
                        background-size: 200% 200%;
                        background-position: right center;
                    }
                }
                .animate-gradient-x {
                    animation: gradient-x 3s ease infinite;
                }
            `}</style>
        </section>
    );
};

const MyComponent = withTranslation('common')(HomepagePricing);
export default MyComponent;
