import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listBlogPosts, listBlogCategories, getBlogSettings } from '../../../services/api/platform';
import BlogCard from '../components/BlogCard';
import CategoryFilter from '../components/CategoryFilter';
import Spinner from '../../Spinner/Spinner';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import { AuthContext } from '../../../main';
import fire from '../../../conf/fire';
import { FiSearch, FiCalendar, FiUser, FiEye, FiBookmark, FiEdit3, FiX, FiGrid, FiList, FiFilter, FiChevronDown } from 'react-icons/fi';

const BlogList = () => {
    const { t } = useTranslation('common');
    const user = React.useContext(AuthContext);
    const navigate = useNavigate();
    const [posts, setPosts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [blogSettings, setBlogSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [sortBy, setSortBy] = useState('newest');
    const [loadError, setLoadError] = useState('');
    const requestGeneration = useRef(0);

    // Auth handlers for navbar
    const authBtnHandler = () => {
        navigate('/');
    };

    const logout = async () => {
        try {
            await fire.auth().signOut();
            navigate('/');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    useEffect(() => {
        initializeBlog();
    }, []);

    useEffect(() => {
        fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory, currentPage]);

    useEffect(() => {
        // Update document title
        document.title = blogSettings?.seoTitle || 'Blog';
    }, [blogSettings]);

    const initializeBlog = async () => {
        setLoading(true);
        try {
            // Fetch categories and settings in parallel with fallbacks
            const [categoriesResult, settingsResult] = await Promise.all([
                listBlogCategories().catch(() => []),
                getBlogSettings().catch(() => null)
            ]);
            
            setCategories(categoriesResult || []);
            setBlogSettings(settingsResult);
        } catch (error) {
            console.warn('Blog initialization handled non-fatal error:', error?.message);
        }
    };

    const fetchPosts = async () => {
        const generation = ++requestGeneration.current;
        setLoadError('');
        if (currentPage === 1) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const options = {
                status: 'approved',
                limit: blogSettings?.postsPerPage || 10,
                page: currentPage,
                orderBy: 'publishedAt', // Order by publish date for public blog
                orderDirection: 'desc'
            };

            if (selectedCategory && selectedCategory !== 'all') {
                options.categoryId = selectedCategory;
            }

            const result = await listBlogPosts(options);
            
            if (generation !== requestGeneration.current) return;
            if (result.success) {
                if (currentPage === 1) {
                    setPosts(result.posts);
                } else {
                    setPosts(prev => [...prev, ...result.posts]);
                }
                setPagination(result.pagination);
            } else {
                setPosts([]);
                setLoadError(result.error || 'Blog posts are unavailable.');
            }
        } catch (error) {
            if (generation === requestGeneration.current) { setPosts([]); setLoadError(error.message || 'Blog posts are unavailable.'); }
        } finally {
            if (generation === requestGeneration.current) { setLoading(false); setLoadingMore(false); }
        }
    };

    const handleCategoryChange = (categoryId) => {
        setSelectedCategory(categoryId);
        setCurrentPage(1);
        setPosts([]);
    };

    const handleLoadMore = () => {
        if (pagination && pagination.hasNextPage) {
            setCurrentPage(prev => prev + 1);
        }
    };

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
    const filteredPosts = posts.filter((post) => {
        if (!normalizedSearch) return true;
        return String(post.title || '').toLocaleLowerCase().includes(normalizedSearch)
            || String(post.excerpt || '').toLocaleLowerCase().includes(normalizedSearch);
    });

    if (loading) {
        return (
            <>
                <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
                <div className="min-h-screen bg-gray-50 flex items-center justify-center pt-16">
                    <Spinner />
                </div>
                <HomepageFooter />
            </>
        );
    }

    return (
        <>
            <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
            <div className="min-h-screen bg-white pt-16">
                {/* Hero Header Section */}
                <div className="bg-slate-900 relative overflow-hidden">
                    {/* Subtle geometric pattern */}
                    <div className="absolute inset-0 opacity-5">
                        <div className="absolute inset-0" style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                        }}></div>
                    </div>
                    
                    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                        <div className="text-center max-w-4xl mx-auto">
                            <div className="inline-flex items-center px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-6">
                                <span className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></span>
                                {t('blog.knowledgeHub', 'Knowledge Hub')}
                            </div>
                            
                            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                                {blogSettings?.blogTitle || t('blog.blogTitle', 'Insights & Resources')}
                            </h1>
                            
                            <p className="text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed mb-10">
                                {blogSettings?.blogDescription || t('blog.blogDescription', 'Expert insights, industry trends, and practical guides to help you succeed')}
                            </p>

                            {/* Enhanced Search Bar */}
                            <div className="max-w-2xl mx-auto">
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-white/10 rounded-xl blur-sm group-focus-within:bg-white/20 transition-all duration-300"></div>
                                    <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-1">
                                        <div className="relative flex items-center">
                                            <FiSearch className="absolute left-4 text-slate-400 w-5 h-5" />
                                            <input
                                                type="text"
                                                placeholder={t('blog.searchPlaceholder', 'Search articles, guides, and insights...')}
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-12 pr-32 py-4 bg-transparent text-white placeholder-slate-400 border-0 focus:outline-none focus:ring-0 text-lg"
                                            />
                                            <div className="absolute right-2 flex items-center space-x-2">
                                                <span className="hidden sm:block text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-slate-700">
                                                    ⌘K
                                                </span>
                                                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 font-medium">
                                                    {t('blog.search', 'Search')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

                    {/* Professional Header Bar */}
                    <div className="bg-white border-b border-slate-200 mb-8">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6">
                            {/* Left Side - Title and Stats */}
                            <div className="flex-1">
                                <div className="flex items-center gap-4 mb-2">
                                    <h1 className="text-2xl font-bold text-slate-900">
                                        {selectedCategory === 'all' ? t('blog.allArticles', 'All Articles') : 
                                         categories.find(cat => cat.id === selectedCategory)?.name || t('blog.articleLabel', 'Articles')}
                                    </h1>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm bg-slate-100 text-slate-600 font-medium">
                                        {filteredPosts.length} {filteredPosts.length === 1 ? t('blog.articleLabel', 'article') : t('blog.articles', 'articles')}
                                    </span>
                                </div>
                                {searchTerm && (
                                    <p className="text-slate-600">
                                        {t('blog.searchResultsFor', 'Search results for')} <span className="font-medium text-slate-900">"{searchTerm}"</span>
                                    </p>
                                )}
                            </div>

                            {/* Right Side - Controls */}
                            <div className="flex items-center gap-3">
                                {/* Category Filter */}
                                <div className="relative">
                                    <select 
                                        value={selectedCategory}
                                        onChange={(e) => handleCategoryChange(e.target.value)}
                                        className="appearance-none bg-white border border-slate-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="all">{t('blog.allCategories', 'All Categories')}</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                    <FiChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                </div>

                                {/* Sort Dropdown */}
                                <div className="relative">
                                    <select 
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="appearance-none bg-white border border-slate-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="newest">Newest First</option>
                                        <option value="oldest">Oldest First</option>
                                        <option value="popular">Most Popular</option>
                                        <option value="alphabetical">A-Z</option>
                                    </select>
                                    <FiChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                </div>

                                {/* View Toggle */}
                                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 ${
                                            viewMode === 'grid'
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                        title="Grid view"
                                    >
                                        <FiGrid className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`flex items-center justify-center w-9 h-9 rounded-md transition-all duration-200 ${
                                            viewMode === 'list'
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                        title="List view"
                                    >
                                        <FiList className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Write Article Button for Authenticated Users */}
                                {user && (
                                    <Link
                                        to="/blog-editor"
                                        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
                                    >
                                        <FiEdit3 className="w-4 h-4 mr-2" />
                                        Write Article
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="">
                        {loadError && <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>}
                        {filteredPosts.length === 0 && !loading && !loadError ? (
                            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
                                <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <FiSearch className="w-12 h-12 text-slate-400" />
                                </div>
                                <h3 className="text-2xl font-semibold text-slate-900 mb-3">No articles found</h3>
                                <p className="text-slate-600 mb-8 max-w-md mx-auto">
                                    {searchTerm 
                                        ? `We couldn't find any articles matching "${searchTerm}". Try adjusting your search terms.`
                                        : 'No articles are available in this category yet. Check back soon for new content.'
                                    }
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors duration-200"
                                        >
                                            <FiX className="w-4 h-4 mr-2" />
                                            Clear Search
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setSelectedCategory('all')}
                                        className="inline-flex items-center px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors duration-200"
                                    >
                                        <FiBookmark className="w-4 h-4 mr-2" />
                                        View All Categories
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Grid View */}
                                {viewMode === 'grid' && (
                                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                                        {filteredPosts.map((post, index) => (
                                            <BlogCard key={`${post.id}-${index}`} post={post} viewMode="grid" />
                                        ))}
                                    </div>
                                )}

                                {/* List View */}
                                {viewMode === 'list' && (
                                    <div className="space-y-4">
                                        {filteredPosts.map((post, index) => (
                                            <BlogCard key={`${post.id}-${index}`} post={post} viewMode="list" />
                                        ))}
                                    </div>
                                )}

                                {/* Enhanced Pagination */}
                                {pagination && pagination.totalPages > 1 && (
                                    <div className="mt-16 border-t border-slate-200 pt-12">
                                        <div className="flex flex-col sm:flex-row items-center justify-between">
                                            <div className="flex items-center space-x-4 mb-6 sm:mb-0">
                                                <span className="text-sm text-slate-600">
                                                    Showing <span className="font-medium">{Math.min(currentPage * (blogSettings?.postsPerPage || 10), pagination.totalCount)}</span> of <span className="font-medium">{pagination.totalCount}</span> articles
                                                </span>
                                            </div>
                                            
                                            <div className="flex items-center space-x-2">
                                                {pagination.hasPreviousPage && (
                                                    <button
                                                        onClick={() => setCurrentPage(prev => prev - 1)}
                                                        className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors duration-200"
                                                    >
                                                        Previous
                                                    </button>
                                                )}
                                                
                                                <div className="flex items-center space-x-1">
                                                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                                        let pageNum;
                                                        if (pagination.totalPages <= 5) {
                                                            pageNum = i + 1;
                                                        } else if (currentPage <= 3) {
                                                            pageNum = i + 1;
                                                        } else if (currentPage >= pagination.totalPages - 2) {
                                                            pageNum = pagination.totalPages - 4 + i;
                                                        } else {
                                                            pageNum = currentPage - 2 + i;
                                                        }
                                                        
                                                        return (
                                                            <button
                                                                key={pageNum}
                                                                onClick={() => setCurrentPage(pageNum)}
                                                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                                                                    currentPage === pageNum
                                                                        ? 'bg-blue-600 text-white'
                                                                        : 'text-slate-700 hover:bg-slate-100'
                                                                }`}
                                                            >
                                                                {pageNum}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                
                                                {pagination.hasNextPage && (
                                                    <button
                                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                                        className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors duration-200"
                                                    >
                                                        Next
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Load More Alternative */}
                                {pagination && pagination.hasNextPage && currentPage < pagination.totalPages && (
                                    <div className="mt-12 text-center">
                                        <button
                                            onClick={handleLoadMore}
                                            disabled={loadingMore}
                                            className="inline-flex items-center px-8 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-medium rounded-xl transition-all duration-200 group"
                                        >
                                            {loadingMore ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent mr-3"></div>
                                                    Loading more articles...
                                                </>
                                            ) : (
                                                <>
                                                    <span>Load More Articles</span>
                                                    <FiEye className="w-4 h-4 ml-2 group-hover:translate-y-0.5 transition-transform duration-200" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
            <HomepageFooter />
        </>
    );
};

export default BlogList;