const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ResetValidationError,
  hashToken,
  isOpaqueToken,
  assertPasswordPolicy,
  assertTokenRecord,
  assertLeaseOwner,
  minimumEnumerationDelay,
} = require('../security/reset');

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof ResetValidationError && error.code === code);
}

test('reset tokens use the exact 256-bit base64url shape and hash deterministically', () => {
  const token = 'A'.repeat(43);
  assert.equal(isOpaqueToken(token), true);
  assert.equal(isOpaqueToken('A'.repeat(42)), false);
  assert.equal(isOpaqueToken(`${'A'.repeat(42)}!`), false);
  assert.match(hashToken(token), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), hashToken('B'.repeat(43)));
});

test('password policy rejects short, oversized, malformed-email, and email-derived passwords', () => {
  assert.equal(assertPasswordPolicy('user@example.com', 'A genuinely strong passphrase 2026!'), true);
  expectCode(() => assertPasswordPolicy('user@example.com', 'short'), 'PASSWORD_POLICY_FAILED');
  expectCode(() => assertPasswordPolicy('bad-email', 'A genuinely strong passphrase 2026!'), 'PASSWORD_POLICY_FAILED');
  expectCode(() => assertPasswordPolicy('user@example.com', 'prefix-user-secure-password'), 'PASSWORD_POLICY_FAILED');
  expectCode(() => assertPasswordPolicy('user@example.com', 'x'.repeat(129)), 'PASSWORD_POLICY_FAILED');
});

test('token record is email/state/expiry/single-use bound and blocks active concurrent leases', () => {
  const now = 10_000;
  const tokenHash = hashToken('A'.repeat(43));
  const base = { uid: 'u1', email: 'user@example.com', expiresAt: now + 1_000, usedAt: null };
  const state = { activeTokenHash: tokenHash };
  assert.equal(assertTokenRecord({ record: base, state, email: 'USER@example.com', tokenHash, now }), base);
  const attacks = [
    { record: null, state },
    { record: { ...base, email: 'victim@example.com' }, state },
    { record: { ...base, expiresAt: now - 1 }, state },
    { record: { ...base, usedAt: {} }, state },
    { record: { ...base, leaseId: 'other', leaseExpiresAt: now + 1 }, state },
    { record: base, state: { activeTokenHash: 'newer-token' } },
  ];
  for (const attack of attacks) expectCode(() => assertTokenRecord({
    record: attack.record, state: attack.state, email: 'user@example.com', tokenHash, now
  }), 'INVALID_RESET_TOKEN');
  assert.equal(assertTokenRecord({
    record: { ...base, leaseId: 'stale', leaseExpiresAt: now - 1 }, state,
    email: 'user@example.com', tokenHash, now
  }).uid, 'u1');
});

test('lease completion is owner-only and cannot reuse an already consumed token', () => {
  assert.equal(assertLeaseOwner({ leaseId: 'lease-1', usedAt: null }, 'lease-1'), true);
  expectCode(() => assertLeaseOwner({ leaseId: 'lease-2', usedAt: null }, 'lease-1'), 'INVALID_RESET_TOKEN');
  expectCode(() => assertLeaseOwner({ leaseId: 'lease-1', usedAt: {} }, 'lease-1'), 'INVALID_RESET_TOKEN');
  expectCode(() => assertLeaseOwner(null, 'lease-1'), 'INVALID_RESET_TOKEN');
});

test('enumeration delay has a fixed floor and bounded jitter', () => {
  assert.equal(minimumEnumerationDelay(1_000, 1_000, 0), 300);
  assert.equal(minimumEnumerationDelay(1_000, 1_100, 99), 299);
  assert.equal(minimumEnumerationDelay(1_000, 2_000, 99), 0);
  assert.equal(minimumEnumerationDelay(1_000, 1_000, 1_000), 399);
});
