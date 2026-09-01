import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiCalendar, FiUser, FiEye, FiClock, FiArrowUpRight, FiBookmark } from 'react-icons/fi';
import { sanitizeImageUrl } from '../../../utils/sanitizeHtml';

const BlogCard = ({ post, viewMode = 'grid' }) => {
    const { t } = useTranslation('common');
    const featuredImage = sanitizeImageUrl(post.featuredImage || post.coverImage || post.cover_image);
    const formatDate = (date) => {
        if (!date) return t('blog.recently', 'Recently');
        const postDate = date instanceof Date ? date : new Date(date);
        return postDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getReadingTime = (content) => {
        if (!content) return `1 ${t('blog.minRead', 'min read')}`;
        const wordsPerMinute = 200;
        const wordCount = content.split(' ').length;
        const readingTime = Math.ceil(wordCount / wordsPerMinute);
        return `${readingTime} ${t('blog.minRead', 'min read')}`;
    };

    // Grid view component
    if (viewMode === 'grid') {
        return (
            <article className="group bg-white rounded-3xl overflow-hidden border-0">
            {/* Featured Image */}
            <div className="relative bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-10">
                {featuredImage ? (
                    <img
                        src={featuredImage}
                        alt={post.title}
                        className="w-full h-64 object-cover rounded-2xl"
                    />
                ) : (
                    <div className="w-full h-64 flex items-center justify-center">
                        <div className="relative">
                            {/* Professional illustration placeholder */}
                            <div className="w-40 h-40 bg-white rounded-2xl shadow-lg flex items-center justify-center">
                                <div className="w-20 h-20 bg-gradient-to-r from-blue-400 to-purple-500 rounded-xl flex items-center justify-center">
                                    <FiBookmark className="w-10 h-10 text-white" />
                                </div>
                            </div>
                            {/* Decorative elements */}
                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full opacity-80"></div>
                            <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-pink-400 rounded-full opacity-60"></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="px-2 pb-10">
                {/* Meta Tags */}
                <div className="flex items-center gap-3 my-3">
                    <span className="text-sm font-medium text-blue-600 uppercase tracking-wide">
                        {t('blog.articleLabel', 'Article')}
                    </span>
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                    {post.categoryName && (
                        <>
                            <span className="text-sm font-medium text-slate-500">
                                {post.categoryName}
                            </span>
                            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                        </>
                    )}
                    <span className="text-sm font-medium text-slate-500">
                        {getReadingTime(post.content)}
                    </span>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-slate-900 mb-6 leading-tight group-hover:text-blue-600 transition-colors duration-300 w-full">
                    <Link 
                        to={`/blog/${post.slug}`}
                        className="block w-full"
                    >
                        {post.title}
                    </Link>
                </h2>
            </div>
        </article>
        );
    }

    // List view component
    return (
        <article className="group bg-white rounded-3xl overflow-hidden border-0">
            <div className="flex flex-col lg:flex-row">
                {/* Image Section */}
                <div className="relative lg:w-[28rem] lg:flex-shrink-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-10 flex items-center justify-center">
                    {featuredImage ? (
                        <img
                            src={featuredImage}
                            alt={post.title}
                            className="w-full h-56 object-cover rounded-xl"
                        />
                    ) : (
                        <div className="w-full h-56 flex items-center justify-center">
                            <div className="relative">
                                <div className="w-32 h-32 bg-white rounded-xl shadow-lg flex items-center justify-center">
                                    <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                                        <FiBookmark className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full opacity-80"></div>
                                <div className="absolute -bottom-1 -left-1 w-5 h-5 bg-pink-400 rounded-full opacity-60"></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Section */}
                <div className="flex-1 px-12 py-10">
                    {/* Meta Tags */}
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-sm font-medium text-blue-600 uppercase tracking-wide">
                            {t('blog.articleLabel', 'Article')}
                        </span>
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                        {post.categoryName && (
                            <>
                                <span className="text-sm font-medium text-slate-500">
                                    {post.categoryName}
                                </span>
                                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                            </>
                        )}
                        <span className="text-sm font-medium text-slate-500">
                            {getReadingTime(post.content)}
                        </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-3xl font-bold text-slate-900 mb-6 leading-tight group-hover:text-blue-600 transition-colors duration-300 w-full">
                        <Link to={`/blog/${post.slug}`} className="block w-full">
                            {post.title}
                        </Link>
                    </h2>

                    {/* Excerpt */}
                    <p className="text-slate-600 mb-8 leading-relaxed text-lg">
                        {post.excerpt || 'Discover insights and practical knowledge to help you stay ahead in your field.'}
                    </p>

                    {/* Footer with Date */}
                    <div className="flex items-center justify-between">
                        <div className="text-base text-slate-500">
                            {formatDate(post.publishedAt || post.createdAt)}
                        </div>
                        <Link 
                            to={`/blog/${post.slug}`}
                            className="inline-flex items-center text-base font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200"
                        >
                            Read article
                            <FiArrowUpRight className="w-5 h-5 ml-2" />
                        </Link>
                    </div>
                </div>
            </div>
        </article>
    );
};

export default BlogCard;