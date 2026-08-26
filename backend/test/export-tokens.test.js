'use strict';

/**
 * Export render tokens — MySQL authoritative (formerly Firestore-backed).
 * Tokens are opaque, single-use (atomic read+delete in a MySQL transaction),
 * expiring, and contain no URL/private data. The `db` argument is accepted
 * for signature compatibility but never used: Firestore is not involved.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken } = require('../security/exportTokens');
const { getPool } = require('../database/mysql');

test.beforeEach(async () => {
    await getPool().query('DELETE FROM export_render_tokens').catch(() => {});
});

test.after(async () => {
    await getPool().query('DELETE FROM export_render_tokens').catch(() => {});
});

test('private export render tokens are opaque, durable, one-time, expiring, and contain no URL data', async () => {
  const data = { firstname: 'Asha', email: 'private@example.com', template: 'Cv1' };
  const token = await createExportRenderToken(null, data, { now: 1000, ttlMs: 500 });
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(token, /Asha|private|Cv1/);

  const [rows] = await getPool().query('SELECT token_hash FROM export_render_tokens');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].token_hash.length === 64, 'only the SHA-256 hash is stored as the key');

  assert.deepEqual(await consumeExportRenderToken(null, token, { now: 1200 }), data);
  assert.equal(await consumeExportRenderToken(null, token, { now: 1201 }), null, 'single-use');
});

test('expired, malformed, and explicitly discarded render tokens fail closed', async () => {
  const expired = await createExportRenderToken(null, { secret: true }, { now: 1000, ttlMs: 10 });
  assert.equal(await consumeExportRenderToken(null, expired, { now: 1011 }), null);
  assert.equal(await consumeExportRenderToken(null, '../metadata'), null);
  const discarded = await createExportRenderToken(null, { secret: true });
  await discardExportRenderToken(null, discarded);
  assert.equal(await consumeExportRenderToken(null, discarded), null);
});

test('token store failure fails closed (no token is handed out without durable storage)', async () => {
  // Simulate store unavailability by pointing at a closed pool.
  const { getPool: getFreshPool } = require('../database/mysql');
  const pool = getFreshPool();
  await assert.rejects(
    (async () => {
      await pool.query('DROP TABLE IF EXISTS export_render_tokens');
      try {
        return await createExportRenderToken(null, { x: 1 });
      } finally {
        await getPool().query(`CREATE TABLE IF NOT EXISTS export_render_tokens (
            token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
            payload JSON NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            consumed_at TIMESTAMP NULL,
            INDEX idx_export_tokens_expiry (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {});
      }
    })(),
    /Export token store unavailable/
  );
});

// Allow clean process exit: close the shared MySQL pool after this file.
const { after: teardown } = require('node:test');
teardown(async () => { try { await getPool().end(); } catch { /* already closed */ } });
