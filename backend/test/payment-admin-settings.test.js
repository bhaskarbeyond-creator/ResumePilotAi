'use strict';

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

test('payment projection reads legacy identifiers without mixing incomplete sources or returning secrets', async () => {
  // Seed the authoritative MySQL store (public_config / payment_providers /
  // subscriptions system_settings rows) and project through it.
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','payment_providers','subscriptions')");
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('public_config', ?, 1)", [JSON.stringify({ subscriptions: { razorpayKeyId: '' } })]);
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('payment_providers', ?, 1)", [JSON.stringify({ razorpay: { keySecret: 'stored-secret-value' }, paypal: { clientId: 'paypal-client', clientSecret: 'paypal-secret-value' } })]);
  await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('subscriptions', ?, 1)", [JSON.stringify({ razorpayKeyId: 'rzp_test_legacy', razorpayKeySecret: 'legacy-secret-value' })]);
  const projection = await getPaymentSettingsProjection(null, { RAZORPAY_KEY_ID: 'rzp_test_env_only', RAZORPAY_KEY_SECRET: '', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' });
  assert.equal(projection.publicKeys.razorpayKeyId, 'rzp_test_legacy');
  assert.equal(projection.configuredProviders.razorpay, true);
  assert.equal(projection.configuredProviders.paypal, true);
  assert.equal(projection.credentialSources.razorpay, 'mysql');
  assert.doesNotMatch(JSON.stringify(projection), /stored-secret-value|legacy-secret-value|paypal-secret-value/);
});
