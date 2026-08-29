'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  webhookEventId,
  phonePeCallbackChecksum,
  handlePaytmCallback,
  handlePhonePeCallback,
  reconcilePendingIndianGatewayOrders,
  paytmCallbackHtml,
} = require('../services/indianGatewayActivation');

function paytmStatusBody(orderId, txnId = 'TXN-1') {
  return {
    body: {
      resultInfo: { resultStatus: 'TXN_SUCCESS' },
      txnAmount: '499.00',
      orderId,
      txnId,
    },
  };
}

function phonePeStatusBody(orderId, paymentId = 'PAY-1') {
  return {
    success: true,
    data: {
      merchantTransactionId: orderId,
      state: 'COMPLETED',
      amount: 49900,
      paymentInstrument: { pgTransactionId: paymentId },
    },
  };
}

function mockActivation({ duplicate = false } = {}) {
  const calls = { claim: [], activate: [], release: [] };
  return {
    calls,
    getOrder: async (id) => ({
      id,
      provider: id.startsWith('pp_') ? 'phonepe' : 'paytm',
      amount: 49900,
      currency: 'INR',
      providerOrderId: id,
    }),
    claimWebhookEvent: async (payload) => {
      calls.claim.push(payload);
      return { duplicate };
    },
    activateVerifiedOrder: async (payload) => {
      calls.activate.push(payload);
      return { activated: true };
    },
    releaseWebhookEvent: async (eventId) => {
      calls.release.push(eventId);
      return { released: true };
    },
  };
}

describe('indian gateway webhook activation', () => {
  it('hashes oversized webhook event ids to 128 characters', () => {
    const eventId = webhookEventId('paytm', 'o'.repeat(80), 't'.repeat(80));
    assert.equal(eventId.length <= 128, true);
    assert.match(eventId, /^paytm:[a-f0-9]{64}$/);
  });

  it('always returns a user-visible Paytm HTML acknowledgement', () => {
    assert.match(paytmCallbackHtml(), /Payment update received/);
  });

  it('claims then activates a Paytm callback after a live status query', async () => {
    const activation = mockActivation();
    const fetchImpl = async () => ({
      ok: true,
      json: async () => paytmStatusBody('ord_paytm_1'),
    });
    const result = await handlePaytmCallback({
      orderId: 'ord_paytm_1',
      getPaytmConfig: async () => ({ mid: 'MID', key: 'secret', baseUrl: 'https://securegw-stage.paytm.in' }),
      fetchImpl,
      activation,
    });
    assert.equal(result.duplicate, false);
    assert.equal(activation.calls.claim[0].eventId, 'paytm:ord_paytm_1:TXN-1');
    assert.equal(activation.calls.claim[0].eventType, 'paytm.callback');
    assert.equal(activation.calls.activate[0].gatewayLabel, 'Paytm');
    assert.equal(activation.calls.activate[0].providerPaymentId, 'TXN-1');
    assert.equal(activation.calls.release.length, 0);
  });

  it('is idempotent when the Paytm webhook event was already claimed', async () => {
    const activation = mockActivation({ duplicate: true });
    const result = await handlePaytmCallback({
      orderId: 'ord_paytm_1',
      getPaytmConfig: async () => ({ mid: 'MID', key: 'secret', baseUrl: 'https://securegw-stage.paytm.in' }),
      fetchImpl: async () => ({ ok: true, json: async () => paytmStatusBody('ord_paytm_1') }),
      activation,
    });
    assert.equal(result.duplicate, true);
    assert.equal(activation.calls.activate.length, 0);
  });

  it('releases the Paytm webhook claim when activation fails', async () => {
    const activation = mockActivation();
    activation.activateVerifiedOrder = async () => {
      throw Object.assign(new Error('boom'), { code: 'ACTIVATION_FAILED' });
    };
    await assert.rejects(
      () => handlePaytmCallback({
        orderId: 'ord_paytm_1',
        getPaytmConfig: async () => ({ mid: 'MID', key: 'secret', baseUrl: 'https://securegw-stage.paytm.in' }),
        fetchImpl: async () => ({ ok: true, json: async () => paytmStatusBody('ord_paytm_1') }),
        activation,
      }),
      /boom/
    );
    assert.equal(activation.calls.release[0], 'paytm:ord_paytm_1:TXN-1');
  });

  it('rejects PhonePe callbacks with a forged X-VERIFY header', async () => {
    await assert.rejects(
      () => handlePhonePeCallback({
        base64Response: Buffer.from(JSON.stringify(phonePeStatusBody('pp_1'))).toString('base64'),
        verifyHeader: 'forged###1',
        getPhonePeConfig: async () => ({ merchantId: 'M1', saltKey: 'salt', saltIndex: 1, baseUrl: 'https://api-preprod.phonepe.com' }),
        activation: mockActivation(),
      }),
      (error) => error.code === 'PHONEPE_SIGNATURE_INVALID' && error.status === 400
    );
  });

  it('ignores the PhonePe callback payload and activates from the status API', async () => {
    const activation = mockActivation();
    const orderId = 'pp_order_1';
    const callbackBody = {
      success: true,
      data: { merchantTransactionId: orderId, state: 'COMPLETED', amount: 1, paymentInstrument: { pgTransactionId: 'CALLBACK-LIE' } },
    };
    const base64Response = Buffer.from(JSON.stringify(callbackBody)).toString('base64');
    const verifyHeader = phonePeCallbackChecksum(base64Response, 'salt', 1);
    const fetchImpl = async () => ({
      ok: true,
      json: async () => phonePeStatusBody(orderId, 'STATUS-TXN'),
    });
    const result = await handlePhonePeCallback({
      base64Response,
      verifyHeader,
      getPhonePeConfig: async () => ({ merchantId: 'M1', saltKey: 'salt', saltIndex: 1, baseUrl: 'https://api-preprod.phonepe.com' }),
      fetchImpl,
      activation,
    });
    assert.equal(result.providerPaymentId, 'STATUS-TXN');
    assert.equal(activation.calls.claim[0].eventId, 'phonepe:pp_order_1:STATUS-TXN');
    assert.equal(activation.calls.claim[0].eventType, 'phonepe.callback');
    assert.equal(activation.calls.activate[0].gatewayLabel, 'PhonePe');
  });

  it('reconciles pending Paytm and PhonePe orders from the outbox worker query', async () => {
    const activation = mockActivation();
    const pool = {
      query: async () => [[
        { id: 'ord_paytm_1', provider: 'paytm' },
        { id: 'pp_order_1', provider: 'phonepe' },
      ]],
    };
    const fetchImpl = async (url) => {
      if (String(url).includes('/v3/order/status')) {
        return { ok: true, json: async () => paytmStatusBody('ord_paytm_1') };
      }
      return { ok: true, json: async () => phonePeStatusBody('pp_order_1') };
    };
    const result = await reconcilePendingIndianGatewayOrders({
      pool,
      getPaytmConfig: async () => ({ mid: 'MID', key: 'secret', baseUrl: 'https://securegw-stage.paytm.in' }),
      getPhonePeConfig: async () => ({ merchantId: 'M1', saltKey: 'salt', saltIndex: 1, baseUrl: 'https://api-preprod.phonepe.com' }),
      fetchImpl,
      activation,
    });
    assert.equal(result.processed, 2);
    assert.equal(activation.calls.activate.length, 2);
  });

  it('HMAC-signs Paytm status the same way as /api/paytm/verify-transaction', async () => {
    const seen = {};
    const fetchImpl = async (url, options) => {
      seen.url = url;
      seen.auth = options.headers.Authorization;
      seen.body = options.body;
      return { ok: true, json: async () => paytmStatusBody('ord_paytm_1') };
    };
    await handlePaytmCallback({
      orderId: 'ord_paytm_1',
      getPaytmConfig: async () => ({ mid: 'MID', key: 'secret', baseUrl: 'https://securegw-stage.paytm.in' }),
      fetchImpl,
      activation: mockActivation(),
    });
    const verifyBody = JSON.stringify({ body: { mid: 'MID', orderId: 'ord_paytm_1' } });
    const bodyBase64 = Buffer.from(verifyBody).toString('base64');
    assert.equal(seen.body, verifyBody);
    assert.equal(seen.url, 'https://securegw-stage.paytm.in/v3/order/status');
    assert.match(seen.auth, new RegExp(`^Bearer [A-Za-z0-9+/=]+\\.${bodyBase64.replace(/[+/=]/g, '\\$&')}\\.`));
    const [, headerB64, bodyB64, sig] = seen.auth.match(/^Bearer ([^.]+)\.([^.]+)\.(.+)$/);
    const expected = crypto.createHmac('sha256', 'secret').update(`${headerB64}.${bodyB64}`).digest('base64');
    assert.equal(sig, expected);
  });
});
