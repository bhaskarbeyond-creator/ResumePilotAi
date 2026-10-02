import React, { useState } from 'react';
import { 
  FaMagic, FaCheckCircle, FaRobot, FaSearch, FaShieldAlt, FaBolt, 
  FaArrowRight, FaFileAlt, FaCheck, FaLayerGroup, FaFilePdf, FaFileWord, FaLightbulb, FaBriefcase
} from 'react-icons/fa';

export default function HomepageStorySections({ onOpenAuthModal }) {
  const handleCta = () => {
    if (onOpenAuthModal) {
      onOpenAuthModal('signup', 'Create your free account to start building');
    } else {
      window.location.href = '/login?next=%2Fbuild-resume%2Fheading';
    }
  };

  return (
    <div className="rp-public-site">
      
      {/* ===================================================================
          SECTION 1: AI RESUME BUILDER
          =================================================================== */}
      <section id="resume-builder" className="rp-section-pad" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
        <div className="rp-container">
          <div className="rp-story-grid">
            
            {/* Left: Copy & Bullet Points */}
            <div className="rp-story-copy">
              <div className="rp-story-tag blue">
                <FaMagic />
                <span>AI Resume Builder</span>
              </div>

              <h2 className="rp-story-title">
                Build a resume that gets noticed by top recruiters.
              </h2>

              <p className="rp-story-desc">
                Stop struggling with blank pages and awkward phrasing. IME365 turns your experience into compelling, metric-driven achievements structured according to executive hiring standards.
              </p>

              <div className="rp-story-points">
                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Google XYZ Achievement Formula:</strong> Accomplished [X], as measured by [Y], by doing [Z].
                  </div>
                </div>

                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Context-Aware Intelligence:</strong> Suggests domain-specific accomplishments tailored to your seniority level.
                  </div>
                </div>

                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Zero Formatting Hassle:</strong> Text flows automatically into 51 ATS-tested corporate layouts.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCta}
                className="rp-btn-hero-primary"
                id="rp-story-builder-cta"
              >
                <span>Try Resume Builder Free</span>
                <FaArrowRight />
              </button>
            </div>

            {/* Right: Large Product UI Composition */}
            <div>
              <div className="rp-feature-surface">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></div>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>Work Experience Studio</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#1a73e8', background: '#e8f0fe', padding: '3px 10px', borderRadius: '9999px' }}>
                    Live Auto-Enhance
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Draft Bullet Point:</div>
                    <div style={{ fontSize: '13px', color: '#334155' }}>
                      “Worked on API services and sped up database queries for our users.”
                    </div>
                  </div>

                  <div style={{ background: '#e8f0fe', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '800', color: '#1a73e8', textTransform: 'uppercase', marginBottom: '6px' }}>
                      <FaMagic />
                      <span>IME365 Optimized:</span>
                    </div>
                    <div style={{ fontSize: '14px', color: '#1e3a8a', fontWeight: '600', lineHeight: 1.5 }}>
                      “Architected 12 high-throughput REST APIs in Node.js, optimizing MariaDB composite indexes to reduce p99 query latency from 450ms to 28ms across 2.5M daily requests.”
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', paddingTop: '6px' }}>
                    <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Action Verb</div>
                      <div style={{ fontSize: '12px', fontWeight: '800', color: '#137333' }}>Architected</div>
                    </div>
                    <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Impact Metric</div>
                      <div style={{ fontSize: '12px', fontWeight: '800', color: '#1a73e8' }}>-94% Latency</div>
                    </div>
                    <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Scale Factor</div>
                      <div style={{ fontSize: '12px', fontWeight: '800', color: '#7c3aed' }}>2.5M Requests</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ===================================================================
          SECTION 2: ATS RESUME CHECKER & RECRUITER AUDIT
          =================================================================== */}
      <section id="ats-checker" className="rp-section-pad" style={{ background: '#f8fafd', borderTop: '1px solid #e2e8f0' }}>
        <div className="rp-container">
          <div className="rp-story-grid" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
            
            {/* Left: Large ATS Audit UI */}
            <div>
              <div className="rp-feature-surface">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaShieldAlt style={{ color: '#137333', fontSize: '16px' }} />
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>ATS Parser Audit Engine</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '800', background: '#e6f4ea', color: '#137333', padding: '4px 10px', borderRadius: '9999px' }}>
                    Score: 98/100 (Certified)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>Workday / Taleo OCR</div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#137333' }}>100% Parsed</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>Keyword Match Rate</div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a73e8' }}>96% Matched</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                    <span style={{ fontWeight: '600', color: '#334155' }}>✓ Single-column semantic hierarchy</span>
                    <span style={{ color: '#137333', fontWeight: '800' }}>PASS</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                    <span style={{ fontWeight: '600', color: '#334155' }}>✓ Standard ISO date format parsing</span>
                    <span style={{ color: '#137333', fontWeight: '800' }}>PASS</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                    <span style={{ fontWeight: '600', color: '#334155' }}>✓ Zero dropout on contact & skills fields</span>
                    <span style={{ color: '#137333', fontWeight: '800' }}>PASS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Explanation */}
            <div className="rp-story-copy">
              <div className="rp-story-tag green">
                <FaShieldAlt />
                <span>ATS & Recruiter Optimization</span>
              </div>

              <h2 className="rp-story-title">
                Know exactly how recruiters and ATS algorithms see your resume.
              </h2>

              <p className="rp-story-desc">
                Over 75% of resumes are automatically rejected before a human ever reads them due to complex layouts, unparsed text boxes, and missing keywords. IME365 guarantees 100% extraction accuracy.
              </p>

              <div className="rp-story-points">
                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Workday, Greenhouse & Lever Tested:</strong> Certified against the world&apos;s leading enterprise hiring platforms.
                  </div>
                </div>

                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Instant Gap Identification:</strong> Spots missing technical keywords and suggests high-impact replacements.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCta}
                className="rp-btn-hero-primary"
                id="rp-story-ats-cta"
              >
                <span>Check Your ATS Score Free</span>
                <FaArrowRight />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ===================================================================
          SECTION 3: JOB-SPECIFIC RESUME TAILORING
          =================================================================== */}
      <section className="rp-section-pad" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
        <div className="rp-container">
          <div className="rp-story-grid">
            
            {/* Left: Copy */}
            <div className="rp-story-copy">
              <div className="rp-story-tag purple">
                <FaBolt />
                <span>Job-Specific Tailoring</span>
              </div>

              <h2 className="rp-story-title">
                Tailor your resume to any job description in seconds.
              </h2>

              <p className="rp-story-desc">
                Paste any target job description from LinkedIn, Indeed, or Greenhouse. IME365 extracts key qualifications, aligns your experience, and generates customized summaries that match the employer&apos;s exact criteria.
              </p>

              <div className="rp-story-points">
                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>1-Click Keyword Matching:</strong> Instantly highlights skills and experience required for the target role.
                  </div>
                </div>

                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Custom Executive Bio:</strong> Generates a tailored career summary that immediately hooks the hiring manager.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCta}
                className="rp-btn-hero-primary"
                id="rp-story-tailor-cta"
              >
                <span>Start Tailoring Free</span>
                <FaArrowRight />
              </button>
            </div>

            {/* Right: Job Matching UI Simulation */}
            <div>
              <div className="rp-feature-surface">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaBriefcase style={{ color: '#7c3aed' }} />
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>Target Job Matcher</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#7c3aed', background: '#f3e8ff', padding: '3px 10px', borderRadius: '9999px' }}>
                    Match: 96%
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Target Job Posting:</div>
                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: '600' }}>
                      Lead Distributed Systems Engineer (Microservices, React 19, AWS ECS)
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>Matched Qualifications:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ background: '#e6f4ea', color: '#137333', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>✓ Microservices (Found 5x)</span>
                      <span style={{ background: '#e6f4ea', color: '#137333', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>✓ React 19 (Found 4x)</span>
                      <span style={{ background: '#e6f4ea', color: '#137333', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>✓ AWS ECS (Found 3x)</span>
                      <span style={{ background: '#e6f4ea', color: '#137333', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>✓ High Availability (Found 2x)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ===================================================================
          SECTION 4: INTERVIEW AI & CBT BEHAVIORAL SIMULATOR
          =================================================================== */}
      <section id="interview-ai" className="rp-section-pad" style={{ background: '#f8fafd', borderTop: '1px solid #e2e8f0' }}>
        <div className="rp-container">
          <div className="rp-story-grid" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
            
            {/* Left: Large Interview Simulation Card */}
            <div>
              <div className="rp-feature-surface">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaRobot style={{ color: '#7c3aed', fontSize: '16px' }} />
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>Live AI CBT Interview Session</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '800', background: '#f3e8ff', color: '#7c3aed', padding: '4px 10px', borderRadius: '9999px' }}>
                    STAR Grade: A+ (94/100)
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#1e293b', lineHeight: 1.6 }}>
                    <strong style={{ color: '#7c3aed' }}>AI Recruiter:</strong> “Tell me about a time you resolved a major production incident during peak traffic.”
                  </div>

                  <div style={{ background: '#e8f0fe', padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1e3a8a', lineHeight: 1.6 }}>
                    <strong style={{ color: '#1a73e8' }}>Your Answer:</strong> “I spun up blue-green failover nodes on AWS, traced the spike to an unindexed query, and restored 100% uptime in 6 minutes.”
                  </div>

                  <div style={{ background: '#e6f4ea', padding: '12px 16px', borderRadius: '10px', border: '1px solid #bbf7d0', fontSize: '12px', color: '#14532d', lineHeight: 1.5 }}>
                    <strong>Rubric Feedback:</strong> Exemplary STAR structure. Highlights speed of resolution (6 min) and clear technical ownership.
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Copy */}
            <div className="rp-story-copy">
              <div className="rp-story-tag purple">
                <FaRobot />
                <span>Interview AI Simulator</span>
              </div>

              <h2 className="rp-story-title">
                Master tough questions before you walk into the interview.
              </h2>

              <p className="rp-story-desc">
                Landing the interview is only half the battle. Our AI CBT Simulator conducts realistic mock interviews tailored to your exact resume, asking behavioral, situational, and technical questions with instant STAR rubric grading.
              </p>

              <div className="rp-story-points">
                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>STAR Method Scoring:</strong> Evaluates Situation, Task, Action, and Result for every answer.
                  </div>
                </div>

                <div className="rp-story-point">
                  <div className="rp-story-point-icon">
                    <FaCheck />
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Confidence & Delivery Analysis:</strong> Gives concrete advice on improving brevity and commercial impact.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCta}
                className="rp-btn-hero-primary"
                id="rp-story-interview-cta"
              >
                <span>Practice Interviews Free</span>
                <FaArrowRight />
              </button>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
