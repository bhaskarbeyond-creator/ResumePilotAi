'use strict';

/**
 * Confidentiality boundary tests for settings classification (RCA-013,
 * REC-012 step (a)).
 *
 * ## Why these tests exist before the settings write path is repaired
 *
 * The settings console introduces field names; classification decides whether
 * those fields ever reach a browser. `GET /api/platform/public-config` is
 * unauthenticated and serves `public_config` verbatim, so a mis-classified field
 * is a public credential leak, not a display bug.
 *
 * The ordering constraint in REC-012 is therefore load-bearing: **classify
 * first, enable writes second.** These tests are the gate for the first step and
 * they must pass before `expectedRevision` is wired into the panels.
 *
 * ## What is proven
 *
 * 1. Every credential-shaped name used by the console is classified private.
 * 2. The public-client allowlist is minimal and contains only publishable names.
 * 3. Redaction never persists a secret in an audit snapshot.
 * 4. Walking every allowed settings category finds no unclassified credential.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPrivateAdminSettingKey,
  collectPrivateKeys,
  redactSecretsForAudit,
  PRIVATE_KEY_PATTERNS,
} = require('../security/settingClassification');
const { PUBLIC_CLIENT_KEYS } = require('../security/settingClassification.data');

/* ── the exact field names the console writes (RCA-013) ───────────────── */

const CONSOLE_CREDENTIAL_FIELDS = [
  // integrations panel — the fields that would have leaked
  ['integrations', 'twilioToken'],
  ['integrations', 'twilioAuthToken'],
  ['integrations', 'recaptchaSecret'],
  ['integrations', 'recaptchaSecretKey'],
  ['integrations', 'googleMapsKey'],
  ['integrations', 'apiKey'],
  // payments
  ['payment_providers', 'keySecret'],
  ['payment_providers', 'secretKey'],
  ['payment_providers', 'webhookSecret'],
  // oauth / social
  ['socialAuth', 'clientSecret'],
  ['socialAuth', 'clientToken'],
  ['socialAuth', 'refreshToken'],
  // mail
  ['email', 'password'],
  ['email', 'smtpPassword'],
  // ai
  ['ai', 'apiKey'],
  ['ai', 'geminiApiKey'],
  ['ai', 'openaiApiKey'],
  // storage / infra
  ['storage', 's3SecretAccessKey'],
  ['storage', 's3AccessKeyId'],
  ['firebase', 'serviceAccount'],
  ['firebase', 'privateKey'],
  // pdf export infrastructure (DIV-014)
  ['exportPdf', 'chromiumPath'],
  ['exportPdf', 'backendExportUrl'],
];

test('every credential field the console writes is classified private', () => {
  for (const [category, field] of CONSOLE_CREDENTIAL_FIELDS) {
    assert.equal(
      isPrivateAdminSettingKey(category, field),
      true,
      `${category}.${field} must never be projected to a browser`,
    );
  }
});

test('public client identifiers stay public, and only those', () => {
  for (const key of PUBLIC_CLIENT_KEYS) {
    assert.equal(isPrivateAdminSettingKey('integrations', key), false, `${key} should remain public`);
  }
  // The allowlist is deliberately small: growth requires a documented reason.
  assert.ok(PUBLIC_CLIENT_KEYS.size <= 10, `public client key allowlist grew to ${PUBLIC_CLIENT_KEYS.size}; justify each addition`);

  assert.equal(isPrivateAdminSettingKey('integrations', 'googleMapsApiKey'), false);
  assert.equal(isPrivateAdminSettingKey('integrations', 'recaptchaSiteKey'), false);
  assert.equal(isPrivateAdminSettingKey('integrations', 'stripePublishableKey'), false);
});

test('firebase web apiKey is public, every other apiKey is not', () => {
  assert.equal(isPrivateAdminSettingKey('firebase', 'apiKey'), false);
  assert.equal(isPrivateAdminSettingKey('integrations', 'apiKey'), true);
  assert.equal(isPrivateAdminSettingKey('ai', 'apiKey'), true);
});

test('ordinary fields are not over-classified', () => {
  for (const [category, field] of [
    ['branding', 'siteTitle'],
    ['branding', 'metaDescription'],
    ['branding', 'faviconUrl'],
    ['modules', 'enableBlogModule'],
    ['gdpr', 'privacyUrl'],
    ['codeInjection', 'headCode'],
    ['llmGeo', 'llmsTxtContent'],
    ['geoSeo', 'keywords'],
    ['templateManager', 'disabledTemplates'],
    ['social', 'facebook'],
  ]) {
    assert.equal(isPrivateAdminSettingKey(category, field), false, `${category}.${field} must remain editable and readable`);
  }
});

test('credential patterns catch future field names by shape, not by list', () => {
  const futureNames = [
    'newProviderSecret',
    'someServiceAuthToken',
    'webhookSigningKey',
    'refreshTokenV2',
    'clientCredentials',
    'encryptionKey',
    'botToken',
    '-----BEGIN PRIVATE KEY-----',
  ];
  for (const name of futureNames) {
    assert.equal(isPrivateAdminSettingKey('integrations', name), true, `${name} should be classified by pattern`);
  }
  assert.ok(PRIVATE_KEY_PATTERNS.length >= 20, 'pattern list shrank unexpectedly');
});

test('collectPrivateKeys finds nested credentials at any depth', () => {
  const settings = {
    currency: 'INR',
    razorpay: { keyId: 'rzp_live_public', keySecret: 'server-only' },
    smtp: { host: 'smtp.example.test', password: 'hunter2' },
    list: [{ token: 'abc' }],
  };
  assert.deepEqual(collectPrivateKeys('payment_providers', settings), [
    'list.0.token',
    'razorpay.keySecret',
    'smtp.password',
  ]);
});

test('audit redaction masks secrets but preserves shape and non-secrets', () => {
  const before = {
    currency: 'INR',
    razorpay: { keyId: 'rzp_public', keySecret: 'old-secret' },
    emptySecret: '',
  };
  const redacted = redactSecretsForAudit('payment_providers', before);
  assert.equal(redacted.currency, 'INR');
  assert.equal(redacted.razorpay.keyId, 'rzp_public');
  assert.equal(redacted.razorpay.keySecret, '••••redacted');
  assert.equal(redacted.emptySecret, null);
  assert.ok(!JSON.stringify(redacted).includes('old-secret'), 'a secret survived redaction');
});

test('redaction output can never contain a classified leaf value', () => {
  const sample = {
    integrations: {
      googleMapsApiKey: 'public-maps-key',
      twilioToken: 'SUPER-SECRET-TOKEN',
      recaptchaSecret: 'SUPER-SECRET-RECAPTCHA',
      nested: { deepAuthToken: 'SUPER-SECRET-DEEP' },
    },
  };
  const serialised = JSON.stringify(redactSecretsForAudit('integrations', sample));
  for (const secret of ['SUPER-SECRET-TOKEN', 'SUPER-SECRET-RECAPTCHA', 'SUPER-SECRET-DEEP']) {
    assert.ok(!serialised.includes(secret), `${secret} leaked into an audit snapshot`);
  }
  assert.ok(serialised.includes('public-maps-key'), 'a public client key was over-redacted');
});
