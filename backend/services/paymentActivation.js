'use strict';

/**
 * Canonical payment activation workflow.
 *
 * Payment Provider → Webhook / Verification → Idempotency Check →
 * Canonical Payment Mutation → MariaDB transaction → membership update → durable notification.
 *
 * Never dual-writes in the request path. Never activates the same provider
 * event twice. A successful payment cannot silently leave membership unchanged:
 * if the membership write fails after the order is marked ACTIVE, a durable
 * recovery record is left so reconciliation can finish the job.
 */

const crypto = require('crypto');
const { createMutationId, toCanonicalDate } = require('../database/canonical');
const { toCanonicalUser, isMembershipActive } = require('../database/domain');

function repoFor(repo) {
    // Lazy require lets unit tests inject a repository without initializing a pool.
    return repo || require('../repositories').getRepository();
}

function fail(code, status = 400, message) {
    const err = new Error(message || code);
    err.code = code;
    err.status = status;
    return err;
}

function newOrderId() {
    return crypto.randomBytes(16).toString('hex');
}

function redemptionIdFor(couponCode, scope) {
    return crypto.createHash('sha256').update(`${couponCode}:${scope}`).digest('hex');
}

async function getOrder(orderId, repo) {
    const r = repoFor(repo);
    if (typeof r.getPaymentOrder !== 'function') return null;
    return r.getPaymentOrder(orderId);
}

function stripSentinels(value) {
    if (!value || typeof value !== 'object') return value;
    if (typeof value.toDate === 'function' || value._methodName || value._delegate) return new Date().toISOString();
    if (Array.isArray(value)) return value.map(stripSentinels);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        out[k] = stripSentinels(v);
    }
    return out;
}

async function updateOrder(orderId, patch, repo) {
    const r = repoFor(repo);
    const existing = (await getOrder(orderId, r)) || {};
    const cleanPatch = stripSentinels(patch || {});
    const next = {
        ...existing,
        ...cleanPatch,
        id: orderId,
        revision: Number(existing.revision || cleanPatch.revision || 0) + (cleanPatch.revision ? 0 : 1),
        updatedAt: new Date().toISOString(),
    };
    return r.savePaymentOrder(orderId, next);
}

async function applyServerCoupon({ uid, orderId, plan, couponCode, repo }) {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code) return { ...plan, originalAmount: plan.amount, couponCode: null, couponDiscount: 0 };
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw fail('INVALID_COUPON', 400);
    const r = repoFor(repo);
    if (typeof r.getCoupon !== 'function') throw fail('INVALID_COUPON', 400);
    const coupon = await r.getCoupon(code);
    if (!coupon) throw fail('INVALID_COUPON', 400);
    const expiryMs = coupon.expiryDate ? Date.parse(toCanonicalDate(coupon.expiryDate) || 0) : 0;
    const discount = Number(coupon.discount || 0);
    if (coupon.active === false || !Number.isFinite(discount) || discount <= 0 || discount > 100
        || (coupon.expiryDate && expiryMs <= Date.now())
        || (Number(coupon.maxUses || 0) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.maxUses))) {
        throw fail('COUPON_UNAVAILABLE', 409);
    }
    if (coupon.singleUsePerUser && typeof r.getCouponRedemption === 'function') {
        const redemptionId = redemptionIdFor(code, uid);
        const existing = await r.getCouponRedemption(redemptionId);
        const activeReservation = existing?.status === 'RESERVED'
            && Number(existing.expiresAt || 0) > Date.now()
            && existing.orderId !== orderId;
        if (existing?.status === 'USED' || activeReservation) throw fail('COUPON_ALREADY_REDEEMED', 409);
        await r.saveCouponRedemption(redemptionId, {
            uid, couponCode: code, orderId, status: 'RESERVED',
            expiresAt: Date.now() + 30 * 60 * 1000,
        });
    }
    const discountedAmount = Math.max(1, Math.round(plan.amount * (100 - discount) / 100));
    return {
        ...plan,
        amount: discountedAmount,
        originalAmount: plan.amount,
        couponCode: code,
        couponDiscount: discount,
        singleUsePerUser: coupon.singleUsePerUser === true,
    };
}

async function releaseCouponReservation(order, repo) {
    if (!order?.couponCode || !order?.singleUsePerUser) return;
    const r = repoFor(repo);
    if (typeof r.getCouponRedemption !== 'function') return;
    const redemptionId = redemptionIdFor(order.couponCode, order.uid);
    const existing = await r.getCouponRedemption(redemptionId);
    if (existing?.status === 'RESERVED' && existing.orderId === (order.id || order.orderId)) {
        await r.deleteCouponRedemption(redemptionId);
    }
}

async function consumeCouponRedemption(orderId, order, repo) {
    if (!order?.couponCode) return;
    const r = repoFor(repo);
    if (typeof r.getCoupon !== 'function') return;
    const coupon = await r.getCoupon(order.couponCode);
    if (!coupon) return;
    const redemptionScope = order.singleUsePerUser ? order.uid : orderId;
    const redemptionId = redemptionIdFor(order.couponCode, redemptionScope);
    const existing = typeof r.getCouponRedemption === 'function' ? await r.getCouponRedemption(redemptionId) : null;
    if (existing?.status === 'USED') return;
    if (typeof r.saveCouponRedemption === 'function') {
        await r.saveCouponRedemption(redemptionId, {
            uid: order.uid, couponCode: order.couponCode, orderId, status: 'USED',
            usedAt: new Date().toISOString(),
        });
    }
    await r.saveCoupon(order.couponCode, {
        ...coupon,
        usedCount: Number(coupon.usedCount || 0) + 1,
        revision: Number(coupon.revision || 0) + 1,
    });
}

async function createOrder({
    uid, planId, provider, couponCode, extra = {}, idempotencyKey, plan, repo,
}) {
    const r = repoFor(repo);
    if (!plan) throw fail('INVALID_PLAN', 400);
    if (Number(extra.billingSnapshotVersion) !== 1
        || !/^[a-f0-9]{64}$/.test(String(extra.billingSnapshotHash || ''))
        || !extra.billingSnapshot || typeof extra.billingSnapshot !== 'object'
        || !extra.supplierSnapshot || typeof extra.supplierSnapshot !== 'object') {
        throw fail('BILLING_SNAPSHOT_REQUIRED', 400, 'Valid billing details must be captured before payment creation');
    }
    const deterministicId = idempotencyKey
        ? crypto.createHash('sha256').update(`${uid}:${planId}:${String(couponCode || '').toUpperCase()}:${idempotencyKey}`).digest('hex')
        : newOrderId();

    const existing = await getOrder(deterministicId, r);
    if (existing) {
        if (existing.uid !== uid || existing.planId !== planId || existing.provider !== provider
            || existing.billingSnapshotHash !== extra.billingSnapshotHash) {
            throw fail('IDEMPOTENCY_CONFLICT', 409);
        }
        if (existing.status === 'PAYMENT_CREATED' && existing.providerClientSecret) {
            return {
                id: deterministicId,
                orderId: deterministicId,
                replayed: true,
                clientSecret: existing.providerClientSecret,
                amount: existing.amount,
                currency: existing.currency,
                planId: existing.planId,
                status: existing.status,
            };
        }
        if (existing.status === 'ACTIVE') {
            return { id: deterministicId, orderId: deterministicId, replayed: true, ...existing };
        }
        throw fail('PAYMENT_CREATION_IN_PROGRESS', 409);
    }

    const priced = await applyServerCoupon({ uid, orderId: deterministicId, plan, couponCode, repo: r });
    const mutationId = createMutationId('pay');
    const record = {
        id: deterministicId,
        uid,
        planId,
        provider,
        amount: priced.amount,
        originalAmount: priced.originalAmount,
        currency: priced.currency,
        couponCode: priced.couponCode,
        couponDiscount: priced.couponDiscount,
        singleUsePerUser: priced.singleUsePerUser === true,
        status: 'PENDING_PAYMENT',
        revision: 1,
        mutationId,
        createdAt: new Date().toISOString(),
        ...extra,
    };
    await r.savePaymentOrder(deterministicId, record);
    return { id: deterministicId, orderId: deterministicId, plan: priced, ...record, replayed: false };
}

async function claimWebhookEvent({ eventId, provider, eventType, orderId, repo }) {
    if (!eventId) throw fail('MISSING_EVENT_ID', 400);
    const r = repoFor(repo);
    if (typeof r.claimWebhookEvent !== 'function') {
        throw fail('DURABLE_WEBHOOK_LEDGER_UNAVAILABLE', 503, 'The durable webhook idempotency ledger is unavailable');
    }
    const record = { eventId, provider, eventType, orderId, claimedAt: new Date().toISOString() };
    return r.claimWebhookEvent(record);
}

async function releaseWebhookEvent(eventId, repo) {
    const r = repoFor(repo);
    if (typeof r.deleteWebhookEvent !== 'function') {
        throw fail('DURABLE_WEBHOOK_RELEASE_UNAVAILABLE', 503, 'The durable webhook claim could not be released');
    }
    return r.deleteWebhookEvent(eventId);
}

async function activateVerifiedOrder({
    orderId, gatewayLabel, providerPaymentId, repo, mutationId,
}) {
    const r = repoFor(repo);
    if (typeof r.activatePaymentOrderAtomic !== 'function') {
        throw fail('ATOMIC_PAYMENT_ACTIVATION_UNAVAILABLE', 503, 'The atomic payment activation adapter is unavailable');
    }
    // The repository derives the entitlement duration from the locked order row
    // and commits payment, membership, coupon, notification, and audit writes in
    // one MariaDB transaction. There is deliberately no non-atomic fallback.
    return r.activatePaymentOrderAtomic({
        orderId,
        gatewayLabel,
        providerPaymentId,
        mutationId: mutationId || createMutationId('pay'),
    });
}

async function claimRefund({ orderId, actorUid, reason, repo }) {
    const r = repoFor(repo);
    if (typeof r.claimPaymentRefundAtomic !== 'function') {
        throw fail('ATOMIC_REFUND_CLAIM_UNAVAILABLE', 503, 'The atomic refund claim adapter is unavailable');
    }
    return r.claimPaymentRefundAtomic({ orderId, actorUid, reason });
}

async function recordRefundSubmitted({
    orderId,
    claimId,
    providerRefundId,
    providerRefundStatus,
    providerRefundReferenceType = 'PROVIDER',
    providerRefunds = [],
    repo,
}) {
    const r = repoFor(repo);
    if (typeof r.recordPaymentRefundSubmittedAtomic !== 'function') {
        throw fail('ATOMIC_REFUND_SUBMISSION_UNAVAILABLE', 503, 'The atomic refund submission adapter is unavailable');
    }
    return r.recordPaymentRefundSubmittedAtomic({
        orderId,
        claimId,
        providerRefundId,
        providerRefundStatus,
        providerRefundReferenceType,
        providerRefunds,
    });
}

async function releaseRefundClaim({ orderId, claimId, failureCode, restoreActive = false, providerFailureConfirmed = false, repo }) {
    const r = repoFor(repo);
    if (typeof r.releasePaymentRefundClaimAtomic !== 'function') {
        throw fail('ATOMIC_REFUND_RELEASE_UNAVAILABLE', 503, 'The atomic refund release adapter is unavailable');
    }
    return r.releasePaymentRefundClaimAtomic({ orderId, claimId, failureCode, restoreActive, providerFailureConfirmed });
}

async function reverseEntitlement({
    orderId,
    status,
    expectedRefundClaimId = null,
    providerRefundId = null,
    providerRefundReferenceType = 'PROVIDER',
    providerRefunds = [],
    repo,
}) {
    const r = repoFor(repo);
    if (typeof r.reversePaymentEntitlementAtomic !== 'function') {
        throw fail('ATOMIC_PAYMENT_REVERSAL_UNAVAILABLE', 503, 'The atomic payment reversal adapter is unavailable');
    }
    // Reversal, provider-reference ledger, entitlement, credit note, and
    // notifications commit under the same MariaDB transaction.
    return r.reversePaymentEntitlementAtomic({
        orderId,
        status,
        expectedRefundClaimId,
        providerRefundId,
        providerRefundReferenceType,
        providerRefunds,
    });
}

async function findByProviderIntent(intentId, repo) {
    const r = repoFor(repo);
    if (typeof r.findPaymentOrderByProviderIntent === 'function') {
        return r.findPaymentOrderByProviderIntent(intentId);
    }
    return null;
}

function asOrderRef(orderId, repo) {
    return {
        id: orderId,
        async get() {
            const order = await getOrder(orderId, repo);
            return { exists: Boolean(order), id: orderId, data: () => order };
        },
        async update(patch) {
            return updateOrder(orderId, patch, repo);
        },
    };
}

function __resetForTests() {
}

module.exports = {
    getOrder,
    updateOrder,
    createOrder,
    applyServerCoupon,
    releaseCouponReservation,
    consumeCouponRedemption,
    claimWebhookEvent,
    releaseWebhookEvent,
    activateVerifiedOrder,
    claimRefund,
    recordRefundSubmitted,
    releaseRefundClaim,
    reverseEntitlement,
    findByProviderIntent,
    asOrderRef,
    isMembershipActive,
    toCanonicalUser,
    __resetForTests,
};
