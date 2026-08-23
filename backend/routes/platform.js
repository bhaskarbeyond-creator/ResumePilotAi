'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { requirePermission, requireSuperAdmin, isSuperAdmin } = require('../security/auth');
const { recordAdminAuditLog } = require('../security/adminAudit');
const {
  getHealthSnapshot,
  resetHealthCache,
  runServiceTest,
  TESTABLE_SERVICES,
  STATE: HEALTH_STATE,
} = require('../services/platformHealth');

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

function countFrom(result) {
  if (!result?.ok || !result.value || typeof result.value.data !== 'function') return { ok: false, value: null };
  const n = Number(result.value.data()?.count);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: null };
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

/* ──────────────────────────────────────────────────────────────────────────
   Operational status (Platform Health console)
   Every value below is produced by platformHealth.js from a live probe or a
   live configuration read. Secrets never cross this boundary.
   ────────────────────────────────────────────────────────────────────────── */

/** Super Admins additionally see runtime diagnostics; Admins see operational state. */
function projectSnapshotForRole(snapshot, elevated) {
  if (elevated) return snapshot;
  const services = snapshot.services.map(item => {
    const metrics = { ...(item.metrics || {}) };
    // Host, path, pid and load figures are diagnostic detail, not operational state.
    for (const key of ['host', 'pid', 'loadAverage1m', 'systemFreeMemMb', 'systemTotalMemMb', 'rssMb', 'heapUsedMb', 'heapTotalMb', 'executablePathConfigured']) {
      delete metrics[key];
    }
    return { ...item, metrics };
  });
  return { ...snapshot, services, elevated: false };
}

router.get('/operational-status', async (req, res) => {
  try {
    const elevated = isSuperAdmin(req.user);
    const force = String(req.query.force || '') === 'true';
    const snapshot = await getHealthSnapshot(req.app, { force });
    return res.json({ ...projectSnapshotForRole(snapshot, elevated), elevated });
  } catch (error) {
    console.error('[PlatformHealth] snapshot failed:', error?.message || error);
    return res.status(503).json({
      error: {
        code: 'HEALTH_SNAPSHOT_UNAVAILABLE',
        message: 'Operational status could not be collected. No status is inferred when the collector fails.',
        requestId: res.locals?.requestId,
      },
    });
  }
});

router.get('/operational-status/api-matrix', async (req, res) => {
  try {
    const snapshot = await getHealthSnapshot(req.app);
    return res.json({ checkedAt: snapshot.checkedAt, ...snapshot.apiMatrix });
  } catch (error) {
    console.error('[PlatformHealth] api matrix failed:', error?.message || error);
    return res.status(503).json({
      error: { code: 'API_MATRIX_UNAVAILABLE', message: 'The API health matrix could not be collected.', requestId: res.locals?.requestId },
    });
  }
});

router.get('/operational-status/:serviceId', async (req, res) => {
  const serviceId = String(req.params.serviceId || '');
  if (!/^[a-z0-9-]{1,64}$/.test(serviceId)) {
    return res.status(400).json({ error: { code: 'INVALID_SERVICE_ID', message: 'Invalid service identifier', requestId: res.locals?.requestId } });
  }
  try {
    const elevated = isSuperAdmin(req.user);
    const snapshot = projectSnapshotForRole(await getHealthSnapshot(req.app), elevated);
    const detail = snapshot.services.find(item => item.id === serviceId);
    if (!detail) {
      return res.status(404).json({ error: { code: 'SERVICE_NOT_FOUND', message: 'No such monitored service', requestId: res.locals?.requestId } });
    }
    const relatedEndpoints = snapshot.apiMatrix.endpoints.filter(endpoint => endpoint.dependencyId === serviceId);

    // Related audit events are best-effort: an unreadable trail is reported as such.
    let auditEvents = [];
    let auditSource = 'unavailable';
    const db = req.app?.get('db');
    if (db) {
      const query = await safeQuery('service-audit', () => db.collection('admin_audit_logs').orderBy('createdAt', 'desc').limit(50).get());
      if (query.ok) {
        auditSource = 'ok';
        const needle = serviceId.replace(/-/g, '');
        query.value.forEach(doc => {
          const data = doc.data() || {};
          const haystack = `${data.action || ''} ${data.category || ''} ${data.pathname || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (haystack.includes(needle) || relatedEndpoints.some(endpoint => String(data.pathname || '').startsWith(endpoint.path.split(':')[0]))) {
            auditEvents.push({
              id: doc.id,
              action: data.action || 'UNKNOWN',
              actorEmail: data.actorEmail || null,
              severity: data.severity || 'INFO',
              outcome: data.outcome || null,
              statusCode: data.statusCode ?? null,
              pathname: data.pathname || null,
              createdAt: isoFrom(data.createdAt),
            });
          }
        });
        auditEvents = auditEvents.slice(0, 10);
      }
    }

    return res.json({
      service: detail,
      checkedAt: snapshot.checkedAt,
      relatedEndpoints,
      auditEvents,
      auditSource,
      elevated,
    });
  } catch (error) {
    console.error('[PlatformHealth] service detail failed:', error?.message || error);
    return res.status(503).json({
      error: { code: 'SERVICE_DETAIL_UNAVAILABLE', message: 'Service detail could not be collected.', requestId: res.locals?.requestId },
    });
  }
});

/**
 * Operator-initiated provider test. This is a mutation of operational intent
 * (it contacts a provider), so it requires SUPER_ADMIN and is always audited.
 */
router.post('/operational-status/:serviceId/test', requireSuperAdmin, async (req, res) => {
  const serviceId = String(req.params.serviceId || '');
  if (!TESTABLE_SERVICES.includes(serviceId)) {
    return res.status(400).json({
      error: { code: 'SERVICE_TEST_UNSUPPORTED', message: 'This service does not expose a safe operator test', requestId: res.locals?.requestId },
    });
  }
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  try {
    const result = await runServiceTest(req.app, serviceId);
    resetHealthCache();
    if (db && admin?.firestore?.FieldValue) {
      await recordAdminAuditLog(db, admin, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: 'SUPER_ADMIN',
        action: 'TEST_PLATFORM_INTEGRATION',
        category: 'platform.health',
        severity: result.passed ? 'INFO' : 'MEDIUM',
        outcome: result.passed ? 'SUCCESS' : 'FAILURE',
        method: 'POST',
        pathname: req.originalUrl,
        statusCode: 200,
        metadata: { serviceId, passed: result.passed, errorCategory: result.errorCategory },
      }).catch(() => { /* the test result is still authoritative if the trail write fails */ });
    }
    return res.json({ ...result, checkedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(error.status || 503).json({
      error: { code: error.code || 'SERVICE_TEST_FAILED', message: 'The provider test could not be executed.', requestId: res.locals?.requestId },
    });
  }
});

/** Explicit operator refresh. Audited because it is a deliberate operational action. */
router.post('/operational-status/refresh', requirePermission('system.config.write'), async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  try {
    resetHealthCache();
    const elevated = isSuperAdmin(req.user);
    const snapshot = await getHealthSnapshot(req.app, { force: true });
    if (db && admin?.firestore?.FieldValue) {
      await recordAdminAuditLog(db, admin, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: elevated ? 'SUPER_ADMIN' : 'ADMIN',
        action: 'RUN_PLATFORM_HEALTH_CHECK',
        category: 'platform.health',
        severity: 'INFO',
        outcome: 'SUCCESS',
        method: 'POST',
        pathname: req.originalUrl,
        statusCode: 200,
        metadata: { overall: snapshot.summary.overall },
      }).catch(() => { /* non-fatal */ });
    }
    return res.json({ ...projectSnapshotForRole(snapshot, elevated), elevated });
  } catch (error) {
    console.error('[PlatformHealth] manual refresh failed:', error?.message || error);
    return res.status(503).json({
      error: { code: 'HEALTH_REFRESH_FAILED', message: 'The health check could not be re-run.', requestId: res.locals?.requestId },
    });
  }
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
  
  let featureFlagsSummary = { enabled: 0, disabled: 0, total: 0 };
  try {
    const { getAllFlags } = require('../services/featureFlagService');
    const flags = await getAllFlags();
    featureFlagsSummary.total = flags.length;
    featureFlagsSummary.enabled = flags.filter(f => f.value === true || f.value === 'true').length;
    featureFlagsSummary.disabled = flags.length - featureFlagsSummary.enabled;
  } catch (err) {
    // best effort
  }

  const [paymentsFailCnt, securityHighCnt, suspendedTenantsCnt, activeTenantsCnt, tenantsTotalCnt, activePaymentsCnt, pendingPaymentsCnt] = db ? await Promise.all([
    safeQuery('payments-failed-count', () => db.collection('payment_orders').where('status', 'in', ['FAILED', 'CANCELLED', 'DECLINED']).count().get()),
    safeQuery('security-high-count', () => db.collection('security_audit_logs').where('severity', 'in', ['HIGH', 'CRITICAL']).count().get()),
    safeQuery('tenants-suspended-count', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'SUSPENDED').count().get()),
    safeQuery('tenants-active-count', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'ACTIVE').count().get()),
    safeQuery('tenants-total-count', () => db.collection('enterprise_tenants').count().get()),
    safeQuery('payments-active-count', () => db.collection('payment_orders').where('status', '==', 'ACTIVE').count().get()),
    safeQuery('payments-pending-count', () => db.collection('payment_orders').where('status', 'in', ['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING']).count().get()),
  ]) : [{}, {}, {}, {}, {}, {}, {}];

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

  const paymentFailedAgg = countFrom(paymentsFailCnt);
  const paymentPendingAgg = countFrom(pendingPaymentsCnt);
  const paymentActiveAgg = countFrom(activePaymentsCnt);
  const highSecurityAgg = countFrom(securityHighCnt);
  const suspendedAgg = countFrom(suspendedTenantsCnt);
  const activeTenantAgg = countFrom(activeTenantsCnt);
  const tenantTotalAgg = countFrom(tenantsTotalCnt);

  const paymentFailed = paymentFailedAgg.ok ? paymentFailedAgg.value : null;
  const paymentPending = paymentPendingAgg.ok ? paymentPendingAgg.value : null;
  const paymentActive = paymentActiveAgg.ok ? paymentActiveAgg.value : null;
  const highSecurity = highSecurityAgg.ok ? highSecurityAgg.value : null;

  const recentSecurity = [];
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

  const suspendedSample = tenants.filter(t => t.lifecycleState === 'SUSPENDED');
  const suspendedCount = suspendedAgg.ok ? suspendedAgg.value : suspendedSample.length;
  const suspendedMode = suspendedAgg.ok ? 'AGGREGATED' : tenantsResult.ok ? 'SAMPLED' : 'UNAVAILABLE';

  let riskScore = 0;
  if (health.subsystems.database.status !== 'HEALTHY') riskScore += 40;
  if (health.subsystems.queue.deadLetterJobs > 0) riskScore += Math.min(25, health.subsystems.queue.deadLetterJobs * 5);
  if (paymentFailed > 0) riskScore += Math.min(20, paymentFailed * 4);
  if (highSecurity > 0) riskScore += Math.min(20, highSecurity * 5);
  if (suspendedCount > 0) riskScore += 10;
  if (maintenance.enabled) riskScore += 15;
  if (encryption.provider === 'none' || encryption.configured === false) riskScore += 5;
  riskScore = Math.max(0, Math.min(100, riskScore));

  if (health.subsystems.database.status !== 'HEALTHY') {
    recommendations.push({ id: 'db-down', severity: 'HIGH', title: 'Firestore ping failed', detail: 'Platform data plane did not acknowledge the health write.', href: '/adm/operations' });
  }
  if (health.subsystems.queue.deadLetterJobs > 0) {
    recommendations.push({ id: 'dlq', severity: 'HIGH', title: `${health.subsystems.queue.deadLetterJobs} dead-letter notification(s)`, detail: 'Replay or inspect failed email/outbox jobs. Queue counts are from the latest inspected outbox sample.', href: '/adm/queues' });
  }
  if (paymentFailed > 0) {
    recommendations.push({ id: 'payments', severity: 'MEDIUM', title: `${paymentFailed} failed payment order(s)`, detail: 'Review the payment ledger. This is an aggregated Firestore count, not a sample.', href: '/adm/settings?tab=ordersManagement' });
  } else if (!paymentFailedAgg.ok) {
    recommendations.push({ id: 'payments-unavailable', severity: 'INFO', title: 'Payment ledger count unavailable', detail: 'Failed-payment aggregation could not be read. Not treated as zero.', href: '/adm/settings?tab=ordersManagement' });
  }
  if (highSecurity > 0) {
    recommendations.push({ id: 'security', severity: 'HIGH', title: `${highSecurity} high-severity security event(s)`, detail: 'Inspect the security event stream for denied or destructive operations. This is an aggregated count.', href: '/adm/security' });
  } else if (!highSecurityAgg.ok) {
    recommendations.push({ id: 'security-unavailable', severity: 'INFO', title: 'High-severity security count unavailable', detail: 'Aggregation could not be read. Not treated as zero.', href: '/adm/security' });
  }
  if (suspendedCount > 0) {
    recommendations.push({ id: 'suspended-tenants', severity: 'MEDIUM', title: `${suspendedCount} suspended tenant(s)`, detail: suspendedMode === 'AGGREGATED' ? 'Confirm whether suspension is still required.' : 'Count is from the inspected tenant sample, not a full scan.', href: '/adm/tenants' });
  }
  if (maintenance.enabled) {
    recommendations.push({ id: 'maintenance', severity: 'HIGH', title: 'Maintenance mode is enabled', detail: maintenance.message || 'Public product routes are blocked for non-admins.', href: '/adm/operations' });
  }
  // Operational health is folded into the command center so the Attention list
  // and the Platform Health console can never disagree about the same fact.
  let operationalStatus = null;
  try {
    const snapshot = await getHealthSnapshot(req.app);
    sources.operationalStatus = 'ok';
    operationalStatus = {
      overall: snapshot.summary.overall,
      indicator: snapshot.summary.indicator,
      counts: snapshot.summary.counts,
      checkedAt: snapshot.checkedAt,
      apiMatrix: {
        total: snapshot.apiMatrix.total,
        operationalOrExpected: snapshot.apiMatrix.operationalOrExpected,
        degraded: snapshot.apiMatrix.degraded,
        unavailable: snapshot.apiMatrix.unavailable,
      },
      attention: snapshot.services
        .filter(item => [HEALTH_STATE.UNAVAILABLE, HEALTH_STATE.DEGRADED, HEALTH_STATE.UNKNOWN].includes(item.state))
        .map(item => ({ id: item.id, name: item.name, state: item.state, reason: item.reason, critical: item.critical })),
    };
    for (const item of attentionItemsFromOperationalStatus(snapshot)) {
      if (item.severity === 'INFO') continue;
      if (recommendations.some(existing => existing.id === item.id)) continue;
      recommendations.push({ id: item.id, severity: item.severity, title: item.title, detail: item.detail, href: item.href });
    }
  } catch (_) {
    sources.operationalStatus = 'unavailable';
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
        total: tenantTotalAgg.ok ? tenantTotalAgg.value : tenants.length,
        active: activeTenantAgg.ok ? activeTenantAgg.value : tenants.filter(t => t.lifecycleState === 'ACTIVE').length,
        suspended: suspendedCount,
        mode: tenantTotalAgg.ok ? 'AGGREGATED' : tenantsResult.ok ? 'SAMPLED' : 'UNAVAILABLE',
      },
    },
    signals: {
      database: { status: health.subsystems.database.status, latencyMs: health.subsystems.database.latencyMs },
      queue: { status: health.subsystems.queue.status, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs, mode: 'SAMPLED' },
      email: { status: health.subsystems.queue.status, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs, mode: 'SAMPLED' },
      payments: {
        status: !paymentFailedAgg.ok ? 'UNAVAILABLE' : paymentFailed > 0 ? 'DEGRADED' : 'HEALTHY',
        failed: paymentFailed,
        pending: paymentPending,
        active: paymentActive,
        mode: paymentFailedAgg.ok ? 'AGGREGATED' : 'UNAVAILABLE',
      },
      security: {
        status: !highSecurityAgg.ok ? 'UNAVAILABLE' : highSecurity > 0 ? 'ATTENTION' : 'HEALTHY',
        highSeverity: highSecurity,
        recentCount: recentSecurity.length,
        mode: highSecurityAgg.ok ? 'AGGREGATED' : 'UNAVAILABLE',
      },
      encryption: {
        status: encryption.provider && encryption.provider !== 'none' ? 'CONFIGURED' : 'UNAVAILABLE',
        provider: encryption.provider || 'none',
        securityLevel: encryption.securityLevel || null,
      },
      featureFlags: featureFlagsSummary,
      deployment: {
        status: 'REPORTED',
        commitSha: health.commitSha,
        nodeVersion: health.subsystems.runtime.nodeVersion,
      },
    },
    recommendations,
    operationalStatus,
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
    items.push({ id: 'payments', severity: 'MEDIUM', title: `${extras.paymentFailed} failed payment order(s)`, href: '/adm/settings?tab=ordersManagement', kind: 'payments' });
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

/**
 * Attention items derived from the operational status snapshot. Disabled
 * integrations are surfaced as informational context ("payment option hidden"),
 * never as failures, and degraded services carry their real impact count.
 */
function attentionItemsFromOperationalStatus(snapshot) {
  if (!snapshot) return [];
  const items = [];
  const endpointsFor = id => snapshot.apiMatrix.endpoints.filter(endpoint => endpoint.dependencyId === id).length;

  for (const item of snapshot.services) {
    const affectedEndpoints = endpointsFor(item.id);
    const href = `/adm/health?service=${encodeURIComponent(item.id)}`;
    if (item.state === HEALTH_STATE.UNAVAILABLE) {
      items.push({
        id: `health-${item.id}`,
        severity: item.critical ? 'HIGH' : 'MEDIUM',
        title: `${item.name} unavailable`,
        detail: affectedEndpoints > 0 ? `${item.reason} ${affectedEndpoints} endpoint(s) affected.` : item.reason,
        href,
        kind: 'health',
      });
    } else if (item.state === HEALTH_STATE.DEGRADED) {
      items.push({
        id: `health-${item.id}`,
        severity: item.critical ? 'HIGH' : 'MEDIUM',
        title: `${item.name} degraded`,
        detail: affectedEndpoints > 0 ? `${item.reason} ${affectedEndpoints} endpoint(s) affected.` : item.reason,
        href,
        kind: 'health',
      });
    } else if (item.state === HEALTH_STATE.UNKNOWN) {
      items.push({
        id: `health-${item.id}`,
        severity: 'MEDIUM',
        title: `${item.name} state unknown`,
        detail: item.reason,
        href,
        kind: 'health',
      });
    } else if (item.state === HEALTH_STATE.DISABLED && item.group === 'integrations') {
      items.push({
        id: `health-${item.id}`,
        severity: 'INFO',
        title: `${item.name} disabled`,
        detail: `${item.reason} The corresponding option is hidden from the product UI.`,
        href,
        kind: 'configuration',
      });
    }
  }
  return items;
}

router.get('/attention', async (req, res) => {
  const health = await buildHealthPayload(req);
  const extras = await inspectAttentionSignals(req);
  let operational = null;
  let operationalSource = 'unavailable';
  try {
    operational = await getHealthSnapshot(req.app);
    operationalSource = 'ok';
  } catch (_) { /* the signal-derived items below remain valid */ }

  const items = [...attentionItemsFromSignals(health, extras), ...attentionItemsFromOperationalStatus(operational)];
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return res.json({
    items: deduped,
    healthScore: health.healthScore,
    status: health.status,
    operationalStatus: operational
      ? { overall: operational.summary.overall, indicator: operational.summary.indicator, counts: operational.summary.counts, checkedAt: operational.checkedAt }
      : null,
    operationalSource,
    note: 'Attention items are derived from inspected platform signals and live operational health. This is not a ticket system.',
  });
});

/**
 * Lightweight indicator for the Admin navigation dot. Kept separate from the
 * full snapshot so the nav can poll it cheaply.
 */
router.get('/health-indicator', async (req, res) => {
  try {
    const snapshot = await getHealthSnapshot(req.app);
    const attention = snapshot.services.filter(item =>
      item.state === HEALTH_STATE.UNAVAILABLE || item.state === HEALTH_STATE.DEGRADED || item.state === HEALTH_STATE.UNKNOWN);
    return res.json({
      indicator: snapshot.summary.indicator,
      overall: snapshot.summary.overall,
      counts: snapshot.summary.counts,
      attentionCount: attention.length,
      checkedAt: snapshot.checkedAt,
    });
  } catch (_) {
    return res.status(503).json({
      error: { code: 'HEALTH_INDICATOR_UNAVAILABLE', message: 'Health indicator data is unavailable.', requestId: res.locals?.requestId },
    });
  }
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

/* ------------------------------------------------------------------
 * Feature Flags — SUPER_ADMIN only
 * ------------------------------------------------------------------ */

const { getAllFlags, setFlagValue } = require('../services/featureFlagService');

router.get('/feature-flags', requireSuperAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const flags = await getAllFlags(db);
    return res.json({ flags });
  } catch (error) {
    return res.status(503).json({ error: { code: 'FEATURE_FLAGS_UNAVAILABLE', message: 'Could not load feature flags' } });
  }
});

router.put('/feature-flags/:flagKey', requireSuperAdmin, async (req, res) => {
  const { flagKey } = req.params;
  const { value } = req.body;
  if (typeof value !== 'boolean') {
    return res.status(400).json({ error: { code: 'INVALID_VALUE', message: 'Flag value must be a boolean' } });
  }
  try {
    const db = req.app.get('db');
    const admin = req.app.get('admin');
    const result = await setFlagValue(db, admin, flagKey, value, req.user?.uid, res.locals.requestId);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ error: { code: 'FLAG_UPDATE_FAILED', message: error.message } });
  }
});

/* ------------------------------------------------------------------
 * Platform Configuration — SUPER_ADMIN only
 * Read-only configuration census for the Admin UI.
 * ------------------------------------------------------------------ */

router.get('/configuration', requireSuperAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const flags = await getAllFlags(db);

    // Mask secrets: show only whether configured, never the value
    const maskSecret = (val) => val ? '••••••••' : null;
    const isConfigured = (val) => Boolean(val && String(val).trim().length > 0);

    const infrastructure = {
      FIREBASE_PROJECT_ID: { value: process.env.FIREBASE_PROJECT_ID || '', category: 'firebase', editable: false },
      FIREBASE_CLIENT_EMAIL: { value: (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^(.{4}).*(@.*)$/, '$1****$2'), category: 'firebase', editable: false },
      FIREBASE_PRIVATE_KEY: { value: isConfigured(process.env.FIREBASE_PRIVATE_KEY) ? 'Configured' : 'Not Configured', category: 'firebase', editable: false, secret: true },
      NODE_ENV: { value: process.env.NODE_ENV || 'development', category: 'runtime', editable: false },
      PORT: { value: process.env.PORT || '8080', category: 'runtime', editable: false },
      PROTOCOL: { value: process.env.PROTOCOL || 'https', category: 'runtime', editable: false },
      COMMIT_SHA: { value: getCommitSha(), category: 'deployment', editable: false },
    };

    const runtime = {
      CORS_ALLOWED_ORIGINS: { value: process.env.CORS_ALLOWED_ORIGINS || '(default)', category: 'security', editable: false, requiresRestart: true },
      TRUST_PROXY_HOPS: { value: process.env.TRUST_PROXY_HOPS || '0', category: 'security', editable: false, requiresRestart: true },
      GLOBAL_RATE_LIMIT_MAX: { value: process.env.GLOBAL_RATE_LIMIT_MAX || '2500', category: 'security', editable: false, requiresRestart: true },
      WEBSITE_NAME: { value: process.env.WEBSITE_NAME || 'airesume.projectdemo.guru', category: 'general', editable: false },
    };

    const integrations = {
      RAZORPAY_KEY_ID: { value: process.env.RAZORPAY_KEY_ID ? 'Configured (env)' : 'Not in env', category: 'payments' },
      RAZORPAY_KEY_SECRET: { value: isConfigured(process.env.RAZORPAY_KEY_SECRET) ? 'Configured (env)' : 'Not in env', category: 'payments', secret: true },
      STRIPE_SECRET: { value: isConfigured(process.env.STRIPE_SECRET) ? 'Configured (env)' : 'Not in env', category: 'payments', secret: true },
      STRIPE_WEBHOOK_SECRET: { value: isConfigured(process.env.STRIPE_WEBHOOK_SECRET) ? 'Configured (env)' : 'Not in env', category: 'payments', secret: true },
      TWILIO_ACCOUNT_SID: { value: isConfigured(process.env.TWILIO_ACCOUNT_SID) ? 'Configured (env)' : 'Not in env', category: 'communications' },
      TWILIO_AUTH_TOKEN: { value: isConfigured(process.env.TWILIO_AUTH_TOKEN) ? 'Configured (env)' : 'Not in env', category: 'communications', secret: true },
      CLOUDFLARE_API_TOKEN: { value: isConfigured(process.env.CLOUDFLARE_API_TOKEN) ? 'Configured (env)' : 'Not in env', category: 'storage', secret: true },
      CLOUDFLARE_R2_ACCESS_KEY_ID: { value: isConfigured(process.env.CLOUDFLARE_R2_ACCESS_KEY_ID) ? 'Configured (env)' : 'Not in env', category: 'storage', secret: true },
    };

    const workers = {
      CMS_SCHEDULER_INTERVAL_MS: { value: process.env.CMS_SCHEDULER_INTERVAL_MS || '300000', category: 'workers', requiresRestart: true },
      ENTERPRISE_OUTBOX_INTERVAL_MS: { value: process.env.ENTERPRISE_OUTBOX_INTERVAL_MS || '15000', category: 'workers', requiresRestart: true },
      NOTIFICATION_OUTBOX_INTERVAL_MS: { value: process.env.NOTIFICATION_OUTBOX_INTERVAL_MS || '15000', category: 'workers', requiresRestart: true },
    };

    return res.json({
      infrastructure,
      runtime,
      featureFlags: flags,
      integrations,
      workers,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({ error: { code: 'CONFIGURATION_UNAVAILABLE', message: 'Could not load platform configuration' } });
  }
});

/* ------------------------------------------------------------------
 * Payment Settings GET — SUPER_ADMIN only
 * Returns public settings + configured/masked state for secrets.
 * Never returns raw secrets.
 * ------------------------------------------------------------------ */

router.get('/payment-settings', requireSuperAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) return res.status(503).json({ error: 'Settings service unavailable' });

    // Read public config
    const publicDoc = await db.collection('data').doc('public_config').get();
    const publicConfig = publicDoc.exists ? (publicDoc.data()?.subscriptions || {}) : {};

    // Read secrets doc (never expose raw values)
    const secretsDoc = await db.collection('settings').doc('payment_providers').get();
    const secrets = secretsDoc.exists ? (secretsDoc.data() || {}) : {};

    // Build configured status & masked keys
    const maskKey = (key) => {
      if (!key || typeof key !== 'string' || key.length < 4) return null;
      return '••••' + key.slice(-4);
    };

    const configuredProviders = {
      razorpay: Boolean(secrets.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET),
      stripe: Boolean(secrets.stripe?.secretKey || process.env.STRIPE_SECRET),
      paypal: Boolean(secrets.paypal?.clientSecret || process.env.PAYPAL_CLIENT_SECRET),
      paytm: Boolean(secrets.paytm?.merchantKey || process.env.PAYTM_MERCHANT_KEY),
      phonepe: Boolean(secrets.phonepe?.saltKey || process.env.PHONEPE_SALT_KEY),
    };

    const maskedKeys = {
      razorpay: maskKey(secrets.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET),
      stripe: maskKey(secrets.stripe?.secretKey || process.env.STRIPE_SECRET),
      paypal: maskKey(secrets.paypal?.clientSecret || process.env.PAYPAL_CLIENT_SECRET),
      paytm: maskKey(secrets.paytm?.merchantKey || process.env.PAYTM_MERCHANT_KEY),
      phonepe: maskKey(secrets.phonepe?.saltKey || process.env.PHONEPE_SALT_KEY),
    };

    const credentialSources = {
      razorpay: secrets.razorpay?.keySecret ? 'firestore' : process.env.RAZORPAY_KEY_SECRET ? 'env' : 'none',
      stripe: secrets.stripe?.secretKey ? 'firestore' : process.env.STRIPE_SECRET ? 'env' : 'none',
      paypal: secrets.paypal?.clientSecret ? 'firestore' : process.env.PAYPAL_CLIENT_SECRET ? 'env' : 'none',
      paytm: secrets.paytm?.merchantKey ? 'firestore' : process.env.PAYTM_MERCHANT_KEY ? 'env' : 'none',
      phonepe: secrets.phonepe?.saltKey ? 'firestore' : process.env.PHONEPE_SALT_KEY ? 'env' : 'none',
    };

    // Public key IDs (not secrets — safe to return)
    const publicKeys = {
      razorpayKeyId: publicConfig.razorpayKeyId || secrets.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || '',
      stripePublishableKey: publicConfig.stripePublishableKey || '',
      paypalClientId: publicConfig.paypalClientId || secrets.paypal?.clientId || process.env.PAYPAL_CLIENT_ID || '',
      paytmMid: publicConfig.paytmMid || secrets.paytm?.mid || process.env.PAYTM_MID || '',
      phonepeId: publicConfig.phonepeId || secrets.phonepe?.merchantId || process.env.PHONEPE_MERCHANT_ID || '',
      phonepeSaltIndex: publicConfig.phonepeSaltIndex || secrets.phonepe?.saltIndex || process.env.PHONEPE_SALT_INDEX || '1',
      paytmWebsite: publicConfig.paytmWebsite || process.env.PAYTM_WEBSITE || 'WEBSTAGING',
    };

    return res.json({
      settings: publicConfig,
      publicKeys,
      configuredProviders,
      maskedKeys,
      credentialSources,
    });
  } catch (error) {
    return res.status(503).json({ error: { code: 'PAYMENT_SETTINGS_UNAVAILABLE', message: 'Could not load payment settings' } });
  }
});

module.exports = { platformRouter: router };

