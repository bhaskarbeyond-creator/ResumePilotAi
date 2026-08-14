const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const {
  PaymentValidationError,
  assertInternalOrder,
  validateStripePaymentIntent,
  validatePayPalOrder,
  expectedRazorpaySignature,
  validateRazorpaySignature,
  validateRazorpayPayment,
  validatePaytmPayment,
  validatePhonePePayment,
  isDuplicateProviderEventError,
  shouldReverseEntitlement,
  calculateMembershipEnd,
} = require('../security/payments');

const baseOrder = (overrides = {}) => ({
  uid: 'user-1', provider: 'paypal', providerOrderId: 'provider-order-1',
  providerPaymentIntentId: 'pi_1', planId: 'monthly', amount: 23482,
  currency: 'INR', status: 'PAYMENT_CREATED', ...overrides
});

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof PaymentValidationError && error.code === code);
}

test('Stripe webhook cryptography accepts authentic payload and rejects tampering', () => {
  const stripe = Stripe('sk_test_local_fixture');
  const secret = 'whsec_local_test_secret';
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1700000000 });
  const event = stripe.webhooks.constructEvent(payload, header, secret, 999999999);
  assert.equal(event.id, 'evt_1');
  assert.throws(() => stripe.webhooks.constructEvent(`${payload} `, header, secret, 999999999));
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_wrong', 999999999));
});

test('Stripe intent binding validates order, UID, plan, amount, currency, and intent', () => {
  const order = baseOrder({ provider: 'stripe', currency: 'usd', amount: 1999 });
  const intent = { id: 'pi_1', amount: 1999, currency: 'usd', metadata: { orderId: 'order-1', uid: 'user-1', planId: 'monthly' } };
  assert.equal(validateStripePaymentIntent(order, intent, 'order-1'), true);
  for (const mutation of [
    { amount: 1 }, { currency: 'eur' }, { id: 'pi_wrong' },
    { metadata: { ...intent.metadata, uid: 'attacker' } },
    { metadata: { ...intent.metadata, planId: 'yearly' } },
    { metadata: { ...intent.metadata, orderId: 'other-order' } },
  ]) expectCode(() => validateStripePaymentIntent(order, { ...intent, ...mutation }, 'order-1'), 'STRIPE_ORDER_MISMATCH');
});

test('PayPal completed order validates exact internal binding', () => {
  const order = baseOrder();
  const provider = {
    id: 'provider-order-1', status: 'COMPLETED',
    purchase_units: [{
      reference_id: 'internal-1', custom_id: 'user-1',
      amount: { value: '234.82', currency_code: 'INR' },
      payments: { captures: [{ id: 'capture-1' }] }
    }]
  };
  assert.equal(validatePayPalOrder(order, provider, { uid: 'user-1', paymentOrderId: 'internal-1', providerOrderId: 'provider-order-1' }), 'capture-1');
  const attacks = [
    [{ ...provider, status: 'APPROVED' }, {}],
    [{ ...provider, id: 'wrong' }, {}],
    [{ ...provider, purchase_units: [{ ...provider.purchase_units[0], reference_id: 'wrong' }] }, {}],
    [{ ...provider, purchase_units: [{ ...provider.purchase_units[0], custom_id: 'attacker' }] }, {}],
    [{ ...provider, purchase_units: [{ ...provider.purchase_units[0], amount: { value: '1.00', currency_code: 'INR' } }] }, {}],
    [{ ...provider, purchase_units: [{ ...provider.purchase_units[0], amount: { value: '234.82', currency_code: 'USD' } }] }, {}],
    [provider, { uid: 'attacker' }],
  ];
  for (const [candidate, options] of attacks) {
    expectCode(() => validatePayPalOrder(order, candidate, {
      uid: options.uid || 'user-1', paymentOrderId: 'internal-1', providerOrderId: 'provider-order-1'
    }), options.uid ? 'ORDER_NOT_FOUND' : 'PAYPAL_ORDER_MISMATCH');
  }
});

test('Razorpay requires timing-safe HMAC and captured provider payment', () => {
  const secret = 'razorpay-test-secret';
  const signature = expectedRazorpaySignature(secret, 'order_1', 'pay_1');
  assert.equal(validateRazorpaySignature(secret, 'order_1', 'pay_1', signature), true);
  expectCode(() => validateRazorpaySignature(secret, 'order_1', 'pay_1', `${signature.slice(0, -1)}0`), 'RAZORPAY_SIGNATURE_INVALID');
  expectCode(() => validateRazorpaySignature('', 'order_1', 'pay_1', signature), 'RAZORPAY_SIGNATURE_INVALID');
  const order = baseOrder({ provider: 'razorpay', providerOrderId: 'order_1' });
  const payment = { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 23482, currency: 'INR' };
  assert.equal(validateRazorpayPayment(order, payment, 'order_1'), 'pay_1');
  for (const mutation of [
    { order_id: 'wrong' }, { status: 'authorized' }, { amount: 1 }, { currency: 'USD' }
  ]) expectCode(() => validateRazorpayPayment(order, { ...payment, ...mutation }, 'order_1'), 'RAZORPAY_PAYMENT_MISMATCH');
});

test('Paytm and PhonePe provider states require exact amount/currency/completion', () => {
  const paytmOrder = baseOrder({ provider: 'paytm' });
  const paytm = { txnId: 'txn-1', txnAmount: '234.82', currency: 'INR', resultInfo: { resultStatus: 'TXN_SUCCESS' } };
  assert.equal(validatePaytmPayment(paytmOrder, paytm), 'txn-1');
  for (const mutation of [
    { txnAmount: '1.00' }, { currency: 'USD' }, { txnId: '' }, { resultInfo: { resultStatus: 'PENDING' } }
  ]) expectCode(() => validatePaytmPayment(paytmOrder, { ...paytm, ...mutation }), 'PAYTM_PAYMENT_MISMATCH');

  const phoneOrder = baseOrder({ provider: 'phonepe', providerOrderId: 'phone-1' });
  const phone = { success: true, data: { state: 'COMPLETED', amount: 23482, paymentInstrument: { pgTransactionId: 'pg-1' } } };
  assert.equal(validatePhonePePayment(phoneOrder, phone), 'pg-1');
  for (const mutation of [
    { success: false }, { data: { ...phone.data, state: 'PENDING' } }, { data: { ...phone.data, amount: 1 } }
  ]) expectCode(() => validatePhonePePayment(phoneOrder, { ...phone, ...mutation }), 'PHONEPE_PAYMENT_MISMATCH');
});

test('order ownership, replay states, refund targeting, and renewal math fail safely', () => {
  assert.equal(assertInternalOrder(baseOrder(), { uid: 'user-1', provider: 'paypal', providerOrderId: 'provider-order-1' }).uid, 'user-1');
  expectCode(() => assertInternalOrder(baseOrder(), { uid: 'attacker', provider: 'paypal' }), 'ORDER_NOT_FOUND');
  expectCode(() => assertInternalOrder(baseOrder({ status: 'FAILED' }), { uid: 'user-1', provider: 'paypal' }), 'INVALID_ORDER_STATE');
  assert.equal(assertInternalOrder(baseOrder({ status: 'ACTIVE' }), { uid: 'user-1', provider: 'paypal' }).status, 'ACTIVE');
  assert.equal(isDuplicateProviderEventError({ code: 6 }), true);
  assert.equal(isDuplicateProviderEventError({ code: 'already-exists' }), true);
  assert.equal(isDuplicateProviderEventError({ code: 'other' }), false);
  assert.equal(shouldReverseEntitlement({ lastPaymentOrderId: 'latest' }, 'old'), false);
  assert.equal(shouldReverseEntitlement({ lastPaymentOrderId: 'latest' }, 'latest'), true);

  const now = new Date('2026-01-15T00:00:00Z');
  assert.equal(calculateMembershipEnd(null, 1, now).toISOString(), '2026-02-15T00:00:00.000Z');
  assert.equal(calculateMembershipEnd(new Date('2026-06-15T00:00:00Z'), 1, now).toISOString(), '2026-07-15T00:00:00.000Z');
  expectCode(() => calculateMembershipEnd(null, 0, now), 'INVALID_PLAN_DURATION');
});
