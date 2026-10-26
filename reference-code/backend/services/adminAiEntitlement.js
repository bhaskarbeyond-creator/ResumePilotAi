'use strict';

const crypto = require('crypto');
const { resolveEffectiveEntitlement } = require('../security/entitlements');
const { getRepository } = require('../repositories');
const { getPool } = require('../database/mysql');

const DEFAULT_GLOBAL_QUOTAS = Object.freeze({
  Basic: { dailyRequests: 10, maxTokens: 2048, label: 'Free / Basic Tier' },
  Premium: { dailyRequests: 100, maxTokens: 4096, label: 'Pro / Premium Tier' },
  Enterprise: { dailyRequests: 5000, maxTokens: 8192, label: 'Enterprise Tier' },
  Admin: { dailyRequests: 10000, maxTokens: 16384, label: 'Administrative Access' },
});

function dayKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}
function notFound() { return Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 }); }

function asStorageError(error) {
  if (error?.status) return error;
  error.code = error.code || 'AI_ENTITLEMENT_STORAGE_UNAVAILABLE';
  error.status = 503;
  return error;
}

async function getUserAiEntitlement(_database, uid) {
  try {
  if (!uid) throw Object.assign(new Error('User id is required'), { code: 'USER_ID_REQUIRED', status: 400 });
  const repo = getRepository();
  const today = dayKey();
  const [userData, [usageRows], [quotaRows]] = await Promise.all([
    repo.getUser(uid),
    getPool().query('SELECT count FROM ai_usage WHERE day_key = ? AND uid = ? LIMIT 1', [today, uid]),
    getPool().query("SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1"),
  ]);
  if (!userData) throw notFound();
  const storedQuota = parseJson(quotaRows[0]?.data, {});
  const entitlement = resolveEffectiveEntitlement(userData, { quotaConfig: storedQuota });
  const plan = entitlement.effectiveTier || 'Basic';
  const baseQuota = DEFAULT_GLOBAL_QUOTAS[plan]?.dailyRequests || entitlement.dailyLimit || 10;
  const effectiveLimit = entitlement.dailyLimit || baseQuota;
  const usedToday = Number(usageRows[0]?.count || 0);
  return {
    uid, plan, baseQuota, effectiveLimit, usedToday,
    remainingToday: Math.max(0, effectiveLimit - usedToday),
    isExhausted: usedToday >= effectiveLimit,
    customOverride: userData.aiQuotaOverride || null,
    lastResetAt: userData.aiQuotaLastResetAt || null,
    source: 'MARIADB',
  };

  } catch (error) {
    throw asStorageError(error);
  }
}

async function mutateUserQuota({ uid, actorUid, requestId, action, mutateExtra, usageReset = false }) {
  let connection;
  let usageRowsDeleted = 0;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT extra_data, revision FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [uid]);
    if (!rows.length) throw notFound();
    const beforeExtra = parseJson(rows[0].extra_data, {});
    const afterExtra = mutateExtra({ ...beforeExtra });
    if (usageReset) {
      const [deleted] = await connection.query('DELETE FROM ai_usage WHERE day_key = ? AND uid = ?', [dayKey(), uid]);
      usageRowsDeleted = Number(deleted.affectedRows || 0);
    }
    await connection.query(
      'UPDATE users SET extra_data = ?, revision = revision + 1, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(afterExtra), uid]
    );
    await connection.query(
      `INSERT INTO security_audit_logs
       (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
       VALUES (?, ?, ?, ?, 'ai.governance', 'MEDIUM', 'USER', ?, ?, ?, NOW())`,
      [crypto.randomUUID(), action, actorUid || 'system', uid, uid,
        JSON.stringify({ before: beforeExtra.aiQuotaOverride || null, after: afterExtra.aiQuotaOverride || null, usageReset, usageRowsDeleted }), requestId || null]
    );
    await connection.commit();
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) { console.error('[AI entitlement rollback failed]', rollbackError.message); }
    }
    throw asStorageError(error);
  } finally {
    connection?.release();
  }
  const entitlement = await getUserAiEntitlement(null, uid);
  return usageReset ? { ...entitlement, usageRowsDeleted } : entitlement;
}

async function setUserAiQuotaOverride({ uid, dailyLimit, maxTokens, expiresAt, reason, actorUid, requestId }) {
  const boundedLimit = Number(dailyLimit);
  const boundedTokens = Number(maxTokens || 4096);
  if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 100000) {
    throw Object.assign(new Error('Daily AI request limit must be an integer between 1 and 100,000'), { code: 'INVALID_LIMIT', status: 400 });
  }
  if (!Number.isInteger(boundedTokens) || boundedTokens < 256 || boundedTokens > 32768) {
    throw Object.assign(new Error('AI token limit must be an integer between 256 and 32,768'), { code: 'INVALID_TOKEN_LIMIT', status: 400 });
  }
  let normalizedExpiry = null;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (!Number.isFinite(parsed.getTime()) || parsed <= new Date()) {
      throw Object.assign(new Error('Override expiry must be a future date'), { code: 'INVALID_EXPIRY', status: 400 });
    }
    normalizedExpiry = parsed.toISOString();
  }
  const override = {
    dailyLimit: boundedLimit, maxTokens: boundedTokens, expiresAt: normalizedExpiry,
    reason: String(reason || '').trim().slice(0, 300) || 'Administrative grant',
    grantedBy: actorUid || 'system', grantedAt: new Date().toISOString(),
  };
  return mutateUserQuota({
    uid, actorUid, requestId, action: 'USER_AI_QUOTA_OVERRIDE_SET',
    mutateExtra: extra => ({ ...extra, aiQuotaOverride: override }),
  });
}

async function removeUserAiQuotaOverride({ uid, actorUid, requestId }) {
  return mutateUserQuota({
    uid, actorUid, requestId, action: 'USER_AI_QUOTA_OVERRIDE_REMOVED',
    mutateExtra: extra => { delete extra.aiQuotaOverride; return extra; },
  });
}

async function resetUserAiQuota({ uid, actorUid, requestId }) {
  const resetAt = new Date().toISOString();
  return mutateUserQuota({
    uid, actorUid, requestId, action: 'USER_AI_QUOTA_RESET', usageReset: true,
    mutateExtra: extra => ({ ...extra, aiQuotaLastResetAt: resetAt }),
  });
}

async function getGlobalAiDashboardData() {
  try {
  const today = dayKey();
  const [[summaryRows], [consumerRows], [quotaRows], [historyRows]] = await Promise.all([
    getPool().query('SELECT COALESCE(SUM(count), 0) AS total, COUNT(*) AS active FROM ai_usage WHERE day_key = ?', [today]),
    getPool().query(
      `SELECT a.uid, a.count, a.limit_used, a.last_used_at,
              COALESCE(NULLIF(u.email, ''), a.email) AS email, u.displayName, u.membership
       FROM ai_usage a LEFT JOIN users u ON u.id = a.uid
       WHERE a.day_key = ? ORDER BY a.count DESC LIMIT 100`,
      [today]
    ),
    getPool().query("SELECT data, revision FROM system_settings WHERE category = 'ai_quota' LIMIT 1"),
    getPool().query('SELECT COUNT(*) AS total FROM ai_usage'),
  ]);
  const storedQuota = parseJson(quotaRows[0]?.data, {});
  const limits = {
    basic: Number(storedQuota.basicDailyLimit || process.env.AI_BASIC_DAILY_LIMIT || 10),
    premium: Number(storedQuota.premiumDailyLimit || process.env.AI_PREMIUM_DAILY_LIMIT || 100),
    admin: Number(storedQuota.adminDailyLimit || process.env.AI_ADMIN_DAILY_LIMIT || 10000),
    enterprise: Number(storedQuota.enterpriseDailyLimit || process.env.AI_ENTERPRISE_DAILY_LIMIT || 5000),
  };
  const todayRecords = consumerRows.map(row => ({
    docId: `${today}:${row.uid}`,
    uid: row.uid,
    email: row.email || '',
    displayName: row.displayName || '',
    membership: row.membership || 'Basic',
    count: Number(row.count || 0),
    limit: Number(row.limit_used || 0),
    day: today,
    lastUsed: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  }));
  return {
    todayDate: today,
    today,
    totalTodayRequests: Number(summaryRows[0]?.total || 0),
    activeUsersToday: Number(summaryRows[0]?.active || 0),
    topConsumers: todayRecords,
    todayRecords,
    totalHistoricalRecords: Number(historyRows[0]?.total || 0),
    limits,
    quotaRevision: Number(quotaRows[0]?.revision || 0),
    globalPresets: DEFAULT_GLOBAL_QUOTAS,
    source: 'MARIADB',
  };

  } catch (error) {
    throw asStorageError(error);
  }
}

function boundedQuota(value, minimum, maximum, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw Object.assign(new Error(`${label} must be an integer between ${minimum} and ${maximum}`), {
      code: 'INVALID_AI_QUOTA_LIMIT', status: 400,
    });
  }
  return parsed;
}

async function setGlobalAiQuotaLimits({ basicDailyLimit, premiumDailyLimit, adminDailyLimit, enterpriseDailyLimit, expectedRevision, actorUid, requestId }) {
  const basic = boundedQuota(basicDailyLimit, 1, 100000, 'Basic daily limit');
  const premium = boundedQuota(premiumDailyLimit, 1, 100000, 'Premium daily limit');
  const admin = boundedQuota(adminDailyLimit, 1, 1000000, 'Admin daily limit');
  const enterprise = enterpriseDailyLimit !== undefined
    ? boundedQuota(enterpriseDailyLimit, 100, 1000000, 'Enterprise daily limit')
    : undefined;
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 0) {
    throw Object.assign(new Error('expectedRevision is required'), { code: 'AI_QUOTA_REVISION_REQUIRED', status: 400 });
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT data, revision FROM system_settings WHERE category = 'ai_quota' FOR UPDATE"
    );
    const currentRevision = Number(rows[0]?.revision || 0);
    if (Number(expectedRevision) !== currentRevision) {
      throw Object.assign(new Error('AI quota limits changed after this panel loaded. Refresh before saving.'), {
        code: 'AI_QUOTA_CONFLICT', status: 409, remoteRevision: currentRevision,
      });
    }
    const before = parseJson(rows[0]?.data, {});
    const nextRevision = currentRevision + 1;
    const data = {
      ...before,
      basicDailyLimit: basic,
      premiumDailyLimit: premium,
      adminDailyLimit: admin,
      ...(enterprise !== undefined ? { enterpriseDailyLimit: enterprise } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actorUid || 'system',
    };
    await connection.query(
      `INSERT INTO system_settings (category, data, revision, updated_at)
       VALUES ('ai_quota', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
      [JSON.stringify(data), nextRevision]
    );
    await connection.query(
      `INSERT INTO security_audit_logs
       (id, action, actor_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
       VALUES (?, 'AI_GLOBAL_QUOTA_LIMITS_UPDATED', ?, 'ai.governance', 'HIGH', 'PLATFORM_CONFIG',
               'ai_quota', ?, ?, NOW())`,
      [crypto.randomUUID(), actorUid || 'system', JSON.stringify({
        before: {
          basicDailyLimit: before.basicDailyLimit || null,
          premiumDailyLimit: before.premiumDailyLimit || null,
          adminDailyLimit: before.adminDailyLimit || null,
        },
        after: { basicDailyLimit: basic, premiumDailyLimit: premium, adminDailyLimit: admin },
        revision: nextRevision,
      }), requestId || null]
    );
    await connection.commit();
    return { limits: { basic, premium, admin }, revision: nextRevision };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw asStorageError(error);
  } finally {
    connection.release();
  }
}

async function resetAllAiQuota({ actorUid, requestId }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query('DELETE FROM ai_usage');
    await connection.query(
      `INSERT INTO security_audit_logs
       (id, action, actor_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
       VALUES (?, 'AI_ALL_DAILY_QUOTAS_RESET', ?, 'ai.governance', 'HIGH', 'AI_USAGE',
               'all', ?, ?, NOW())`,
      [crypto.randomUUID(), actorUid || 'system', JSON.stringify({ deletedCount: Number(result.affectedRows || 0) }), requestId || null]
    );
    await connection.commit();
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw asStorageError(error);
  } finally {
    connection.release();
  }
}

module.exports = {
  DEFAULT_GLOBAL_QUOTAS,
  getUserAiEntitlement,
  setUserAiQuotaOverride,
  removeUserAiQuotaOverride,
  resetUserAiQuota,
  getGlobalAiDashboardData,
  setGlobalAiQuotaLimits,
  resetAllAiQuota,
};
