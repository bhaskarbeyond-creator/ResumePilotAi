'use strict';

const crypto = require('crypto');

function refundReferenceError(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function normalizeEntry(refund, order, expectedChargeId) {
  const id = String(refund?.id || '').replace(/\p{Cc}/gu, '').trim();
  const status = String(refund?.status || '').trim().toUpperCase();
  const amount = Number(refund?.amount);
  const currency = String(refund?.currency || '').trim().toUpperCase();
  const paymentIntent = String(refund?.payment_intent || refund?.paymentIntent || '').trim();
  const chargeId = String(refund?.charge || '').trim();
  if (!/^[A-Za-z0-9_-]{6,255}$/.test(id)
      || status !== 'SUCCEEDED'
      || !Number.isSafeInteger(amount) || amount <= 0
      || currency !== String(order?.currency || '').toUpperCase()
      || paymentIntent !== String(order?.providerPaymentIntentId || order?.provider_payment_intent_id || '')
      || (expectedChargeId && chargeId !== expectedChargeId)) {
    throw refundReferenceError(
      'PROVIDER_REFUND_MISMATCH',
      'A Stripe refund reference does not match the authoritative charge, payment intent, amount, currency, or terminal status.'
    );
  }
  return {
    id,
    provider: 'stripe',
    status,
    amount,
    currency,
    paymentIntent,
  };
}

function buildStripeRefundReconciliation(order, refunds, { chargeId = '' } = {}) {
  if (!Array.isArray(refunds) || refunds.length === 0) {
    throw refundReferenceError('REFUND_REFERENCE_MISSING', 'Completed Stripe refund references are missing.');
  }
  const normalized = refunds.map(refund => normalizeEntry(refund, order, chargeId));
  const ids = new Set(normalized.map(refund => refund.id));
  if (ids.size !== normalized.length) {
    throw refundReferenceError('PROVIDER_REFUND_DUPLICATE_REFERENCE', 'Stripe returned duplicate refund references.');
  }
  normalized.sort((left, right) => left.id.localeCompare(right.id));
  const total = normalized.reduce((sum, refund) => sum + refund.amount, 0);
  if (!Number.isSafeInteger(total) || total !== Number(order?.amount)) {
    throw refundReferenceError(
      'PROVIDER_REFUND_MISMATCH',
      'Completed Stripe refunds do not exactly reverse the authoritative payment amount.'
    );
  }

  if (normalized.length === 1 && normalized[0].amount === Number(order.amount)) {
    return {
      refundReference: normalized[0].id,
      referenceType: 'PROVIDER',
      refunds: normalized,
      totalAmount: total,
      currency: normalized[0].currency,
    };
  }
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({
      provider: 'stripe',
      chargeId,
      paymentIntentId: normalized[0].paymentIntent,
      currency: normalized[0].currency,
      refunds: normalized.map(({ id, amount }) => ({ id, amount })),
    }))
    .digest('hex');
  return {
    refundReference: `stripe_aggregate_${digest}`,
    referenceType: 'AGGREGATE',
    refunds: normalized,
    totalAmount: total,
    currency: normalized[0].currency,
  };
}

async function listStripeRefunds(stripeClient, chargeId, { maxPages = 20 } = {}) {
  if (!stripeClient?.refunds || typeof stripeClient.refunds.list !== 'function') {
    throw refundReferenceError('STRIPE_REFUND_LOOKUP_UNAVAILABLE', 'Stripe refund lookup is unavailable.', 503);
  }
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(String(chargeId || ''))) {
    throw refundReferenceError('STRIPE_CHARGE_REFERENCE_INVALID', 'Stripe charge reference is invalid.');
  }
  const refunds = [];
  let startingAfter;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await stripeClient.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const rows = Array.isArray(page?.data) ? page.data : null;
    if (!rows) {
      throw refundReferenceError('STRIPE_REFUND_RESPONSE_INVALID', 'Stripe returned an invalid refund list.', 502);
    }
    refunds.push(...rows);
    if (!page.has_more) return refunds;
    const lastId = rows.at(-1)?.id;
    if (!lastId || lastId === startingAfter) {
      throw refundReferenceError('STRIPE_REFUND_RESPONSE_INVALID', 'Stripe refund pagination did not advance.', 502);
    }
    startingAfter = lastId;
  }
  throw refundReferenceError('STRIPE_REFUND_LIST_LIMIT', 'Stripe refund history exceeded the reconciliation safety limit.', 503);
}

async function reconcileStripeChargeRefund({ stripeClient, charge, order }) {
  const chargeId = String(charge?.id || '').trim();
  const paymentIntentId = String(order?.providerPaymentIntentId || order?.provider_payment_intent_id || '');
  if (!/^[A-Za-z0-9_-]{6,255}$/.test(chargeId)
      || String(charge?.payment_intent || '') !== paymentIntentId
      || Number(charge?.amount) !== Number(order?.amount)
      || String(charge?.currency || '').toUpperCase() !== String(order?.currency || '').toUpperCase()) {
    throw refundReferenceError('PROVIDER_REFUND_MISMATCH', 'The Stripe charge does not match the authoritative payment order.');
  }
  if (charge.refunded !== true || Number(charge.amount_refunded) !== Number(order.amount)) {
    throw refundReferenceError('STRIPE_CHARGE_NOT_FULLY_REFUNDED', 'Stripe has not confirmed a completed full refund.');
  }

  const embedded = Array.isArray(charge?.refunds?.data) ? charge.refunds.data : [];
  let refunds = embedded;
  let embeddedResult = null;
  if (embedded.length && charge?.refunds?.has_more !== true) {
    try {
      embeddedResult = buildStripeRefundReconciliation(order, embedded, { chargeId });
    } catch (error) {
      if (!['PROVIDER_REFUND_MISMATCH', 'REFUND_REFERENCE_MISSING'].includes(error.code)) throw error;
    }
  }
  if (embeddedResult) return embeddedResult;
  refunds = await listStripeRefunds(stripeClient, chargeId);
  return buildStripeRefundReconciliation(order, refunds, { chargeId });
}

module.exports = {
  buildStripeRefundReconciliation,
  listStripeRefunds,
  reconcileStripeChargeRefund,
  refundReferenceError,
};
