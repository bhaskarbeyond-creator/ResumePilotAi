import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sanitizeBlogHtml, sanitizeImageUrl } from '../../../utils/sanitizeHtml';
import { fetchPublicConfig, getBlogPostBySlug, listBlogPosts } from '../../../services/api/platform';
import { AuthContext } from '../../../context/AuthContext';
import Spinner from '../../Spinner/Spinner';
import HomepageNavbar from '../../Marketing/elements/HomepageNavbar';
import HomepageFooter from '../../Marketing/elements/HomepageFooter';
import '../../Marketing/public-site.css';
import fire from '../../../conf/fire';
import { safeJsonLd, schemaDate, schemaText, safeSchemaUrl } from '../../../services/seo/structuredData';
import { 
  FaArrowLeft, 
  FaCalendarAlt, 
  FaClock, 
  FaShareAlt, 
  FaCheck, 
  FaBookOpen, 
  FaArrowRight,
  FaUser
} from 'react-icons/fa';

function setHeadMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  element.removeAttribute('data-route-seo-owner');
  return element;
}

function canonicalOriginFor(config, currentOrigin) {
  if (config?._settingsSource !== 'mariadb') return currentOrigin;
  try {
    const candidate = new URL(String(config?.geoSeo?.canonicalUrl || '').trim());
    if (candidate.protocol === 'https:' && !candidate.username && !candidate.password
      && !candidate.search && !candidate.hash && (!candidate.pathname || candidate.pathname === '/')) {
      return candidate.origin;
    }
  } catch { /* use the current origin when MariaDB has no canonical base */ }
  return currentOrigin;
}

function clearArticleMetadata() {
  document.title = 'Article unavailable â€” IME365';
  setHeadMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' });
  setHeadMeta('meta[name="description"]', { name: 'description', content: 'This article is currently unavailable.' });
  document.head.querySelector('link[rel="canonical"]')?.remove();
  [
    'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:type"]',
    'meta[property="og:url"]', 'meta[property="og:site_name"]', 'meta[property="og:image"]',
    'meta[property="og:image:alt"]', 'meta[property="og:image:type"]', 'meta[name="twitter:card"]',
    'meta[name="twitter:title"]', 'meta[name="twitter:description"]', 'meta[name="twitter:image"]',
  ].forEach(selector => document.head.querySelector(selector)?.remove());
}

export default function BlogPost() {
  const { t } = useTranslation('common');
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useContext(AuthContext);

  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [canonicalOrigin, setCanonicalOrigin] = useState(
    typeof window !== 'undefined' ? window.location.origin : 'https://ime365.com',
  );

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
    let active = true;
    setLoading(true);
    setError(null);
    setPost(null);

    clearArticleMetadata();
    document.title = 'Loading article â€” IME365';

    getBlogPostBySlug(slug)
      .then(async (postData) => {
        if (!active) return;
        if (!postData) {
          clearArticleMetadata();
          setError('Article not found.');
          setLoading(false);
          return;
        }

        const isPublished = postData.published === true || Number(postData.published) === 1;
        let config = null;
        try { config = await fetchPublicConfig(); } catch { /* retain the current origin */ }
        if (!active) return;

        const canonicalBase = canonicalOriginFor(config, window.location.origin);
        setCanonicalOrigin(canonicalBase);
        const articleSlug = postData.slug || slug;
        const canonicalUrl = isPublished
          ? new URL(`/blog/${encodeURIComponent(articleSlug)}`, canonicalBase).href
          : '';
        const rawCover = sanitizeImageUrl(postData.featuredImage || postData.coverImage || postData.cover_image);
        const safeCover = rawCover ? safeSchemaUrl(rawCover, canonicalBase) : '';
        const socialImage = safeCover || (isPublished
          ? new URL(`/api/public/blog/${encodeURIComponent(articleSlug)}/og.png`, canonicalBase).href
          : '');
        const title = schemaText(postData.title, 255) || 'Career article';
        const description = schemaText(postData.seoDescription || postData.metaDescription || postData.excerpt || title, 300);

        setPost(postData);
        document.title = `${title} â€” IME365`;
        setHeadMeta('meta[name="robots"]', {
          name: 'robots', content: isPublished ? 'index,follow' : 'noindex,nofollow',
        });
        setHeadMeta('meta[name="description"]', { name: 'description', content: description });
        if (isPublished) {
          let canonical = document.head.querySelector('link[rel="canonical"]');
          if (!canonical) { canonical = document.createElement('link'); document.head.appendChild(canonical); }
          canonical.setAttribute('rel', 'canonical');
          canonical.setAttribute('href', canonicalUrl);
          canonical.removeAttribute('data-route-seo-owner');
          setHeadMeta('meta[property="og:title"]', { property: 'og:title', content: `${title} â€” IME365` });
          setHeadMeta('meta[property="og:description"]', { property: 'og:description', content: description });
          setHeadMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' });
          setHeadMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
          setHeadMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'IME365' });
          setHeadMeta('meta[property="og:image"]', { property: 'og:image', content: socialImage });
          setHeadMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: title });
          if (safeCover) document.head.querySelector('meta[property="og:image:type"]')?.remove();
          else setHeadMeta('meta[property="og:image:type"]', { property: 'og:image:type', content: 'image/png' });
          setHeadMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
          setHeadMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: `${title} â€” IME365` });
          setHeadMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
          setHeadMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: socialImage });
        } else {
          clearArticleMetadata();
          document.title = `${title} â€” IME365`;
          setHeadMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' });
          setHeadMeta('meta[name="description"]', { name: 'description', content: description });
        }

        // Fetch related articles
        try {
          const listRes = await listBlogPosts({ limit: 4 });
          if (active && listRes?.success) {
            const others = (listRes.posts || []).filter(p => (p.slug || p.id) !== slug).slice(0, 3);
            setRelatedPosts(others);
          }
        } catch (_) {}

        setLoading(false);
      })
      .catch((err) => {
        if (active) {
          clearArticleMetadata();
          setError(err.message || 'Unable to load article.');
          setLoading(false);
        }
      });

    return () => { active = false; };
  }, [slug]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: post?.title,
          text: post?.excerpt,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (_) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (_) {}
    }
  };

  const calculateReadingTime = (content) => {
    if (!content) return '';
    const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  };

  const formatDate = (val) => {
    if (!val) return 'Publication date not provided';
    try {
      const d = new Date(val);
      if (!Number.isFinite(d.getTime())) return 'Publication date unavailable';
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
      return 'Publication date unavailable';
    }
  };

  if (loading) {
    return (
      <div className="rp-public-site">
        <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '120px' }}>
          <Spinner inline />
        </div>
        <HomepageFooter />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="rp-public-site">
        <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
        <div className="rp-container" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingTop: '140px', paddingBottom: '80px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '24px', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', marginBottom: '20px' }}>
            <FaBookOpen />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px' }}>
            {error || 'Article Not Found'}
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b', maxWidth: '480px', marginBottom: '28px' }}>
            The article you are looking for might have been moved, renamed, or is no longer available.
          </p>
          <Link to="/blog" className="rp-btn-primary" style={{ textDecoration: 'none' }}>
            <FaArrowLeft style={{ marginRight: '8px' }} />
            Return to Career Blog
          </Link>
        </div>
        <HomepageFooter />
      </div>
    );
  }

  const cover = sanitizeImageUrl(post.featuredImage || post.coverImage || post.cover_image);
  const isPublished = post.published === true || Number(post.published) === 1;
  const articleSlug = post.slug || slug;
  const articleCanonical = isPublished
    ? new URL(`/blog/${encodeURIComponent(articleSlug)}`, canonicalOrigin).href
    : '';
  const categoryName = post.category || post.categoryName || '';
  const cleanHtml = sanitizeBlogHtml(post.content || '');
  const articleImage = cover
    ? (safeSchemaUrl(cover, canonicalOrigin) || undefined)
    : (isPublished ? safeSchemaUrl(`/api/public/blog/${encodeURIComponent(articleSlug)}/og.png`, canonicalOrigin) || undefined : undefined);
  const authorName = [post.authorName, post.author_name, post.author]
    .find(value => typeof value === 'string' && value.trim());

  return (
    <div className="rp-public-site">
      <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />

      {/* Copy Toast */}
      {copied && (
        <div role="status" aria-live="polite" style={{
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
          <FaCheck /> Article link copied to clipboard!
        </div>
      )}

      {/* JSON-LD Structured Data */}
      {isPublished && (
        <script
          id="blog-post-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'BlogPosting',
              headline: schemaText(post.title, 255),
              description: schemaText(post.seoDescription || post.metaDescription || post.excerpt || post.title, 1000),
              ...(articleImage ? { image: articleImage } : {}),
              ...(articleCanonical ? { mainEntityOfPage: { '@type': 'WebPage', '@id': articleCanonical } } : {}),
              datePublished: schemaDate(post.publishedAt || post.published_at || post.createdAt || post.created_at),
              dateModified: schemaDate(post.updatedAt || post.updated_at || post.publishedAt || post.published_at || post.createdAt || post.created_at),
              ...(authorName ? { author: { '@type': 'Person', name: schemaText(authorName, 160) } } : {}),
              publisher: {
                '@type': 'Organization',
                name: 'IME365',
                url: canonicalOrigin,
              },
            })
          }}
        />
      )}

      {/* Article Wrap */}
      <article className="rp-article-wrap">
        <div className="rp-article-container">
          
          {/* Back Button */}
          <Link to="/blog" className="rp-back-pill">
            <FaArrowLeft style={{ fontSize: '11px' }} />
            <span>All Articles</span>
          </Link>

          {/* Article Header */}
          <header className="rp-article-header">
            {categoryName && (
              <span className="rp-blog-badge" style={{ fontSize: '12px', padding: '4px 12px' }}>
                {categoryName}
              </span>
            )}

            <h1 className="rp-article-title">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="rp-article-lead">
                {post.excerpt}
              </p>
            )}

            {/* Meta Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '16px 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', fontSize: '13.5px', color: '#64748b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {authorName && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <FaUser aria-hidden="true" style={{ color: 'var(--rp-blue)', fontSize: '12px' }} />
                    {authorName}
                  </span>
                )}
                {authorName && <span aria-hidden="true">â€¢</span>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FaCalendarAlt aria-hidden="true" style={{ fontSize: '12px' }} />
                  {formatDate(post.publishedAt || post.published_at || post.createdAt || post.created_at)}
                </span>
                {calculateReadingTime(post.content) && <span aria-hidden="true">â€¢</span>}
                {calculateReadingTime(post.content) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <FaClock aria-hidden="true" style={{ fontSize: '12px' }} />
                    {calculateReadingTime(post.content)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleShare}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f8fafd',
                  border: '1px solid #e2e8f0',
                  borderRadius: '9999px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                aria-label="Share article"
              >
                <FaShareAlt style={{ fontSize: '12px', color: 'var(--rp-blue)' }} />
                Share
              </button>
            </div>
          </header>

          {/* Featured Image */}
          {cover && (
            <img 
              src={cover} 
              alt={post.title} 
              className="rp-article-cover" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          {/* Main Body */}
          <div 
            className="rp-article-content"
            dangerouslySetInnerHTML={{ __html: cleanHtml }}
          />

          {/* Article Footer CTA */}
          <div style={{ marginTop: '56px', padding: '36px 32px', background: 'radial-gradient(circle at 50% 0%, #e8f0fe 0%, #ffffff 100%)', borderRadius: '24px', border: '1px solid #dbeafe', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              Ready to apply these strategies to your resume?
            </h3>
            <p style={{ fontSize: '14.5px', color: '#475569', maxWidth: '520px', margin: '0 auto 20px auto' }}>
              Organize your experience in a structured resume and review it with the tools currently available in the editor.
            </p>
            <Link to="/build-resume/heading" className="rp-btn-primary" style={{ textDecoration: 'none' }}>
              Open Resume Studio
              <FaArrowRight style={{ marginLeft: '8px', fontSize: '12px' }} />
            </Link>
          </div>

        </div>

        {/* Related Articles */}
        {relatedPosts.length > 0 && (
          <div className="rp-container" style={{ marginTop: '80px', paddingTop: '48px', borderTop: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', marginBottom: '28px', textAlign: 'center' }}>
              Related Career Guides
            </h2>
            <div className="rp-blog-grid">
              {relatedPosts.map(rel => {
                const relCover = sanitizeImageUrl(rel.featuredImage || rel.coverImage || rel.cover_image);
                const relCat = rel.category || rel.categoryName || '';
                const relReadingTime = calculateReadingTime(rel.content);
                return (
                  <article key={rel.id || rel.slug} className="rp-blog-card">
                    <Link to={`/blog/${rel.slug || rel.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div className="rp-blog-card-media">
                        {relCover ? (
                          <img 
                            src={relCover} 
                            alt={rel.title} 
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
                      <div className="rp-blog-card-body">
                        {(relCat || relReadingTime) && (
                          <div className="rp-blog-card-meta">
                            {relCat && <span className="rp-blog-badge">{relCat}</span>}
                            {relCat && relReadingTime && <span aria-hidden="true">â€¢</span>}
                            {relReadingTime && <span>{relReadingTime}</span>}
                          </div>
                        )}
                        <h3 className="rp-blog-card-title">{rel.title}</h3>
                        <p className="rp-blog-card-excerpt">
                          {rel.excerpt || (rel.content ? rel.content.replace(/<[^>]*>/g, '').slice(0, 100) + '...' : '')}
                        </p>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </article>

      <HomepageFooter />
    </div>
  );
}
