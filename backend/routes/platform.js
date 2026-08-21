'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { requirePermission, requireSuperAdmin } = require('../security/auth');
const { recordAdminAuditLog } = require('../security/adminAudit');

const router = express.Router();

// Read commit SHA safely
let cachedCommitSha = null;
function getCommitSha() {
  if (cachedCommitSha) return cachedCommitSha;
  try {
    const shaPath = path.join(__dirname, '..', 'COMMIT_SHA');
    if (fs.existsSync(shaPath)) {
      cachedCommitSha = fs.readFileSync(shaPath, 'utf8').trim();
      return cachedCommitSha;
    }
  } catch (_) { /* ignore */ }
  return process.env.COMMIT_SHA || 'production-live';
}

// All platform routes require system.config.read
router.use(requirePermission('system.config.read'));

/**
 * Detailed Platform Diagnostic & Health Scoring API
 */
router.get('/health', async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  const tenantService = req.app?.get('tenantService');

  const startTime = Date.now();
  let dbHealthy = false;
  let dbLatencyMs = null;

  if (db) {
    try {
      const pingStart = Date.now();
      await db.collection('settings').doc('system_ping_check').set(
        { lastPing: admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date() },
        { merge: true }
      );
      dbLatencyMs = Date.now() - pingStart;
      dbHealthy = true;
    } catch (err) {
      console.warn('[PlatformHealth] DB ping warning:', err.message);
    }
  }

  // Check Outbox / Queue stats
  let queueStats = { active: 0, deadLetter: 0, completed: 0, status: 'HEALTHY' };
  if (db) {
    try {
      const outboxSnap = await db.collection('notification_outbox').limit(100).get();
      outboxSnap.forEach(doc => {
        const data = doc.data() || {};
        if (data.state === 'DEAD_LETTER' || data.attemptCount >= 5) queueStats.deadLetter += 1;
        else if (data.providerAccepted === true) queueStats.completed += 1;
        else queueStats.active += 1;
      });
      if (queueStats.deadLetter > 0) queueStats.status = 'DEGRADED';
    } catch (_) { /* non-fatal */ }
  }

  // System & Memory stats
  const memoryUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  // Compute overall health score (0 - 100)
  let healthScore = 100;
  if (!dbHealthy) healthScore -= 40;
  else if (dbLatencyMs > 500) healthScore -= 10;
  if (queueStats.deadLetter > 5) healthScore -= 20;
  else if (queueStats.deadLetter > 0) healthScore -= 10;
  if ((memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.9) healthScore -= 15;

  healthScore = Math.max(0, Math.min(100, healthScore));

  const responseData = {
    status: healthScore >= 80 ? 'HEALTHY' : healthScore >= 50 ? 'DEGRADED' : 'UNHEALTHY',
    healthScore,
    commitSha: getCommitSha(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startTime,
    subsystems: {
      database: {
        status: dbHealthy ? 'HEALTHY' : 'DOWN',
        latencyMs: dbLatencyMs,
        provider: 'Google Cloud Firestore',
      },
      queue: {
        status: queueStats.status,
        activeJobs: queueStats.active,
        deadLetterJobs: queueStats.deadLetter,
        completedJobs: queueStats.completed,
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        systemFreeMemMb: Math.round(freeMem / 1024 / 1024),
        systemTotalMemMb: Math.round(totalMem / 1024 / 1024),
      },
      tenancy: tenantService ? tenantService.describeRuntime?.() : { enabled: false },
    },
  };

  return res.json(responseData);
});

/**
 * High-level Platform KPI Overview
 */
router.get('/overview', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', requestId: res.locals?.requestId } });
  }

  try {
    const [statsDoc, earningsDoc, tenantsSnap, recentUsersSnap] = await Promise.allSettled([
      db.collection('stats').doc('global').get(),
      db.collection('earnings').doc('global').get(),
      db.collection('enterprise_tenants').limit(500).get(),
      db.collection('users').orderBy('userId').limit(10).get(),
    ]);

    const statsData = statsDoc.status === 'fulfilled' && statsDoc.value.exists ? statsDoc.value.data() : {};
    const earningsData = earningsDoc.status === 'fulfilled' && earningsDoc.value.exists ? earningsDoc.value.data() : {};

    let totalTenants = 0;
    let activeTenants = 0;
    let suspendedTenants = 0;

    if (tenantsSnap.status === 'fulfilled' && tenantsSnap.value) {
      tenantsSnap.value.forEach(doc => {
        totalTenants += 1;
        const data = doc.data() || {};
        if (data.lifecycleState === 'ACTIVE') activeTenants += 1;
        else if (data.lifecycleState === 'SUSPENDED') suspendedTenants += 1;
      });
    }

    return res.json({
      kpis: {
        totalUsers: statsData.users ?? statsData.totalUsers ?? 0,
        resumesCreated: statsData.resumes ?? 0,
        totalDownloads: statsData.downloads ?? 0,
        totalEarningsCents: earningsData.total ?? earningsData.amount ?? 0,
        currency: earningsData.currency || 'USD',
        tenants: {
          total: totalTenants,
          active: activeTenants,
          suspended: suspendedTenants,
        },
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[PlatformOverview] Error fetching stats:', err);
    return res.status(500).json({ error: { code: 'OVERVIEW_ERROR', message: err.message, requestId: res.locals?.requestId } });
  }
});

/**
 * Queue and Outbox Diagnostics
 */
router.get('/queues', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }

  try {
    const snap = await db.collection('notification_outbox').orderBy('createdAt', 'desc').limit(50).get();
    const items = [];
    let deadLetterCount = 0;
    let pendingCount = 0;
    let successCount = 0;

    snap.forEach(doc => {
      const data = doc.data() || {};
      const isDeadLetter = data.state === 'DEAD_LETTER' || Number(data.attemptCount || 0) >= 5;
      if (isDeadLetter) deadLetterCount += 1;
      else if (data.providerAccepted) successCount += 1;
      else pendingCount += 1;

      items.push({
        id: doc.id,
        channel: data.channel || 'email',
        recipient: data.recipient ? `${String(data.recipient).slice(0, 3)}***@${String(data.recipient).split('@')[1] || 'domain.com'}` : 'unknown',
        templateType: data.templateType || 'general',
        state: isDeadLetter ? 'DEAD_LETTER' : data.state || 'QUEUED',
        attemptCount: data.attemptCount || 0,
        lastError: data.lastError ? String(data.lastError).slice(0, 200) : null,
        createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : null,
      });
    });

    return res.json({
      summary: {
        totalInspected: items.length,
        deadLetterCount,
        pendingCount,
        successCount,
      },
      jobs: items,
    });
  } catch (err) {
    return res.status(500).json({ error: { code: 'QUEUE_QUERY_FAILED', message: err.message } });
  }
});

/**
 * Retry failed / dead-letter queue items (Requires Super Admin)
 */
router.post('/queues/retry', requireSuperAdmin, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }

  const { jobId, all = false } = req.body || {};

  try {
    let retriedCount = 0;
    if (jobId) {
      const docRef = db.collection('notification_outbox').doc(String(jobId));
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.update({
          state: 'NOTIFICATION_QUEUED',
          attemptCount: 0,
          nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now()),
          lastError: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        retriedCount = 1;
      }
    } else if (all) {
      const deadLetters = await db.collection('notification_outbox').where('attemptCount', '>=', 5).limit(20).get();
      const batch = db.batch();
      deadLetters.forEach(doc => {
        batch.update(doc.ref, {
          state: 'NOTIFICATION_QUEUED',
          attemptCount: 0,
          nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now()),
          lastError: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        retriedCount += 1;
      });
      if (retriedCount > 0) {
        await batch.commit();
      }
    }

    return res.json({ success: true, retriedCount });
  } catch (err) {
    return res.status(500).json({ error: { code: 'RETRY_FAILED', message: err.message } });
  }
});

/**
 * Maintenance mode status & control
 */
router.get('/maintenance', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.json({ enabled: false, message: '' });
  try {
    const doc = await db.collection('settings').doc('maintenance').get();
    const data = doc.exists ? doc.data() : {};
    return res.json({
      enabled: data.enabled === true,
      message: data.message || 'Platform is undergoing scheduled maintenance.',
      scheduledEnd: data.scheduledEnd || null,
      updatedBy: data.updatedBy || null,
      updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : null,
    });
  } catch (_) {
    return res.json({ enabled: false, message: '' });
  }
});

router.post('/maintenance', requireSuperAdmin, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }

  const { enabled, message, scheduledEnd } = req.body || {};

  try {
    await db.collection('settings').doc('maintenance').set({
      enabled: Boolean(enabled),
      message: String(message || 'Platform is undergoing scheduled maintenance.').slice(0, 300),
      scheduledEnd: scheduledEnd ? String(scheduledEnd).slice(0, 100) : null,
      updatedBy: req.user?.email || req.user?.uid || 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.json({ success: true, enabled: Boolean(enabled) });
  } catch (err) {
    return res.status(500).json({ error: { code: 'MAINTENANCE_UPDATE_FAILED', message: err.message } });
  }
});

module.exports = { platformRouter: router };
