import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSubscriptionStatus } from '../../../services/api/platform';
import { 
  FaCheck, FaCrown, FaBuilding, FaArrowRight, FaShieldAlt, 
  FaBolt, FaStar, FaChevronDown, FaLock, FaTimes, FaFileWord, 
  FaFilePdf, FaRobot, FaBriefcase, FaHeadset, FaCreditCard,
  FaCheckCircle, FaGem
} from 'react-icons/fa';

export default function HomepagePricing({ onOpenAuthModal, nextStep }) {
  const [billingCycle, setBillingCycle] = useState('yearly'); // 'monthly' | 'quartarly' | 'yearly'
  const [showComparison, setShowComparison] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const [pricingData, setPricingData] = useState({
    monthlyPrice: 199,
    quartarlyPrice: 399,
    yearlyPrice: 499,
    currency: 'INR',
    currencySymbol: '₹',
    razorpayEnabled: true,
    stripeEnabled: false,
    paypalEnabled: false,
    loadedFromDb: false
  });

  useEffect(() => {
    let mounted = true;
    getSubscriptionStatus()
      .then((data) => {
        if (mounted && data) {
          setPricingData({
            monthlyPrice: Number(data.monthlyPrice) || 199,
            quartarlyPrice: Number(data.quartarlyPrice) || 399,
            yearlyPrice: Number(data.yearlyPrice) || 499,
            currency: data.currency || 'INR',
            currencySymbol: data.currencySymbol || (data.currency === 'USD' ? '$' : '₹'),
            razorpayEnabled: data.razorpayEnabled !== false,
            stripeEnabled: data.stripeEnabled === true,
            paypalEnabled: data.paypalEnabled === true,
            loadedFromDb: data._settingsSource === 'remote' || data._settingsSource === 'mariadb'
          });
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleCta = (plan, duration = billingCycle) => {
    if (plan === 'Free Starter') {
      if (onOpenAuthModal) {
        onOpenAuthModal('signup', 'Create your free account to start building');
      } else {
        window.location.href = '/build-resume/heading';
      }
      return;
    }

    if (plan === 'Pro Career Pass') {
      if (typeof nextStep === 'function') {
        nextStep(duration);
      } else if (onOpenAuthModal) {
        onOpenAuthModal('signup', `Create your account for ${plan}`);
      } else {
        window.location.href = `/billing/plans?plan=${duration}`;
      }
    }
  };

  const symbol = pricingData.currencySymbol || (pricingData.currency === 'INR' ? '₹' : '$');
  const proMonthlyPrice = pricingData.monthlyPrice;
  
  // Calculate dynamic effective monthly price according to billing cycle
  const getProEffectiveMonthly = () => {
    if (billingCycle === 'monthly') return pricingData.monthlyPrice;
    if (billingCycle === 'quartarly') return Math.round(pricingData.quartarlyPrice / 3);
    return Math.round(pricingData.yearlyPrice / 12);
  };

  const getProOriginalPrice = () => {
    if (billingCycle === 'monthly') return Math.round(pricingData.monthlyPrice * 1.6);
    return pricingData.monthlyPrice;
  };

  const getProBilledText = () => {
    if (billingCycle === 'monthly') return `Billed monthly at ${symbol}${pricingData.monthlyPrice}`;
    if (billingCycle === 'quartarly') return `Billed quarterly at ${symbol}${pricingData.quartarlyPrice} (Save 33% off retail)`;
    return `Billed annually at ${symbol}${pricingData.yearlyPrice} (Save 79% • Best Value)`;
  };

  const faqItems = [
    {
      q: 'Can I cancel my subscription anytime?',
      a: 'Yes, absolutely. You can cancel your subscription with a single click from your Account Settings at any time. You will continue to retain full Pro access until the end of your paid billing period.'
    },
    {
      q: 'What happens to my resumes if my subscription ends?',
      a: 'All of your resumes, cover letters, and customized drafts remain securely saved in your account forever. You can still view, edit, and export them on the Free tier.'
    },
    {
      q: 'Does the Pro Career Pass include native Microsoft Word (.docx) export?',
      a: 'Yes! Pro and Enterprise users have unrestricted 1-click downloads for native Microsoft Word OOXML (.docx) and high-resolution vector PDF files across all 51 certified templates.'
    },
    {
      q: 'How does the 14-day money-back guarantee work?',
      a: 'If you are not 100% satisfied with ResumePilot AI within your first 14 days, simply reach out to our Help Desk for an immediate, no-questions-asked full refund.'
    },
    {
      q: 'Which payment methods are accepted?',
      a: `We support all major payment methods including ${pricingData.razorpayEnabled ? 'Razorpay UPI (GPay, PhonePe, Paytm), RuPay, Visa, Mastercard, NetBanking, ' : ''}Stripe Credit/Debit cards, and PayPal with 256-bit SSL encrypted checkout.`
    }
  ];

  return (
    <section id="pricing" className="rp-section-pad" style={{ background: '#f8fafd', borderTop: '1px solid #e2e8f0', minHeight: '80vh', paddingTop: '110px', paddingBottom: '80px' }}>
      <div className="rp-container" style={{ textAlign: 'center' }}>
        
        {/* Header with Enhanced Visual Hierarchy */}
        <div style={{ maxWidth: '820px', margin: '0 auto 36px auto' }}>
          <div className="rp-story-tag blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '9999px', background: '#e8f0fe', color: '#1a73e8', fontWeight: '800', fontSize: '12px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <FaCrown style={{ color: '#f59e0b' }} />
            <span>Transparent &amp; Value-Driven Career Pricing</span>
          </div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 3.5vw + 0.5rem, 3.2rem)', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.03em', margin: '0 0 16px 0', lineHeight: 1.15 }}>
            Accelerate Your Career with <span style={{ background: 'linear-gradient(135deg, #1a73e8 0%, #7c3aed 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Guaranteed ROI</span>
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#475569', margin: 0, lineHeight: 1.7, maxWidth: '700px', marginLeft: 'auto', marginRight: 'auto' }}>
            Start completely free. Upgrade when you are ready for unlimited STAR bullet optimizations, timed AI interview simulations, and native Microsoft Word (.docx) downloads.
          </p>
        </div>

        {/* Interactive Billing Cycle Switcher */}
        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#ffffff', padding: '6px', borderRadius: '9999px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)', marginBottom: '44px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            style={{
              padding: '10px 22px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: billingCycle === 'monthly' ? '#0f172a' : 'transparent',
              color: billingCycle === 'monthly' ? '#ffffff' : '#64748b'
            }}
          >
            Monthly
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('quartarly')}
            style={{
              padding: '10px 22px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: billingCycle === 'quartarly' ? '#0f172a' : 'transparent',
              color: billingCycle === 'quartarly' ? '#ffffff' : '#64748b'
            }}
          >
            <span>Quarterly</span>
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '9999px', background: billingCycle === 'quartarly' ? '#10b981' : '#ecfdf5', color: billingCycle === 'quartarly' ? '#ffffff' : '#059669', fontWeight: '800' }}>
              Save 33%
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: billingCycle === 'yearly' ? 'linear-gradient(135deg, #1a73e8 0%, #4f46e5 100%)' : 'transparent',
              color: billingCycle === 'yearly' ? '#ffffff' : '#64748b',
              boxShadow: billingCycle === 'yearly' ? '0 4px 14px rgba(26, 115, 232, 0.3)' : 'none'
            }}
          >
            <span>Annual Pass</span>
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '9999px', background: billingCycle === 'yearly' ? '#f59e0b' : '#fef3c7', color: billingCycle === 'yearly' ? '#ffffff' : '#b45309', fontWeight: '900', textTransform: 'uppercase' }}>
              🔥 Best Value
            </span>
          </button>
        </div>

        {/* 3-Tier Dynamic Pricing Grid */}
        <div className="rp-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', alignItems: 'stretch', marginBottom: '48px' }}>
          
          {/* Tier 1: Free Starter */}
          <div className="rp-pricing-card" style={{ background: '#ffffff', borderRadius: '24px', padding: '36px 30px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', position: 'relative' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Free Starter</h3>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#475569', background: '#f1f5f9', padding: '4px 12px', borderRadius: '9999px', textTransform: 'uppercase' }}>Forever Free</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px 0', minHeight: '38px', lineHeight: 1.5 }}>
                Essential AI tools to draft your resume and verify ATS score compatibility.
              </p>

              <div style={{ margin: '16px 0 28px 0', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '46px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.03em' }}>{symbol}0</span>
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}> / free forever</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '36px' }}>
                {[
                  'Access to all 51 ATS Resume Templates',
                  'Real-time ATS Score & Keyword Parser',
                  'Basic AI Bullet Generator (10 requests/day)',
                  'Full-Resolution Interactive Preview Modal',
                  'High-Resolution PDF Download',
                  '1-Click Public Review Share Link'
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#334155', lineHeight: 1.4 }}>
                    <FaCheckCircle style={{ color: '#10b981', fontSize: '14px', shrink: 0, marginTop: '2px' }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCta('Free Starter')}
              className="rp-btn-hero-secondary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '14px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
              id="rp-pricing-free-cta"
            >
              Get Started Free
            </button>
          </div>

          {/* Tier 2: Pro Career Pass (Featured Hero Card) */}
          <div className="rp-pricing-card featured" style={{ background: '#ffffff', borderRadius: '24px', padding: '40px 32px', border: '2px solid #4f46e5', boxShadow: '0 16px 40px rgba(79, 70, 229, 0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', position: 'relative', transform: 'scale(1.02)' }}>
            <div className="rp-pricing-pill" style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #1a73e8 0%, #4f46e5 100%)', color: '#ffffff', padding: '5px 20px', borderRadius: '9999px', fontSize: '11px', fontWeight: '900', letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' }}>
              🔥 Most Popular • Full Power
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Pro Career Pass</span>
                </h3>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#4338ca', background: '#e0e7ff', padding: '4px 12px', borderRadius: '9999px', textTransform: 'uppercase' }}>Full AI Unlocked</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px 0', minHeight: '38px', lineHeight: 1.5 }}>
                Complete AI career acceleration suite for active job seekers and interview candidates.
              </p>

              <div style={{ margin: '16px 0 28px 0', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: '#94a3b8', textDecoration: 'line-through' }} title="Standard retail rate">
                    {symbol}{getProOriginalPrice()}
                  </span>
                  <span style={{ fontSize: '48px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.03em' }} id="rp-pricing-pro-value">
                    {symbol}{getProEffectiveMonthly()}
                  </span>
                  <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}> / month ({pricingData.currency})</span>
                </div>
                <p style={{ fontSize: '12px', color: '#4f46e5', fontWeight: '700', margin: '6px 0 0 0' }}>
                  {getProBilledText()}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '36px' }}>
                {[
                  { text: 'Unlimited STAR AI Bullet Writer & Summary Synthesizer', strong: true },
                  { text: 'AI Mock Interview Coach & Timed CBT Exam Simulator', strong: true },
                  { text: 'Native Microsoft Word (.docx) & Vector PDF Export', strong: true },
                  { text: 'AI Cover Letter Tailoring Engine (4 Tones & 4 Templates)', strong: false },
                  { text: 'Custom Web CV & Portfolio Vanity URL (/portfolio/:slug)', strong: false },
                  { text: 'Job Application Pipeline & Kanban Status Tracker', strong: false },
                  { text: '100% Watermark-Free Downloads & Priority 24/7 Support', strong: false }
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: item.strong ? '#0f172a' : '#334155', fontWeight: item.strong ? '700' : '500', lineHeight: 1.4 }}>
                    <FaCheckCircle style={{ color: '#4f46e5', fontSize: '15px', shrink: 0, marginTop: '2px' }} />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCta('Pro Career Pass')}
              className="rp-btn-hero-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '15px', borderRadius: '14px', fontWeight: '800', fontSize: '15px', background: 'linear-gradient(135deg, #1a73e8 0%, #4f46e5 100%)', color: '#ffffff', boxShadow: '0 8px 24px rgba(79, 70, 229, 0.35)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
              id="rp-pricing-pro-cta"
            >
              <span>Unlock Pro Career Pass</span>
              <FaArrowRight style={{ fontSize: '13px' }} />
            </button>
          </div>

          {/* Tier 3: Enterprise Workspace */}
          <div className="rp-pricing-card" style={{ background: '#ffffff', borderRadius: '24px', padding: '36px 30px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', position: 'relative' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Enterprise</h3>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#7c3aed', background: '#f3e8ff', padding: '4px 12px', borderRadius: '9999px', textTransform: 'uppercase' }}>Organizations</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px 0', minHeight: '38px', lineHeight: 1.5 }}>
                Multi-tenant talent management, team governance, and institutional licensing.
              </p>

              <div style={{ margin: '16px 0 28px 0', paddingBottom: '24px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#94a3b8', textDecoration: 'line-through' }} title="Standard retail enterprise seat price">
                    {symbol}{pricingData.currency === 'INR' ? '4,999' : '99'}
                  </span>
                  <span style={{ fontSize: '46px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.03em' }}>
                    {symbol}{pricingData.currency === 'INR' ? '2,999' : '49'}
                  </span>
                  <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}> / seat / mo</span>
                </div>
                <p style={{ fontSize: '12px', color: '#7c3aed', fontWeight: '700', margin: '6px 0 0 0' }}>
                  Save 40% on annual institutional licensing
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '36px' }}>
                {[
                  'Dedicated Multi-Tenant Workspace & Role-Based IAM',
                  'HMAC-SHA256 Signed Outbox & High-Throughput Queue',
                  'AES-256-GCM Tenant Encryption & Isolation',
                  'Custom AI Quota Policies (5,000–50,000 req/day)',
                  'Bulk Team Candidate Import & Standard Profiles',
                  'Dedicated Customer Success Manager & 99.9% SLA'
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#334155', lineHeight: 1.4 }}>
                    <FaCheckCircle style={{ color: '#7c3aed', fontSize: '14px', shrink: 0, marginTop: '2px' }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/enterprise"
              className="rp-btn-hero-secondary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '14px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', textAlign: 'center', display: 'block', textDecoration: 'none' }}
              id="rp-pricing-enterprise-cta"
            >
              Explore Enterprise
            </Link>
          </div>

        </div>

        {/* Security, Trust & Payment Gateways Bar */}
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '20px 28px', border: '1px solid #e2e8f0', display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '20px', fontSize: '13px', color: '#475569', fontWeight: '600', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)', marginBottom: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaShieldAlt style={{ color: '#10b981', fontSize: '16px' }} />
            <span>14-Day Money-Back Guarantee</span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaLock style={{ color: '#6366f1', fontSize: '14px' }} />
            <span>256-Bit SSL Encrypted Checkout via {pricingData.razorpayEnabled ? 'Razorpay UPI/Cards' : 'Stripe & PayPal'}</span>
          </div>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaCheck style={{ color: '#10b981', fontSize: '13px' }} />
            <span>1-Click Cancel Anytime</span>
          </div>
        </div>

        {/* Collapsible Feature Comparison Table Button */}
        <div style={{ maxWidth: '960px', margin: '0 auto 56px auto' }}>
          <button
            type="button"
            onClick={() => setShowComparison(!showComparison)}
            style={{
              padding: '12px 28px',
              borderRadius: '9999px',
              background: showComparison ? '#0f172a' : '#ffffff',
              color: showComparison ? '#ffffff' : '#0f172a',
              border: '1px solid #cbd5e1',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              transition: 'all 0.2s ease'
            }}
          >
            <span>{showComparison ? 'Hide Detailed Feature Comparison' : 'Compare All Features In Detail'}</span>
            <FaChevronDown style={{ transform: showComparison ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', fontSize: '12px' }} />
          </button>

          {showComparison && (
            <div style={{ marginTop: '32px', background: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)', textAlign: 'left' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '18px 24px', color: '#0f172a', fontWeight: '800', width: '40%' }}>Core Capabilities</th>
                      <th style={{ padding: '18px 20px', color: '#475569', fontWeight: '700', textAlign: 'center', width: '20%' }}>Free Starter</th>
                      <th style={{ padding: '18px 20px', color: '#4f46e5', fontWeight: '800', textAlign: 'center', width: '20%', background: '#eef2ff' }}>Pro Career Pass</th>
                      <th style={{ padding: '18px 20px', color: '#7c3aed', fontWeight: '800', textAlign: 'center', width: '20%' }}>Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { cap: 'Resume Builder & 11 Step Pipeline', free: 'Included', pro: 'Included', ent: 'Included' },
                      { cap: 'ATS Resume Template Designs', free: 'All 51 Templates', pro: 'All 51 Templates', ent: 'All 51 + Custom' },
                      { cap: 'Daily AI Generation Quota', free: '10 requests / day', pro: '100 requests / day', ent: '5,000+ requests / day' },
                      { cap: 'ATS Score & STAR Bullet Optimizer', free: 'Basic Parser', pro: 'Full Intelligence', ent: 'Full Intelligence' },
                      { cap: 'Native Microsoft Word (.docx) Export', free: false, pro: true, ent: true },
                      { cap: 'Vector PDF Export (Watermark-Free)', free: 'Watermarked', pro: '100% Clean', ent: '100% Clean' },
                      { cap: 'AI Cover Letter Tailoring Engine', free: false, pro: '4 Tones & Templates', ent: 'Unlimited' },
                      { cap: 'AI Mock Interview Coach & CBT Simulator', free: false, pro: true, ent: true },
                      { cap: 'Custom Web CV & Portfolio URL', free: false, pro: '/portfolio/:slug', ent: 'Custom Domain' },
                      { cap: 'Job Application Pipeline & Kanban Tracker', free: 'Included', pro: 'Included', ent: 'Included' },
                      { cap: 'Tenant Isolation & Role-Based IAM', free: false, pro: false, ent: true },
                      { cap: 'Dedicated Account Manager & Support', free: 'Community', pro: 'Priority 24/7', ent: 'Dedicated 99.9% SLA' }
                    ].map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#ffffff' : '#fbfcfd' }}>
                        <td style={{ padding: '16px 24px', fontWeight: '600', color: '#1e293b' }}>{row.cap}</td>
                        <td style={{ padding: '16px 20px', textAlign: 'center', color: row.free === false ? '#94a3b8' : '#334155' }}>
                          {row.free === false ? <FaTimes style={{ color: '#cbd5e1' }} /> : row.free === true ? <FaCheck style={{ color: '#10b981' }} /> : row.free}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'center', color: '#4338ca', fontWeight: '700', background: '#fafbff' }}>
                          {row.pro === true ? <FaCheck style={{ color: '#4f46e5' }} /> : row.pro}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'center', color: '#6d28d9', fontWeight: '600' }}>
                          {row.ent === true ? <FaCheck style={{ color: '#7c3aed' }} /> : row.ent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Frequently Asked Questions (FAQ Accordion) */}
        <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'left' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 10px 0' }}>
              Frequently Asked Questions
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
              Everything you need to know about our plans, billing, and candidate entitlements.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: isOpen ? '1px solid #6366f1' : '1px solid #e2e8f0',
                    overflow: 'hidden',
                    boxShadow: isOpen ? '0 4px 16px rgba(99, 102, 241, 0.08)' : '0 2px 6px rgba(15, 23, 42, 0.02)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    style={{
                      width: '100%',
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>{item.q}</span>
                    <FaChevronDown style={{ color: isOpen ? '#6366f1' : '#94a3b8', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', shrink: 0, marginLeft: '16px' }} />
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 24px 20px 24px', fontSize: '14px', color: '#475569', lineHeight: 1.65, borderTop: '1px solid #f8fafc' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
