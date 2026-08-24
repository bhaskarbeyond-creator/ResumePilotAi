'use strict';

const crypto = require('crypto');

const DEFAULT_GLOBAL_QUOTAS = Object.freeze({
  Basic: { dailyRequests: 10, maxTokens: 2048, label: 'Free / Basic Tier' },
  Premium: { dailyRequests: 100, maxTokens: 4096, label: 'Pro / Premium Tier' },
  Enterprise: { dailyRequests: 1000, maxTokens: 8192, label: 'Enterprise Tier' },
  Admin: { dailyRequests: 10000, maxTokens: 16384, label: 'Administrative Access' },
});

function dayKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getUserAiEntitlement(db, uid) {
  if (!db || !uid) {
    return { uid, dailyLimit: 10, usedToday: 0, remainingToday: 10, plan: 'Basic', customOverride: null };
  }
  try {
    const [userDoc, usageDoc] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('ai_usage').doc(`${dayKey()}_${crypto.createHash('sha256').update(uid).digest('hex')}`).get().catch(() => null),
    ]);
    const userData = userDoc.exists ? (userDoc.data() || {}) : {};
    const plan = userData.membership || 'Basic';
    const baseQuota = DEFAULT_GLOBAL_QUOTAS[plan]?.dailyRequests || 10;
    
    // Check if custom override is active and unexpired
    const override = userData.aiQuotaOverride || null;
    const isOverrideActive = override && (!override.expiresAt || new Date(override.expiresAt).getTime() > Date.now());
    const effectiveLimit = isOverrideActive ? Number(override.dailyLimit || baseQuota) : baseQuota;
    
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
      customOverride: isOverrideActive ? override : null,
      lastResetAt: userData.aiQuotaLastResetAt || null,
    };
  } catch (error) {
    return { uid, dailyLimit: 10, usedToday: 0, remainingToday: 10, plan: 'Basic', customOverride: null, error: error.message };
  }
}

async function setUserAiQuotaOverride({ db, admin, uid, dailyLimit, maxTokens, expiresAt, reason, actorUid, requestId }) {
  if (!db || !admin?.firestore?.FieldValue) {
    throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
  }
  const boundedLimit = Number(dailyLimit);
  if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 100000) {
    throw Object.assign(new Error('Daily AI request limit must be an integer between 1 and 100,000'), { code: 'INVALID_LIMIT', status: 400 });
  }
  
  const userRef = db.collection('users').doc(uid);
  let beforeState = null;
  
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(userRef);
    if (!snap.exists) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
    }
    const current = snap.data() || {};
    beforeState = current.aiQuotaOverride || null;
    
    const overrideData = {
      dailyLimit: boundedLimit,
      maxTokens: Number(maxTokens) || 4096,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      reason: String(reason || '').trim().slice(0, 300) || 'Administrative grant',
      grantedBy: actorUid || 'system',
      grantedAt: new Date().toISOString(),
    };
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(userRef, {
      aiQuotaOverride: overrideData,
      updatedAt: now,
    }, { merge: true });
    
    transaction.set(db.collection('security_audit_logs').doc(), {
      action: 'USER_AI_QUOTA_OVERRIDE_SET',
      actorUid: actorUid || 'system',
      targetUid: uid,
      category: 'ai.governance',
      severity: 'MEDIUM',
      targetType: 'USER',
      targetId: uid,
      changes: {
        before: beforeState,
        after: overrideData,
      },
      requestId: requestId || null,
      createdAt: now,
    });
  });
  
  return getUserAiEntitlement(db, uid);
}

async function removeUserAiQuotaOverride({ db, admin, uid, actorUid, requestId }) {
  if (!db || !admin?.firestore?.FieldValue) {
    throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
  }
  const userRef = db.collection('users').doc(uid);
  let beforeState = null;
  
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(userRef);
    if (!snap.exists) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
    }
    const current = snap.data() || {};
    beforeState = current.aiQuotaOverride || null;
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(userRef, {
      aiQuotaOverride: admin.firestore.FieldValue.delete(),
      updatedAt: now,
    }, { merge: true });
    
    transaction.set(db.collection('security_audit_logs').doc(), {
      action: 'USER_AI_QUOTA_OVERRIDE_REMOVED',
      actorUid: actorUid || 'system',
      targetUid: uid,
      category: 'ai.governance',
      severity: 'MEDIUM',
      targetType: 'USER',
      targetId: uid,
      changes: {
        before: beforeState,
        after: null,
      },
      requestId: requestId || null,
      createdAt: now,
    });
  });
  
  return getUserAiEntitlement(db, uid);
}

async function resetUserAiQuota({ db, admin, uid, actorUid, requestId }) {
  if (!db || !admin?.firestore?.FieldValue) {
    throw Object.assign(new Error('Database unavailable'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
  }
  const today = dayKey();
  const hash = crypto.createHash('sha256').update(uid).digest('hex');
  const usageRef = db.collection('ai_usage').doc(`${today}_${hash}`);
  const userRef = db.collection('users').doc(uid);
  
  let beforeCount = 0;
  await db.runTransaction(async transaction => {
    const usageSnap = await transaction.get(usageRef);
    if (usageSnap.exists) {
      beforeCount = Number(usageSnap.data()?.count || 0);
      transaction.delete(usageRef);
    }
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(userRef, {
      aiQuotaLastResetAt: now,
      updatedAt: now,
    }, { merge: true });
    
    transaction.set(db.collection('security_audit_logs').doc(), {
      action: 'USER_AI_QUOTA_RESET',
      actorUid: actorUid || 'system',
      targetUid: uid,
      category: 'ai.governance',
      severity: 'LOW',
      targetType: 'USER',
      targetId: uid,
      changes: {
        before: { count: beforeCount, day: today },
        after: { count: 0, day: today },
      },
      requestId: requestId || null,
      createdAt: now,
    });
  });
  
  return getUserAiEntitlement(db, uid);
}

async function getGlobalAiDashboardData(db) {
  // `globalPresets` are static platform defaults and must be present even when
  // the usage store is momentarily unavailable.
  if (!db) return { todayUsage: [], totalTodayRequests: 0, activeUsersToday: 0, globalPresets: DEFAULT_GLOBAL_QUOTAS };
  const today = dayKey();
  try {
    const snapshot = await db.collection('ai_usage').limit(500).get();
    const rows = [];
    snapshot.forEach(doc => {
      if (doc.id.startsWith(today)) {
        const data = doc.data() || {};
        rows.push({
          id: doc.id,
          count: Number(data.count || 0),
          updatedAt: data.updatedAt || null,
        });
      }
    });
    
    rows.sort((a, b) => b.count - a.count);
    const totalTodayRequests = rows.reduce((sum, r) => sum + r.count, 0);
    
    return {
      todayDate: today,
      totalTodayRequests,
      activeUsersToday: rows.length,
      topConsumers: rows.slice(0, 25),
      globalPresets: DEFAULT_GLOBAL_QUOTAS,
    };
  } catch (error) {
    return { todayDate: today, totalTodayRequests: 0, activeUsersToday: 0, globalPresets: DEFAULT_GLOBAL_QUOTAS, error: error.message };
  }
}

module.exports = {
  DEFAULT_GLOBAL_QUOTAS,
  getUserAiEntitlement,
  setUserAiQuotaOverride,
  removeUserAiQuotaOverride,
  resetUserAiQuota,
  getGlobalAiDashboardData,
};
