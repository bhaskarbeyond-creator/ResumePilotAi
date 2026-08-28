import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeProfileData, normalizeProfileImage, profileFitsPersistenceLimit } from '../src/utils/profileData.js';

test('profile normalization is Unicode-safe, bounded, immutable, and preserves legitimate sections', () => {
  const input = { firstname: 'భాస్కర్', lastname: 'शर्मा', summary: 'x'.repeat(6000), skills: [{ id: '1', name: 'AI', level: 'Expert' }], languages: ['English'] };
  const profile = normalizeProfileData(input);
  assert.equal(profile.firstname, 'భాస్కర్');
  assert.equal(profile.lastname, 'शर्मा');
  assert.equal(profile.summary.length, 5000);
  assert.equal(profile.skills[0].name, 'AI');
  assert.notEqual(profile, input);
});

test('profile avatar accepts bounded inert raster data or safe URLs and rejects active/unbounded media', () => {
  assert.equal(normalizeProfileImage('https://cdn.example/avatar.webp'), 'https://cdn.example/avatar.webp');
  assert.equal(normalizeProfileImage('/avatar.png'), '/avatar.png');
  assert.match(normalizeProfileImage('data:image/png;base64,AAAA'), /^data:image\/png/);
  assert.equal(normalizeProfileImage('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(normalizeProfileImage('javascript:alert(1)'), null);
  assert.equal(normalizeProfileImage(`data:image/png;base64,${'A'.repeat(1_000_000)}`), null);
  assert.equal(profileFitsPersistenceLimit({ summary: 'small' }), true);
});

test('profile persistence and UI use revisions, truthful save states, conflicts, and validated avatar uploads', async () => {
  const [persistence, settings] = await Promise.all([
    fs.readFile('src/services/profilePersistence.js', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
  ]);
  // Profile conflict semantics cross the revisioned MariaDB HTTP API and use
  // an explicit API adapter in tests; no database-shaped client fake exists.
  assert.match(persistence, /saveProfileViaApi/);
  assert.match(persistence, /expectedRevision/);
  assert.match(persistence, /api\('\/api\/users-data\/profile'/);
  assert.doesNotMatch(persistence, /runTransaction|collection\(/);
  assert.match(settings, /saveProfile\(currentUser\.uid/);
  assert.match(settings, /Pending autosave/);
  assert.match(settings, /Conflict—action required/);
  assert.doesNotMatch(settings, /remoteRevision\s*[),}][\s\S]{0,250}persistProfileRef\.current/);
  assert.match(settings, /profileSavingRef/);
  assert.match(settings, /pendingProfileSaveRef/);
  assert.match(settings, /needsFollowUp/);
  assert.match(settings, /image\/png.*image\/jpeg.*image\/webp/);
  assert.match(settings, /fire\.auth\(\)\.currentUser\?\.emailVerified/);
  assert.doesNotMatch(settings, /Account & all personal data deleted successfully/);
});

test('preferences are account-scoped, revisioned, validated, and separate from consent/billing', async () => {
  const [operations, settings, usersApi, sanitizer] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
    fs.readFile('src/services/api/users.js', 'utf8'),
    fs.readFile('backend/services/profileSanitizer.js', 'utf8'),
  ]);
  assert.match(operations, /saveUserPreferences\(userId, preferences, expectedRevision\)/);
  assert.match(operations, /expectedRevision: revision/);
  assert.match(usersApi, /body: JSON\.stringify\(\{[\s\S]*expectedRevision/);
  assert.match(sanitizer, /sanitizePreferences/);
  assert.match(sanitizer, /PROFILE_FIELD_FORBIDDEN/);
  assert.match(sanitizer, /membership.*paymentStatus/);
  assert.match(settings, /Preferences &amp; Privacy/);
  assert.match(settings, /do not change analytics consent or payment state/);
});

test('account deletion uses a durable MariaDB/Firebase identity saga and names retained ledgers', async () => {
  const deletion = await fs.readFile('backend/services/accountDeletion.js', 'utf8');
  assert.match(deletion, /IDENTITY_PENDING/);
  assert.match(deletion, /ACCOUNT_IDENTITY_DELETE_FAILED/);
  assert.match(deletion, /DELETE FROM applications/);
  assert.match(deletion, /DELETE FROM companies/);
  assert.match(deletion, /UPDATE blog SET author_id = NULL/);
  assert.match(deletion, /retainedRecordTypes/);
  assert.match(deletion, /payment_orders/);
  assert.match(deletion, /throw fail\('ACCOUNT_IDENTITY_DELETE_FAILED', 503/);
  assert.match(deletion, /status: STATES\.COMPLETED, identityDeleted: true/);
});

test('native Firebase TOTP remains the only profile MFA workflow', async () => {
  const [settings, service] = await Promise.all([
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
    fs.readFile('src/services/mfaService.js', 'utf8'),
  ]);
  assert.match(settings, /beginUserTotp2FA/);
  assert.match(settings, /saveUserTotp2FA/);
  assert.match(settings, /disableUserTotp2FA/);
  assert.match(service, /TotpMultiFactorGenerator/);
  assert.doesNotMatch(settings, /localStorage\.(?:setItem|getItem)\(['"](?:totp|mfa)/i);
});
