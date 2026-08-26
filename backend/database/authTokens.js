'use strict';

/**
 * Password-reset & email-verification token store — MySQL authoritative.
 *
 * These single-use, lease-guarded tokens formerly lived in Firestore
 * (password_reset_tokens / email_verifications + per-account state docs).
 * They now live in MySQL tables so password reset and email verification
 * work with ZERO Firestore dependency. Semantics preserved:
 *   - only token hashes are stored; raw tokens never persist
 *   - per-account state holds ONLY the latest active token hash, so an older
 *     email cannot reset after a newer request
 *   - redemption acquires an atomic lease (60s) inside the same transaction
 *   - completion marks used/consumed; a consumed token can never be reused
 */

const { getPool } = require('./mysql');

const TOKEN_LEASE_MS = 60_000;

async function createPasswordResetToken({ tokenHash, uid, email, expiresAt }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `INSERT INTO password_reset_state (uid, active_token_hash, expires_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE active_token_hash = VALUES(active_token_hash), expires_at = VALUES(expires_at), consumed_at = NULL`,
            [uid, tokenHash, Number(expiresAt)]
        );
        await conn.query(
            `INSERT INTO password_reset_tokens (token_hash, uid, email, expires_at)
             VALUES (?, ?, ?, ?)`,
            [tokenHash, uid, String(email).slice(0, 255), Number(expiresAt)]
        );
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Atomically validate + lease a password-reset token.
 * Returns { uid, email, leaseId } or throws INVALID_RESET_TOKEN.
 * The lease is stored in the same transaction as validation.
 */
async function leasePasswordResetToken({ tokenHash, email, now = Date.now(), leaseId = null }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            'SELECT token_hash, uid, email, expires_at, used_at, lease_id, lease_expires_at FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE',
            [tokenHash]
        );
        const record = rows[0];
        if (!record) throw invalidToken();
        const [stateRows] = await conn.query(
            'SELECT active_token_hash FROM password_reset_state WHERE uid = ? FOR UPDATE',
            [record.uid]
        );
        const state = stateRows[0];
        if (!state || state.active_token_hash !== tokenHash) throw invalidToken();
        const activeLease = record.lease_id && Number(record.lease_expires_at || 0) > Number(now);
        if (record.used_at || String(record.email || '').toLowerCase() !== String(email || '').toLowerCase()
            || Number(record.expires_at || 0) < Number(now) || activeLease) {
            throw invalidToken();
        }
        const resolvedLease = leaseId || require('crypto').randomUUID();
        await conn.query(
            'UPDATE password_reset_tokens SET lease_id = ?, lease_expires_at = ? WHERE token_hash = ?',
            [resolvedLease, Number(now) + TOKEN_LEASE_MS, tokenHash]
        );
        await conn.commit();
        return { uid: record.uid, email: record.email, leaseId: resolvedLease };
    } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Completes password reset: marks the token used and the account state
 * consumed. Only the lease owner may complete.
 */
async function finalizePasswordReset({ tokenHash, uid, leaseId }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            'SELECT lease_id, used_at FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE',
            [tokenHash]
        );
        const record = rows[0];
        if (!record || record.used_at || record.lease_id !== leaseId) throw invalidToken();
        await conn.query(
            'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP, lease_id = NULL, lease_expires_at = 0 WHERE token_hash = ?',
            [tokenHash]
        );
        await conn.query(
            'UPDATE password_reset_state SET consumed_at = CURRENT_TIMESTAMP WHERE uid = ?',
            [uid]
        );
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        throw err;
    } finally {
        conn.release();
    }
}

async function releasePasswordResetLease({ tokenHash, leaseId }) {
    const pool = getPool();
    try {
        await pool.query(
            'UPDATE password_reset_tokens SET lease_id = NULL, lease_expires_at = 0 WHERE token_hash = ? AND lease_id = ?',
            [tokenHash, leaseId]
        );
    } catch { /* best-effort */ }
}

async function createEmailVerificationToken({ tokenHash, uid, email, expiresAt }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `INSERT INTO email_verification_state (uid, active_token_hash, expires_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE active_token_hash = VALUES(active_token_hash), expires_at = VALUES(expires_at), verified_at = NULL`,
            [uid, tokenHash, Number(expiresAt)]
        );
        await conn.query(
            `INSERT INTO email_verification_tokens (token_hash, uid, email, expires_at)
             VALUES (?, ?, ?, ?)`,
            [tokenHash, uid, String(email).slice(0, 255), Number(expiresAt)]
        );
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        throw err;
    } finally {
        conn.release();
    }
}

async function leaseEmailVerificationToken({ tokenHash, email, now = Date.now(), leaseId = null }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            'SELECT token_hash, uid, email, expires_at, used_at, lease_id, lease_expires_at FROM email_verification_tokens WHERE token_hash = ? FOR UPDATE',
            [tokenHash]
        );
        const record = rows[0];
        if (!record) throw invalidToken();
        const [stateRows] = await conn.query(
            'SELECT active_token_hash FROM email_verification_state WHERE uid = ? FOR UPDATE',
            [record.uid]
        );
        const state = stateRows[0];
        if (!state || state.active_token_hash !== tokenHash) throw invalidToken();
        const activeLease = record.lease_id && Number(record.lease_expires_at || 0) > Number(now);
        if (record.used_at || String(record.email || '').toLowerCase() !== String(email || '').toLowerCase()
            || Number(record.expires_at || 0) < Number(now) || activeLease) {
            throw invalidToken();
        }
        const resolvedLease = leaseId || require('crypto').randomUUID();
        await conn.query(
            'UPDATE email_verification_tokens SET lease_id = ?, lease_expires_at = ? WHERE token_hash = ?',
            [resolvedLease, Number(now) + TOKEN_LEASE_MS, tokenHash]
        );
        await conn.commit();
        return { uid: record.uid, email: record.email, leaseId: resolvedLease };
    } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        throw err;
    } finally {
        conn.release();
    }
}

async function finalizeEmailVerification({ tokenHash, uid, leaseId }) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            'SELECT lease_id, used_at FROM email_verification_tokens WHERE token_hash = ? FOR UPDATE',
            [tokenHash]
        );
        const record = rows[0];
        if (!record || record.used_at || record.lease_id !== leaseId) throw invalidToken();
        await conn.query(
            'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP, lease_id = NULL, lease_expires_at = 0 WHERE token_hash = ?',
            [tokenHash]
        );
        await conn.query(
            'UPDATE email_verification_state SET verified_at = CURRENT_TIMESTAMP WHERE uid = ?',
            [uid]
        );
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        throw err;
    } finally {
        conn.release();
    }
}

async function releaseEmailVerificationLease({ tokenHash, leaseId }) {
    const pool = getPool();
    try {
        await pool.query(
            'UPDATE email_verification_tokens SET lease_id = NULL, lease_expires_at = 0 WHERE token_hash = ? AND lease_id = ?',
            [tokenHash, leaseId]
        );
    } catch { /* best-effort */ }
}

function invalidToken() {
    const err = new Error('INVALID_TOKEN');
    err.code = 'INVALID_TOKEN';
    return err;
}

module.exports = {
    TOKEN_LEASE_MS,
    createPasswordResetToken,
    leasePasswordResetToken,
    finalizePasswordReset,
    releasePasswordResetLease,
    createEmailVerificationToken,
    leaseEmailVerificationToken,
    finalizeEmailVerification,
    releaseEmailVerificationLease,
};
