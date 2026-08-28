'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveWriteOnlySecret,
  paymentCredentialStatus,
  maskWriteOnlySecret,
  getPaymentSettingsProjection,
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
  assert.equal(status.source, 'mysql');
  assert.equal(status.masked, '••••1234');
  assert.doesNotMatch(JSON.stringify(status), /secret-value/);
  assert.equal(maskWriteOnlySecret(''), '');
});

test('payment projection ignores retired legacy settings and never mixes incomplete credential sources', async () => {
  const settings = {
    public_config: { subscriptions: { razorpayKeyId: '' } },
    payment_providers: { razorpay: { keySecret: 'stored-secret-value' }, paypal: { clientId: 'paypal-client', clientSecret: 'paypal-secret-value' } },
    subscriptions: { razorpayKeyId: 'rzp_test_legacy', razorpayKeySecret: 'legacy-secret-value' },
  };
  require('../repositories').setRepositoryForTests({ async getSetting(category) { return settings[category] || null; } });
  const projection = await getPaymentSettingsProjection({ RAZORPAY_KEY_ID: 'rzp_test_env_only', RAZORPAY_KEY_SECRET: '', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' });
  assert.equal(projection.publicKeys.razorpayKeyId, 'rzp_test_env_only');
  assert.equal(projection.configuredProviders.razorpay, false);
  assert.equal(projection.configuredProviders.paypal, true);
  assert.equal(projection.credentialSources.razorpay, 'environment-partial');
  assert.doesNotMatch(JSON.stringify(projection), /rzp_test_legacy|stored-secret-value|legacy-secret-value|paypal-secret-value/);
});
