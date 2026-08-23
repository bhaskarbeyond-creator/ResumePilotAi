'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveWriteOnlySecret,
  paymentCredentialStatus,
  maskWriteOnlySecret,
} = require('../services/paymentAdmin');

test('payment secret lifecycle preserves blank and masked reload values', () => {
  const existing = 'server-side-razorpay-secret';
  assert.deepEqual(resolveWriteOnlySecret({ value: '', existing, label: 'Razorpay key secret' }), { value: existing, action: 'PRESERVE' });
  assert.deepEqual(resolveWriteOnlySecret({ value: '••••••••••••1234', existing, label: 'Razorpay key secret' }), { value: existing, action: 'PRESERVE' });
  assert.deepEqual(resolveWriteOnlySecret({ value: 'replacement-razorpay-secret', existing, label: 'Razorpay key secret' }), { value: 'replacement-razorpay-secret', action: 'REPLACE' });
  assert.deepEqual(resolveWriteOnlySecret({ value: '', existing, clear: true, label: 'Razorpay key secret' }), { value: '', action: 'CLEAR' });
  assert.throws(() => resolveWriteOnlySecret({ value: '', existing, clear: true, environment: 'deployment-secret', label: 'Razorpay key secret' }), error => error.code === 'INFRASTRUCTURE_SECRET_CANNOT_CLEAR' && error.status === 409);
});

test('payment status exposes only configuration state and a non-reversible mask', () => {
  const status = paymentCredentialStatus({ keyId: 'rzp_test_public', secret: 'secret-value-1234' });
  assert.equal(status.configured, true);
  assert.equal(status.source, 'firestore');
  assert.equal(status.masked, '••••1234');
  assert.doesNotMatch(JSON.stringify(status), /secret-value/);
  assert.equal(maskWriteOnlySecret(''), '');
});
