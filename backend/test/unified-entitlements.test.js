'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveEffectiveEntitlement, isUserAdmin } = require('../security/entitlements');

test('Unified Entitlements Matrix: Admin user receives full administrative entitlement and 10,000/day quota', () => {
  const adminUser = {
    email: 'admin@airesume.guru',
    role: 'admin',
    membership: 'Admin',
  };
  const entitlement = resolveEffectiveEntitlement(adminUser, {
    userClaims: { email: 'admin@airesume.guru', admin: true },
    quotaConfig: { adminDailyLimit: 10000, basicDailyLimit: 10, premiumDailyLimit: 100 },
  });

  assert.equal(entitlement.effectiveTier, 'Admin');
  assert.equal(entitlement.isAdmin, true);
  assert.equal(entitlement.isPremium, true);
  assert.equal(entitlement.dailyLimit, 10000);
  assert.equal(entitlement.allowsDocxExport, true);
  assert.equal(entitlement.allowsAllTemplates, true);
  assert.equal(entitlement.removesWatermark, true);
});

test('Unified Entitlements Matrix: Enterprise tenant member (with Basic personal profile) inherits Enterprise tier and elevated quota', () => {
  const enterpriseUser = {
    email: 'employee@acmecorp.com',
    membership: 'Basic', // Personal profile has not purchased personal Pro
    paymentStatus: 'NONE',
    tenantMemberships: [
      {
        tenantId: 'tenant-acme-uuid-1',
        roles: ['MEMBER'],
        status: 'ACTIVE',
      }
    ],
  };

  const entitlement = resolveEffectiveEntitlement(enterpriseUser, {
    userClaims: { email: 'employee@acmecorp.com' },
    tenantData: {
      id: 'tenant-acme-uuid-1',
      aiPolicy: { dailyLimit: 5000 },
    },
    quotaConfig: { basicDailyLimit: 10, premiumDailyLimit: 100 },
  });

  assert.equal(entitlement.effectiveTier, 'Enterprise');
  assert.equal(entitlement.isEnterprise, true);
  assert.equal(entitlement.isPremium, true);
  assert.equal(entitlement.dailyLimit, 5000);
  assert.equal(entitlement.allowsDocxExport, true);
  assert.equal(entitlement.allowsAllTemplates, true);
  assert.equal(entitlement.removesWatermark, true);
  assert.equal(entitlement.tenantId, 'tenant-acme-uuid-1');
});

test('Unified Entitlements Matrix: B2C Pro subscriber receives Premium tier and 100/day quota', () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const proUser = {
    email: 'candidate@gmail.com',
    membership: 'Premium',
    paymentStatus: 'ACTIVE',
    membershipEnds: futureDate,
    tenantMemberships: [],
  };

  const entitlement = resolveEffectiveEntitlement(proUser, {
    userClaims: { email: 'candidate@gmail.com' },
    quotaConfig: { basicDailyLimit: 10, premiumDailyLimit: 100 },
  });

  assert.equal(entitlement.effectiveTier, 'Premium');
  assert.equal(entitlement.isEnterprise, false);
  assert.equal(entitlement.isPremium, true);
  assert.equal(entitlement.dailyLimit, 100);
  assert.equal(entitlement.allowsDocxExport, true);
  assert.equal(entitlement.allowsAllTemplates, true);
  assert.equal(entitlement.removesWatermark, true);
});

test('Unified Entitlements Matrix: Free/Basic user without enterprise tenant is restricted to Basic tier (10/day, no DOCX)', () => {
  const freeUser = {
    email: 'freeuser@gmail.com',
    membership: 'Basic',
    paymentStatus: 'NONE',
    tenantMemberships: [],
  };

  const entitlement = resolveEffectiveEntitlement(freeUser, {
    userClaims: { email: 'freeuser@gmail.com' },
    quotaConfig: { basicDailyLimit: 10, premiumDailyLimit: 100 },
  });

  assert.equal(entitlement.effectiveTier, 'Basic');
  assert.equal(entitlement.isEnterprise, false);
  assert.equal(entitlement.isPremium, false);
  assert.equal(entitlement.dailyLimit, 10);
  assert.equal(entitlement.allowsDocxExport, false);
  assert.equal(entitlement.allowsAllTemplates, false);
  assert.equal(entitlement.removesWatermark, false);
});

test('Unified Entitlements Matrix: Suspended enterprise membership does NOT grant Enterprise tier', () => {
  const suspendedUser = {
    email: 'former_employee@acme.com',
    membership: 'Basic',
    paymentStatus: 'NONE',
    tenantMemberships: [
      {
        tenantId: 'tenant-acme-uuid-1',
        roles: ['MEMBER'],
        status: 'SUSPENDED',
      }
    ],
  };

  const entitlement = resolveEffectiveEntitlement(suspendedUser, {
    userClaims: { email: 'former_employee@acme.com' },
  });

  assert.equal(entitlement.effectiveTier, 'Basic');
  assert.equal(entitlement.isEnterprise, false);
  assert.equal(entitlement.isPremium, false);
  assert.equal(entitlement.allowsDocxExport, false);
});

test('Unified Entitlements Matrix: Individual AI quota override takes precedence when active and unexpired', () => {
  const userWithOverride = {
    email: 'tester@acme.com',
    membership: 'Basic',
    aiQuotaOverride: {
      dailyLimit: 250,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'Quality assurance load testing',
    },
  };

  const entitlement = resolveEffectiveEntitlement(userWithOverride);
  assert.equal(entitlement.dailyLimit, 250);
});
