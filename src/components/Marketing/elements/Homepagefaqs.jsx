import React, { useState } from 'react';
import { FaChevronDown, FaSearch, FaQuestionCircle } from 'react-icons/fa';

export default function Homepagefaqs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      q: 'Do I need to pay or register to browse the 51 resume templates?',
      a: 'You can freely browse, inspect, and preview all 51 templates on the marketing website without creating an account. When you select "Use This Template" to start editing in the Studio, a free registration is required so your drafts can be safely saved in our encrypted MariaDB database. Free accounts include access to templates and basic AI features without entering a credit card.'
    },
    {
      q: 'How does IME365 ensure my resume passes ATS screening?',
      a: 'Our templates are built with strict single-flow semantic markup tested against Workday, Greenhouse, Taleo, and Lever parsing engines. Our AI analyzes your experience against target job descriptions, ensuring key competencies and XYZ impact metrics are recognized with 98%+ parsing accuracy.'
    },
    {
      q: 'What file formats are supported for downloading my resume?',
      a: 'We support dual high-fidelity export formats: (1) Pixel-perfect Vector PDF designed for crisp readability and human review, and (2) Native Microsoft Word (.docx) for enterprise portal job application forms.'
    },
    {
      q: 'What is the AI Interview Coach & CBT Simulator?',
      a: 'The Interview Coach is an interactive simulator that acts as a seasoned hiring manager. It conducts behavioral, situational, and technical interviews based on your specific resume and target job title, providing instant STAR-method scoring and delivery feedback.'
    },
    {
      q: 'Is my personal information and resume data kept private?',
      a: 'Yes, absolutely. Your career history and credentials are encrypted in MariaDB with tenant-level isolation and strict security policies. Your data is never sold, shared, or used to train public LLMs.'
    }
  ];

  const filteredFaqs = faqs.filter(faq => {
    return searchQuery === '' || 
      faq.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
      faq.a.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <section id="faqs" className="rp-section-pad" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
      <div className="rp-container" style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <div className="rp-story-tag blue">
            <FaQuestionCircle />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 style={{ fontSize: 'clamp(2rem, 3.2vw + 0.5rem, 3rem)', fontWeight: '800', color: 'var(--rp-text-title)', letterSpacing: '-0.03em', margin: '0 0 16px 0' }}>
            Everything You Need to Know
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--rp-text-body)', margin: 0 }}>
            Have questions about templates, AI optimization, ATS compliance, or pricing? We have answers.
          </p>
        </div>

        {/* Live Search Input */}
        <div style={{ position: 'relative', marginBottom: '32px' }}>
          <FaSearch style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }} />
          <input
            type="text"
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
          {filteredFaqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="rp-faq-card">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="rp-faq-btn"
                >
                  <span>{faq.q}</span>
                  <FaChevronDown 
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
                {isOpen && (
                  <div className="rp-faq-body">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}