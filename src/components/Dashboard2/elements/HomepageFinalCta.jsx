import React from 'react';
import { FaRocket, FaArrowRight, FaCheckCircle } from 'react-icons/fa';

export default function HomepageFinalCta({ onOpenAuthModal }) {
  const handleCta = () => {
    if (onOpenAuthModal) {
      onOpenAuthModal('signup', 'Create your free account to build your resume');
    } else {
      window.location.href = '/login?next=%2Fbuild-resume%2Fheading';
    }
  };

  return (
    <section className="rp-final-cta-section">
      <div className="rp-container" style={{ position: 'relative', zIndex: 10, maxWidth: '860px', margin: '0 auto' }}>
        
        <h2 className="rp-final-cta-title">
          Your next opportunity starts with a better resume.
        </h2>

        <p className="rp-final-cta-sub">
          Create your free account today. Pick from 51 ATS templates, generate metric-driven AI bullets, and interview with confidence.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
          <button
            type="button"
            onClick={handleCta}
            className="rp-btn-cta-white"
          >
            <span>Build My Resume — Free</span>
            <FaArrowRight />
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '28px', fontSize: '14px', color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaCheckCircle style={{ color: '#86efac' }} />
            <span>No credit card required</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaCheckCircle style={{ color: '#86efac' }} />
            <span>Create your free account in minutes</span>
          </div>
        </div>

      </div>
    </section>
  );
}
