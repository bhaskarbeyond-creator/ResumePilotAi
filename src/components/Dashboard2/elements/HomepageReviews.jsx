import { useState, useEffect, useRef, useCallback } from 'react';
import { FaChevronLeft, FaChevronRight, FaStar, FaCheck, FaQuoteLeft, FaQuoteRight, FaPause, FaPlay, FaPen } from 'react-icons/fa';
import { getAllReviews } from '../../../firestore/dbOperations';
import { useTranslation } from 'react-i18next';
const HomepageReviews = () => {
    const { t } = useTranslation('common');
    const [currentSlide, setCurrentSlide] = useState(0);
    const [totalSlides, setTotalSlides] = useState(1); // Will be updated based on actual reviews
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const [isTouching, setIsTouching] = useState(false);
    const [touchStart, setTouchStart] = useState(0);
    const [touchEnd, setTouchEnd] = useState(0);
    const slideContainerRef = useRef(null);
    const autoPlayTimerRef = useRef(null);
    const sectionRef = useRef(null);
    const [reviews, setReviews] = useState([]);

    // Calculate slide width based on screen size
    const getSlideWidth = () => {
        if (typeof window !== 'undefined') {
            if (window.innerWidth >= 1024) {
                // lg
                return 33.33; // 3 cards per view
            } else if (window.innerWidth >= 768) {
                // md
                return 33.33; // 3 cards per view
            }
        }
        return 100; // 1 card per view on smaller screens
    };

    // Get cards per view to calculate max slides
    const getCardsPerView = () => {
        if (typeof window !== 'undefined') {
            if (window.innerWidth >= 768) {
                return 3; // 3 cards per view on md and larger
            }
        }
        return 1; // 1 card per view on smaller screens
    };

    // Handle previous slide
    const prevSlide = useCallback(() => {
        setCurrentSlide((prev) => (prev > 0 ? prev - 1 : 0));
        resetAutoPlayTimer();
    }, []);

    // Handle next slide
    const nextSlide = useCallback(() => {
        setCurrentSlide((prev) => (prev < totalSlides - 1 ? prev + 1 : prev));
        resetAutoPlayTimer();
    }, [totalSlides]);

    // Handle dot navigation
    const goToSlide = useCallback((index) => {
        setCurrentSlide(index);
        resetAutoPlayTimer();
    }, []);

    // Toggle autoplay
    const toggleAutoPlay = () => {
        setIsAutoPlaying((prev) => !prev);
    };

    // Reset the autoplay timer
    const resetAutoPlayTimer = () => {
        if (autoPlayTimerRef.current) {
            clearTimeout(autoPlayTimerRef.current);
            autoPlayTimerRef.current = null;
        }

        if (isAutoPlaying) {
            autoPlayTimerRef.current = setTimeout(() => {
                setCurrentSlide(
                    (prev) => (prev < totalSlides - 1 ? prev + 1 : 0) // Loop back to first slide
                );
            }, 5000);
        }
    };

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e) => {
            if (e.key === 'ArrowLeft') {
                prevSlide();
            } else if (e.key === 'ArrowRight') {
                nextSlide();
            }
        },
        [prevSlide, nextSlide]
    );

    // Touch handlers for mobile swipe
    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
        setIsTouching(true);
    };

    const handleTouchMove = (e) => {
        if (isTouching) {
            setTouchEnd(e.targetTouches[0].clientX);
        }
    };

    const handleTouchEnd = () => {
        setIsTouching(false);

        // Minimum swipe distance threshold (px)
        const minSwipeDistance = 50;
        const distance = touchStart - touchEnd;

        if (Math.abs(distance) >= minSwipeDistance) {
            if (distance > 0) {
                // Swipe left, go to next slide
                nextSlide();
            } else {
                // Swipe right, go to previous slide
                prevSlide();
            }
        }
    };

    // Calculate the maximum translation based on total slides and cards
    const calculateMaxTranslation = () => {
        // Count how many review cards we actually have
        const totalReviewCards = reviews.length;
        const cardsPerView = getCardsPerView();

        // Calculate how many slide positions we need (total cards - cards per view + 1)
        const maxSlidePositions = Math.max(0, totalReviewCards - cardsPerView + 1);

        // Return one less than max slide positions (since we're 0-indexed)
        return Math.max(0, maxSlidePositions - 1);
    };

    // Calculate the exact percentage to shift for the last slide
    const calculateLastSlideTranslation = () => {
        const totalReviewCards = reviews.length;
        const cardsPerView = getCardsPerView();
        const cardWidth = getSlideWidth();

        // For the last position, we need to calculate exactly how far to translate
        // so that the last card is fully visible
        const visibleCards = Math.min(cardsPerView, totalReviewCards);
        const totalCardsWidth = totalReviewCards * cardWidth;
        const viewportWidth = visibleCards * cardWidth;

        // Calculate the maximum translation needed (as a percentage)
        // This ensures the last card is fully visible
        return Math.max(0, totalCardsWidth - viewportWidth);
    };

    // Update slide position whenever currentSlide changes
    useEffect(() => {
        if (slideContainerRef.current) {
            const slideWidth = getSlideWidth();

            // For the last slide, adjust the translation to ensure all items are visible
            const maxTranslation = calculateMaxTranslation();
            const isLastPosition = currentSlide >= maxTranslation;

            // If we're at the last position, calculate the exact translation needed
            // to show the last items completely
            if (isLastPosition) {
                // Use our improved calculation that ensures the last card is fully visible
                const lastSlideTranslation = calculateLastSlideTranslation();
                slideContainerRef.current.style.transform = `translateX(-${lastSlideTranslation}%)`;
            } else {
                // Normal translation for non-last slides
                slideContainerRef.current.style.transform = `translateX(-${currentSlide * slideWidth}%)`;
            }
        }
    }, [currentSlide]);

    // Update total slides on window resize, initial load, or when reviews change
    useEffect(() => {
        const handleResize = () => {
            // Calculate total slides based on total cards and cards per view
            const totalReviewCards = reviews.length;
            const cardsPerView = getCardsPerView();

            // Update total slides (groups)
            // Formula: Math.ceil(totalCards / cardsPerView)
            // For a more precise calculation when we're showing complete slide groups
            const newTotalSlides = Math.max(1, Math.ceil(totalReviewCards / cardsPerView));
            setTotalSlides(newTotalSlides);

            // Ensure current slide is still in range after resize
            if (currentSlide >= newTotalSlides) {
                setCurrentSlide(newTotalSlides - 1);
            }
        };

        // Call once on mount and set up event listener
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [currentSlide, reviews.length]);

    // Set up keyboard event listeners
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    // Reset autoplay on unmount or when relevant dependencies change
    useEffect(() => {
        resetAutoPlayTimer();
        return () => {
            if (autoPlayTimerRef.current) {
                clearTimeout(autoPlayTimerRef.current);
            }
        };
    }, [isAutoPlaying, currentSlide, totalSlides, reviews.length]);

    // Pause autoplay when hovering over the slider
    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const pauseAutoPlay = () => {
            if (isAutoPlaying) {
                if (autoPlayTimerRef.current) {
                    clearTimeout(autoPlayTimerRef.current);
                    autoPlayTimerRef.current = null;
                }
            }
        };

        const resumeAutoPlay = () => {
            if (isAutoPlaying) {
                resetAutoPlayTimer();
            }
        };

        section.addEventListener('mouseenter', pauseAutoPlay);
        section.addEventListener('mouseleave', resumeAutoPlay);

        return () => {
            section.removeEventListener('mouseenter', pauseAutoPlay);
            section.removeEventListener('mouseleave', resumeAutoPlay);
        };
    }, [isAutoPlaying]);

    const getReviews = () => {
        getAllReviews().then((reviews) => {
            setReviews(reviews);
          
        });
    };

    useEffect(() => {
        getReviews();
    }, []);
    return (
        <section ref={sectionRef} id="reviews" className="py-12 scroll-mt-20 relative overflow-hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/3 left-10 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 right-10 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-400/10 rounded-full blur-xl"></div>
            </div>
            <div className="max-w-7xl mx-auto px-4 relative z-10">
                <div className="text-center mb-12">
                    <div
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#4a6cf7] bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 rounded-full backdrop-blur-sm hover:bg-[#4a6cf7]/15 transition-all duration-300 shadow-sm"
                        style={{ opacity: 1, transform: 'translateY(20px)' }}>
                        <FaPen className="w-4 h-4" />
                        {t('HomepageReviews.badge')}
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 tracking-tight" style={{ opacity: 1, transform: 'translateY(20px)' }}>
                        {t('HomepageReviews.title.part1')}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">{t('HomepageReviews.title.part2')}</span>
                        {t('HomepageReviews.title.part3')}
                    </h2>
                    <p className="text-gray-600 text-lg max-w-2xl mx-auto" style={{ opacity: 1, transform: 'translateY(20px)' }}>
                        {t('HomepageReviews.description')}
                    </p>
                </div>
                <div className="relative max-w-7xl mx-auto px-4">
                    <button
                        onClick={prevSlide}
                        className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-20 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 text-purple-500 hover:text-white border border-gray-100 hover:bg-gradient-to-r hover:from-purple-500 hover:to-indigo-600 group ${
                            currentSlide === 0 ? 'opacity-50 cursor-not-allowed' : 'opacity-100 cursor-pointer'
                        }`}
                        tabIndex={0}
                        disabled={currentSlide === 0}>
                        <FaChevronLeft className="w-6 h-6" />
                        <span className="absolute right-full mr-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm font-medium shadow-sm">
                            {t('HomepageReviews.navigation.previous')}
                        </span>
                    </button>
                    <button
                        onClick={nextSlide}
                        className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 text-purple-500 hover:text-white border border-gray-100 hover:bg-gradient-to-r hover:from-purple-500 hover:to-indigo-600 group ${
                            currentSlide === totalSlides - 1 ? 'opacity-50 cursor-not-allowed' : 'opacity-100 cursor-pointer'
                        }`}
                        tabIndex={0}
                        disabled={currentSlide === totalSlides - 1}>
                        <FaChevronRight className="w-6 h-6" />
                        <span className="absolute left-full ml-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm font-medium shadow-sm">
                            {t('HomepageReviews.navigation.next')}
                        </span>
                    </button>
                    <div className="absolute -left-4 top-0 bottom-0 w-12 bg-gradient-to-r from-slate-50 to-transparent z-10"></div>
                    <div className="absolute -right-4 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-50 to-transparent z-10"></div>
                    <div className="overflow-hidden rounded-3xl relative">
                        <div
                            ref={slideContainerRef}
                            className="flex gap-6"
                            draggable="false"
                            style={{
                                userSelect: 'none',
                                touchAction: 'pan-y',
                                transform: 'translateX(0%)',
                                transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)', // Smoother animation curve
                                willChange: 'transform', // Performance optimization
                            }}>
                            {reviews.map((review, index) => (
                                <div key={index} className="min-w-full md:min-w-[calc(100%/3)] lg:min-w-[calc(100%/3)] p-2" tabIndex={0} style={{ opacity: 1, transform: 'none' }}>
                                    <div className="group relative h-full overflow-hidden rounded-xl transition-all duration-300 hover:shadow-lg">
                                        {/* Card with glass effect */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-sm"></div>

                                        {/* Decorative elements */}
                                        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/10 to-indigo-500/10"></div>
                                        <div className="absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10"></div>

                                        {/* Left accent bar */}
                                        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-purple-500 to-indigo-500 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>

                                        {/* Content container */}
                                        <div className="relative p-6 flex flex-col h-full">
                                            {/* Header with image and category */}
                                            <div className="flex items-center justify-between mb-5">
                                                {/* Avatar and user info */}
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        {/* Avatar glow effect */}
                                                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 blur-[2px] opacity-0 group-hover:opacity-70 transition-opacity duration-500"></div>

                                                        {/* Avatar image */}
                                                        <img
                                                            alt={t('HomepageReviews.review.avatarAlt', { name: review.name })}
                                                            loading="lazy"
                                                            width="60"
                                                            height="60"
                                                            decoding="async"
                                                            data-nimg="1"
                                                            className="rounded-full object-cover border-2 border-white shadow-md relative z-10"
                                                            src={review.imageUrl}
                                                            style={{ color: 'transparent' }}
                                                        />

                                                        {/* Verification badge */}
                                                        <div className="absolute -bottom-1 -right-1 z-20 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 p-0.5 ring-2 ring-white">
                                                            <FaCheck className="w-3 h-3 text-white" />
                                                        </div>
                                                    </div>

                                                    {/* User information */}
                                                    <div>
                                                        <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">{review.name}</h3>
                                                        <p className="text-sm text-gray-500">{review.occupation}</p>
                                                    </div>
                                                </div>

                                                {/* Category pill */}
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-purple-500/10 to-indigo-500/10 text-purple-700">
                                                    {t('HomepageReviews.review.category')}
                                                </span>
                                            </div>

                                            {/* Star rating */}
                                            <div className="flex gap-0.5 mb-4">
                                                <FaStar className="w-4 h-4 text-yellow-400" />
                                                <FaStar className="w-4 h-4 text-yellow-400" />
                                                <FaStar className="w-4 h-4 text-yellow-400" />
                                                <FaStar className="w-4 h-4 text-yellow-400" />
                                                <FaStar className="w-4 h-4 text-yellow-400" />
                                            </div>

                                            {/* Review content */}
                                            <div className="relative flex-grow">
                                                <div className="absolute -top-2 -left-1 opacity-10">
                                                    <FaQuoteLeft size={24} className="text-purple-600" />
                                                </div>
                                                <p className="text-gray-700 text-sm leading-relaxed px-3">{review.review}</p>
                                                <div className="absolute -bottom-2 -right-1 opacity-10">
                                                    <FaQuoteRight size={24} className="text-purple-600" />
                                                </div>
                                            </div>

                                            {/* Date and metadata */}
                                            <div className="mt-4 flex justify-end">
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <span className="inline-block h-1 w-1 rounded-full bg-purple-500/30"></span>
                                                    {/* random date date format */}
                                                    <p>{new Date(Date.now()).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-center items-center gap-4 mt-10">
                        {Array.from({ length: totalSlides }).map((_, index) => (
                            <button
                                key={index}
                                onClick={() => goToSlide(index)}
                                className={`relative h-3 transition-all duration-300 ${currentSlide === index ? 'w-10' : 'w-3'}`}
                                tabIndex={0}
                                aria-label={t('HomepageReviews.navigation.slideLabel', { number: index + 1 })}>
                                <span
                                    className={`absolute inset-0 rounded-full transition-all duration-300 ${
                                        currentSlide === index ? 'bg-gradient-to-r from-purple-500 to-indigo-600 scale-100 shadow-md' : 'bg-purple-200 scale-75 hover:scale-100 hover:bg-purple-300'
                                    }`}></span>
                                {currentSlide === index && isAutoPlaying && (
                                    <span
                                        className="absolute inset-0 rounded-full bg-white/20"
                                        style={{
                                            animation: 'progressAnimation 5s linear',
                                            transformOrigin: 'left',
                                        }}></span>
                                )}
                            </button>
                        ))}

                        {/* Autoplay toggle button */}
                        <button
                            onClick={toggleAutoPlay}
                            className={`ml-4 p-2 rounded-full transition-all duration-300 ${isAutoPlaying ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                            aria-label={isAutoPlaying ? t('HomepageReviews.navigation.pauseAutoplay') : t('HomepageReviews.navigation.startAutoplay')}>
                            {isAutoPlaying ? <FaPause size={16} /> : <FaPlay size={16} />}
                        </button>
                    </div>

                    {/* Add animation keyframes for the progress indicator */}
                    <style jsx="true">{`
                        @keyframes progressAnimation {
                            0% {
                                transform: scaleX(0);
                            }
                            100% {
                                transform: scaleX(1);
                            }
                        }
                    `}</style>
                </div>
            </div>
        </section>
    );
};

export default HomepageReviews;
