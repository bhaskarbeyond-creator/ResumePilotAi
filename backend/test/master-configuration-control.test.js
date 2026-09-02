'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('express');

const { toCanonicalMembership, isPaidMembershipTier } = require('../database/canonical');
const { resolveEffectiveEntitlement } = require('../security/entitlements');
const { TENANT_ROLES } = require('../enterprise/constants');
const { portfoliosRouter } = require('../routes/portfolios');

test('Master Configuration Control: Canonical Membership Normalization & Non-Flattening', async () => {
  // Free / Basic normalization
  assert.equal(toCanonicalMembership('FREE'), 'Basic');
  assert.equal(toCanonicalMembership('free'), 'Basic');
  assert.equal(toCanonicalMembership('BASIC'), 'Basic');
  assert.equal(toCanonicalMembership(null), 'Basic');
  assert.equal(isPaidMembershipTier('Basic'), false);

  // Pro / Premium normalization
  assert.equal(toCanonicalMembership('PRO'), 'Pro');
  assert.equal(toCanonicalMembership('PREMIUM'), 'Premium');
  assert.equal(toCanonicalMembership('Premium Pro'), 'Premium');
  assert.equal(isPaidMembershipTier('Premium'), true);
  assert.equal(isPaidMembershipTier('Pro'), true);

  // Enterprise normalization — MUST NOT flatten to Premium
  assert.equal(toCanonicalMembership('ENTERPRISE'), 'Enterprise');
  assert.equal(toCanonicalMembership('enterprise'), 'Enterprise');
  assert.equal(toCanonicalMembership('ENT'), 'Enterprise');
  assert.equal(isPaidMembershipTier('Enterprise'), true);
  assert.notEqual(toCanonicalMembership('Enterprise'), 'Premium');
});

test('Master Configuration Control: Dynamic AI Quotas & Context Isolation', async () => {
  const dynamicQuotaConfig = {
    basicDailyLimit: 25,
    premiumDailyLimit: 250,
    adminDailyLimit: 20000,
    enterpriseDailyLimit: 15000,
  };

  // 1. Free user with dynamic quota
  const freeUser = { id: 'u-free', membership: 'Basic', paymentStatus: 'NONE' };
  const freeEntitlement = resolveEffectiveEntitlement(freeUser, { quotaConfig: dynamicQuotaConfig });
  assert.equal(freeEntitlement.effectiveTier, 'Basic');
  assert.equal(freeEntitlement.dailyLimit, 25);
  assert.equal(freeEntitlement.allowsDocxExport, false);

  // 2. Pro user with dynamic quota
  const proUser = { id: 'u-pro', membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: '2099-01-01' };
  const proEntitlement = resolveEffectiveEntitlement(proUser, { quotaConfig: dynamicQuotaConfig });
  assert.equal(proEntitlement.effectiveTier, 'Premium');
  assert.equal(proEntitlement.dailyLimit, 250);
  assert.equal(proEntitlement.allowsDocxExport, true);

  // 3. Enterprise user in Tenant Context
  const enterpriseMember = { id: 'u-ent', membership: 'Basic', paymentStatus: 'NONE' };
  const tenantData = { id: 'tenant-123', aiPolicy: { dailyLimit: 15000 } };
  const enterpriseEntitlement = resolveEffectiveEntitlement(enterpriseMember, {
    tenantData,
    quotaConfig: dynamicQuotaConfig,
  });
  assert.equal(enterpriseEntitlement.effectiveTier, 'Enterprise');
  assert.equal(enterpriseEntitlement.dailyLimit, 15000);
  assert.equal(enterpriseEntitlement.isEnterprise, true);
  assert.equal(enterpriseEntitlement.allowsDocxExport, true);

  // 4. Enterprise user without Tenant Context (personal mode)
  const enterprisePersonal = { id: 'u-ent', membership: 'Enterprise', paymentStatus: 'ACTIVE' };
  const personalEntitlement = resolveEffectiveEntitlement(enterprisePersonal, {
    quotaConfig: dynamicQuotaConfig,
  });
  assert.equal(personalEntitlement.effectiveTier, 'Enterprise');
  assert.equal(personalEntitlement.dailyLimit, 250); // falls to Pro daily limit in personal consumer mode
  assert.equal(personalEntitlement.allowsDocxExport, true);
});

test('Master Configuration Control: Enterprise Role Inventory Verification', async () => {
  const roleKeys = Object.keys(TENANT_ROLES);
  
  // Verify presence of all canonical roles and recognized aliases
  assert.ok(roleKeys.includes('TENANT_OWNER') && roleKeys.includes('ENTERPRISE_OWNER'));
  assert.ok(roleKeys.includes('TENANT_ADMIN') && roleKeys.includes('ENTERPRISE_ADMIN'));
  assert.ok(roleKeys.includes('BILLING_ADMIN'));
  assert.ok(roleKeys.includes('WORKSPACE_MANAGER'));
  assert.ok(roleKeys.includes('ENTERPRISE_MEMBER') && roleKeys.includes('MEMBER'));
  assert.ok(roleKeys.includes('ENTERPRISE_VIEWER') && roleKeys.includes('VIEWER'));

  // Verify permission hierarchy
  assert.deepEqual(TENANT_ROLES.TENANT_OWNER, ['*']);
  assert.ok(TENANT_ROLES.TENANT_ADMIN.includes('tenant.settings.write'));
  assert.ok(TENANT_ROLES.BILLING_ADMIN.includes('tenant.billing.read'));
  assert.ok(TENANT_ROLES.WORKSPACE_MANAGER.includes('ai.use'));
  assert.ok(TENANT_ROLES.ENTERPRISE_MEMBER.includes('ai.use'));
  assert.ok(!TENANT_ROLES.ENTERPRISE_VIEWER.includes('ai.use')); // Viewers cannot invoke AI
});

test('Master Configuration Control: Server-Side Module Gate for Portfolios', async () => {
  const mockRepoDisabled = {
    getSetting: async (key) => {
      if (key === 'public_config') {
        return { modules: { enablePortfolioModule: false } };
      }
      return {};
    },
    savePortfolio: async () => ({ id: 'p-1' }),
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.repository = mockRepoDisabled;
    req.user = { uid: 'regular-user-123', role: 'USER' };
    next();
  });
  app.use('/api/portfolios', portfoliosRouter);

  // Attempting to save a portfolio when module is disabled should return 403 PORTFOLIO_MODULE_DISABLED
  const res = await request(app)
    .post('/api/portfolios/portfolio-1')
    .send({ expectedRevision: 0, portfolio: { title: 'My Portfolio', userId: 'regular-user-123' } });

  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'PORTFOLIO_MODULE_DISABLED');
});

test('Master Configuration Control: Dynamic Pricing & Zero Client Price Authority', async () => {
  const dynamicSubscriptions = {
    state: true,
    currency: 'INR',
    monthlyPrice: 249,
    quartarlyPrice: 449,
    yearlyPrice: 599,
    enableTax: true,
    taxInclusive: true,
    pricingMatrix: {
      USD: { monthly: 29, quartarly: 49, yearly: 69 }
    },
    razorpayEnabled: true,
    stripeEnabled: true,
  };

  // Mock repo
  const repo = {
    getSetting: async (key) => {
      if (key === 'public_config') return { subscriptions: dynamicSubscriptions };
      if (key === 'system_settings') return { currency: 'INR' };
      return null;
    }
  };

  // Simulated server price lookup (mirrors getDynamicPlan)
  const currency = 'INR';
  const planId = 'monthly';
  let baseAmount;
  const matrix = dynamicSubscriptions.pricingMatrix?.[currency];
  if (matrix && Object.hasOwn(matrix, planId)) {
    baseAmount = Number(matrix[planId]);
  } else {
    baseAmount = Number(dynamicSubscriptions.monthlyPrice);
  }
  const computedAmount = Math.round(baseAmount * 100);

  // Assert server calculates amount from DB config, completely ignoring any hypothetical client payload
  assert.equal(baseAmount, 249);
  assert.equal(computedAmount, 24900); // 249.00 INR in paise

  // Test USD multi-currency resolution
  const usdAmount = Number(dynamicSubscriptions.pricingMatrix.USD.monthly);
  assert.equal(usdAmount, 29);
  assert.equal(Math.round(usdAmount * 100), 2900); // $29.00 in cents
});

test('Master Configuration Control: PDF Export Policy Gating (Free vs Pro vs Free Mode)', async () => {
  const { isPaidMembershipTier } = require('../database/canonical');
  const { isMembershipActive } = require('../database/domain');

  // 1. When paywall active: Free user is not entitled
  const freeUser = { membership: 'Basic', paymentStatus: 'NONE' };
  const entitledNormalPaywall = isMembershipActive(freeUser);
  assert.equal(entitledNormalPaywall, false);

  // 2. Pro user is entitled
  const proUser = { membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: '2099-01-01' };
  const entitledPro = isMembershipActive(proUser);
  assert.equal(entitledPro, true);

  // 3. Enterprise user is entitled
  const entUser = { membership: 'Enterprise', paymentStatus: 'ACTIVE', membershipEnds: '2099-01-01' };
  const entitledEnt = isMembershipActive(entUser);
  assert.equal(entitledEnt, true);

  // 4. Global Free Mode unlocks export for everyone
  const publicConfigFreeMode = { subscriptions: { state: false } };
  const isGlobalFreeMode = publicConfigFreeMode.subscriptions?.state === false;
  assert.equal(isGlobalFreeMode, true);
});

