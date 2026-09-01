import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './public-site.css';
import HomepageNavbar from './elements/HomepageNavbar';
import HomepageHero from './elements/HomepageHero';
import HomepageStorySections from './elements/HomepageStorySections';
import HomepageTemplates from './elements/HomepageTemplates';
import HomepagePricing from './elements/HomepagePricing';
import Homepagefaqs from './elements/Homepagefaqs';
import HomepageFinalCta from './elements/HomepageFinalCta';
import HomepageFooter from './elements/HomepageFooter';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';

export default function Dashboard2() {
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup', message: '' });
  const location = useLocation();

  const handleOpenAuthModal = (mode = 'signup', message = '') => {
    setAuthModal({ open: true, mode, message });
  };

  const handleCloseAuthModal = () => {
    setAuthModal({ open: false, mode: 'signup', message: '' });
  };

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.replace('#', '');
      const elem = document.getElementById(targetId);
      if (elem) {
        setTimeout(() => {
          elem.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    }
  }, [location.hash, location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && authModal.open) {
        handleCloseAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authModal.open]);

  return (
    <div className="rp-public-site">
      
      {/* 1. Google-Style Floating / Sticky Navigation Bar */}
      <HomepageNavbar onOpenAuthModal={handleOpenAuthModal} />

      {/* 2. Main Guided Storytelling Flow */}
      <main>
        {/* Large Confident Hero with Interactive Product Stage Canvas */}
        <HomepageHero onOpenAuthModal={handleOpenAuthModal} />

        {/* 4 Major Google-Style Product Storytelling Showcases */}
        <HomepageStorySections onOpenAuthModal={handleOpenAuthModal} />

        {/* Elegant Large Template Showcase & Inspection Preview Modal (Registration-Gated) */}
        <HomepageTemplates onOpenAuthModal={handleOpenAuthModal} />

        {/* Transparent Clean Pricing */}
        <HomepagePricing onOpenAuthModal={handleOpenAuthModal} />

        {/* Searchable Clean FAQ Accordion */}
        <Homepagefaqs />

        {/* Minimal Powerful Final Conversion CTA */}
        <HomepageFinalCta onOpenAuthModal={handleOpenAuthModal} />
      </main>

      {/* 3. Clean Professional Footer */}
      <HomepageFooter />

      {/* 4. Native Authentication Gate Modal */}
      {authModal.open && (
        <div 
          className="rp-modal-overlay"
          onClick={handleCloseAuthModal}
          role="dialog"
          aria-modal="true"
        >
          <div 
            style={{ maxWidth: '480px', width: '100%', position: 'relative' }}
            onClick={(e) => e.stopPropagation()}
          >
            {authModal.message && (
              <div style={{
                background: '#e8f0fe',
                color: '#1a73e8',
                padding: '12px 18px',
                borderRadius: '14px',
                fontSize: '13px',
                fontWeight: '700',
                marginBottom: '12px',
                textAlign: 'center',
                border: '1px solid #bfdbfe',
                boxShadow: 'var(--rp-elev-1)'
              }}>
                ✨ {authModal.message}
              </div>
            )}
            
            <AuthWrapper 
              key={authModal.mode} 
              mode={authModal.mode} 
              initialMode={authModal.mode} 
              closeModal={handleCloseAuthModal} 
            />
          </div>
        </div>
      )}

    </div>
  );
}
