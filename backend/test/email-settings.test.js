const test = require('node:test');
const assert = require('node:assert/strict');
const emailRoutes = require('../routes/email');

const { normalizedMailSection, normalizeTemplateToggles, projectMailSection } = emailRoutes._test;

const smtpInput = {
  host: 'smtp.example.com',
  port: 465,
  encryption: 'ssl',
  username: 'mailer@example.com',
  senderName: 'Example Mailer',
  replyTo: 'support@example.com',
  adminEmail: 'admin@example.com',
};

test('blank mail password preserves a local credential and never invents one', () => {
  const preserved = normalizedMailSection('smtp', { ...smtpInput, password: '' }, { password: 'fixture-existing-mail-key' });
  assert.equal(preserved.password, 'fixture-existing-mail-key');
  const inherited = normalizedMailSection('smtp', { ...smtpInput, password: '' }, {});
  assert.equal(Object.hasOwn(inherited, 'password'), false);
});

test('mail settings projection is allowlisted and exposes only credential state', () => {
  const projected = projectMailSection('smtp', { ...smtpInput, password: 'fixture-runtime-mail-key', accessToken: 'fixture-access-token', clientSecret: 'fixture-client-secret' });
  assert.equal(projected.passwordConfigured, true);
  assert.equal(Object.hasOwn(projected, 'password'), false);
  assert.equal(Object.hasOwn(projected, 'accessToken'), false);
  assert.equal(Object.hasOwn(projected, 'clientSecret'), false);
  assert.doesNotMatch(JSON.stringify(projected), /fixture-(?:runtime-mail-key|access-token|client-secret)/);
});

test('mail runtime validation rejects plaintext transport, malformed hosts and invalid toggles', () => {
  assert.throws(() => normalizedMailSection('smtp', { ...smtpInput, encryption: 'none' }), /Encrypted smtp transport is required/);
  assert.throws(() => normalizedMailSection('smtp', { ...smtpInput, host: 'https://smtp.example.com' }), /Invalid smtp host/);
  assert.throws(() => normalizeTemplateToggles({ welcome: 'true' }), /Invalid email template setting/);
  assert.deepEqual(normalizeTemplateToggles({ welcome: true, security_alert: false }), { welcome: true, security_alert: false });
});
