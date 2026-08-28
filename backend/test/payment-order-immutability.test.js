'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');
const { billingSnapshotHash } = require('../services/invoiceService');

function evidence(name = 'Original Customer') {
  const billingSnapshot = { name, email: 'customer@example.test' };
  const supplierSnapshot = { legalName: 'Original Supplier' };
  return {
    billingSnapshot,
    supplierSnapshot,
    billingSnapshotHash: billingSnapshotHash(billingSnapshot, supplierSnapshot),
    billingSnapshotVersion: 1,
  };
}

function payment(overrides = {}) {
  return {
    uid: 'user-1',
    planId: 'monthly',
    provider: 'stripe',
    amount: 11800,
    originalAmount: 11800,
    currency: 'INR',
    status: 'PENDING_PAYMENT',
    revision: 1,
    ...evidence(),
    ...overrides,
  };
}

function rowFromPayment(data = payment()) {
  return {
    id: 'order-1',
    uid: data.uid,
    plan_id: data.planId,
    provider: data.provider,
    amount: data.amount,
    original_amount: data.originalAmount,
    currency: data.currency,
    status: data.status,
    revision: data.revision,
    billing_snapshot: JSON.stringify(data.billingSnapshot),
    supplier_snapshot: JSON.stringify(data.supplierSnapshot),
    billing_snapshot_hash: data.billingSnapshotHash,
    billing_snapshot_version: data.billingSnapshotVersion,
  };
}

function repositoryWithExisting(existing, captured = {}) {
  const connection = {
    async beginTransaction() { captured.began = true; },
    async commit() { captured.committed = true; },
    async rollback() { captured.rolledBack = true; },
    release() { captured.released = true; },
    async query(sql, params = []) {
      if (/SELECT \* FROM payment_orders/.test(sql)) return [existing ? [{ ...existing }] : []];
      if (/INSERT INTO payment_orders/.test(sql)) {
        captured.write = { sql, params };
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const repository = new MySQLRepository();
  repository._getPool = () => ({ getConnection: async () => connection });
  return repository;
}

test('new payment order persists verified versioned billing evidence in a transaction', async () => {
  const captured = {};
  const data = payment();
  const repository = repositoryWithExisting(null, captured);
  const saved = await repository.savePaymentOrder('order-1', data);
  assert.equal(saved.revision, 1);
  assert.ok(captured.write);
  assert.match(captured.write.sql, /billing_snapshot_hash/);
  assert.equal(captured.committed, true);
  assert.equal(captured.rolledBack, undefined);
});

test('new payment order without valid billing evidence is rejected before any write', async () => {
  const captured = {};
  const repository = repositoryWithExisting(null, captured);
  await assert.rejects(
    () => repository.savePaymentOrder('order-1', payment({
      billingSnapshot: null, supplierSnapshot: null, billingSnapshotHash: null, billingSnapshotVersion: null,
    })),
    error => error.code === 'BILLING_SNAPSHOT_REQUIRED'
  );
  assert.equal(captured.write, undefined);
  assert.equal(captured.rolledBack, true);
});

test('payment owner, plan, provider, amount, and currency cannot change after creation', async () => {
  for (const mutation of [
    { uid: 'attacker' },
    { planId: 'yearly' },
    { provider: 'paypal' },
    { amount: 11799 },
    { currency: 'USD' },
  ]) {
    const captured = {};
    const repository = repositoryWithExisting(rowFromPayment(), captured);
    await assert.rejects(
      () => repository.savePaymentOrder('order-1', payment({ ...mutation, revision: 2 })),
      error => error.code === 'PAYMENT_ORDER_IDENTITY_CONFLICT'
    );
    assert.equal(captured.write, undefined);
    assert.equal(captured.rolledBack, true);
  }
});

test('billing snapshots cannot be replaced, removed, or backfilled after order creation', async t => {
  await t.test('replace', async () => {
    const captured = {};
    const changedEvidence = evidence('Changed Customer');
    const repository = repositoryWithExisting(rowFromPayment(), captured);
    await assert.rejects(
      () => repository.savePaymentOrder('order-1', payment({ ...changedEvidence, revision: 2 })),
      error => error.code === 'BILLING_SNAPSHOT_CONFLICT'
    );
    assert.equal(captured.write, undefined);
  });
  await t.test('remove', async () => {
    const captured = {};
    const repository = repositoryWithExisting(rowFromPayment(), captured);
    await assert.rejects(
      () => repository.savePaymentOrder('order-1', payment({
        billingSnapshot: null, supplierSnapshot: null, billingSnapshotHash: null,
        billingSnapshotVersion: null, revision: 2,
      })),
      error => error.code === 'BILLING_SNAPSHOT_CONFLICT'
    );
    assert.equal(captured.write, undefined);
  });
  await t.test('legacy backfill', async () => {
    const captured = {};
    const legacy = rowFromPayment();
    legacy.billing_snapshot = null;
    legacy.supplier_snapshot = null;
    legacy.billing_snapshot_hash = null;
    legacy.billing_snapshot_version = null;
    const repository = repositoryWithExisting(legacy, captured);
    await assert.rejects(
      () => repository.savePaymentOrder('order-1', payment({ revision: 2 })),
      error => error.code === 'BILLING_SNAPSHOT_CONFLICT'
    );
    assert.equal(captured.write, undefined);
  });
});

test('stale payment update fails compare-and-swap instead of overwriting provider state', async () => {
  const captured = {};
  const existing = rowFromPayment(payment({ revision: 4 }));
  const repository = repositoryWithExisting(existing, captured);
  await assert.rejects(
    () => repository.savePaymentOrder('order-1', payment({ revision: 4, status: 'PAYMENT_CREATED' })),
    error => error.code === 'PAYMENT_ORDER_CHANGED'
  );
  assert.equal(captured.write, undefined);
  assert.equal(captured.rolledBack, true);
});
