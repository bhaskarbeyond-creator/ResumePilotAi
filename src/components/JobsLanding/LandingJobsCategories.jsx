import React from 'react';
import { withTranslation } from 'react-i18next';
import { 
    FiCode, 
    FiTrendingUp, 
    FiPenTool, 
    FiUsers, 
    FiDollarSign, 
    FiHeart, 
    FiTool, 
    FiBookOpen,
    FiArrowRight,
    FiStar
} from 'react-icons/fi';
import { 
    BiBuilding, 
    BiChart, 
    BiShield, 
    BiCog,
    BiMicrophone,
    BiCamera
} from 'react-icons/bi';

// Job categories data
const jobCategories = [
    {
        id: 1,
        name: 'Technology',
        icon: FiCode,
        jobCount: 2847,
        description: 'Software development, AI, cybersecurity, and more',
        color: 'from-blue-500 to-blue-600',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-600',
        popular: true
    },
    {
        id: 2,
        name: 'Marketing',
        icon: FiTrendingUp,
        jobCount: 1523,
        description: 'Digital marketing, content creation, brand management',
        color: 'from-green-500 to-green-600',
        bgColor: 'bg-green-50',
        textColor: 'text-green-600',
        popular: true
    },
    {
        id: 3,
        name: 'Design',
        icon: FiPenTool,
        jobCount: 892,
        description: 'UI/UX design, graphic design, product design',
        color: 'from-purple-500 to-purple-600',
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-600',
        popular: true
    },
    {
        id: 4,
        name: 'Sales',
        icon: FiDollarSign,
        jobCount: 1756,
        description: 'Business development, account management, sales ops',
        color: 'from-orange-500 to-orange-600',
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-600',
        popular: false
    },
    {
        id: 5,
        name: 'Human Resources',
        icon: FiUsers,
        jobCount: 634,
        description: 'Talent acquisition, HR operations, people management',
        color: 'from-pink-500 to-pink-600',
        bgColor: 'bg-pink-50',
        textColor: 'text-pink-600',
        popular: false
    },
    {
        id: 6,
        name: 'Healthcare',
        icon: FiHeart,
        jobCount: 1289,
        description: 'Medical professionals, healthcare administration',
        color: 'from-red-500 to-red-600',
        bgColor: 'bg-red-50',
        textColor: 'text-red-600',
        popular: false
    },
    {
        id: 7,
        name: 'Finance',
        icon: BiChart,
        jobCount: 1045,
        description: 'Financial analysis, accounting, investment banking',
        color: 'from-indigo-500 to-indigo-600',
        bgColor: 'bg-indigo-50',
        textColor: 'text-indigo-600',
        popular: true
    },
    {
        id: 8,
        name: 'Operations',
        icon: BiCog,
        jobCount: 723,
        description: 'Business operations, project management, logistics',
        color: 'from-gray-500 to-gray-600',
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-600',
        popular: false
    },
    {
        id: 9,
        name: 'Education',
        icon: FiBookOpen,
        jobCount: 567,
        description: 'Teaching, training, educational administration',
        color: 'from-teal-500 to-teal-600',
        bgColor: 'bg-teal-50',
        textColor: 'text-teal-600',
        popular: false
    },
    {
        id: 10,
        name: 'Engineering',
        icon: FiTool,
        jobCount: 1834,
        description: 'Mechanical, electrical, civil engineering roles',
        color: 'from-yellow-500 to-yellow-600',
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-600',
        popular: false
    },
    {
        id: 11,
        name: 'Legal',
        icon: BiShield,
        jobCount: 445,
        description: 'Legal counsel, compliance, paralegal positions',
        color: 'from-slate-500 to-slate-600',
        bgColor: 'bg-slate-50',
        textColor: 'text-slate-600',
        popular: false
    },
    {
        id: 12,
        name: 'Media & Creative',
        icon: BiCamera,
        jobCount: 678,
        description: 'Content creation, photography, video production',
        color: 'from-rose-500 to-rose-600',
        bgColor: 'bg-rose-50',
        textColor: 'text-rose-600',
        popular: false
    }
];

const CategoryCard = ({ category, onClick }) => (
    <div 
        onClick={() => onClick(category)}
        className="group relative bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow-md border border-gray-200/60 hover:shadow-xl hover:border-blue-200 transition-all duration-300 cursor-pointer transform hover:scale-[1.02]"
    >
        {/* Popular Badge */}
        {category.popular && (
            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-2 py-1 rounded-full font-semibold shadow-md flex items-center gap-1">
                <FiStar className="w-3 h-3" />
                Popular
            </div>
        )}

        {/* Icon */}
        <div className={`w-14 h-14 ${category.bgColor} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
            <category.icon className={`w-7 h-7 ${category.textColor}`} />
        </div>

        {/* Content */}
        <div className="mb-4">
            <h3 className="font-semibold text-lg text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-300">
                {category.name}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
                {category.description}
            </p>
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                    {category.jobCount.toLocaleString()} jobs
                </span>
                <FiArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
            </div>
        </div>

        {/* Hover Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
);

const LandingJobsCategories = ({ t }) => {
    const handleCategoryClick = (category) => {
        // Navigate to category-specific jobs page
        window.location.href = `/jobs/category/${category.name.toLowerCase().replace(/\s+/g, '-')}`;
    };

    const handleViewAllCategories = () => {
        // Navigate to all categories page
        window.location.href = '/jobs/categories';
    };

    // Get popular categories for highlight section
    const popularCategories = jobCategories.filter(cat => cat.popular);
    const totalJobs = jobCategories.reduce((sum, cat) => sum + cat.jobCount, 0);

    return (
        <section className="py-16 sm:py-20 md:py-24">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-12 sm:mb-16">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-all duration-300 shadow-sm backdrop-blur-sm">
                        <BiBuilding className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('LandingJobsCategories.badge', 'Job Categories')}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
                        {t('LandingJobsCategories.title', 'Explore Jobs by')}
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800">
                            {t('LandingJobsCategories.titleHighlight', 'Industry & Category')}
                        </span>
                    </h2>

                    {/* Description */}
                    <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                        {t('LandingJobsCategories.description', 'Find opportunities in your field of expertise. Browse through diverse industries and discover roles that match your skills and career aspirations.')}
                    </p>
                </div>

                {/* Popular Categories Highlight */}
                <div className="bg-white/80 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-lg border border-blue-100/50 mb-12 sm:mb-16">
                    <div className="text-center mb-8">
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                            {t('LandingJobsCategories.popularTitle', 'Most Popular Categories')}
                        </h3>
                        <p className="text-gray-600">
                            {t('LandingJobsCategories.popularDescription', 'High-demand fields with the most job opportunities')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                        {popularCategories.map((category) => (
                            <div 
                                key={category.id}
                                onClick={() => handleCategoryClick(category)}
                                className="group text-center p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-200/60 hover:shadow-md transition-all duration-300 cursor-pointer"
                            >
                                <div className={`w-12 h-12 ${category.bgColor} rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`}>
                                    <category.icon className={`w-6 h-6 ${category.textColor}`} />
                                </div>
                                <h4 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors duration-300">
                                    {category.name}
                                </h4>
                                <p className="text-sm text-gray-600 font-medium">
                                    {category.jobCount.toLocaleString()} jobs
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* All Categories Grid */}
                <div className="mb-12 sm:mb-16">
                    <div className="text-center mb-8">
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                            {t('LandingJobsCategories.allTitle', 'All Categories')}
                        </h3>
                        <p className="text-gray-600">
                            {t('LandingJobsCategories.allDescription', 'Browse all available job categories and find your perfect match')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                        {jobCategories.map((category) => (
                            <CategoryCard 
                                key={category.id} 
                                category={category} 
                                onClick={handleCategoryClick}
                            />
                        ))}
                    </div>
                </div>

                {/* Stats & CTA Section */}
                <div className="bg-gradient-to-r from-[#4a6cf7] to-[#3b5ce6] rounded-2xl p-8 sm:p-12 text-white text-center">
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4">
                        {t('LandingJobsCategories.cta.title', 'Ready to Find Your Dream Job?')}
                    </h3>
                    <p className="text-blue-100 mb-6 max-w-2xl mx-auto">
                        {t('LandingJobsCategories.cta.description', `With ${totalJobs.toLocaleString()}+ jobs across ${jobCategories.length} categories, your next opportunity is waiting.`)}
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <button 
                            onClick={handleViewAllCategories}
                            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#4a6cf7] rounded-lg hover:bg-gray-50 transition-all duration-300 font-semibold text-base shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <BiBuilding className="w-5 h-5" />
                            <span>{t('LandingJobsCategories.cta.browseButton', 'Browse All Categories')}</span>
                        </button>
                        
                        <button className="inline-flex items-center gap-2 px-8 py-4 bg-transparent border-2 border-white text-white rounded-lg hover:bg-white hover:text-[#4a6cf7] transition-all duration-300 font-semibold text-base transform hover:scale-[1.02] active:scale-[0.98]">
                            <FiArrowRight className="w-5 h-5" />
                            <span>{t('LandingJobsCategories.cta.searchButton', 'Start Job Search')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

const MyComponent = withTranslation('common')(LandingJobsCategories);
export default MyComponent;
