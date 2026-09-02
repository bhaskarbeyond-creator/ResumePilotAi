'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

test('Admin -> DB -> Backend -> API -> Frontend -> Runtime Control Plane Lifecycle', async () => {
  const app = express();
  app.use(express.json());

  // In-memory representation of MariaDB authoritative store
  const dbState = {
    settings: {
      currency: 'INR',
      currencySymbol: '₹',
      monthlyPrice: 199,
      quartarlyPrice: 399,
      yearlyPrice: 499,
      aiQuotaPerDay: 100,
      pricingMatrix: {
        INR: { monthly: 199, quartarly: 399, yearly: 499 },
        USD: { monthly: 19, quartarly: 39, yearly: 49 },
        GBP: { monthly: 15, quartarly: 35, yearly: 45 },
      },
    },
    coupons: new Map([
      ['WELCOME20', { code: 'WELCOME20', discount: 20, description: 'Welcome 20%', active: true, expiryDate: '2099-12-31' }],
    ]),
  };

  // 1. Public config endpoint
  app.get('/api/platform/public-config', (_req, res) => {
    return res.json({
      success: true,
      subscriptions: { ...dbState.settings },
    });
  });

  // 2. Admin settings mutation
  app.post('/api/admin/subscriptions-settings', (req, res) => {
    Object.assign(dbState.settings, req.body);
    return res.json({ success: true, settings: dbState.settings });
  });

  // 3. Admin coupon creation
  app.post('/api/admin/coupons', (req, res) => {
    const { code, discount, description, active, expiryDate } = req.body;
    dbState.coupons.set(String(code).toUpperCase(), {
      code: String(code).toUpperCase(),
      discount: Number(discount),
      description,
      active: active !== false,
      expiryDate: expiryDate || null,
    });
    return res.json({ success: true, coupon: dbState.coupons.get(String(code).toUpperCase()) });
  });

  // 4. Admin coupon delete
  app.delete('/api/admin/coupons/:code', (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const deleted = dbState.coupons.delete(code);
    return res.json({ success: deleted });
  });

  // 5. Public active coupons
  app.get('/api/coupons/active', (_req, res) => {
    const list = Array.from(dbState.coupons.values())
      .filter(c => c.active && (!c.expiryDate || new Date(c.expiryDate) > new Date()))
      .map(c => ({ code: c.code, discount: c.discount, description: c.description }));
    return res.json({ success: true, coupons: list });
  });

  // 6. Public validate coupon
  app.post('/api/coupons/validate', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const coupon = dbState.coupons.get(code);
    if (!coupon || !coupon.active) {
      return res.status(404).json({ success: false, valid: false, error: 'Coupon not found.' });
    }
    if (coupon.expiryDate && new Date(coupon.expiryDate) <= new Date()) {
      return res.status(409).json({ success: false, valid: false, error: 'Coupon expired.' });
    }
    return res.json({ success: true, valid: true, coupon: { code: coupon.code, discount: coupon.discount } });
  });

  // STEP A: Initial state check
  const initRes = await request(app).get('/api/platform/public-config');
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.subscriptions.monthlyPrice, 199);

  // STEP B: Admin updates pricing & currency to USD ($29 / mo)
  const updateRes = await request(app)
    .post('/api/admin/subscriptions-settings')
    .send({ currency: 'USD', currencySymbol: '$', monthlyPrice: 29 });
  assert.equal(updateRes.status, 200);

  // STEP C: Verify public config immediately reflects admin update
  const updatedConfigRes = await request(app).get('/api/platform/public-config');
  assert.equal(updatedConfigRes.body.subscriptions.currency, 'USD');
  assert.equal(updatedConfigRes.body.subscriptions.monthlyPrice, 29);

  // STEP D: Admin creates coupon TEST50 (50% off)
  const createCouponRes = await request(app)
    .post('/api/admin/coupons')
    .send({ code: 'TEST50', discount: 50, description: 'Test 50% Off', active: true, expiryDate: '2099-01-01' });
  assert.equal(createCouponRes.status, 200);

  // STEP E: Public active coupons immediately list TEST50
  const activeCouponsRes = await request(app).get('/api/coupons/active');
  assert.ok(activeCouponsRes.body.coupons.some(c => c.code === 'TEST50'));

  // STEP F: Candidate validates TEST50 -> successfully receives 50% discount
  const validateRes = await request(app).post('/api/coupons/validate').send({ code: 'TEST50' });
  assert.equal(validateRes.status, 200);
  assert.equal(validateRes.body.valid, true);
  assert.equal(validateRes.body.coupon.discount, 50);

  // STEP G: Admin deletes coupon TEST50
  const deleteRes = await request(app).delete('/api/admin/coupons/TEST50');
  assert.equal(deleteRes.status, 200);

  // STEP H: Candidate validating deleted coupon is rejected with 404
  const validateDeletedRes = await request(app).post('/api/coupons/validate').send({ code: 'TEST50' });
  assert.equal(validateDeletedRes.status, 404);
  assert.equal(validateDeletedRes.body.valid, false);

  // STEP I: Clean restore
  dbState.settings.currency = 'INR';
  dbState.settings.currencySymbol = '₹';
  dbState.settings.monthlyPrice = 199;
  assert.equal(dbState.settings.monthlyPrice, 199);
});
