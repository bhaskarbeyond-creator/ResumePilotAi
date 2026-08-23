import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fetchAdminWithReauth, registerAdminReauthHandler } from '../src/services/adminReauth.js';

test('shared Admin settings reauthentication retries the exact request once', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let prompts = 0;
  const unregister = registerAdminReauthHandler(async () => { prompts += 1; });
  try {
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 403, json: async () => ({ error: { code: 'RECENT_AUTH_REQUIRED', message: 'recent auth' } }) }
        : { ok: true, status: 200, json: async () => ({ success: true }) };
    };
    const result = await fetchAdminWithReauth('/api/admin/settings/modules', { method: 'POST' });
    assert.equal(result.data.success, true);
    assert.equal(calls, 2);
    assert.equal(prompts, 1);
  } finally { unregister(); globalThis.fetch = originalFetch; }
});

test('Admin shell mounts accessible reauthentication and generic persistence uses it', async () => {
  const [admin, prompt, operations] = await Promise.all([
    fs.readFile('src/components/admin/Admin.jsx', 'utf8'),
    fs.readFile('src/components/admin/AdminReauthPrompt.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
  ]);
  assert.match(admin, /<AdminReauthPrompt \/>/);
  assert.match(prompt, /role="dialog"/);
  assert.match(prompt, /reauthenticateUser/);
  assert.match(operations, /fetchAdminWithReauth/);
});

test('email, payment and AI tests have distinct routes and email toggles wait for runtime confirmation', async () => {
  const [email, payment, ai] = await Promise.all([
    fs.readFile('src/components/admin/settings/EmailSmtpSettings.jsx', 'utf8'),
    fs.readFile('src/components/admin/settings/subscriptionsSettings.jsx', 'utf8'),
    fs.readFile('src/services/adminAiSettings.js', 'utf8'),
  ]);
  assert.match(email, /\/api\/email\/admin\/test-connection/);
  const paymentOperations = await fs.readFile('src/firestore/dbOperations.js', 'utf8');
  assert.match(paymentOperations, /\/api\/admin\/payment\/test-provider/);
  assert.match(payment, /testPaymentProvider/);
  assert.match(ai, /\/api\/admin\/ai\/test-provider/);
  assert.match(email, /setEnabledTemplates\(updated\)/);
  assert.ok(email.indexOf('setEnabledTemplates(updated)') > email.indexOf('if (!response.ok || !data.success)'));
  const [emailBackend, policy] = await Promise.all([
    fs.readFile('backend/routes/email.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
  ]);
  assert.match(policy, /LEGACY_EMAIL_ADMIN_PATHS\.has\(pathname\)/);
  assert.match(email, /\/api\/email\/admin\/save-smtp/);
  assert.doesNotMatch(email, /\/api\/admin\/save-smtp/);
  assert.match(emailBackend, /passwordConfigured/);
  assert.match(emailBackend, /projectMailSection/);
  assert.match(emailBackend, /normalizedMailSection/);
  assert.match(emailBackend, /stored\.password/);
  assert.match(emailBackend, /merged\.password = current\.password/);
});

test('generic backend settings preserve redacted secrets instead of replacing them with blanks', async () => {
  const backend = await fs.readFile('backend/index.js', 'utf8');
  assert.match(backend, /preserveAdminSettingSecrets/);
  assert.match(backend, /isPrivateAdminSettingKey/);
  assert.match(backend, /Secret fields are intentionally absent from browser projections/);
  assert.match(backend, /\[category\]: persisted/);
});

test('OAuth Admin tests use recent-auth retry and runtime reads canonical secret settings', async () => {
  const [view, backend, policy] = await Promise.all([
    fs.readFile('src/components/admin/settings/SocialAuthSettings.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
  ]);
  assert.match(view, /fetchAdminWithReauth\(`\/api\/auth\/\$\{provider\}\/test-credentials`\)/);
  assert.doesNotMatch(view, /credentials detected in environment/);
  assert.match(backend, /adminConfiguration\.data\(\)\?\.socialAuth/);
  assert.match(policy, /'\/auth\/linkedin\/test-credentials'/);
  assert.match(policy, /'\/auth\/github\/test-credentials'/);
});

test('website metadata and analytics persistence is revisioned, audited, and confirmed', async () => {
  const [backend, operations, website, analytics, rules] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/components/admin/settings/websiteSettings.jsx', 'utf8'), fs.readFile('src/components/admin/settings/anlyticsSettings.jsx', 'utf8'), fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(backend, /WEBSITE_METADATA_UPDATED/);
  assert.match(backend, /ADMIN_TARGET_CHANGED/);
  assert.match(operations, /\/api\/admin\/website-meta/);
  assert.doesNotMatch(operations, /collection\(['"]data['"]\)\.doc\(['"]meta['"]\)\.(?:set|update)/);
  assert.match(website, /await settWebsiteData/);
  assert.match(analytics, /await editTrackingCode/);
  assert.match(rules, /id in \['meta','frontendstats','public_config'\]/);
});

test('coupon administration is backend-only, revisioned, and preserves authoritative usage', async () => {
  const [backend, operations, view, rules] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'), fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/components/admin/settings/subscriptionsSettings.jsx', 'utf8'), fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(backend, /COUPON_SAVED/);
  assert.match(backend, /COUPON_DELETED/);
  assert.match(backend, /usedCount: Number\(snapshot\.data\(\)\?\.usedCount/);
  assert.match(operations, /\/api\/admin\/coupons/);
  const couponAdmin = operations.slice(operations.indexOf('export async function getAllCouponsAdmin'), operations.indexOf('// Subscription preferences'));
  assert.doesNotMatch(couponAdmin, /collection\(['"]coupons['"]\)|recordTransaction|incrementCouponUsage/);
  assert.match(view, /revision: c\.revision/);
  assert.match(rules, /match \/coupons\/\{id\} \{ allow read: if signedIn\(\); allow write: if false/);
});

test('Ads mutations are backend-only, revision checked, audited, validated and confirmation gated', async () => {
  const [view, operations, backend, rules] = await Promise.all([
    fs.readFile('src/components/admin/settings/adsSettings.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(view, /role="alertdialog"/);
  assert.match(view, /sanitizeImageUrl/);
  assert.match(operations, /\/api\/admin\/ads/);
  assert.match(backend, /ADVERTISEMENT_CREATED/);
  assert.match(backend, /ADVERTISEMENT_DELETED/);
  assert.match(rules, /match \/ads\/\{id\}[^\n]+allow write: if false/);
});

test('Twilio settings use a secret-free revisioned backend route and runtime namespace', async () => {
  const [view, operations, backend] = await Promise.all([
    fs.readFile('src/components/admin/settings/TwilioSmsSettings.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
  ]);
  assert.match(view, /\/api\/admin\/twilio-settings/);
  assert.match(view, /accountSidConfigured/);
  assert.match(view, /expectedRevision: revision/);
  assert.doesNotMatch(view, /saveSystemSettings\('twilio'/);
  assert.match(operations, /fetchAdminWithReauth\('\/api\/send-sms'/);
  assert.match(backend, /TWILIO_SETTINGS_UPDATED/);
  assert.match(backend, /loadTwilioRuntimeConfig/);
  const genericCategories = backend.match(/const GENERIC_ADMIN_SETTING_CATEGORIES[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(genericCategories, /'twilio'/);
});

test('runtime Firebase private-key rotation is disabled by default and represented truthfully', async () => {
  const [view, backend] = await Promise.all([
    fs.readFile('src/components/admin/settings/FirebaseSettings.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
  ]);
  assert.match(backend, /ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION/);
  assert.match(backend, /RUNTIME_SECRET_ROTATION_DISABLED/);
  assert.match(view, /Workload Identity or the deployment Secret Manager/);
  assert.match(view, /fetchAdminWithReauth/);
});
