'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const paymentActivation = require('../services/paymentActivation');

function billingExtra(email = 'customer@example.test') {
    return {
        billingSnapshot: { name: 'Customer', email },
        supplierSnapshot: { legalName: 'Supplier' },
        billingSnapshotHash: 'a'.repeat(64),
        billingSnapshotVersion: 1,
    };
}

function memoryRepo() {
    const users = new Map();
    const orders = new Map();
    const coupons = new Map();
    const redemptions = new Map();
    const notifications = [];
    const outbox = [];
    return {
        users, orders, coupons, redemptions, notifications, outbox,
        async getUser(id) { return users.get(id) || null; },
        async saveUser(id, data) {
            const rec = { id, revision: Number(data.revision || (users.get(id)?.revision || 0) + 1), ...data };
            users.set(id, rec);
            outbox.push({ entityType: 'users', entityId: id, operation: 'UPSERT', version: rec.revision });
            return rec;
        },
        async getPaymentOrder(id) { return orders.get(id) || null; },
        async savePaymentOrder(id, data) {
            const rec = { id, revision: Number(data.revision || (orders.get(id)?.revision || 0) + 1), ...data };
            orders.set(id, rec);
            outbox.push({ entityType: 'payment_orders', entityId: id, operation: 'UPSERT', version: rec.revision });
            return rec;
        },
        async findPaymentOrderByProviderIntent(intentId) {
            for (const order of orders.values()) {
                if (order.providerPaymentIntentId === intentId) return order;
            }
            return null;
        },
        async getCoupon(code) { return coupons.get(String(code).toUpperCase()) || null; },
        async saveCoupon(code, data) {
            const rec = { code: String(code).toUpperCase(), ...data };
            coupons.set(rec.code, rec);
            return rec;
        },
        async getCouponRedemption(id) { return redemptions.get(id) || null; },
        async saveCouponRedemption(id, data) { redemptions.set(id, { id, ...data }); return redemptions.get(id); },
        async deleteCouponRedemption(id) { redemptions.delete(id); return true; },
        async saveNotification(uid, id, data) { notifications.push({ uid, id, ...data }); return { id, ...data }; },
        async activatePaymentOrderAtomic({ orderId, gatewayLabel, providerPaymentId, mutationId }) {
            const order = orders.get(orderId);
            if (!order) throw Object.assign(new Error('Payment order not found'), { code: 'ORDER_NOT_FOUND', status: 404 });
            if (order.status === 'ACTIVE') {
                if (providerPaymentId && order.providerPaymentId && providerPaymentId !== order.providerPaymentId) {
                    throw Object.assign(new Error('Provider payment id conflict'), { code: 'PAYMENT_ID_CONFLICT', status: 409 });
                }
                return { ...order, duplicate: true };
            }
            if (!['PAYMENT_CREATED', 'PENDING_PAYMENT', 'PROVIDER_CONFIRMED'].includes(order.status)) {
                throw Object.assign(new Error('Payment order is not activatable'), { code: 'INVALID_ORDER_STATE', status: 409 });
            }
            const user = users.get(order.uid);
            if (!user) throw Object.assign(new Error('Payment user not found'), { code: 'PAYMENT_USER_NOT_FOUND', status: 404 });
            const orderBefore = { ...order };
            const userBefore = { ...user };
            const outboxLength = outbox.length;
            const notificationLength = notifications.length;
            try {
                const months = { monthly: 1, halfYear: 6, yearly: 12 }[order.planId];
                if (!months) throw Object.assign(new Error('Unsupported plan'), { code: 'INVALID_PLAN_DURATION', status: 409 });
                const existingEnd = Date.parse(user.membershipEnds || '');
                const end = new Date(Number.isFinite(existingEnd) && existingEnd > Date.now() ? existingEnd : Date.now());
                end.setMonth(end.getMonth() + months);
                const membershipEnds = end.toISOString();
                const membership = ['premium', 'pro', 'business', 'enterprise', 'paid'].includes(String(user.membership || '').toLowerCase()) ? user.membership : 'Premium';
                const nextOrder = await this.savePaymentOrder(orderId, {
                    ...order,
                    status: 'ACTIVE',
                    membershipEnds,
                    providerPaymentId: providerPaymentId || order.providerPaymentId || null,
                    lastPaymentGateway: gatewayLabel,
                    mutationId,
                    revision: Number(order.revision || 0) + 1,
                });
                await this.saveUser(order.uid, {
                    ...user,
                    membership,
                    membershipEnds,
                    paymentStatus: 'ACTIVE',
                    lastPaymentGateway: gatewayLabel,
                    lastPaymentOrderId: orderId,
                    revision: Number(user.revision || 0) + 1,
                });
                await this.saveNotification(order.uid, `payment:${orderId}`, { type: 'payment_active' });
                return { ...nextOrder, membership, duplicate: false };
            } catch (error) {
                orders.set(orderId, orderBefore);
                users.set(order.uid, userBefore);
                outbox.length = outboxLength;
                notifications.length = notificationLength;
                throw error;
            }
        },
        async reversePaymentEntitlementAtomic({ orderId, status }) {
            const order = orders.get(orderId);
            if (!order) throw Object.assign(new Error('Payment order not found'), { code: 'ORDER_NOT_FOUND', status: 404 });
            if (order.status === status) return { ...order, duplicate: true };
            const user = users.get(order.uid);
            const orderBefore = { ...order };
            const userBefore = user ? { ...user } : null;
            const outboxLength = outbox.length;
            try {
                await this.savePaymentOrder(orderId, { ...order, status, revision: Number(order.revision || 0) + 1 });
                if (user?.lastPaymentOrderId === orderId) {
                    await this.saveUser(order.uid, {
                        ...user,
                        membership: 'Basic',
                        paymentStatus: status,
                        membershipEnds: new Date().toISOString(),
                        revision: Number(user.revision || 0) + 1,
                    });
                }
                return { id: orderId, uid: order.uid, status, duplicate: false };
            } catch (error) {
                orders.set(orderId, orderBefore);
                if (userBefore) users.set(order.uid, userBefore);
                outbox.length = outboxLength;
                throw error;
            }
        },
        webhookEvents: new Map(),
        async claimWebhookEvent(record) {
            if (this.webhookEvents.has(record.eventId)) {
                return { duplicate: true, existing: this.webhookEvents.get(record.eventId) };
            }
            this.webhookEvents.set(record.eventId, record);
            return { duplicate: false, record };
        },
        async deleteWebhookEvent(eventId) {
            this.webhookEvents.delete(eventId);
        },
    };
}

test('activateVerifiedOrder is idempotent for duplicate webhooks', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u1', { id: 'u1', email: 'u1@example.com', membership: 'Basic', paymentStatus: 'INACTIVE', revision: 1 });
    const created = await paymentActivation.createOrder({
        uid: 'u1', planId: 'monthly', provider: 'stripe',
        plan: { amount: 1999, currency: 'USD', months: 1 }, repo,
        extra: billingExtra('u1@example.com'),
    });
    await paymentActivation.updateOrder(created.id, { status: 'PAYMENT_CREATED', providerPaymentIntentId: 'pi_1' }, repo);

    const first = await paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'Stripe', providerPaymentId: 'pi_1', repo,
    });
    assert.equal(first.status, 'ACTIVE');
    assert.equal(first.duplicate, false);
    assert.equal(repo.users.get('u1').membership, 'Premium');
    assert.equal(repo.users.get('u1').paymentStatus, 'ACTIVE');
    assert.match(String(first.membershipEnds), /Z$/);

    const userRevisionAfterFirstActivation = repo.users.get('u1').revision;
    const second = await paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'Stripe', providerPaymentId: 'pi_1', repo,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.status, 'ACTIVE');
    assert.equal(repo.users.get('u1').revision, userRevisionAfterFirstActivation);
    assert.equal(repo.notifications.length, 1);
});

test('duplicate provider event claim is a no-op', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    const a = await paymentActivation.claimWebhookEvent({ eventId: 'evt_1', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'o1', repo });
    const b = await paymentActivation.claimWebhookEvent({ eventId: 'evt_1', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'o1', repo });
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
});

test('webhook claim is released so a failed activation can retry', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    await paymentActivation.claimWebhookEvent({ eventId: 'evt_retry', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'o2', repo });
    await paymentActivation.releaseWebhookEvent('evt_retry', repo);
    const again = await paymentActivation.claimWebhookEvent({ eventId: 'evt_retry', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'o2', repo });
    assert.equal(again.duplicate, false);
});

test('conflicting providerPaymentId on an ACTIVE order is refused', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u2', { id: 'u2', email: 'u2@example.com', membership: 'Premium', paymentStatus: 'ACTIVE', revision: 2 });
    repo.orders.set('ord-active', {
        id: 'ord-active', uid: 'u2', planId: 'monthly', provider: 'stripe',
        status: 'ACTIVE', providerPaymentId: 'pi_original', membershipEnds: '2026-12-01T00:00:00.000Z', revision: 2,
    });
    await assert.rejects(
        () => paymentActivation.activateVerifiedOrder({
            orderId: 'ord-active', gatewayLabel: 'Stripe', providerPaymentId: 'pi_other', repo,
        }),
        (err) => err.code === 'PAYMENT_ID_CONFLICT' || err.status === 409
    );
});

test('refund of latest order reverses entitlement; older order does not', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u3', {
        id: 'u3', email: 'u3@example.com', membership: 'Premium', paymentStatus: 'ACTIVE',
        lastPaymentOrderId: 'latest', membershipEnds: '2026-12-01T00:00:00.000Z', revision: 3,
    });
    repo.orders.set('old', { id: 'old', uid: 'u3', status: 'ACTIVE', planId: 'monthly', provider: 'stripe', revision: 1 });
    repo.orders.set('latest', { id: 'latest', uid: 'u3', status: 'ACTIVE', planId: 'monthly', provider: 'stripe', revision: 2 });

    await paymentActivation.reverseEntitlement({ orderId: 'old', status: 'REFUNDED', repo });
    assert.equal(repo.users.get('u3').membership, 'Premium');

    await paymentActivation.reverseEntitlement({ orderId: 'latest', status: 'REFUNDED', repo });
    assert.equal(repo.users.get('u3').membership, 'Basic');
    assert.equal(repo.users.get('u3').paymentStatus, 'REFUNDED');
});

test('membership write failure rolls back the atomic payment activation', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u4', { id: 'u4', email: 'u4@example.com', membership: 'Basic', paymentStatus: 'INACTIVE', revision: 1 });
    const created = await paymentActivation.createOrder({
        uid: 'u4', planId: 'yearly', provider: 'paypal',
        plan: { amount: 17999, currency: 'USD', months: 12 }, repo,
        extra: billingExtra('u4@example.com'),
    });
    await paymentActivation.updateOrder(created.id, { status: 'PAYMENT_CREATED' }, repo);
    const originalSaveUser = repo.saveUser.bind(repo);
    repo.saveUser = async () => { throw new Error('ECONNREFUSED'); };
    await assert.rejects(() => paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'PayPal', providerPaymentId: 'cap_1', repo,
    }));
    const order = repo.orders.get(created.id);
    assert.equal(order.status, 'PAYMENT_CREATED');
    assert.notEqual(order.recoveryNeeded, true);
    assert.equal(repo.users.get('u4').membership, 'Basic');
    repo.saveUser = originalSaveUser;
});

test('Pro membership is preserved on activation (not forced to Premium string only)', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u5', { id: 'u5', email: 'u5@example.com', membership: 'Pro', paymentStatus: 'ACTIVE', revision: 4 });
    const created = await paymentActivation.createOrder({
        uid: 'u5', planId: 'monthly', provider: 'razorpay',
        plan: { amount: 1999, currency: 'INR', months: 1 }, repo,
        extra: billingExtra('u5@example.com'),
    });
    await paymentActivation.updateOrder(created.id, { status: 'PROVIDER_CONFIRMED' }, repo);
    const activated = await paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'Razorpay', providerPaymentId: 'pay_1', repo,
    });
    assert.equal(activated.membership, 'Pro');
    assert.equal(repo.users.get('u5').membership, 'Pro');
});

test('durable webhook ledger is consulted before in-memory claim', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    await repo.claimWebhookEvent({ eventId: 'evt_durable', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'o9' });
    const claimed = await paymentActivation.claimWebhookEvent({
        eventId: 'evt_durable', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'o9', repo,
    });
    assert.equal(claimed.duplicate, true);
});

test('createOrder idempotency key replays PAYMENT_CREATED client secret', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    const plan = { amount: 1999, currency: 'USD', months: 1 };
    const first = await paymentActivation.createOrder({
        uid: 'u6', planId: 'monthly', provider: 'stripe', couponCode: '',
        idempotencyKey: 'ck_abc1234567', plan, repo, extra: billingExtra('u6@example.com'),
    });
    await paymentActivation.updateOrder(first.id, {
        status: 'PAYMENT_CREATED', providerClientSecret: 'secret_1',
    }, repo);
    const replay = await paymentActivation.createOrder({
        uid: 'u6', planId: 'monthly', provider: 'stripe', couponCode: '',
        idempotencyKey: 'ck_abc1234567', plan, repo, extra: billingExtra('u6@example.com'),
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.clientSecret, 'secret_1');
    assert.equal(replay.id, first.id);
});

test('createOrder refuses provider contact without versioned immutable billing evidence', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    await assert.rejects(
        () => paymentActivation.createOrder({
            uid: 'u7', planId: 'monthly', provider: 'stripe',
            plan: { amount: 1999, currency: 'INR', months: 1 }, repo,
        }),
        error => error.code === 'BILLING_SNAPSHOT_REQUIRED' && error.status === 400
    );
    assert.equal(repo.orders.size, 0);
});

test('same idempotency key cannot be replayed with changed legal billing evidence', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    const request = {
        uid: 'u8', planId: 'monthly', provider: 'stripe', couponCode: '',
        idempotencyKey: 'ck_snapshot12345',
        plan: { amount: 1999, currency: 'INR', months: 1 }, repo,
    };
    const first = await paymentActivation.createOrder({ ...request, extra: billingExtra('first@example.com') });
    assert.equal(repo.orders.get(first.id).billingSnapshotVersion, 1);
    await assert.rejects(
        () => paymentActivation.createOrder({
            ...request,
            extra: { ...billingExtra('second@example.com'), billingSnapshotHash: 'b'.repeat(64) },
        }),
        error => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409
    );
    assert.equal(repo.orders.size, 1);
});
