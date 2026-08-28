'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');

function repositoryForOrder(order, captured = {}) {
  const connection = {
    async beginTransaction() { captured.began = true; },
    async commit() { captured.committed = true; },
    async rollback() { captured.rolledBack = true; },
    release() { captured.released = true; },
    async query(sql, params = []) {
      if (/SELECT \* FROM payment_orders/.test(sql)) return [[{ ...order }]];
      if (/UPDATE payment_orders/.test(sql)) captured.paymentUpdate = { sql, params };
      if (/INSERT INTO security_audit_logs/.test(sql)) captured.audit = { sql, params };
      return [{ affectedRows: 1 }];
    },
  };
  const repository = new MySQLRepository();
  repository._getPool = () => ({ getConnection: async () => connection });
  return repository;
}

function activeOrder(overrides = {}) {
  return {
    id: 'order-1', uid: 'user-1', provider: 'razorpay', amount: 11800, currency: 'INR',
    status: 'ACTIVE', revision: 3, refund_attempt: 0, ...overrides,
  };
}

test('new refund claim creates one durable attempt key and audits the lease transaction', async () => {
  const captured = {};
  const repository = repositoryForOrder(activeOrder(), captured);
  const claimed = await repository.claimPaymentRefundAtomic({
    orderId: 'order-1', actorUid: 'admin-1', reason: 'Customer requested refund',
  });

  assert.equal(claimed.status, 'REFUND_PENDING');
  assert.equal(claimed.refundAttempt, 1);
  assert.match(claimed.refundIdempotencyKey, /^refund_[a-f0-9]{30}$/);
  assert.match(claimed.claimId, /^[0-9a-f-]{36}$/i);
  assert.equal(captured.committed, true);
  assert.match(captured.paymentUpdate.sql, /refund_idempotency_key = \?/);
  assert.equal(captured.audit.params[1], 'admin-1');
});

test('stale pending refund reuses its original idempotency key instead of creating a second money command', async () => {
  const captured = {};
  const existingKey = 'refund_0123456789abcdef0123456789abcd';
  const repository = repositoryForOrder(activeOrder({
    status: 'REFUND_PENDING', refund_attempt: 4, refund_idempotency_key: existingKey,
    refund_claim_id: 'expired-claim', refund_claimed_at: new Date(Date.now() - 300_000),
    refund_reason: 'Original audited reason', refund_requested_by: 'admin-original',
  }), captured);
  const claimed = await repository.claimPaymentRefundAtomic({
    orderId: 'order-1', actorUid: 'admin-reconciler', reason: 'Different retry text',
  });

  assert.equal(claimed.refundAttempt, 4);
  assert.equal(claimed.refundIdempotencyKey, existingKey);
  assert.equal(claimed.refundReason, 'Original audited reason');
  assert.equal(claimed.refundRequestedBy, 'admin-original');
});

test('fresh refund lease rejects concurrent provider contact with Retry-After evidence', async () => {
  const captured = {};
  const repository = repositoryForOrder(activeOrder({
    status: 'REFUND_PENDING', refund_claim_id: 'live-claim', refund_claimed_at: new Date(),
  }), captured);
  await assert.rejects(
    repository.claimPaymentRefundAtomic({ orderId: 'order-1', actorUid: 'admin-2', reason: 'Concurrent retry' }),
    error => error.code === 'REFUND_IN_PROGRESS' && error.status === 409 && error.retryAfterSeconds >= 1
  );
  assert.equal(captured.rolledBack, true);
});

test('ambiguous provider failure preserves pending state and idempotency key', async () => {
  const captured = {};
  const repository = repositoryForOrder(activeOrder({
    status: 'REFUND_PENDING', refund_claim_id: 'claim-1', refund_idempotency_key: 'refund_0123456789abcdef0123456789abcd',
  }), captured);
  const released = await repository.releasePaymentRefundClaimAtomic({
    orderId: 'order-1', claimId: 'claim-1', failureCode: 'PROVIDER_TIMEOUT', restoreActive: false,
  });
  assert.equal(released, true);
  assert.equal(captured.paymentUpdate.params[0], 'REFUND_PENDING');
  assert.equal(captured.paymentUpdate.params[2], 0);
});

test('explicit terminal provider failure can restore ACTIVE and clear the failed attempt', async () => {
  const captured = {};
  const repository = repositoryForOrder(activeOrder({
    status: 'REFUND_PENDING', refund_claim_id: 'claim-2', provider_refund_id: 'rfnd-failed',
    provider_refund_status: 'PENDING', refund_idempotency_key: 'refund_0123456789abcdef0123456789abcd',
  }), captured);
  const released = await repository.releasePaymentRefundClaimAtomic({
    orderId: 'order-1', claimId: 'claim-2', failureCode: 'RAZORPAY_REFUND_FAILED',
    restoreActive: true, providerFailureConfirmed: true,
  });
  assert.equal(released, true);
  assert.equal(captured.paymentUpdate.params[0], 'ACTIVE');
  assert.equal(captured.paymentUpdate.params[2], 1);
  assert.equal(captured.paymentUpdate.params[3], 1);
  assert.equal(captured.paymentUpdate.params[4], 1);
});

function repositoryForRefundLedger(order, captured = {}, { failOnAudit = false, existingReference = null } = {}) {
  const connection = {
    async beginTransaction() { captured.began = true; },
    async commit() { captured.committed = true; },
    async rollback() { captured.rolledBack = true; },
    release() { captured.released = true; },
    async query(sql, params = []) {
      if (/SELECT \* FROM payment_orders/.test(sql)) return [[{ ...order }]];
      if (/FROM payment_refund_provider_references\s+WHERE provider/.test(sql)) {
        return [existingReference ? [{ ...existingReference }] : []];
      }
      if (/FROM payment_refund_provider_references\s+WHERE payment_order_id/.test(sql)) {
        return [captured.storedReferences || []];
      }
      if (/INSERT INTO payment_refund_provider_references/.test(sql)) {
        captured.ledgerInserts ||= [];
        captured.ledgerInserts.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE payment_refund_provider_references/.test(sql)) {
        captured.ledgerUpdates ||= [];
        captured.ledgerUpdates.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/FROM invoices WHERE payment_order_id/.test(sql)) return [[]];
      if (/SELECT \* FROM users/.test(sql)) return [[]];
      if (/UPDATE payment_orders/.test(sql)) captured.paymentUpdate = { sql, params };
      if (/INSERT INTO notifications/.test(sql)) captured.notification = { sql, params };
      if (/INSERT INTO security_audit_logs/.test(sql)) {
        captured.audits ||= [];
        captured.audits.push({ sql, params });
        if (failOnAudit) throw new Error('AUDIT_WRITE_FAILED');
      }
      return [{ affectedRows: 1 }];
    },
  };
  const repository = new MySQLRepository();
  repository._getPool = () => ({ getConnection: async () => connection });
  return repository;
}

test('pending provider acceptance and normalized refund evidence commit in one transaction', async () => {
  const captured = {};
  const repository = repositoryForRefundLedger(activeOrder({
    status: 'REFUND_PENDING', refund_claim_id: 'claim-pending', refund_requested_by: 'admin-1',
  }), captured);
  const result = await repository.recordPaymentRefundSubmittedAtomic({
    orderId: 'order-1',
    claimId: 'claim-pending',
    providerRefundId: 'rfnd_pending_123',
    providerRefundStatus: 'PENDING',
    providerRefundReferenceType: 'PROVIDER',
    providerRefunds: [{
      id: 'rfnd_pending_123', provider: 'razorpay', status: 'pending', amount: 11800, currency: 'inr',
    }],
  });

  assert.equal(result.providerRefundId, 'rfnd_pending_123');
  assert.equal(result.providerRefundReferenceType, 'PROVIDER');
  assert.equal(captured.ledgerInserts.length, 1);
  assert.deepEqual(captured.ledgerInserts[0].slice(0, 6), [
    'order-1', 'razorpay', 'rfnd_pending_123', 'PENDING', 11800, 'INR',
  ]);
  assert.deepEqual(captured.paymentUpdate.params.slice(0, 3), ['rfnd_pending_123', 'PENDING', 'PROVIDER']);
  assert.equal(captured.committed, true);
  assert.equal(captured.rolledBack, undefined);
});

test('terminal aggregate reconciliation persists every child before entitlement reversal', async () => {
  const captured = {};
  const aggregate = `stripe_aggregate_${'b'.repeat(64)}`;
  const repository = repositoryForRefundLedger(activeOrder({ provider: 'stripe' }), captured);
  const result = await repository.reversePaymentEntitlementAtomic({
    orderId: 'order-1',
    status: 'REFUNDED',
    providerRefundId: aggregate,
    providerRefundReferenceType: 'AGGREGATE',
    providerRefunds: [
      { id: 're_partial_000001', provider: 'stripe', status: 'succeeded', amount: 4800, currency: 'inr' },
      { id: 're_partial_000002', provider: 'stripe', status: 'succeeded', amount: 7000, currency: 'inr' },
    ],
  });

  assert.equal(result.status, 'REFUNDED');
  assert.equal(result.providerRefundId, aggregate);
  assert.equal(result.providerRefundReferenceType, 'AGGREGATE');
  assert.deepEqual(result.providerRefunds.map(item => item.id), ['re_partial_000001', 're_partial_000002']);
  assert.equal(captured.ledgerInserts.length, 2);
  assert.equal(captured.ledgerInserts.every(params => params[6] instanceof Date), true);
  assert.deepEqual(captured.paymentUpdate.params.slice(0, 4), ['REFUNDED', aggregate, 'AGGREGATE', 'REFUNDED']);
  assert.equal(captured.notification.params[6].includes('"providerRefundCount":2'), true);
  assert.equal(captured.committed, true);
});

test('a provider refund reference owned by another order aborts and rolls back', async () => {
  const captured = {};
  const repository = repositoryForRefundLedger(activeOrder({
    status: 'REFUND_PENDING', refund_claim_id: 'claim-conflict',
  }), captured, {
    existingReference: {
      payment_order_id: 'different-order', provider_status: 'PENDING', amount_minor: 11800, currency: 'INR',
    },
  });

  await assert.rejects(
    () => repository.recordPaymentRefundSubmittedAtomic({
      orderId: 'order-1', claimId: 'claim-conflict', providerRefundId: 'rfnd_conflict_123',
      providerRefundStatus: 'PENDING',
    }),
    error => error.code === 'REFUND_REFERENCE_CONFLICT'
  );
  assert.equal(captured.rolledBack, true);
  assert.equal(captured.committed, undefined);
  assert.equal(captured.paymentUpdate, undefined);
});

test('audit failure rolls back refund evidence and payment state instead of partially committing', async () => {
  const captured = {};
  const repository = repositoryForRefundLedger(activeOrder({
    status: 'REFUND_PENDING', refund_claim_id: 'claim-audit-failure',
  }), captured, { failOnAudit: true });

  await assert.rejects(() => repository.recordPaymentRefundSubmittedAtomic({
    orderId: 'order-1', claimId: 'claim-audit-failure', providerRefundId: 'rfnd_audit_12345',
    providerRefundStatus: 'PENDING',
  }), /AUDIT_WRITE_FAILED/);
  assert.equal(captured.ledgerInserts.length, 1);
  assert.ok(captured.paymentUpdate);
  assert.equal(captured.rolledBack, true);
  assert.equal(captured.committed, undefined);
  assert.equal(captured.released, true);
});

test('aggregate evidence must be unique and exactly equal the authoritative payment amount', () => {
  const normalize = MySQLRepository._refundLedgerEntries;
  const aggregate = `stripe_aggregate_${'c'.repeat(64)}`;
  assert.throws(
    () => normalize(activeOrder({ provider: 'stripe' }), {
      providerRefundId: aggregate,
      providerRefundReferenceType: 'AGGREGATE',
      providerRefunds: [
        { id: 're_same_123456', provider: 'stripe', status: 'succeeded', amount: 5900, currency: 'INR' },
        { id: 're_same_123456', provider: 'stripe', status: 'succeeded', amount: 5900, currency: 'INR' },
      ],
      requireFullAmount: true,
    }),
    error => error.code === 'PROVIDER_REFUND_DUPLICATE_REFERENCE'
  );
  assert.throws(
    () => normalize(activeOrder({ provider: 'stripe' }), {
      providerRefundId: aggregate,
      providerRefundReferenceType: 'AGGREGATE',
      providerRefunds: [
        { id: 're_part_123456', provider: 'stripe', status: 'succeeded', amount: 4000, currency: 'INR' },
        { id: 're_part_654321', provider: 'stripe', status: 'succeeded', amount: 7000, currency: 'INR' },
      ],
      requireFullAmount: true,
    }),
    error => error.code === 'PROVIDER_REFUND_MISMATCH'
  );
});
