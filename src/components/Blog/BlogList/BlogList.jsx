import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listBlogPosts, listBlogCategories, getBlogSettings } from '../../../services/api/platform';
import { sanitizeImageUrl } from '../../../utils/sanitizeHtml';
import Spinner from '../../Spinner/Spinner';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import '../../Dashboard2/public-site.css';
import { AuthContext } from '../../../context/AuthContext';
import fire from '../../../conf/fire';
import { 
  FaSearch, 
  FaCalendarAlt, 
  FaClock, 
  FaArrowRight, 
  FaTimes, 
  FaThLarge, 
  FaList, 
  FaBookOpen,
  FaLightbulb,
  FaShieldAlt
} from 'react-icons/fa';

export default function BlogList() {
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
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('newest');
  const [loadError, setLoadError] = useState('');
  const requestGeneration = useRef(0);

  const authBtnHandler = () => {
    navigate('/');
  };

  const logout = async () => {
    try {
      await fire.auth().signOut();
      navigate('/');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([
      listBlogCategories().catch(() => []),
      getBlogSettings().catch(() => null),
    ]).then(([cats, sets]) => {
      if (mounted) {
        setCategories(cats || []);
        setBlogSettings(sets);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [selectedCategory, currentPage]);

  useEffect(() => {
    document.title = blogSettings?.seoTitle || 'Career Resources & Guides — IME365';
  }, [blogSettings]);

  const fetchPosts = async () => {
    const gen = ++requestGeneration.current;
    setLoadError('');
    if (currentPage === 1) setLoading(true);

    try {
      const options = {
        limit: blogSettings?.postsPerPage || 20,
        page: currentPage,
      };
      if (selectedCategory && selectedCategory !== 'all') {
        options.categoryId = selectedCategory;
      }

      const result = await listBlogPosts(options);
      if (gen !== requestGeneration.current) return;

      if (result && result.success) {
        const loadedPosts = Array.isArray(result.posts) ? result.posts : [];
        if (currentPage === 1) {
          setPosts(loadedPosts);
        } else {
          setPosts(prev => [...prev, ...loadedPosts]);
        }
        setPagination(result.pagination);
      } else {
        setPosts([]);
        setLoadError(result?.error || 'Unable to load blog articles.');
      }
    } catch (error) {
      if (gen === requestGeneration.current) {
        setPosts([]);
        setLoadError(error.message || 'Unable to load blog articles.');
      }
    } finally {
      if (gen === requestGeneration.current) {
        setLoading(false);
      }
    }
  };

  const calculateReadingTime = (content) => {
    if (!content) return '3 min read';
    const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  };

  const formatDate = (val) => {
    if (!val) return 'Recent';
    try {
      const d = new Date(val);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) {
      return 'Recent';
    }
  };

  // Filter & Sort
  const normalizedSearch = searchTerm.trim().toLowerCase();
  let displayedPosts = posts.filter(post => {
    if (selectedCategory !== 'all') {
      const postCatNorm = String(post.category || post.categoryName || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const selCatNorm = String(selectedCategory || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!postCatNorm.includes(selCatNorm) && !selCatNorm.includes(postCatNorm)) return false;
    }
    if (!normalizedSearch) return true;
    return (
      String(post.title || '').toLowerCase().includes(normalizedSearch) ||
      String(post.excerpt || '').toLowerCase().includes(normalizedSearch) ||
      String(post.category || '').toLowerCase().includes(normalizedSearch)
    );
  });

  if (sortBy === 'oldest') {
    displayedPosts.sort((a, b) => new Date(a.createdAt || a.publishedAt || 0) - new Date(b.createdAt || b.publishedAt || 0));
  } else if (sortBy === 'alphabetical') {
    displayedPosts.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else {
    // Newest
    displayedPosts.sort((a, b) => new Date(b.createdAt || b.publishedAt || 0) - new Date(a.createdAt || a.publishedAt || 0));
  }

  // Derive active category list including from loaded posts
  const dynamicCategories = categories.length > 0 
    ? categories 
    : [...new Set(posts.map(p => p.category || p.categoryName).filter(Boolean))].map(name => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name
      }));

  return (
    <div className="rp-public-site">
      <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />

      {/* Hero Knowledge Hub */}
      <section className="rp-blog-hero" aria-labelledby="rp-blog-heading">
        <div className="rp-container">
          <div className="rp-hero-eyebrow" style={{ margin: '0 auto 16px auto' }}>
            <FaBookOpen style={{ color: 'var(--rp-blue)', fontSize: '13px' }} />
            <span>Career Knowledge & Playbooks</span>
          </div>

          <h1 id="rp-blog-heading" className="rp-hero-headline" style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', marginBottom: '14px' }}>
            Expert Career Insights & Strategies
          </h1>

          <p className="rp-hero-subheadline" style={{ maxWidth: '680px', margin: '0 auto 28px auto', fontSize: '16px' }}>
            {blogSettings?.blogDescription || 'Proven frameworks on beating ATS algorithms, crafting high-impact bullets, and acing technical & behavioral interviews.'}
          </p>

          {/* Search Box */}
          <div className="rp-blog-search-container">
            <FaSearch className="rp-blog-search-icon" />
            <input
              type="text"
              id="rp-blog-search-input"
              className="rp-blog-search-input"
              placeholder="Search articles, ATS tips, bullet formulas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search career articles"
            />
            {searchTerm && (
              <button 
                type="button" 
                className="rp-blog-search-clear" 
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <FaTimes />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="rp-container" style={{ paddingBottom: '96px', paddingTop: '24px' }}>
        
        {/* Filter & Controls Bar */}
        <div className="rp-blog-filter-bar">
          {/* Category Pills */}
          <div className="rp-blog-category-pills" role="tablist" aria-label="Category Filters">
            <button
              type="button"
              className={`rp-blog-pill ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => { setSelectedCategory('all'); setCurrentPage(1); }}
              role="tab"
              aria-selected={selectedCategory === 'all'}
            >
              All Articles ({posts.length})
            </button>
            {dynamicCategories.map(cat => (
              <button
                key={cat.id || cat.slug || cat.name}
                type="button"
                className={`rp-blog-pill ${selectedCategory === cat.slug || selectedCategory === cat.id || selectedCategory === cat.name ? 'active' : ''}`}
                onClick={() => { setSelectedCategory(cat.slug || cat.id || cat.name); setCurrentPage(1); }}
                role="tab"
                aria-selected={selectedCategory === cat.slug || selectedCategory === cat.name}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Controls: Sort & View Toggle */}
          <div className="rp-blog-controls">
            <label htmlFor="rp-blog-sort-select" className="sr-only">Sort Articles</label>
            <select
              id="rp-blog-sort-select"
              className="rp-blog-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort Articles"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="alphabetical">Title (A-Z)</option>
            </select>

            <div className="rp-blog-view-toggle">
              <button
                type="button"
                className={`rp-blog-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Grid View"
                title="Grid View"
              >
                <FaThLarge />
              </button>
              <button
                type="button"
                className={`rp-blog-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="List View"
                title="List View"
              >
                <FaList />
              </button>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '64px 0' }}>
            <Spinner />
          </div>
        )}

        {/* Error Alert */}
        {loadError && !loading && (
          <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px', padding: '20px', textAlign: 'center', color: '#991b1b', marginBottom: '32px' }}>
            <p style={{ fontWeight: '700', margin: '0 0 6px 0' }}>Failed to load articles</p>
            <p style={{ fontSize: '13px', margin: 0 }}>{loadError}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !loadError && displayedPosts.length === 0 && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '56px 24px', textAlign: 'center', maxWidth: '540px', margin: '32px auto' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: '#e8f0fe', color: 'var(--rp-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 18px auto' }}>
              <FaSearch />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              No articles found
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
              {searchTerm ? `No articles matching "${searchTerm}". Try another search keyword or clear filters.` : 'No published articles match the selected category.'}
            </p>
            <button
              type="button"
              className="rp-btn-primary"
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Articles Grid or List */}
        {!loading && displayedPosts.length > 0 && (
          <div className={viewMode === 'grid' ? 'rp-blog-grid' : 'rp-blog-list-view'}>
            {displayedPosts.map((post) => {
              const cover = sanitizeImageUrl(post.featuredImage || post.coverImage || post.cover_image);
              const categoryName = post.category || post.categoryName || 'Career Strategy';
              const readTime = calculateReadingTime(post.content);
              const postSlug = post.slug || post.id;

              return (
                <article key={post.id || post.slug} className="rp-blog-card">
                  <Link to={`/blog/${postSlug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Media */}
                    <div className="rp-blog-card-media">
                      {cover ? (
                        <img 
                          src={cover} 
                          alt={post.title} 
                          className="rp-blog-card-img" 
                          loading="lazy" 
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="rp-blog-card-placeholder">
                          <FaBookOpen />
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="rp-blog-card-body">
                      <div className="rp-blog-card-meta">
                        <span className="rp-blog-badge">{categoryName}</span>
                        <span>•</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <FaClock style={{ fontSize: '11px' }} />
                          {readTime}
                        </span>
                        <span>•</span>
                        <span>{formatDate(post.publishedAt || post.createdAt)}</span>
                      </div>

                      <h2 className="rp-blog-card-title">
                        {post.title}
                      </h2>

                      <p className="rp-blog-card-excerpt">
                        {post.excerpt || (post.content ? post.content.replace(/<[^>]*>/g, '').slice(0, 140) + '...' : 'Explore comprehensive career guidance and actionable insights.')}
                      </p>

                      <div className="rp-blog-card-footer">
                        <span>Read Full Guide</span>
                        <FaArrowRight style={{ fontSize: '12px' }} />
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}

      </main>

      <HomepageFooter />
    </div>
  );
}