'use strict';

const crypto = require('crypto');
const defaultFetch = require('node-fetch');
const PaytmChecksum = require('paytmchecksum');

const PROVIDER_STATES = Object.freeze({
    stripe: Object.freeze({
        completed: new Set(['SUCCEEDED']),
        pending: new Set(['PENDING', 'REQUIRES_ACTION']),
        failed: new Set(['FAILED', 'CANCELED', 'CANCELLED']),
    }),
    paypal: Object.freeze({
        completed: new Set(['COMPLETED']),
        pending: new Set(['PENDING']),
        failed: new Set(['FAILED', 'CANCELLED']),
    }),
    razorpay: Object.freeze({
        completed: new Set(['PROCESSED']),
        pending: new Set(['PENDING']),
        failed: new Set(['FAILED']),
    }),
    paytm: Object.freeze({
        completed: new Set(['TXN_SUCCESS', 'SUCCESS']),
        pending: new Set(['PENDING']),
        failed: new Set(['TXN_FAILURE', 'FAILURE', 'NO_RECORD_FOUND']),
    }),
    phonepe: Object.freeze({
        completed: new Set(['COMPLETED', 'PAYMENT_SUCCESS']),
        pending: new Set(['PENDING', 'CONFIRMED', 'PAYMENT_PENDING']),
        failed: new Set(['FAILED', 'PAYMENT_ERROR', 'PAYMENT_DECLINED']),
    }),
});

function refundFlowError(code, message, status = 502, { restoreActive = false, providerFailureConfirmed = false } = {}) {
    return Object.assign(new Error(message), { code, status, restoreActive, providerFailureConfirmed });
}

function normalizedProviderRefundOutcome(provider, rawStatus) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const status = String(rawStatus || '').trim().toUpperCase();
    const states = PROVIDER_STATES[normalizedProvider];
    if (states?.completed.has(status)) return { state: 'COMPLETED', providerStatus: status };
    if (states?.pending.has(status)) return { state: 'PENDING', providerStatus: status };
    if (states?.failed.has(status)) return { state: 'FAILED', providerStatus: status };
    throw refundFlowError('PROVIDER_REFUND_STATUS_UNKNOWN', 'The provider returned an unknown refund status.');
}

async function readProviderJson(response) {
    try {
        return await response.json();
    } catch (_) {
        throw refundFlowError('PROVIDER_REFUND_RESPONSE_INVALID', 'The provider returned an unreadable refund response.');
    }
}

function assertRefundAmountAndCurrency(order, amountMinor, currency) {
    if (!Number.isSafeInteger(Number(amountMinor)) || Number(amountMinor) !== Number(order.amount)
        || String(currency || '').toUpperCase() !== String(order.currency || '').toUpperCase()) {
        throw refundFlowError('PROVIDER_REFUND_MISMATCH', 'The provider refund does not match the authoritative payment amount and currency.');
    }
}

function assertRupeeOrder(order, provider) {
    if (String(order.currency || '').toUpperCase() !== 'INR') {
        throw refundFlowError('PROVIDER_REFUND_MISMATCH', `${provider} refunds require an INR payment order.`, 409, { restoreActive: true });
    }
}

function isDefinitiveCommandRejection(status, isReconciliation) {
    if (isReconciliation) return false;
    return [400, 401, 403, 404, 405, 422].includes(Number(status));
}

function providerEvidence(provider, refundId, rawStatus, amount, currency) {
    const outcome = normalizedProviderRefundOutcome(provider, rawStatus);
    const id = String(refundId || '').trim();
    if (outcome.state !== 'FAILED' && !id) {
        throw refundFlowError('PROVIDER_REFUND_RESPONSE_INVALID', 'The provider accepted a refund without returning a durable refund identifier.');
    }
    return {
        refundId: id || null,
        providerRefundReferenceType: 'PROVIDER',
        providerRefunds: id ? [{
            id,
            provider,
            status: String(rawStatus || '').trim().toUpperCase(),
            amount: Number(amount),
            currency: String(currency || '').trim().toUpperCase(),
        }] : [],
        ...outcome,
    };
}

function requireDependency(dependencies, name) {
    const dependency = dependencies[name];
    if (typeof dependency !== 'function') {
        throw refundFlowError('PAYMENT_PROVIDER_UNAVAILABLE', `The ${name} refund dependency is unavailable.`, 503);
    }
    return dependency;
}

async function executeStripeRefund(order, dependencies, context) {
    if (!order.providerPaymentIntentId) {
        throw refundFlowError('REFUND_REFERENCE_MISSING', 'The Stripe payment intent reference is missing.', 409, { restoreActive: true });
    }
    const stripeClient = await requireDependency(dependencies, 'getStripeClient')();
    let refund;
    try {
        refund = context.existingRefundId
            ? await stripeClient.refunds.retrieve(context.existingRefundId)
            : await stripeClient.refunds.create(
                { payment_intent: order.providerPaymentIntentId, reason: 'requested_by_customer', metadata: { paymentOrderId: order.id } },
                { idempotencyKey: context.idempotencyKey }
            );
    } catch (error) {
        const status = Number(error?.statusCode || error?.status);
        const definitive = isDefinitiveCommandRejection(status, Boolean(context.existingRefundId));
        throw refundFlowError('STRIPE_REFUND_UNCONFIRMED', 'Stripe did not confirm the refund command.', definitive ? 422 : 502, { restoreActive: definitive });
    }
    if (!refund?.id || refund.payment_intent !== order.providerPaymentIntentId) {
        throw refundFlowError('PROVIDER_REFUND_MISMATCH', 'Stripe returned a refund for a different payment intent.');
    }
    assertRefundAmountAndCurrency(order, refund.amount, refund.currency);
    return providerEvidence('stripe', refund.id, refund.status, refund.amount, refund.currency);
}

async function executePayPalRefund(order, dependencies, context) {
    if (!order.providerPaymentId) {
        throw refundFlowError('REFUND_REFERENCE_MISSING', 'The PayPal capture reference is missing.', 409, { restoreActive: true });
    }
    const { clientId, clientSecret, baseUrl } = await requireDependency(dependencies, 'paypalConfig')();
    const accessToken = await requireDependency(dependencies, 'paypalAccessToken')(baseUrl, clientId, clientSecret);
    const fetchImpl = dependencies.fetchImpl || defaultFetch;
    const url = context.existingRefundId
        ? `${baseUrl}/v2/payments/refunds/${encodeURIComponent(context.existingRefundId)}`
        : `${baseUrl}/v2/payments/captures/${encodeURIComponent(order.providerPaymentId)}/refund`;
    let providerRes;
    try {
        providerRes = await fetchImpl(url, {
            method: context.existingRefundId ? 'GET' : 'POST',
            timeout: 10_000,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...(!context.existingRefundId ? { 'PayPal-Request-Id': context.idempotencyKey } : {}),
            },
            ...(!context.existingRefundId ? { body: JSON.stringify({ amount: { value: (order.amount / 100).toFixed(2), currency_code: order.currency } }) } : {}),
        });
    } catch (_) {
        throw refundFlowError('PAYPAL_REFUND_UNCONFIRMED', 'PayPal did not confirm the refund command.');
    }
    const refund = await readProviderJson(providerRes);
    if (!providerRes.ok || !refund?.id) {
        const definitive = isDefinitiveCommandRejection(providerRes.status, Boolean(context.existingRefundId));
        throw refundFlowError('PAYPAL_REFUND_UNCONFIRMED', 'PayPal did not confirm the refund command.', definitive ? 422 : 502, { restoreActive: definitive });
    }
    const amountMinor = Math.round(Number(refund.amount?.value) * 100);
    const refundCurrency = String(refund.amount?.currency_code || '').toUpperCase();
    assertRefundAmountAndCurrency(order, amountMinor, refundCurrency);
    return providerEvidence('paypal', refund.id, refund.status, amountMinor, refundCurrency);
}

async function executeRazorpayRefund(order, reason, dependencies, context) {
    if (!order.providerPaymentId) {
        throw refundFlowError('REFUND_REFERENCE_MISSING', 'The Razorpay payment reference is missing.', 409, { restoreActive: true });
    }
    const { keyId, keySecret } = await requireDependency(dependencies, 'getRazorpayKeys')();
    if (!keyId || !keySecret) {
        throw refundFlowError('PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay refund credentials are unavailable.', 503);
    }
    const fetchImpl = dependencies.fetchImpl || defaultFetch;
    const url = context.existingRefundId
        ? `https://api.razorpay.com/v1/refunds/${encodeURIComponent(context.existingRefundId)}`
        : `https://api.razorpay.com/v1/payments/${encodeURIComponent(order.providerPaymentId)}/refund`;
    let providerRes;
    try {
        providerRes = await fetchImpl(url, {
            method: context.existingRefundId ? 'GET' : 'POST',
            timeout: 10_000,
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
                'Content-Type': 'application/json',
                ...(!context.existingRefundId ? { 'X-Refund-Idempotency': context.idempotencyKey } : {}),
            },
            ...(!context.existingRefundId ? {
                body: JSON.stringify({
                    amount: order.amount,
                    receipt: context.idempotencyKey,
                    notes: { paymentOrderId: order.id, reason: String(reason || '').slice(0, 256) },
                }),
            } : {}),
        });
    } catch (_) {
        throw refundFlowError('RAZORPAY_REFUND_UNCONFIRMED', 'Razorpay did not confirm the refund command.');
    }
    const refund = await readProviderJson(providerRes);
    if (!providerRes.ok || !refund?.id) {
        const definitive = isDefinitiveCommandRejection(providerRes.status, Boolean(context.existingRefundId));
        throw refundFlowError('RAZORPAY_REFUND_UNCONFIRMED', 'Razorpay did not confirm the refund command.', definitive ? 422 : 502, { restoreActive: definitive });
    }
    if (refund.payment_id !== order.providerPaymentId) {
        throw refundFlowError('PROVIDER_REFUND_MISMATCH', 'Razorpay returned a refund for a different payment.');
    }
    const refundCurrency = String(refund.currency || order.currency).toUpperCase();
    assertRefundAmountAndCurrency(order, refund.amount, refundCurrency);
    return providerEvidence('razorpay', refund.id, refund.status, refund.amount, refundCurrency);
}

async function executePaytmRefund(order, reason, dependencies, context) {
    if (!order.providerPaymentId || !order.providerOrderId) {
        throw refundFlowError('REFUND_REFERENCE_MISSING', 'The Paytm transaction reference is missing.', 409, { restoreActive: true });
    }
    assertRupeeOrder(order, 'Paytm');
    const { mid, key, baseUrl } = await requireDependency(dependencies, 'getPaytmConfig')();
    if (!mid || !key || !baseUrl) {
        throw refundFlowError('PAYMENT_PROVIDER_UNAVAILABLE', 'Paytm refund credentials are unavailable.', 503);
    }
    const body = context.existingRefundId
        ? { mid, orderId: order.providerOrderId, refId: context.idempotencyKey }
        : {
            mid,
            orderId: order.providerOrderId,
            refId: context.idempotencyKey,
            txnId: order.providerPaymentId,
            txnType: 'REFUND',
            refundAmount: (order.amount / 100).toFixed(2),
            comments: String(reason || '').slice(0, 500),
        };
    const generateSignature = dependencies.generatePaytmSignature
        || ((value, merchantKey) => PaytmChecksum.generateSignature(value, merchantKey));
    const signature = await generateSignature(JSON.stringify(body), key);
    const fetchImpl = dependencies.fetchImpl || defaultFetch;
    const path = context.existingRefundId ? '/v2/refund/status' : '/refund/apply';
    let providerRes;
    try {
        providerRes = await fetchImpl(`${baseUrl}${path}`, {
            method: 'POST',
            timeout: 10_000,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, head: { signature } }),
        });
    } catch (_) {
        throw refundFlowError('PAYTM_REFUND_UNCONFIRMED', 'Paytm did not confirm the refund command.');
    }
    const providerData = await readProviderJson(providerRes);
    const responseBody = providerData?.body || {};
    const verifySignature = dependencies.verifyPaytmSignature
        || ((value, merchantKey, responseSignature) => PaytmChecksum.verifySignature(value, merchantKey, responseSignature));
    const responseSignature = String(providerData?.head?.signature || '');
    if (!responseSignature) {
        throw refundFlowError('PROVIDER_REFUND_RESPONSE_INVALID', 'Paytm returned an unsigned refund response.');
    }
    const signatureValid = await verifySignature(JSON.stringify(responseBody), key, responseSignature);
    if (!signatureValid) {
        throw refundFlowError('PROVIDER_REFUND_RESPONSE_INVALID', 'Paytm returned an invalid refund response signature.');
    }
    if (!providerRes.ok) {
        const definitive = isDefinitiveCommandRejection(providerRes.status, Boolean(context.existingRefundId));
        throw refundFlowError('PAYTM_REFUND_UNCONFIRMED', 'Paytm did not confirm the refund command.', definitive ? 422 : 502, { restoreActive: definitive });
    }
    if (String(responseBody.mid || '') !== String(mid)
        || String(responseBody.orderId || '') !== String(order.providerOrderId)
        || String(responseBody.refId || '') !== context.idempotencyKey
        || (responseBody.txnId && String(responseBody.txnId) !== String(order.providerPaymentId))) {
        throw refundFlowError('PROVIDER_REFUND_MISMATCH', 'Paytm returned a refund for a different payment.');
    }
    const amountMinor = Math.round(Number(responseBody.refundAmount) * 100);
    assertRefundAmountAndCurrency(order, amountMinor, 'INR');
    const rawStatus = responseBody.resultInfo?.resultStatus;
    return providerEvidence('paytm', responseBody.refundId || context.existingRefundId, rawStatus, amountMinor, 'INR');
}

async function executePhonePeRefund(order, dependencies, context) {
    if (!order.providerOrderId) {
        throw refundFlowError('REFUND_REFERENCE_MISSING', 'The PhonePe merchant transaction reference is missing.', 409, { restoreActive: true });
    }
    assertRupeeOrder(order, 'PhonePe');
    const { merchantId, saltKey, saltIndex, baseUrl } = await requireDependency(dependencies, 'getPhonePeConfig')();
    if (!merchantId || !saltKey || !Number.isSafeInteger(Number(saltIndex)) || Number(saltIndex) < 1 || !baseUrl) {
        throw refundFlowError('PAYMENT_PROVIDER_UNAVAILABLE', 'PhonePe refund credentials are unavailable.', 503);
    }
    const fetchImpl = dependencies.fetchImpl || defaultFetch;
    let url;
    let request;
    if (context.existingRefundId) {
        const statusPath = `/pg/v1/status/${encodeURIComponent(merchantId)}/${encodeURIComponent(context.idempotencyKey)}`;
        const checksum = `${crypto.createHash('sha256').update(`${statusPath}${saltKey}`).digest('hex')}###${saltIndex}`;
        url = `${baseUrl}${statusPath}`;
        request = {
            method: 'GET',
            timeout: 10_000,
            headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'X-MERCHANT-ID': merchantId, 'Accept': 'application/json' },
        };
    } else {
        const payload = {
            merchantId,
            merchantUserId: order.uid,
            originalTransactionId: order.providerOrderId,
            merchantTransactionId: context.idempotencyKey,
            amount: order.amount,
        };
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const checksum = `${crypto.createHash('sha256').update(`${base64Payload}/pg/v1/refund${saltKey}`).digest('hex')}###${saltIndex}`;
        url = `${baseUrl}/pg/v1/refund`;
        request = {
            method: 'POST',
            timeout: 10_000,
            headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'Accept': 'application/json' },
            body: JSON.stringify({ request: base64Payload }),
        };
    }
    let providerRes;
    try {
        providerRes = await fetchImpl(url, request);
    } catch (_) {
        throw refundFlowError('PHONEPE_REFUND_UNCONFIRMED', 'PhonePe did not confirm the refund command.');
    }
    const providerData = await readProviderJson(providerRes);
    if (!providerRes.ok) {
        const definitive = isDefinitiveCommandRejection(providerRes.status, Boolean(context.existingRefundId));
        throw refundFlowError('PHONEPE_REFUND_UNCONFIRMED', 'PhonePe did not confirm the refund command.', definitive ? 422 : 502, { restoreActive: definitive });
    }
    const data = providerData?.data || {};
    if (String(data.merchantTransactionId || '') !== context.idempotencyKey
        || (data.merchantId && String(data.merchantId) !== String(merchantId))) {
        throw refundFlowError('PROVIDER_REFUND_MISMATCH', 'PhonePe returned a refund for a different payment.');
    }
    assertRefundAmountAndCurrency(order, data.amount, 'INR');
    const rawStatus = data.state || data.paymentState || data.responseCode || providerData.code;
    const refundId = data.transactionId || data.refundId || context.existingRefundId;
    return providerEvidence('phonepe', refundId, rawStatus, data.amount, 'INR');
}

async function executeOrReconcileProviderRefund(order, reason, dependencies = {}) {
    const provider = String(order?.provider || '').trim().toLowerCase();
    const existingRefundId = String(order?.providerRefundId || '').trim();
    const idempotencyKey = String(order?.refundIdempotencyKey || '').trim();
    if (!idempotencyKey || !/^refund_[a-f0-9]{30}$/.test(idempotencyKey)) {
        throw refundFlowError('REFUND_IDEMPOTENCY_KEY_INVALID', 'The durable refund idempotency key is unavailable.', 503);
    }
    const context = { existingRefundId, idempotencyKey };
    if (provider === 'stripe') return executeStripeRefund(order, dependencies, context);
    if (provider === 'paypal') return executePayPalRefund(order, dependencies, context);
    if (provider === 'razorpay') return executeRazorpayRefund(order, reason, dependencies, context);
    if (provider === 'paytm') return executePaytmRefund(order, reason, dependencies, context);
    if (provider === 'phonepe') return executePhonePeRefund(order, dependencies, context);
    throw refundFlowError('REFUND_PROVIDER_UNSUPPORTED', 'Refunds for this provider are not enabled.', 501, { restoreActive: true });
}

module.exports = {
    executeOrReconcileProviderRefund,
    normalizedProviderRefundOutcome,
    refundFlowError,
    _assertRefundAmountAndCurrency: assertRefundAmountAndCurrency,
    _isDefinitiveCommandRejection: isDefinitiveCommandRejection,
};
