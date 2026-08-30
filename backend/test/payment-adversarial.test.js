'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

describe('Payment Provider Adversarial Testing', () => {
    let server, baseUrl;
    
    before(async () => {
        const app = require('../index.js');
        server = app.listen(0);
        await new Promise(resolve => server.once('listening', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    
    after(() => server?.close());
    
    async function request(path, method = 'POST', body = null, headers = {}) {
        return new Promise((resolve) => {
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json', ...headers },
            };
            const req = http.request(baseUrl + path, opts, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let json;
                    try { json = JSON.parse(data); } catch { json = data; }
                    resolve({ status: res.statusCode, body: json });
                });
            });
            req.on('error', (err) => resolve({ status: 0, error: err.message }));
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }
    
    describe('PayPal verify adversarial', () => {
        // PayPal verify requires auth - all requests without auth get 401
        it('returns 401 without auth', async () => {
            const res = await request('/api/paypal/verify', 'POST', { orderId: 'test123', paymentOrderId: 'test123' });
            assert.equal(res.status, 401);
        });
        
        it('returns 401 with empty body', async () => {
            const res = await request('/api/paypal/verify', 'POST', {});
            assert.equal(res.status, 401);
        });
        
        it('returns 401 with null fields', async () => {
            const res = await request('/api/paypal/verify', 'POST', { orderId: null, paymentOrderId: null });
            assert.equal(res.status, 401);
        });
    });
    
    describe('Razorpay verify adversarial', () => {
        // Razorpay verify requires auth - all requests without auth get 401
        it('returns 401 without auth', async () => {
            const res = await request('/api/razorpay/verify-payment', 'POST', {
                razorpay_order_id: 'order_123',
                razorpay_payment_id: 'pay_123',
                razorpay_signature: 'sig_123',
                paymentOrderId: 'order_123'
            });
            assert.equal(res.status, 401);
        });
        
        it('returns 401 with empty body', async () => {
            const res = await request('/api/razorpay/verify-payment', 'POST', {});
            assert.equal(res.status, 401);
        });
    });
    
    describe('Paytm initiate adversarial', () => {
        it('returns 401 without auth', async () => {
            const res = await request('/api/paytm/initiate-transaction', 'POST', { planId: 'monthly' });
            assert.equal(res.status, 401);
        });
    });
    
    describe('Paytm verify adversarial', () => {
        it('returns 401 without auth', async () => {
            const res = await request('/api/paytm/verify-transaction', 'POST', { orderId: 'test123' });
            assert.equal(res.status, 401);
        });
    });
    
    describe('PhonePe initiate adversarial', () => {
        it('returns 401 without auth', async () => {
            const res = await request('/api/phonepe/initiate', 'POST', { planId: 'monthly' });
            assert.equal(res.status, 401);
        });
    });
    
    describe('PhonePe status adversarial', () => {
        it('returns 401 without auth', async () => {
            const res = await request('/api/phonepe/status', 'POST', { orderId: 'test123' });
            assert.equal(res.status, 401);
        });
    });
    
    describe('Stripe webhook adversarial', () => {
        it('rejects missing signature', async () => {
            const res = await request('/api/stripe-webhook', 'POST', { type: 'payment_intent.succeeded' });
            assert.equal(res.status, 400);
        });
    });
    
    describe('Payment orders adversarial', () => {
        it('returns 401 without auth for payment-orders', async () => {
            const res = await request('/api/payment-orders', 'GET');
            assert.equal(res.status, 401);
        });
        
        it('returns 401 without auth for payment-orders/:id', async () => {
            const res = await request('/api/payment-orders/test123', 'GET');
            assert.equal(res.status, 401);
        });
    });
    
    describe('Entitlement check adversarial', () => {
        it('returns 401 without auth for check', async () => {
            const res = await request('/api/check', 'POST', {});
            assert.equal(res.status, 401);
        });
    });
    
    describe('Subscription preferences adversarial', () => {
        it('returns 410 without auth (public retired endpoint, matches baseline)', async () => {
            const res = await request('/api/subscription/preferences', 'POST', {});
            assert.equal(res.status, 410);
        });
    });
    
    describe('Legacy razorpay-order adversarial', () => {
        it('returns 410 without auth (public retired endpoint, matches baseline)', async () => {
            const res = await request('/api/payment/razorpay-order', 'POST', {});
            assert.equal(res.status, 410);
        });
    });
});
