import React from 'react';
import { filterMeaningfulCertifications } from '../utils/contentSanitizer';

export default function SmartCertifications({ certifications = [], theme = {}, title = 'Certifications' }) {
  const validCerts = filterMeaningfulCertifications(certifications);
  if (!validCerts.length) return null;

  return (
    <section className="smart-section smart-certifications-section">
      <h3 className="smart-section-title">
        <span className="smart-section-title__text">{title}</span>
        <span className="smart-section-title__line" />
      </h3>

      <div className="smart-cert-grid">
        {validCerts.map((cert, idx) => {
          const certTitle = typeof cert === 'string' ? cert : (cert.title || cert.name || '');
          const certIssuer = typeof cert === 'string' ? '' : (cert.issuer || cert.authority || '');
          const certDate = typeof cert === 'string' ? '' : (cert.date || '');
          const meta = [certIssuer, certDate].filter(Boolean).join(' · ');
          return (
            <div key={idx} className="smart-cert-item" data-flow-item="certification">
              <div className="smart-cert-badge">
                <svg className="smart-cert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="7"/>
                  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                </svg>
              </div>
              <div className="smart-cert-content">
                <h4 className="smart-cert-title">{certTitle}</h4>
                {meta && <div className="smart-cert-meta">{meta}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
