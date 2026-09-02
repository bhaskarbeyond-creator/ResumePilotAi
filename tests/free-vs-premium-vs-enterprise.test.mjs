import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { resolveEffectiveEntitlement } = require('../backend/security/entitlements.js');

test('Entitlement Matrix: Free vs Premium vs Enterprise vs Admin', async (t) => {

  await t.test('1. Free / Basic User: strictly restricted to Basic tier', () => {
    const freeUser = {
      uid: 'user_free_01',
      membership: 'Basic',
      paymentStatus: null,
      membershipEnds: null,
    };
    const entitlement = resolveEffectiveEntitlement(freeUser);
    assert.equal(entitlement.effectiveTier, 'Basic');
    assert.equal(entitlement.isAdmin, false);
    assert.equal(entitlement.isEnterprise, false);
    assert.equal(entitlement.isPremium, false);
    assert.equal(entitlement.dailyLimit, 10);
    assert.equal(entitlement.allowsDocxExport, false);
    assert.equal(entitlement.removesWatermark, false);
  });

  await t.test('2. Active Premium User: receives Pro capabilities without Enterprise access', () => {
    const activePrem = {
      uid: 'user_prem_02',
      membership: 'Premium',
      paymentStatus: 'ACTIVE',
      membershipEnds: '2099-12-31',
    };
    const entitlement = resolveEffectiveEntitlement(activePrem);
    assert.equal(entitlement.effectiveTier, 'Premium');
    assert.equal(entitlement.isAdmin, false);
    assert.equal(entitlement.isEnterprise, false);
    assert.equal(entitlement.isPremium, true);
    assert.equal(entitlement.dailyLimit, 100);
    assert.equal(entitlement.allowsDocxExport, true);
    assert.equal(entitlement.removesWatermark, true);
  });

  await t.test('3. Expired Premium User: downgraded to Basic tier', () => {
    const expiredPrem = {
      uid: 'user_prem_expired',
      membership: 'Premium',
      paymentStatus: 'ACTIVE',
      membershipEnds: '2020-01-01', // expired in past
    };
    const entitlement = resolveEffectiveEntitlement(expiredPrem);
    assert.equal(entitlement.effectiveTier, 'Basic');
    assert.equal(entitlement.isPremium, false);
    assert.equal(entitlement.allowsDocxExport, false);
    assert.equal(entitlement.removesWatermark, false);
    assert.equal(entitlement.dailyLimit, 10);
  });

  await t.test('4. Enterprise Member: receives elevated Enterprise tier and tenant AI quota', () => {
    const enterpriseMember = {
      uid: 'user_ent_member',
      membership: 'Basic', // personal profile might be basic
    };
    const tenantData = {
      id: 'tenant-uuid-101',
      name: 'Acme Corp',
      status: 'ACTIVE',
      quotaPolicy: { aiRequestsPerDay: 5000 },
    };
    const entitlement = resolveEffectiveEntitlement(enterpriseMember, { tenantData });
    assert.equal(entitlement.effectiveTier, 'Enterprise');
    assert.equal(entitlement.isAdmin, false);
    assert.equal(entitlement.isEnterprise, true);
    assert.equal(entitlement.isPremium, true);
    assert.equal(entitlement.dailyLimit, 5000);
    assert.equal(entitlement.allowsDocxExport, true);
    assert.equal(entitlement.removesWatermark, true);
    assert.equal(entitlement.tenantId, 'tenant-uuid-101');
  });

  await t.test('5. Expired / Suspended Enterprise User: restricted to Basic tier without tenantData', () => {
    const enterpriseUserSuspended = {
      uid: 'user_ent_suspended',
      membership: 'Basic',
    };
    // If tenant is suspended or expired, tenantData is nullified by tenant policy middleware
    const entitlement = resolveEffectiveEntitlement(enterpriseUserSuspended, { tenantData: null });
    assert.equal(entitlement.effectiveTier, 'Basic');
    assert.equal(entitlement.isEnterprise, false);
    assert.equal(entitlement.allowsDocxExport, false);
    assert.equal(entitlement.dailyLimit, 10);
  });

  await t.test('6. Enterprise Admin: Enterprise tier + distinct organization management claims', () => {
    const entAdminUser = {
      uid: 'user_ent_admin',
      membership: 'Basic',
    };
    const tenantData = {
      id: 'tenant-uuid-202',
      name: 'Global Tech',
      status: 'ACTIVE',
      aiPolicy: { dailyLimit: 15000 },
    };
    const userClaims = {
      claims: {
        tenantId: 'tenant-uuid-202',
        tenantRole: 'TENANT_ADMIN',
      }
    };
    const entitlement = resolveEffectiveEntitlement(entAdminUser, { tenantData, userClaims });
    assert.equal(entitlement.effectiveTier, 'Enterprise');
    assert.equal(entitlement.isEnterprise, true);
    assert.equal(entitlement.dailyLimit, 15000);
    // Notice: Enterprise Admin is NOT a platform Super Admin
    assert.equal(entitlement.isAdmin, false);
  });

  await t.test('7. Super Admin: full administrative capability with 10,000 requests/day', () => {
    const adminUser = {
      uid: 'user_super_admin',
      role: 'SUPER_ADMIN',
    };
    const userClaims = {
      claims: {
        superAdmin: true,
        role: 'SUPER_ADMIN',
      }
    };
    const entitlement = resolveEffectiveEntitlement(adminUser, { userClaims });
    assert.equal(entitlement.effectiveTier, 'Admin');
    assert.equal(entitlement.isAdmin, true);
    assert.equal(entitlement.dailyLimit, 10000);
    assert.equal(entitlement.allowsDocxExport, true);
    assert.equal(entitlement.removesWatermark, true);
  });

  await t.test('8. Role Invariants: FREE != PREMIUM != ENTERPRISE != ADMIN', () => {
    const free = resolveEffectiveEntitlement({ membership: 'Basic' });
    const prem = resolveEffectiveEntitlement({ membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: '2099-12-31' });
    const ent = resolveEffectiveEntitlement({ membership: 'Basic' }, { tenantData: { id: 't-1' } });
    const adm = resolveEffectiveEntitlement({ role: 'ADMIN' });

    assert.notEqual(free.effectiveTier, prem.effectiveTier, 'FREE != PREMIUM');
    assert.notEqual(prem.effectiveTier, ent.effectiveTier, 'PREMIUM != ENTERPRISE');
    assert.notEqual(ent.effectiveTier, adm.effectiveTier, 'ENTERPRISE != ADMIN');
    assert.notEqual(prem.effectiveTier, adm.effectiveTier, 'PREMIUM != ADMIN');
    assert.notEqual(ent.isEnterprise, adm.isEnterprise, 'Admin is not automatically Enterprise unless in tenant context');
  });

});
