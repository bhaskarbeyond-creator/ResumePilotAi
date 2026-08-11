import React, { useState, useEffect } from 'react';
import { FiX, FiCalendar, FiUser, FiTag, FiClock, FiEye, FiExternalLink } from 'react-icons/fi';
import DOMPurify from 'dompurify';
import { listBlogCategories } from '../../../firestore/dbOperations';
import '../../../components/Blog/BlogPost/BlogContent.css';

const BlogPreviewModal = ({ post, onClose, isOpen }) => {
    const [category, setCategory] = useState(null);
    
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const categoriesData = await listBlogCategories();
                
                // Find the category for this post
                if (post && post.categoryId) {
                    const postCategory = categoriesData.find(cat => cat.id === post.categoryId);
                    setCategory(postCategory);
                }
            } catch (error) {
                console.error('Error loading categories:', error);
            }
        };
        
        if (isOpen && post) {
            loadCategories();
        }
    }, [isOpen, post]);
    
    // Debug logging
    console.log('BlogPreviewModal render:', { isOpen, post: !!post });
    
    if (!isOpen || !post) {
        console.log('BlogPreviewModal: not rendering - isOpen:', isOpen, 'post:', !!post);
        return null;
    }

    const formatDate = (date) => {
        if (!date) return 'Unknown';
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
    
    // Detect if content is HTML or Markdown
    const isHtmlContent = (content) => {
        if (!content) return false;
        // Check for common HTML tags that indicate HTML content
        const htmlTagRegex = /<\/?(?:p|div|h[1-6]|strong|em|ul|ol|li|blockquote|code|pre|a|img|table|tr|td|th)(?:\s[^>]*)?>|<\/?br\s*\/?>/i;
        return htmlTagRegex.test(content);
    };

    // Sanitize HTML content for safe rendering
    const sanitizeHtmlContent = (htmlContent) => {
        if (!htmlContent) return '';
        
        try {
            // Configure DOMPurify with safe settings for blog post display
            const sanitized = DOMPurify.sanitize(htmlContent, {
                // Allow safe HTML tags for blog content display
                ALLOWED_TAGS: [
                    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'mark',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'ul', 'ol', 'li',
                    'blockquote', 'code', 'pre',
                    'a', 'img',
                    'table', 'thead', 'tbody', 'tr', 'th', 'td',
                    'div', 'span'
                ],
                // Allow safe attributes
                ALLOWED_ATTR: [
                    'href', 'title', 'alt', 'src', 'width', 'height',
                    'class', 'style', 'target', 'rel', 'loading'
                ],
                // Security settings
                FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
                FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover'],
                // Allow only safe URLs
                ALLOWED_URI_REGEXP: /^https?:\/\/|^mailto:|^tel:|^#/i,
                // Add security attributes to links
                ADD_ATTR: {
                    'a': {'target': '_blank', 'rel': 'noopener noreferrer'},
                    'img': {'loading': 'lazy'}
                },
                // Keep content structure
                KEEP_CONTENT: true,
                ALLOW_UNKNOWN_PROTOCOLS: false,
            });
            
            return sanitized;
        } catch (error) {
            console.error('Error sanitizing HTML content:', error);
            return '<p class="text-red-600 bg-red-50 p-4 rounded-lg border border-red-200"><strong>Content Error:</strong> Unable to display content safely.</p>';
        }
    };

    console.log('BlogPreviewModal: rendering with post:', post.title);
    
    return (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div 
                    className="fixed inset-0 bg-black transition-opacity z-0"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={onClose}
                ></div>

                {/* This element is to trick the browser into centering the modal contents. */}
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                {/* Modal */}
                <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full relative z-10">
                    <div className="max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <FiEye className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Blog Post Preview
                                </h3>
                                <p className="text-sm text-gray-600 mt-0.5">
                                    {post.title}
                                </p>
                            </div>
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                post.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                post.status === 'approved' ? 'bg-green-100 text-green-700 border border-green-200' :
                                'bg-red-100 text-red-700 border border-red-200'
                            }`}>
                                {post.status?.toUpperCase()}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                        >
                            <FiX className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Blog Post Content - Styled like actual blog */}
                <div className="bg-white overflow-y-auto" style={{ maxHeight: 'calc(95vh - 180px)' }}>
                    {/* Blog Article Container */}
                    <article className="max-w-4xl mx-auto px-6 py-8">
                        {/* Article Header */}
                        <header className="mb-8">
                            {/* Title */}
                            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
                                {post.title || 'Untitled Post'}
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
                                    <FiUser className="w-4 h-4 mr-2" />
                                    <span>By {post.authorName || 'Unknown Author'}</span>
                                </div>
                                
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
                                        <span>{post.viewCount} views</span>
                                    </div>
                                )}
                            </div>

                            {/* Featured Image */}
                            {post.featuredImage && (
                                <div className="mb-8">
                                    <img
                                        src={post.featuredImage}
                                        alt={post.title}
                                        className="w-full h-64 md:h-80 object-cover rounded-xl shadow-lg"
                                    />
                                </div>
                            )}
                        </header>

                        {/* Article Content */}
                        <div className="prose prose-lg max-w-none mb-12">
                            {post.content ? (
                                isHtmlContent(post.content) ? (
                                    // Render HTML content from Tiptap editor (sanitized)
                                    <div 
                                        className="blog-content"
                                        dangerouslySetInnerHTML={{ 
                                            __html: sanitizeHtmlContent(post.content) 
                                        }}
                                    />
                                ) : (
                                    // Render plain text content
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
                                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg">
                                    <FiExternalLink className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                    <p className="text-lg">No content available for this post.</p>
                                </div>
                            )}
                        </div>

                        {/* Tags Section */}
                        {post.tags && post.tags.length > 0 && (
                            <div className="mb-8 pb-8 border-b border-slate-200">
                                <h3 className="text-lg font-semibold text-slate-900 mb-3">Tags</h3>
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

                        {/* Admin Notes */}
                        {post.adminNotes && (
                            <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-xl">
                                <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0 w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                                        <span className="text-xs font-bold text-red-600">!</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-red-800 mb-2">Admin Notes</h4>
                                        <p className="text-sm text-red-700 leading-relaxed">{post.adminNotes}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </article>
                </div>

                {/* Footer */}
                <div className="bg-gradient-to-r from-slate-50 to-gray-50 px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                            <span className="font-medium">Preview Mode</span> • This is how the post will appear on your blog
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={onClose}
                                type="button"
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-all shadow-sm"
                            >
                                Close
                            </button>
                            <button
                                onClick={onClose}
                                type="button"
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-all shadow-sm"
                            >
                                Done Reviewing
                            </button>
                        </div>
                    </div>
                </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BlogPreviewModal;