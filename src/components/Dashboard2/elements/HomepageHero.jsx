import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import fire from '../../../conf/fire';
import { 
  FaMagic, FaArrowRight, FaCheckCircle, FaRobot, FaSearch, 
  FaShieldAlt, FaStar, FaBolt, FaFileWord, FaFilePdf, FaLayerGroup, FaCheck, FaTimes, FaExchangeAlt, FaCrown, FaUserCheck
} from 'react-icons/fa';

export default function HomepageHero({ onOpenAuthModal }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('studio');
  const [atsScore, setAtsScore] = useState(72);
  const [selectedRole, setSelectedRole] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);

  // Dynamic Typing Animation State
  const typingPhrases = [
    'Build Recruiter-Ready Resumes',
    'Tailor Your Resume to Any Job',
    'Beat ATS Screening Algorithms',
    'Ace Tough Behavioral Interviews',
    'Format in 51 Certified Layouts'
  ];
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Listen for active auth session
  useEffect(() => {
    let unsubscribe = () => {};
    if (fire?.auth) {
      try {
        unsubscribe = fire.auth().onAuthStateChanged((user) => {
          setCurrentUser(user);
        });
      } catch (_) {}
    }
    return () => unsubscribe();
  }, []);

  // Typing effect engine
  useEffect(() => {
    const fullText = typingPhrases[currentPhraseIndex];
    let typingSpeed = isDeleting ? 38 : 75;

    if (!isDeleting && typedText === fullText) {
      // Pause at end of phrase
      typingSpeed = 2200;
    } else if (isDeleting && typedText === '') {
      // Pause after deleting before next phrase
      setIsDeleting(false);
      setCurrentPhraseIndex((prev) => (prev + 1) % typingPhrases.length);
      typingSpeed = 400;
      return;
    }

    const timer = setTimeout(() => {
      if (!isDeleting) {
        setTypedText(fullText.substring(0, typedText.length + 1));
        if (typedText.length + 1 === fullText.length) {
          setIsDeleting(true);
        }
      } else {
        setTypedText(fullText.substring(0, typedText.length - 1));
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [typedText, isDeleting, currentPhraseIndex]);

  const demoRoles = [
    {
      title: 'Senior Software Engineer',
      draft: '“Worked on API services and sped up database queries for our users.”',
      optimized: '“Architected 12 high-throughput REST APIs in Node.js, optimizing MariaDB composite indexes to reduce p99 query latency from 450ms to 28ms across 2.5M daily requests.”',
      metrics: [
        { label: 'Action Verb', val: 'Architected', color: '#137333', bg: '#e6f4ea' },
        { label: 'Impact Metric', val: '-94% Latency', color: '#1a73e8', bg: '#e8f0fe' },
        { label: 'Scale Factor', val: '2.5M Daily Requests', color: '#7c3aed', bg: '#f3e8ff' }
      ]
    },
    {
      title: 'Principal Product Manager',
      draft: '“Helped launch the new AI assistant feature with the product team.”',
      optimized: '“Spearheaded go-to-market launch of GenAI assistant across 4 enterprise verticals, driving $1.8M ARR and lifting 30-day user retention by 28% in Q2.”',
      metrics: [
        { label: 'Action Verb', val: 'Spearheaded', color: '#137333', bg: '#e6f4ea' },
        { label: 'Commercial Impact', val: '+$1.8M ARR', color: '#1a73e8', bg: '#e8f0fe' },
        { label: 'Retention Lift', val: '+28% Retention', color: '#7c3aed', bg: '#f3e8ff' }
      ]
    },
    {
      title: 'Staff Cloud Architect',
      draft: '“Maintained cloud servers on AWS and reduced monthly infrastructure bills.”',
      optimized: '“Consolidated 60+ microservices onto AWS ECS with Terraform automation, trimming monthly infrastructure spend by $34,000 while maintaining 99.99% uptime.”',
      metrics: [
        { label: 'Action Verb', val: 'Consolidated', color: '#137333', bg: '#e6f4ea' },
        { label: 'Cost Reduction', val: '-$34K / mo', color: '#1a73e8', bg: '#e8f0fe' },
        { label: 'Reliability SLA', val: '99.99% Uptime', color: '#7c3aed', bg: '#f3e8ff' }
      ]
    }
  ];

  // Animated ATS score progression (72% -> 89% -> 98%)
  useEffect(() => {
    const interval = setInterval(() => {
      setAtsScore((prev) => (prev >= 98 ? 72 : prev === 72 ? 89 : 98));
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const handlePrimaryCta = () => {
    if (currentUser) {
      navigate('/build-resume/heading');
    } else if (onOpenAuthModal) {
      onOpenAuthModal('signup', 'Create your free account to build your resume');
    } else {
      navigate('/login?next=%2Fbuild-resume%2Fheading');
    }
  };

  const handleSecondaryCta = () => {
    if (currentUser) {
      navigate('/dashboard');
    } else {
      const el = document.querySelector('#resume-builder');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const currentRole = demoRoles[selectedRole];

  return (
    <section className="rp-hero-section">
      <div className="rp-container">
        
        {/* Eyebrow Badge & Auth Welcome Banner */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {currentUser ? (
            <div className="rp-hero-eyebrow" style={{ background: '#e6f4ea', border: '1px solid #bbf7d0', color: '#137333' }}>
              <FaUserCheck style={{ color: '#137333' }} />
              <span>WELCOME BACK, {currentUser.displayName || currentUser.email?.split('@')[0] || 'RESEARCHER'}</span>
            </div>
          ) : (
            <div className="rp-hero-eyebrow">
              <FaBolt style={{ color: '#1a73e8' }} />
              <span>BUILD BETTER RESUMES. INTERVIEW WITH CONFIDENCE.</span>
            </div>
          )}
        </div>

        {/* Dynamic Typing Headline */}
        <h1 className="rp-hero-heading" style={{ minHeight: '1.2em' }}>
          <span className="gradient" style={{ display: 'inline-block' }}>
            {typedText || 'Build Recruiter-Ready Resumes'}
          </span>
          <span className="rp-typing-cursor" aria-hidden="true">|</span>
          <br />
          with Context-Aware AI.
        </h1>

        {/* Supporting Statement */}
        <p className="rp-hero-subtext">
          ResumePilot AI turns your real experience into metric-driven achievements, optimizes for 51 ATS layouts, and simulates real-world CBT behavioral interviews.
        </p>

        {/* Context-Aware Primary CTAs */}
        <div className="rp-hero-ctas">
          <button
            type="button"
            onClick={handlePrimaryCta}
            className="rp-btn-hero-primary"
            id="rp-hero-primary-cta"
          >
            <span>{currentUser ? 'Continue in Resume Studio' : 'Build My Resume — Free'}</span>
            <FaArrowRight />
          </button>
          
          <button
            type="button"
            onClick={handleSecondaryCta}
            className="rp-btn-hero-secondary"
            id="rp-hero-secondary-cta"
          >
            <span>{currentUser ? 'Go to My Dashboard' : 'Explore Platform'}</span>
          </button>
        </div>

        {/* Trust Indicators */}
        <div className="rp-hero-trust-row">
          <div className="rp-hero-trust-item">
            <FaCheckCircle style={{ color: '#137333' }} />
            <span>{currentUser ? 'Active Cloud Sync' : 'No credit card required'}</span>
          </div>
          <div className="rp-hero-trust-item">
            <FaCheckCircle style={{ color: '#1a73e8' }} />
            <span>Free forever account</span>
          </div>
          <div className="rp-hero-trust-item">
            <FaCheckCircle style={{ color: '#7c3aed' }} />
            <span>Context-Aware AI</span>
          </div>
          <div className="rp-hero-trust-item">
            <FaCheckCircle style={{ color: '#b06000' }} />
            <span>51 Enterprise ATS Layouts</span>
          </div>
        </div>

        {/* Large Interactive Product Showcase Canvas (1220px Wide) */}
        <div className="rp-hero-stage-wrap">
          <div className="rp-hero-stage-card">
            
            {/* Stage Chrome Header */}
            <div className="rp-stage-chrome-bar">
              <div className="rp-stage-dots">
                <span className="rp-stage-dot" style={{ background: '#ef4444' }}></span>
                <span className="rp-stage-dot" style={{ background: '#f59e0b' }}></span>
                <span className="rp-stage-dot" style={{ background: '#10b981' }}></span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', marginLeft: '8px' }}>
                  ResumePilot AI Studio Canvas
                </span>
              </div>

              {/* Showcase Mode Tabs */}
              <div className="rp-stage-tabs">
                <button
                  type="button"
                  onClick={() => setActiveTab('studio')}
                  className={`rp-stage-tab ${activeTab === 'studio' ? 'active' : ''}`}
                >
                  <FaMagic />
                  <span>Resume Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ats')}
                  className={`rp-stage-tab ${activeTab === 'ats' ? 'active' : ''}`}
                >
                  <FaShieldAlt />
                  <span>ATS Score (Live)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('interview')}
                  className={`rp-stage-tab ${activeTab === 'interview' ? 'active' : ''}`}
                >
                  <FaRobot />
                  <span>Interview AI</span>
                </button>
              </div>
            </div>

            {/* Stage Canvas Body */}
            <div className="rp-stage-content">
              
              {/* Tab 1: Interactive Resume Builder Studio */}
              {activeTab === 'studio' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', alignItems: 'start' }}>
                  
                  {/* Left: Role Switcher & Live AI Bullet Editor */}
                  <div style={{ background: '#f8fafd', borderRadius: '20px', border: '1px solid #cbd5e1', padding: '24px', textAlign: 'left' }}>
                    
                    {/* Role Selector Tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {demoRoles.map((r, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedRole(idx)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '9999px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            border: selectedRole === idx ? '1px solid #1a73e8' : '1px solid #cbd5e1',
                            background: selectedRole === idx ? '#1a73e8' : '#ffffff',
                            color: selectedRole === idx ? '#ffffff' : '#475569'
                          }}
                        >
                          {r.title}
                        </button>
                      ))}
                    </div>

                    {/* Draft Box */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Draft Experience Bullet:
                      </label>
                      <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '12px', fontSize: '13px', color: '#64748b' }}>
                        {currentRole.draft}
                      </div>
                    </div>

                    {/* AI Optimized Result */}
                    <div style={{ marginBottom: '18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '800', color: '#1a73e8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FaMagic /> ResumePilot AI Optimized:
                        </label>
                        <span style={{ fontSize: '11px', fontWeight: '800', background: '#e8f0fe', color: '#1a73e8', padding: '2px 8px', borderRadius: '9999px' }}>
                          Google XYZ Formula
                        </span>
                      </div>
                      <div style={{ background: '#ffffff', borderRadius: '12px', border: '2px solid #1a73e8', padding: '16px', fontSize: '14px', color: '#0f172a', lineHeight: 1.6, fontWeight: '600', boxShadow: '0 2px 10px rgba(26,115,232,0.12)' }}>
                        {currentRole.optimized}
                      </div>
                    </div>

                    {/* Metric Breakdown Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
                      {currentRole.metrics.map((m, i) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: '6px', background: m.bg, color: m.color, fontSize: '11px', fontWeight: '800' }}>
                          ✓ {m.label}: {m.val}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handlePrimaryCta}
                      className="rp-btn-hero-primary"
                      style={{ padding: '10px 20px', fontSize: '13px', width: '100%', justifyContent: 'center' }}
                    >
                      <span>{currentUser ? 'Open in Builder' : 'Apply AI Recommendation'}</span>
                    </button>
                  </div>

                  {/* Right: Live Resume Sheet Preview */}
                  <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: 'var(--rp-elev-1)', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9', marginBottom: '14px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#64748b' }}>Template: Cv1 Executive</span>
                      <span style={{ fontSize: '11px', fontWeight: '800', background: '#e6f4ea', color: '#137333', padding: '3px 8px', borderRadius: '9999px' }}>
                        ATS Ready 99%
                      </span>
                    </div>

                    <div style={{ borderLeft: '4px solid #1a73e8', paddingLeft: '14px', marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: '0 0 2px 0' }}>Jordan Vance</h4>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: '#1a73e8', margin: 0 }}>{currentRole.title}</p>
                    </div>

                    <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, marginBottom: '14px', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                      Dynamic leader scaling high-reliability architectures, automated pipelines, and cross-functional teams with verified ROI.
                    </p>

                    <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', marginBottom: '6px' }}>Core Competencies</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>React 19</span>
                      <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>Node.js</span>
                      <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>AWS ECS</span>
                      <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>Terraform</span>
                    </div>
                  </div>

                </div>
              )}

              {/* Tab 2: Live ATS Score Optimization */}
              {activeTab === 'ats' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '32px', alignItems: 'center', textAlign: 'left' }}>
                  
                  {/* Score Counter Card */}
                  <div style={{ background: '#f8fafd', borderRadius: '24px', border: '1px solid #cbd5e1', padding: '32px', textAlign: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.08em' }}>
                      ATS Screening Match
                    </span>
                    <div style={{ fontSize: '64px', fontWeight: '900', color: atsScore >= 89 ? '#137333' : '#b06000', margin: '10px 0', transition: 'all 0.4s ease' }}>
                      {atsScore}%
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: atsScore >= 89 ? '#137333' : '#b06000', background: atsScore >= 89 ? '#e6f4ea' : '#fef7e0', padding: '6px 14px', borderRadius: '9999px', display: 'inline-block' }}>
                      {atsScore >= 95 ? 'Top 2% of Applicants' : atsScore >= 85 ? 'Strong Candidate Pass' : 'Needs Optimization'}
                    </div>
                  </div>

                  {/* Audit Breakdown List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaCheckCircle style={{ color: '#137333' }} />
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Keyword Density Matched</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#137333' }}>28 / 29 Matched</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaCheckCircle style={{ color: '#137333' }} />
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Workday / Taleo OCR Validation</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#137333' }}>100% Valid</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaCheckCircle style={{ color: '#137333' }} />
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>Google XYZ Impact Metrics</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#1a73e8' }}>Active Phrasing</span>
                    </div>
                  </div>

                </div>
              )}

              {/* Tab 3: Interview AI */}
              {activeTab === 'interview' && (
                <div style={{ background: '#f8fafd', borderRadius: '24px', border: '1px solid #cbd5e1', padding: '28px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid #e2e8f0', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f3e8ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FaRobot />
                      </div>
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>AI Behavioral CBT Simulator</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Real-time voice & text question analysis</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#7c3aed', background: '#f3e8ff', padding: '4px 12px', borderRadius: '9999px' }}>
                      Rubric Grade: A+ (95/100)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#0f172a', lineHeight: 1.6 }}>
                      <strong style={{ color: '#7c3aed' }}>Interviewer:</strong> “Tell me about a time you led a high-stakes technical migration with zero downtime.”
                    </div>
                    <div style={{ background: '#e8f0fe', padding: '14px 18px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1e40af', lineHeight: 1.6 }}>
                      <strong style={{ color: '#1a73e8' }}>Your Answer:</strong> “I established blue-green clusters on AWS, verified schema replication with test traffic, and cut over DNS in 4 minutes with 100% data integrity.”
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
