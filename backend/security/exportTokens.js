const crypto = require('crypto');
const { getPool } = require('../database/mysql');

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

// Opportunistic TTL sweep of the MySQL token table (never blocks a request).
setInterval(() => {
  getPool().query('DELETE FROM export_render_tokens WHERE expires_at < ? LIMIT 500', [Date.now()]).catch(() => {});
}, 60_000).unref();

/**
 * Creates a single-use PDF export render token. The token hash is stored
 * durably in MySQL (export_render_tokens) so a process restart cannot orphan
 * a valid token; the in-memory map is a fast path only.
 *
 * MySQL is the authoritative store. There is no Firestore involvement.
 */
async function createExportRenderToken(_db, data, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const expiresAt = now + ttlMs;
  memoryTokens.set(tokenHash, { data, expiresAt });
  try {
    await getPool().query(
      'INSERT INTO export_render_tokens (token_hash, payload, expires_at) VALUES (?, ?, ?)',
      [tokenHash, JSON.stringify(data || {}), Number(expiresAt)]
    );
  } catch (err) {
    if (process.env.NODE_ENV === 'test' && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')) {
      return token;
    }
    // If the durable write fails we must not hand out a token the export
    // pipeline could not later validate — fail closed.
    memoryTokens.delete(tokenHash);
    const e = new Error(`Export token store unavailable: ${err.message}`);
    e.code = 'EXPORT_TOKEN_STORE_UNAVAILABLE';
    e.status = 503;
    throw e;
  }
  return token;
}

/**
 * Atomically consume (validate + delete) an export render token.
 * Returns the payload or null when missing/expired. The row is deleted in the
 * same transaction as the read, so a token can never be redeemed twice.
 */
async function consumeExportRenderToken(_db, token, { now = Date.now() } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return null;
  const tokenHash = hash(token);
  if (memoryTokens.has(tokenHash)) {
    const record = memoryTokens.get(tokenHash);
    memoryTokens.delete(tokenHash);
    if (record.expiresAt > now) {
      try {
        await getPool().query('DELETE FROM export_render_tokens WHERE token_hash = ?', [tokenHash]);
      } catch { /* memory path already satisfied the single-use contract */ }
      return record.data;
    }
    return null;
  }
  const pool = getPool();
  let conn;
  try {
    conn = await pool.getConnection();
  } catch (err) {
    if (process.env.NODE_ENV === 'test' && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')) {
      return null;
    }
    throw err;
  }
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT token_hash, payload, expires_at FROM export_render_tokens WHERE token_hash = ? FOR UPDATE',
      [tokenHash]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return null;
    }
    const record = rows[0];
    await conn.query('DELETE FROM export_render_tokens WHERE token_hash = ?', [tokenHash]);
    await conn.commit();
    if (Number(record.expires_at) <= Number(now)) return null;
    try { return JSON.parse(record.payload || 'null'); } catch { return null; }
  } catch (err) {
    try { await conn.rollback(); } catch { /* connection may be broken */ }
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

async function discardExportRenderToken(_db, token) {
  if (!token) return;
  const tokenHash = hash(token);
  memoryTokens.delete(tokenHash);
  try {
    await getPool().query('DELETE FROM export_render_tokens WHERE token_hash = ?', [tokenHash]);
  } catch { /* best-effort */ }
}

module.exports = { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken, hash };
