'use strict';

/**
 * Canonical payment activation workflow.
 *
 * Payment Provider → Webhook / Verification → Idempotency Check →
 * Canonical Payment Mutation → Write-authority engine → Membership update →
 * Outbox → Secondary.
 *
 * Never dual-writes in the request path. Never activates the same provider
 * event twice. A successful payment cannot silently leave membership unchanged:
 * if the membership write fails after the order is marked ACTIVE, a durable
 * recovery record is left so reconciliation can finish the job.
 */

const crypto = require('crypto');
const { createMutationId, toCanonicalDate, toCanonicalMembership, isPaidMembershipTier } = require('../database/canonical');
const { toCanonicalUser, isMembershipActive } = require('../database/domain');
const { calculateMembershipEnd, shouldReverseEntitlement } = require('../security/payments');
const { emitAlert, ALERT_TYPES } = require('../database/alerts');

const ACTIVATABLE = new Set(['PAYMENT_CREATED', 'PENDING_PAYMENT', 'PROVIDER_CONFIRMED']);
const webhookLedger = new Map();
const mutationLedger = new Map();

function monthsForPlan(planId) {
    if (planId === 'yearly') return 12;
    if (planId === 'halfYear') return 6;
    return 1;
}

function repoFor(firestoreDb, repo) {
    if (repo) return repo;
    // Lazy-require so unit tests can inject a fake repo without pulling mysql2.
    return require('../repositories').getRepository(firestoreDb || null);
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

async function getOrder(orderId, firestoreDb, repo) {
    const r = repoFor(firestoreDb, repo);
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

async function updateOrder(orderId, patch, firestoreDb, repo) {
    const r = repoFor(firestoreDb, repo);
    const existing = (await getOrder(orderId, firestoreDb, r)) || {};
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

async function applyServerCoupon({ uid, orderId, plan, couponCode, repo, firestoreDb }) {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code) return { ...plan, originalAmount: plan.amount, couponCode: null, couponDiscount: 0 };
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw fail('INVALID_COUPON', 400);
    const r = repoFor(firestoreDb, repo);
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

async function releaseCouponReservation(order, firestoreDb, repo) {
    if (!order?.couponCode || !order?.singleUsePerUser) return;
    const r = repoFor(firestoreDb, repo);
    if (typeof r.getCouponRedemption !== 'function') return;
    const redemptionId = redemptionIdFor(order.couponCode, order.uid);
    const existing = await r.getCouponRedemption(redemptionId);
    if (existing?.status === 'RESERVED' && existing.orderId === (order.id || order.orderId)) {
        await r.deleteCouponRedemption(redemptionId);
    }
}

async function consumeCouponRedemption(orderId, order, firestoreDb, repo) {
    if (!order?.couponCode) return;
    const r = repoFor(firestoreDb, repo);
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
    uid, planId, provider, couponCode, extra = {}, idempotencyKey, plan, firestoreDb, repo,
}) {
    const r = repoFor(firestoreDb, repo);
    if (!plan) throw fail('INVALID_PLAN', 400);
    const deterministicId = idempotencyKey
        ? crypto.createHash('sha256').update(`${uid}:${planId}:${String(couponCode || '').toUpperCase()}:${idempotencyKey}`).digest('hex')
        : newOrderId();

    const existing = await getOrder(deterministicId, firestoreDb, r);
    if (existing) {
        if (existing.uid !== uid || existing.planId !== planId || existing.provider !== provider) {
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

    const priced = await applyServerCoupon({ uid, orderId: deterministicId, plan, couponCode, repo: r, firestoreDb });
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
    mutationLedger.set(mutationId, { orderId: deterministicId, operation: 'CREATE' });
    return { id: deterministicId, orderId: deterministicId, plan: priced, ...record, replayed: false };
}

async function claimWebhookEvent({ eventId, provider, eventType, orderId, repo, firestoreDb }) {
    if (!eventId) throw fail('MISSING_EVENT_ID', 400);
    if (webhookLedger.has(eventId)) {
        return { duplicate: true, existing: webhookLedger.get(eventId) };
    }
    const record = {
        eventId,
        provider,
        eventType,
        orderId,
        claimedAt: new Date().toISOString(),
    };
    let r = repo || null;
    if (!r) {
        try { r = repoFor(firestoreDb || null, null); } catch { r = null; }
    }
    if (r && typeof r.claimWebhookEvent === 'function') {
        try {
            const durable = await r.claimWebhookEvent(record);
            if (durable?.duplicate) {
                webhookLedger.set(eventId, durable.existing || record);
                return { duplicate: true, existing: durable.existing || record };
            }
        } catch {
            // Durable ledger unavailable — process-local claim still prevents
            // in-process double activation. Multi-instance relies on the durable table.
        }
    }
    webhookLedger.set(eventId, record);
    return { duplicate: false, record };
}

function releaseWebhookEvent(eventId) {
    webhookLedger.delete(eventId);
}

async function activateVerifiedOrder({
    orderId, gatewayLabel, providerPaymentId, firestoreDb, repo, mutationId,
}) {
    const r = repoFor(firestoreDb, repo);
    const order = await getOrder(orderId, firestoreDb, r);
    if (!order) throw fail('ORDER_NOT_FOUND', 404);

    if (order.status === 'ACTIVE') {
        if (providerPaymentId && order.providerPaymentId && order.providerPaymentId !== providerPaymentId) {
            throw fail('PAYMENT_ID_CONFLICT', 409, 'Order already activated with a different provider payment id');
        }
        return {
            ...order,
            id: orderId,
            status: 'ACTIVE',
            membershipEnds: toCanonicalDate(order.membershipEnds) || order.membershipEnds,
            duplicate: true,
        };
    }
    if (!ACTIVATABLE.has(order.status)) {
        throw fail('INVALID_ORDER_STATE', 409);
    }

    const user = await r.getUser(order.uid);
    if (!user) throw fail('PAYMENT_USER_NOT_FOUND', 404);

    const months = monthsForPlan(order.planId);
    const membershipEndsDate = calculateMembershipEnd(user.membershipEnds, months);
    const membershipEnds = membershipEndsDate.toISOString();
    const currentMembership = toCanonicalMembership(user.membership);
    const nextMembership = isPaidMembershipTier(currentMembership) ? currentMembership : 'Premium';
    const payMutationId = mutationId || createMutationId('pay');

    if (mutationLedger.has(payMutationId)) {
        const replay = await getOrder(orderId, firestoreDb, r);
        return { ...replay, id: orderId, duplicate: true };
    }

    const nextOrderRevision = Number(order.revision || 0) + 1;
    const nextUserRevision = Number(user.revision || 0) + 1;

    let orderSaved = false;
    try {
        await r.savePaymentOrder(orderId, {
            ...order,
            status: 'ACTIVE',
            membershipEnds,
            providerPaymentId: providerPaymentId || order.providerPaymentId || null,
            lastPaymentGateway: gatewayLabel,
            activatedAt: new Date().toISOString(),
            revision: nextOrderRevision,
            mutationId: payMutationId,
        });
        orderSaved = true;

        await r.saveUser(order.uid, {
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            displayName: user.displayName,
            membership: nextMembership,
            membershipEnds,
            paymentStatus: 'ACTIVE',
            lastPaymentGateway: gatewayLabel,
            lastPaymentOrderId: orderId,
            cancellationRequested: false,
            autoRenew: true,
            revision: nextUserRevision,
        });
    } catch (err) {
        if (orderSaved) {
            emitAlert(ALERT_TYPES.PAYMENT_ACTIVATION_PARTIAL, {
                severity: 'HIGH',
                orderId,
                uid: order.uid,
                mutationId: payMutationId,
                message: 'Payment order ACTIVE but membership write failed; durable recovery required',
                reason: String(err.message || err).slice(0, 300),
            });
            await r.savePaymentOrder(orderId, {
                ...order,
                status: 'ACTIVE',
                membershipEnds,
                providerPaymentId: providerPaymentId || order.providerPaymentId || null,
                lastPaymentGateway: gatewayLabel,
                activatedAt: new Date().toISOString(),
                revision: nextOrderRevision,
                mutationId: payMutationId,
                recoveryNeeded: true,
                recoveryReason: 'MEMBERSHIP_WRITE_FAILED',
            }).catch(() => {});
        }
        throw err;
    }

    mutationLedger.set(payMutationId, { orderId, operation: 'ACTIVATE', uid: order.uid });

    if (typeof r.saveNotification === 'function') {
        const eventId = crypto.createHash('sha256').update(`payment_active\0${orderId}`).digest('hex');
        await r.saveNotification(order.uid, eventId, {
            eventId,
            type: 'payment_active',
            title: 'Payment confirmed',
            message: 'Your payment was confirmed and premium access is active.',
            data: { paymentOrderId: orderId, planId: order.planId },
            read: false,
            state: 'NOTIFICATION_CREATED',
        }).catch(() => {});
    }

    await consumeCouponRedemption(orderId, order, firestoreDb, r).catch(() => {});

    return {
        id: orderId,
        uid: order.uid,
        planId: order.planId,
        status: 'ACTIVE',
        membership: nextMembership,
        membershipEnds,
        providerPaymentId: providerPaymentId || order.providerPaymentId || null,
        revision: nextOrderRevision,
        mutationId: payMutationId,
        duplicate: false,
    };
}

async function reverseEntitlement({ orderId, status, firestoreDb, repo }) {
    const r = repoFor(firestoreDb, repo);
    const order = await getOrder(orderId, firestoreDb, r);
    if (!order) throw fail('ORDER_NOT_FOUND', 404);
    if (order.status === status) return { ...order, duplicate: true };

    await r.savePaymentOrder(orderId, {
        ...order,
        status,
        reversedAt: new Date().toISOString(),
        revision: Number(order.revision || 0) + 1,
    });

    const user = await r.getUser(order.uid);
    if (user && shouldReverseEntitlement(user, orderId)) {
        await r.saveUser(order.uid, {
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            displayName: user.displayName,
            membership: 'Basic',
            paymentStatus: status,
            autoRenew: false,
            membershipEnds: new Date().toISOString(),
            lastPaymentOrderId: user.lastPaymentOrderId,
            revision: Number(user.revision || 0) + 1,
        });
    }
    return { id: orderId, status, uid: order.uid };
}

async function findByProviderIntent(intentId, firestoreDb, repo) {
    const r = repoFor(firestoreDb, repo);
    if (typeof r.findPaymentOrderByProviderIntent === 'function') {
        return r.findPaymentOrderByProviderIntent(intentId);
    }
    return null;
}

function asOrderRef(orderId, firestoreDb, repo) {
    return {
        id: orderId,
        async get() {
            const order = await getOrder(orderId, firestoreDb, repo);
            return { exists: Boolean(order), id: orderId, data: () => order };
        },
        async update(patch) {
            return updateOrder(orderId, patch, firestoreDb, repo);
        },
    };
}

function __resetForTests() {
    webhookLedger.clear();
    mutationLedger.clear();
}

module.exports = {
    monthsForPlan,
    getOrder,
    updateOrder,
    createOrder,
    applyServerCoupon,
    releaseCouponReservation,
    consumeCouponRedemption,
    claimWebhookEvent,
    releaseWebhookEvent,
    activateVerifiedOrder,
    reverseEntitlement,
    findByProviderIntent,
    asOrderRef,
    isMembershipActive,
    toCanonicalUser,
    __resetForTests,
};
