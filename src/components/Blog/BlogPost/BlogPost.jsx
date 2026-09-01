import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sanitizeBlogHtml, sanitizeImageUrl } from '../../../utils/sanitizeHtml';
import { getBlogPostBySlug, listBlogPosts } from '../../../services/api/platform';
import { AuthContext } from '../../../context/AuthContext';
import Spinner from '../../Spinner/Spinner';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import '../../Dashboard2/public-site.css';
import fire from '../../../conf/fire';
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

    getBlogPostBySlug(slug)
      .then(async (postData) => {
        if (!active) return;
        if (!postData) {
          setError('Article not found.');
          setLoading(false);
          return;
        }

        setPost(postData);
        document.title = `${postData.title} — ResumePilot AI`;

        // Update robots meta tag
        const robotsMeta = document.querySelector('meta[name="robots"]') || document.createElement('meta');
        robotsMeta.setAttribute('name', 'robots');
        robotsMeta.setAttribute('content', postData.published ? 'index,follow' : 'noindex,nofollow');
        if (!robotsMeta.parentNode) document.head.appendChild(robotsMeta);

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
    if (!content) return '3 min read';
    const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  };

  const formatDate = (val) => {
    if (!val) return 'Recent';
    try {
      const d = new Date(val);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
      return 'Recent';
    }
  };

  if (loading) {
    return (
      <div className="rp-public-site">
        <HomepageNavbar authBtnHandler={authBtnHandler} user={user} logout={logout} />
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '120px' }}>
          <Spinner />
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
  const categoryName = post.category || post.categoryName || 'Career Guide';
  const cleanHtml = sanitizeBlogHtml(post.content || '');

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt || post.seoDescription || post.title,
            image: cover || undefined,
            datePublished: post.publishedAt || post.createdAt,
            dateModified: post.updatedAt || post.publishedAt || post.createdAt,
            author: {
              '@type': 'Person',
              name: post.authorName || 'ResumePilot AI Editorial Team'
            },
            publisher: {
              '@type': 'Organization',
              name: 'ResumePilot AI',
              url: 'https://airesume.projectdemo.guru'
            }
          })
        }}
      />

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
            <span className="rp-blog-badge" style={{ fontSize: '12px', padding: '4px 12px' }}>
              {categoryName}
            </span>

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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FaUser style={{ color: 'var(--rp-blue)', fontSize: '12px' }} />
                  {post.author || 'ResumePilot Editorial'}
                </span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FaCalendarAlt style={{ fontSize: '12px' }} />
                  {formatDate(post.publishedAt || post.createdAt)}
                </span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FaClock style={{ fontSize: '12px' }} />
                  {calculateReadingTime(post.content)}
                </span>
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
              Generate ATS-optimized bullets and test against real recruiter screening algorithms in seconds.
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
                const relCat = rel.category || rel.categoryName || 'Strategy';
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
                        <div className="rp-blog-card-meta">
                          <span className="rp-blog-badge">{relCat}</span>
                          <span>•</span>
                          <span>{calculateReadingTime(rel.content)}</span>
                        </div>
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