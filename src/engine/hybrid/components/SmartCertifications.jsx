import React from 'react';

export default function SmartCertifications({ certifications = [], theme = {}, title = 'Certifications' }) {
  if (!certifications || !certifications.length) return null;

  return (
    <section className="smart-section smart-certifications-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-cert-list">
        {certifications.map((cert, idx) => {
          const meta = [cert.issuer, cert.date].filter(Boolean).join(' · ');
          return (
            <div key={idx} className="smart-cert-item" data-flow-item="certification">
              <div className="smart-cert-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
              </div>
              <div className="smart-cert-content">
                <h4 className="smart-cert-title">{cert.title || cert.name}</h4>
                {meta && <div className="smart-cert-meta">{meta}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
