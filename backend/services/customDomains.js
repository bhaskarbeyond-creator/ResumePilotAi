'use strict';

/**
 * Portfolio custom-domain registration and DNS TXT verification (DISC-043).
 *
 * WHAT "VERIFIED" MEANS HERE
 *   Registration only creates a claim and a secret token. A domain becomes
 *   VERIFIED when a DNS TXT record at that domain contains the exact token,
 *   resolved live through `dns.promises.resolveTxt`. Token generation is never
 *   reported as verification, and there is no "simulated DNS" path: when the
 *   resolver cannot be reached the result is a failed verification attempt, not
 *   a success.
 *
 * TOKEN HANDLING
 *   Only sha256(token) is stored (`token_hash`). The plaintext token is returned
 *   exactly once, in the registration response. Comparison during verification
 *   is constant-time.
 *
 * DNS REBINDING / SSRF
 *   Verification performs a TXT lookup only and never opens a socket to the
 *   claimed host, so a rebound A record cannot be used to reach an internal
 *   service. On top of that, internal, reserved and single-label names are
 *   rejected before any lookup, and the lookup is bounded by a timeout and a
 *   record-count cap. The resolver is injectable for tests (external-service
 *   boundary), never for production behaviour.
 *
 * PERSISTENCE
 *   `portfolio_custom_domains` (migration 032). Uniqueness is enforced by the
 *   database (`uq_portfolio_custom_domain`), so two portfolios can never claim
 *   one hostname, including under concurrent registration.
 */

const crypto = require('crypto');
const dns = require('dns');
const { getPool } = require('../database/mysql');

const DOMAIN_MAX_LENGTH = 253;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TOKEN_PREFIX = 'ime365-verify=';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_COOLDOWN_MS = 30_000;
const MAX_VERIFY_ATTEMPTS = 20;
const DNS_TIMEOUT_MS = 5_000;
const MAX_TXT_RECORDS = 20;
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
// Reserved/special-use names that must never be claimable as a public domain.
const RESERVED_SUFFIXES = Object.freeze([
  'localhost', '.local', '.internal', '.lan', '.home', '.corp', '.private',
  '.arpa', '.invalid', '.test', '.example', '.onion', '.alt',
]);

function domainError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/**
 * Normalize and validate an RFC 1123 hostname.
 * @returns {string} lowercase, no trailing dot
 * @throws {Error} INVALID_DOMAIN (400) | RESERVED_DOMAIN (400)
 */
function normalizeDomain(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) throw domainError('INVALID_DOMAIN', 'A domain name is required.');
  // Reject anything that is not a bare hostname: schemes, paths, ports,
  // credentials, wildcards, whitespace and IP literals.
  if (/[\s/\\@?#*]/.test(raw) || raw.includes('://') || raw.includes(':')) {
    throw domainError('INVALID_DOMAIN', 'Provide a bare hostname (for example portfolio.example.com), without a scheme, path, port or credentials.');
  }
  const domain = raw.toLowerCase().replace(/\.+$/, '');
  if (!domain || domain.length > DOMAIN_MAX_LENGTH) {
    throw domainError('INVALID_DOMAIN', `A domain name must be at most ${DOMAIN_MAX_LENGTH} characters.`);
  }
  if (domain.startsWith('.') || domain.includes('..')) {
    throw domainError('INVALID_DOMAIN', 'A domain name cannot contain empty labels.');
  }
  // IPv4 literal (or anything that looks like one) is not a registrable domain.
  if (/^\d+(?:\.\d+){1,3}$/.test(domain)) {
    throw domainError('INVALID_DOMAIN', 'IP addresses cannot be used as a custom domain.');
  }
  if (domain.includes(':')) throw domainError('INVALID_DOMAIN', 'IPv6 literals are not valid custom domains.');
  const labels = domain.split('.');
  if (labels.length < 2) {
    throw domainError('INVALID_DOMAIN', 'A custom domain needs a registrable name and a top-level domain.');
  }
  for (const label of labels) {
    if (!LABEL_PATTERN.test(label)) {
      throw domainError('INVALID_DOMAIN', 'Each label must be 1-63 characters of letters, digits or hyphens and cannot start or end with a hyphen.');
    }
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld) && !/^xn--[a-z0-9-]{2,59}$/.test(tld)) {
    throw domainError('INVALID_DOMAIN', 'The top-level domain is not a valid TLD.');
  }
  const reserved = RESERVED_SUFFIXES.some(suffix => (suffix.startsWith('.') ? domain.endsWith(suffix) : domain === suffix));
  if (reserved) throw domainError('RESERVED_DOMAIN', 'That domain is reserved and cannot be claimed.');
  return domain;
}

function tokenDigest(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/** Cryptographically secure, single-use verification token. */
function generateVerificationToken() {
  return `${TOKEN_PREFIX}${crypto.randomUUID()}`;
}

function constantTimeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function instructionsFor(domain, token, expiresAt) {
  return [
    `Add a DNS TXT record to ${domain}:`,
    `  Name/Host: @ (or the exact host ${domain})`,
    `  Type: TXT`,
    `  Value: ${token}`,
    `  TTL: 300`,
    `Then call POST /api/portfolios/:id/custom-domain/verify.`,
    `The token expires ${new Date(expiresAt).toISOString()}; DNS propagation can take a few minutes.`,
  ].join('\n');
}

function normalizeTxtRecords(records) {
  const values = [];
  for (const record of records || []) {
    const joined = Array.isArray(record) ? record.join('') : String(record || '');
    const value = joined.trim();
    if (value) values.push(value);
    if (values.length >= MAX_TXT_RECORDS) break;
  }
  return values;
}

async function resolveTxtRecords(domain, resolver, timeoutMs = DNS_TIMEOUT_MS) {
  const target = resolver && typeof resolver.resolveTxt === 'function' ? resolver : dns.promises;
  let timer = null;
  try {
    const records = await Promise.race([
      target.resolveTxt(domain),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('DNS lookup timed out'), { code: 'ETIMEOUT' })), timeoutMs);
        timer.unref?.();
      }),
    ]);
    return normalizeTxtRecords(records);
  } catch (error) {
    const code = String(error?.code || 'DNS_LOOKUP_FAILED');
    throw domainError('DNS_LOOKUP_FAILED', `DNS verification could not be completed (${code}).`, 502);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadOwnedPortfolio(connection, { portfolioId, userId }) {
  const [rows] = await connection.query(
    'SELECT id, user_id, is_published, slug FROM portfolios WHERE id = ? AND user_id = ? LIMIT 1',
    [portfolioId, userId]
  );
  return rows[0] || null;
}

/**
 * Register (or rotate the token for) a portfolio's custom domain.
 */
async function registerCustomDomain({ userId, portfolioId, domain, now = new Date(), pool = getPool() }) {
  if (!userId) throw domainError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!PORTFOLIO_ID_PATTERN.test(String(portfolioId || ''))) {
    throw domainError('INVALID_PORTFOLIO_ID', 'Invalid portfolio identifier.');
  }
  const normalized = normalizeDomain(domain);
  const token = generateVerificationToken();
  const digest = tokenDigest(token);
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + TOKEN_TTL_MS);
  const id = `pcdom_${crypto.randomUUID().replace(/-/g, '').slice(0, 40)}`;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const portfolio = await loadOwnedPortfolio(connection, { portfolioId, userId });
    if (!portfolio) throw domainError('PORTFOLIO_NOT_FOUND', 'Portfolio not found.', 404);

    const [claims] = await connection.query(
      'SELECT id, portfolio_id, user_id, status FROM portfolio_custom_domains WHERE domain = ? FOR UPDATE',
      [normalized]
    );
    const existingClaim = claims[0];
    if (existingClaim && String(existingClaim.portfolio_id) !== String(portfolioId)) {
      throw domainError('DOMAIN_ALREADY_CLAIMED', 'That domain is already claimed by another portfolio.', 409);
    }

    try {
      if (existingClaim) {
        await connection.query(
          `UPDATE portfolio_custom_domains
              SET token_hash = ?, status = 'PENDING', verify_attempts = 0, last_attempt_at = NULL,
                  expires_at = ?, verified_at = NULL, last_error = NULL
            WHERE id = ?`,
          [digest, expiresAt, existingClaim.id]
        );
      } else {
        await connection.query(
          `INSERT INTO portfolio_custom_domains
             (id, portfolio_id, user_id, domain, token_hash, status, verify_attempts, expires_at)
           VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)`,
          [id, portfolioId, userId, normalized, digest, expiresAt]
        );
      }
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw domainError('DOMAIN_ALREADY_CLAIMED', 'That domain is already claimed by another portfolio.', 409);
      }
      throw error;
    }
    await connection.commit();
    return {
      domain: normalized,
      verificationToken: token,
      status: 'PENDING',
      expiresAt: expiresAt.toISOString(),
      instructions: instructionsFor(normalized, token, expiresAt),
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Verify a claimed domain against live DNS.
 *
 * @param {object} options
 * @param {object} [options.resolver] DNS resolver (defaults to dns.promises)
 * @returns {Promise<{verified:boolean, domain:string, status:string, reason?:string}>}
 */
async function verifyCustomDomain({
  userId,
  portfolioId,
  resolver = null,
  now = new Date(),
  pool = getPool(),
  timeoutMs = DNS_TIMEOUT_MS,
} = {}) {
  if (!userId) throw domainError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!PORTFOLIO_ID_PATTERN.test(String(portfolioId || ''))) {
    throw domainError('INVALID_PORTFOLIO_ID', 'Invalid portfolio identifier.');
  }
  const connection = await pool.getConnection();
  let claim;
  try {
    await connection.beginTransaction();
    const portfolio = await loadOwnedPortfolio(connection, { portfolioId, userId });
    if (!portfolio) throw domainError('PORTFOLIO_NOT_FOUND', 'Portfolio not found.', 404);
    const [rows] = await connection.query(
      'SELECT * FROM portfolio_custom_domains WHERE portfolio_id = ? FOR UPDATE',
      [portfolioId]
    );
    claim = rows[0];
    if (!claim) throw domainError('CUSTOM_DOMAIN_NOT_FOUND', 'No custom domain is registered for this portfolio.', 404);
    if (String(claim.status) === 'VERIFIED') {
      await connection.commit();
      return { verified: true, domain: claim.domain, status: 'VERIFIED', reason: 'ALREADY_VERIFIED', verifiedAt: claim.verified_at ? new Date(claim.verified_at).toISOString() : null };
    }
    const nowDate = new Date(now);
    if (new Date(claim.expires_at).getTime() <= nowDate.getTime()) {
      await connection.query(
        "UPDATE portfolio_custom_domains SET status = 'EXPIRED', last_attempt_at = ?, last_error = 'VERIFICATION_TOKEN_EXPIRED' WHERE id = ?",
        [nowDate, claim.id]
      );
      await connection.commit();
      throw domainError('DOMAIN_VERIFICATION_EXPIRED', 'The verification token expired. Register the domain again to receive a new token.', 409);
    }
    if (Number(claim.verify_attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
      await connection.commit();
      throw domainError('DOMAIN_VERIFICATION_ATTEMPTS_EXHAUSTED', 'Verification attempts are exhausted. Register the domain again to receive a new token.', 429);
    }
    const lastAttempt = claim.last_attempt_at ? new Date(claim.last_attempt_at).getTime() : 0;
    if (lastAttempt && nowDate.getTime() - lastAttempt < VERIFICATION_COOLDOWN_MS) {
      await connection.commit();
      throw domainError('DOMAIN_VERIFICATION_THROTTLED', 'Please wait before retrying DNS verification.', 429);
    }
    // Record the attempt BEFORE the lookup: a crash mid-lookup still counts, so
    // the cooldown cannot be bypassed by disconnecting.
    await connection.query(
      'UPDATE portfolio_custom_domains SET verify_attempts = verify_attempts + 1, last_attempt_at = ? WHERE id = ?',
      [nowDate, claim.id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }

  const domain = normalizeDomain(claim.domain);
  const records = await resolveTxtRecords(domain, resolver, timeoutMs);
  const matched = records.some(record => constantTimeEqualHex(tokenDigest(record), String(claim.token_hash)));

  const finalize = await pool.getConnection();
  try {
    await finalize.beginTransaction();
    const [rows] = await finalize.query('SELECT * FROM portfolio_custom_domains WHERE id = ? FOR UPDATE', [claim.id]);
    const current = rows[0];
    if (!current) throw domainError('CUSTOM_DOMAIN_NOT_FOUND', 'No custom domain is registered for this portfolio.', 404);
    if (matched) {
      await finalize.query(
        "UPDATE portfolio_custom_domains SET status = 'VERIFIED', verified_at = ?, last_error = NULL WHERE id = ?",
        [new Date(now), claim.id]
      );
      await finalize.commit();
      return { verified: true, domain, status: 'VERIFIED', reason: 'TXT_RECORD_MATCHED', verifiedAt: new Date(now).toISOString() };
    }
    const reason = records.length ? 'TXT_RECORD_MISMATCH' : 'TXT_RECORD_MISSING';
    await finalize.query(
      'UPDATE portfolio_custom_domains SET last_error = ? WHERE id = ?',
      [reason.slice(0, 200), claim.id]
    );
    await finalize.commit();
    return {
      verified: false,
      domain,
      status: String(current.status),
      reason,
      recordsFound: records.length,
      attemptsRemaining: Math.max(0, MAX_VERIFY_ATTEMPTS - Number(current.verify_attempts || 0)),
    };
  } catch (error) {
    await finalize.rollback().catch(() => {});
    throw error;
  } finally {
    finalize.release();
  }
}

async function getCustomDomain({ userId, portfolioId, pool = getPool() } = {}) {
  if (!userId) throw domainError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!PORTFOLIO_ID_PATTERN.test(String(portfolioId || ''))) {
    throw domainError('INVALID_PORTFOLIO_ID', 'Invalid portfolio identifier.');
  }
  const [rows] = await pool.query(
    'SELECT domain, status, verify_attempts, expires_at, verified_at, last_error FROM portfolio_custom_domains WHERE portfolio_id = ? AND user_id = ? LIMIT 1',
    [portfolioId, userId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    domain: row.domain,
    status: row.status,
    verifyAttempts: Number(row.verify_attempts || 0),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    lastError: row.last_error || null,
  };
}

module.exports = {
  MAX_VERIFY_ATTEMPTS,
  RESERVED_SUFFIXES,
  TOKEN_PREFIX,
  TOKEN_TTL_MS,
  VERIFICATION_COOLDOWN_MS,
  constantTimeEqualHex,
  domainError,
  generateVerificationToken,
  getCustomDomain,
  instructionsFor,
  normalizeDomain,
  normalizeTxtRecords,
  registerCustomDomain,
  resolveTxtRecords,
  tokenDigest,
  verifyCustomDomain,
};
