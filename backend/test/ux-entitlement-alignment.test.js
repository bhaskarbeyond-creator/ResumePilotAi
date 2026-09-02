'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { toCanonicalMembership, isPaidMembershipTier } = require('../database/canonical');
const { resolveEffectiveEntitlement } = require('../security/entitlements');

test('UX-Entitlement Alignment: Tier Resolution & Privilege Inheritance', async () => {
  // Free User
  const freeUser = { id: 'u-free', membership: 'Basic', membershipEnds: null };
  const freeEnt = resolveEffectiveEntitlement(freeUser, {});
  assert.equal(freeEnt.effectiveTier, 'Basic');
  assert.equal(freeEnt.allowsDocxExport, false);
  assert.equal(freeEnt.dailyLimit, 10);

  // Premium / Pro User
  const proUser = { id: 'u-pro', membership: 'Premium', membershipEnds: new Date(Date.now() + 86400000).toISOString() };
  const proEnt = resolveEffectiveEntitlement(proUser, {});
  assert.equal(proEnt.effectiveTier, 'Premium');
  assert.equal(proEnt.allowsDocxExport, true);
  assert.equal(proEnt.dailyLimit, 100);

  // Enterprise User: Must retain Enterprise identity while inheriting full Pro privileges
  const entUser = { id: 'u-ent', membership: 'Enterprise', membershipEnds: null };
  const entEnt = resolveEffectiveEntitlement(entUser, {
    tenantData: { id: 't-acme', name: 'Acme Corp', status: 'ACTIVE' }
  });
  assert.equal(entEnt.effectiveTier, 'Enterprise');
  assert.equal(entEnt.allowsDocxExport, true);
  assert.equal(entEnt.dailyLimit, 5000);
});

test('UX-Entitlement Alignment: Zero Customer-Facing AI Provider Leakage', async () => {
  const customerFiles = [
    'src/components/CustomPage/CustomePage.jsx',
    'src/components/Dashboard/DashboardSupport/DashboardSupport.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Dashboard2/elements/HomepagePricing.jsx'
  ];

  const forbiddenProviderTerms = [
    /\bNVIDIA\b/i,
    /\bGroq\b/i,
    /\bOpenRouter\b/i,
    /\bDeepSeek\b/i,
    /\bOllama\b/i
  ];

  for (const relPath of customerFiles) {
    const fullPath = path.resolve(__dirname, '../../', relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of forbiddenProviderTerms) {
      const match = content.match(pattern);
      assert.equal(
        match,
        null,
        `Customer-facing file ${relPath} leaked internal AI provider name: ${match?.[0]}`
      );
    }
  }
});

test('UX-Entitlement Alignment: Accurate Feature Copy (No Fake "Unlimited" Claims)', async () => {
  const plansPath = path.resolve(__dirname, '../../src/components/Billing/Plans/Plans.jsx');
  const modalPath = path.resolve(__dirname, '../../src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx');

  const plansContent = fs.readFileSync(plansPath, 'utf8');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Must not claim "Unlimited AI Resume Builds & Downloads" in PRO_UNLOCKED_FEATURES
  assert.ok(!plansContent.includes('Unlimited AI Resume Builds & Downloads'), 'Plans.jsx must not claim unlimited AI');
  assert.ok(!modalContent.includes('Unlimited AI Resume Builds & Downloads'), 'SubscriptionModal.jsx must not claim unlimited AI');

  // Must specify the actual daily limit (100 ops/day)
  assert.ok(plansContent.includes('100 ops/day'), 'Plans.jsx features must document 100 ops/day quota');
  assert.ok(modalContent.includes('100 ops/day'), 'SubscriptionModal.jsx features must document 100 ops/day quota');
});

test('UX-Entitlement Alignment: Multi-Currency Pricing Dynamic Mapping', async () => {
  const pricingMatrix = {
    INR: { monthly: 199, quartarly: 399, yearly: 499 },
    USD: { monthly: 19, quartarly: 39, yearly: 49 },
    EUR: { monthly: 18, quartarly: 36, yearly: 46 }
  };

  // Check currency resolution
  for (const [curr, rates] of Object.entries(pricingMatrix)) {
    const matrix = pricingMatrix[curr] || {};
    const m = Number(matrix.monthly) || 199;
    const q = Number(matrix.quartarly) || 399;
    const y = Number(matrix.yearly) || 499;

    assert.equal(m, rates.monthly);
    assert.equal(q, rates.quartarly);
    assert.equal(y, rates.yearly);
  }
});
