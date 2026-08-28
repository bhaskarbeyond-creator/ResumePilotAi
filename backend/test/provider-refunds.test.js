'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    executeOrReconcileProviderRefund,
    normalizedProviderRefundOutcome,
} = require('../services/providerRefunds');

const idempotencyKey = `refund_${'a'.repeat(30)}`;

function orderFor(provider, extra = {}) {
    return {
        id: `order_${provider}`,
        uid: 'customer_1',
        provider,
        amount: 12345,
        currency: 'INR',
        refundIdempotencyKey: idempotencyKey,
        providerPaymentIntentId: 'pi_authoritative_123',
        providerPaymentId: `payment_${provider}_123`,
        providerOrderId: `merchant_order_${provider}_123`,
        ...extra,
    };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return { ok, status, async json() { return body; } };
}

function dependenciesFor(provider, rawStatus, capture = {}) {
    if (provider === 'stripe') {
        return {
            getStripeClient: async () => ({
                refunds: {
                    create: async (payload, options) => {
                        capture.payload = payload;
                        capture.options = options;
                        return {
                            id: 're_stripe_123456',
                            payment_intent: 'pi_authoritative_123',
                            amount: 12345,
                            currency: 'inr',
                            status: rawStatus,
                        };
                    },
                    retrieve: async id => {
                        capture.retrieved = id;
                        return {
                            id: 're_stripe_123456',
                            payment_intent: 'pi_authoritative_123',
                            amount: 12345,
                            currency: 'inr',
                            status: rawStatus,
                        };
                    },
                },
            }),
        };
    }
    if (provider === 'paypal') {
        return {
            paypalConfig: async () => ({ clientId: 'client', clientSecret: 'secret', baseUrl: 'https://paypal.test' }),
            paypalAccessToken: async () => 'access-token',
            fetchImpl: async (url, options) => {
                capture.url = url;
                capture.options = options;
                return jsonResponse({
                    id: 'RF-PAYPAL-123456',
                    status: rawStatus,
                    amount: { value: '123.45', currency_code: 'INR' },
                });
            },
        };
    }
    if (provider === 'razorpay') {
        return {
            getRazorpayKeys: async () => ({ keyId: 'rzp_test_id', keySecret: 'secret' }),
            fetchImpl: async (url, options) => {
                capture.url = url;
                capture.options = options;
                return jsonResponse({
                    id: 'rfnd_razorpay_123456',
                    payment_id: 'payment_razorpay_123',
                    amount: 12345,
                    currency: 'INR',
                    status: rawStatus,
                });
            },
        };
    }
    if (provider === 'paytm') {
        return {
            getPaytmConfig: async () => ({ mid: 'PAYTMMERCHANT123456', key: 'secret', baseUrl: 'https://paytm.test' }),
            generatePaytmSignature: async value => {
                capture.signedBody = value;
                return 'request-signature';
            },
            verifyPaytmSignature: async (value, key, signature) => {
                capture.verified = { value, key, signature };
                return true;
            },
            fetchImpl: async (url, options) => {
                capture.url = url;
                capture.options = options;
                return jsonResponse({
                    head: { signature: 'response-signature' },
                    body: {
                        mid: 'PAYTMMERCHANT123456',
                        orderId: 'merchant_order_paytm_123',
                        refId: idempotencyKey,
                        txnId: 'payment_paytm_123',
                        refundId: 'paytm_refund_123456',
                        refundAmount: '123.45',
                        resultInfo: { resultStatus: rawStatus },
                    },
                });
            },
        };
    }
    if (provider === 'phonepe') {
        return {
            getPhonePeConfig: async () => ({
                merchantId: 'PHONEPEMERCHANT',
                saltKey: 'salt-secret',
                saltIndex: 1,
                baseUrl: 'https://phonepe.test',
            }),
            fetchImpl: async (url, options) => {
                capture.url = url;
                capture.options = options;
                return jsonResponse({
                    success: rawStatus !== 'FAILED',
                    code: rawStatus === 'COMPLETED' ? 'PAYMENT_SUCCESS' : rawStatus,
                    data: {
                        merchantId: 'PHONEPEMERCHANT',
                        merchantTransactionId: idempotencyKey,
                        transactionId: 'phonepe_refund_123456',
                        amount: 12345,
                        state: rawStatus,
                    },
                });
            },
        };
    }
    throw new Error(`unsupported fixture provider ${provider}`);
}

const statusCases = {
    stripe: { completed: 'SUCCEEDED', pending: 'PENDING', failed: 'FAILED' },
    paypal: { completed: 'COMPLETED', pending: 'PENDING', failed: 'FAILED' },
    razorpay: { completed: 'PROCESSED', pending: 'PENDING', failed: 'FAILED' },
    paytm: { completed: 'TXN_SUCCESS', pending: 'PENDING', failed: 'TXN_FAILURE' },
    phonepe: { completed: 'COMPLETED', pending: 'PENDING', failed: 'FAILED' },
};

for (const [provider, statuses] of Object.entries(statusCases)) {
    test(`${provider} maps completed, pending, failed, and unknown refund states without guessing`, async t => {
        for (const [expectedState, rawStatus] of Object.entries(statuses)) {
            await t.test(expectedState, async () => {
                const capture = {};
                const outcome = await executeOrReconcileProviderRefund(
                    orderFor(provider),
                    'Customer requested full refund',
                    dependenciesFor(provider, rawStatus, capture)
                );
                assert.equal(outcome.state, expectedState.toUpperCase());
                assert.equal(outcome.providerStatus, rawStatus);
                assert.equal(outcome.providerRefundReferenceType, 'PROVIDER');
                assert.equal(outcome.providerRefunds.length, 1);
                assert.equal(outcome.providerRefunds[0].amount, 12345);
                assert.equal(outcome.providerRefunds[0].currency, 'INR');
            });
        }
        await t.test('unknown', async () => {
            await assert.rejects(
                () => executeOrReconcileProviderRefund(
                    orderFor(provider),
                    'Customer requested full refund',
                    dependenciesFor(provider, 'NEW_PROVIDER_STATE')
                ),
                error => error.code === 'PROVIDER_REFUND_STATUS_UNKNOWN'
                    && error.restoreActive !== true
                    && error.providerFailureConfirmed !== true
            );
        });
    });
}

test('new refund commands use the durable idempotency identity for every provider', async () => {
    const captures = {};
    for (const [provider, status] of Object.entries({
        stripe: 'PENDING', paypal: 'PENDING', razorpay: 'PENDING', paytm: 'PENDING', phonepe: 'PENDING',
    })) {
        captures[provider] = {};
        await executeOrReconcileProviderRefund(
            orderFor(provider),
            'A sufficiently detailed reason',
            dependenciesFor(provider, status, captures[provider])
        );
    }
    assert.equal(captures.stripe.options.idempotencyKey, idempotencyKey);
    assert.equal(captures.paypal.options.headers['PayPal-Request-Id'], idempotencyKey);
    assert.equal(captures.razorpay.options.headers['X-Refund-Idempotency'], idempotencyKey);
    assert.equal(JSON.parse(captures.paytm.signedBody).refId, idempotencyKey);
    const phonePeEnvelope = JSON.parse(captures.phonepe.options.body);
    const phonePePayload = JSON.parse(Buffer.from(phonePeEnvelope.request, 'base64').toString('utf8'));
    assert.equal(phonePePayload.merchantTransactionId, idempotencyKey);
    assert.equal(phonePePayload.originalTransactionId, 'merchant_order_phonepe_123');
});

test('reconciliation retrieves the original logical refund instead of issuing a second money command', async () => {
    const refundIds = {
        stripe: 're_stripe_123456',
        paypal: 'RF-PAYPAL-123456',
        razorpay: 'rfnd_razorpay_123456',
        paytm: 'paytm_refund_123456',
        phonepe: 'phonepe_refund_123456',
    };
    const captures = {};
    for (const [provider, refundId] of Object.entries(refundIds)) {
        captures[provider] = {};
        const outcome = await executeOrReconcileProviderRefund(
            orderFor(provider, { providerRefundId: refundId }),
            'Reconcile the accepted provider refund',
            dependenciesFor(provider, 'PENDING', captures[provider])
        );
        assert.equal(outcome.refundId, refundId);
        assert.equal(outcome.state, 'PENDING');
    }
    assert.equal(captures.stripe.retrieved, refundIds.stripe);
    assert.equal(captures.stripe.payload, undefined);
    assert.equal(captures.paypal.options.method, 'GET');
    assert.equal(captures.paypal.options.headers['PayPal-Request-Id'], undefined);
    assert.equal(captures.razorpay.options.method, 'GET');
    assert.equal(captures.razorpay.options.headers['X-Refund-Idempotency'], undefined);
    assert.match(captures.paytm.url, /\/v2\/refund\/status$/);
    assert.equal(JSON.parse(captures.paytm.signedBody).refId, idempotencyKey);
    assert.equal(captures.phonepe.options.method, 'GET');
    assert.match(captures.phonepe.url, new RegExp(`${idempotencyKey}$`));
});

test('Paytm response signature failure is ambiguous and never restores entitlement', async () => {
    const dependencies = dependenciesFor('paytm', 'TXN_SUCCESS');
    dependencies.verifyPaytmSignature = async () => false;
    await assert.rejects(
        () => executeOrReconcileProviderRefund(orderFor('paytm'), 'Customer request', dependencies),
        error => error.code === 'PROVIDER_REFUND_RESPONSE_INVALID' && error.restoreActive !== true
    );
});

test('rate limiting and unknown statuses stay non-terminal', async () => {
    const dependencies = dependenciesFor('paypal', 'PENDING');
    dependencies.fetchImpl = async () => jsonResponse({ name: 'RATE_LIMIT_REACHED' }, { ok: false, status: 429 });
    await assert.rejects(
        () => executeOrReconcileProviderRefund(orderFor('paypal'), 'Customer request', dependencies),
        error => error.code === 'PAYPAL_REFUND_UNCONFIRMED' && error.status === 502 && error.restoreActive !== true
    );
    assert.throws(
        () => normalizedProviderRefundOutcome('stripe', 'a_future_status'),
        error => error.code === 'PROVIDER_REFUND_STATUS_UNKNOWN'
    );
});
