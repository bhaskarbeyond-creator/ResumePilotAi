const crypto = require('crypto');

class ResetValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isOpaqueToken(token) {
  return /^[A-Za-z0-9_-]{43}$/.test(String(token || ''));
}

function assertPasswordPolicy(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const value = String(password || '');
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || value.length < 12 || value.length > 128
    || value.toLowerCase().includes(normalizedEmail.split('@')[0])) {
    throw new ResetValidationError('PASSWORD_POLICY_FAILED');
  }
  return true;
}

function assertTokenRecord({ record, state, email, tokenHash, now = Date.now() }) {
  const activeLease = record?.leaseId && Number(record.leaseExpiresAt || 0) > now;
  if (!record || !state || state.activeTokenHash !== tokenHash || record.usedAt
    || String(record.email || '').toLowerCase() !== String(email || '').toLowerCase()
    || Number(record.expiresAt || 0) < now || activeLease) {
    throw new ResetValidationError('INVALID_RESET_TOKEN');
  }
  return record;
}

function assertLeaseOwner(record, leaseId) {
  if (!record || !leaseId || record.leaseId !== leaseId || record.usedAt) {
    throw new ResetValidationError('INVALID_RESET_TOKEN');
  }
  return true;
}

function minimumEnumerationDelay(startedAt, now = Date.now(), jitter = 0) {
  const target = 300 + Math.max(0, Math.min(99, Number(jitter) || 0));
  return Math.max(0, target - (now - startedAt));
}

module.exports = {
  ResetValidationError,
  hashToken,
  isOpaqueToken,
  assertPasswordPolicy,
  assertTokenRecord,
  assertLeaseOwner,
  minimumEnumerationDelay,
};
