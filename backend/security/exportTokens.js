const crypto = require('crypto');

const tokens = new Map();
const DEFAULT_TTL_MS = 60_000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

function createExportRenderToken(data, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  tokens.set(hash(token), { data, expiresAt: now + ttlMs });
  return token;
}

function consumeExportRenderToken(token, { now = Date.now() } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return null;
  const key = hash(token);
  const record = tokens.get(key);
  tokens.delete(key);
  return record && record.expiresAt > now ? record.data : null;
}

function discardExportRenderToken(token) {
  if (token) tokens.delete(hash(token));
}

module.exports = { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken, _tokens: tokens };
