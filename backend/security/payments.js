const crypto = require('crypto');

class PaymentValidationError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function normalizeCurrency(value) {
  return String(value || '').trim().toUpperCase();
}

function safeEqual(value, expected) {
  const left = Buffer.from(String(value || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function assertInternalOrder(order, { uid, provider, providerOrderId, allowedStates = ['PAYMENT_CREATED', 'PENDING_PAYMENT', 'PROVIDER_CONFIRMED', 'ACTIVE'] }) {
  if (!order || order.uid !== uid || order.provider !== provider) throw new PaymentValidationError('ORDER_NOT_FOUND', 404);
  if (providerOrderId !== undefined && order.providerOrderId !== providerOrderId) throw new PaymentValidationError('ORDER_BINDING_MISMATCH');
  if (!allowedStates.includes(order.status)) throw new PaymentValidationError('INVALID_ORDER_STATE', 409);
  return order;
}

function validateStripePaymentIntent(order, paymentIntent, orderId) {
  const metadata = paymentIntent?.metadata || {};
  if (!order || order.provider !== 'stripe'
    || order.providerPaymentIntentId !== paymentIntent?.id
    || Number(order.amount) !== Number(paymentIntent?.amount)
    || normalizeCurrency(order.currency) !== normalizeCurrency(paymentIntent?.currency)
    || order.uid !== metadata.uid
    || order.planId !== metadata.planId
    || (orderId !== undefined && metadata.orderId !== orderId)
    || metadata.orderId === undefined) {
    throw new PaymentValidationError('STRIPE_ORDER_MISMATCH');
  }
  return true;
}

function validatePayPalOrder(order, providerOrder, { uid, paymentOrderId, providerOrderId }) {
  assertInternalOrder(order, { uid, provider: 'paypal', providerOrderId });
  const purchase = providerOrder?.purchase_units?.[0];
  const amount = Math.round(Number(purchase?.amount?.value) * 100);
  if (providerOrder?.id !== providerOrderId
    || providerOrder?.status !== 'COMPLETED'
    || purchase?.reference_id !== paymentOrderId
    || purchase?.custom_id !== uid
    || amount !== Number(order.amount)
    || normalizeCurrency(purchase?.amount?.currency_code) !== normalizeCurrency(order.currency)) {
    throw new PaymentValidationError('PAYPAL_ORDER_MISMATCH');
  }
  return purchase?.payments?.captures?.[0]?.id || providerOrderId;
}

function expectedRazorpaySignature(secret, orderId, paymentId) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function validateRazorpaySignature(secret, orderId, paymentId, signature) {
  if (!secret || !orderId || !paymentId || !signature) throw new PaymentValidationError('RAZORPAY_SIGNATURE_INVALID');
  const expected = expectedRazorpaySignature(secret, orderId, paymentId);
  if (!safeEqual(signature, expected)) throw new PaymentValidationError('RAZORPAY_SIGNATURE_INVALID');
  return true;
}

function validateRazorpayPayment(order, payment, providerOrderId) {
  if (!payment || payment.order_id !== providerOrderId || payment.status !== 'captured'
    || Number(payment.amount) !== Number(order?.amount)
    || normalizeCurrency(payment.currency) !== normalizeCurrency(order?.currency)) {
    throw new PaymentValidationError('RAZORPAY_PAYMENT_MISMATCH');
  }
  return payment.id;
}

function validatePaytmPayment(order, body) {
  const paidSubunits = Math.round(Number(body?.txnAmount) * 100);
  if (body?.resultInfo?.resultStatus !== 'TXN_SUCCESS'
    || paidSubunits !== Number(order?.amount)
    || normalizeCurrency(body?.currency || order?.currency) !== normalizeCurrency(order?.currency)
    || !body?.txnId) {
    throw new PaymentValidationError('PAYTM_PAYMENT_MISMATCH');
  }
  return body.txnId;
}

function validatePhonePePayment(order, providerData) {
  const payment = providerData?.data || {};
  if (providerData?.success !== true || payment.state !== 'COMPLETED'
    || Number(payment.amount) !== Number(order?.amount)) {
    throw new PaymentValidationError('PHONEPE_PAYMENT_MISMATCH');
  }
  return payment?.paymentInstrument?.pgTransactionId || order?.providerOrderId;
}

function isDuplicateProviderEventError(error) {
  return error?.code === 6 || error?.code === 'already-exists';
}

function shouldReverseEntitlement(user, orderId) {
  return Boolean(user && user.lastPaymentOrderId === orderId);
}

function calculateMembershipEnd(existingValue, months, now = new Date()) {
  if (!Number.isInteger(months) || months < 1 || months > 600) throw new PaymentValidationError('INVALID_PLAN_DURATION');
  const existing = existingValue?.toDate?.() || new Date(existingValue || 0);
  const start = existing > now ? existing : now;
  const result = new Date(start);
  result.setMonth(result.getMonth() + months);
  return result;
}

module.exports = {
  PaymentValidationError,
  normalizeCurrency,
  safeEqual,
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
};
