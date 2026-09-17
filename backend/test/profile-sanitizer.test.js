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

test('profile sanitizer supports 100% parity sections: achievements, references, customSections, and credential URLs', () => {
  const result = sanitizeProfilePatch({
    certifications: [{ id: 'c1', title: 'AWS Architect', issuer: 'AWS', date: '2025', url: 'https://aws.cert/123' }],
    achievements: [{ id: 'a1', title: 'Best Innovator', issuer: 'Google', date: '2024', description: 'Won 1st place' }],
    references: [{ id: 'r1', name: 'Dr. Jane Smith', position: 'CTO', company: 'TechCorp', email: 'jane@techcorp.com', phone: '+1234567890', reference: 'Outstanding lead engineer' }],
    customSections: [{ id: 'cs1', title: 'Patents', content: 'Patent pending', items: [{ id: 'p1', title: 'AI Pipeline', description: 'US Patent #12345' }] }],
  }, { identityEmail: 'owner@example.com' });

  assert.equal(result.certifications[0].url, 'https://aws.cert/123');
  assert.equal(result.achievements[0].title, 'Best Innovator');
  assert.equal(result.references[0].name, 'Dr. Jane Smith');
  assert.equal(result.references[0].email, 'jane@techcorp.com');
  assert.equal(result.customSections[0].title, 'Patents');
  assert.equal(result.customSections[0].items[0].title, 'AI Pipeline');

  const projected = projectEditableProfile({
    certifications: result.certifications,
    achievements: result.achievements,
    references: result.references,
    customSections: result.customSections,
  });
  assert.equal(projected.certifications[0].url, 'https://aws.cert/123');
  assert.equal(projected.achievements[0].title, 'Best Innovator');
  assert.equal(projected.references[0].name, 'Dr. Jane Smith');
  assert.equal(projected.customSections[0].title, 'Patents');
});

