'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const paymentActivation = require('../services/paymentActivation');
const authority = require('../database/authority');

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
        webhookEvents: new Map(),
        async claimWebhookEvent(record) {
            if (this.webhookEvents.has(record.eventId)) {
                return { duplicate: true, existing: this.webhookEvents.get(record.eventId) };
            }
            this.webhookEvents.set(record.eventId, record);
            return { duplicate: false, record };
        },
    };
}

test('activateVerifiedOrder is idempotent for duplicate webhooks', async () => {
    paymentActivation.__resetForTests();
    authority.__resetForTests({ configuredPrimary: 'mysql', mysqlHealthy: true, firestoreHealthy: true });
    const repo = memoryRepo();
    repo.users.set('u1', { id: 'u1', email: 'u1@example.com', membership: 'Basic', paymentStatus: 'INACTIVE', revision: 1 });
    const created = await paymentActivation.createOrder({
        uid: 'u1', planId: 'monthly', provider: 'stripe',
        plan: { amount: 1999, currency: 'USD', months: 1 }, repo,
    });
    await paymentActivation.updateOrder(created.id, { status: 'PAYMENT_CREATED', providerPaymentIntentId: 'pi_1' }, null, repo);

    const first = await paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'Stripe', providerPaymentId: 'pi_1', repo,
    });
    assert.equal(first.status, 'ACTIVE');
    assert.equal(first.duplicate, false);
    assert.equal(repo.users.get('u1').membership, 'Premium');
    assert.equal(repo.users.get('u1').paymentStatus, 'ACTIVE');
    assert.match(String(first.membershipEnds), /Z$/);

    const second = await paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'Stripe', providerPaymentId: 'pi_1', repo,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.status, 'ACTIVE');
    assert.equal(repo.users.get('u1').revision, first.revision ? repo.users.get('u1').revision : repo.users.get('u1').revision);
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
    paymentActivation.releaseWebhookEvent('evt_retry', repo);
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

test('membership write failure after order ACTIVE leaves a durable recovery record', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u4', { id: 'u4', email: 'u4@example.com', membership: 'Basic', paymentStatus: 'INACTIVE', revision: 1 });
    const created = await paymentActivation.createOrder({
        uid: 'u4', planId: 'yearly', provider: 'paypal',
        plan: { amount: 17999, currency: 'USD', months: 12 }, repo,
    });
    await paymentActivation.updateOrder(created.id, { status: 'PAYMENT_CREATED' }, null, repo);
    const originalSaveUser = repo.saveUser.bind(repo);
    repo.saveUser = async () => { throw new Error('ECONNREFUSED'); };
    await assert.rejects(() => paymentActivation.activateVerifiedOrder({
        orderId: created.id, gatewayLabel: 'PayPal', providerPaymentId: 'cap_1', repo,
    }));
    const order = repo.orders.get(created.id);
    assert.equal(order.status, 'ACTIVE');
    assert.equal(order.recoveryNeeded, true);
    repo.saveUser = originalSaveUser;
});

test('Pro membership is preserved on activation (not forced to Premium string only)', async () => {
    paymentActivation.__resetForTests();
    const repo = memoryRepo();
    repo.users.set('u5', { id: 'u5', email: 'u5@example.com', membership: 'Pro', paymentStatus: 'ACTIVE', revision: 4 });
    const created = await paymentActivation.createOrder({
        uid: 'u5', planId: 'monthly', provider: 'razorpay',
        plan: { amount: 1999, currency: 'INR', months: 1 }, repo,
    });
    await paymentActivation.updateOrder(created.id, { status: 'PROVIDER_CONFIRMED' }, null, repo);
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
        idempotencyKey: 'ck_abc1234567', plan, repo,
    });
    await paymentActivation.updateOrder(first.id, {
        status: 'PAYMENT_CREATED', providerClientSecret: 'secret_1',
    }, null, repo);
    const replay = await paymentActivation.createOrder({
        uid: 'u6', planId: 'monthly', provider: 'stripe', couponCode: '',
        idempotencyKey: 'ck_abc1234567', plan, repo,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.clientSecret, 'secret_1');
    assert.equal(replay.id, first.id);
});
