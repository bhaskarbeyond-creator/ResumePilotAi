import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { 
    createBlogPost,
    updateBlogPost, 
    getBlogPostBySlug,
    listBlogCategories,
    getUserBlogPosts,
    deleteBlogPost
} from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';
import Spinner from '../../Spinner/Spinner';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import fire from '../../../conf/fire';
import DOMPurify from 'dompurify';
import './TiptapEditor.css';
import { 
    FiSave, 
    FiEye, 
    FiArrowLeft,
    FiTrash2,
    FiAlertCircle,
    FiCheck,
    FiX,
    FiImage,
    FiTag,
    FiFileText,
    FiBold,
    FiItalic,
    FiList,
    FiCode,
    FiLink,
    FiType,
    FiUnderline,
    FiAlignLeft,
    FiAlignCenter,
    FiAlignRight,
    FiAlignJustify,
    FiGrid,
    FiPlusCircle,
    FiMinus,
    FiEdit2,
    FiRotateCcw,
    FiRotateCw,
    FiShield
} from 'react-icons/fi';

const BlogEditor = () => {
    const { postId } = useParams();
    const navigate = useNavigate();
    const user = useContext(AuthContext);
    
    const [post, setPost] = useState({
        title: '',
        content: '',
        excerpt: '',
        categoryId: '',
        tags: [],
        featuredImage: ''
    });
    
    const [categories, setCategories] = useState([]);
    const [userPosts, setUserPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [errors, setErrors] = useState({});
    const [tagInput, setTagInput] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [notification, setNotification] = useState(null);
    const [showImageModal, setShowImageModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');

    // Tiptap editor initialization
    const editor = useEditor({
        extensions: [
            StarterKit,
            Image.configure({
                inline: false,
                allowBase64: false,
                HTMLAttributes: {
                    class: 'max-w-full h-auto rounded-lg shadow-sm',
                },
            }),
            TiptapLink.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'text-blue-600 hover:text-blue-800 underline cursor-pointer',
                },
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
            Underline,
            Highlight.configure({
                HTMLAttributes: {
                    class: 'bg-yellow-200 px-1 rounded',
                },
            }),
            TextStyle,
            Color,
        ],
        content: post.content,
        onUpdate: ({ editor }) => {
            setPost(prev => ({ ...prev, content: editor.getHTML() }));
        },
        editorProps: {
            attributes: {
                class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] p-4',
            },
        },
    });

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
        if (!user) {
            navigate('/');
            return;
        }
        
        initializeEditor();
    }, [user, postId]);

    useEffect(() => {
        // Update document title
        const title = isEditing && post.title ? `Edit: ${post.title}` : 'Create New Post';
        document.title = `${title} - Blog Editor`;
    }, [isEditing, post.title]);

    // Sync editor content when post content changes
    useEffect(() => {
        if (editor && editor.getHTML() !== post.content) {
            editor.commands.setContent(post.content);
        }
    }, [editor, post.content]);

    // Cleanup editor on unmount
    useEffect(() => {
        return () => {
            if (editor) {
                editor.destroy();
            }
        };
    }, [editor]);

    const initializeEditor = async () => {
        setLoading(true);
        
        try {
            // Fetch categories
            const categoriesResult = await listBlogCategories();
            setCategories(categoriesResult);

            // If editing existing post
            if (postId) {
                // Try to fetch by ID first, then by slug if not found
                let postData = null;
                
                // First try to get user's posts to find the post
                const userPostsResult = await getUserBlogPosts(user.uid, {
                    status: 'all',
                    limit: 100
                });
                
                if (userPostsResult.success) {
                    setUserPosts(userPostsResult.posts);
                    postData = userPostsResult.posts.find(p => p.id === postId);
                }
                
                if (postData && postData.authorUid === user.uid) {
                    setPost({
                        title: postData.title || '',
                        content: postData.content || '',
                        excerpt: postData.excerpt || '',
                        categoryId: postData.categoryId || '',
                        tags: postData.tags || [],
                        featuredImage: postData.featuredImage || ''
                    });
                    setIsEditing(true);
                } else {
                    showNotification('Post not found or you do not have permission to edit it.', 'error');
                    navigate('/blog-editor');
                }
            } else {
                // Load user's posts for the dashboard
                const userPostsResult = await getUserBlogPosts(user.uid, {
                    status: 'all',
                    limit: 50
                });
                
                if (userPostsResult.success) {
                    setUserPosts(userPostsResult.posts);
                }
            }
        } catch (error) {
            console.error('Error initializing editor:', error);
            showNotification('Failed to load editor. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const validateForm = () => {
        const newErrors = {};
        
        if (!post.title.trim()) {
            newErrors.title = 'Title is required';
        } else if (post.title.length > 200) {
            newErrors.title = 'Title must be less than 200 characters';
        }
        
        // Check content from the editor
        const editorContent = editor ? editor.getHTML() : '';
        const hasContent = editorContent.trim().length > 0 && 
                          editorContent.replace(/<[^>]*>/g, '').trim().length > 0; // Remove HTML tags to check actual text content
        
        if (!hasContent) {
            newErrors.content = 'Content is required';
        }
        
        if (!post.categoryId) {
            newErrors.categoryId = 'Category is required';
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            showNotification('Please fix the errors before saving.', 'error');
            return;
        }

        setSaving(true);
        
        try {
            // Get the HTML content from the editor
            const editorContent = editor ? editor.getHTML() : '';
            
            // Sanitize all content before saving
            const sanitizedContent = sanitizeContent(editorContent);
            const sanitizedTitle = sanitizeText(post.title);
            const sanitizedExcerpt = post.excerpt ? sanitizeText(post.excerpt) : generateExcerpt(sanitizedContent);
            
            // Validate that sanitization didn't remove critical content
            if (sanitizedContent.trim().length === 0 && editorContent.trim().length > 0) {
                showNotification('Content contains invalid or potentially dangerous HTML that was removed. Please review your content.', 'error');
                setSaving(false);
                return;
            }
            
            // Sanitize tags as well
            const sanitizedTags = post.tags.map(tag => sanitizeText(tag)).filter(tag => tag.trim().length > 0);
            
            // Validate and sanitize featured image URL
            let sanitizedFeaturedImage = '';
            if (post.featuredImage) {
                const imageUrlRegex = /^https?:\/\//i;
                if (imageUrlRegex.test(post.featuredImage)) {
                    sanitizedFeaturedImage = post.featuredImage.trim();
                } else {
                    showNotification('Featured image must be a valid URL starting with http:// or https://', 'error');
                    setSaving(false);
                    return;
                }
            }
            
            const postData = {
                ...post,
                title: sanitizedTitle,
                content: sanitizedContent,
                excerpt: sanitizedExcerpt,
                tags: sanitizedTags,
                featuredImage: sanitizedFeaturedImage
            };

            let result;
            if (isEditing && postId) {
                result = await updateBlogPost(postId, postData, user.uid);
            } else {
                result = await createBlogPost(user.uid, postData);
            }

            if (result.success) {
                showNotification(
                    isEditing 
                        ? 'Post updated successfully! Changes are pending approval.'
                        : 'Post created successfully! It will be reviewed before publishing.', 
                    'success'
                );
                
                // Refresh user posts
                const userPostsResult = await getUserBlogPosts(user.uid, {
                    status: 'all',
                    limit: 50
                });
                
                if (userPostsResult.success) {
                    setUserPosts(userPostsResult.posts);
                }

                // If it's a new post, redirect to edit mode
                if (!isEditing && result.postId) {
                    navigate(`/blog-editor/${result.postId}`);
                }
            } else {
                showNotification(result.error || 'Failed to save post. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error saving post:', error);
            showNotification('Failed to save post. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing || !postId) return;

        setSaving(true);
        
        try {
            const result = await deleteBlogPost(postId);
            
            if (result.success) {
                showNotification('Post deleted successfully.', 'success');
                setTimeout(() => navigate('/blog-editor'), 1000);
            } else {
                showNotification(result.error || 'Failed to delete post.', 'error');
            }
        } catch (error) {
            console.error('Error deleting post:', error);
            showNotification('Failed to delete post. Please try again.', 'error');
        } finally {
            setSaving(false);
            setShowDeleteConfirm(false);
        }
    };

    const handleTagAdd = () => {
        if (tagInput.trim() && !post.tags.includes(tagInput.trim())) {
            setPost(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()]
            }));
            setTagInput('');
        }
    };

    const handleTagRemove = (tagToRemove) => {
        setPost(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    const handleTagInputKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleTagAdd();
        }
    };

    // Image insertion handler
    const handleImageInsert = () => {
        if (imageUrl && editor) {
            // Validate image URL
            const urlRegex = /^https?:\/\//i;
            
            if (!urlRegex.test(imageUrl)) {
                showNotification('Please enter a valid image URL starting with http:// or https://', 'error');
                return;
            }
            
            // Insert image with loading attribute for performance
            editor.chain().focus().setImage({ 
                src: imageUrl,
                alt: 'Inserted image',
                loading: 'lazy'
            }).run();
            setImageUrl('');
            setShowImageModal(false);
        }
    };

    // Link insertion handler
    const handleLinkInsert = () => {
        if (linkUrl && editor) {
            // Validate and sanitize the URL
            const urlRegex = /^https?:\/\/|^mailto:|^tel:|^#/i;
            
            if (!urlRegex.test(linkUrl)) {
                showNotification('Please enter a valid URL starting with http://, https://, mailto:, tel:, or #', 'error');
                return;
            }
            
            // Sanitize the link text if provided
            const sanitizedLinkText = linkText ? sanitizeText(linkText) : '';
            
            if (sanitizedLinkText) {
                // Use sanitized content for manual link insertion
                const sanitizedHtml = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${sanitizedLinkText}</a>`;
                editor.chain().focus().insertContent(sanitizedHtml).run();
            } else {
                // Use Tiptap's built-in link command for selected text
                editor.chain().focus().setLink({ 
                    href: linkUrl, 
                    target: '_blank', 
                    rel: 'noopener noreferrer' 
                }).run();
            }
            setLinkUrl('');
            setLinkText('');
            setShowLinkModal(false);
        }
    };

    // Remove link handler
    const handleLinkRemove = () => {
        if (editor) {
            editor.chain().focus().unsetLink().run();
        }
    };

    // Comprehensive content sanitization function
    const sanitizeContent = (htmlContent) => {
        if (!htmlContent) return '';
        
        // Configure DOMPurify with strict settings for blog content
        const cleanContent = DOMPurify.sanitize(htmlContent, {
            // Allow only safe HTML tags that are commonly used in blog posts
            ALLOWED_TAGS: [
                'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'mark',
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li',
                'blockquote', 'code', 'pre',
                'a', 'img',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'div', 'span'
            ],
            // Allow only safe attributes
            ALLOWED_ATTR: [
                'href', 'title', 'alt', 'src', 'width', 'height',
                'class', 'style', 'target', 'rel',
                'data-*' // Allow data attributes for Tiptap functionality
            ],
            // Additional security settings
            ALLOW_DATA_ATTR: false, // Disable data attributes for extra security
            FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
            FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover'],
            // Remove any javascript: or data: URLs
            ALLOWED_URI_REGEXP: /^https?:\/\/|^mailto:|^tel:|^#/i,
            // Add target="_blank" and rel="noopener noreferrer" to external links for security
            ADD_ATTR: {
                'a': {'target': '_blank', 'rel': 'noopener noreferrer'},
                'img': {'loading': 'lazy'}
            },
            // Remove empty elements
            KEEP_CONTENT: true,
            // Prevent XSS in CSS styles
            ALLOW_UNKNOWN_PROTOCOLS: false,
        });
        
        return cleanContent;
    };

    // Sanitize title and excerpt as well
    const sanitizeText = (text) => {
        if (!text) return '';
        // For plain text fields, strip all HTML and encode special characters
        return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    };

    const generateExcerpt = (content) => {
        if (!content) return '';
        
        // First sanitize the content to ensure it's safe
        const sanitizedContent = sanitizeContent(content);
        
        // Strip HTML tags and get plain text
        const plainText = sanitizedContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        
        // Generate excerpt with appropriate length
        return plainText.length > 160 ? plainText.substring(0, 160).trim() + '...' : plainText;
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending Review' },
            approved: { color: 'bg-green-100 text-green-800', text: 'Published' },
            rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected' }
        };
        
        const badge = badges[status] || badges.pending;
        
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                {badge.text}
            </span>
        );
    };

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

    if (!user) {
        return (
            <>
                <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
                <div className="min-h-screen bg-gray-50 flex items-center justify-center pt-16">
                    <div className="text-center">
                        <FiAlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
                        <p className="text-gray-600 mb-6">You must be logged in to create or edit blog posts.</p>
                        <Link to="/" className="text-blue-600 hover:text-blue-700 font-medium">
                            Go to Home
                        </Link>
                    </div>
                </div>
                <HomepageFooter />
            </>
        );
    }

    return (
        <>
            <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
            <div className="min-h-screen bg-gray-50 pt-16">
                {/* Professional Notification */}
                {notification && (
                    <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-xl border ${
                        notification.type === 'success' 
                            ? 'bg-green-50 border-green-200 text-green-800' 
                            : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                        <div className="flex items-center">
                            {notification.type === 'success' ? 
                                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-3">
                                    <FiCheck className="w-4 h-4 text-green-600" />
                                </div> : 
                                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mr-3">
                                    <FiAlertCircle className="w-4 h-4 text-red-600" />
                                </div>
                            }
                            <span className="font-medium text-sm">{notification.message}</span>
                        </div>
                    </div>
                )}

                <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="flex gap-8">
                        {/* Main Editor */}
                        <div className="flex-1 max-w-4xl space-y-6">
                            {/* Navigation and Title Section */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                                {/* Navigation */}
                                <div className="flex items-center space-x-3 mb-6">
                                    <Link 
                                        to="/blog"
                                        className="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 transition-colors duration-200"
                                    >
                                        <FiArrowLeft className="w-4 h-4 mr-2" />
                                        Back to Blog
                                    </Link>
                                    <span className="text-gray-300">•</span>
                                    <span className="text-sm text-gray-500">
                                        {isEditing ? 'Editing Post' : 'Creating New Post'}
                                    </span>
                                    
                                    {/* Preview Button (moved here) */}
                                    {isEditing && post.slug && (
                                        <>
                                            <span className="text-gray-300">•</span>
                                            <Link
                                                to={`/blog/${post.slug}`}
                                                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 transition-colors duration-200"
                                            >
                                                <FiEye className="w-4 h-4 mr-1" />
                                                Preview Post
                                            </Link>
                                        </>
                                    )}
                                </div>
                                
                                {/* Title Input */}
                                <div>
                                    <input
                                        type="text"
                                        id="title"
                                        value={post.title}
                                        onChange={(e) => setPost(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="Enter your post title here..."
                                        className={`w-full px-0 py-3 text-3xl font-bold placeholder-gray-300 border-0 focus:outline-none focus:ring-0 bg-transparent ${
                                            errors.title ? 'text-red-600' : 'text-gray-900'
                                        }`}
                                        style={{ fontSize: '1.875rem', lineHeight: '2.25rem' }}
                                    />
                                    {errors.title && (
                                        <p className="mt-3 text-sm text-red-600 flex items-center">
                                            <FiAlertCircle className="w-4 h-4 mr-2" />
                                            {errors.title}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Tiptap Rich Text Editor */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                                {/* Editor Header */}
                                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <h3 className="text-sm font-semibold text-gray-900">Rich Text Editor</h3>
                                            <div className="flex items-center space-x-2 text-xs">
                                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md font-medium">WYSIWYG</span>
                                                <span className="text-gray-400">•</span>
                                                <span className="text-gray-500">Rich formatting</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {post.content ? post.content.replace(/<[^>]*>/g, '').length : 0} characters
                                        </div>
                                    </div>
                                </div>

                                {/* Professional Multi-Row Toolbar */}
                                {editor && (
                                    <div className="border-b border-gray-100 bg-gray-50/80">
                                        {/* Main Toolbar Row */}
                                        <div className="px-6 py-3 flex items-center justify-between">
                                            <div className="flex items-center space-x-1">
                                                {/* Undo/Redo */}
                                                <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
                                                    <button
                                                        onClick={() => editor.chain().focus().undo().run()}
                                                        disabled={!editor.can().undo()}
                                                        className="p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Undo (Ctrl+Z)"
                                                    >
                                                        <FiRotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().redo().run()}
                                                        disabled={!editor.can().redo()}
                                                        className="p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Redo (Ctrl+Y)"
                                                    >
                                                        <FiRotateCw className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                {/* Text Formatting */}
                                                <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleBold().run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('bold') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Bold (Ctrl+B)"
                                                    >
                                                        <FiBold className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleItalic().run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('italic') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Italic (Ctrl+I)"
                                                    >
                                                        <FiItalic className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('underline') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Underline (Ctrl+U)"
                                                    >
                                                        <FiUnderline className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleHighlight().run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('highlight') ? 'bg-yellow-100 text-yellow-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Highlight"
                                                    >
                                                        <div className="w-4 h-4 bg-current rounded-sm opacity-60"></div>
                                                    </button>
                                                </div>

                                                {/* Headings */}
                                                <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
                                                    <button
                                                        onClick={() => editor.chain().focus().setParagraph().run()}
                                                        className={`px-2 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('paragraph') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Normal Text"
                                                    >
                                                        P
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                                                        className={`px-2 py-1 text-xs font-bold rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('heading', { level: 1 }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Heading 1"
                                                    >
                                                        H1
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                                                        className={`px-2 py-1 text-xs font-bold rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Heading 2"
                                                    >
                                                        H2
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                                                        className={`px-2 py-1 text-xs font-bold rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('heading', { level: 3 }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Heading 3"
                                                    >
                                                        H3
                                                    </button>
                                                </div>

                                                {/* Text Alignment */}
                                                <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
                                                    <button
                                                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive({ textAlign: 'left' }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Align Left"
                                                    >
                                                        <FiAlignLeft className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive({ textAlign: 'center' }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Align Center"
                                                    >
                                                        <FiAlignCenter className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive({ textAlign: 'right' }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Align Right"
                                                    >
                                                        <FiAlignRight className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive({ textAlign: 'justify' }) ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Justify"
                                                    >
                                                        <FiAlignJustify className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                {/* Lists */}
                                                <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Bullet List"
                                                    >
                                                        <FiList className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Numbered List"
                                                    >
                                                        <span className="text-xs font-bold">1.</span>
                                                    </button>
                                                </div>

                                                {/* Insert Elements */}
                                                <div className="flex items-center space-x-1">
                                                    <button
                                                        onClick={() => setShowImageModal(true)}
                                                        className="p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 text-gray-600"
                                                        title="Insert Image"
                                                    >
                                                        <FiImage className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setShowLinkModal(true)}
                                                        className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                            editor.isActive('link') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                        }`}
                                                        title="Insert Link"
                                                    >
                                                        <FiLink className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                                                        className="p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 text-gray-600"
                                                        title="Insert Table"
                                                    >
                                                        <FiGrid className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Secondary Actions */}
                                            <div className="flex items-center space-x-1">
                                                <button
                                                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                                                    className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                        editor.isActive('blockquote') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                    }`}
                                                    title="Quote"
                                                >
                                                    <span className="text-sm font-bold">&ldquo;&rdquo;</span>
                                                </button>
                                                <button
                                                    onClick={() => editor.chain().focus().toggleCode().run()}
                                                    className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                        editor.isActive('code') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                    }`}
                                                    title="Inline Code"
                                                >
                                                    <FiCode className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                                                    className={`p-2 rounded-md hover:bg-white hover:shadow-sm transition-all duration-200 ${
                                                        editor.isActive('codeBlock') ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-600'
                                                    }`}
                                                    title="Code Block"
                                                >
                                                    <span className="text-xs font-mono">&lt;/&gt;</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Tiptap Editor Content */}
                                <div className="relative">
                                    <div 
                                        className={`min-h-[600px] p-6 focus-within:bg-white ${
                                            errors.content ? 'bg-red-50' : 'bg-white'
                                        }`}
                                    >
                                        <EditorContent 
                                            editor={editor}
                                            className="prose max-w-none focus:outline-none"
                                        />
                                        
                                        {/* Placeholder */}
                                        {editor && editor.isEmpty && (
                                            <div className="absolute top-6 left-6 text-gray-400 pointer-events-none">
                                                Start writing your amazing content here...
                                            </div>
                                        )}
                                    </div>
                                    
                                    {errors.content && (
                                        <div className="absolute top-6 right-6 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center shadow-sm">
                                            <FiAlertCircle className="w-4 h-4 mr-2" />
                                            {errors.content}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Excerpt Section - Enhanced */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">Post Excerpt</h3>
                                            <p className="text-xs text-gray-500 mt-1">A brief summary that appears in post previews</p>
                                        </div>
                                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                                            Optional
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <textarea
                                        id="excerpt"
                                        value={post.excerpt}
                                        onChange={(e) => setPost(prev => ({ ...prev, excerpt: e.target.value }))}
                                        placeholder="Write a compelling excerpt that summarizes your post and entices readers..."
                                        rows={4}
                                        className="w-full border-0 focus:outline-none resize-none text-gray-800 leading-6 placeholder-gray-400 bg-transparent"
                                        style={{ fontSize: '14px' }}
                                    />
                                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                                        <span className="text-xs text-gray-400">
                                            {post.excerpt ? `${post.excerpt.length} characters` : 'Auto-generated if empty'}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            Recommended: 150-160 characters
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Security Notice */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-start space-x-3">
                                    <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                                        <FiShield className="w-3 h-3 text-blue-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-blue-900 mb-1">Content Security</h4>
                                        <p className="text-xs text-blue-700 leading-relaxed">
                                            Your content is automatically sanitized for security. Potentially harmful scripts, 
                                            unsafe HTML tags, and malicious links are removed or modified to keep the platform safe.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Professional Sidebar */}
                        <div className="w-80 space-y-6">
                            {/* Post Status Panel */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                    <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                                        Publish Settings
                                    </h3>
                                </div>
                                <div className="p-6 space-y-5">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-600">Status</span>
                                            <span className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">
                                                {isEditing ? 'Draft' : 'New Post'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-600">Visibility</span>
                                            <span className="text-sm font-medium text-gray-900">Public</span>
                                        </div>
                                        
                                        {isEditing && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-600">Last Modified</span>
                                                <span className="text-sm text-gray-500">
                                                    {new Date().toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="pt-4 border-t border-gray-100 space-y-3">
                                        {/* Primary Action Button */}
                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            className="w-full px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg flex items-center justify-center"
                                        >
                                            {saving ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                                    Saving Changes...
                                                </>
                                            ) : (
                                                <>
                                                    <FiSave className="w-4 h-4 mr-2" />
                                                    {isEditing ? 'Update Post' : 'Publish Post'}
                                                </>
                                            )}
                                        </button>
                                        
                                        {/* Save as Draft Option for new posts */}
                                        {!isEditing && (
                                            <button
                                                onClick={() => {
                                                    // Save as draft logic could be added here
                                                    handleSave();
                                                }}
                                                disabled={saving}
                                                className="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
                                            >
                                                <FiFileText className="w-4 h-4 mr-2" />
                                                Save as Draft
                                            </button>
                                        )}
                                    </div>
                                    
                                    {isEditing && (
                                        <div>
                                            <button
                                                onClick={() => setShowDeleteConfirm(true)}
                                                className="w-full px-4 py-2 text-red-600 text-sm font-medium border-2 border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all duration-200 flex items-center justify-center"
                                            >
                                                <FiTrash2 className="w-4 h-4 mr-2" />
                                                Move to Trash
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Categories Panel */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                    <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                                        <FiFileText className="w-4 h-4 mr-2 text-gray-500" />
                                        Category
                                    </h3>
                                </div>
                                <div className="p-6">
                                    <select
                                        id="category"
                                        value={post.categoryId}
                                        onChange={(e) => setPost(prev => ({ ...prev, categoryId: e.target.value }))}
                                        className={`w-full px-4 py-3 border text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                                            errors.categoryId ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <option value="">Select a category</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.categoryId && (
                                        <p className="mt-3 text-sm text-red-600 flex items-center">
                                            <FiAlertCircle className="w-4 h-4 mr-1" />
                                            {errors.categoryId}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Tags Panel */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                    <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                                        <FiTag className="w-4 h-4 mr-2 text-gray-500" />
                                        Tags
                                    </h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyPress={handleTagInputKeyPress}
                                            placeholder="Add tag..."
                                            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-all duration-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleTagAdd}
                                            disabled={!tagInput.trim()}
                                            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    
                                    {post.tags.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs text-gray-500 font-medium mb-2">
                                                {post.tags.length} {post.tags.length === 1 ? 'tag' : 'tags'}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {post.tags.map((tag, index) => (
                                                    <span
                                                        key={index}
                                                        className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200"
                                                    >
                                                        #{tag}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTagRemove(tag)}
                                                            className="ml-2 text-blue-500 hover:text-blue-700 transition-colors duration-200"
                                                        >
                                                            <FiX className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Featured Image Panel */}
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                    <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                                        <FiImage className="w-4 h-4 mr-2 text-gray-500" />
                                        Featured Image
                                    </h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <input
                                        type="url"
                                        id="featuredImage"
                                        value={post.featuredImage}
                                        onChange={(e) => setPost(prev => ({ ...prev, featuredImage: e.target.value }))}
                                        placeholder="https://example.com/image.jpg"
                                        className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-all duration-200"
                                    />
                                    {post.featuredImage && (
                                        <div className="space-y-2">
                                            <img 
                                                src={post.featuredImage} 
                                                alt="Featured preview" 
                                                className="w-full h-40 object-cover rounded-lg border border-gray-200 shadow-sm"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                            <p className="text-xs text-gray-500">
                                                Preview of your featured image
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Posts Panel */}
                            {userPosts.length > 0 && (
                                <div className="bg-white border border-gray-300 rounded-sm">
                                    <div className="border-b border-gray-200 px-4 py-3 bg-gray-50">
                                        <h3 className="text-sm font-medium text-gray-900">Your Recent Posts</h3>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {userPosts.slice(0, 5).map((userPost) => (
                                            <div key={userPost.id} className="p-3 hover:bg-gray-50 transition-colors duration-200">
                                                <Link
                                                    to={`/blog-editor/${userPost.id}`}
                                                    className="block"
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 truncate hover:text-blue-600 transition-colors duration-200">
                                                                {userPost.title || 'Untitled'}
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {new Date(userPost.createdAt).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        <div className="ml-2 flex-shrink-0">
                                                            {getStatusBadge(userPost.status)}
                                                        </div>
                                                    </div>
                                                </Link>
                                            </div>
                                        ))}
                                        {userPosts.length > 5 && (
                                            <div className="p-3 text-center">
                                                <span className="text-xs text-gray-500">
                                                    +{userPosts.length - 5} more posts
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Image Insert Modal */}
                {showImageModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                                    <FiImage className="w-5 h-5 mr-2 text-blue-600" />
                                    Insert Image
                                </h3>
                                <button
                                    onClick={() => setShowImageModal(false)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                >
                                    <FiX className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Image URL
                                    </label>
                                    <input
                                        type="url"
                                        value={imageUrl}
                                        onChange={(e) => setImageUrl(e.target.value)}
                                        placeholder="https://example.com/image.jpg"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                handleImageInsert();
                                            }
                                        }}
                                    />
                                </div>
                                
                                {imageUrl && (
                                    <div className="border border-gray-200 rounded-lg p-4">
                                        <p className="text-sm text-gray-600 mb-2">Preview:</p>
                                        <img 
                                            src={imageUrl} 
                                            alt="Preview" 
                                            className="max-w-full h-32 object-cover rounded-lg"
                                            onError={(e) => {
                                                e.target.src = '';
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    onClick={() => setShowImageModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleImageInsert}
                                    disabled={!imageUrl}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                                >
                                    Insert Image
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Link Insert Modal */}
                {showLinkModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                                    <FiLink className="w-5 h-5 mr-2 text-blue-600" />
                                    Insert Link
                                </h3>
                                <button
                                    onClick={() => setShowLinkModal(false)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                >
                                    <FiX className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Link URL
                                    </label>
                                    <input
                                        type="url"
                                        value={linkUrl}
                                        onChange={(e) => setLinkUrl(e.target.value)}
                                        placeholder="https://example.com"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Link Text (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={linkText}
                                        onChange={(e) => setLinkText(e.target.value)}
                                        placeholder="Click here"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                handleLinkInsert();
                                            }
                                        }}
                                    />
                                </div>
                                
                                {editor && editor.isActive('link') && (
                                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <p className="text-sm text-yellow-800 flex items-center">
                                            <FiAlertCircle className="w-4 h-4 mr-2" />
                                            Link is currently selected. This will update the existing link.
                                        </p>
                                        <button
                                            onClick={handleLinkRemove}
                                            className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
                                        >
                                            Remove Link
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    onClick={() => setShowLinkModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLinkInsert}
                                    disabled={!linkUrl}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                                >
                                    Insert Link
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                                    <FiTrash2 className="w-5 h-5 mr-2 text-red-600" />
                                    Delete Post
                                </h3>
                            </div>
                            <p className="text-gray-600 mb-6">
                                Are you sure you want to delete this post? This action cannot be undone.
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={saving}
                                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors duration-200"
                                >
                                    {saving ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
            <HomepageFooter />
        </>
    );
};

export default BlogEditor;