import React, { useState } from 'react';
import { FaTimesCircle, FaCheckCircle, FaExchangeAlt, FaArrowRight, FaLightbulb, FaShieldAlt } from 'react-icons/fa';

export default function HomepageComparison({ onOpenAuthModal }) {
  const [activeAspect, setActiveAspect] = useState('bullets');

  const comparisons = {
    bullets: {
      badTitle: 'Traditional Generic Resume',
      badScore: '42% ATS Pass Rate',
      badItems: [
        '“Worked on team projects and developed new features for company website.”',
        '“Responsible for maintaining database tables and fixing bugs.”',
        '“Helped team members when requested and attended daily standups.”'
      ],
      badCritique: 'Problem: Zero quantifiable metrics. Passive language. Triggers automated ATS rejection rules within seconds.',
      goodTitle: 'ResumePilot AI Engineered Resume',
      goodScore: '98% ATS Pass Rate',
      goodItems: [
        '“Architected responsive checkout workflow in React 19, increasing mobile conversion rate by 34% across 450K monthly users.”',
        '“Optimized MariaDB indexing strategy, reducing p95 API response latency from 680ms to 42ms with zero downtime.”',
        '“Mentored 6 junior engineers and instituted automated Playwright E2E suites, reducing production bugs by 58%.”'
      ],
      goodBenefit: 'Result: Quantified impact metrics + active action verbs + matched recruiter keywords. Guarantees human recruiter review.'
    },
    ats: {
      badTitle: 'Unstructured Design / Canva Template',
      badScore: '35% Parsed Accurately',
      badItems: [
        'Multi-column layouts where text flows unpredictably across columns.',
        'Icons and graphics used instead of text headings (confuses OCR).',
        'Tables and floating text boxes stripped out by Workday/Taleo engines.'
      ],
      badCritique: 'Problem: Candidate skills and dates get scrambled or deleted during ATS ingestion.',
      goodTitle: 'ResumePilot 51 ATS Standard Templates',
      goodScore: '100% Parsing Standard',
      goodItems: [
        'Strict single-flow semantic markup recognized by all 8 major ATS engines.',
        'Standard ISO date formats, certified headings, and high-contrast typography.',
        'Dual-pipeline output: High-DPI Vector PDF and Native Word (.docx).'
      ],
      goodBenefit: 'Result: 100% data fidelity. Every skill, project, and certification is indexed correctly.'
    },
    summary: {
      badTitle: 'Outdated Objective Statement',
      badScore: 'Generic / Weak',
      badItems: [
        '“Hardworking individual looking for a challenging role in a dynamic organization where I can utilize my skills.”'
      ],
      badCritique: 'Problem: Self-centered, cliché, provides zero signal about executive capability or commercial value.',
      goodTitle: 'Contextual AI Executive Bio',
      goodScore: 'High-Impact Bio',
      goodItems: [
        '“Staff Cloud Systems Architect with 9+ years directing high-throughput distributed infrastructure. Proven track record scaling microservices across AWS/GCP to 99.99% availability while reducing cloud expenditures by 32%.”'
      ],
      goodBenefit: 'Result: Instantly hooks recruiters in the first 6-second scan with seniority and verified ROI.'
    },
    skills: {
      badTitle: 'Unfocused Skill Dump',
      badScore: 'Keyword Stuffing',
      badItems: [
        '“MS Office, Communication, Hard worker, JavaScript, Python, Problem solver, Leadership, HTML”'
      ],
      badCritique: 'Problem: Mixes soft skills with generic tools. No taxonomy or domain relevance.',
      goodTitle: 'Targeted Competency Matrix',
      goodScore: 'Recruiter Aligned',
      goodItems: [
        'Core Architecture: Distributed Systems, Microservices, REST/gRPC',
        'Frontend & Backend: React 19, TypeScript, Node.js, MariaDB',
        'DevOps & Infrastructure: Docker, Kubernetes, AWS, Terraform, CI/CD'
      ],
      goodBenefit: 'Result: Clean taxonomy categorized by competency level matching actual job descriptions.'
    }
  };

  const current = comparisons[activeAspect];

  const handleCta = () => {
    if (onOpenAuthModal) {
      onOpenAuthModal('signup', 'Create your free account to optimize your resume');
    } else {
      window.location.href = '/login?next=%2Fbuild-resume%2Fheading';
    }
  };

  return (
    <section className="rp-comparison-section">
      <div className="rp-container" style={{ textAlign: 'center' }}>
        
        {/* Header */}
        <div style={{ maxWidth: '780px', margin: '0 auto 40px auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '9999px', background: '#eff6ff', color: '#1d4ed8', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            <FaExchangeAlt style={{ color: '#2563eb' }} />
            <span>Before & After Transformation</span>
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.03em', margin: '0 0 12px 0' }}>
            Why 75% of Resumes Are Rejected by ATS — And How ResumePilot Fixes It
          </h2>
          <p style={{ fontSize: '15px', color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            Compare a standard resume against our AI-engineered format. See how metric-driven phrasing and ATS compliance transform your application.
          </p>
        </div>

        {/* Aspect Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '36px' }}>
          {[
            { id: 'bullets', label: 'Metric-Driven Bullet Points' },
            { id: 'ats', label: 'ATS Screening Parsing' },
            { id: 'summary', label: 'Executive Career Summary' },
            { id: 'skills', label: 'Targeted Skills Matrix' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveAspect(tab.id)}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: activeAspect === tab.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                background: activeAspect === tab.id ? '#2563eb' : '#ffffff',
                color: activeAspect === tab.id ? '#ffffff' : '#475569',
                boxShadow: activeAspect === tab.id ? '0 4px 14px rgba(37, 99, 235, 0.3)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Comparison Cards Grid */}
        <div className="rp-grid-2" style={{ marginBottom: '32px' }}>
          
          {/* Bad / Generic Side */}
          <div className="rp-comparison-card bad">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid #fecaca', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaTimesCircle style={{ color: '#ef4444', fontSize: '18px' }} />
                <span style={{ fontWeight: '800', fontSize: '15px', color: '#991b1b' }}>{current.badTitle}</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '800', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '6px' }}>
                {current.badScore}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {current.badItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#7f1d1d', lineHeight: 1.5, background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#fee2e2', border: '1px solid #fca5a5', fontSize: '12px', color: '#991b1b', fontWeight: '600' }}>
              ⚠️ {current.badCritique}
            </div>
          </div>

          {/* Good / ResumePilot AI Side */}
          <div className="rp-comparison-card good">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid #bbf7d0', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaCheckCircle style={{ color: '#10b981', fontSize: '18px' }} />
                <span style={{ fontWeight: '800', fontSize: '15px', color: '#065f46' }}>{current.goodTitle}</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '800', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px' }}>
                {current.goodScore}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {current.goodItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#064e3b', lineHeight: 1.5, background: '#fff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <FaCheckCircle style={{ color: '#10b981', shrink: 0, marginTop: '2px' }} />
                  <span style={{ fontWeight: '500' }}>{item}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#dcfce7', border: '1px solid #86efac', fontSize: '12px', color: '#166534', fontWeight: '600' }}>
              ✓ {current.goodBenefit}
            </div>
          </div>

        </div>

        {/* CTA Banner */}
        <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', borderRadius: '18px', padding: '24px 32px', color: '#fff', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', textAlign: 'left', boxShadow: '0 15px 35px rgba(37, 99, 235, 0.35)' }}>
          <div>
            <h4 style={{ fontSize: '17px', fontWeight: '800', margin: '0 0 4px 0' }}>Want to upgrade your current resume in under 2 minutes?</h4>
            <p style={{ fontSize: '13px', opacity: 0.9, margin: 0 }}>Create a free account, pick from 51 ATS templates, and let our AI optimize your bullet points.</p>
          </div>
          <button
            type="button"
            onClick={handleCta}
            style={{
              background: '#ffffff',
              color: '#1e40af',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '10px',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>Optimize My Resume Free</span>
            <FaArrowRight />
          </button>
        </div>

      </div>
    </section>
  );
}
