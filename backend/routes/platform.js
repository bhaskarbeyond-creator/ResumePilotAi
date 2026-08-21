'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { requirePermission, requireSuperAdmin } = require('../security/auth');
const { recordAdminAuditLog } = require('../security/adminAudit');

const router = express.Router();

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

function isoFrom(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isFinite(date?.getTime?.()) ? date.toISOString() : null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function safeQuery(label, fn) {
  try {
    return { ok: true, value: await fn(), source: label };
  } catch (error) {
    return { ok: false, error: String(error.message || error).slice(0, 200), source: label };
  }
}

async function inspectOutbox(db) {
  const stats = { active: 0, deadLetter: 0, completed: 0, status: 'HEALTHY', inspected: 0 };
  if (!db) return stats;
  const snap = await db.collection('notification_outbox').limit(100).get();
  snap.forEach(doc => {
    const data = doc.data() || {};
    stats.inspected += 1;
    if (data.state === 'DEAD_LETTER' || Number(data.attemptCount || 0) >= 5) stats.deadLetter += 1;
    else if (data.providerAccepted === true) stats.completed += 1;
    else stats.active += 1;
  });
  if (stats.deadLetter > 0) stats.status = 'DEGRADED';
  return stats;
}

async function buildHealthPayload(req) {
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

  const queueStats = await inspectOutbox(db).catch(() => ({ active: 0, deadLetter: 0, completed: 0, status: 'UNKNOWN', inspected: 0 }));
  const memoryUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  let healthScore = 100;
  if (!dbHealthy) healthScore -= 40;
  else if (dbLatencyMs > 500) healthScore -= 10;
  if (queueStats.deadLetter > 5) healthScore -= 20;
  else if (queueStats.deadLetter > 0) healthScore -= 10;
  if ((memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.9) healthScore -= 15;
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
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
        inspected: queueStats.inspected,
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
}

router.use(requirePermission('system.config.read'));

router.get('/health', async (req, res) => {
  return res.json(await buildHealthPayload(req));
});

router.get('/overview', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', requestId: res.locals?.requestId } });
  }

  try {
    const [statsDoc, earningsDoc, tenantsSnap] = await Promise.allSettled([
      db.collection('stats').doc('global').get(),
      db.collection('earnings').doc('global').get(),
      db.collection('enterprise_tenants').limit(500).get(),
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
        totalUsers: statsData.users ?? statsData.totalUsers ?? statsData.numberOfUsers ?? 0,
        resumesCreated: statsData.resumes ?? statsData.numberOfResumesCreated ?? 0,
        totalDownloads: statsData.downloads ?? statsData.numberOfResumesDownloaded ?? 0,
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
        createdAt: isoFrom(data.createdAt),
        updatedAt: isoFrom(data.updatedAt),
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

router.get('/maintenance', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.json({ enabled: false, message: '' });
  try {
    const [legacy, publicConfig] = await Promise.all([
      db.collection('settings').doc('maintenance').get(),
      db.collection('data').doc('public_config').get(),
    ]);
    const data = legacy.exists ? legacy.data() : {};
    const publicHealth = publicConfig.exists ? (publicConfig.data()?.systemHealth || {}) : {};
    return res.json({
      enabled: data.enabled === true || publicHealth.maintenanceMode === true,
      message: data.message || publicHealth.maintenanceMessage || 'Platform is undergoing scheduled maintenance.',
      scheduledEnd: data.scheduledEnd || null,
      updatedBy: data.updatedBy || null,
      updatedAt: isoFrom(data.updatedAt),
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
    const payload = {
      enabled: Boolean(enabled),
      message: String(message || 'Platform is undergoing scheduled maintenance.').slice(0, 300),
      scheduledEnd: scheduledEnd ? String(scheduledEnd).slice(0, 100) : null,
      updatedBy: req.user?.email || req.user?.uid || 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('settings').doc('maintenance').set(payload, { merge: true });
    await db.collection('data').doc('public_config').set({
      systemHealth: {
        maintenanceMode: Boolean(enabled),
        maintenanceMessage: payload.message,
      },
    }, { merge: true });

    return res.json({ success: true, enabled: Boolean(enabled) });
  } catch (err) {
    return res.status(500).json({ error: { code: 'MAINTENANCE_UPDATE_FAILED', message: err.message } });
  }
});

router.get('/command-center', async (req, res) => {
  const db = req.app?.get('db');
  const tenantService = req.app?.get('tenantService');
  const health = await buildHealthPayload(req);
  const sources = { health: 'ok' };
  const recommendations = [];

  const statsResult = db ? await safeQuery('stats', () => db.collection('data').doc('stats').get()) : { ok: false };
  const earningsResult = db ? await safeQuery('earnings', () => db.collection('data').doc('earnings').get()) : { ok: false };
  const tenantsResult = db ? await safeQuery('tenants', () => db.collection('enterprise_tenants').limit(200).get()) : { ok: false };
  const paymentsResult = db ? await safeQuery('payments', () => db.collection('payment_orders').limit(100).get()) : { ok: false };
  const securityResult = db ? await safeQuery('security', () => db.collection('security_audit_logs').orderBy('createdAt', 'desc').limit(20).get()) : { ok: false };
  const auditResult = db ? await safeQuery('audit', () => db.collection('admin_audit_logs').orderBy('createdAt', 'desc').limit(8).get()) : { ok: false };
  const announcementsResult = db ? await safeQuery('announcements', () => db.collection('platform_announcements').limit(20).get()) : { ok: false };
  const maintenanceResult = db ? await safeQuery('maintenance', () => db.collection('settings').doc('maintenance').get()) : { ok: false };

  // True platform counts for accurate metrics
  const [paymentsFailCnt, securityHighCnt, suspendedTenantsCnt, activeTenantsCnt, activePaymentsCnt, pendingPaymentsCnt] = db ? await Promise.all([
    safeQuery('payments-failed-count', () => db.collection('payment_orders').where('status', 'in', ['FAILED', 'CANCELLED', 'DECLINED']).count().get()),
    safeQuery('security-high-count', () => db.collection('security_audit_logs').where('severity', 'in', ['HIGH', 'CRITICAL']).count().get()),
    safeQuery('tenants-suspended-count', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'SUSPENDED').count().get()),
    safeQuery('tenants-active-count', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'ACTIVE').count().get()),
    safeQuery('payments-active-count', () => db.collection('payment_orders').where('status', '==', 'ACTIVE').count().get()),
    safeQuery('payments-pending-count', () => db.collection('payment_orders').where('status', 'in', ['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING']).count().get()),
  ]) : [{}, {}, {}, {}, {}, {}];

  sources.stats = statsResult.ok ? 'ok' : 'unavailable';
  sources.earnings = earningsResult.ok ? 'ok' : 'unavailable';
  sources.tenants = tenantsResult.ok ? 'ok' : 'unavailable';
  sources.payments = paymentsResult.ok ? 'ok' : 'unavailable';
  sources.security = securityResult.ok ? 'ok' : 'unavailable';
  sources.audit = auditResult.ok ? 'ok' : 'unavailable';

  const statsData = statsResult.ok && statsResult.value.exists ? statsResult.value.data() : {};
  const earningsData = earningsResult.ok && earningsResult.value.exists ? earningsResult.value.data() : {};

  const tenants = [];
  if (tenantsResult.ok) {
    tenantsResult.value.forEach(doc => {
      const data = doc.data() || {};
      tenants.push({
        id: doc.id,
        displayName: data.displayName || 'Untitled tenant',
        slug: data.slug || '',
        lifecycleState: data.lifecycleState || 'UNKNOWN',
        isolationTier: data.isolationTier || 'STANDARD',
      });
    });
  }

  let paymentFailed = paymentsFailCnt.ok && paymentsFailCnt.value ? (paymentsFailCnt.value.data().count || 0) : 0;
  let paymentPending = pendingPaymentsCnt.ok && pendingPaymentsCnt.value ? (pendingPaymentsCnt.value.data().count || 0) : 0;
  let paymentActive = activePaymentsCnt.ok && activePaymentsCnt.value ? (activePaymentsCnt.value.data().count || 0) : 0;
  let paymentInspected = -1; // -1 indicates full count used instead of sample inspection

  if (paymentsResult.ok) {
    paymentsResult.value.forEach(doc => {
      // Just for sampling inspection if needed, counts are accurate now
    });
  }

  const recentSecurity = [];
  let highSecurity = securityHighCnt.ok && securityHighCnt.value ? (securityHighCnt.value.data().count || 0) : 0;
  if (securityResult.ok) {
    securityResult.value.forEach(doc => {
      const data = doc.data() || {};
      const severity = String(data.severity || (String(data.action || '').includes('DENIED') ? 'HIGH' : 'INFO')).toUpperCase();
      recentSecurity.push({
        id: doc.id,
        action: data.action || 'UNKNOWN',
        actorUid: data.actorUid || null,
        severity,
        createdAt: isoFrom(data.createdAt),
      });
    });
  }

  const recentAudit = [];
  if (auditResult.ok) {
    auditResult.value.forEach(doc => {
      const data = doc.data() || {};
      recentAudit.push({
        id: doc.id,
        action: data.action,
        actorEmail: data.actorEmail || data.actorUid,
        severity: data.severity || 'INFO',
        pathname: data.pathname,
        createdAt: isoFrom(data.createdAt) || data.occurredAt || null,
      });
    });
  }

  const announcements = [];
  if (announcementsResult.ok) {
    announcementsResult.value.forEach(doc => {
      const data = doc.data() || {};
      announcements.push({
        id: doc.id,
        title: data.title || '',
        message: data.message || '',
        severity: data.severity || 'INFO',
        enabled: data.enabled === true,
        updatedAt: isoFrom(data.updatedAt),
      });
    });
  }

  const maintenance = maintenanceResult.ok && maintenanceResult.value.exists
    ? { enabled: maintenanceResult.value.data()?.enabled === true, message: maintenanceResult.value.data()?.message || '' }
    : { enabled: false, message: '' };

  const runtime = tenantService?.describeRuntime?.() || { encryption: { provider: 'none' } };
  const encryption = runtime.encryption || { provider: 'none', configured: false };

  let riskScore = 0;
  if (health.subsystems.database.status !== 'HEALTHY') riskScore += 40;
  if (health.subsystems.queue.deadLetterJobs > 0) riskScore += Math.min(25, health.subsystems.queue.deadLetterJobs * 5);
  if (paymentFailed > 0) riskScore += Math.min(20, paymentFailed * 4);
  if (highSecurity > 0) riskScore += Math.min(20, highSecurity * 5);
  if (tenants.filter(t => t.lifecycleState === 'SUSPENDED').length > 0) riskScore += 10;
  if (maintenance.enabled) riskScore += 15;
  if (encryption.provider === 'none' || encryption.configured === false) riskScore += 5;
  riskScore = Math.max(0, Math.min(100, riskScore));

  if (health.subsystems.database.status !== 'HEALTHY') {
    recommendations.push({ id: 'db-down', severity: 'HIGH', title: 'Firestore ping failed', detail: 'Platform data plane did not acknowledge the health write.', href: '/adm/operations' });
  }
  if (health.subsystems.queue.deadLetterJobs > 0) {
    recommendations.push({ id: 'dlq', severity: 'HIGH', title: `${health.subsystems.queue.deadLetterJobs} dead-letter notification(s)`, detail: 'Replay or inspect failed email/outbox jobs.', href: '/adm/queues' });
  }
  if (paymentFailed > 0) {
    recommendations.push({ id: 'payments', severity: 'MEDIUM', title: `${paymentFailed} failed payment order(s) in latest sample`, detail: 'Review the payment ledger. Counts are from the most recent inspected orders only.', href: '/adm/settings?tab=ordersManagement' });
  }
  if (highSecurity > 0) {
    recommendations.push({ id: 'security', severity: 'HIGH', title: `${highSecurity} high-severity security event(s)`, detail: 'Inspect the security event stream for denied or destructive operations.', href: '/adm/security' });
  }
  const suspended = tenants.filter(t => t.lifecycleState === 'SUSPENDED');
  if (suspended.length > 0) {
    recommendations.push({ id: 'suspended-tenants', severity: 'MEDIUM', title: `${suspended.length} suspended tenant(s)`, detail: 'Confirm whether suspension is still required.', href: '/adm/tenants' });
  }
  if (maintenance.enabled) {
    recommendations.push({ id: 'maintenance', severity: 'HIGH', title: 'Maintenance mode is enabled', detail: maintenance.message || 'Public product routes are blocked for non-admins.', href: '/adm/operations' });
  }
  if (!recommendations.length) {
    recommendations.push({ id: 'healthy', severity: 'INFO', title: 'No urgent platform actions from inspected sources', detail: 'Continue monitoring health, audit, and tenant lifecycle.', href: '/adm/audit-logs' });
  }

  return res.json({
    healthScore: health.healthScore,
    status: health.status,
    riskScore,
    commitSha: health.commitSha,
    uptimeSeconds: health.uptimeSeconds,
    subsystems: health.subsystems,
    kpis: {
      totalUsers: statsData.numberOfUsers ?? statsData.users ?? statsData.totalUsers ?? null,
      resumesCreated: statsData.numberOfResumesCreated ?? statsData.resumes ?? null,
      totalDownloads: statsData.numberOfResumesDownloaded ?? statsData.downloads ?? null,
      totalEarnings: earningsData.amount ?? earningsData.total ?? null,
      currency: earningsData.currency || 'USD',
      tenants: {
        total: tenants.length,
        active: tenants.filter(t => t.lifecycleState === 'ACTIVE').length,
        suspended: suspended.length,
      },
    },
    signals: {
      database: { status: health.subsystems.database.status, latencyMs: health.subsystems.database.latencyMs },
      queue: { status: health.subsystems.queue.status, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs },
      email: { status: health.subsystems.queue.status, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs },
      payments: {
        status: !paymentsResult.ok ? 'UNAVAILABLE' : paymentFailed > 0 ? 'DEGRADED' : 'HEALTHY',
        failed: paymentFailed,
        pending: paymentPending,
        active: paymentActive,
        inspected: paymentInspected,
      },
      security: {
        status: !securityResult.ok ? 'UNAVAILABLE' : highSecurity > 0 ? 'ATTENTION' : 'HEALTHY',
        highSeverity: highSecurity,
        recentCount: recentSecurity.length,
      },
      encryption: {
        status: encryption.provider && encryption.provider !== 'none' ? 'CONFIGURED' : 'UNAVAILABLE',
        provider: encryption.provider || 'none',
        securityLevel: encryption.securityLevel || null,
      },
      deployment: {
        status: 'REPORTED',
        commitSha: health.commitSha,
        nodeVersion: health.subsystems.runtime.nodeVersion,
      },
    },
    recommendations,
    attentionTenants: tenants.filter(t => t.lifecycleState !== 'ACTIVE').slice(0, 8),
    recentAudit,
    recentSecurity: recentSecurity.slice(0, 6),
    maintenance,
    announcements: announcements.filter(item => item.enabled).slice(0, 5),
    sources,
    updatedAt: new Date().toISOString(),
  });
});

router.get('/security-events', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const snap = await db.collection('security_audit_logs').orderBy('createdAt', 'desc').limit(limit).get();
    const events = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      events.push({
        id: doc.id,
        action: data.action || 'UNKNOWN',
        actorUid: data.actorUid || null,
        actorEmail: data.actorEmail || null,
        targetUid: data.targetUid || null,
        tenantId: data.tenantId || null,
        category: data.category || null,
        severity: data.severity || 'INFO',
        pathname: data.pathname || null,
        requestId: data.requestId || null,
        createdAt: isoFrom(data.createdAt),
      });
    });
    return res.json({ events, count: events.length });
  } catch (error) {
    return res.status(500).json({ error: { code: 'SECURITY_EVENTS_UNAVAILABLE', message: error.message } });
  }
});

router.get('/encryption', async (req, res) => {
  const tenantService = req.app?.get('tenantService');
  const runtime = tenantService?.describeRuntime?.() || {};
  const encryption = runtime.encryption || { provider: 'none', configured: false };
  return res.json({
    encryption: {
      provider: encryption.provider || 'none',
      configured: encryption.configured !== false && encryption.provider && encryption.provider !== 'none',
      algorithm: encryption.algorithm || null,
      activeVersion: encryption.activeVersion || null,
      keyVersions: encryption.keyVersions || [],
      managedKms: encryption.managedKms === true,
      securityLevel: encryption.securityLevel || 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED',
      keyRotationSupported: encryption.keyRotationSupported === true,
      error: encryption.error || runtime.error || null,
    },
    dataPlane: {
      provider: runtime.dataProvider || 'unknown',
      configured: runtime.dataPlaneConfigured === true,
      quotaStore: runtime.quotaStore || 'unavailable',
    },
  });
});

router.get('/observability', async (req, res) => {
  const { enterpriseObservability } = require('../enterprise/tenantObservability');
  
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  
  if (db && admin && !enterpriseObservability.durableDb) {
    enterpriseObservability.setDurableStore(db, admin);
  }

  // Optionally trigger an immediate flush to ensure we don't lose data on restart
  if (db && admin) {
    await enterpriseObservability.flushToDurableStore();
  }

  const metrics = enterpriseObservability.getMetrics();
  
  let durableMetrics = null;
  if (db) {
    try {
      const snap = await db.collection('data').doc('observability').get();
      if (snap.exists) durableMetrics = snap.data();
    } catch (_) {}
  }

  return res.json({
    metrics,
    durableMetrics,
    note: 'In-process sample metrics are combined with durable historical metrics from Firestore.',
    commitSha: getCommitSha(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

router.get('/backup-status', async (req, res) => {
  const tenantService = req.app?.get('tenantService');
  const runtime = tenantService?.describeRuntime?.() || {};
  const db = req.app?.get('db');
  let lastExport = null;
  if (db) {
    try {
      const snap = await db.collection('admin_audit_logs').where('action', '==', 'TENANT_DATA_EXPORTED').orderBy('createdAt', 'desc').limit(1).get();
      if (!snap.empty) {
        const data = snap.docs[0].data() || {};
        lastExport = { id: snap.docs[0].id, createdAt: isoFrom(data.createdAt), actorEmail: data.actorEmail || data.actorUid || null };
      }
    } catch (_) { /* index may be absent; capability remains truthful */ }
  }
  return res.json({
    capability: {
      provider: 'enterpriseBackup.exportTenantSnapshot',
      available: Boolean(db && runtime.dataPlaneConfigured),
      restoreModes: ['dry-run', 'apply'],
      note: 'Backup and restore remain tenant-scoped Enterprise operations. Super Admin surfaces status and links; it does not duplicate the backup store.',
    },
    lastRecordedExport: lastExport,
  });
});

router.get('/payments-health', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  try {
    const [activeCnt, failedCnt, pendingCnt, refundedCnt, allCnt] = await Promise.all([
      db.collection('payment_orders').where('status', '==', 'ACTIVE').count().get(),
      db.collection('payment_orders').where('status', 'in', ['FAILED', 'CANCELLED', 'DECLINED']).count().get(),
      db.collection('payment_orders').where('status', 'in', ['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING']).count().get(),
      db.collection('payment_orders').where('status', '==', 'REFUNDED').count().get(),
      db.collection('payment_orders').count().get(),
    ]);

    const counts = {
      inspected: allCnt.data().count,
      ACTIVE: activeCnt.data().count,
      FAILED: failedCnt.data().count,
      PENDING: pendingCnt.data().count,
      REFUNDED: refundedCnt.data().count,
      OTHER: allCnt.data().count - (activeCnt.data().count + failedCnt.data().count + pendingCnt.data().count + refundedCnt.data().count),
    };

    return res.json({
      counts,
      status: counts.FAILED > 0 ? 'DEGRADED' : 'HEALTHY',
      note: 'Counts are fully accurate aggregations from the complete payment_orders ledger.',
    });
  } catch (error) {
    return res.status(500).json({ error: { code: 'PAYMENTS_HEALTH_UNAVAILABLE', message: error.message } });
  }
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q.length < 2) return res.json({ users: [], tenants: [], query: q });
  const db = req.app?.get('db');
  const tenantService = req.app?.get('tenantService');
  const needle = q.toLowerCase();
  const tenants = [];
  const users = [];

  try {
    if (tenantService?.listPlatformTenants) {
      const listed = await tenantService.listPlatformTenants({ user: req.user, limit: 200 });
      for (const tenant of listed) {
        if ([tenant.displayName, tenant.slug, tenant.id].some(value => String(value || '').toLowerCase().includes(needle))) {
          tenants.push(tenant);
        }
      }
    }
  } catch (_) { /* tenant search remains best-effort */ }

  if (db && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) {
    try {
      const snap = await db.collection('users').where('email', '==', q.toLowerCase()).limit(5).get();
      snap.forEach(doc => {
        const data = doc.data() || {};
        users.push({ id: doc.id, email: data.email || q, displayName: data.displayName || `${data.firstname || ''} ${data.lastname || ''}`.trim(), membership: data.membership || null });
      });
    } catch (_) { /* ignore */ }
  } else if (db && /^[A-Za-z0-9:_-]{6,128}$/.test(q)) {
    try {
      const doc = await db.collection('users').doc(q).get();
      if (doc.exists) {
        const data = doc.data() || {};
        users.push({ id: doc.id, email: data.email || null, displayName: data.displayName || null, membership: data.membership || null });
      }
    } catch (_) { /* ignore */ }
  }

  return res.json({ query: q, users: users.slice(0, 8), tenants: tenants.slice(0, 8) });
});

router.get('/announcements', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.json({ announcements: [] });
  try {
    const snap = await db.collection('platform_announcements').limit(50).get();
    const announcements = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      announcements.push({
        id: doc.id,
        title: data.title || '',
        message: data.message || '',
        severity: data.severity || 'INFO',
        audience: data.audience || 'ALL',
        enabled: data.enabled === true,
        createdBy: data.createdBy || null,
        updatedAt: isoFrom(data.updatedAt),
      });
    });
    announcements.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return res.json({ announcements });
  } catch (error) {
    return res.status(500).json({ error: { code: 'ANNOUNCEMENTS_UNAVAILABLE', message: error.message } });
  }
});

router.post('/announcements', requireSuperAdmin, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }
  const title = String(req.body?.title || '').trim().slice(0, 160);
  const message = String(req.body?.message || '').trim().slice(0, 1000);
  if (title.length < 3 || message.length < 3) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Title and message are required' } });
  }
  const ref = db.collection('platform_announcements').doc();
  const payload = {
    title,
    message,
    severity: ['INFO', 'MEDIUM', 'HIGH'].includes(String(req.body?.severity || '').toUpperCase()) ? String(req.body.severity).toUpperCase() : 'INFO',
    audience: String(req.body?.audience || 'ALL').slice(0, 40),
    enabled: req.body?.enabled !== false,
    createdBy: req.user?.email || req.user?.uid || 'admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  return res.status(201).json({ announcement: { id: ref.id, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
});

router.patch('/announcements/:id', requireSuperAdmin, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }
  const id = String(req.params.id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Invalid announcement id' } });
  }
  const ref = db.collection('platform_announcements').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Announcement not found' } });
  const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (req.body?.title !== undefined) updates.title = String(req.body.title).trim().slice(0, 160);
  if (req.body?.message !== undefined) updates.message = String(req.body.message).trim().slice(0, 1000);
  if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled === true;
  if (req.body?.severity) updates.severity = String(req.body.severity).toUpperCase().slice(0, 16);
  await ref.set(updates, { merge: true });
  return res.json({ success: true, id });
});

router.delete('/announcements/:id', requireSuperAdmin, async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  const id = String(req.params.id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Invalid announcement id' } });
  }
  const ref = db.collection('platform_announcements').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Announcement not found' } });
  await ref.delete();
  return res.json({ success: true, id });
});

async function inspectAttentionSignals(req) {
  const db = req.app?.get('db');
  const extras = { paymentFailed: 0, highSecurity: 0, suspendedTenants: 0, maintenanceEnabled: false };
  if (!db) return extras;
  const [payments, security, tenants, maintenance] = await Promise.all([
    safeQuery('payments', () => db.collection('payment_orders').where('status', 'in', ['FAILED', 'CANCELLED', 'DECLINED']).count().get()),
    safeQuery('security', () => db.collection('security_audit_logs').where('severity', 'in', ['HIGH', 'CRITICAL']).count().get()),
    safeQuery('tenants', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'SUSPENDED').count().get()),
    safeQuery('maintenance', () => db.collection('settings').doc('maintenance').get()),
  ]);
  if (payments.ok && payments.value) {
    extras.paymentFailed = payments.value.data().count || 0;
  }
  if (security.ok && security.value) {
    extras.highSecurity = security.value.data().count || 0;
  }
  if (tenants.ok && tenants.value) {
    extras.suspendedTenants = tenants.value.data().count || 0;
  }
  extras.maintenanceEnabled = maintenance.ok && maintenance.value.exists && maintenance.value.data()?.enabled === true;
  return extras;
}

function attentionItemsFromSignals(health, extras = {}) {
  const items = [];
  if (health.subsystems.database.status !== 'HEALTHY') {
    items.push({ id: 'db-down', severity: 'HIGH', title: 'Firestore ping failed', href: '/adm/operations', kind: 'health' });
  }
  if (health.subsystems.queue.deadLetterJobs > 0) {
    items.push({ id: 'dlq', severity: 'HIGH', title: `${health.subsystems.queue.deadLetterJobs} notification DLQ item(s)`, href: '/adm/queues', kind: 'queue' });
  }
  if (health.status !== 'HEALTHY') {
    items.push({ id: 'platform-health', severity: health.status === 'UNHEALTHY' ? 'HIGH' : 'MEDIUM', title: `Platform status ${health.status}`, href: '/adm/dashboard', kind: 'health' });
  }
  if (extras.paymentFailed > 0) {
    items.push({ id: 'payments', severity: 'MEDIUM', title: `${extras.paymentFailed} failed payment order(s) in latest sample`, href: '/adm/settings?tab=ordersManagement', kind: 'payments' });
  }
  if (extras.highSecurity > 0) {
    items.push({ id: 'security', severity: 'HIGH', title: `${extras.highSecurity} high-severity security event(s)`, href: '/adm/security', kind: 'security' });
  }
  if (extras.suspendedTenants > 0) {
    items.push({ id: 'suspended-tenants', severity: 'MEDIUM', title: `${extras.suspendedTenants} suspended tenant(s)`, href: '/adm/tenants', kind: 'tenancy' });
  }
  if (extras.maintenanceEnabled) {
    items.push({ id: 'maintenance', severity: 'HIGH', title: 'Maintenance mode is enabled', href: '/adm/operations', kind: 'ops' });
  }
  return items;
}

router.get('/attention', async (req, res) => {
  const health = await buildHealthPayload(req);
  const extras = await inspectAttentionSignals(req);
  return res.json({
    items: attentionItemsFromSignals(health, extras),
    healthScore: health.healthScore,
    status: health.status,
    note: 'Attention items are derived from inspected platform signals. This is not a ticket system.',
  });
});

router.get('/enterprise-queue', async (req, res) => {
  try {
    const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
    const db = req.app?.get('db');
    const admin = req.app?.get('firebaseAdmin');
    const signingSecret = process.env.TENANT_JOB_SIGNING_SECRET || null;
    const queue = await getOutboxStatus({ db, admin, signingSecret });
    return res.json({
      queue,
      note: 'Global Enterprise durable-outbox posture. Tenant job replay remains in /enterprise.',
    });
  } catch (error) {
    return res.status(503).json({ error: { code: 'ENTERPRISE_QUEUE_UNAVAILABLE', message: error.message } });
  }
});

const PLATFORM_OPERATOR_ROLES = new Set(['ADMIN', 'SUPPORT', 'USER']);

router.get('/operators', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) return res.json({ operators: [] });
  try {
    const snap = await db.collection('users').where('role', 'in', ['ADMIN', 'SUPER_ADMIN', 'SUPPORT']).limit(100).get();
    const operators = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      operators.push({
        id: doc.id,
        email: data.email || null,
        role: String(data.role || 'USER').toUpperCase(),
        suspended: data.suspended === true,
        displayName: data.displayName || `${data.firstname || ''} ${data.lastname || ''}`.trim() || null,
      });
    });
    return res.json({ operators, note: 'Roles shown are the Firestore role field. Authoritative access is the Firebase custom claim.' });
  } catch (error) {
    return res.status(500).json({ error: { code: 'OPERATORS_UNAVAILABLE', message: error.message } });
  }
});

router.post('/operators', requireSuperAdmin, async (req, res) => {
  const uid = String(req.body?.uid || '').trim();
  const nextRole = String(req.body?.role || '').toUpperCase();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid) || !PLATFORM_OPERATOR_ROLES.has(nextRole)) {
    return res.status(400).json({ error: { code: 'INVALID_OPERATOR', message: 'A valid uid and role of ADMIN, SUPPORT, or USER is required' } });
  }
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.auth) {
    return res.status(503).json({ error: { code: 'IDENTITY_UNAVAILABLE', message: 'Identity directory unavailable' } });
  }
  if (uid === req.user?.uid && nextRole !== 'ADMIN' && nextRole !== 'SUPER_ADMIN') {
    return res.status(400).json({ error: { code: 'SELF_DEMOTION_PROHIBITED', message: 'Self-demotion is prohibited' } });
  }
  try {
    const target = await admin.auth().getUser(uid);
    const currentRole = String(target.customClaims?.role || '').toUpperCase();
    if (currentRole === 'SUPER_ADMIN') {
      return res.status(403).json({ error: { code: 'SUPER_ADMIN_PROTECTED', message: 'SUPER_ADMIN claims cannot be changed from this API' } });
    }
    await admin.auth().setCustomUserClaims(uid, { ...(target.customClaims || {}), role: nextRole });
    await admin.auth().revokeRefreshTokens(uid);
    await db.collection('users').doc(uid).set({ role: nextRole, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ success: true, uid, role: nextRole });
  } catch (error) {
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({ error: { code: status === 404 ? 'USER_NOT_FOUND' : 'OPERATOR_UPDATE_FAILED', message: status === 404 ? 'User not found' : 'Operator role could not be updated' } });
  }
});

router.get('/tenants/:tenantId', async (req, res) => {
  const tenantService = req.app?.get('tenantService');
  if (!tenantService?.listPlatformTenants) {
    return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant service unavailable' } });
  }
  try {
    const tenants = await tenantService.listPlatformTenants({ user: req.user, limit: 500 });
    const tenant = tenants.find(item => item.id === req.params.tenantId);
    if (!tenant) return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant was not found' } });
    return res.json({ tenant });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_LOOKUP_FAILED', message: error.status === 403 ? 'Platform administration is not permitted' : 'Tenant detail is unavailable' } });
  }
});

router.post('/tenants/:tenantId/decommission', requireSuperAdmin, async (req, res) => {
  const tenantService = req.app?.get('tenantService');
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!tenantService?.setTenantLifecycleAsPlatform) {
    return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant service unavailable' } });
  }
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (reason.length < 8) {
    return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: 'A decommission reason of at least 8 characters is required' } });
  }
  try {
    const tenant = await tenantService.setTenantLifecycleAsPlatform({
      user: req.user,
      tenantId: req.params.tenantId,
      nextState: 'DELETING',
      requestId: res.locals?.requestId,
    });
    if (db && admin?.firestore?.FieldValue) {
      await recordAdminAuditLog(db, admin, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: 'SUPER_ADMIN',
        action: 'DECOMMISSION_PLATFORM_TENANT',
        category: 'enterprise.tenancy',
        severity: 'HIGH',
        outcome: 'SUCCESS',
        method: 'POST',
        pathname: req.originalUrl,
        statusCode: 200,
        metadata: { tenantId: tenant.id, reason },
      });
    }
    return res.json({ tenant: { id: tenant.id, lifecycleState: tenant.lifecycleState }, reason });
  } catch (error) {
    return res.status(error.status || 503).json({
      error: {
        code: error.code || 'TENANT_DECOMMISSION_FAILED',
        message: error.status === 409 ? error.message : error.status === 403 ? 'Tenant decommission is not permitted' : 'Tenant could not be decommissioned',
      },
    });
  }
});

module.exports = { platformRouter: router };
