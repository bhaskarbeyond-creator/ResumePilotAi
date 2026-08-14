import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/services/mfaService.js', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', import.meta.url), 'utf8');
const operations = fs.readFileSync(new URL('../src/firestore/dbOperations.js', import.meta.url), 'utf8');

test('MFA uses Firebase native TOTP enrollment and sign-in assertions', () => {
  assert.match(source, /TotpMultiFactorGenerator\.generateSecret/);
  assert.match(source, /assertionForEnrollment/);
  assert.match(source, /assertionForSignIn/);
  assert.match(source, /multiFactor\(user\)\.enroll/);
  assert.match(source, /resolveSignIn/);
});

test('MFA enrollment is authenticated, email-verified, and blocks custom-token OAuth bypass', () => {
  assert.match(source, /if \(!user\) throw new Error\('Authentication required'\)/);
  assert.match(source, /if \(!user\.emailVerified\)/);
  assert.match(source, /\['linkedin', 'github'\]\.includes\(token\.claims\.signInProvider\)/);
  assert.match(source, /OAUTH|native Firebase OIDC/i);
});

test('TOTP secrets and reusable backup codes are not stored in Firestore', () => {
  assert.doesNotMatch(operations, /totp2FA\s*:/);
  assert.doesNotMatch(source, /firestore|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /backupCodes|recoveryCodes|Math\.random/);
  assert.doesNotMatch(settings, /8392-1049|9401-2834|recovery codes copied/i);
});

test('QR generation is local and does not disclose TOTP secret to a third party', () => {
  assert.match(source, /QRCode\.toDataURL/);
  assert.doesNotMatch(source, /qrserver|chart\.googleapis|fetch\(/i);
});

test('MFA removal requires Firebase reauthentication and native unenrollment', () => {
  assert.match(settings, /reauthenticateUser\(totpDisablePassword\)/);
  assert.match(source, /multiFactor\(user\)\.unenroll/);
  assert.match(source, /getIdToken\(true\)/);
});
