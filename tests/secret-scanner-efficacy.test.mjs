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

/**
 * Fixtures are ASSEMBLED AT RUNTIME from fragments rather than written as
 * literals.
 *
 * This file has to contain samples of every credential shape the scanner must
 * catch — but the scanner also scans this file, as it scans every tracked file.
 * Writing the samples literally would make this test a permanent, self-inflicted
 * finding, and the only ways out would be to exempt the file from scanning or to
 * soften a pattern. Both weaken the control.
 *
 * Building each sample by concatenation means the dangerous shape exists only in
 * memory while the test runs. The scanner keeps scanning this file at full
 * strength and correctly reports nothing, and the fixtures are still byte-exact
 * at the point of assertion.
 */
const PEM_BEGIN = `-----${'BEGIN'} PRIVATE KEY-----`;
const PEM_END = `-----${'END'} PRIVATE KEY-----`;
const RSA_BEGIN = `-----${'BEGIN'} RSA PRIVATE KEY-----`;
const RSA_END = `-----${'END'} RSA PRIVATE KEY-----`;

// Split prefixes so no complete token literal appears in the source.
const CF_TOKEN = `cfut${'_'}${'0'.repeat(49)}`;
const GSA_EMAIL = `firebase-adminsdk-aaaaa@some-real-project-1234.iam.${'gservice'}account.com`;
const R2_ENDPOINT = `${'0'.repeat(32)}.r2.${'cloudflare'}storage.com`;
const RZP_KEY = `rzp${'_'}test${'_'}${'A'.repeat(14)}`;
const STRIPE_KEY = `sk${'_'}live${'_'}${'A'.repeat(20)}`;
const AWS_KEY = `AKIA${'A'.repeat(16)}`;
const GH_TOKEN = `ghp${'_'}${'A'.repeat(36)}`;
const GOOGLE_KEY = `AIza${'A'.repeat(35)}`;

/** Every credential class that was actually present in the leaked files. */
const LEAKED_SHAPES = {
  'PEM private key with escaped newlines (the exact form that leaked)':
    `FIREBASE_PRIVATE_KEY="${PEM_BEGIN}\\n${FILLER}\\n${PEM_END}\\n"`,
  'PEM key whose base64 body is wrapped every 64 chars with escaped newlines':
    `FIREBASE_PRIVATE_KEY="${PEM_BEGIN}\\n${'B'.repeat(64)}\\n${'C'.repeat(64)}\\n${'D'.repeat(64)}\\n${PEM_END}\\n"`,
  'PEM private key spanning real newlines':
    `${PEM_BEGIN}\n${FILLER}\n${PEM_END}`,
  'RSA-flavoured PEM with escaped newlines':
    `KEY="${RSA_BEGIN}\\n${FILLER}\\n${RSA_END}"`,
  'Cloudflare user API token':
    `CLOUDFLARE_API_TOKEN="${CF_TOKEN}"`,
  'Google service-account identity':
    `FIREBASE_CLIENT_EMAIL="${GSA_EMAIL}"`,
  'Cloudflare R2 account-scoped endpoint':
    `CLOUDFLARE_R2_ENDPOINT="https://${R2_ENDPOINT}"`,
  'Razorpay key id':
    `RAZORPAY_KEY_ID="${RZP_KEY}"`,
  'Stripe secret key':
    `STRIPE_SECRET="${STRIPE_KEY}"`,
  'AWS access key id':
    `AWS_ACCESS_KEY_ID="${AWS_KEY}"`,
  'GitHub personal access token':
    `GITHUB_TOKEN="${GH_TOKEN}"`,
  'Google API key':
    `VITE_FIREBASE_API_KEY="${GOOGLE_KEY}"`,
};

/** Documented placeholders that must never trip the scanner. */
const DOCUMENTED_PLACEHOLDERS = [
  `firebase-adminsdk-xxx@my-project.iam.${'gservice'}account.com`,
  `firebase-adminsdk@project-id.iam.${'gservice'}account.com`,
  `FIREBASE_PRIVATE_KEY: '${PEM_BEGIN}\\nREPLACE\\n${PEM_END}\\n'`,
  `privateKey: '${RSA_BEGIN}'`,
  `${PEM_BEGIN}\\nMIIEv...\\n${PEM_END}`,
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

test('legacy scratch deployment scripts stay retired', () => {
  for (const script of ['scratch/deploy.py', 'scratch/fast_deploy_frontend.py']) {
    assert.equal(fs.existsSync(path.join(root, script)), false, `${script} must not be restored as a production interface`);
  }
  const releaseWorkflow = fs.readFileSync(path.join(root, 'docs', 'SAFE_PRODUCTION_WORKFLOW.md'), 'utf8');
  assert.match(releaseWorkflow, /restricted|forced-command|approved/i);
});
