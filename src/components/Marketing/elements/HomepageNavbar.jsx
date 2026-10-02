import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import fire from '../../../conf/fire';
import { getWebsiteData } from '../../../services/api/platform';
import logo from '../../../assets/logo/logo.png';
import '../public-site.css';
import { 
  FaMagic, FaFileAlt, FaRobot, FaSearch, FaBars, FaTimes, 
  FaChevronDown, FaArrowRight, FaShieldAlt, FaLayerGroup, FaTags, 
  FaQuestionCircle, FaUserCheck, FaBookOpen, FaBriefcase, FaBuilding, FaGlobe, FaCheckCircle
} from 'react-icons/fa';

export default function HomepageNavbar({ onOpenAuthModal }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [brandTitle, setBrandTitle] = useState('IME365');
  const [portfolioEnabled, setPortfolioEnabled] = useState(false);
  const [blogEnabled, setBlogEnabled] = useState(true);

  const navRef = useRef(null);

  // Load authoritative branding and module flags from MariaDB / backend public-config
  useEffect(() => {
    let mounted = true;
    getWebsiteData()
      .then((data) => {
        if (mounted) {
          if (data?.title) {
            const cleanTitle = data.title.split('—')[0].split('-')[0].trim();
            if (cleanTitle) setBrandTitle(cleanTitle);
          }
          const mods = data?.modules || {};
          setPortfolioEnabled(mods.enablePortfolioModule === true);
          setBlogEnabled(mods.enableBlogModule !== undefined ? Boolean(mods.enableBlogModule) : (mods.blog !== undefined ? Boolean(mods.blog) : true));
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Listen to window scroll to apply Google-inspired glass elevation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Listen for outside click and Escape key to cleanly dismiss dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setProductDropdownOpen(false);
        setResourcesDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setProductDropdownOpen(false);
        setResourcesDropdownOpen(false);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    let unsubscribe = () => {};
    if (fire?.auth) {
      try {
        unsubscribe = fire.auth().onAuthStateChanged((user) => {
          setCurrentUser(user);
        });
      } catch (_) {}
    }
    return () => unsubscribe();
  }, []);

  const handleHashClick = (e, targetHash) => {
    e.preventDefault();
    setProductDropdownOpen(false);
    setResourcesDropdownOpen(false);
    setMobileMenuOpen(false);

    if (location.pathname === '/') {
      const id = targetHash.replace('#', '');
      const elem = document.getElementById(id);
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth' });
        window.history.pushState(null, '', targetHash);
      }
    } else {
      navigate(`/${targetHash}`);
    }
  };

  const handleStartBuilding = () => {
    if (currentUser) {
      navigate('/build-resume/heading');
    } else if (onOpenAuthModal) {
      onOpenAuthModal('signup', 'Create your free account to build your resume');
    } else {
      navigate('/login?next=%2Fbuild-resume%2Fheading');
    }
  };

  const handleSignIn = () => {
    if (currentUser) {
      navigate('/dashboard');
    } else if (onOpenAuthModal) {
      onOpenAuthModal('signin');
    } else {
      navigate('/login');
    }
  };

  return (
    <header className={`rp-navbar-wrap ${isScrolled ? 'scrolled' : ''}`} id="rp-main-nav" ref={navRef}>
      <div className="rp-container">
        <div className="rp-nav-glass">
          
          {/* Brand Logo with Dynamic Backend Title */}
          <Link to="/" className="rp-nav-brand" aria-label="IME365.com Home">
            <img src={logo} alt="IME365.com — Interview Made Easy" style={{ height: '52px', width: 'auto', objectFit: 'contain', display: 'block' }} />
          </Link>

          {/* Center Navigation Menu — Clear Information Architecture */}
          <nav className="rp-nav-menu" aria-label="Primary Navigation">
            
            {/* 1. Product Dropdown with Seamless Hover Bridge */}
            <div 
              className="rp-nav-dropdown-parent"
              style={{ position: 'relative' }}
              onMouseEnter={() => { setProductDropdownOpen(true); setResourcesDropdownOpen(false); }}
              onMouseLeave={() => setProductDropdownOpen(false)}
            >
              <button 
                type="button" 
                id="rp-nav-product-btn"
                className={`rp-nav-item ${productDropdownOpen ? 'active' : ''}`}
                aria-expanded={productDropdownOpen}
                aria-haspopup="true"
                onClick={() => {
                  setProductDropdownOpen(!productDropdownOpen);
                  setResourcesDropdownOpen(false);
                }}
              >
                Product <FaChevronDown style={{ fontSize: '10px', color: '#94a3b8', transition: 'transform 0.2s ease', transform: productDropdownOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {/* Seamless Dropdown Container with Padding Bridge */}
              <div 
                className={`rp-dropdown-wrapper ${productDropdownOpen ? 'open' : ''}`}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '0',
                  paddingTop: '8px',
                  display: productDropdownOpen ? 'block' : 'none',
                  zIndex: 1050
                }}
              >
                <div 
                  className="rp-dropdown-menu"
                  style={{
                    width: '320px',
                    background: '#ffffff',
                    borderRadius: '20px',
                    border: '1px solid #e2e8f0',
                    padding: '12px',
                    boxShadow: 'var(--rp-elev-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <a 
                    href={location.pathname === '/' ? '#resume-builder' : '/#resume-builder'}
                    onClick={(e) => handleHashClick(e, '#resume-builder')}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', textDecoration: 'none', color: '#1e293b' }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#e8f0fe', color: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaFileAlt />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>Resume Builder</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>AI bullet optimizer & auto-formatting</div>
                    </div>
                  </a>

                  <a 
                    href={location.pathname === '/' ? '#ats-checker' : '/#ats-checker'}
                    onClick={(e) => handleHashClick(e, '#ats-checker')}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', textDecoration: 'none', color: '#1e293b' }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#e6f4ea', color: '#137333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaCheckCircle />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>ATS Resume Checker</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Real-time scan against job descriptions</div>
                    </div>
                  </a>

                  <a 
                    href={location.pathname === '/' ? '#interview-ai' : '/#interview-ai'}
                    onClick={(e) => handleHashClick(e, '#interview-ai')}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', textDecoration: 'none', color: '#1e293b' }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#f3e8ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaRobot />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>AI Interview</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>CBT behavioral practice & STAR scoring</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* 2. Direct Resume Templates Link */}
            <a 
              href={location.pathname === '/' ? '#templates' : '/#templates'}
              onClick={(e) => handleHashClick(e, '#templates')}
              className="rp-nav-item"
            >
              Resume Templates
            </a>

            {/* 3. Resources / Blog Dropdown with Seamless Hover Bridge */}
            <div 
              className="rp-nav-dropdown-parent"
              style={{ position: 'relative' }}
              onMouseEnter={() => { setResourcesDropdownOpen(true); setProductDropdownOpen(false); }}
              onMouseLeave={() => setResourcesDropdownOpen(false)}
            >
              <button 
                type="button" 
                id="rp-nav-resources-btn"
                className={`rp-nav-item ${resourcesDropdownOpen ? 'active' : ''}`}
                aria-expanded={resourcesDropdownOpen}
                aria-haspopup="true"
                onClick={() => {
                  setResourcesDropdownOpen(!resourcesDropdownOpen);
                  setProductDropdownOpen(false);
                }}
              >
                Resources <FaChevronDown style={{ fontSize: '10px', color: '#94a3b8', transition: 'transform 0.2s ease', transform: resourcesDropdownOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {/* Seamless Dropdown Container with Padding Bridge */}
              <div 
                className={`rp-dropdown-wrapper ${resourcesDropdownOpen ? 'open' : ''}`}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '0',
                  paddingTop: '8px',
                  display: resourcesDropdownOpen ? 'block' : 'none',
                  zIndex: 1050
                }}
              >
                <div 
                  className="rp-dropdown-menu"
                  style={{
                    width: '320px',
                    background: '#ffffff',
                    borderRadius: '20px',
                    border: '1px solid #e2e8f0',
                    padding: '12px',
                    boxShadow: 'var(--rp-elev-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  {blogEnabled && (
                    <Link 
                      to="/blog" 
                      onClick={() => setResourcesDropdownOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', textDecoration: 'none', color: '#1e293b' }}
                    >
                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#e6f4ea', color: '#137333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FaBookOpen />
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>Career Blog</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Resume tips, guides & job market news</div>
                      </div>
                    </Link>
                  )}

                  {portfolioEnabled && (
                    <Link 
                      to="/portfolio/builder" 
                      onClick={() => setResourcesDropdownOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', textDecoration: 'none', color: '#1e293b' }}
                    >
                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#e8f0fe', color: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FaGlobe />
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>Web Portfolio Builder</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Host live interactive portfolios</div>
                      </div>
                    </Link>
                  )}

                  <a 
                    href={location.pathname === '/' ? '#faqs' : '/#faqs'}
                    onClick={(e) => handleHashClick(e, '#faqs')}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', textDecoration: 'none', color: '#1e293b' }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#f3e8ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaQuestionCircle />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>FAQ & Guidance</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>ATS advice, exports & account help</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* 4. Direct Pricing Link */}
            <a 
              href={location.pathname === '/' ? '#pricing' : '/#pricing'}
              onClick={(e) => handleHashClick(e, '#pricing')}
              className="rp-nav-item"
            >
              Pricing
            </a>

            {/* 5. Enterprise Link */}
            <Link to="/enterprise" className="rp-nav-item">
              Enterprise
            </Link>
          </nav>

          {/* Right Action CTAs: Distinct Login vs Register & Auth Awareness */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentUser ? (
              <Link 
                to="/dashboard"
                className="rp-nav-btn-signin"
                id="rp-nav-dashboard-link"
              >
                <FaUserCheck style={{ color: '#137333', marginRight: '6px' }} />
                My Dashboard
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="rp-nav-btn-signin"
                id="rp-nav-login-btn"
              >
                Log In
              </button>
            )}

            <button
              type="button"
              onClick={handleStartBuilding}
              className="rp-nav-btn-cta"
              id="rp-nav-getstarted-btn"
            >
              <span>{currentUser ? 'Open Studio' : 'Get Started'}</span>
              <FaArrowRight style={{ fontSize: '11px' }} />
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rp-hamburger-btn"
              style={{ color: '#0f172a' }}
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="rp-container" style={{ marginTop: '12px' }}>
          <div 
            style={{ 
              background: '#ffffff', 
              borderRadius: '20px', 
              border: '1px solid #e2e8f0', 
              padding: '20px', 
              boxShadow: 'var(--rp-elev-3)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px', 
              textAlign: 'left' 
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 14px' }}>Product</div>
            <a 
              href={location.pathname === '/' ? '#resume-builder' : '/#resume-builder'} 
              onClick={(e) => handleHashClick(e, '#resume-builder')} 
              className="rp-nav-item" 
              style={{ padding: '8px 14px' }}
            >
              Resume Builder
            </a>
            <a 
              href={location.pathname === '/' ? '#ats-checker' : '/#ats-checker'} 
              onClick={(e) => handleHashClick(e, '#ats-checker')} 
              className="rp-nav-item" 
              style={{ padding: '8px 14px' }}
            >
              ATS Resume Checker
            </a>
            <a 
              href={location.pathname === '/' ? '#interview-ai' : '/#interview-ai'} 
              onClick={(e) => handleHashClick(e, '#interview-ai')} 
              className="rp-nav-item" 
              style={{ padding: '8px 14px' }}
            >
              AI Interview
            </a>

            <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 14px 4px 14px', borderTop: '1px solid #f1f5f9' }}>Resources</div>
            <a 
              href={location.pathname === '/' ? '#templates' : '/#templates'} 
              onClick={(e) => handleHashClick(e, '#templates')} 
              className="rp-nav-item" 
              style={{ padding: '8px 14px' }}
            >
              Resume Templates
            </a>
            {blogEnabled && (
              <Link to="/blog" onClick={() => setMobileMenuOpen(false)} className="rp-nav-item" style={{ padding: '8px 14px' }}>Career Blog</Link>
            )}
            {portfolioEnabled && (
              <Link to="/portfolio/builder" onClick={() => setMobileMenuOpen(false)} className="rp-nav-item" style={{ padding: '8px 14px' }}>Web Portfolio</Link>
            )}
            <a 
              href={location.pathname === '/' ? '#pricing' : '/#pricing'} 
              onClick={(e) => handleHashClick(e, '#pricing')} 
              className="rp-nav-item" 
              style={{ padding: '8px 14px' }}
            >
              Pricing
            </a>
            <Link to="/enterprise" onClick={() => setMobileMenuOpen(false)} className="rp-nav-item" style={{ padding: '8px 14px' }}>Enterprise</Link>
            <a 
              href={location.pathname === '/' ? '#faqs' : '/#faqs'} 
              onClick={(e) => handleHashClick(e, '#faqs')} 
              className="rp-nav-item" 
              style={{ padding: '8px 14px' }}
            >
              FAQ
            </a>
            
            <div style={{ paddingTop: '14px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleSignIn();
                }}
                className="rp-nav-btn-signin"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleStartBuilding();
                }}
                className="rp-btn-hero-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <span>Get Started — Free</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
