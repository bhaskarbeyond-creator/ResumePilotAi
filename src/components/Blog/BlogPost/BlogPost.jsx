import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sanitizeBlogHtml } from '../../../utils/sanitizeHtml';
import { 
    getBlogPostBySlug, 
    listBlogPosts, 
    listBlogCategories 
} from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';
import Spinner from '../../Spinner/Spinner';
import BlogCard from '../components/BlogCard';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import fire from '../../../conf/fire';
import './BlogContent.css';
import { 
    FiCalendar, 
    FiEye, 
    FiClock, 
    FiArrowLeft,
    FiShare2,
    FiEdit3,
    FiBookmark
} from 'react-icons/fi';

const BlogPost = () => {
    const { t } = useTranslation('common');
    const { slug } = useParams();
    const navigate = useNavigate();
    const user = useContext(AuthContext);
    
    const [post, setPost] = useState(null);
    const [relatedPosts, setRelatedPosts] = useState([]);
    const [category, setCategory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [canEdit, setCanEdit] = useState(false);

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
        if (slug) {
            fetchPost();
        }
    }, [slug]);

    useEffect(() => {
        // Update document title when post loads
        if (post) {
            document.title = post.title;
        }
    }, [post]);

    const fetchPost = async () => {
        setLoading(true);
        setError(null);
        
        try {
            // Fetch the blog post
            const postData = await getBlogPostBySlug(slug);
            
            if (!postData) {
                setError('Post not found');
                return;
            }
            
            setPost(postData);
            
            // Check if current user can edit this post
            if (user && (user.uid === postData.authorUid)) {
                setCanEdit(true);
            }

            // Fetch categories
            const categoriesResult = await listBlogCategories();
            
            // Fetch related posts separately to avoid composite index issues
            const relatedResult = await listBlogPosts({
                status: 'approved',
                limit: 10 // Get more posts to filter out current post
            });
            
            // Find the category
            const postCategory = categoriesResult.find(cat => cat.id === postData.categoryId);
            setCategory(postCategory);
            
            // Set related posts (excluding current post)
            if (relatedResult.success) {
                // First try to find posts from the same category
                let filtered = relatedResult.posts.filter(p => 
                    p.id !== postData.id && p.categoryId === postData.categoryId
                );
                
                // If not enough posts from same category, add other posts
                if (filtered.length < 3) {
                    const otherPosts = relatedResult.posts.filter(p => 
                        p.id !== postData.id && p.categoryId !== postData.categoryId
                    );
                    filtered = [...filtered, ...otherPosts];
                }
                
                setRelatedPosts(filtered.slice(0, 3));
            }
            
        } catch (error) {
            console.error('Error fetching blog post:', error);
            setError('Failed to load post');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return 'Recently';
        const postDate = date instanceof Date ? date : new Date(date);
        return postDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getReadingTime = (content) => {
        if (!content) return '1 min read';
        
        // Strip HTML tags to get plain text for word count
        const plainText = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        
        if (!plainText) return '1 min read';
        
        const wordsPerMinute = 200;
        const wordCount = plainText.split(' ').length;
        const readingTime = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
        return `${readingTime} min read`;
    };

    const [copiedToast, setCopiedToast] = useState(false);

    const handleShare = async () => {
        const copyAction = async () => {
            await navigator.clipboard.writeText(window.location.href);
            setCopiedToast(true);
            setTimeout(() => setCopiedToast(false), 2500);
        };

        if (navigator.share) {
            try {
                await navigator.share({
                    title: post.title,
                    text: post.excerpt,
                    url: window.location.href,
                });
            } catch (error) {
                await copyAction();
            }
        } else {
            await copyAction();
        }
    };

    // Detect if content is HTML or Markdown
    const isHtmlContent = (content) => {
        if (!content) return false;
        // Check for common HTML tags that indicate HTML content
        const htmlTagRegex = /<\/?(?:p|div|h[1-6]|strong|em|ul|ol|li|blockquote|code|pre|a|img|table|tr|td|th)(?:\s[^>]*)?>|<\/?br\s*\/?>/i;
        return htmlTagRegex.test(content);
    };

    const sanitizeHtmlContent = sanitizeBlogHtml;

    if (loading) {
        return (
            <>
                <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
                <div className="min-h-screen bg-white flex items-center justify-center pt-16">
                    <Spinner />
                </div>
                <HomepageFooter />
            </>
        );
    }

    if (error || !post) {
        return (
            <>
                <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
                <div className="min-h-screen bg-white flex items-center justify-center pt-16">
                    <div className="text-center max-w-md mx-auto px-4">
                        <div className="w-20 h-20 mx-auto mb-8 bg-slate-100 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-4">
                            {error || t('blog.articleNotFound', 'Article Not Found')}
                        </h1>
                        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                            The article you're looking for doesn't exist or has been removed. Let's get you back to exploring our content.
                        </p>
                        <Link 
                            to="/blog"
                            className="group inline-flex items-center px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-slate-900/25"
                        >
                            <FiArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
                            {t('blog.backToArticles', 'Back to Articles')}
                        </Link>
                    </div>
                </div>
                <HomepageFooter />
            </>
        );
    }

    return (
        <>
            {copiedToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 9999,
                    background: '#0f172a',
                    color: '#34d399',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '13px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    ✓ Link copied to clipboard!
                </div>
            )}
            <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
            <div className="min-h-screen bg-white pt-16">

                {/* Article Header */}
                <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <header className="py-8">
                        {/* Title */}
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
                            {post.title}
                        </h1>

                        {/* Excerpt */}
                        {post.excerpt && (
                            <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                                {post.excerpt}
                            </p>
                        )}

                        {/* Meta Information */}
                        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 mb-8">
                            {category && (
                                <span 
                                    className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full text-white"
                                    style={{ backgroundColor: category.color || '#6366f1' }}
                                >
                                    {category.name}
                                </span>
                            )}
                            
                            <div className="flex items-center">
                                <FiCalendar className="w-4 h-4 mr-2" />
                                <span>{formatDate(post.publishedAt || post.createdAt)}</span>
                            </div>
                            
                            <div className="flex items-center">
                                <FiClock className="w-4 h-4 mr-2" />
                                <span>{getReadingTime(post.content)}</span>
                            </div>
                            
                            {post.viewCount && post.viewCount > 0 && (
                                <div className="flex items-center">
                                    <FiEye className="w-4 h-4 mr-2" />
                                    <span>{post.viewCount} {t('blog.views', 'views')}</span>
                                </div>
                            )}
                        </div>

                        {/* Featured Image */}
                        {post.featuredImage && (
                            <div className="mb-8">
                                <img
                                    src={post.featuredImage}
                                    alt={post.title}
                                    className="w-full h-64 md:h-80 object-cover rounded-xl"
                                />
                            </div>
                        )}
                    </header>

                    {/* Article Content */}
                    <div className="prose prose-lg max-w-none mb-12">
                        {post.content ? (
                            isHtmlContent(post.content) ? (
                                // Render HTML content from Tiptap editor
                                <div 
                                    className="blog-content"
                                    dangerouslySetInnerHTML={{ 
                                        __html: sanitizeHtmlContent(post.content) 
                                    }}
                                />
                            ) : (
                                // Render Markdown content (legacy posts)
                                <div className="blog-content markdown-content">
                                    {post.content.split('\n').map((paragraph, index) => {
                                        if (paragraph.trim() === '') {
                                            return <br key={index} />;
                                        }
                                        return (
                                            <p key={index} className="mb-4 text-slate-700 leading-relaxed">
                                                {paragraph}
                                            </p>
                                        );
                                    })}
                                </div>
                            )
                        ) : (
                            <div className="text-center py-12 text-slate-500">
                                <p className="text-lg">No content available for this post.</p>
                            </div>
                        )}
                    </div>

                    {/* Author Actions */}
                    {canEdit && (
                        <div className="mb-6">
                            <Link
                                to={`/blog-editor/${post.id}`}
                                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 shadow-sm"
                            >
                                <FiEdit3 className="w-4 h-4 mr-2" />
                                Edit Article
                            </Link>
                        </div>
                    )}

                    {/* Tags Section */}
                    {post.tags && post.tags.length > 0 && (
                        <div className="mb-8 pb-8 border-b border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-900 mb-3">{t('blog.tags', 'Tags')}</h3>
                            <div className="flex flex-wrap gap-2">
                                {post.tags.map((tag, index) => (
                                    <span 
                                        key={index}
                                        className="inline-block px-3 py-1 text-sm font-medium bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors duration-200"
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Navigation and Actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-8 border-t border-slate-200">
                        <Link 
                            to="/blog"
                            className="inline-flex items-center text-slate-600 hover:text-slate-900 font-medium transition-colors duration-200 group"
                        >
                            <FiArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
                            <span>{t('blog.backToBlog', 'Back to Blog')}</span>
                        </Link>
                        
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleShare}
                                className="inline-flex items-center px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium rounded-lg transition-all duration-200 border border-slate-200 hover:border-slate-300"
                            >
                                <FiShare2 className="w-4 h-4 mr-2" />
                                {t('blog.shareArticle', 'Share Article')}
                            </button>
                        </div>
                    </div>
                </article>

                {/* Related Posts */}
                {relatedPosts.length > 0 && (
                    <div className="border-t border-slate-200 mt-8">
                        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                            <h3 className="text-lg font-semibold text-slate-900 mb-6">{t('blog.relatedArticles', 'Related Articles')}</h3>
                            <div className="space-y-4">
                                {relatedPosts.map((relatedPost, index) => (
                                    <div key={`${relatedPost.id}-${index}`} className="group">
                                        <Link 
                                            to={`/blog/${relatedPost.slug}`}
                                            className="flex items-start gap-4 p-4 rounded-lg hover:bg-slate-50 transition-colors duration-200"
                                        >
                                            {relatedPost.featuredImage ? (
                                                <img
                                                    src={relatedPost.featuredImage}
                                                    alt={relatedPost.title}
                                                    className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                                                />
                                            ) : (
                                                <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <FiBookmark className="w-6 h-6 text-slate-400" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-base font-medium text-slate-900 group-hover:text-blue-600 transition-colors duration-200 line-clamp-2 leading-tight">
                                                    {relatedPost.title}
                                                </h4>
                                                {relatedPost.excerpt && (
                                                    <p className="text-sm text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                                                        {relatedPost.excerpt}
                                                    </p>
                                                )}
                                                <div className="flex items-center mt-2 text-xs text-slate-500">
                                                    <FiCalendar className="w-3 h-3 mr-1" />
                                                    <span>
                                                        {relatedPost.publishedAt || relatedPost.createdAt ? 
                                                            formatDate(relatedPost.publishedAt || relatedPost.createdAt) : 
                                                            'Recently'
                                                        }
                                                    </span>
                                                    <span className="mx-2">•</span>
                                                    <FiClock className="w-3 h-3 mr-1" />
                                                    <span>{getReadingTime(relatedPost.content)}</span>
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
        </div>
            <HomepageFooter />
        </>
    );
};

export default BlogPost;