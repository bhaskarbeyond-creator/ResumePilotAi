'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildStripeRefundReconciliation,
    listStripeRefunds,
    reconcileStripeChargeRefund,
} = require('../services/refundReferences');

const order = Object.freeze({
    amount: 10000,
    currency: 'INR',
    providerPaymentIntentId: 'pi_123456',
});

function refund(id, amount, overrides = {}) {
    return {
        id,
        amount,
        currency: 'inr',
        status: 'succeeded',
        payment_intent: 'pi_123456',
        charge: 'ch_123456',
        ...overrides,
    };
}

function charge(overrides = {}) {
    return {
        id: 'ch_123456',
        payment_intent: 'pi_123456',
        amount: 10000,
        amount_refunded: 10000,
        currency: 'inr',
        refunded: true,
        ...overrides,
    };
}

function stripeClientWithPages(pages, calls = []) {
    return {
        refunds: {
            async list(options) {
                calls.push(options);
                return pages[calls.length - 1];
            },
        },
    };
}

test('Stripe refund pagination follows has_more and cursor evidence exactly once per page', async () => {
    const calls = [];
    const rows = await listStripeRefunds(stripeClientWithPages([
        { data: [refund('re_page_000001', 3000), refund('re_page_000002', 2000)], has_more: true },
        { data: [refund('re_page_000003', 5000)], has_more: false },
    ], calls), 'ch_123456');
    assert.deepEqual(calls, [
        { charge: 'ch_123456', limit: 100 },
        { charge: 'ch_123456', limit: 100, starting_after: 're_page_000002' },
    ]);
    assert.deepEqual(rows.map(row => row.id), ['re_page_000001', 're_page_000002', 're_page_000003']);
});

test('single completed full Stripe refund retains its provider reference', async () => {
    const result = await reconcileStripeChargeRefund({
        charge: charge(),
        order,
        stripeClient: stripeClientWithPages([
            { data: [refund('re_full_123456', 10000)], has_more: false },
        ]),
    });
    assert.equal(result.referenceType, 'PROVIDER');
    assert.equal(result.refundReference, 're_full_123456');
    assert.equal(result.refunds.length, 1);
    assert.equal(result.totalAmount, 10000);
    assert.equal(result.currency, 'INR');
});

test('multiple completed Stripe refunds receive an order-bound deterministic aggregate reference and retain every child', async () => {
    const children = [refund('re_partial_bbbbb', 7000), refund('re_partial_aaaaa', 3000)];
    const first = buildStripeRefundReconciliation(order, children, { chargeId: 'ch_123456' });
    const replay = buildStripeRefundReconciliation(order, [...children].reverse(), { chargeId: 'ch_123456' });
    assert.equal(first.referenceType, 'AGGREGATE');
    assert.match(first.refundReference, /^stripe_aggregate_[a-f0-9]{64}$/);
    assert.equal(first.refundReference, replay.refundReference);
    assert.deepEqual(first.refunds.map(item => item.id), ['re_partial_aaaaa', 're_partial_bbbbb']);
    assert.equal(first.refunds.reduce((sum, item) => sum + item.amount, 0), 10000);
    assert.notEqual(
        first.refundReference,
        buildStripeRefundReconciliation(order, children.map(item => ({ ...item, charge: 'ch_other_123' })), { chargeId: 'ch_other_123' }).refundReference
    );
});

test('Stripe reconciliation uses a complete embedded list without making a second provider request', async () => {
    const result = await reconcileStripeChargeRefund({
        charge: charge({ refunds: { data: [refund('re_embedded_123', 10000)], has_more: false } }),
        order,
        stripeClient: { refunds: { list: async () => { throw new Error('must not list'); } } },
    });
    assert.equal(result.refundReference, 're_embedded_123');
});

test('Stripe aggregate reconciliation rejects total, state, currency, charge, ID, and duplicate mismatches', async t => {
    const cases = [
        ['provider total mismatch', [refund('re_mismatch_123', 9000)]],
        ['pending child', [refund('re_pending_1234', 10000, { status: 'pending' })]],
        ['wrong currency', [refund('re_currency_123', 10000, { currency: 'usd' })]],
        ['wrong charge', [refund('re_charge_12345', 10000, { charge: 'ch_other_123' })]],
        ['unsafe id', [refund('bad', 10000)]],
        ['duplicate id', [refund('re_duplicate_123', 5000), refund('re_duplicate_123', 5000)]],
    ];
    for (const [name, evidence] of cases) {
        await t.test(name, async () => {
            assert.throws(
                () => buildStripeRefundReconciliation(order, evidence, { chargeId: 'ch_123456' }),
                error => ['PROVIDER_REFUND_MISMATCH', 'PROVIDER_REFUND_DUPLICATE_REFERENCE'].includes(error.code)
            );
        });
    }
});

test('Stripe reconciliation independently refuses a charge that is not authoritative and fully refunded', async t => {
    const cases = [
        ['partial', charge({ amount_refunded: 3000, refunded: false }), 'STRIPE_CHARGE_NOT_FULLY_REFUNDED'],
        ['wrong amount', charge({ amount: 9999 }), 'PROVIDER_REFUND_MISMATCH'],
        ['wrong currency', charge({ currency: 'usd' }), 'PROVIDER_REFUND_MISMATCH'],
        ['wrong intent', charge({ payment_intent: 'pi_other_123' }), 'PROVIDER_REFUND_MISMATCH'],
    ];
    for (const [name, providerCharge, expectedCode] of cases) {
        await t.test(name, async () => {
            await assert.rejects(
                () => reconcileStripeChargeRefund({
                    charge: providerCharge,
                    order,
                    stripeClient: stripeClientWithPages([{ data: [refund('re_full_123456', 10000)], has_more: false }]),
                }),
                error => error.code === expectedCode
            );
        });
    }
});

test('Stripe pagination fails closed on a non-advancing cursor', async () => {
    await assert.rejects(
        () => listStripeRefunds({
            refunds: { list: async () => ({ data: [refund('re_same_cursor_1', 1000)], has_more: true }) },
        }, 'ch_123456'),
        error => error.code === 'STRIPE_REFUND_RESPONSE_INVALID'
    );
});
