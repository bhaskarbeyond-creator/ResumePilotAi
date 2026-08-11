import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
    listBlogPosts, 
    updateBlogPost, 
    deleteBlogPost, 
    listBlogCategories,
    getUserData
} from '../../../firestore/dbOperations';
import { 
    FiSearch, 
    FiFilter, 
    FiCheck, 
    FiX, 
    FiEye, 
    FiEdit3,
    FiTrash2,
    FiClock,
    FiUser,
    FiTag,
    FiChevronDown,
    FiChevronUp,
    FiAlertCircle,
    FiRefreshCw
} from 'react-icons/fi';
import BlogPreviewModal from './BlogPreviewModal';

const BlogManagement = () => {
    const [posts, setPosts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [notification, setNotification] = useState(null);
    const [selectedPosts, setSelectedPosts] = useState([]);
    
    // Filters
    const [filters, setFilters] = useState({
        status: 'all',
        category: 'all',
        author: '',
        search: ''
    });
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0
    });

    // Expanded rows for viewing content
    const [expandedRows, setExpandedRows] = useState(new Set());
    
    // Preview modal state
    const [previewPost, setPreviewPost] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, [filters, currentPage]);

    useEffect(() => {
        loadCategories();
    }, []);

    const loadData = async () => {
        setLoading(true);
        
        try {
            const options = {
                status: filters.status === 'all' ? 'all' : filters.status,
                categoryId: filters.category === 'all' ? null : filters.category,
                limit: 20,
                page: currentPage,
                orderBy: 'createdAt',
                orderDirection: 'desc',
                includeStats: true
            };

            const result = await listBlogPosts(options);
            
            if (result.success) {
                // Enrich posts with author data
                const enrichedPosts = await Promise.all(
                    result.posts.map(async (post) => {
                        const authorData = await getUserData(post.authorUid);
                        return {
                            ...post,
                            authorName: authorData ? 
                                `${authorData.firstname || ''} ${authorData.lastname || ''}`.trim() || 'Unknown' 
                                : 'Unknown'
                        };
                    })
                );
                
                setPosts(enrichedPosts);
                setPagination(result.pagination);
                if (result.stats) {
                    setStats(result.stats);
                }
            }
        } catch (error) {
            console.error('Error loading blog posts:', error);
            showNotification('Failed to load blog posts', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const categoriesData = await listBlogCategories();
            setCategories(categoriesData);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const handleStatusUpdate = async (postId, newStatus, customMessage = '') => {
        setProcessing(true);
        
        try {
            const updateData = { status: newStatus };
            if (customMessage) {
                updateData.adminNotes = customMessage;
            }

            const result = await updateBlogPost(postId, updateData);
            
            if (result.success) {
                showNotification(
                    `Post ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully!`
                );
                await loadData(); // Refresh the list
            } else {
                showNotification(result.error || 'Failed to update post status', 'error');
            }
        } catch (error) {
            console.error('Error updating post status:', error);
            showNotification('Failed to update post status', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleBulkAction = async (action) => {
        if (selectedPosts.length === 0) {
            showNotification('Please select posts to perform bulk action', 'error');
            return;
        }

        const confirmation = window.confirm(
            `Are you sure you want to ${action} ${selectedPosts.length} post(s)?`
        );
        
        if (!confirmation) return;

        setProcessing(true);
        
        try {
            const promises = selectedPosts.map(postId => {
                if (action === 'approve') {
                    return updateBlogPost(postId, { status: 'approved' });
                } else if (action === 'reject') {
                    return updateBlogPost(postId, { status: 'rejected' });
                } else if (action === 'delete') {
                    return deleteBlogPost(postId);
                }
            });

            await Promise.all(promises);
            
            showNotification(`Successfully ${action}d ${selectedPosts.length} post(s)!`);
            setSelectedPosts([]);
            await loadData();
        } catch (error) {
            console.error('Error performing bulk action:', error);
            showNotification('Failed to perform bulk action', 'error');
        } finally {
            setProcessing(false);
        }
    };
    
    const handleDeletePost = async (postId, postTitle) => {
        const confirmation = window.confirm(
            `Are you sure you want to delete the post "${postTitle}"? This action cannot be undone.`
        );
        
        if (!confirmation) return;

        setProcessing(true);
        
        try {
            const result = await deleteBlogPost(postId);
            
            if (result.success) {
                showNotification('Post deleted successfully!');
                await loadData(); // Refresh the list
            } else {
                showNotification(result.error || 'Failed to delete post', 'error');
            }
        } catch (error) {
            console.error('Error deleting post:', error);
            showNotification('Failed to delete post', 'error');
        } finally {
            setProcessing(false);
        }
    };
    
    const handlePreviewPost = (post) => {
        setPreviewPost(post);
        setIsPreviewOpen(true);
    };
    
    const closePreview = () => {
        setIsPreviewOpen(false);
        setPreviewPost(null);
    };

    const handleSelectAll = () => {
        if (selectedPosts.length === posts.length) {
            setSelectedPosts([]);
        } else {
            setSelectedPosts(posts.map(post => post.id));
        }
    };

    const togglePostSelection = (postId) => {
        setSelectedPosts(prev => 
            prev.includes(postId) 
                ? prev.filter(id => id !== postId)
                : [...prev, postId]
        );
    };

    const toggleRowExpansion = (postId) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(postId)) {
                newSet.delete(postId);
            } else {
                newSet.add(postId);
            }
            return newSet;
        });
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending' },
            approved: { color: 'bg-green-100 text-green-800', text: 'Approved' },
            rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected' }
        };
        
        const badge = badges[status] || badges.pending;
        
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                {badge.text}
            </span>
        );
    };

    const getCategoryName = (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        return category ? category.name : 'Unknown';
    };

    const formatDate = (date) => {
        if (!date) return 'Unknown';
        const postDate = date instanceof Date ? date : new Date(date);
        return postDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateContent = (content, limit = 150) => {
        if (!content) return '';
        if (content.length <= limit) return content;
        return content.substring(0, limit) + '...';
    };

    const filteredPosts = posts.filter(post => {
        if (filters.search && !post.title.toLowerCase().includes(filters.search.toLowerCase())) {
            return false;
        }
        if (filters.author && !post.authorName.toLowerCase().includes(filters.author.toLowerCase())) {
            return false;
        }
        return true;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Blog Management</h1>
                    <p className="text-gray-600">Review and manage blog posts</p>
                </div>
                
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                    <FiRefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Notification */}
            {notification && (
                <div className={`p-4 rounded-lg ${
                    notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    <div className="flex items-center">
                        {notification.type === 'success' ? 
                            <FiCheck className="w-5 h-5 mr-2" /> : 
                            <FiX className="w-5 h-5 mr-2" />
                        }
                        {notification.message}
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {Object.entries(stats).map(([key, value]) => (
                    <div key={key} className="bg-white p-6 rounded-lg border border-gray-200">
                        <div className="text-2xl font-bold text-gray-900">{value}</div>
                        <div className="text-sm text-gray-600 capitalize">{key} Posts</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                <div className="flex items-center gap-4">
                    <FiFilter className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-700">Filters</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                            value={filters.category}
                            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Categories</option>
                            {categories.map(category => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                        <div className="relative">
                            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search titles..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                        <input
                            type="text"
                            placeholder="Filter by author..."
                            value={filters.author}
                            onChange={(e) => setFilters(prev => ({ ...prev, author: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Bulk Actions */}
            {selectedPosts.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-blue-700">
                            {selectedPosts.length} post(s) selected
                        </div>
                        
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => handleBulkAction('approve')}
                                disabled={processing}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => handleBulkAction('reject')}
                                disabled={processing}
                                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                            >
                                Reject
                            </button>
                            <button
                                onClick={() => handleBulkAction('delete')}
                                disabled={processing}
                                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 disabled:opacity-50"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Posts Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-12">
                        <FiAlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600">No posts found</p>
                    </div>
                ) : (
                    <>
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="w-12 px-4 py-4 text-left">
                                        <input
                                            type="checkbox"
                                            checked={selectedPosts.length === filteredPosts.length}
                                            onChange={handleSelectAll}
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="w-2/5 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Post Details
                                    </th>
                                    <th className="w-32 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Author
                                    </th>
                                    <th className="w-28 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="w-24 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="w-32 px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="w-40 px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredPosts.map((post) => (
                                    <React.Fragment key={post.id}>
                                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                                            <td className="px-4 py-6 align-top">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPosts.includes(post.id)}
                                                    onChange={() => togglePostSelection(post.id)}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="space-y-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="text-sm font-semibold text-gray-900 mb-1 leading-tight">
                                                                {post.title}
                                                            </h3>
                                                            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                                                                {truncateContent(post.excerpt, 120)}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => toggleRowExpansion(post.id)}
                                                            className="ml-3 p-1.5 hover:bg-gray-200 rounded-md transition-colors flex-shrink-0"
                                                            title="Toggle content preview"
                                                        >
                                                            {expandedRows.has(post.id) ? (
                                                                <FiChevronUp className="w-4 h-4 text-gray-500" />
                                                            ) : (
                                                                <FiChevronDown className="w-4 h-4 text-gray-500" />
                                                            )}
                                                        </button>
                                                    </div>
                                                    
                                                    {post.tags && post.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {post.tags.slice(0, 3).map((tag, index) => (
                                                                <span key={index} className="inline-block px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-md font-medium">
                                                                    #{tag}
                                                                </span>
                                                            ))}
                                                            {post.tags.length > 3 && (
                                                                <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md">
                                                                    +{post.tags.length - 3} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 align-top">
                                                <div className="flex items-center space-x-2">
                                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                                        <FiUser className="w-4 h-4 text-gray-600" />
                                                    </div>
                                                    <span className="text-sm text-gray-900 font-medium">
                                                        {post.authorName}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 align-top">
                                                <div className="flex items-center space-x-2">
                                                    <FiTag className="w-4 h-4 text-gray-400" />
                                                    <span className="text-sm text-gray-700 font-medium">
                                                        {getCategoryName(post.categoryId)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 align-top">
                                                {getStatusBadge(post.status)}
                                            </td>
                                            <td className="px-6 py-6 align-top">
                                                <div className="text-sm text-gray-600">
                                                    <div className="flex items-center space-x-1 mb-1">
                                                        <FiClock className="w-3 h-3" />
                                                        <span className="font-medium">Created</span>
                                                    </div>
                                                    <span className="text-xs text-gray-500">
                                                        {formatDate(post.createdAt)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 align-top">
                                                <div className="flex items-center justify-center space-x-1">
                                                    {/* Show modal preview for pending/rejected posts, live link for approved posts */}
                                                    {post.status === 'approved' ? (
                                                        // Live view button - only for approved posts
                                                        <Link
                                                            to={`/blog/${post.slug}`}
                                                            target="_blank"
                                                            className="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                            title="View live post"
                                                        >
                                                            <FiEye className="w-4 h-4" />
                                                        </Link>
                                                    ) : (
                                                        // Modal preview for pending/rejected posts
                                                        <button
                                                            onClick={() => handlePreviewPost(post)}
                                                            className="inline-flex items-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                                            title="Preview post"
                                                        >
                                                            <FiEye className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    
                                                    {/* Edit button */}
                                                    <Link
                                                        to={`/blog-editor/${post.id}`}
                                                        className="inline-flex items-center p-2 text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                                                        title="Edit post"
                                                    >
                                                        <FiEdit3 className="w-4 h-4" />
                                                    </Link>

                                                    {/* Status action buttons for pending posts */}
                                                    {post.status === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(post.id, 'approved')}
                                                                disabled={processing}
                                                                className="inline-flex items-center p-2 text-green-600 hover:bg-green-50 rounded-md disabled:opacity-50 transition-colors"
                                                                title="Approve post"
                                                            >
                                                                <FiCheck className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(post.id, 'rejected')}
                                                                disabled={processing}
                                                                className="inline-flex items-center p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                                                                title="Reject post"
                                                            >
                                                                <FiX className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                    
                                                    {/* Delete button */}
                                                    <button
                                                        onClick={() => handleDeletePost(post.id, post.title)}
                                                        disabled={processing}
                                                        className="inline-flex items-center p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                                                        title="Delete post"
                                                    >
                                                        <FiTrash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                        {/* Expanded Row */}
                                        {expandedRows.has(post.id) && (
                                            <tr>
                                                <td colSpan="7" className="px-6 py-6 bg-gray-50 border-b border-gray-200">
                                                    <div className="max-w-none">
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                            {/* Content Preview */}
                                                            <div className="lg:col-span-2">
                                                                <h4 className="text-sm font-semibold text-gray-900 mb-3">Content Preview</h4>
                                                                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                                                    {post.content ? (
                                                                        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                                                                            {truncateContent(post.content, 400)}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-gray-500 italic text-sm">No content available</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Featured Image & Meta */}
                                                            <div className="space-y-4">
                                                                {post.featuredImage && (
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Featured Image</h4>
                                                                        <img 
                                                                            src={post.featuredImage} 
                                                                            alt="Featured" 
                                                                            className="w-full h-32 object-cover rounded-lg border border-gray-200 shadow-sm"
                                                                        />
                                                                    </div>
                                                                )}
                                                                
                                                                <div>
                                                                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Quick Actions</h4>
                                                                    <div className="space-y-2">
                                                                        <button
                                                                            onClick={() => handlePreviewPost(post)}
                                                                            className="w-full px-3 py-2 bg-indigo-100 text-indigo-700 rounded-md text-sm font-medium hover:bg-indigo-200 transition-colors"
                                                                        >
                                                                            Full Preview
                                                                        </button>
                                                                        {post.slug && (
                                                                            <Link
                                                                                to={`/blog-editor/${post.id}`}
                                                                                className="w-full inline-block px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium text-center hover:bg-gray-200 transition-colors"
                                                                            >
                                                                                Edit Post
                                                                            </Link>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                                <div className="text-sm text-gray-700">
                                    Showing {((currentPage - 1) * 20) + 1} to {Math.min(currentPage * 20, pagination.totalCount)} of {pagination.totalCount} posts
                                </div>
                                
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={!pagination.hasPreviousPage}
                                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                                    >
                                        Previous
                                    </button>
                                    
                                    <span className="px-3 py-1 text-sm">
                                        Page {currentPage} of {pagination.totalPages}
                                    </span>
                                    
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                                        disabled={!pagination.hasNextPage}
                                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            
            {/* Preview Modal */}
            <BlogPreviewModal 
                post={previewPost}
                isOpen={isPreviewOpen}
                onClose={closePreview}
            />
        </div>
    );
};

export default BlogManagement;
