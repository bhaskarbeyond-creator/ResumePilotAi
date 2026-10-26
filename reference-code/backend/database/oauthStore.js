'use strict';

/**
 * OAuth state & exchange-code store — MySQL authoritative.
 *
 * Formerly these single-use records lived in Firestore collections
 * (oauth_states / oauth_exchange_codes). They are now plain transactional
 * rows in MySQL/MariaDB so the OAuth login flow has ZERO Firestore
 * dependency. All records are single-use: consumption deletes the row in
 * the same transaction that validates it.
 */

const { getPool } = require('./mysql');

const STATE_TABLE = 'oauth_states';
const EXCHANGE_TABLE = 'oauth_exchange_codes';
const SWEEP_BATCH = 500;

/**
 * Insert a one-time anti-CSRF OAuth state record.
 * @param {{stateHash: string, provider: string, codeVerifier: string, expiresAt: number}} record
 */
async function createOAuthState({ stateHash, provider, codeVerifier, expiresAt }) {
    const pool = getPool();
    await pool.query(
        `INSERT INTO ${STATE_TABLE} (state_hash, provider, code_verifier, expires_at) VALUES (?, ?, ?, ?)`,
        [stateHash, String(provider).slice(0, 32), codeVerifier, Number(expiresAt)]
    );
}

/**
 * Atomically read + delete a one-time OAuth state record.
 * Returns the record or null when missing/expired. Deletes inside the same
 * transaction as the read so replay is impossible.
 */
async function consumeOAuthState({ stateHash, provider, now = Date.now() }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            `SELECT state_hash, provider, code_verifier, expires_at FROM ${STATE_TABLE} WHERE state_hash = ? FOR UPDATE`,
            [stateHash]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return null;
        }
        const record = rows[0];
        await conn.query(`DELETE FROM ${STATE_TABLE} WHERE state_hash = ?`, [stateHash]);
        await conn.commit();
        if (String(record.provider) !== String(provider)) return null;
        if (Number(record.expires_at) < Number(now)) return null;
        return { provider: record.provider, codeVerifier: record.code_verifier, expiresAt: Number(record.expires_at) };
    } catch (err) {
        try { await conn.rollback(); } catch { /* connection may be broken */ }
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Insert a one-time OAuth exchange code (exchanged for a Firebase custom token).
 */
async function createOAuthExchangeCode({ codeHash, uid, provider, expiresAt }) {
    const pool = getPool();
    await pool.query(
        `INSERT INTO ${EXCHANGE_TABLE} (code_hash, uid, provider, expires_at) VALUES (?, ?, ?, ?)`,
        [codeHash, String(uid).slice(0, 128), String(provider).slice(0, 32), Number(expiresAt)]
    );
}

/**
 * Atomically read + delete a one-time OAuth exchange code.
 * Returns { uid, provider } or null when missing/expired. The row is deleted
 * in the same transaction as the read, so a code can never be redeemed twice.
 */
async function redeemOAuthExchangeCode({ codeHash, now = Date.now() }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            `SELECT code_hash, uid, provider, expires_at FROM ${EXCHANGE_TABLE} WHERE code_hash = ? FOR UPDATE`,
            [codeHash]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return null;
        }
        const record = rows[0];
        await conn.query(`DELETE FROM ${EXCHANGE_TABLE} WHERE code_hash = ?`, [codeHash]);
        await conn.commit();
        if (Number(record.expires_at) < Number(now)) return null;
        return { uid: record.uid, provider: record.provider, expiresAt: Number(record.expires_at) };
    } catch (err) {
        try { await conn.rollback(); } catch { /* connection may be broken */ }
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Opportunistic TTL sweep — removes expired state/exchange rows. Called from
 * OAuth helpers without awaiting; never blocks a request.
 */
async function sweepExpired(now = Date.now()) {
    const pool = getPool();
    try {
        await pool.query(`DELETE FROM ${STATE_TABLE} WHERE expires_at < ? LIMIT ${SWEEP_BATCH}`, [Number(now)]);
        await pool.query(`DELETE FROM ${EXCHANGE_TABLE} WHERE expires_at < ? LIMIT ${SWEEP_BATCH}`, [Number(now)]);
    } catch { /* best-effort hygiene only */ }
}

module.exports = {
    createOAuthState,
    consumeOAuthState,
    createOAuthExchangeCode,
    redeemOAuthExchangeCode,
    sweepExpired,
    STATE_TABLE,
    EXCHANGE_TABLE,
};
