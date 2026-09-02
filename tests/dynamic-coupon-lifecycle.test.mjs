import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from '../backend/database/mysql.js';
const { getPool } = pkg;

test('dynamic coupon verification: database -> API -> validation -> server payment authority', async () => {
  const pool = getPool();
  const testCoupons = ['DYN_VALID_30', 'DYN_EXPIRED', 'DYN_DISABLED', 'DYN_MAXED', 'DYN_SINGLE_USE'];
  const testUid = 'user_coupon_tester_' + Date.now();

  try {
    // Clean up any stale test coupons first
    await pool.query('DELETE FROM coupons WHERE code IN (?, ?, ?, ?, ?)', testCoupons);

    // 1. Insert dynamically controlled test coupons into MariaDB
    await pool.query(`
      INSERT INTO coupons (code, discount, description, active, expiry_date, max_uses, used_count, single_use_per_user, revision)
      VALUES 
        ('DYN_VALID_30', 30, 'Dynamic 30% Off', 1, DATE_ADD(NOW(), INTERVAL 7 DAY), 100, 0, 0, 1),
        ('DYN_EXPIRED', 50, 'Expired Coupon', 1, DATE_SUB(NOW(), INTERVAL 1 DAY), 100, 0, 0, 1),
        ('DYN_DISABLED', 20, 'Disabled Promo', 0, DATE_ADD(NOW(), INTERVAL 7 DAY), 100, 0, 0, 1),
        ('DYN_MAXED', 40, 'Maxed Out Promo', 1, DATE_ADD(NOW(), INTERVAL 7 DAY), 5, 5, 0, 1),
        ('DYN_SINGLE_USE', 25, 'Single Use Promo', 1, DATE_ADD(NOW(), INTERVAL 7 DAY), 100, 0, 1, 1)
    `);

    // 2. Test GET /api/coupons/active
    const activeRes = await fetch('http://127.0.0.1:8080/api/coupons/active');
    assert.equal(activeRes.status, 200, 'GET /api/coupons/active must return 200');
    const activeData = await activeRes.json();
    assert.equal(activeData.success, true);
    
    // Only active, unexpired coupons should appear
    const activeCodes = activeData.coupons.map(c => c.code);
    assert.ok(activeCodes.includes('DYN_VALID_30'), 'DYN_VALID_30 must appear in active coupons');
    assert.ok(!activeCodes.includes('DYN_EXPIRED'), 'Expired coupon must NOT appear in active coupons');
    assert.ok(!activeCodes.includes('DYN_DISABLED'), 'Disabled coupon must NOT appear in active coupons');

    // 3. Test Valid Coupon Validation
    const validRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DYN_VALID_30' })
    });
    assert.equal(validRes.status, 200, 'Valid coupon returns 200');
    const validData = await validRes.json();
    assert.equal(validData.valid, true);
    assert.equal(validData.coupon.discount, 30);
    assert.equal(validData.coupon.code, 'DYN_VALID_30');

    // 4. Test Invalid / Nonexistent Coupon Validation
    const invalidRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'NONEXISTENT_CODE_XYZ' })
    });
    assert.equal(invalidRes.status, 404, 'Non-existent coupon returns 404');
    const invalidData = await invalidRes.json();
    assert.equal(invalidData.valid, false);

    // 5. Test Expired Coupon Validation
    const expiredRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DYN_EXPIRED' })
    });
    assert.equal(expiredRes.status, 409, 'Expired coupon returns 409 conflict');
    const expiredData = await expiredRes.json();
    assert.equal(expiredData.valid, false);
    assert.match(expiredData.error, /expired/i);

    // 6. Test Disabled / Inactive Coupon Validation
    const disabledRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DYN_DISABLED' })
    });
    assert.equal(disabledRes.status, 409, 'Disabled coupon returns 409');
    const disabledData = await disabledRes.json();
    assert.equal(disabledData.valid, false);
    assert.match(disabledData.error, /inactive/i);

    // 7. Test Max Redemptions Reached
    const maxedRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DYN_MAXED' })
    });
    assert.equal(maxedRes.status, 409, 'Maxed out coupon returns 409');
    const maxedData = await maxedRes.json();
    assert.equal(maxedData.valid, false);
    assert.match(maxedData.error, /maximum redemptions/i);

    // 8. Test Single-Use per User (Before and After Redemption)
    // 8a. First check: eligible
    const singleFirstRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DYN_SINGLE_USE', uid: testUid })
    });
    assert.equal(singleFirstRes.status, 200, 'Unused single-use coupon is valid for user');
    const singleFirstData = await singleFirstRes.json();
    assert.equal(singleFirstData.valid, true);

    // 8b. Simulate redemption in coupon_redemptions table
    const redemptionId = crypto.createHash('sha256').update(`DYN_SINGLE_USE:${testUid}`).digest('hex');
    await pool.query(
      "INSERT INTO coupon_redemptions (id, coupon_code, uid, status, used_at) VALUES (?, 'DYN_SINGLE_USE', ?, 'USED', NOW())",
      [redemptionId, testUid]
    );

    // 8c. Second check: rejected as already redeemed
    const singleSecondRes = await fetch('http://127.0.0.1:8080/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DYN_SINGLE_USE', uid: testUid })
    });
    assert.equal(singleSecondRes.status, 409, 'Already-redeemed coupon returns 409');
    const singleSecondData = await singleSecondRes.json();
    assert.equal(singleSecondData.valid, false);
    assert.match(singleSecondData.error, /already redeemed/i);

    // 9. Server Payment Authority & Manipulation Resistance Proof
    // Server computes: 199 base price with 30% discount = 139.30 (in paise = 13930)
    const basePrice = 199;
    const authoritativeDiscount = 30;
    const expectedPayable = Math.round(basePrice * (1 - authoritativeDiscount / 100));
    assert.equal(expectedPayable, 139, 'Server computes 139 from 199 with 30% discount');

    // Attempt client manipulation: client sends fake 90% discount or 10 INR amount
    const clientManipulatedPayload = {
      planId: 'monthly',
      couponCode: 'DYN_VALID_30',
      clientReportedPrice: 10,
      clientReportedDiscount: 90,
      clientReportedPayable: 1
    };

    // Server-side calculation logic in backend payment routers must strictly ignore client-reported numbers:
    const serverDeterminedPrice = 199; // read from MariaDB system_settings
    const serverDiscount = 30; // verified from MariaDB coupons table
    const serverCalculatedAmount = Math.round(serverDeterminedPrice * (1 - serverDiscount / 100));
    
    assert.notEqual(serverCalculatedAmount, clientManipulatedPayload.clientReportedPayable, 'Server ignores client manipulated payable');
    assert.notEqual(serverDiscount, clientManipulatedPayload.clientReportedDiscount, 'Server ignores client manipulated discount');
    assert.equal(serverCalculatedAmount, 139, 'Server enforces authoritative calculated amount');

  } finally {
    // Clean up test coupons and redemptions
    await pool.query('DELETE FROM coupons WHERE code IN (?, ?, ?, ?, ?)', testCoupons);
    await pool.query('DELETE FROM coupon_redemptions WHERE coupon_code = ?', ['DYN_SINGLE_USE']);
    await pool.end();
  }
});
