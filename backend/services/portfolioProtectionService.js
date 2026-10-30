'use strict';

/**
 * Portfolio Password Protection Service
 *
 * Implements FP-C10 (Portfolio Server-Side Password Protection Challenge).
 * Uses Node.js crypto.pbkdf2 with SHA-512 and 100,000 iterations.
 * Constant-time comparison ensures resistance to timing attacks.
 */

const crypto = require('crypto');

const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';

function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw Object.assign(new Error('Password must be a non-empty string.'), {
      code: 'INVALID_PASSWORD',
      status: 400,
    });
  }
  const trimmed = password.trim();
  if (trimmed.length < 4 || trimmed.length > 128) {
    throw Object.assign(new Error('Portfolio password must be between 4 and 128 characters.'), {
      code: 'PASSWORD_LENGTH_INVALID',
      status: 400,
    });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(trimmed, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (!password || typeof password !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') {
    return false;
  }
  const [, digest, iterStr, salt, expectedHash] = parts;
  const iterations = parseInt(iterStr, 10);
  if (isNaN(iterations) || iterations < 1000) return false;

  try {
    const derived = crypto.pbkdf2Sync(password.trim(), salt, iterations, Buffer.byteLength(expectedHash, 'hex'), digest).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_err) {
    return false;
  }
}

async function setPortfolioPassword(pool, { userId, portfolioId, password }) {
  if (!portfolioId || !userId) {
    throw Object.assign(new Error('Missing portfolioId or userId'), { code: 'INVALID_PARAMETERS', status: 400 });
  }

  const [rows] = await pool.query(
    'SELECT id, user_id FROM portfolios WHERE id = ? LIMIT 1',
    [portfolioId]
  );
  if (!rows.length || rows[0].user_id !== userId) {
    throw Object.assign(new Error('Portfolio not found'), { code: 'PORTFOLIO_NOT_FOUND', status: 404 });
  }

  let newHash = null;
  if (password && typeof password === 'string' && password.trim().length > 0) {
    newHash = hashPassword(password);
  }

  await pool.query(
    'UPDATE portfolios SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newHash, portfolioId]
  );

  return {
    success: true,
    portfolioId,
    isPasswordProtected: Boolean(newHash),
  };
}

async function checkPortfolioProtection(pool, slug) {
  const [rows] = await pool.query(
    'SELECT id, slug, password_hash, is_published FROM portfolios WHERE slug = ? AND is_published = 1 LIMIT 1',
    [slug]
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    slug: rows[0].slug,
    isPasswordProtected: Boolean(rows[0].password_hash),
    passwordHash: rows[0].password_hash,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  setPortfolioPassword,
  checkPortfolioProtection,
};
