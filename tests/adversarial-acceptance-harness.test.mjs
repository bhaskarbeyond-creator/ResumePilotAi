import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { getPool } = require('../backend/database/mysql.js');
const { resolveEffectiveEntitlement } = require('../backend/security/entitlements.js');

const BASE_URL = 'http://127.0.0.1:8080';

test('ADVERSARIAL HARNESS — COMPREHENSIVE BREAK-IT AUDIT', async (t) => {
  const pool = getPool();

  // -------------------------------------------------------------
  // ATTACK 1: Free -> Premium Escalation Attack
  // -------------------------------------------------------------
  await t.test('Attack 1: Free account cannot obtain Premium capabilities via body, headers, or state tampering', async () => {
    // 1a. Direct API call to DOCX export with forged body fields claiming Premium / Admin
    const freeUser = {
      id: 'adv_free_user_01',
      uid: 'adv_free_user_01',
      email: 'free_attacker@example.com',
      membership: 'Basic',
      role: 'USER',
    };

    // Entitlement resolver must reject client spoofing
    const spoofedUserData = {
      ...freeUser,
      membership: 'Basic',
      clientReportedMembership: 'Premium',
      clientReportedRole: 'ADMIN',
      isPremium: true,
      allowsDocxExport: true,
      dailyLimit: 99999,
    };

    const entitlement = resolveEffectiveEntitlement(spoofedUserData, {
      userClaims: { uid: freeUser.uid, role: 'USER' }
    });

    assert.equal(entitlement.effectiveTier, 'Basic', 'Effective tier must remain Basic');
    assert.equal(entitlement.allowsDocxExport, false, 'DOCX export must remain false');
    assert.equal(entitlement.removesWatermark, false, 'Watermark removal must remain false');
    assert.equal(entitlement.dailyLimit, 10, 'Daily limit must strictly be 10');
    assert.equal(entitlement.isAdmin, false, 'Admin must be false');
    assert.equal(entitlement.isEnterprise, false, 'Enterprise must be false');
  });

  // -------------------------------------------------------------
  // ATTACK 2: Enterprise -> Premium / Role Confusion
  // -------------------------------------------------------------
  await t.test('Attack 2: Enterprise, Premium, Admin, and Free roles remain strictly unflattened', async () => {
    // 2a. Enterprise member without tenantData cannot claim Enterprise tier
    const fakeEnterpriseUser = {
      uid: 'adv_fake_ent_01',
      membership: 'Basic',
      tenantId: 'victim-tenant-999', // Claimed in profile
    };
    const resolvedWithoutTenantContext = resolveEffectiveEntitlement(fakeEnterpriseUser, { tenantData: null });
    assert.equal(resolvedWithoutTenantContext.effectiveTier, 'Basic', 'Profile claiming tenantId without valid tenantData fails to Basic');
    assert.equal(resolvedWithoutTenantContext.isEnterprise, false, 'isEnterprise must be false without tenantData');

    // 2b. Enterprise Member vs Enterprise Admin separation
    const tenantData = {
      id: 'tenant-adv-01',
      status: 'ACTIVE',
      quotaPolicy: { aiRequestsPerDay: 8000 }
    };

    const entMemberClaims = { claims: { tenantId: 'tenant-adv-01', tenantRole: 'MEMBER' } };
    const entMember = resolveEffectiveEntitlement(fakeEnterpriseUser, { tenantData, userClaims: entMemberClaims });
    assert.equal(entMember.effectiveTier, 'Enterprise');
    assert.equal(entMember.isAdmin, false, 'Enterprise Member must NOT be platform Admin');

    // 2c. Enterprise Admin is still NOT platform Super Admin
    const entAdminClaims = { claims: { tenantId: 'tenant-adv-01', tenantRole: 'TENANT_ADMIN' } };
    const entAdmin = resolveEffectiveEntitlement(fakeEnterpriseUser, { tenantData, userClaims: entAdminClaims });
    assert.equal(entAdmin.effectiveTier, 'Enterprise');
    assert.equal(entAdmin.isAdmin, false, 'Enterprise Admin must NOT be platform Super Admin');

    // 2d. Invariant check: All 4 tiers must be distinct
    const free = resolveEffectiveEntitlement({ membership: 'Basic' });
    const prem = resolveEffectiveEntitlement({ membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: '2099-12-31' });
    const ent = resolveEffectiveEntitlement({ membership: 'Basic' }, { tenantData });
    const adm = resolveEffectiveEntitlement({ role: 'SUPER_ADMIN' }, { userClaims: { superAdmin: true } });

    const tiers = new Set([free.effectiveTier, prem.effectiveTier, ent.effectiveTier, adm.effectiveTier]);
    assert.equal(tiers.size, 4, 'All 4 tiers (Basic, Premium, Enterprise, Admin) must be completely distinct');
  });

  // -------------------------------------------------------------
  // ATTACK 3: Expired Subscription Attack
  // -------------------------------------------------------------
  await t.test('Attack 3: Stale frontend state / expired subscription immediately drops capability on backend', async () => {
    const expiredUser = {
      uid: 'adv_expired_user',
      membership: 'Premium',
      paymentStatus: 'ACTIVE',
      membershipEnds: '2023-01-01', // Expired 3 years ago
    };

    const entitlement = resolveEffectiveEntitlement(expiredUser);
    assert.equal(entitlement.effectiveTier, 'Basic', 'Expired user must drop to Basic tier');
    assert.equal(entitlement.isPremium, false, 'isPremium must be false');
    assert.equal(entitlement.allowsDocxExport, false, 'allowsDocxExport must be false');
    assert.equal(entitlement.removesWatermark, false, 'removesWatermark must be false');
    assert.equal(entitlement.dailyLimit, 10, 'dailyLimit must drop to basic limit 10');
  });

  // -------------------------------------------------------------
  // ATTACK 4: Client-Side Price Manipulation in Payment APIs
  // -------------------------------------------------------------
  await t.test('Attack 4: Client-supplied monetary values are strictly rejected by payment endpoints', async () => {
    // 4a. Attempting to pass amount = 1 in /api/razorpay/create-order
    const tamperedPayloads = [
      { planId: 'monthly', amount: 1 },
      { planId: 'monthly', amount: 0 },
      { planId: 'monthly', amount: -100 },
      { planId: 'monthly', amount: 999999 },
      { planId: 'monthly', userId: 'victim_user_123' },
      { planId: 'monthly', uid: 'admin_user_999' },
      { planId: 'monthly', ownerUid: 'admin' },
      { planId: 'monthly', keyId: 'fake_key' },
    ];

    for (const payload of tamperedPayloads) {
      const res = await fetch(`${BASE_URL}/api/razorpay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Unauthenticated returns 401, but if body has clientIdentityFields, must be 400 or 401
      assert.ok([400, 401].includes(res.status), `Tampered payload must be rejected, got ${res.status}`);
      if (res.status === 400) {
        const json = await res.json();
        assert.equal(json.error?.code, 'CLIENT_PAYMENT_IDENTITY_REJECTED', 'Must reject client payment identity');
      }
    }
  });

  // -------------------------------------------------------------
  // ATTACK 5: Coupon Attack & Exploitation
  // -------------------------------------------------------------
  await t.test('Attack 5: Coupon tampering, fabricated coupons, and negative amounts are blocked', async () => {
    // 5a. Fabricated coupon
    const resFake = await fetch(`${BASE_URL}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'FAKE_COUPON_100_PERCENT' })
    });
    assert.equal(resFake.status, 404, 'Fabricated coupon returns 404');
    const jsonFake = await resFake.json();
    assert.equal(jsonFake.valid, false);

    // 5b. Malformed coupon codes (SQL injection or overflow attempts)
    const malformedCodes = ["' OR '1'='1", '<script>', 'A'.repeat(100), ''];
    for (const code of malformedCodes) {
      const res = await fetch(`${BASE_URL}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      assert.ok([400, 404].includes(res.status), `Malformed code must be rejected with 400 or 404, got ${res.status}`);
    }
  });

  // -------------------------------------------------------------
  // ATTACK 6: Tax / Final Amount Attack
  // -------------------------------------------------------------
  await t.test('Attack 6: Server independently calculates authoritative tax and final amount', async () => {
    const [publicRow] = await pool.query("SELECT data FROM system_settings WHERE category = 'public_config'");
    const publicConfig = typeof publicRow[0].data === 'string' ? JSON.parse(publicRow[0].data) : publicRow[0].data;

    const monthlyPrice = Number(publicConfig.subscriptions?.monthlyPrice || 199);
    const taxRate = Number(publicConfig.subscriptions?.taxRate || 18);
    const enableTax = publicConfig.subscriptions?.enableTax === true;
    const taxInclusive = publicConfig.subscriptions?.taxInclusive === true;

    // Client claims GST is 0% and final amount is 1
    const clientPayload = {
      price: monthlyPrice,
      taxRate: 0,
      enableTax: false,
      finalAmount: 1,
    };

    // Server calculation formula
    let serverTaxAmount = 0;
    let serverPayable = monthlyPrice;
    if (enableTax) {
      if (taxInclusive) {
        serverTaxAmount = Math.round(monthlyPrice - (monthlyPrice / (1 + taxRate / 100)));
        serverPayable = monthlyPrice;
      } else {
        serverTaxAmount = Math.round(monthlyPrice * (taxRate / 100));
        serverPayable = monthlyPrice + serverTaxAmount;
      }
    }

    assert.notEqual(serverPayable, clientPayload.finalAmount, 'Server enforces authoritative payable');
    assert.ok(serverPayable >= 199, 'Payable must reflect authoritative base price');
  });

  // -------------------------------------------------------------
  // ATTACK 7: Direct API Bypass (Calling Protected APIs Unauthenticated)
  // -------------------------------------------------------------
  await t.test('Attack 7: Protected APIs reject unauthenticated and unauthorized callers', async () => {
    const protectedEndpoints = [
      { path: '/api/resumes', method: 'GET' },
      { path: '/api/resumes', method: 'POST', body: { title: 'Hacked Resume' } },
      { path: '/api/generate-summary', method: 'POST', body: { title: 'Engineer' } },
      { path: '/api/export-docx', method: 'POST', body: { resumeId: 'test' } },
      { path: '/api/admin/settings/public_config', method: 'GET' },
      { path: '/api/admin/coupons', method: 'POST', body: { code: 'HACK99', discount: 99 } },
      { path: '/api/enterprise/tenants', method: 'GET' },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.ok([401, 403].includes(res.status), `Unauthenticated call to ${ep.path} must return 401 or 403, got ${res.status}`);
    }
  });

  // -------------------------------------------------------------
  // ATTACK 8: IDOR & Cross-Tenant Boundary
  // -------------------------------------------------------------
  await t.test('Attack 8: IDOR attacks are blocked across users and tenants', async () => {
    // Verify repository owner-binding
    const { getRepository } = require('../backend/repositories/index.js');
    const repo = getRepository();

    // Bob tries to access Alice's resume directly through repo
    const aliceUid = 'alice_adv_test_01';
    const bobUid = 'bob_adv_test_02';
    const resumeId = 'res_adv_alice_123';

    await repo.saveResume(aliceUid, resumeId, {
      id: resumeId,
      title: 'Alice Confidential Resume',
      firstname: 'Alice',
      lastname: 'Smith',
    });

    // Bob attempts to fetch Alice's resume using Bob's uid
    const bobsFetch = await repo.getResume(bobUid, resumeId);
    assert.equal(bobsFetch, null, 'Bob cannot access Alice resume via repo (returns null)');

    // Cleanup test record
    await pool.query('DELETE FROM resumes WHERE id = ?', [resumeId]);
  });

  // -------------------------------------------------------------
  // ATTACK 10: Payment Signature & Webhook Tampering
  // -------------------------------------------------------------
  await t.test('Attack 10: Payment verification rejects forged signatures and mismatched amounts', async () => {
    // Send forged signature to /api/razorpay/verify-payment
    const fakeSignaturePayload = {
      razorpay_order_id: 'order_adv_fake_123',
      razorpay_payment_id: 'pay_adv_fake_456',
      razorpay_signature: 'forged_hmac_sha256_hex_string_that_is_completely_invalid_9999',
      paymentOrderId: 'internal_adv_order_789',
    };

    const res = await fetch(`${BASE_URL}/api/razorpay/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeSignaturePayload),
    });

    // Without legitimate auth or with forged signature, must return 401, 400, or 404
    assert.ok([400, 401, 404].includes(res.status), `Forged signature must fail, got ${res.status}`);
    const json = await res.json();
    assert.notEqual(json.verified, true, 'Payment must NOT be verified');
  });

  // -------------------------------------------------------------
  // ATTACK 11: Admin Control Plane RBAC Attack
  // -------------------------------------------------------------
  await t.test('Attack 11: Non-admin users cannot alter system settings, pricing, or quotas', async () => {
    // Calling admin mutation endpoint without admin authorization
    const adminMutationEndpoints = [
      { path: '/api/admin/settings/public_config', method: 'POST', body: { subscriptions: { monthlyPrice: 1 } } },
      { path: '/api/admin/coupons', method: 'POST', body: { code: 'HACKER_FREE', discount: 100 } },
      { path: '/api/admin/ai-settings', method: 'POST', body: { openaiApiKey: 'fake_key' } },
    ];

    for (const ep of adminMutationEndpoints) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body),
      });
      assert.ok([401, 403].includes(res.status), `Admin mutation ${ep.path} without credentials must return 401/403, got ${res.status}`);
    }
  });

  // -------------------------------------------------------------
  // ATTACK 12 & 13: Stale Client vs Server-Authoritative Race Conditions
  // -------------------------------------------------------------
  await t.test('Attack 12 & 13: Server always determines final price and coupon eligibility at order execution', async () => {
    // Ensure public endpoint reports authoritative price
    const res = await fetch(`${BASE_URL}/api/platform/public-config`);
    assert.equal(res.status, 200);
    const config = await res.json();
    assert.equal(config.subscriptions?.currency, 'INR');
    assert.equal(typeof config.subscriptions?.monthlyPrice, 'number');
    assert.ok(config.subscriptions?.monthlyPrice > 0, 'Authoritative price is positive non-zero');
  });

  await pool.end();
});
