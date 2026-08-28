'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeProfilePatch, projectEditableProfile } = require('../services/profileSanitizer');

test('profile sanitizer preserves bounded Unicode content and recognized resume-profile sections', () => {
  const result = sanitizeProfilePatch({
    firstname: 'భాస్కర్',
    summary: 'x'.repeat(6000),
    skills: [{ id: '1', name: 'AI', level: 'Expert', injected: 'discarded' }],
    preferences: { language: 'hi', emailNotifications: false, securityNotifications: true, productUpdates: true, profileDiscoverable: false, unknown: true },
  }, { identityEmail: 'owner@example.com' });
  assert.equal(result.firstname, 'భాస్కర్');
  assert.equal(result.summary.length, 5000);
  assert.deepEqual(result.skills[0], { id: '1', name: 'AI', level: 'Expert' });
  assert.deepEqual(result.preferences, { language: 'hi', emailNotifications: false, securityNotifications: true, productUpdates: true, profileDiscoverable: false });
});

test('profile sanitizer rejects every server-owned authorization and billing field', () => {
  for (const [field, value] of Object.entries({
    role: 'SUPER_ADMIN', membership: 'Premium', paymentStatus: 'ACTIVE', suspended: false,
    permissions: ['*'], isAdmin: true, emailVerified: true, mfaEnabled: false,
    aiQuotaOverride: { dailyLimit: 100000 },
  })) {
    assert.throws(
      () => sanitizeProfilePatch({ [field]: value }, { identityEmail: 'owner@example.com' }),
      error => error.code === 'PROFILE_FIELD_FORBIDDEN' && error.status === 403,
      field,
    );
  }
});

test('profile sanitizer rejects identity-email mismatch, unknown fields, active image content, and oversize payloads', () => {
  assert.throws(() => sanitizeProfilePatch({ email: 'attacker@example.com' }, { identityEmail: 'owner@example.com' }), error => error.code === 'IDENTITY_EMAIL_MISMATCH');
  assert.throws(() => sanitizeProfilePatch({ mystery: true }), error => error.code === 'UNSUPPORTED_PROFILE_FIELD');
  assert.throws(() => sanitizeProfilePatch({ selectedImage: 'data:image/svg+xml;base64,AAAA' }), error => error.code === 'INVALID_AVATAR');
  assert.throws(() => sanitizeProfilePatch({ selectedImage: `data:image/png;base64,${'A'.repeat(900_000)}` }), error => error.code === 'PROFILE_TOO_LARGE');
});

test('profile projection excludes legacy role and billing data and exposes the authoritative revision', () => {
  const projected = projectEditableProfile({
    firstname: 'Asha', role: 'SUPER_ADMIN', membership: 'Premium', paymentStatus: 'ACTIVE',
    revision: 7, preferences: { language: 'en', securityNotifications: true },
  });
  assert.equal(projected.firstname, 'Asha');
  assert.equal(projected.revision, 7);
  assert.equal(projected.preferences.revision, 7);
  assert.equal(Object.hasOwn(projected, 'role'), false);
  assert.equal(Object.hasOwn(projected, 'membership'), false);
  assert.equal(Object.hasOwn(projected, 'paymentStatus'), false);
});
