import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSubscriptionStatus } from '../../../services/api/platform';
import { FaCheck, FaCrown, FaBuilding, FaArrowRight, FaShieldAlt, FaCcVisa, FaCcMastercard, FaBolt } from 'react-icons/fa';

export default function HomepagePricing({ onOpenAuthModal }) {
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

  const handleCta = (plan) => {
    if (onOpenAuthModal) {
      onOpenAuthModal('signup', `Create your free account for ${plan}`);
    } else {
      window.location.href = '/login?next=%2Fpricing';
    }
  };

  const symbol = pricingData.currencySymbol || (pricingData.currency === 'INR' ? '₹' : '$');
  const proPrice = pricingData.monthlyPrice;

  return (
    <section id="pricing" className="rp-section-pad" style={{ background: '#f8fafd', borderTop: '1px solid #e2e8f0' }}>
      <div className="rp-container" style={{ textAlign: 'center' }}>
        
        {/* Header */}
        <div style={{ maxWidth: '760px', margin: '0 auto 48px auto' }}>
          <div className="rp-story-tag blue">
            <FaCrown />
            <span>Simple, Transparent Pricing</span>
          </div>
          <h2 style={{ fontSize: 'clamp(2rem, 3.2vw + 0.5rem, 3rem)', fontWeight: '800', color: 'var(--rp-text-title)', letterSpacing: '-0.03em', margin: '0 0 16px 0' }}>
            Invest In Your Career With Guaranteed ROI
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--rp-text-body)', margin: 0, lineHeight: 1.7 }}>
            Start completely free with zero commitment. Upgrade when you need unlimited AI generations, interactive CBT interview simulations, and native Word DOCX exports.
          </p>
        </div>

        {/* Pricing Grid with Dynamic MariaDB Rates */}
        <div className="rp-pricing-grid" style={{ marginBottom: '40px' }}>
          
          {/* Tier 1: Free Starter ($0 / ₹0) */}
          <div className="rp-pricing-card">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Free Starter</h3>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '9999px', textTransform: 'uppercase' }}>Forever Free</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                Build and test your resume with basic AI assistance and 51 ATS templates.
              </p>

              <div style={{ margin: '14px 0 24px 0' }}>
                <span style={{ fontSize: '42px', fontWeight: '900', color: '#0f172a' }}>{symbol}0</span>
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}> / free forever</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                {[
                  'Access to all 51 ATS Templates',
                  'Basic AI Bullet Writer (5 generations/mo)',
                  'ATS Compatibility Parser Check',
                  'Standard PDF Export'
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155' }}>
                    <FaCheck style={{ color: '#137333', fontSize: '12px', shrink: 0 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCta('Free Starter')}
              className="rp-btn-hero-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              id="rp-pricing-free-cta"
            >
              Get Started Free
            </button>
          </div>

          {/* Tier 2: Pro Career Pass (Featured with MariaDB Price) */}
          <div className="rp-pricing-card featured">
            <div className="rp-pricing-pill">
              Most Popular • Best Value
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Pro Career Pass</h3>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#1a73e8', background: '#e8f0fe', padding: '4px 10px', borderRadius: '9999px', textTransform: 'uppercase' }}>Full AI Power</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                Complete AI career acceleration suite for active job seekers.
              </p>

              <div style={{ margin: '14px 0 24px 0' }}>
                <span style={{ fontSize: '42px', fontWeight: '900', color: '#0f172a' }} id="rp-pricing-pro-value">
                  {symbol}{proPrice}
                </span>
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}> / month ({pricingData.currency})</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                {[
                  'Unlimited AI Generations & Summaries',
                  'Interactive AI Interview Coach & CBT Simulator',
                  'Native Microsoft Word (.docx) & Vector PDF',
                  'Tailored Cover Letter Generator',
                  'Custom Web Portfolio Vanity URL'
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#0f172a', fontWeight: '600' }}>
                    <FaCheck style={{ color: '#1a73e8', fontSize: '12px', shrink: 0 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCta('Pro Career Pass')}
              className="rp-btn-hero-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              id="rp-pricing-pro-cta"
            >
              <span>Start Pro Career Pass</span>
              <FaArrowRight style={{ fontSize: '11px' }} />
            </button>
          </div>

          {/* Tier 3: Enterprise Workspace */}
          <div className="rp-pricing-card">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Enterprise</h3>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#7c3aed', background: '#f3e8ff', padding: '4px 10px', borderRadius: '9999px', textTransform: 'uppercase' }}>Organizations</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                Multi-tenant talent management and team resume governance.
              </p>

              <div style={{ margin: '14px 0 24px 0' }}>
                <span style={{ fontSize: '42px', fontWeight: '900', color: '#0f172a' }}>{symbol}{pricingData.currency === 'INR' ? '2,999' : '49'}</span>
                <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}> / seat / mo</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                {[
                  'Multi-Tenant Workspace & Role-Based IAM',
                  'Durable Outbox & Background Queue',
                  'AES-256-GCM Tenant Data Encryption',
                  'Dedicated Account Manager & SLA'
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155' }}>
                    <FaCheck style={{ color: '#7c3aed', fontSize: '12px', shrink: 0 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/enterprise"
              className="rp-btn-hero-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              id="rp-pricing-enterprise-cta"
            >
              Explore Enterprise
            </Link>
          </div>

        </div>

        {/* Security & Payment Gateways */}
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FaShieldAlt style={{ color: '#137333' }} />
            <span>14-Day Money-Back Guarantee</span>
          </div>
          <span>•</span>
          <span>Encrypted Checkout via {pricingData.razorpayEnabled ? 'Razorpay UPI/Cards' : 'Stripe/PayPal'}</span>
          <span>•</span>
          <span>Cancel Anytime</span>
        </div>

      </div>
    </section>
  );
}
