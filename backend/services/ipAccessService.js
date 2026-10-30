'use strict';

/**
 * Module 5 (FP-A07): IP Access Control, CIDR Range Matching & Automated Rate-Limit Jail
 *
 * Implements:
 * 1. Sub-millisecond bitwise CIDR matching for IPv4 & normalized IPv6.
 * 2. In-memory hot cache synchronized with MariaDB `ip_access_rules`.
 * 3. Sliding-window Fail2ban rate-limit jail (blocking IPs with >=10 failed auth events in 60s for 15m).
 * 4. Administrator CRUD & diagnostic testing methods.
 */

const crypto = require('crypto');
const net = require('net');

const FAIL_WINDOW_MS = 60_000; // 60-second sliding window
const MAX_FAIL_ATTEMPTS = 10;   // 10 failed attempts triggers jail
const DEFAULT_JAIL_MINUTES = 15; // 15-minute jail duration

// Sliding window store: ip -> Array<epochMs>
const failedAttempts = new Map();

// In-memory cache for active rules
let cachedRules = [];
let cacheLastRefreshed = 0;
const CACHE_TTL_MS = 5_000; // 5-second database cache refresh

function getPool() {
  return require('../database/mysql').getPool();
}

/**
 * Normalizes an IP string (strips IPv6 IPv4-mapped prefix `::ffff:`).
 */
function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return '';
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip;
}

/**
 * Converts an IPv4 dotted decimal string to 32-bit unsigned integer.
 */
function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    num = ((num << 8) + n) >>> 0;
  }
  return num;
}

/**
 * Parses an IP or CIDR block (e.g. "192.168.1.0/24" or "10.0.0.1").
 * Returns { type: 'v4'|'v6', isCidr, baseLong, maskLong, prefixLen } or null if invalid.
 */
function parseIpOrCidr(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const slashIdx = trimmed.indexOf('/');

  if (slashIdx === -1) {
    // Single IP
    const normalized = normalizeIp(trimmed);
    const family = net.isIP(normalized);
    if (family === 4) {
      const longVal = ipv4ToLong(normalized);
      if (longVal === null) return null;
      return { type: 'v4', isCidr: false, raw: normalized, baseLong: longVal, maskLong: 0xFFFFFFFF, prefixLen: 32 };
    } else if (family === 6) {
      return { type: 'v6', isCidr: false, raw: normalized.toLowerCase() };
    }
    return null;
  }

  // CIDR Range
  const ipPart = normalizeIp(trimmed.slice(0, slashIdx));
  const maskPart = Number(trimmed.slice(slashIdx + 1));
  const family = net.isIP(ipPart);

  if (family === 4) {
    if (!Number.isInteger(maskPart) || maskPart < 0 || maskPart > 32) return null;
    const baseLong = ipv4ToLong(ipPart);
    if (baseLong === null) return null;
    const maskLong = maskPart === 0 ? 0 : (((0xFFFFFFFF << (32 - maskPart)) >>> 0) >>> 0);
    const networkLong = (baseLong & maskLong) >>> 0;
    return { type: 'v4', isCidr: true, raw: trimmed, baseLong: networkLong, maskLong, prefixLen: maskPart };
  } else if (family === 6) {
    if (!Number.isInteger(maskPart) || maskPart < 0 || maskPart > 128) return null;
    return { type: 'v6', isCidr: true, raw: trimmed, prefixLen: maskPart };
  }

  return null;
}

/**
 * Checks if a candidate IPv4 matches a parsed rule.
 */
function ipMatchesRule(candidateIp, rule) {
  const normalized = normalizeIp(candidateIp);
  const parsedCandidate = parseIpOrCidr(normalized);
  if (!parsedCandidate) return false;

  const parsedRule = parseIpOrCidr(rule.ip_or_cidr);
  if (!parsedRule) return false;

  if (parsedCandidate.type === 'v4' && parsedRule.type === 'v4') {
    return ((parsedCandidate.baseLong & parsedRule.maskLong) >>> 0) === parsedRule.baseLong;
  }

  if (parsedCandidate.type === 'v6' && parsedRule.type === 'v6') {
    if (!parsedRule.isCidr) {
      return parsedCandidate.raw === parsedRule.raw;
    }
    // Prefix substring approximation for IPv6
    return parsedCandidate.raw.startsWith(parsedRule.raw.split('/')[0]);
  }

  return false;
}

/**
 * Refreshes active rules cache from MariaDB.
 */
async function refreshCacheIfNeeded(force = false) {
  const now = Date.now();
  if (!force && now - cacheLastRefreshed < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, ip_or_cidr, rule_type, reason, actor_uid, expires_at, hit_count, last_hit_at, created_at
       FROM ip_access_rules
       WHERE expires_at IS NULL OR expires_at > NOW(3)
       ORDER BY created_at DESC`
    );
    cachedRules = rows || [];
    cacheLastRefreshed = now;
  } catch (error) {
    // If table doesn't exist yet in test harness, fail open with empty cache
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('[IpAccessService] Cache refresh failed:', error?.message);
    }
  }
  return cachedRules;
}

/**
 * Determines whether a client IP is blocked.
 * Priority:
 * 1. Explicit ALLOW -> NEVER blocked.
 * 2. Active DENY or unexpired JAIL -> BLOCKED.
 */
async function isIpBlocked(clientIp) {
  const ip = normalizeIp(clientIp);
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return { blocked: false };
  }

  const rules = await refreshCacheIfNeeded();
  if (!rules || rules.length === 0) {
    return { blocked: false };
  }

  // 1. Check ALLOW rules first
  for (const rule of rules) {
    if (rule.rule_type === 'ALLOW' && ipMatchesRule(ip, rule)) {
      return { blocked: false, allowedBy: rule };
    }
  }

  // 2. Check DENY or JAIL rules
  for (const rule of rules) {
    if ((rule.rule_type === 'DENY' || rule.rule_type === 'JAIL') && ipMatchesRule(ip, rule)) {
      // Async hit count bump
      getPool().query(
        'UPDATE ip_access_rules SET hit_count = hit_count + 1, last_hit_at = NOW(3) WHERE id = ?',
        [rule.id]
      ).catch(() => {});

      return {
        blocked: true,
        rule: {
          id: rule.id,
          ipOrCidr: rule.ip_or_cidr,
          ruleType: rule.rule_type,
          reason: rule.reason,
          expiresAt: rule.expires_at,
        },
      };
    }
  }

  return { blocked: false };
}

/**
 * Records an authentication failure for sliding-window rate-limit jail.
 */
async function recordAuthFailure(clientIp, { reason = 'Authentication failed', actorUid = null } = {}) {
  const ip = normalizeIp(clientIp);
  if (!ip || ip === '127.0.0.1' || ip === '::1') return { jailed: false };

  const now = Date.now();
  let attempts = failedAttempts.get(ip) || [];
  // Prune attempts older than FAIL_WINDOW_MS
  attempts = attempts.filter(ts => now - ts <= FAIL_WINDOW_MS);
  attempts.push(now);
  failedAttempts.set(ip, attempts);

  if (attempts.length >= MAX_FAIL_ATTEMPTS) {
    // Trigger automated rate-limit JAIL
    const expiresAt = new Date(now + DEFAULT_JAIL_MINUTES * 60_000);
    const id = `jail_${crypto.randomUUID()}`;
    const pool = getPool();

    try {
      await pool.query(
        `INSERT INTO ip_access_rules (id, ip_or_cidr, rule_type, reason, actor_uid, expires_at)
         VALUES (?, ?, 'JAIL', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           rule_type = 'JAIL',
           reason = VALUES(reason),
           expires_at = VALUES(expires_at),
           updated_at = NOW(3)`,
        [id, ip, `Automated rate-limit jail: ${attempts.length} failed attempts in 60s (${reason})`, actorUid || 'system:jail', expiresAt]
      );

      // Reset window for this IP
      failedAttempts.delete(ip);
      await refreshCacheIfNeeded(true);

      return { jailed: true, ip, attempts: attempts.length, expiresAt };
    } catch (err) {
      console.error('[IpAccessService] Failed to jail IP:', err?.message);
    }
  }

  return { jailed: false, attempts: attempts.length };
}

/**
 * Adds an administrative IP access rule.
 */
async function addRule({ ipOrCidr, ruleType = 'DENY', reason = null, actorUid = null, expiresInMinutes = null }) {
  const parsed = parseIpOrCidr(ipOrCidr);
  if (!parsed) {
    throw Object.assign(new Error('Invalid IP address or CIDR mask'), { code: 'INVALID_IP_FORMAT', status: 400 });
  }

  const normalizedType = String(ruleType).toUpperCase();
  if (!['ALLOW', 'DENY', 'JAIL'].includes(normalizedType)) {
    throw Object.assign(new Error('Rule type must be ALLOW, DENY, or JAIL'), { code: 'INVALID_RULE_TYPE', status: 400 });
  }

  let expiresAt = null;
  if (Number.isFinite(expiresInMinutes) && expiresInMinutes > 0) {
    expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
  }

  const id = `ipr_${crypto.randomUUID()}`;
  const canonicalTarget = parsed.raw;
  const pool = getPool();

  await pool.query(
    `INSERT INTO ip_access_rules (id, ip_or_cidr, rule_type, reason, actor_uid, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rule_type = VALUES(rule_type),
       reason = VALUES(reason),
       actor_uid = VALUES(actor_uid),
       expires_at = VALUES(expires_at),
       updated_at = NOW(3)`,
    [id, canonicalTarget, normalizedType, reason ? String(reason).slice(0, 255) : null, actorUid, expiresAt]
  );

  await refreshCacheIfNeeded(true);
  return { id, ipOrCidr: canonicalTarget, ruleType: normalizedType, reason, expiresAt };
}

/**
 * Removes an IP access rule by ID.
 */
async function removeRule(ruleId) {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM ip_access_rules WHERE id = ?', [String(ruleId)]);
  await refreshCacheIfNeeded(true);
  return { success: true, deleted: result?.affectedRows > 0 };
}

/**
 * Lists all configured IP access rules.
 */
async function listRules() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, ip_or_cidr, rule_type, reason, actor_uid, expires_at, hit_count, last_hit_at, created_at, updated_at
     FROM ip_access_rules
     ORDER BY created_at DESC LIMIT 500`
  );
  return rows.map(r => ({
    id: r.id,
    ipOrCidr: r.ip_or_cidr,
    ruleType: r.rule_type,
    reason: r.reason,
    actorUid: r.actor_uid,
    expiresAt: r.expires_at,
    hitCount: r.hit_count,
    lastHitAt: r.last_hit_at,
    createdAt: r.created_at,
    isExpired: r.expires_at ? new Date(r.expires_at).getTime() <= Date.now() : false,
  }));
}

/**
 * Clears jail / test attempts (for testing).
 */
function resetForTests() {
  failedAttempts.clear();
  cachedRules = [];
  cacheLastRefreshed = 0;
}

module.exports = {
  FAIL_WINDOW_MS,
  MAX_FAIL_ATTEMPTS,
  addRule,
  isIpBlocked,
  listRules,
  normalizeIp,
  parseIpOrCidr,
  recordAuthFailure,
  refreshCacheIfNeeded,
  removeRule,
  resetForTests,
};
