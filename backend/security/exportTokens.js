const crypto = require('crypto');

const DEFAULT_TTL_MS = 60_000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const memoryTokens = new Map();

// Periodic prune of expired memory tokens (every 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of memoryTokens.entries()) {
    if (val.expiresAt <= now) {
      memoryTokens.delete(key);
    }
  }
}, 30_000).unref();

async function createExportRenderToken(db, data, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const expiresAt = now + ttlMs;
  memoryTokens.set(tokenHash, { data, expiresAt });
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('export_render_tokens').doc(tokenHash).create({ data, expiresAt: new Date(expiresAt), createdAt: new Date(now) }).catch(() => {});
    } catch (_) {}
  }
  return token;
}

async function consumeExportRenderToken(db, token, { now = Date.now() } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return null;
  const tokenHash = hash(token);
  if (memoryTokens.has(tokenHash)) {
    const record = memoryTokens.get(tokenHash);
    memoryTokens.delete(tokenHash);
    if (record.expiresAt > now) {
      if (db && typeof db.collection === 'function') {
        db.collection('export_render_tokens').doc(tokenHash).delete().catch(() => {});
      }
      return record.data;
    }
    return null;
  }
  if (!db || typeof db.runTransaction !== 'function') return null;
  const reference = db.collection('export_render_tokens').doc(tokenHash);
  let data = null;
  try {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return;
      const record = snapshot.data() || {};
      transaction.delete(reference);
      const expiresAt = record.expiresAt?.toMillis?.() || new Date(record.expiresAt || 0).getTime();
      if (Number(expiresAt || 0) > now) data = record.data;
    });
  } catch (_) {}
  return data;
}

async function discardExportRenderToken(db, token) {
  if (!token) return;
  const tokenHash = hash(token);
  memoryTokens.delete(tokenHash);
  if (db && typeof db.collection === 'function') {
    await db.collection('export_render_tokens').doc(tokenHash).delete().catch(() => {});
  }
}

module.exports = { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken, hash };

