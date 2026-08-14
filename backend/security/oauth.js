const crypto = require('crypto');

class OAuthValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function hashOpaque(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createPkceChallenge(verifier) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(String(verifier || ''))) throw new OAuthValidationError('PKCE_VERIFIER_INVALID');
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function parseCookies(header) {
  const result = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    try {
      result[decodeURIComponent(part.slice(0, index).trim())] = decodeURIComponent(part.slice(index + 1).trim());
    } catch (_) {
      throw new OAuthValidationError('OAUTH_COOKIE_INVALID');
    }
  }
  return result;
}

function assertStateBinding(queryState, cookieState) {
  const left = Buffer.from(String(queryState || ''));
  const right = Buffer.from(String(cookieState || ''));
  if (left.length < 32 || left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new OAuthValidationError('OAUTH_STATE_INVALID');
  }
  return true;
}

function assertStateRecord(record, provider, now = Date.now()) {
  if (!record || record.provider !== provider || !record.codeVerifier || Number(record.expiresAt) < now) {
    throw new OAuthValidationError('OAUTH_STATE_INVALID');
  }
  return record;
}

function assertVerifiedIdentity({ provider, providerId, email, emailVerified }) {
  if (!['github', 'linkedin'].includes(provider) || !providerId
    || !/^\S+@\S+\.\S+$/.test(String(email || '')) || emailVerified !== true) {
    throw new OAuthValidationError('OAUTH_IDENTITY_INVALID');
  }
  return String(email).trim().toLowerCase();
}

function assertAccountLinkSafe({ providerUid, providerUser, emailOwner, normalizedEmail }) {
  if (providerUser && String(providerUser.email || '').toLowerCase() !== normalizedEmail) {
    throw new OAuthValidationError('OAUTH_IDENTITY_CONFLICT');
  }
  if (!providerUser && emailOwner && emailOwner.uid !== providerUid) {
    throw new OAuthValidationError('OAUTH_ACCOUNT_LINK_REQUIRED');
  }
  if (providerUser?.multiFactor?.enrolledFactors?.length) {
    throw new OAuthValidationError('OAUTH_MFA_REQUIRES_PRIMARY_SIGN_IN');
  }
  return true;
}

function assertExchangeRecord(record, now = Date.now()) {
  if (!record || !record.uid || !record.provider || record.usedAt || Number(record.expiresAt) < now) {
    throw new OAuthValidationError('INVALID_EXCHANGE_CODE');
  }
  return record;
}

module.exports = {
  OAuthValidationError,
  hashOpaque,
  createPkceChallenge,
  parseCookies,
  assertStateBinding,
  assertStateRecord,
  assertVerifiedIdentity,
  assertAccountLinkSafe,
  assertExchangeRecord,
};
