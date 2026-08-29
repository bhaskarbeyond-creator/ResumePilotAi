'use strict';

const crypto = require('crypto');
const { validatePaytmPayment, validatePhonePePayment, safeEqual } = require('../security/payments');
const paymentActivation = require('./paymentActivation');

function webhookEventId(provider, orderId, paymentId) {
  const raw = `${provider}:${orderId}:${paymentId || 'unknown'}`;
  if (raw.length <= 128) return raw;
  return `${provider}:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

function paytmCallbackHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Payment update received</title></head><body><p>We received the Paytm payment update. If your payment succeeded, access will activate shortly. You can close this window and return to ResumePilot AI.</p></body></html>`;
}

function phonePeCallbackChecksum(base64Response, saltKey, saltIndex) {
  const digest = crypto.createHash('sha256').update(`${base64Response}${saltKey}`).digest('hex');
  return `${digest}###${saltIndex}`;
}

/**
 * Provider status calls run from the shared notification-outbox worker tick.
 * `timeout` is honoured by node-fetch v2 but silently ignored by the global
 * fetch (undici) that production actually passes in, so the same 10s bound is
 * also carried as an AbortSignal. Without it a slow or unreachable gateway can
 * pin the tick and stall every queued notification behind a payment probe.
 */
function providerRequestTimeout() {
  return (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
    ? { signal: AbortSignal.timeout(10_000) }
    : {};
}

async function queryPaytmOrderStatus({ orderId, config, fetchImpl = fetch }) {
  const mid = config.mid;
  const key = config.key;
  const verifyBody = JSON.stringify({ body: { mid, orderId } });
  const bodyBase64 = Buffer.from(verifyBody).toString('base64');
  const headerPayload = JSON.stringify({
    alg: 'HS256',
    version: 'v1',
    kid: mid,
    requesttimestamp: Math.floor(Date.now() / 1000).toString(),
    channelId: 'WEB',
  });
  const headerBase64 = Buffer.from(headerPayload).toString('base64');
  const signature = crypto.createHmac('sha256', key).update(`${headerBase64}.${bodyBase64}`).digest('base64');
  const providerRes = await fetchImpl(`${config.baseUrl}/v3/order/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${headerBase64}.${bodyBase64}.${signature}`,
    },
    body: verifyBody,
    timeout: 10_000,
    ...providerRequestTimeout(),
  });
  const providerData = await providerRes.json().catch(() => ({}));
  if (!providerRes.ok) {
    throw Object.assign(new Error('PAYTM_PROVIDER_ERROR'), { code: 'PAYTM_STATUS_UNAVAILABLE', status: 502 });
  }
  return providerData;
}

async function queryPhonePeOrderStatus({ orderId, config, fetchImpl = fetch }) {
  const path = `/pg/v1/status/${config.merchantId}/${orderId}`;
  const checksum = `${crypto.createHash('sha256').update(`${path}${config.saltKey}`).digest('hex')}###${config.saltIndex}`;
  const providerRes = await fetchImpl(`${config.baseUrl}/pg/v1/status/${encodeURIComponent(config.merchantId)}/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': config.merchantId,
      Accept: 'application/json',
    },
    timeout: 10_000,
    ...providerRequestTimeout(),
  });
  const providerData = await providerRes.json().catch(() => ({}));
  if (!providerRes.ok) {
    throw Object.assign(new Error('PHONEPE_PROVIDER_ERROR'), { code: 'PHONEPE_STATUS_UNAVAILABLE', status: 502 });
  }
  return providerData;
}

async function confirmAndActivate({
  orderId,
  provider,
  gatewayLabel,
  statusPayload,
  validate,
  eventType,
  activation = paymentActivation,
}) {
  const order = await activation.getOrder(orderId);
  if (!order || String(order.provider || '').toLowerCase() !== provider) {
    throw Object.assign(new Error('ORDER_NOT_FOUND'), { code: 'ORDER_NOT_FOUND', status: 404 });
  }
  const providerPaymentId = validate(order, statusPayload);
  const eventId = webhookEventId(provider, orderId, providerPaymentId);
  const claimed = await activation.claimWebhookEvent({
    eventId,
    provider,
    eventType,
    orderId,
  });
  if (claimed.duplicate) return { duplicate: true, orderId, providerPaymentId };
  try {
    const activated = await activation.activateVerifiedOrder({
      orderId,
      gatewayLabel,
      providerPaymentId,
    });
    return { duplicate: false, orderId, providerPaymentId, activated };
  } catch (error) {
    await activation.releaseWebhookEvent(eventId).catch(releaseError => {
      console.error(`[${provider} callback] event release failed:`, releaseError.message);
    });
    throw error;
  }
}

async function activatePaytmFromStatus({ orderId, statusPayload, activation }) {
  const body = statusPayload?.body || statusPayload || {};
  return confirmAndActivate({
    orderId,
    provider: 'paytm',
    gatewayLabel: 'Paytm',
    statusPayload: body,
    validate: validatePaytmPayment,
    eventType: 'paytm.callback',
    activation,
  });
}

async function activatePhonePeFromStatus({ orderId, statusPayload, activation }) {
  return confirmAndActivate({
    orderId,
    provider: 'phonepe',
    gatewayLabel: 'PhonePe',
    statusPayload,
    validate: validatePhonePePayment,
    eventType: 'phonepe.callback',
    activation,
  });
}

function verifyPhonePeCallbackSignature({ base64Response, header, config }) {
  if (!config?.saltKey || !Number.isSafeInteger(config.saltIndex) || config.saltIndex < 1) {
    throw Object.assign(new Error('PAYMENT_PROVIDER_UNAVAILABLE'), { code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 });
  }
  const expected = phonePeCallbackChecksum(base64Response, config.saltKey, config.saltIndex);
  if (!safeEqual(String(header || ''), expected)) {
    throw Object.assign(new Error('PHONEPE_SIGNATURE_INVALID'), { code: 'PHONEPE_SIGNATURE_INVALID', status: 400 });
  }
}

async function handlePaytmCallback({ orderId, getPaytmConfig, fetchImpl = fetch, activation = paymentActivation }) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(orderId || ''))) return { skipped: 'INVALID_ORDER' };
  const config = await getPaytmConfig();
  if (!config?.mid || !config?.key) return { skipped: 'NOT_CONFIGURED' };
  const providerData = await queryPaytmOrderStatus({ orderId, config, fetchImpl });
  return activatePaytmFromStatus({ orderId, statusPayload: providerData, activation });
}

async function handlePhonePeCallback({
  base64Response,
  verifyHeader,
  getPhonePeConfig,
  fetchImpl = fetch,
  activation = paymentActivation,
}) {
  const config = await getPhonePeConfig();
  verifyPhonePeCallbackSignature({ base64Response, header: verifyHeader, config });
  let decoded = {};
  try {
    decoded = JSON.parse(Buffer.from(String(base64Response), 'base64').toString('utf8'));
  } catch {
    decoded = {};
  }
  const orderId = String(decoded?.data?.merchantTransactionId || decoded?.merchantTransactionId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
    throw Object.assign(new Error('INVALID_ORDER'), { code: 'INVALID_ORDER', status: 400 });
  }
  const providerData = await queryPhonePeOrderStatus({ orderId, config, fetchImpl });
  return activatePhonePeFromStatus({ orderId, statusPayload: providerData, activation });
}

async function reconcilePendingIndianGatewayOrders({
  pool,
  getPaytmConfig,
  getPhonePeConfig,
  fetchImpl = fetch,
  activation = paymentActivation,
  limit = 25,
} = {}) {
  if (!pool) return { processed: 0, examined: 0 };
  const batchSize = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 50) : 25;
  const [rows] = await pool.query(
    `SELECT id, provider FROM payment_orders
     WHERE provider IN ('paytm', 'phonepe')
       AND status IN ('PENDING_PAYMENT', 'PAYMENT_CREATED')
     ORDER BY created_at ASC
     LIMIT ?`,
    [batchSize]
  );
  const pending = Array.isArray(rows) ? rows : [];
  if (!pending.length) return { processed: 0, examined: 0 };

  // Credentials are resolved at most once per provider per reconciliation pass.
  // Provider configuration lives in `system_settings` and cannot change while a
  // single pass is running, so re-reading it for every pending order previously
  // multiplied an identical, cacheable read across the whole batch (2 x N extra
  // pool round trips per tick) and starved the shared user-facing pool. The
  // resolved value — including a resolution failure — is memoized for this pass
  // only, so no stale credential is ever reused across ticks.
  const configs = new Map();
  const resolveConfig = (provider, loader) => {
    if (!configs.has(provider)) {
      configs.set(provider, Promise.resolve().then(() => loader()).catch(error => ({ reconcileConfigError: error })));
    }
    return configs.get(provider);
  };

  let processed = 0;
  for (const row of pending) {
    try {
      if (row.provider === 'paytm') {
        const config = await resolveConfig('paytm', getPaytmConfig);
        if (config?.reconcileConfigError) throw config.reconcileConfigError;
        if (!config?.mid || !config?.key) continue;
        const statusPayload = await queryPaytmOrderStatus({ orderId: row.id, config, fetchImpl });
        await activatePaytmFromStatus({ orderId: row.id, statusPayload, activation });
        processed += 1;
      } else if (row.provider === 'phonepe') {
        const config = await resolveConfig('phonepe', getPhonePeConfig);
        if (config?.reconcileConfigError) throw config.reconcileConfigError;
        if (!config?.merchantId || !config?.saltKey || !Number.isSafeInteger(config.saltIndex) || config.saltIndex < 1) continue;
        const statusPayload = await queryPhonePeOrderStatus({ orderId: row.id, config, fetchImpl });
        await activatePhonePeFromStatus({ orderId: row.id, statusPayload, activation });
        processed += 1;
      }
    } catch (error) {
      console.warn('[payments] indian-gateway reconcile', row.provider, row.id, error.code || error.message);
    }
  }
  return { processed, examined: pending.length };
}

module.exports = {
  webhookEventId,
  paytmCallbackHtml,
  phonePeCallbackChecksum,
  queryPaytmOrderStatus,
  queryPhonePeOrderStatus,
  activatePaytmFromStatus,
  activatePhonePeFromStatus,
  verifyPhonePeCallbackSignature,
  handlePaytmCallback,
  handlePhonePeCallback,
  reconcilePendingIndianGatewayOrders,
};
