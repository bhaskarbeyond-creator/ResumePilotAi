import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Efficacy tests for the credential scanner in security-static.test.mjs.
 *
 * Context: two env files (remote.env, remote2.env) carrying two real Firebase
 * service-account private keys, a Cloudflare API token, an R2 account endpoint
 * and Razorpay keys sat in this repository while the credential scanner
 * reported a clean tree. The scanner was not wrong about the files it read --
 * it simply had no pattern for the shapes those secrets took.
 *
 * A scanner that cannot be shown to detect the thing that already leaked is not
 * evidence of anything. These tests extract the live patterns out of the
 * scanner source and assert they fire on representative samples of every
 * credential class involved in that incident, and stay quiet on the documented
 * placeholders that intentionally look similar.
 *
 * The samples below are synthetic: the key bodies are filler characters, not
 * key material. No real secret is reproduced here.
 */

const root = path.resolve(import.meta.dirname, '..');
const scannerSource = fs.readFileSync(path.join(root, 'tests', 'security-static.test.mjs'), 'utf8');

/** Pull the live `patterns` array out of the scanner so this test can never drift from it. */
function loadScannerPatterns() {
  const start = scannerSource.indexOf('const patterns = [');
  assert.notEqual(start, -1, 'could not locate the patterns array in security-static.test.mjs');
  const end = scannerSource.indexOf('];', start);
  const body = scannerSource.slice(start + 'const patterns = ['.length, end);

  const patterns = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // Skip comment lines; a regex literal never starts with "//".
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) continue;
    if (!trimmed.endsWith(',')) continue;
    const lastSlash = trimmed.lastIndexOf('/');
    if (lastSlash <= 0) continue;
    const source = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1).replace(/[,\s]+$/, '');
    patterns.push(new RegExp(source, flags));
  }
  assert.ok(patterns.length >= 8, `expected the scanner to define several patterns, parsed ${patterns.length}`);
  return patterns;
}

const FILLER = 'A'.repeat(120);

/** Every credential class that was actually present in the leaked files. */
const LEAKED_SHAPES = {
  'PEM private key with escaped newlines (the exact form that leaked)':
    `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n${FILLER}\\n-----END PRIVATE KEY-----\\n"`,
  'PEM key whose base64 body is wrapped every 64 chars with escaped newlines':
    `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n${'B'.repeat(64)}\\n${'C'.repeat(64)}\\n${'D'.repeat(64)}\\n-----END PRIVATE KEY-----\\n"`,
  'PEM private key spanning real newlines':
    `-----BEGIN PRIVATE KEY-----\n${FILLER}\n-----END PRIVATE KEY-----`,
  'RSA-flavoured PEM with escaped newlines':
    `KEY="-----BEGIN RSA PRIVATE KEY-----\\n${FILLER}\\n-----END RSA PRIVATE KEY-----"`,
  'Cloudflare user API token':
    'CLOUDFLARE_API_TOKEN="cfut_0000000000000000000000000000000000000000000000000"',
  'Google service-account identity':
    'FIREBASE_CLIENT_EMAIL="firebase-adminsdk-aaaaa@some-real-project-1234.iam.gserviceaccount.com"',
  'Cloudflare R2 account-scoped endpoint':
    'CLOUDFLARE_R2_ENDPOINT="https://00000000000000000000000000000000.r2.cloudflarestorage.com"',
  'Razorpay key id':
    'RAZORPAY_KEY_ID="rzp_test_AAAAAAAAAAAAAA"',
  'Stripe secret key':
    'STRIPE_SECRET="sk_live_AAAAAAAAAAAAAAAAAAAA"',
  'AWS access key id':
    'AWS_ACCESS_KEY_ID="AKIAAAAAAAAAAAAAAAAA"',
  'GitHub personal access token':
    'GITHUB_TOKEN="ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"',
  'Google API key':
    'VITE_FIREBASE_API_KEY="AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"',
};

/** Documented placeholders that must never trip the scanner. */
const DOCUMENTED_PLACEHOLDERS = [
  'firebase-adminsdk-xxx@my-project.iam.gserviceaccount.com',
  'firebase-adminsdk@project-id.iam.gserviceaccount.com',
  "FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\\\nREPLACE\\\\n-----END PRIVATE KEY-----\\\\n'",
  "privateKey: '-----BEGIN RSA PRIVATE KEY-----'",
  '-----BEGIN PRIVATE KEY-----\\nMIIEv...\\n-----END PRIVATE KEY-----',
];

test('the credential scanner detects every shape involved in the remote.env incident', () => {
  const patterns = loadScannerPatterns();
  const missed = [];
  for (const [label, sample] of Object.entries(LEAKED_SHAPES)) {
    if (!patterns.some(pattern => pattern.test(sample))) missed.push(label);
  }
  assert.deepEqual(missed, [], `the scanner would not have caught: ${missed.join(', ')}`);
});

test('the credential scanner stays quiet on documented placeholders', () => {
  const patterns = loadScannerPatterns();
  // Mirror the scrubbing the scanner applies before matching.
  const start = scannerSource.indexOf('const placeholders = [');
  assert.notEqual(start, -1, 'the scanner must declare its placeholder allowlist');
  const end = scannerSource.indexOf('];', start);
  const declared = scannerSource.slice(start, end);

  const falsePositives = [];
  for (const placeholder of DOCUMENTED_PLACEHOLDERS) {
    let scrubbed = placeholder;
    for (const known of ['firebase-adminsdk-xxx@my-project\\.iam\\.gserviceaccount\\.com', 'firebase-adminsdk@project-id\\.iam\\.gserviceaccount\\.com']) {
      if (declared.includes(known)) scrubbed = scrubbed.replace(new RegExp(known, 'g'), '');
    }
    if (patterns.some(pattern => pattern.test(scrubbed))) falsePositives.push(placeholder);
  }
  assert.deepEqual(falsePositives, [], 'documented placeholders must not be reported as secrets');
});

test('env files of any name are ignored by git, not just dot-prefixed ones', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  // `.env*` only matches names starting with ".env"; remote.env did not.
  assert.match(gitignore, /^\*\.env$/m, '*.env must be ignored so <name>.env cannot be committed');
  assert.match(gitignore, /^\*\*\/\*\.env$/m, 'nested <name>.env files must be ignored too');
  assert.match(gitignore, /^!\.env\.example$/m, '.env.example must stay tracked as the documented template');
});

test('the credential files from the incident are absent from the working tree', () => {
  for (const leaked of ['remote.env', 'remote2.env']) {
    assert.equal(fs.existsSync(path.join(root, leaked)), false, `${leaked} must not exist in the working tree`);
  }
});

test('deployment scripts source Cloudflare credentials from the environment', () => {
  for (const script of ['scratch/deploy.py', 'scratch/fast_deploy_frontend.py']) {
    const source = fs.readFileSync(path.join(root, script), 'utf8');
    assert.ok(!/cfut_[A-Za-z0-9_-]{20,}/.test(source), `${script} must not hardcode a Cloudflare token`);
    assert.ok(!/CLOUDFLARE_ZONE_ID\s*=\s*["'][0-9a-f]{32}["']/.test(source), `${script} must not hardcode a zone id`);
    assert.match(source, /os\.environ\.get\("CLOUDFLARE_API_TOKEN"/, `${script} must read the token from the environment`);
    assert.match(source, /raise SystemExit/, `${script} must refuse to run without credentials rather than proceeding`);
  }
});
