import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeProfileData, normalizeProfileImage, profileFitsFirestore } from '../src/utils/profileData.js';

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
  assert.equal(profileFitsFirestore({ summary: 'small' }), true);
});

test('profile persistence and UI use revisions, truthful save states, conflicts, and validated avatar uploads', async () => {
  const [_operations, persistence, settings] = await Promise.all([
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/services/profilePersistence.js', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
  ]);
  // Profile conflict semantics live in profilePersistence (server-side OCC via
  // the MySQL-backed API + injected-store tests).
  assert.match(persistence, /PROFILE_CONFLICT/);
  assert.match(persistence, /saveProfileViaApi/);
  assert.match(persistence, /runTransaction/);
  assert.match(settings, /saveProfile\(null, currentUser\.uid/);
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

test('preferences are account-scoped, revisioned, validated, and intentionally separate from consent/billing', async () => {
  const [operations, settings, rules] = await Promise.all([
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(operations, /saveUserPreferences/);
  assert.match(operations, /saveCurrentUserProfile\(\{ userId, profile: \{ \.\.\.\(profile\?\.profile \|\| \{\}\), preferences \} \}\)/);
  assert.match(settings, /Preferences &amp; Privacy/);
  assert.match(settings, /do not change analytics consent or payment state/);
  assert.match(rules, /validPreferences/);
});

test('account deletion reports partial cleanup, removes public/owned modules, and names retained ledgers', async () => {
  const backend = await fs.readFile('backend/index.js', 'utf8');
  assert.match(backend, /ACCOUNT_SELF_DELETION_INCOMPLETE/);
  assert.match(backend, /blog_posts/);
  assert.match(backend, /companies/);
  assert.match(backend, /jobApplications/);
  assert.match(backend, /retainedRecordTypes/);
  assert.match(backend, /payment_orders/);
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
