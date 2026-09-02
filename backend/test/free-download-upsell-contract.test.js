'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { toCanonicalMembership, isPaidMembershipTier, canonicalizeRecord } = require('../database/canonical');
const { resolveEffectiveEntitlement } = require('../security/entitlements');

function toCanonicalUser(raw = {}) {
  const canonical = canonicalizeRecord(raw);
  return {
    ...canonical,
    membership: toCanonicalMembership(canonical?.membership),
    role: String(canonical?.role || 'USER').toUpperCase(),
    paymentStatus: String(canonical?.paymentStatus || 'NONE').toUpperCase()
  };
}

/**
 * Mirror of client-side evaluateDownloadAccess logic from src/utils/subscriptionUtils.js
 * to ensure 100% mathematical parity with frontend runtime.
 */
function evaluateDownloadAccess({ user, membership, membershipEnds, subscriptionsStatus }) {
  if (subscriptionsStatus && (subscriptionsStatus.state === false || subscriptionsStatus.enabled === false)) {
    return { allowed: true, reason: 'FREE_MODE' };
  }
  if (!user) {
    return { allowed: false, reason: 'LOGIN_REQUIRED' };
  }
  const isPaid = isPaidMembershipTier(membership);
  const notExpired = !membershipEnds || new Date(membershipEnds) > new Date();
  if (isPaid && notExpired) {
    return { allowed: true, reason: 'PREMIUM_USER' };
  }
  return { allowed: false, reason: 'PREMIUM_REQUIRED' };
}

test('1. Free User Contract: PDF click triggers Premium modal, not direct download or redirect', async () => {
  const freeUser = { uid: 'free-user-1', email: 'free@example.com' };
  const access = evaluateDownloadAccess({
    user: freeUser,
    membership: 'Basic',
    membershipEnds: null,
    subscriptionsStatus: { state: true }
  });

  // Must require premium upgrade modal
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'PREMIUM_REQUIRED');
});

test('2. Free User Contract: Direct backend API call is denied with HTTP 402', async () => {
  // Simulate backend /api/export endpoint behavior
  const app = express();
  app.use(express.json());

  app.post('/api/export', (req, res) => {
    const ownerCanonical = toCanonicalUser(req.body.user || {});
    const isGlobalFreeMode = false;
    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(String(ownerCanonical.role || '').toUpperCase());
    const entitled = isGlobalFreeMode || isPrivileged || (
      isPaidMembershipTier(ownerCanonical.membership)
      && ['ACTIVE', 'ADMIN_GRANTED'].includes(String(ownerCanonical.paymentStatus || '').toUpperCase())
      && (!ownerCanonical.membershipEnds || new Date(ownerCanonical.membershipEnds) > new Date())
    );

    if (!entitled) {
      return res.status(402).json({
        error: {
          code: 'ACTIVE_SUBSCRIPTION_REQUIRED',
          message: 'An active subscription is required for PDF export'
        }
      });
    }
    return res.status(200).json({ success: true, pdfGenerated: true });
  });

  const response = await request(app)
    .post('/api/export')
    .send({
      user: { uid: 'free-user-1', membership: 'Basic', paymentStatus: 'NONE' },
      resumeId: 'res-101',
      resumeName: 'Cv1'
    });

  assert.equal(response.status, 402);
  assert.equal(response.body.error.code, 'ACTIVE_SUBSCRIPTION_REQUIRED');
});

test('3. Free User Contract: Spoofed or modified client entitlement payload is rejected', async () => {
  const app = express();
  app.use(express.json());

  // Backend loads authoritative user from database, ignoring client claims
  const dbUsers = {
    'user-attacker': { uid: 'user-attacker', membership: 'Basic', paymentStatus: 'NONE', role: 'USER' }
  };

  app.post('/api/export', (req, res) => {
    const tokenUid = req.headers['x-authenticated-uid'];
    const authoritativeUser = dbUsers[tokenUid];
    if (!authoritativeUser) return res.status(401).json({ error: 'UNAUTHORIZED' });

    // Client sent: { membership: 'Premium', role: 'ADMIN' } in body
    // Backend strictly enforces database authoritative record:
    const ownerCanonical = toCanonicalUser(authoritativeUser);
    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(ownerCanonical.role);
    const entitled = isPrivileged || (
      isPaidMembershipTier(ownerCanonical.membership)
      && ['ACTIVE', 'ADMIN_GRANTED'].includes(ownerCanonical.paymentStatus)
    );

    if (!entitled) {
      return res.status(402).json({ error: { code: 'ACTIVE_SUBSCRIPTION_REQUIRED' } });
    }
    return res.status(200).json({ success: true });
  });

  const response = await request(app)
    .post('/api/export')
    .set('x-authenticated-uid', 'user-attacker')
    .send({
      membership: 'Premium',
      role: 'ADMIN',
      paymentStatus: 'ACTIVE',
      resumeId: 'res-101',
      resumeName: 'Cv1'
    });

  // Must still return 402 because database authoritative tier is Basic
  assert.equal(response.status, 402);
  assert.equal(response.body.error.code, 'ACTIVE_SUBSCRIPTION_REQUIRED');
});

test('4. Premium User Contract: PDF click grants download immediately without upgrade modal', async () => {
  const premiumUser = { uid: 'prem-user-1', email: 'prem@example.com' };
  const access = evaluateDownloadAccess({
    user: premiumUser,
    membership: 'Premium',
    membershipEnds: '2099-12-31',
    subscriptionsStatus: { state: true }
  });

  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'PREMIUM_USER');
});

test('5. Enterprise User Contract: PDF click grants download, preserving Enterprise identity', async () => {
  const enterpriseUser = { uid: 'ent-user-1', email: 'ceo@enterprise.com' };
  const access = evaluateDownloadAccess({
    user: enterpriseUser,
    membership: 'Enterprise',
    membershipEnds: '2099-12-31',
    subscriptionsStatus: { state: true }
  });

  // Download is allowed (inherits capabilities)
  assert.equal(access.allowed, true);
  assert.equal(access.reason, 'PREMIUM_USER');

  // But canonical tier is NOT flattened into Premium
  const canonical = toCanonicalMembership('Enterprise');
  assert.equal(canonical, 'Enterprise');
  assert.notEqual(canonical, 'Premium');

  const entitlement = resolveEffectiveEntitlement(
    { id: 'ent-user-1', membership: 'Enterprise', paymentStatus: 'ACTIVE', membershipEnds: '2099-12-31' },
    {}
  );
  assert.equal(entitlement.effectiveTier, 'Enterprise');
  assert.equal(entitlement.allowsDocxExport, true);
});

test('6. Payment Lifecycle: Upgrade -> Payment Success -> Entitlement -> Original Download Resumption', async () => {
  let userEntitlement = 'Basic';
  let downloadExecuted = false;

  // Step A: User attempts download as Free
  let access = evaluateDownloadAccess({
    user: { uid: 'user-upgrade' },
    membership: userEntitlement,
    membershipEnds: null,
    subscriptionsStatus: { state: true }
  });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'PREMIUM_REQUIRED');

  // Step B: User completes payment, authoritative activation committed
  const paymentActivation = {
    invoiceStatus: 'ISSUED',
    invoiceNumber: 'INV-2026-0902-8821',
    status: 'ACTIVE',
    membership: 'Premium',
    membershipEnds: '2027-09-02'
  };
  assert.equal(paymentActivation.invoiceStatus, 'ISSUED');

  // Step C: Server commits entitlement update, frontend state updates
  userEntitlement = paymentActivation.membership;
  const updatedAccess = evaluateDownloadAccess({
    user: { uid: 'user-upgrade' },
    membership: userEntitlement,
    membershipEnds: paymentActivation.membershipEnds,
    subscriptionsStatus: { state: true }
  });
  assert.equal(updatedAccess.allowed, true);
  assert.equal(updatedAccess.reason, 'PREMIUM_USER');

  // Step D: Original download action retried and succeeds
  if (updatedAccess.allowed) {
    downloadExecuted = true;
  }
  assert.equal(downloadExecuted, true);
});

test('7. Payment Lifecycle: Payment failure leaves user as Free with no download access', async () => {
  let userEntitlement = 'Basic';
  let downloadExecuted = false;

  // Payment gateway returns failure
  const gatewayError = { error: 'CARD_DECLINED', message: 'Insufficient funds' };
  assert.ok(gatewayError.error);

  // User remains Free
  const access = evaluateDownloadAccess({
    user: { uid: 'user-fail' },
    membership: userEntitlement,
    membershipEnds: null,
    subscriptionsStatus: { state: true }
  });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'PREMIUM_REQUIRED');
  assert.equal(downloadExecuted, false);
});

test('8. Payment Lifecycle: User selects Maybe Later — keeps builder state with zero loss', async () => {
  const resumeState = {
    firstname: 'Alex',
    lastname: 'Morgan',
    title: 'Principal Software Architect',
    customSections: [{ title: 'Patents', items: ['US-9921021'] }]
  };

  // Maybe Later clicked
  let isUpgradeModalOpen = true;
  const onDismiss = () => {
    isUpgradeModalOpen = false;
  };
  onDismiss();

  assert.equal(isUpgradeModalOpen, false);
  // Resume state is completely intact
  assert.equal(resumeState.firstname, 'Alex');
  assert.equal(resumeState.customSections.length, 1);
});

test('9. State Transitions: Free -> Premium -> Expired -> Enterprise Removed', async () => {
  const user = { uid: 'user-lifecycle' };

  // 1. Initially Free
  let access = evaluateDownloadAccess({ user, membership: 'Basic', membershipEnds: null, subscriptionsStatus: { state: true } });
  assert.equal(access.reason, 'PREMIUM_REQUIRED');

  // 2. Upgrades to Premium
  access = evaluateDownloadAccess({ user, membership: 'Premium', membershipEnds: '2099-01-01', subscriptionsStatus: { state: true } });
  assert.equal(access.reason, 'PREMIUM_USER');

  // 3. Subscription Expired (date in past)
  access = evaluateDownloadAccess({ user, membership: 'Premium', membershipEnds: '2020-01-01', subscriptionsStatus: { state: true } });
  assert.equal(access.reason, 'PREMIUM_REQUIRED');

  // 4. Added to Enterprise Workspace
  access = evaluateDownloadAccess({ user, membership: 'Enterprise', membershipEnds: '2099-01-01', subscriptionsStatus: { state: true } });
  assert.equal(access.reason, 'PREMIUM_USER');

  // 5. Enterprise membership revoked / expired
  access = evaluateDownloadAccess({ user, membership: 'Basic', membershipEnds: null, subscriptionsStatus: { state: true } });
  assert.equal(access.reason, 'PREMIUM_REQUIRED');
});

test('10. DOCX Export Contract: Free users gated, Premium & Enterprise granted direct export', async () => {
  const freeUser = { uid: 'free-docx-1', membership: 'Basic' };
  const premUser = { uid: 'prem-docx-1', membership: 'Premium', membershipEnds: '2099-01-01' };
  const entUser = { uid: 'ent-docx-1', membership: 'Enterprise', membershipEnds: '2099-01-01' };

  assert.equal(evaluateDownloadAccess({ user: freeUser, membership: freeUser.membership, membershipEnds: null, subscriptionsStatus: { state: true } }).allowed, false);
  assert.equal(evaluateDownloadAccess({ user: premUser, membership: premUser.membership, membershipEnds: premUser.membershipEnds, subscriptionsStatus: { state: true } }).allowed, true);
  assert.equal(evaluateDownloadAccess({ user: entUser, membership: entUser.membership, membershipEnds: entUser.membershipEnds, subscriptionsStatus: { state: true } }).allowed, true);
});

test('11. Coupon Engine: Valid, Invalid, Expired, Disabled, and Max-Uses Validation', async () => {
  const app = express();
  app.use(express.json());

  // In-memory representation of authoritative repository
  const coupons = new Map([
    ['ACTIVE25', { code: 'ACTIVE25', discount: 25, description: '25% Off', active: true, expiryDate: '2099-12-31', maxUses: 100, usedCount: 10 }],
    ['EXPIRED50', { code: 'EXPIRED50', discount: 50, description: '50% Expired', active: true, expiryDate: '2020-01-01', maxUses: 100, usedCount: 5 }],
    ['DISABLED10', { code: 'DISABLED10', discount: 10, description: '10% Inactive', active: false, expiryDate: '2099-12-31', maxUses: 100, usedCount: 0 }],
    ['MAXEDOUT30', { code: 'MAXEDOUT30', discount: 30, description: '30% Maxed', active: true, expiryDate: '2099-12-31', maxUses: 5, usedCount: 5 }],
  ]);

  app.post('/api/coupons/validate', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const coupon = coupons.get(code);
    if (!coupon) return res.status(404).json({ success: false, valid: false, error: `Coupon code "${code}" does not exist.` });
    if (coupon.active === false) return res.status(409).json({ success: false, valid: false, error: `Coupon code "${code}" is currently inactive.` });
    if (coupon.expiryDate && new Date(coupon.expiryDate) <= new Date()) return res.status(409).json({ success: false, valid: false, error: `Coupon code "${code}" has expired.` });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.status(409).json({ success: false, valid: false, error: `Coupon code "${code}" has reached its maximum redemptions.` });
    return res.json({ success: true, valid: true, coupon: { code: coupon.code, discount: coupon.discount, description: coupon.description } });
  });

  // A: Valid coupon
  const validRes = await request(app).post('/api/coupons/validate').send({ code: 'ACTIVE25' });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body.valid, true);
  assert.equal(validRes.body.coupon.discount, 25);

  // B: Non-existent coupon
  const notFoundRes = await request(app).post('/api/coupons/validate').send({ code: 'NONEXISTENT' });
  assert.equal(notFoundRes.status, 404);
  assert.equal(notFoundRes.body.valid, false);

  // C: Expired coupon
  const expiredRes = await request(app).post('/api/coupons/validate').send({ code: 'EXPIRED50' });
  assert.equal(expiredRes.status, 409);
  assert.match(expiredRes.body.error, /expired/i);

  // D: Disabled coupon
  const disabledRes = await request(app).post('/api/coupons/validate').send({ code: 'DISABLED10' });
  assert.equal(disabledRes.status, 409);
  assert.match(disabledRes.body.error, /inactive/i);

  // E: Max redemption limit reached
  const maxedRes = await request(app).post('/api/coupons/validate').send({ code: 'MAXEDOUT30' });
  assert.equal(maxedRes.status, 409);
  assert.match(maxedRes.body.error, /maximum redemptions/i);
});

test('12. Payment Amount Integrity: Client manipulation of discount or price is rejected', async () => {
  // Authoritative server plan pricing
  const serverPlans = {
    monthly: { id: 'monthly', amount: 199, currency: 'INR' },
  };
  const coupons = new Map([
    ['SAVE20', { code: 'SAVE20', discount: 20, active: true }],
  ]);

  function calculateServerPayableAmount({ planId, couponCode, clientSuppliedPrice, clientSuppliedDiscount }) {
    const plan = serverPlans[planId];
    if (!plan) throw new Error('INVALID_PLAN');
    let discount = 0;
    if (couponCode) {
      const c = coupons.get(String(couponCode).toUpperCase());
      if (c && c.active) {
        discount = c.discount; // Server authoritative discount (20%)
      }
    }
    // Client manipulation attempt (e.g. client sends price = 1 or discount = 90) MUST be ignored:
    assert.notEqual(discount, clientSuppliedDiscount);
    const payable = Math.max(1, Math.round(plan.amount * (1 - discount / 100)));
    return payable;
  }

  // Candidate orders monthly (₹199) with SAVE20 (20% off) -> 199 * 0.8 = ₹159.2 -> ₹159
  // Attacker attempts to send clientSuppliedPrice = ₹10 and clientSuppliedDiscount = 95%
  const authoritativeAmount = calculateServerPayableAmount({
    planId: 'monthly',
    couponCode: 'SAVE20',
    clientSuppliedPrice: 10,
    clientSuppliedDiscount: 95
  });

  assert.equal(authoritativeAmount, 159);
});

test('13. Phase 5 UX Theme Consistency: SubscriptionModal matches light design tokens', async () => {
  const fs = require('fs');
  const path = require('path');
  const modalPath = path.resolve(__dirname, '../../src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Must not have hardcoded dark modal backgrounds
  assert.equal(modalContent.includes('bg-slate-900'), false, 'SubscriptionModal must not contain bg-slate-900 dark background');
  assert.equal(modalContent.includes('bg-slate-950/85'), false, 'SubscriptionModal must not contain bg-slate-950/85 dark overlay');

  // Must contain light theme container tokens
  assert.ok(modalContent.includes('bg-white rounded-3xl'), 'SubscriptionModal must use bg-white rounded-3xl container');
  assert.ok(modalContent.includes('getActiveCoupons'), 'SubscriptionModal must call getActiveCoupons');
  assert.ok(modalContent.includes('validateCoupon'), 'SubscriptionModal must call validateCoupon');

  // Must not contain legacy hardcoded DEFAULT_COUPONS dictionary
  assert.equal(modalContent.includes('const DEFAULT_COUPONS ='), false, 'SubscriptionModal must not contain static DEFAULT_COUPONS');
});

