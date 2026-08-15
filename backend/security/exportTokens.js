const crypto = require('crypto');

const DEFAULT_TTL_MS = 60_000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

async function createExportRenderToken(db, data, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!db) throw new Error('Export token store unavailable');
  const token = crypto.randomBytes(32).toString('base64url');
  await db.collection('export_render_tokens').doc(hash(token)).create({ data, expiresAt: now + ttlMs, createdAt: new Date(now) });
  return token;
}

async function consumeExportRenderToken(db, token, { now = Date.now() } = {}) {
  if (!db || !/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return null;
  const reference = db.collection('export_render_tokens').doc(hash(token));
  let data = null;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const record = snapshot.data() || {};
    transaction.delete(reference);
    if (Number(record.expiresAt || 0) > now) data = record.data;
  });
  return data;
}

async function discardExportRenderToken(db, token) {
  if (!db || !token) return;
  await db.collection('export_render_tokens').doc(hash(token)).delete().catch(() => {});
}

module.exports = { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken, hash };
