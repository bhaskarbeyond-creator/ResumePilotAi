import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getWebsiteData } from '../../../services/api/platform';
import logo from '../../../assets/logo/logo.png';
import '../public-site.css';
import { FaMagic, FaCheckCircle, FaCcVisa, FaCcMastercard, FaCcPaypal, FaCcAmex, FaCcJcb } from 'react-icons/fa';

export default function HomepageFooter() {
  const [brandTitle, setBrandTitle] = useState('IME365');
  const [portfolioEnabled, setPortfolioEnabled] = useState(false);
  const [blogEnabled, setBlogEnabled] = useState(true);

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

  return (
    <footer className="rp-footer" id="rp-footer-main">
      <div className="rp-container">
        
        <div className="rp-footer-grid">
          
          {/* Col 1: Brand & Live Status */}
          <div style={{ maxWidth: '320px' }}>
            <Link to="/" className="rp-nav-brand" style={{ marginBottom: '16px' }} aria-label="IME365.com Home">
              <img src={logo} alt="IME365.com — Interview Made Easy" style={{ height: '48px', width: 'auto', objectFit: 'contain', display: 'block' }} />
            </Link>
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, margin: '0 0 18px 0' }}>
              The modern AI career platform. Build recruiter-ready resumes across 51 certified ATS layouts, master interviews with CBT simulations, and land your next role.
            </p>
          </div>

          {/* Col 2: Product */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.06em', marginBottom: '16px' }}>
              Product
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <li><a href="#resume-builder" style={{ color: '#64748b', textDecoration: 'none' }}>Resume Builder</a></li>
              <li><a href="#ats-checker" style={{ color: '#64748b', textDecoration: 'none' }}>ATS Resume Checker</a></li>
              <li><a href="#interview-ai" style={{ color: '#64748b', textDecoration: 'none' }}>Interview AI Simulator</a></li>
              <li><a href="#templates" style={{ color: '#64748b', textDecoration: 'none' }}>51 ATS Templates</a></li>
              <li><a href="#pricing" style={{ color: '#64748b', textDecoration: 'none' }}>Pricing & Plans</a></li>
            </ul>
          </div>

          {/* Col 3: Resources & Career Tools */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.06em', marginBottom: '16px' }}>
              Resources
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              {blogEnabled && (
                <li><Link to="/blog" style={{ color: '#64748b', textDecoration: 'none' }}>Career Blog</Link></li>
              )}
              <li><Link to="/templates" style={{ color: '#64748b', textDecoration: 'none' }}>Resume Templates</Link></li>
              {portfolioEnabled && (
                <li><Link to="/portfolio/builder" style={{ color: '#64748b', textDecoration: 'none' }}>Web Portfolio Builder</Link></li>
              )}
              <li><a href="/#faqs" style={{ color: '#64748b', textDecoration: 'none' }}>FAQ & Help Desk</a></li>
              <li><Link to="/enterprise" style={{ color: '#64748b', textDecoration: 'none' }}>Enterprise Workspace</Link></li>
            </ul>
          </div>

          {/* Col 4: Legal & Policies */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.06em', marginBottom: '16px' }}>
              Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <li><Link to="/p/privacy-policy" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy Policy</Link></li>
              <li><Link to="/p/terms-of-service" style={{ color: '#64748b', textDecoration: 'none' }}>Terms of Service</Link></li>
              <li><Link to="/p/cookie-policy" style={{ color: '#64748b', textDecoration: 'none' }}>Cookie Policy</Link></li>
              <li><Link to="/contact" style={{ color: '#64748b', textDecoration: 'none' }}>Contact Support</Link></li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div style={{ paddingTop: '28px', borderTop: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', fontSize: '13px' }}>
          <div>
            © {new Date().getFullYear()} {brandTitle}. All rights reserved.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '20px', color: '#94a3b8' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SECURED BY</span>
            <FaCcVisa title="Visa" />
            <FaCcMastercard title="Mastercard" />
            <FaCcPaypal title="PayPal" />
            <FaCcAmex title="American Express" />
            <FaCcJcb title="JCB" />
          </div>
        </div>

      </div>
    </footer>
  );
}
