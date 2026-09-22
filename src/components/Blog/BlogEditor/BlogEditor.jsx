import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
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
  deleteBlogPost, 
  getBlogPostById, 
  listBlogCategories, 
  listBlogPosts, 
  getUserBlogPosts 
} from '../../../services/api/platform';
import { AuthContext } from '../../../context/AuthContext';
import Spinner from '../../Spinner/Spinner';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import '../../Dashboard2/public-site.css';
import './TiptapEditor.css';
import fire from '../../../conf/fire';
import { sanitizeBlogHtml, sanitizeImageUrl } from '../../../utils/sanitizeHtml';
import { 
  FiSave, FiEye, FiArrowLeft, FiTrash2, FiAlertCircle, FiCheck, FiX, 
  FiImage, FiTag, FiFileText, FiBold, FiItalic, FiList, FiCode, 
  FiLink, FiType, FiUnderline, FiAlignLeft, FiAlignCenter, FiAlignRight, 
  FiAlignJustify, FiGrid, FiPlusCircle, FiMinus, FiEdit2, FiRotateCcw, 
  FiRotateCw, FiShield, FiExternalLink, FiSearch, FiSliders, FiClock, 
  FiCheckCircle, FiShare2, FiLock, FiUnlock, FiRefreshCw
} from 'react-icons/fi';

const SAMPLE_COVERS = [
  'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&auto=format&fit=crop&q=80',
];

const DEFAULT_CATEGORIES = [
  'ATS Resumes',
  'Career Growth',
  'Interview Prep',
  'AI & Technology',
  'Job Search',
  'General'
];

export default function BlogEditor({ user: propUser }) {
  const { postId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const ctxUser = useContext(AuthContext);
  const user = propUser || ctxUser || fire.auth()?.currentUser;

  const [post, setPost] = useState({
    id: '',
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    category: 'ATS Resumes',
    tags: [],
    coverImage: '',
    author: 'Editorial Team',
    authorId: '',
    seoTitle: '',
    seoDescription: '',
    status: 'draft',
    published: false,
    revision: 1,
    views: 0,
    likes: 0,
    updatedAt: null,
  });

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [allPosts, setAllPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [slugLocked, setSlugLocked] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [notification, setNotification] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'settings' | 'seo'

  // Is navigated from Admin panel
  const isFromAdmin = location.state?.fromAdmin || document.referrer?.includes('/adm') || location.search.includes('admin=1');

  // Calculate read time and words
  const stats = useMemo(() => {
    const plain = (post.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plain ? plain.split(/\s+/).length : 0;
    const chars = plain.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readTimeMinutes };
  }, [post.content]);

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rp-editor-img max-w-full h-auto rounded-xl shadow-md my-4',
        },
      }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 hover:text-blue-800 underline font-medium',
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
    content: post.content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setPost((prev) => ({ ...prev, content: html }));
      setHasUnsavedChanges(true);
    },
    editorProps: {
      attributes: {
        class: 'rp-tiptap-content prose prose-lg max-w-none focus:outline-none min-h-[480px] p-6 text-slate-800',
        'aria-label': 'Post content editor',
      },
    },
  });

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper to generate slug from title
  const generateSlug = (text) => {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80);
  };

  // Handle title changes and auto-slug
  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setHasUnsavedChanges(true);
    setPost((prev) => {
      const next = { ...prev, title: newTitle };
      if (!isEditing || !slugLocked) {
        next.slug = generateSlug(newTitle);
      }
      if (!prev.seoTitle || prev.seoTitle === prev.title) {
        next.seoTitle = newTitle;
      }
      return next;
    });
  };

  // Auto-generate excerpt from content
  const handleAutoExcerpt = () => {
    const plain = (post.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain) {
      const excerpt = plain.slice(0, 160) + (plain.length > 160 ? '...' : '');
      setPost((prev) => ({ ...prev, excerpt, seoDescription: prev.seoDescription || excerpt }));
      setHasUnsavedChanges(true);
      showNotification('Excerpt auto-generated from content.');
    }
  };

  // Load categories and post data on mount or param change
  useEffect(() => {
    let mounted = true;

    async function loadInitialData() {
      setLoading(true);
      try {
        // 1. Fetch categories
        const catRes = await listBlogCategories();
        if (mounted && Array.isArray(catRes) && catRes.length > 0) {
          const names = catRes.map((c) => (typeof c === 'string' ? c : c.name || c.id)).filter(Boolean);
          if (names.length > 0) setCategories(Array.from(new Set([...DEFAULT_CATEGORIES, ...names])));
        }

        // 2. Fetch recent post list for switcher
        const postsRes = await listBlogPosts({ limit: 20 });
        if (mounted && postsRes?.posts) {
          setAllPosts(postsRes.posts);
        }

        // 3. If editing existing post
        if (postId) {
          const loaded = await getBlogPostById(postId);
          if (mounted && loaded) {
            const rawTags = loaded.tags;
            let parsedTags = [];
            if (Array.isArray(rawTags)) parsedTags = rawTags;
            else if (typeof rawTags === 'string') {
              try { parsedTags = JSON.parse(rawTags); } catch (_) { parsedTags = rawTags.split(',').map((t) => t.trim()).filter(Boolean); }
            }

            const cover = loaded.cover_image || loaded.coverImage || loaded.featuredImage || '';
            const status = loaded.status || (loaded.published ? 'approved' : 'draft');
            const isPub = status === 'approved' || status === 'published' || Boolean(loaded.published);

            setPost({
              id: loaded.id || postId,
              title: loaded.title || '',
              slug: loaded.slug || '',
              content: loaded.content || '',
              excerpt: loaded.excerpt || '',
              category: loaded.category || loaded.categoryName || 'ATS Resumes',
              tags: parsedTags,
              coverImage: cover,
              author: loaded.author || (user?.displayName || user?.email?.split('@')[0] || 'Admin'),
              authorId: loaded.author_id || loaded.authorUid || user?.uid || '',
              seoTitle: loaded.seoTitle || loaded.seo_title || loaded.title || '',
              seoDescription: loaded.seoDescription || loaded.seo_description || loaded.excerpt || '',
              status: isPub ? 'approved' : status,
              published: isPub,
              revision: Number(loaded.revision || 1),
              views: Number(loaded.views || 0),
              likes: Number(loaded.likes || 0),
              updatedAt: loaded.updated_at || loaded.updatedAt || null,
            });

            setIsEditing(true);
            setSlugLocked(true);

            if (editor && !editor.isDestroyed) {
              editor.commands.setContent(loaded.content || '', { emitUpdate: false });
            }
          } else if (mounted) {
            showNotification('Post could not be loaded or not found.', 'error');
          }
        } else if (mounted) {
          // New post initial setup
          const defaultAuthor = user?.displayName || user?.email?.split('@')[0] || 'Editorial Team';
          setPost((prev) => ({
            ...prev,
            id: `post_${Date.now()}`,
            author: defaultAuthor,
            authorId: user?.uid || '',
          }));
          setIsEditing(false);
          setSlugLocked(false);
        }
      } catch (err) {
        console.error('[BlogEditor] Failed to initialize editor:', err);
        if (mounted) showNotification('Failed to initialize blog editor.', 'error');
      } finally {
        if (mounted) {
          setLoading(false);
          setHasUnsavedChanges(false);
        }
      }
    }

    loadInitialData();

    return () => { mounted = false; };
  }, [postId, user]);

  // Sync editor content when post content changes initially
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (post.content && editor.getHTML() !== post.content) {
      editor.commands.setContent(post.content, { emitUpdate: false });
    }
  }, [editor, post.id]);

  // Handle Save (Draft vs Publish)
  const handleSave = async (publishStatus = null) => {
    if (!post.title.trim()) {
      showNotification('Please enter a post title before saving.', 'error');
      return;
    }

    setSaving(true);
    try {
      const editorHtml = editor ? editor.getHTML() : post.content;
      const sanitizedHtml = sanitizeBlogHtml(editorHtml);
      const isPublishing = publishStatus === 'publish' || (publishStatus === null && post.published);
      const nextStatus = isPublishing ? 'approved' : 'draft';
      const cleanSlug = (post.slug || generateSlug(post.title)).trim();

      const payload = {
        ...post,
        id: post.id || (postId ? postId : `post_${Date.now()}`),
        title: post.title.trim(),
        slug: cleanSlug,
        content: sanitizedHtml,
        excerpt: post.excerpt.trim() || sanitizedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160),
        category: post.category || 'General',
        tags: post.tags || [],
        coverImage: post.coverImage ? sanitizeImageUrl(post.coverImage) : null,
        cover_image: post.coverImage ? sanitizeImageUrl(post.coverImage) : null,
        author: post.author || 'Admin',
        authorId: post.authorId || user?.uid || null,
        author_id: post.authorId || user?.uid || null,
        seoTitle: post.seoTitle || post.title,
        seoDescription: post.seoDescription || post.excerpt,
        status: nextStatus,
        published: isPublishing ? 1 : 0,
        publishedAt: isPublishing ? (post.publishedAt || new Date().toISOString()) : null,
        revision: Number(post.revision || 1) + 1,
      };

      const targetId = payload.id;
      let res;
      if (isEditing && postId) {
        res = await updateBlogPost(targetId, payload, user?.uid, post.revision);
      } else {
        res = await createBlogPost(user?.uid || 'admin', payload);
      }

      if (res?.success) {
        setPost((prev) => ({
          ...prev,
          ...payload,
          status: nextStatus,
          published: isPublishing,
          revision: payload.revision,
          updatedAt: new Date().toISOString(),
        }));
        setHasUnsavedChanges(false);
        setIsEditing(true);
        showNotification(
          isPublishing 
            ? '🎉 Post published and live on the public blog!' 
            : '✓ Draft saved successfully.', 
          'success'
        );

        if (!postId && targetId) {
          navigate(`/blog-editor/${targetId}`, { replace: true });
        }
      } else {
        showNotification(res?.error || 'Failed to save post. Please try again.', 'error');
      }
    } catch (err) {
      console.error('[BlogEditor] Save error:', err);
      showNotification('Error saving blog post: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!postId && !post.id) return;
    setSaving(true);
    try {
      await deleteBlogPost(postId || post.id);
      showNotification('Post deleted successfully.', 'success');
      setShowDeleteConfirm(false);
      setTimeout(() => {
        if (isFromAdmin) navigate('/adm');
        else navigate('/blog');
      }, 700);
    } catch (err) {
      console.error('[BlogEditor] Delete error:', err);
      showNotification('Failed to delete post: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Tag helpers
  const handleAddTag = (val = null) => {
    const candidate = (val || tagInput).trim();
    if (candidate && !post.tags.includes(candidate)) {
      setPost((prev) => ({ ...prev, tags: [...prev.tags, candidate] }));
      setHasUnsavedChanges(true);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setPost((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }));
    setHasUnsavedChanges(true);
  };

  // Insert Image via Modal
  const handleInsertImage = () => {
    if (imageUrl && editor) {
      const safe = sanitizeImageUrl(imageUrl);
      if (safe) {
        editor.chain().focus().setImage({ src: safe, alt: post.title || 'Blog image' }).run();
        setShowImageModal(false);
        setImageUrl('');
        setHasUnsavedChanges(true);
      } else {
        showNotification('Please enter a valid HTTPS image URL.', 'error');
      }
    }
  };

  // Insert Link via Modal
  const handleInsertLink = () => {
    if (linkUrl && editor) {
      if (linkText) {
        editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run();
      } else {
        editor.chain().focus().setLink({ href: linkUrl }).run();
      }
      setShowLinkModal(false);
      setLinkUrl('');
      setLinkText('');
      setHasUnsavedChanges(true);
    }
  };

  if (loading) {
    return (
      <div className="rp-public-site">
        <HomepageNavbar />
        <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
          <p style={{ marginTop: '16px', color: '#64748b', fontWeight: '500' }}>Loading Blog Studio...</p>
        </div>
        <HomepageFooter />
      </div>
    );
  }

  return (
    <div className="rp-public-site" style={{ background: '#f8fafd', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. Studio Header Bar */}
      <header 
        style={{ 
          background: 'rgba(255, 255, 255, 0.95)', 
          backdropFilter: 'blur(16px)', 
          borderBottom: '1px solid #e2e8f0', 
          position: 'sticky', 
          top: 0, 
          zIndex: 1000, 
          padding: '12px 24px' 
        }}
      >
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          
          {/* Left: Return breadcrumb + Post Title Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              id="rp-btn-return-admin"
              onClick={() => {
                if (isFromAdmin) navigate('/adm');
                else navigate('/blog');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: '600',
                color: '#475569',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <FiArrowLeft /> {isFromAdmin ? 'Admin Console' : 'Career Blog'}
            </button>

            <span style={{ color: '#cbd5e1' }}>|</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                {isEditing ? 'Editing Article' : 'New Article'}
              </span>
              <span 
                aria-live="polite"
                style={{ 
                  fontSize: '11px', 
                  fontWeight: '700', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em', 
                  padding: '3px 8px', 
                  borderRadius: '20px', 
                  background: post.published ? '#e6f4ea' : '#fef3c7', 
                  color: post.published ? '#137333' : '#b45309' 
                }}
              >
                ● {post.published ? 'Published' : 'Private Draft'}
              </span>
              {hasUnsavedChanges && (
                <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '500' }}>
                  (Unsaved Changes)
                </span>
              )}
            </div>
          </div>

          {/* Right: Studio Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            
            {/* Live Preview Button */}
            <button
              type="button"
              id="rp-btn-preview-post"
              onClick={() => setShowPreview(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: '600',
                color: '#1e293b',
                cursor: 'pointer',
              }}
            >
              <FiEye /> Preview
            </button>

            {/* Public Link (if published) */}
            {post.published && post.slug && (
              <a
                href={`/blog/${post.slug}`}
                target="_blank"
                rel="noreferrer"
                id="rp-btn-view-live"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#1a73e8',
                  textDecoration: 'none',
                }}
              >
                <FiExternalLink /> Live Page
              </a>
            )}

            {/* Save as Draft */}
            <button
              type="button"
              id="rp-btn-save-draft"
              disabled={saving}
              onClick={() => handleSave('draft')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: '600',
                color: '#334155',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              <FiSave /> {saving ? 'Saving...' : 'Save Draft'}
            </button>

            {/* Primary Action: Publish / Update Live Post */}
            <button
              type="button"
              id="rp-btn-publish-post"
              disabled={saving}
              onClick={() => handleSave('publish')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '10px',
                background: '#1a73e8',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: '700',
                boxShadow: '0 4px 12px rgba(26, 115, 232, 0.25)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              <FiCheckCircle /> {post.published ? 'Update Live Article' : 'Publish Article'}
            </button>

            {/* Delete button (if existing) */}
            {isEditing && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
                title="Delete Post"
              >
                <FiTrash2 />
              </button>
            )}

          </div>

        </div>
      </header>

      {/* 2. Toast Notification Bar */}
      {notification && (
        <div 
          style={{ 
            position: 'fixed', 
            top: '72px', 
            right: '24px', 
            zIndex: 9999, 
            background: notification.type === 'success' ? '#137333' : '#b3261e', 
            color: '#ffffff', 
            padding: '12px 20px', 
            borderRadius: '12px', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            fontSize: '14px',
            fontWeight: '600',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {notification.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
          {notification.message}
        </div>
      )}

      {/* 3. Studio Workspace Layout (2-Column Grid) */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '24px', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '24px', alignItems: 'start' }}>
          
          {/* Column A: Main Content Editor Canvas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Title & Slug Box */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              
              {/* Title Input */}
              <input
                type="text"
                value={post.title}
                onChange={handleTitleChange}
                placeholder="Article headline / title..."
                style={{
                  width: '100%',
                  fontSize: '28px',
                  fontWeight: '800',
                  color: '#0f172a',
                  border: 'none',
                  outline: 'none',
                  padding: '4px 0',
                  fontFamily: 'inherit',
                  lineHeight: '1.3',
                }}
              />

              {/* Slug / Permalinks helper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '13px', color: '#64748b' }}>
                <span style={{ fontWeight: '600' }}>Permalink:</span>
                <span style={{ color: '#94a3b8' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/blog/` : '/blog/'}
                </span>
                <input
                  type="text"
                  value={post.slug}
                  disabled={slugLocked}
                  onChange={(e) => {
                    setPost((prev) => ({ ...prev, slug: generateSlug(e.target.value) }));
                    setHasUnsavedChanges(true);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: slugLocked ? '1px transparent solid' : '1px solid #cbd5e1',
                    background: slugLocked ? '#f8fafc' : '#ffffff',
                    color: '#0f172a',
                    fontWeight: '600',
                    fontSize: '13px',
                    outline: 'none',
                    minWidth: '180px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSlugLocked(!slugLocked)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: slugLocked ? '#94a3b8' : '#1a73e8',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title={slugLocked ? 'Unlock to edit URL slug' : 'Lock URL slug'}
                >
                  {slugLocked ? <FiLock /> : <FiUnlock />} {slugLocked ? 'Edit' : 'Done'}
                </button>
              </div>

            </div>

            {/* Excerpt Summary Box */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>
                  Article Excerpt / Summary
                </label>
                <button
                  type="button"
                  onClick={handleAutoExcerpt}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1a73e8',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <FiRefreshCw /> Auto-generate from content
                </button>
              </div>
              <textarea
                value={post.excerpt}
                onChange={(e) => {
                  setPost((prev) => ({ ...prev, excerpt: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                rows={2}
                placeholder="A compelling 1-2 sentence preview summary of the post..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  color: '#1e293b',
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Rich Text Editor Box with Sticky Toolbar */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              
              {/* Modern Formatting Toolbar */}
              {editor && (
                <div 
                  style={{ 
                    background: '#f8fafc', 
                    borderBottom: '1px solid #e2e8f0', 
                    padding: '10px 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    flexWrap: 'wrap' 
                  }}
                >
                  {/* Undo / Redo */}
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    style={toolbarBtnStyle(false, !editor.can().undo())}
                    title="Undo (Ctrl+Z)"
                  >
                    <FiRotateCcw />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    style={toolbarBtnStyle(false, !editor.can().redo())}
                    title="Redo (Ctrl+Y)"
                  >
                    <FiRotateCw />
                  </button>

                  <span style={dividerStyle} />

                  {/* Headings */}
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setParagraph().run()}
                    style={toolbarBtnStyle(editor.isActive('paragraph'))}
                    title="Paragraph"
                  >
                    P
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    style={toolbarBtnStyle(editor.isActive('heading', { level: 1 }))}
                    title="Heading 1"
                  >
                    H1
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    style={toolbarBtnStyle(editor.isActive('heading', { level: 2 }))}
                    title="Heading 2"
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    style={toolbarBtnStyle(editor.isActive('heading', { level: 3 }))}
                    title="Heading 3"
                  >
                    H3
                  </button>

                  <span style={dividerStyle} />

                  {/* Formatting: Bold, Italic, Underline, Highlight */}
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    style={toolbarBtnStyle(editor.isActive('bold'))}
                    title="Bold (Ctrl+B)"
                  >
                    <FiBold />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    style={toolbarBtnStyle(editor.isActive('italic'))}
                    title="Italic (Ctrl+I)"
                  >
                    <FiItalic />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    style={toolbarBtnStyle(editor.isActive('underline'))}
                    title="Underline (Ctrl+U)"
                  >
                    <FiUnderline />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    style={toolbarBtnStyle(editor.isActive('highlight'))}
                    title="Highlight"
                  >
                    <span style={{ background: '#fef08a', padding: '0 4px', borderRadius: '3px', color: '#854d0e', fontWeight: '700' }}>H</span>
                  </button>

                  <span style={dividerStyle} />

                  {/* Alignment */}
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    style={toolbarBtnStyle(editor.isActive({ textAlign: 'left' }))}
                    title="Align Left"
                  >
                    <FiAlignLeft />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    style={toolbarBtnStyle(editor.isActive({ textAlign: 'center' }))}
                    title="Align Center"
                  >
                    <FiAlignCenter />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    style={toolbarBtnStyle(editor.isActive({ textAlign: 'right' }))}
                    title="Align Right"
                  >
                    <FiAlignRight />
                  </button>

                  <span style={dividerStyle} />

                  {/* Lists & Quotes */}
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    style={toolbarBtnStyle(editor.isActive('bulletList'))}
                    title="Bullet List"
                  >
                    <FiList />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    style={toolbarBtnStyle(editor.isActive('blockquote'))}
                    title="Blockquote"
                  >
                    “
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    style={toolbarBtnStyle(editor.isActive('codeBlock'))}
                    title="Code Block"
                  >
                    <FiCode />
                  </button>

                  <span style={dividerStyle} />

                  {/* Image & Link Insert */}
                  <button
                    type="button"
                    onClick={() => setShowImageModal(true)}
                    style={toolbarBtnStyle(false)}
                    title="Insert Image"
                  >
                    <FiImage /> Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(true)}
                    style={toolbarBtnStyle(editor.isActive('link'))}
                    title="Insert Link"
                  >
                    <FiLink /> Link
                  </button>
                </div>
              )}

              {/* Tiptap Canvas */}
              <EditorContent editor={editor} />

              {/* Status Bar */}
              <div 
                style={{ 
                  background: '#f8fafc', 
                  borderTop: '1px solid #f1f5f9', 
                  padding: '10px 20px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  fontSize: '12px', 
                  color: '#64748b' 
                }}
              >
                <div style={{ display: 'flex', gap: '16px' }}>
                  <span><strong>{stats.words}</strong> words</span>
                  <span><strong>{stats.chars}</strong> characters</span>
                  <span>~<strong>{stats.readTimeMinutes}</strong> min read</span>
                </div>
                <div>
                  Revision: <strong>#{post.revision}</strong>
                </div>
              </div>

            </div>

          </div>

          {/* Column B: Right Inspector Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* 1. Publishing & Category Card */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiSliders style={{ color: '#1a73e8' }} /> Publishing Settings
              </h3>

              {/* Status Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>
                  Visibility Status
                </label>
                <select
                  value={post.published ? 'approved' : 'draft'}
                  onChange={(e) => {
                    const isPub = e.target.value === 'approved';
                    setPost((prev) => ({ ...prev, published: isPub, status: e.target.value }));
                    setHasUnsavedChanges(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#0f172a',
                    outline: 'none',
                    background: '#ffffff',
                  }}
                >
                  <option value="approved">Published (Live on Website)</option>
                  <option value="draft">Draft (Hidden from Public)</option>
                </select>
              </div>

              {/* Category Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>
                  Category
                </label>
                <select
                  value={post.category}
                  onChange={(e) => {
                    setPost((prev) => ({ ...prev, category: e.target.value }));
                    setHasUnsavedChanges(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#0f172a',
                    outline: 'none',
                    background: '#ffffff',
                  }}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Author Display Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>
                  Author Name
                </label>
                <input
                  type="text"
                  value={post.author}
                  onChange={(e) => {
                    setPost((prev) => ({ ...prev, author: e.target.value }));
                    setHasUnsavedChanges(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
              </div>

            </div>

            {/* 2. Featured Cover Image Card */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiImage style={{ color: '#1a73e8' }} /> Featured Cover Image
              </h3>

              {post.coverImage ? (
                <div style={{ position: 'relative', marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <img
                    src={post.coverImage}
                    alt="Cover preview"
                    style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPost((prev) => ({ ...prev, coverImage: '' }));
                      setHasUnsavedChanges(true);
                    }}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FiX />
                  </button>
                </div>
              ) : null}

              <input
                type="text"
                value={post.coverImage}
                onChange={(e) => {
                  setPost((prev) => ({ ...prev, coverImage: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                placeholder="https://images.unsplash.com/..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  color: '#0f172a',
                  outline: 'none',
                  marginBottom: '10px',
                }}
              />

              {/* Sample Covers */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                Quick Preset Covers
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {SAMPLE_COVERS.map((sampleUrl, idx) => (
                  <img
                    key={idx}
                    src={sampleUrl}
                    alt={`Sample cover ${idx}`}
                    onClick={() => {
                      setPost((prev) => ({ ...prev, coverImage: sampleUrl }));
                      setHasUnsavedChanges(true);
                    }}
                    style={{
                      width: '100%',
                      height: '36px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: post.coverImage === sampleUrl ? '2px solid #1a73e8' : '1px solid #e2e8f0',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* 3. Tags Management Card */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiTag style={{ color: '#1a73e8' }} /> Tags & Keywords
              </h3>

              {/* Tag Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {(post.tags || []).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: '#f1f5f9',
                      color: '#334155',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    #{tag}
                    <FiX 
                      style={{ cursor: 'pointer', color: '#94a3b8' }} 
                      onClick={() => handleRemoveTag(tag)} 
                    />
                  </span>
                ))}
              </div>

              {/* Tag Input */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tag (press Enter)..."
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleAddTag()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* 4. Google Search SEO Preview Card */}
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiSearch style={{ color: '#1a73e8' }} /> Google Search Snippet
              </h3>

              {/* SERP Preview Box */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  {typeof window !== 'undefined' ? window.location.host : 'ime365.com'} › blog › {post.slug || 'article'}
                </div>
                <div style={{ fontSize: '15px', color: '#1a0dab', fontWeight: '600', marginTop: '2px', lineHeight: 1.3 }}>
                  {post.seoTitle || post.title || 'Untitled Post — IME365'}
                </div>
                <div style={{ fontSize: '12px', color: '#4d5156', marginTop: '4px', lineHeight: 1.4 }}>
                  {post.seoDescription || post.excerpt || 'Read this in-depth guide on IME365.'}
                </div>
              </div>

              {/* SEO Title Input */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>
                  SEO Meta Title
                </label>
                <input
                  type="text"
                  value={post.seoTitle}
                  onChange={(e) => {
                    setPost((prev) => ({ ...prev, seoTitle: e.target.value }));
                    setHasUnsavedChanges(true);
                  }}
                  placeholder={post.title}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* SEO Description Input */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>
                  Meta Description
                </label>
                <textarea
                  value={post.seoDescription}
                  onChange={(e) => {
                    setPost((prev) => ({ ...prev, seoDescription: e.target.value }));
                    setHasUnsavedChanges(true);
                  }}
                  rows={2}
                  placeholder={post.excerpt}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

            </div>

            {/* 5. Switcher Drawer: Recent Posts */}
            {allPosts.length > 0 && (
              <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
                    Other Articles
                  </h3>
                  <Link 
                    to="/blog-editor" 
                    style={{ fontSize: '12px', fontWeight: '700', color: '#1a73e8', textDecoration: 'none' }}
                  >
                    + New
                  </Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                  {allPosts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(`/blog-editor/${item.id}`)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: item.id === postId ? '#e8f0fe' : '#f8fafc',
                        border: item.id === postId ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: '700', color: item.id === postId ? '#1a73e8' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {item.title || 'Untitled Post'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                        {item.category || 'General'} · #{item.id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      </main>

      {/* 4. Fullscreen Interactive Live Preview Modal */}
      {showPreview && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(15, 23, 42, 0.75)', 
            backdropFilter: 'blur(8px)', 
            zIndex: 100000, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '24px' 
          }}
        >
          <div 
            style={{ 
              background: '#ffffff', 
              borderRadius: '24px', 
              maxWidth: '860px', 
              width: '100%', 
              maxHeight: '90vh', 
              overflowY: 'auto', 
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
              display: 'flex', 
              flexDirection: 'column' 
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#64748b' }}>
                Preview Mode · Public Article Reader Experience
              </span>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}
              >
                <FiX />
              </button>
            </div>

            {/* Modal Body: Public Article Rendering */}
            <div style={{ padding: '36px 40px' }}>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '20px', background: '#e8f0fe', color: '#1a73e8', fontWeight: '700', fontSize: '12px', marginBottom: '16px' }}>
                {post.category || 'Career Advice'}
              </div>

              <h1 style={{ fontSize: '36px', fontWeight: '900', color: '#0f172a', lineHeight: 1.2, marginBottom: '20px' }}>
                {post.title || 'Untitled Post'}
              </h1>

              {/* Author and Date Meta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9', marginBottom: '24px', color: '#64748b', fontSize: '14px' }}>
                <div>By <strong>{post.author || 'Editorial Team'}</strong></div>
                <span>•</span>
                <div>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <span>•</span>
                <div>~{stats.readTimeMinutes} min read</div>
              </div>

              {/* Cover Image */}
              {post.coverImage && (
                <div style={{ marginBottom: '32px', borderRadius: '20px', overflow: 'hidden' }}>
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    style={{ width: '100%', maxHeight: '420px', objectFit: 'cover' }}
                  />
                </div>
              )}

              {/* Formatted Content */}
              <div 
                className="rp-article-body"
                dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(editor ? editor.getHTML() : post.content) }}
                style={{ fontSize: '17px', lineHeight: 1.8, color: '#334155' }}
              />

              {/* Tags */}
              {post.tags && post.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                  {post.tags.map((t) => (
                    <span key={t} style={{ padding: '4px 12px', borderRadius: '20px', background: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                id="rp-btn-close-preview"
                onClick={() => setShowPreview(false)}
                style={{ padding: '8px 16px', borderRadius: '10px', background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Image URL Modal */}
      {showImageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '20px', padding: '24px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px' }}>Insert Image</h3>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertImage}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#1a73e8', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Insert Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Link Modal */}
      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '20px', padding: '24px', maxWidth: '440px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px' }}>Insert Link</h3>
            <input
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="Display text (optional)"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', marginBottom: '10px' }}
            />
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#1a73e8', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Insert Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '24px', padding: '28px', maxWidth: '460px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
              <FiTrash2 />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Delete this blog post?</h3>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, marginBottom: '20px' }}>
              Are you sure you want to delete <strong>"{post.title || 'Untitled Post'}"</strong>? This will permanently remove the article from the public blog.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{ padding: '10px 18px', borderRadius: '10px', background: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{ padding: '10px 20px', borderRadius: '10px', background: '#dc2626', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}
              >
                Yes, Delete Post
              </button>
            </div>
          </div>
        </div>
      )}

      <HomepageFooter />
    </div>
  );
}

// Helpers for toolbar buttons
function toolbarBtnStyle(isActive = false, disabled = false) {
  return {
    padding: '6px 10px',
    borderRadius: '8px',
    background: isActive ? '#e8f0fe' : 'transparent',
    color: isActive ? '#1a73e8' : disabled ? '#cbd5e1' : '#475569',
    fontWeight: isActive ? '700' : '600',
    fontSize: '13px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease',
  };
}

const dividerStyle = {
  width: '1px',
  height: '18px',
  background: '#e2e8f0',
  margin: '0 4px',
};