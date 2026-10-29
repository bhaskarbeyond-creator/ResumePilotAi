'use strict';

/**
 * Admin coupon CRUD (FP-A14)
 *   GET    /api/admin/coupons          (requireAdmin)
 *   POST   /api/admin/coupons          (requireAdmin + system.config/write or super_admin)
 *   DELETE /api/admin/coupons/:id      (requireAdmin)
 *
 * Code validation: uppercase alphanumeric, 3-20 chars; duplicates -> 409 COUPON_ALREADY_EXISTS.
 * The repository layer is swapped for an in-memory double so no database is required.
 */

process.env.NODE_ENV = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const auth = require('../security/auth');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');

auth.setTokenVerifierForTests(async token => {
  const IDENTITIES = {
    admin: {
      uid: 'adm-1', email: 'admin@cc-local.test', role: 'ADMIN', email_verified: true,
    },
    superAdmin: {
      uid: 'sa-1', email: 'sa@cc-local.test', role: 'SUPER_ADMIN', email_verified: true,
    },
    employer: {
      uid: 'emp-1', email: 'employer@cc-local.test', role: 'EMPLOYER', email_verified: true,
    },
  };
  const identity = IDENTITIES[token];
  if (!identity) throw new Error('Unknown test token');
  return identity;
});

function bearer(token) { return `Bearer ${token}`; }

// ---------------------------------------------------------------------------
// In-memory repository double (coupons only)
// ---------------------------------------------------------------------------
function couponStore() {
  const coupons = new Map();
  return {
    async listCoupons() {
      return Array.from(coupons.values()).map(c => ({ ...c }));
    },
    async getCoupon(code) {
      return coupons.get(String(code).toUpperCase()) || null;
    },
    async saveCoupon(code, data) {
      const cCode = String(code).toUpperCase();
      const stored = {};
      coupons.set(cCode, { code: cCode, ...(typeof data === 'object' && data !== null ? data : {}), ...stored });
      return coupons.get(cCode);
    },
    async deleteCoupon(code) {
      const cCode = String(code).toUpperCase();
      coupons.delete(cCode);
      return { success: true, deleted: true, code: cCode };
    },
    clear() {
      coupons.clear();
    },
  };
}

let repository;
beforeEach(() => {
  repository = couponStore();
  setRepositoryForTests(repository);
});

afterEach(() => {
  resetRepositoryCacheForTests();
  repository = null;
});

const app = require('../index');

describe('Admin coupon CRUD (FP-A14)', () => {
  it('GET /api/admin/coupons requires authentication', async () => {
    const res = await request(app).get('/api/admin/coupons');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  it('GET /api/admin/coupons requires system.config.write (employer gets 403)', async () => {
    const res = await request(app).get('/api/admin/coupons').set('Authorization', bearer('employer'));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('GET /api/admin/coupons lists coupons for an admin', async () => {
    repository.saveCoupon('WELCOME10', { discountType: 'percentage', discountValue: 10, maxUses: 50 });
    const res = await request(app).get('/api/admin/coupons').set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.coupons[0].code, 'WELCOME10');
    assert.equal(res.body.coupons[0].discountType, 'percentage');
    assert.equal(res.body.coupons[0].discountValue, 10);
    assert.equal(res.body.coupons[0].active, true);
  });

  it('POST /api/admin/coupons requires authentication', async () => {
    const res = await request(app).post('/api/admin/coupons').send({ code: 'SUMMER22' });
    assert.equal(res.status, 401);
  });

  it('POST /api/admin/coupons requires system.config.write', async () => {
    const res = await request(app).post('/api/admin/coupons').set('Authorization', bearer('employer')).send({ code: 'SUMMER22' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/admin/coupons rejects malformed codes with 400', async () => {
    for (const code of ['ab', 'BAD CODE!', 'sign-up', '', 'A'.repeat(21)]) {
      const res = await request(app).post('/api/admin/coupons')
        .set('Authorization', bearer('admin'))
        .send({ code });
      assert.equal(res.status, 400, `expected 400 for code ${JSON.stringify(code)}`);
      assert.equal(res.body.error.code, 'INVALID_COUPON_CODE');
    }
  });

  it('POST /api/admin/coupons uppercases and strips whitespace from codes', async () => {
    const res = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: '  summer22 ', discountType: 'percentage', discountValue: 15 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.coupon.code, 'SUMMER22');
    assert.equal(res.body.coupon.discountType, 'percentage');
    assert.equal(res.body.coupon.discountValue, 15);
    assert.equal(res.body.coupon.active, true);
    assert.equal(res.body.coupon.usedCount, 0);
  });

  it('POST /api/admin/coupons rejects invalid discount fields', async () => {
    const res1 = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'PCTBAD', discountType: 'bogus', discountValue: 10 });
    assert.equal(res1.status, 400);
    assert.equal(res1.body.error.code, 'INVALID_COUPON_DISCOUNT');

    const res2 = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'FIXED10', discountType: 'fixed', discountValue: 0 });
    assert.equal(res2.status, 400);
    assert.equal(res2.body.error.code, 'INVALID_COUPON_DISCOUNT_VALUE');

    const res3 = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'USES5', discountType: 'percentage', discountValue: 10, maxUses: -1 });
    assert.equal(res3.status, 400);
    assert.equal(res3.body.error.code, 'INVALID_COUPON_MAX_USES');

    const res4 = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'EXP1', discountType: 'percentage', discountValue: 10, expiresAt: 'not-a-date' });
    assert.equal(res4.status, 400);
    assert.equal(res4.body.error.code, 'INVALID_COUPON_EXPIRY');
  });

  it('POST /api/admin/coupons returns 409 COUPON_ALREADY_EXISTS for duplicates', async () => {
    const res1 = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'DUPE42', discountType: 'fixed', discountValue: 5 });
    assert.equal(res1.status, 201);

    const res2 = await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'dupe42', discountType: 'percentage', discountValue: 99 });
    assert.equal(res2.status, 409, JSON.stringify(res2.body));
    assert.equal(res2.body.error.code, 'COUPON_ALREADY_EXISTS');
  });

  it('DELETE /api/admin/coupons/:code requires authentication and admin', async () => {
    const res1 = await request(app).delete('/api/admin/coupons/WELCOME10');
    assert.equal(res1.status, 401);

    const res2 = await request(app).delete('/api/admin/coupons/WELCOME10').set('Authorization', bearer('employer'));
    assert.equal(res2.status, 403);
  });

  it('DELETE /api/admin/coupons/:code deletes the coupon', async () => {
    await request(app).post('/api/admin/coupons')
      .set('Authorization', bearer('admin'))
      .send({ code: 'SUMMER22', discountType: 'percentage', discountValue: 25 });

    const listBefore = await request(app).get('/api/admin/coupons').set('Authorization', bearer('admin'));
    assert.equal(listBefore.body.count, 1);

    const res = await request(app).delete('/api/admin/coupons/summer22').set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.deleted, true);
    assert.equal(res.body.code, 'SUMMER22');

    const listAfter = await request(app).get('/api/admin/coupons').set('Authorization', bearer('admin'));
    assert.equal(listAfter.body.count, 0);
  });
});
