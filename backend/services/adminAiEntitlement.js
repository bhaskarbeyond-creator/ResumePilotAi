'use strict';

const crypto = require('crypto');
const { resolveEffectiveEntitlement } = require('../security/entitlements');
const { getRepository } = require('../repositories');

const DEFAULT_GLOBAL_QUOTAS = Object.freeze({
  Basic: { dailyRequests: 10, maxTokens: 2048, label: 'Free / Basic Tier' },
  Premium: { dailyRequests: 100, maxTokens: 4096, label: 'Pro / Premium Tier' },
  Enterprise: { dailyRequests: 5000, maxTokens: 8192, label: 'Enterprise Tier' },
  Admin: { dailyRequests: 10000, maxTokens: 16384, label: 'Administrative Access' },
});

function dayKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getUserAiEntitlement(db, uid) {
  if (!uid) {
    return { uid, dailyLimit: 10, usedToday: 0, remainingToday: 10, plan: 'Basic', customOverride: null };
  }

  try {
    let userData = {};

    // 1. Authoritative Primary Source: MariaDB
    try {
      const repo = getRepository(db);
      if (repo && typeof repo.getUser === 'function') {
        userData = (await repo.getUser(uid)) || {};
      }
    } catch (_) {}

    // 2. Fallback to Firestore if empty and db is available
    let usageDoc = null;
    let quotaDoc = null;

    if (db && typeof db.collection === 'function') {
      try {
        if (!userData?.id && !userData?.userId) {
          const userDoc = await db.collection('users').doc(uid).get().catch(() => null);
          if (userDoc?.exists) userData = userDoc.data() || {};
        }

        const today = dayKey();
        const hash = crypto.createHash('sha256').update(uid).digest('hex');
        [usageDoc, quotaDoc] = await Promise.all([
          db.collection('ai_usage').doc(`${today}_${hash}`).get().catch(() => null),
          db.collection('settings').doc('ai_quota').get().catch(() => null),
        ]);
      } catch (_) {
        // Non-blocking: Firestore standby quota limits must not fail entitlement lookup
      }
    }

    const quotaConfig = quotaDoc?.exists ? (quotaDoc.data() || {}) : {};
    const entitlement = resolveEffectiveEntitlement(userData, { quotaConfig });
    const plan = entitlement.effectiveTier || 'Basic';
    const baseQuota = DEFAULT_GLOBAL_QUOTAS[plan]?.dailyRequests || entitlement.dailyLimit || 10;
    const effectiveLimit = entitlement.dailyLimit || baseQuota;
    
    const usedToday = usageDoc?.exists ? Number(usageDoc.data()?.count || 0) : 0;
    const remainingToday = Math.max(0, effectiveLimit - usedToday);
    
    return {
      uid,
      plan,
      baseQuota,
      effectiveLimit,
      usedToday,
      remainingToday,
      isExhausted: remainingToday <= 0,
      customOverride: userData.aiQuotaOverride || null,
      lastResetAt: userData.aiQuotaLastResetAt || null,
    };
  } catch (error) {
    return { uid, dailyLimit: 10, usedToday: 0, remainingToday: 10, plan: 'Basic', customOverride: null };
  }
}

async function setUserAiQuotaOverride({ db, admin, uid, dailyLimit, maxTokens, expiresAt, reason, actorUid, requestId }) {
  const boundedLimit = Number(dailyLimit);
  if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 100000) {
    throw Object.assign(new Error('Daily AI request limit must be an integer between 1 and 100,000'), { code: 'INVALID_LIMIT', status: 400 });
  }

  const overrideData = {
    dailyLimit: boundedLimit,
    maxTokens: Number(maxTokens) || 4096,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    reason: String(reason || '').trim().slice(0, 300) || 'Administrative grant',
    grantedBy: actorUid || 'system',
    grantedAt: new Date().toISOString(),
  };

  // 1. Authoritative Primary Write: MariaDB
  const repo = getRepository(db);
  const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};
  const beforeState = currentProfile.aiQuotaOverride || null;

  await repo.saveUser(uid, {
    ...currentProfile,
    aiQuotaOverride: overrideData,
    updatedAt: new Date().toISOString(),
  });

  if (repo.recordSecurityAuditLog) {
    await repo.recordSecurityAuditLog({
      action: 'USER_AI_QUOTA_OVERRIDE_SET',
      actorUid: actorUid || 'system',
      targetUid: uid,
      category: 'ai.governance',
      severity: 'MEDIUM',
      targetType: 'USER',
      targetId: uid,
      changes: { before: beforeState, after: overrideData },
      requestId: requestId || null,
    }).catch(() => {});
  }

  // 2. Standby Replication: Firestore
  if (db && typeof db.collection === 'function') {
    try {
      await db.collection('users').doc(uid).set({
        aiQuotaOverride: overrideData,
        updatedAt: admin?.firestore?.FieldValue ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
      }, { merge: true });
    } catch (_) {}
  }

  return getUserAiEntitlement(db, uid);
}

async function removeUserAiQuotaOverride({ db, admin, uid, actorUid, requestId }) {
  // 1. Authoritative Primary Write: MariaDB
  const repo = getRepository(db);
  const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};
  const beforeState = currentProfile.aiQuotaOverride || null;

  await repo.saveUser(uid, {
    ...currentProfile,
    aiQuotaOverride: null,
    updatedAt: new Date().toISOString(),
  });

  if (repo.recordSecurityAuditLog) {
    await repo.recordSecurityAuditLog({
      action: 'USER_AI_QUOTA_OVERRIDE_REMOVED',
      actorUid: actorUid || 'system',
      targetUid: uid,
      category: 'ai.governance',
      severity: 'MEDIUM',
      targetType: 'USER',
      targetId: uid,
      changes: { before: beforeState, after: null },
      requestId: requestId || null,
    }).catch(() => {});
  }

  // 2. Standby Replication: Firestore
  if (db && typeof db.collection === 'function') {
    try {
      if (admin?.firestore?.FieldValue) {
        await db.collection('users').doc(uid).set({
          aiQuotaOverride: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } catch (_) {}
  }

  return getUserAiEntitlement(db, uid);
}

async function resetUserAiQuota({ db, admin, uid, actorUid, requestId }) {
  const today = dayKey();
  const repo = getRepository(db);

  // 1. Primary Write: MariaDB
  const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};
  await repo.saveUser(uid, {
    ...currentProfile,
    aiQuotaLastResetAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (repo.recordSecurityAuditLog) {
    await repo.recordSecurityAuditLog({
      action: 'USER_AI_QUOTA_RESET',
      actorUid: actorUid || 'system',
      targetUid: uid,
      category: 'ai.governance',
      severity: 'LOW',
      targetType: 'USER',
      targetId: uid,
      changes: { after: { count: 0, day: today } },
      requestId: requestId || null,
    }).catch(() => {});
  }

  // 2. Standby cleanup: Firestore
  if (db && typeof db.collection === 'function') {
    try {
      const hash = crypto.createHash('sha256').update(uid).digest('hex');
      await db.collection('ai_usage').doc(`${today}_${hash}`).delete().catch(() => {});
    } catch (_) {}
  }

  return getUserAiEntitlement(db, uid);
}

async function getGlobalAiDashboardData(db) {
  const today = dayKey();
  return {
    todayDate: today,
    totalTodayRequests: 0,
    activeUsersToday: 0,
    topConsumers: [],
    globalPresets: DEFAULT_GLOBAL_QUOTAS,
  };
}

module.exports = {
  DEFAULT_GLOBAL_QUOTAS,
  getUserAiEntitlement,
  setUserAiQuotaOverride,
  removeUserAiQuotaOverride,
  resetUserAiQuota,
  getGlobalAiDashboardData,
};
