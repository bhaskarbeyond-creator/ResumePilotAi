import React, { useState } from 'react';
import { FaChevronDown, FaSearch, FaQuestionCircle } from 'react-icons/fa';
import { HOMEPAGE_FAQS } from './faqData';

export default function Homepagefaqs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = HOMEPAGE_FAQS;

  const filteredFaqs = faqs.filter(faq => {
    return searchQuery === '' || 
      faq.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
      faq.a.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <section id="faqs" className="rp-section-pad" aria-labelledby="homepage-faq-heading" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
      <div className="rp-container" style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <div className="rp-story-tag blue">
            <FaQuestionCircle aria-hidden="true" />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 id="homepage-faq-heading" style={{ fontSize: 'clamp(2rem, 3.2vw + 0.5rem, 3rem)', fontWeight: '800', color: 'var(--rp-text-title)', letterSpacing: '-0.03em', margin: '0 0 16px 0' }}>
            Everything You Need to Know
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--rp-text-body)', margin: 0 }}>
            Have questions about templates, AI optimization, ATS compliance, or pricing? We have answers.
          </p>
        </div>

        {/* Live Search Input */}
        <div style={{ position: 'relative', marginBottom: '32px' }}>
          <FaSearch aria-hidden="true" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }} />
          <input
            type="search"
            aria-label="Search frequently asked questions"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions (e.g. ATS, Word docx, templates, free account)..."
            style={{
              width: '100%',
              padding: '16px 20px 16px 52px',
              borderRadius: '9999px',
              border: '1px solid #cbd5e1',
              background: '#f8fafd',
              fontSize: '15px',
              color: '#0f172a',
              outline: 'none',
              boxShadow: 'var(--rp-elev-1)'
            }}
          />
        </div>

        {/* Accordion FAQ Items */}
        <div style={{ textAlign: 'left' }}>
          {filteredFaqs.length === 0 && (
            <p role="status" className="rp-faq-body">No questions match that search.</p>
          )}
          {filteredFaqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const panelId = `homepage-faq-answer-${index}`;
            return (
              <div key={faq.q} className="rp-faq-card">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="rp-faq-btn"
                >
                  <span>{faq.q}</span>
                  <FaChevronDown aria-hidden="true"
                    style={{
                      fontSize: '13px',
                      color: '#94a3b8',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      shrink: 0,
                      marginLeft: '16px'
                    }} 
                  />
                </button>
                <div id={panelId} className="rp-faq-body" hidden={!isOpen}>
                  {faq.a}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}