import React from 'react';
import { FaStar, FaCheckCircle, FaQuoteLeft } from 'react-icons/fa';

export default function HomepageReviews() {
  const reviews = [
    {
      name: 'Marcus Chen',
      role: 'Staff Engineer at Stripe',
      prev: 'Formerly at Mid-size Fintech',
      quote: '“The ATS keyword matching is phenomenal. I applied to 12 Staff-level roles with my updated IME365 CV and received 8 direct recruiter callbacks within two weeks.”'
    },
    {
      name: 'Sarah Jenkins',
      role: 'Product Lead at Figma',
      prev: 'Verified Candidate',
      quote: '“The AI Bullet writer completely transformed how I framed my leadership impact. Instead of generic management jargon, it produced quantified metrics that wowed the VP of Product.”'
    },
    {
      name: 'David Okafor',
      role: 'Cloud Architect at AWS',
      prev: 'Verified Candidate',
      quote: '“The CBT Interview Simulator was the game changer. It asked specific questions about distributed consensus and failover that actually came up during my loop interview!”'
    },
    {
      name: 'Elena Rostova',
      role: 'Principal UX Designer',
      prev: 'Enterprise Design Systems',
      quote: '“I love that I could export both a crisp vector PDF for direct human emails and an editable Word (.docx) for older enterprise portal forms with zero layout breakage.”'
    }
  ];

  return (
    <section style={{ padding: '80px 0', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
      <div className="rp-container" style={{ textAlign: 'center' }}>
        
        {/* Section Header */}
        <div style={{ maxWidth: '780px', margin: '0 auto 48px auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '9999px', background: '#fef3c7', color: '#b45309', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            <FaStar style={{ color: '#d97706' }} />
            <span>Social Proof & Outcomes</span>
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.03em', margin: '0 0 12px 0' }}>
            Trusted by 45,000+ Professionals Worldwide
          </h2>
          <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
            Real stories from candidates who used IME365 to land roles at top tech companies, startups, and Fortune 500 enterprises.
          </p>
        </div>

        {/* Reviews Grid */}
        <div className="rp-grid-4">
          {reviews.map((rev, idx) => (
            <div key={idx} className="rp-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', gap: '3px', color: '#f59e0b', fontSize: '13px', marginBottom: '14px' }}>
                  {[...Array(5)].map((_, i) => (
                    <FaStar key={i} />
                  ))}
                </div>
                
                <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, fontStyle: 'italic', margin: '0 0 20px 0' }}>
                  {rev.quote}
                </p>
              </div>

              <div style={{ paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{rev.name}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#2563eb', marginTop: '2px' }}>{rev.role}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#059669', fontWeight: '600', marginTop: '4px' }}>
                  <FaCheckCircle style={{ fontSize: '10px' }} />
                  <span>Verified Candidate</span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
