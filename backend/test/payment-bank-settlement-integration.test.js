'use strict';

process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_AUTH_VERIFIER = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const { setTokenVerifierForTests } = require('../security/auth');
const fixtures = require('./helpers/mandate11a');

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

const runId = Date.now().toString(36);
const adminUid = `admin_settle_${runId}`;
const superAdminUid = `sa_settle_${runId}`;
const regularUserUid = `user_settle_${runId}`;

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === adminUid) {
    return {
      uid: adminUid,
      email: `${adminUid}@ime365.test`,
      email_verified: true,
      role: 'ADMIN',
      auth_time: now,
    };
  }
  if (token === superAdminUid) {
    return {
      uid: superAdminUid,
      email: `${superAdminUid}@ime365.test`,
      email_verified: true,
      role: 'SUPER_ADMIN',
      auth_time: now,
    };
  }
  if (token === regularUserUid) {
    return {
      uid: regularUserUid,
      email: `${regularUserUid}@ime365.test`,
      email_verified: true,
      role: 'USER',
      auth_time: now,
    };
  }
  return null;
});

function authHeaders(uid) {
  return {
    Authorization: `Bearer ${uid}`,
  };
}

test('FP-G15: /api/admin/billing/settlements RBAC guards reject unauthenticated & unauthorized callers', async () => {
  const unauth = await request(app).get('/api/admin/billing/settlements');
  assert.equal(unauth.status, 401);

  const forbidden = await request(app)
    .get('/api/admin/billing/settlements')
    .set(authHeaders(regularUserUid));
  assert.equal(forbidden.status, 403);
});

test('FP-G15: records verified bank settlement payout with mathematical integrity and UTR', async () => {
  const pool = getPool();
  const testOrderId = `ord_settle_${runId}_1`;

  // Seed test payment order
  await pool.query(
    `INSERT INTO payment_orders (
      id, uid, plan_id, provider, amount, currency, status,
      settlement_status, created_at, updated_at
    ) VALUES (?, ?, 'PRO_MONTHLY', 'razorpay', 1999.00, 'INR', 'ACTIVE', 'UNSETTLED', NOW(3), NOW(3))`,
    [testOrderId, regularUserUid]
  );

  const settlementId = `setl_rzp_${runId}_001`;
  const gross = 1999.00;
  const fee = 39.98;
  const tax = 7.20;
  const net = 1951.82;
  const utr = `CMS${runId.toUpperCase()}98765432`;

  const res = await request(app)
    .post('/api/admin/billing/settlements/record')
    .set(authHeaders(superAdminUid))
    .send({
      provider: 'razorpay',
      settlementId,
      grossAmount: gross,
      feeAmount: fee,
      taxAmount: tax,
      netAmount: net,
      currency: 'INR',
      status: 'SETTLED',
      bankUtr: utr,
      bankAccountLast4: '4321',
      settledAt: new Date().toISOString(),
      orderIds: [testOrderId],
      metadata: { gatewayBatch: 'BATCH-2026-X1' },
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.duplicate, false);
  assert.equal(res.body.settlement.settlementId, settlementId);
  assert.equal(res.body.settlement.bankUtr, utr);
  assert.equal(res.body.settlement.reconciledOrderCount, 1);

  // Verify database state for settlement order
  const [orderRows] = await pool.query(
    'SELECT settlement_status, settled_at, settlement_id FROM payment_orders WHERE id = ?',
    [testOrderId]
  );
  assert.equal(orderRows.length, 1);
  assert.equal(orderRows[0].settlement_status, 'SETTLED');
  assert.ok(orderRows[0].settled_at);
  assert.equal(orderRows[0].settlement_id, res.body.settlement.id);

  // Verify settlement items ledger
  const [itemRows] = await pool.query(
    'SELECT * FROM payment_settlement_items WHERE settlement_id = ?',
    [res.body.settlement.id]
  );
  assert.equal(itemRows.length, 1);
  assert.equal(itemRows[0].payment_order_id, testOrderId);
});

test('FP-G15: enforces durable idempotency on duplicate settlement submissions', async () => {
  const settlementId = `setl_rzp_${runId}_001`; // Reusing ID from previous test

  const res = await request(app)
    .post('/api/admin/billing/settlements/record')
    .set(authHeaders(superAdminUid))
    .send({
      provider: 'razorpay',
      settlementId,
      grossAmount: 1999.00,
      feeAmount: 39.98,
      taxAmount: 7.20,
      netAmount: 1951.82,
      currency: 'INR',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.duplicate, true);
  assert.equal(res.body.settlement.settlement_id, settlementId);
});

test('FP-G15: rejects settlement with mathematical mismatch between gross, fees, and net', async () => {
  const res = await request(app)
    .post('/api/admin/billing/settlements/record')
    .set(authHeaders(superAdminUid))
    .send({
      provider: 'stripe',
      settlementId: `setl_bad_math_${runId}`,
      grossAmount: 1000.00,
      feeAmount: 20.00,
      taxAmount: 3.60,
      netAmount: 900.00, // Invalid: should be 976.40
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'SETTLEMENT_MATH_MISMATCH');
});

test('FP-G15: retrieves settlement details with linked order items and fee breakdown', async () => {
  const settlementId = `setl_rzp_${runId}_001`;

  const res = await request(app)
    .get(`/api/admin/billing/settlements/${settlementId}`)
    .set(authHeaders(adminUid));

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.settlement.settlement_id, settlementId);
  assert.equal(res.body.settlement.gross_amount, 1999.00);
  assert.equal(res.body.settlement.net_amount, 1951.82);
  assert.ok(Array.isArray(res.body.settlement.items));
  assert.equal(res.body.settlement.items.length, 1);
  assert.equal(res.body.settlement.items[0].payment_order_id, `ord_settle_${runId}_1`);
});

test('FP-G15: returns 404 for non-existent settlement identifier', async () => {
  const res = await request(app)
    .get('/api/admin/billing/settlements/no_such_settlement_id')
    .set(authHeaders(adminUid));

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'SETTLEMENT_NOT_FOUND');
});

test('FP-G15: lists bank settlements with pagination and provider filtering', async () => {
  const res = await request(app)
    .get('/api/admin/billing/settlements?provider=razorpay&limit=10')
    .set(authHeaders(adminUid));

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.settlements));
  assert.ok(res.body.total >= 1);
  assert.equal(res.body.limit, 10);
  assert.equal(res.body.offset, 0);
  assert.ok(res.body.settlements.some(s => s.settlement_id === `setl_rzp_${runId}_001`));
});

test('FP-G15: processes inbound gateway settlement webhook payload', async () => {
  const webhookSettlementId = `setl_hook_${runId}_002`;
  const res = await request(app)
    .post('/api/billing/settlement-webhook')
    .send({
      provider: 'stripe',
      event: 'payout.paid',
      payload: {
        settlementId: webhookSettlementId,
        grossAmount: 5000.00,
        feeAmount: 100.00,
        taxAmount: 18.00,
        netAmount: 4882.00,
        currency: 'INR',
        bankUtr: `STRIPE${runId.toUpperCase()}UTR`,
        accountLast4: '5678',
        status: 'paid',
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(res.body.duplicate, false);
  assert.equal(res.body.settlement.settlementId, webhookSettlementId);
  assert.equal(res.body.settlement.netAmount, 4882.00);
});

test('FP-G15: automatically batches and reconciles unsettled active orders', async () => {
  const pool = getPool();
  const autoOrder1 = `ord_auto_${runId}_1`;
  const autoOrder2 = `ord_auto_${runId}_2`;

  await pool.query(
    `INSERT INTO payment_orders (
      id, uid, plan_id, provider, amount, currency, status,
      settlement_status, created_at, updated_at
    ) VALUES
      (?, ?, 'PRO_ANNUAL', 'phonepe', 3999.00, 'INR', 'ACTIVE', 'UNSETTLED', NOW(3), NOW(3)),
      (?, ?, 'PRO_MONTHLY', 'phonepe', 999.00, 'INR', 'ACTIVE', 'UNSETTLED', NOW(3), NOW(3))`,
    [autoOrder1, regularUserUid, autoOrder2, regularUserUid]
  );

  const res = await request(app)
    .post('/api/admin/billing/settlements/reconcile')
    .set(authHeaders(superAdminUid))
    .send({
      provider: 'phonepe',
      batchLimit: 10,
      feePercentage: 2.0,
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.reconciled, true);
  assert.ok(res.body.ordersCount >= 2);
  assert.ok(res.body.settlement.id);
  assert.equal(res.body.settlement.provider, 'phonepe');
  assert.ok(res.body.settlement.grossAmount >= 4998.00);

  // Verify orders were updated in DB
  const [reconciledOrders] = await pool.query(
    'SELECT settlement_status, settlement_id FROM payment_orders WHERE id IN (?, ?)',
    [autoOrder1, autoOrder2]
  );
  assert.equal(reconciledOrders.length, 2);
  assert.equal(reconciledOrders[0].settlement_status, 'SETTLED');
  assert.equal(reconciledOrders[1].settlement_status, 'SETTLED');
  assert.equal(reconciledOrders[0].settlement_id, res.body.settlement.id);
  assert.equal(reconciledOrders[1].settlement_id, res.body.settlement.id);
});
