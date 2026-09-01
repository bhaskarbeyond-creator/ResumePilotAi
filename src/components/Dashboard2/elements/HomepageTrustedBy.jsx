import React, { useState, useEffect } from 'react';
import { FaCheckCircle, FaShieldAlt, FaAward, FaBolt } from 'react-icons/fa';
import { apiJson } from '../../../services/api/platform';
import { sanitizeImageUrl } from '../../../utils/sanitizeHtml';

export default function HomepageTrustedBy() {
  const [trustedItems, setTrustedItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiJson('/api/public/trusted-by')
      .then(data => {
        if (!active) return;
        if (Array.isArray(data?.items) && data.items.length > 0) {
          setTrustedItems(data.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const atsEngines = [
    { name: 'Workday ATS', score: '100% Tested' },
    { name: 'Greenhouse', score: 'Verified Parse' },
    { name: 'Lever.co', score: 'Field Extraction 99%' },
    { name: 'iCIMS Enterprise', score: 'ISO Standard' },
    { name: 'Taleo Oracle', score: '100% Compatible' },
    { name: 'BambooHR', score: 'Instant Scan' },
    { name: 'SmartRecruiters', score: 'Fully Verified' },
    { name: 'SAP SuccessFactors', score: 'Enterprise Grade' }
  ];

  const companies = [
    'MICROSOFT', 'AMAZON', 'META', 'APPLE', 'NETFLIX', 'SALESFORCE', 'UBER', 'STRIPE', 'AIRBNB'
  ];

  return (
    <section id="ats-engine" className="py-14 bg-white border-b border-slate-200/80">
      <div className="rp-container" style={{ textAlign: 'center' }}>
        <div role="status" aria-live="polite" className="sr-only">
          {loading ? 'Loading certified platforms' : 'ATS platforms certified'}
        </div>
        
        <p style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '20px' }}>
          Engineered & Certified for 100% Parsing Accuracy Across Enterprise ATS Platforms
        </p>

        {/* ATS Platform Badge Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginBottom: '32px' }}>
          {atsEngines.map((ats, idx) => (
            <div 
              key={idx}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{ats.name}</span>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#059669', background: '#d1fae5', padding: '2px 6px', borderRadius: '9999px' }}>
                {ats.score}
              </span>
            </div>
          ))}
        </div>

        {/* Marquee Hiring Companies */}
        <div style={{ padding: '16px 0', overflow: 'hidden', position: 'relative' }}>
          <p style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '16px' }}>
            ResumePilot AI Alumni Land Interviews at Top Global Employers
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '32px', opacity: 0.75 }}>
            {companies.map((c, i) => (
              <span key={i} style={{ fontSize: '14px', fontWeight: '900', letterSpacing: '0.12em', color: '#475569' }}>
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Trust Value Pillars */}
        <div className="rp-grid-3" style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', textAlign: 'left' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', shrink: 0, fontSize: '18px' }}>
              <FaShieldAlt />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>Zero Parsing Dropouts</h4>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Single-flow hierarchical markup ensures contact information, skills and experience are never stripped by automated scanners.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', textAlign: 'left' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', shrink: 0, fontSize: '18px' }}>
              <FaAward />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>Native Word DOCX & PDF</h4>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Both pixel-perfect vector PDF and fully editable native Microsoft Word (.docx) generated server-side for any application form.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', textAlign: 'left' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', shrink: 0, fontSize: '18px' }}>
              <FaBolt />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>100% Data Privacy & Security</h4>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Encrypted in MariaDB with tenant isolation. Your career history and credentials are never sold or trained on public models.
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
