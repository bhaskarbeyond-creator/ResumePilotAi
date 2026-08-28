'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MySQLRepository = require('../repositories/MySQLRepository');
const { billingSnapshotHash } = require('../services/invoiceService');

function immutableBillingEvidence() {
  const customer = {
    name: 'Activation Customer',
    company: '',
    email: 'activation@example.test',
    gstin: '',
    type: 'B2C / Individual',
    address: 'Customer Test Address',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    stateCode: '37',
    pincode: '530001',
    country: 'India',
  };
  const supplier = {
    legalName: 'ResumePilot AI Private Limited',
    tradeName: 'ResumePilot AI',
    gstin: '37ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    address: 'Supplier Test Address',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    stateCode: '37',
    pincode: '530002',
    country: 'India',
    sacCode: '998313',
    gstRate: 18,
    invoicePrefix: 'RPA',
    financialYear: '26-27',
    email: 'billing@example.test',
    phone: '',
    website: '',
  };
  return { customer, supplier, hash: billingSnapshotHash(customer, supplier) };
}

function activationOrder(overrides = {}) {
  const evidence = immutableBillingEvidence();
  return {
    id: 'activation-order-1',
    uid: 'activation-user-1',
    plan_id: 'monthly',
    provider: 'stripe',
    amount: 11800,
    currency: 'INR',
    status: 'PAYMENT_CREATED',
    revision: 4,
    provider_payment_intent_id: 'pi_activation_123',
    billing_snapshot: JSON.stringify(evidence.customer),
    supplier_snapshot: JSON.stringify(evidence.supplier),
    billing_snapshot_hash: evidence.hash,
    billing_snapshot_version: 1,
    ...overrides,
  };
}

function activationRepository(order, captured = {}, { failActivationAudit = false } = {}) {
  const user = {
    id: order.uid,
    email: 'activation@example.test',
    membership: 'Basic',
    paymentStatus: 'INACTIVE',
    revision: 3,
    membershipEnds: null,
  };
  const connection = {
    async beginTransaction() { captured.began = true; },
    async commit() { captured.committed = true; },
    async rollback() { captured.rolledBack = true; },
    release() { captured.released = true; },
    async query(sql, params = []) {
      if (/SELECT \* FROM payment_orders/.test(sql)) return [[{ ...order }]];
      if (/SELECT \* FROM users WHERE/.test(sql)) return [[{ ...user }]];
      if (/UPDATE payment_orders/.test(sql)) {
        captured.orderUpdate = { sql, params };
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE users/.test(sql)) {
        captured.userUpdate = { sql, params };
        return [{ affectedRows: 1 }];
      }
      if (/FROM invoices i/.test(sql)) return [[]];
      if (/SELECT next_sequence FROM invoice_counters/.test(sql)) return [[{ next_sequence: 1 }]];
      if (/INSERT INTO invoices/.test(sql)) {
        captured.invoiceInsert = { sql, params, payload: JSON.parse(params[12]) };
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO notification_outbox/.test(sql)) {
        captured.outboxInsert = { sql, params };
        return [{ affectedRows: 1 }];
      }
      if (/INVOICE_ISSUED/.test(sql)) captured.invoiceAudit = { sql, params };
      if (/PAYMENT_ORDER_ACTIVATED/.test(sql)) {
        captured.activationAudit = { sql, params };
        if (failActivationAudit) throw new Error('ACTIVATION_AUDIT_FAILED');
      }
      if (/INSERT INTO notifications/.test(sql)) captured.notification = { sql, params };
      return [{ affectedRows: 1 }];
    },
  };
  const repository = new MySQLRepository();
  repository._getPool = () => ({ getConnection: async () => connection });
  return repository;
}

test('activation atomically grants entitlement and issues an invoice from pre-provider snapshots', async () => {
  const captured = {};
  const repository = activationRepository(activationOrder(), captured);
  const result = await repository.activatePaymentOrderAtomic({
    orderId: 'activation-order-1',
    gatewayLabel: 'Stripe',
    providerPaymentId: 'pi_activation_123',
    mutationId: 'mutation-activation-1',
  });

  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.invoiceStatus, 'ISSUED');
  assert.equal(result.invoice.invoiceNumber, 'RPA/26-27/000001');
  assert.equal(result.invoice.paymentReference, 'pi_activation_123');
  assert.equal(result.invoice.customerSnapshot.email, 'activation@example.test');
  assert.equal(result.invoice.billingSnapshotHash, activationOrder().billing_snapshot_hash);
  assert.equal(captured.invoiceInsert.payload.paymentOrderId, 'activation-order-1');
  assert.equal(captured.outboxInsert.params[1], 'invoice-issued:activation-order-1');
  assert.ok(captured.orderUpdate);
  assert.ok(captured.userUpdate);
  assert.ok(captured.notification);
  assert.ok(captured.invoiceAudit);
  assert.ok(captured.activationAudit);
  assert.equal(captured.committed, true);
  assert.equal(captured.rolledBack, undefined);
});

test('snapshot integrity failure rolls back entitlement writes and emits no invoice', async () => {
  const captured = {};
  const repository = activationRepository(activationOrder({ billing_snapshot_hash: '0'.repeat(64) }), captured);
  await assert.rejects(
    () => repository.activatePaymentOrderAtomic({
      orderId: 'activation-order-1', gatewayLabel: 'Stripe',
      providerPaymentId: 'pi_activation_123', mutationId: 'mutation-activation-2',
    }),
    error => error.code === 'BILLING_SNAPSHOT_INTEGRITY_FAILED'
  );
  assert.ok(captured.orderUpdate);
  assert.ok(captured.userUpdate);
  assert.equal(captured.invoiceInsert, undefined);
  assert.equal(captured.rolledBack, true);
  assert.equal(captured.committed, undefined);
});

test('audit failure after invoice enqueue rolls back the complete activation transaction', async () => {
  const captured = {};
  const repository = activationRepository(activationOrder(), captured, { failActivationAudit: true });
  await assert.rejects(
    () => repository.activatePaymentOrderAtomic({
      orderId: 'activation-order-1', gatewayLabel: 'Stripe',
      providerPaymentId: 'pi_activation_123', mutationId: 'mutation-activation-3',
    }),
    /ACTIVATION_AUDIT_FAILED/
  );
  assert.ok(captured.invoiceInsert);
  assert.ok(captured.outboxInsert);
  assert.ok(captured.notification);
  assert.equal(captured.rolledBack, true);
  assert.equal(captured.committed, undefined);
  assert.equal(captured.released, true);
});

test('legacy orders without pre-provider evidence cannot activate or synthesize invoices', async () => {
  const captured = {};
  const repository = activationRepository(activationOrder({
    billing_snapshot: null,
    supplier_snapshot: null,
    billing_snapshot_hash: null,
    billing_snapshot_version: null,
  }), captured);
  await assert.rejects(
    () => repository.activatePaymentOrderAtomic({
      orderId: 'activation-order-1', gatewayLabel: 'Stripe',
      providerPaymentId: 'pi_activation_123', mutationId: 'mutation-activation-4',
    }),
    error => error.code === 'BILLING_SNAPSHOT_MISSING'
  );
  assert.equal(captured.orderUpdate, undefined);
  assert.equal(captured.userUpdate, undefined);
  assert.equal(captured.invoiceInsert, undefined);
  assert.equal(captured.rolledBack, true);
});
