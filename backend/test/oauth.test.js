const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OAuthValidationError,
  hashOpaque,
  createPkceChallenge,
  parseCookies,
  assertStateBinding,
  assertStateRecord,
  assertVerifiedIdentity,
  assertAccountLinkSafe,
  assertExchangeRecord,
} = require('../security/oauth');

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof OAuthValidationError && error.code === code);
}

test('OAuth state is session-bound, constant-time comparable, provider-bound, expiring, and replay detectable', () => {
  const state = 'a'.repeat(43);
  assert.equal(assertStateBinding(state, state), true);
  for (const candidate of ['', 'short', 'b'.repeat(43), `${state}x`]) {
    expectCode(() => assertStateBinding(state, candidate), 'OAUTH_STATE_INVALID');
  }
  const record = { provider: 'github', codeVerifier: 'v'.repeat(43), expiresAt: 2_000 };
  assert.equal(assertStateRecord(record, 'github', 1_999), record);
  expectCode(() => assertStateRecord(record, 'linkedin', 1_999), 'OAUTH_STATE_INVALID');
  expectCode(() => assertStateRecord(record, 'github', 2_001), 'OAUTH_STATE_INVALID');
  expectCode(() => assertStateRecord(null, 'github', 1), 'OAUTH_STATE_INVALID');
});

test('PKCE challenge is deterministic and rejects weak verifier input', () => {
  const verifier = 'A'.repeat(43);
  assert.equal(createPkceChallenge(verifier), 'DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo');
  expectCode(() => createPkceChallenge('too-short'), 'PKCE_VERIFIER_INVALID');
  expectCode(() => createPkceChallenge('!'.repeat(43)), 'PKCE_VERIFIER_INVALID');
});

test('cookie parser handles encoded values and rejects malformed encoding', () => {
  assert.deepEqual(parseCookies('a=one; rp_oauth_state=abc%2D123; ignored'), { a: 'one', rp_oauth_state: 'abc-123' });
  expectCode(() => parseCookies('rp_oauth_state=%E0%A4%A'), 'OAUTH_COOKIE_INVALID');
});

test('verified provider identity is mandatory', () => {
  assert.equal(assertVerifiedIdentity({ provider: 'github', providerId: 123, email: 'User@Example.com', emailVerified: true }), 'user@example.com');
  for (const identity of [
    { provider: 'github', providerId: 123, email: 'user@example.com', emailVerified: false },
    { provider: 'github', providerId: null, email: 'user@example.com', emailVerified: true },
    { provider: 'unknown', providerId: 123, email: 'user@example.com', emailVerified: true },
    { provider: 'linkedin', providerId: 123, email: 'invalid', emailVerified: true },
  ]) expectCode(() => assertVerifiedIdentity(identity), 'OAUTH_IDENTITY_INVALID');
});

test('email auto-link, provider identity conflict, and custom-token MFA bypass are blocked', () => {
  const base = { providerUid: 'github:1', normalizedEmail: 'user@example.com' };
  assert.equal(assertAccountLinkSafe({ ...base, providerUser: null, emailOwner: null }), true);
  assert.equal(assertAccountLinkSafe({ ...base, providerUser: { uid: 'github:1', email: 'user@example.com' }, emailOwner: null }), true);
  expectCode(() => assertAccountLinkSafe({ ...base, providerUser: null, emailOwner: { uid: 'password-user' } }), 'OAUTH_ACCOUNT_LINK_REQUIRED');
  expectCode(() => assertAccountLinkSafe({ ...base, providerUser: { uid: 'github:1', email: 'other@example.com' }, emailOwner: null }), 'OAUTH_IDENTITY_CONFLICT');
  expectCode(() => assertAccountLinkSafe({
    ...base,
    providerUser: { uid: 'github:1', email: 'user@example.com', multiFactor: { enrolledFactors: [{ uid: 'totp-1' }] } },
    emailOwner: null
  }), 'OAUTH_MFA_REQUIRES_PRIMARY_SIGN_IN');
});

test('one-time OAuth exchange codes reject expiration and replay', () => {
  const record = { uid: 'github:1', provider: 'github', usedAt: null, expiresAt: 2_000 };
  assert.equal(assertExchangeRecord(record, 1_999), record);
  expectCode(() => assertExchangeRecord({ ...record, usedAt: {} }, 1_999), 'INVALID_EXCHANGE_CODE');
  expectCode(() => assertExchangeRecord(record, 2_001), 'INVALID_EXCHANGE_CODE');
  expectCode(() => assertExchangeRecord({ expiresAt: 2_000 }, 1_999), 'INVALID_EXCHANGE_CODE');
  assert.equal(hashOpaque('same'), hashOpaque('same'));
  assert.notEqual(hashOpaque('same'), hashOpaque('different'));
});
