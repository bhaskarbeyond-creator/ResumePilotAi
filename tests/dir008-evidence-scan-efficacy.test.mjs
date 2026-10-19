/**
 * DIR-008 — the evidence scanner must actually fire (R-48).
 *
 * A clean report is only meaningful if the rules detect real shapes. These
 * canaries are synthetic and never written to disk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findHits } from '../scripts/dir008-scan-evidence.mjs';

const ROOT = process.cwd();

test('secret canaries are detected', () => {
  const canaries = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'Bearer abcdefghijklmnopqrstuvwxyz012345',
    "apiKey = 'abcdef1234567890'",
  ];
  const ids = new Set(findHits(canaries.join('\n')).map((hit) => hit.rule));
  for (const expected of ['private-key', 'aws-access-key', 'github-token', 'jwt', 'bearer-token', 'password-assignment']) {
    assert.ok(ids.has(expected), `${expected} rule did not fire`);
  }
});

test('non-reserved PII is flagged, reserved fixtures are not', () => {
  const flagged = findHits('Reach me at candidate.real@gmail.com or +1 415 555 2671');
  const rules = flagged.map((hit) => hit.rule);
  assert.ok(rules.includes('real-email'), 'a real-looking email was not flagged');
  assert.ok(rules.includes('non-reserved-phone'), 'a real-looking phone number was not flagged');

  const allowed = findHits('Asha Rao <asha.rao@example.com> +91 90000 00000');
  assert.deepEqual(allowed, [], `reserved documentation identities were flagged: ${JSON.stringify(allowed)}`);
});

test('hex identifiers are not mistaken for phone numbers', () => {
  const hits = findHits('fingerprint 9f2a4c1e77bd88aa0c3d5e6f1a2b3c4d5e6f7a8b');
  assert.deepEqual(hits, []);
});

test('the committed evidence scan is present and clean', () => {
  const reportPath = path.join(ROOT, 'docs', 'test-reports', 'DIR-008-evidence-secret-scan.json');
  assert.ok(fs.existsSync(reportPath), 'evidence scan report is missing');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.blocking, 0, `evidence contains ${report.blocking} blocking secret findings`);
  assert.ok(report.scanned.files > 100, 'scan did not cover the evidence bundle');
  assert.match(report.note, /redacted/i);
});
