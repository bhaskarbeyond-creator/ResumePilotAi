import { useState, useEffect, useRef, useContext } from 'react';
import { FiArrowUpRight, FiPlay } from 'react-icons/fi';
import { BiFile, BiCheckCircle } from 'react-icons/bi';
import GridBackground from './GridBackground';
import { withTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../main';
import AuthWrapper from '../../auth/authWrapper/AuthWrapper';
import { motion, AnimatePresence } from 'framer-motion';
// Optimized sentences for better impact - will be loaded from translations
const defaultSentences = [
    'Build professional resumes with AI',
    'Choose from 50+ expert templates',
    'Get intelligent writing assistance',
    'Preview changes in real-time',
    'Ace interviews with AI prep tools',
];

const HomepageHero = ({ t, goToResumeSelectionStep, goToCoverSelection, _goToStepByStepBuilder, _goToPortfolioBuilder }) => {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const [displayText, setDisplayText] = useState('');
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const [isTyping, setIsTyping] = useState(true);
    const [cursorVisible, setCursorVisible] = useState(true);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [loadDemoIframe, setLoadDemoIframe] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setLoadDemoIframe(true), 1200);
        return () => clearTimeout(timer);
    }, []);

    // Use translated sentences if available or fall back to defaults
    const sentences = [
        t('HomepageHero.typingEffect.sentence1', defaultSentences[0]),
        t('HomepageHero.typingEffect.sentence2', defaultSentences[1]),
        t('HomepageHero.typingEffect.sentence3', defaultSentences[2]),
        t('HomepageHero.typingEffect.sentence4', defaultSentences[3]),
        t('HomepageHero.typingEffect.sentence5', defaultSentences[4]),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayText, isTyping, currentSentenceIndex]);

    useEffect(() => {
        const cursorInterval = setInterval(() => {
            setCursorVisible((prev) => !prev);
        }, 500);

        return () => clearInterval(cursorInterval);
    }, []);

    // Handle portfolio button click
    const handlePortfolioClick = () => {
        if (user) {
            // User is logged in, navigate to portfolio builder
            navigate('/portfolio/builder');
        } else {
            // User is not logged in, show auth modal
            setIsAuthModalOpen(true);
        }
    };

    // Close auth modal
    const closeAuthModal = () => {
        setIsAuthModalOpen(false);
    };

    return (
        <section className="relative min-h-screen py-6 sm:py-12 md:py-16 lg:py-24 overflow-hidden">
            {/* Square Pattern Background */}

            {/* Background Elements */}
            <div className="absolute top-10 right-4 sm:top-20 sm:right-20 w-48 h-48 sm:w-72 sm:h-72 bg-gradient-to-br from-blue-400/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" />
            <div
                className="absolute bottom-10 left-4 sm:bottom-20 sm:left-20 w-64 h-64 sm:w-96 sm:h-96 bg-gradient-to-tr from-purple-400/15 to-pink-500/15 rounded-full blur-3xl animate-pulse"
                style={{ animationDelay: '1s' }}
            />

            <div className="relative z-10 w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                {/* Header Content */}
                <div className="text-center w-full  mx-auto mb-8 sm:mb-12 md:mb-16 lg:mb-20">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <BiFile className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('HomepageHero.badge')}
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
                        {t('HomepageHero.description')}
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mb-8 sm:mb-12 md:mb-16 px-2 sm:px-4 md:px-0">
                        {/* Quick Builder - Primary */}
                        <button
                            onClick={() => goToResumeSelectionStep && goToResumeSelectionStep()}
                            className=" cursor-pointer relative flex items-center justify-center gap-2 px-5 py-3 bg-[#4a6cf7] text-white rounded-lg hover:bg-[#3b5ce6] transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px] group">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>{t('missing1.quickBuilder.title', 'Quick')}</span>
                            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                {t('missing1.quickBuilder.badge', 'RECOMMENDED')}
                            </span>
                        </button>

                        {/* Step-by-Step Builder - Secondary */}
                        <a
                            href="/build-resume/heading"
                            className="relative flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#4a6cf7] text-[#4a6cf7] rounded-lg hover:bg-blue-50 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px] group">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{t('missing1.stepByStep.title', 'Guided')}</span>
                            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                {t('missing1.stepByStep.badge', 'NEW')}
                            </span>
                        </a>

                        {/* Portfolio Builder */}
                        <button
                            onClick={handlePortfolioClick}
                            className="relative flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px] group cursor-pointer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                            </svg>
                            <span>{t('missing1.portfolioBuilder.title', 'Portfolio')}</span>
                            <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                {t('missing1.portfolioBuilder.badge', 'NEW')}
                            </span>
                        </button>

                        {/* Cover Letter */}
                        <button
                            onClick={() => goToCoverSelection && goToCoverSelection()}
                            className=" cursor-pointer flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg min-w-[140px]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <span>{t('HomepageHero.createCoverLetter', 'Cover Letter')}</span>
                        </button>
                    </div>

                    {/* Simple explanation */}
                    <div className="text-center text-xs text-gray-500 mb-6 max-w-lg mx-auto">
                        <span className="font-medium text-[#4a6cf7]">{t('HomepageHero.quick', 'Quick')}</span> - {t('HomepageHero.quickDesc', 'Choose template & write')} •{' '}
                        <span className="font-medium text-[#4a6cf7]">{t('HomepageHero.guided', 'Guided')}</span> - {t('HomepageHero.guidedDesc', 'AI-powered step-by-step')} •{' '}
                        <span className="font-medium text-purple-600">{t('HomepageHero.portfolio', 'Portfolio')}</span> - {t('HomepageHero.portfolioDesc', 'Drag & drop website builder')}
                    </div>

                    {/* Product conditions — factual, non-quantified, and mobile responsive. */}
                    <div className="flex items-center justify-center text-gray-600 bg-white/80 backdrop-blur-sm p-3 sm:p-4 md:p-5 rounded-2xl shadow-sm border border-blue-100/50 hover:shadow-md transition-all duration-300 ease-out mx-2 sm:mx-auto w-auto max-w-3xl">
                        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-md flex-wrap justify-center">
                            <div className="flex items-center gap-1.5 bg-green-50/80 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-green-100 hover:bg-green-100/80 transition-all duration-300 ease-out">
                                <BiCheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                                <span className="font-medium text-green-700">{t('HomepageHero.features.freeToStart')}</span>
                            </div>
                            <div className="flex items- center gap-1.5 bg-blue-50/80 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-blue-100 hover:bg-blue-100/80 transition-all duration-300 ease-out">
                                <BiCheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-[#4a6cf7]" />
                                <span className="font-medium text-blue-700">{t('HomepageHero.features.noCreditCard')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Redesigned Video Section */}
                <div className="relative w-full max-w-6xl mx-auto px-2 sm:px-4 md:px-0">
                    {/* Floating Elements */}
                    <div
                        className="absolute -top-4 sm:-top-8 -left-4 sm:-left-8 w-8 h-8 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl sm:rounded-2xl rotate-12 opacity-80 animate-bounce"
                        style={{ animationDelay: '0s', animationDuration: '3s' }}
                    />
                    <div
                        className="absolute -top-2 sm:-top-4 -right-6 sm:-right-12 w-6 h-6 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg sm:rounded-xl -rotate-12 opacity-70 animate-bounce"
                        style={{ animationDelay: '1s', animationDuration: '3s' }}
                    />
                    <div
                        className="absolute -bottom-3 sm:-bottom-6 -left-3 sm:-left-6 w-10 h-10 sm:w-20 sm:h-20 bg-gradient-to-br from-green-400 to-blue-500 rounded-2xl sm:rounded-3xl rotate-45 opacity-60 animate-bounce"
                        style={{ animationDelay: '2s', animationDuration: '3s' }}
                    />
                    <div
                        className="absolute -bottom-4 sm:-bottom-8 -right-4 sm:-right-8 w-7 h-7 sm:w-14 sm:h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl sm:rounded-2xl -rotate-45 opacity-75 animate-bounce"
                        style={{ animationDelay: '0.5s', animationDuration: '3s' }}
                    />

                    {/* Main Video Container */}
                    <div className="relative z-1000 ">
                        {/* Glow Effect */}
                        <div className="absolute -inset-2 sm:-inset-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl sm:rounded-3xl blur-xl sm:blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-500" />

                        {/* Video Frame */}
                        {/* Video Content */}
                        <div className="relative ">
                            <div
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    aspectRatio: '16/9',
                                    minHeight: '200px',
                                }}
                                className="min-h-[200px] sm:min-h-[300px] md:min-h-[400px]">
                                <div
                                    style={{
                                        position: 'relative',
                                        boxSizing: 'content-box',
                                        zIndex: 1000,
                                        maxHeight: '80svh',
                                        width: '100%',
                                        height: '100%',
                                        aspectRatio: '1.9930795847750864',
                                        padding: '0px 0 0px 0px',
                                    }}>
                                    {loadDemoIframe ? (
                                        <iframe
                                            src="https://app.supademo.com/embed/cmbhuzzr76b1dsn1reikdvlaq?v_email=EMAIL&embed_v=2"
                                            loading="lazy"
                                            title="Supademo Demo"
                                            allow="clipboard-write"
                                            frameBorder="0"
                                            webkitallowfullscreen="true"
                                            mozallowfullscreen="true"
                                            allowFullScreen
                                            style={{
                                                position: 'absolute',
                                                top: '0',
                                                left: '0',
                                                width: '100%',
                                                height: '100%',
                                            }}></iframe>
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/5 rounded-2xl text-slate-400 text-xs font-bold">
                                            <span>Loading Interactive Demo...</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Play Button Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20 rounded-b-2xl sm:rounded-b-3xl">
                                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform duration-200 cursor-pointer">
                                    <FiPlay className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 ml-1" />
                                </div>
                            </div>
                        </div>

                        {/* Corner Accents */}
                        {/* <div className="absolute top-8 left-8 w-4 h-4 border-t-3 border-l-3 border-blue-500 rounded-tl-lg" />
            <div className="absolute top-8 right-8 w-4 h-4 border-t-3 border-r-3 border-purple-500 rounded-tr-lg" />
            <div className="absolute bottom-8 left-8 w-4 h-4 border-b-3 border-l-3 border-green-500 rounded-bl-lg" />
            <div className="absolute bottom-8 right-8 w-4 h-4 border-b-3 border-r-3 border-pink-500 rounded-br-lg" /> */}
                    </div>
                </div>
            </div>

            {/* Auth Modal */}
            <AnimatePresence>
                {isAuthModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-[10001]">
                        <AuthWrapper closeModal={closeAuthModal} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Custom Animations */}
            <style>{`
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

                @keyframes shine {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(100%);
                    }
                }

                /* Mobile-specific optimizations */
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

                /* Custom xs breakpoint */
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

const MyComponent = withTranslation('common')(HomepageHero);
export default MyComponent;
