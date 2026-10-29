'use strict';

const express = require('express');

const { requireAdmin } = require('../security/auth');
const { getRepository } = require('../repositories');

const router = express.Router();
router.use((req, res, next) => {
    try {
    req.repository = getRepository();
    next();
  } catch (_err) {
    return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The coupon store is unavailable.', requestId: res.locals?.requestId || null } });
  }
});

const COUPON_CODE_REGEX = /^[A-Z0-9]{3,20}$/;

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message, requestId: res.locals?.requestId || null } });
}

function couponView(coupon) {
  if (!coupon) return null;
  return {
    code: String(coupon.code || ''),
    discountType: coupon.discountType || 'percentage',
    discountValue: Number(coupon.discountValue || coupon.discount || 0),
    maxUses: coupon.maxUses === null || coupon.maxUses === undefined ? null : Number(coupon.maxUses || 0),
    expiresAt: coupon.expiresAt || null,
    active: coupon.active !== false,
    usedCount: Number(coupon.usedCount || 0),
    redemptionCount: Number(coupon.redemptionCount || 0),
    createdAt: coupon.createdAt || null,
    updatedAt: coupon.updatedAt || null,
  };
}

// GET /api/admin/coupons - List all coupons with usage statistics (requireAdmin).
router.get('/', requireAdmin, async (req, res) => {
  try {
    const repository = req.repository;
    const coupons = typeof repository.listCoupons === 'function'
      ? await repository.listCoupons()
      : [];
    return res.json({ success: true, coupons: coupons.map(couponView), count: coupons.length });
  } catch (error) {
    return res.status(503).json({ error: { code: 'COUPON_LIST_FAILED', message: 'Coupons could not be listed.', requestId: res.locals?.requestId || null } });
  }
});

// POST /api/admin/coupons - Create a coupon (requires system.config.write or super_admin).
router.post('/', requireAdmin, async (req, res) => {
  try {
    const repository = req.repository;
    const body = req.body || {};
    const code = String(body.code || '').toUpperCase().replace(/\s+/g, '');
    if (!COUPON_CODE_REGEX.test(code)) {
      return fail(res, 400, 'INVALID_COUPON_CODE', 'Code must be uppercase alphanumeric and between 3 and 20 characters.');
    }
    const discountType = body.discountType;
    if (discountType !== 'percentage' && discountType !== 'fixed') {
      return fail(res, 400, 'INVALID_COUPON_DISCOUNT', 'discountType must be percentage or fixed.');
    }
    const discountValue = Number(body.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return fail(res, 400, 'INVALID_COUPON_DISCOUNT_VALUE', 'discountValue must be a number greater than 0.');
    }
    let maxUses = null;
    if (body.maxUses !== undefined && body.maxUses !== null) {
      maxUses = Number(body.maxUses);
      if (!Number.isInteger(maxUses) || maxUses < 1) {
        return fail(res, 400, 'INVALID_COUPON_MAX_USES', 'maxUses must be a positive integer.');
      }
    }
    let expiresAt = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null) {
      expiresAt = String(body.expiresAt);
      if (isNaN(Date.parse(expiresAt))) {
        return fail(res, 400, 'INVALID_COUPON_EXPIRY', 'expiresAt must be an ISO date string.');
      }
    }

    const existing = await repository.getCoupon(code);
    if (existing) {
      return fail(res, 409, 'COUPON_ALREADY_EXISTS', `Coupon code ${code} already exists.`);
    }

    const saved = await repository.saveCoupon(code, {
      discountType,
      discountValue,
      maxUses: maxUses || 0,
      expiresAt,
      active: true,
      usedCount: 0,
      revision: 1,
    });

    return res.status(201).json({ success: true, coupon: couponView(saved) });
  } catch (error) {
    return res.status(503).json({ error: { code: 'COUPON_CREATE_FAILED', message: 'Coupon could not be created.', requestId: res.locals?.requestId || null } });
  }
});

// DELETE /api/admin/coupons/:id - Deactivate/delete a coupon (requires system.config.write).
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const repository = req.repository;
    const code = String(req.params.id || '').toUpperCase().replace(/\s+/g, '');
    if (!COUPON_CODE_REGEX.test(code)) {
      return fail(res, 400, 'INVALID_COUPON_CODE', 'Invalid coupon code.');
    }
    await repository.deleteCoupon(code);
    return res.json({ success: true, deleted: true, code });
  } catch (error) {
    return res.status(503).json({ error: { code: 'COUPON_DELETE_FAILED', message: 'Coupon could not be deleted.', requestId: res.locals?.requestId || null } });
  }
});

module.exports = { couponsRouter: router };
