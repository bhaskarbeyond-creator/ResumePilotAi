'use strict';

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { createEncryptionProvider, isEncryptedEnvelope } = require('../enterprise/encryptionProvider');

const DEFAULT_TTL_MS = 60_000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');

function encryptionProvider() {
  const provider = createEncryptionProvider(process.env);
  if (!provider) {
    throw Object.assign(new Error('Export token payload encryption is unavailable.'), {
      code: 'EXPORT_TOKEN_ENCRYPTION_UNAVAILABLE', status: 503,
    });
  }
  return provider;
}

// Opportunistic TTL sweep of the MariaDB token table. Cleanup is not part of
// validation: every redemption independently checks expiry under row lock.
let _sweepUnavailableWarned = false;
setInterval(() => {
  if (process.env.DEGRADED_MODE_REPOSITORY === 'inmemory') return;
  getPool().query('DELETE FROM export_render_tokens WHERE expires_at < ? LIMIT 500', [Date.now()]).catch(error => {
    if (!_sweepUnavailableWarned) {
      _sweepUnavailableWarned = true;
      console.warn('[Export token sweep] Database unavailable; sweep skipped until DB reconnects:', error.code || error.message);
    }
  });
}, 60_000).unref();

/**
 * Create a single-use PDF-render token. Only its SHA-256 hash and an encrypted
 * payload are committed to MariaDB. No in-memory acceptance path exists: a
 * durable-store or encryption failure means no bearer token is returned.
 */
async function createExportRenderToken(data, { now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(token);
  const expiresAt = Number(now) + Math.max(1, Math.min(Number(ttlMs) || DEFAULT_TTL_MS, 5 * 60_000));
  const sealedPayload = encryptionProvider().encryptValue(data || {});
  try {
    await getPool().query(
      'INSERT INTO export_render_tokens (token_hash, payload, expires_at) VALUES (?, ?, ?)',
      [tokenHash, JSON.stringify(sealedPayload), expiresAt]
    );
  } catch (error) {
    const wrapped = new Error(`Export token store unavailable: ${error.message}`);
    wrapped.code = 'EXPORT_TOKEN_STORE_UNAVAILABLE';
    wrapped.status = 503;
    throw wrapped;
  }
  return token;
}

/**
 * Atomically consume (read + delete) a token. The transaction commits the
 * deletion before decryption is attempted, so corrupt or undecryptable payloads
 * cannot be replayed indefinitely.
 */
async function consumeExportRenderToken(token, { now = Date.now() } = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return null;
  const tokenHash = hash(token);
  const pool = getPool();
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT payload, expires_at FROM export_render_tokens WHERE token_hash = ? FOR UPDATE',
      [tokenHash]
    );
    if (!rows.length) {
      await connection.rollback();
      return null;
    }
    await connection.query('DELETE FROM export_render_tokens WHERE token_hash = ?', [tokenHash]);
    await connection.commit();
    const record = rows[0];
    if (Number(record.expires_at) <= Number(now)) return null;
    let envelope;
    try { envelope = typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload; }
    catch { return null; }
    if (!isEncryptedEnvelope(envelope)) return null;
    try { return encryptionProvider().decryptValue(envelope); }
    catch (error) {
      // The bearer has already been consumed. Surface key-custody outages so
      // operators can distinguish them from invalid user input.
      if (error?.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE' || error?.code === 'EXPORT_TOKEN_ENCRYPTION_UNAVAILABLE') {
        throw Object.assign(new Error('Export token payload cannot be decrypted.'), {
          code: 'EXPORT_TOKEN_ENCRYPTION_UNAVAILABLE', status: 503,
        });
      }
      return null;
    }
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

/** Discard is an authoritative revocation and therefore propagates store
 * failures; callers decide whether to surface or alert alongside their primary
 * operation error. */
async function discardExportRenderToken(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return false;
  const [result] = await getPool().query('DELETE FROM export_render_tokens WHERE token_hash = ?', [hash(token)]);
  return Number(result?.affectedRows || 0) > 0;
}

module.exports = { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken, hash };
