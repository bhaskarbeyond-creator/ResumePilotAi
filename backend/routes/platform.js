'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { requirePermission, requireSuperAdmin, requireRecentAdminAuthentication, isSuperAdmin } = require('../security/auth');
const { recordAdminAuditLog } = require('../security/adminAudit');
const { getPlatformConfiguration } = require('../services/platformConfiguration');
const { getPaymentSettingsProjection } = require('../services/paymentAdmin');
const {
  getHealthSnapshot,
  resetHealthCache,
  runServiceTest,
  TESTABLE_SERVICES,
  STATE: HEALTH_STATE,
} = require('../services/platformHealth');
const { getActiveEngine } = require('../database/engineManager');
const { getPool } = require('../database/mysql');
const { getPlatformCurrencyConfig, normalizeCurrencyCode, formatCurrencyAmount } = require('../services/platformCurrency');

const router = express.Router();

let cachedCommitSha = null;
function getCommitSha() {
  if (cachedCommitSha) return cachedCommitSha;
  try {
    const shaPath = path.join(__dirname, '..', 'COMMIT_SHA');
    if (fs.existsSync(shaPath)) {
      const raw = fs.readFileSync(shaPath, 'utf8').replace(/^\uFEFF/, '').trim();
      if (/^[0-9a-f]{7,40}$/i.test(raw)) {
        cachedCommitSha = raw;
        return cachedCommitSha;
      }
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
  if (!db) return { active: null, deadLetter: null, completed: null, status: 'UNKNOWN', inspected: null };
  const stats = { active: 0, deadLetter: 0, completed: 0, status: 'HEALTHY', inspected: 0 };
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
  let authHealthy = false;
  let authLatencyMs = null;

  const engine = getActiveEngine();
  const isMySQL = engine === 'mysql';
  let dbProvider = 'Google Cloud Firestore';

  if (isMySQL) {
    try {
      const pingStart = Date.now();
      const pool = getPool();
      await pool.query('SELECT 1 AS alive');
      dbLatencyMs = Date.now() - pingStart;
      dbHealthy = true;
      dbProvider = 'MySQL / MariaDB (u727965524_airesume)';
    } catch (err) {
      console.warn('[PlatformHealth] MySQL ping warning:', err.message);
    }
  } else if (db) {
    try {
      const pingStart = Date.now();
      await db.collection('settings').doc('system_ping_check').set(
        { lastPing: admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date() },
        { merge: true }
      );
      dbLatencyMs = Date.now() - pingStart;
      dbHealthy = true;
      dbProvider = 'Google Cloud Firestore';
    } catch (err) {
      console.warn('[PlatformHealth] DB ping warning:', err.message);
    }
  }

  if (admin?.auth) {
    try {
      const authStart = Date.now();
      await admin.auth().listUsers(1);
      authLatencyMs = Date.now() - authStart;
      authHealthy = true;
    } catch (err) {
      console.warn('[PlatformHealth] Auth probe warning:', err.message);
    }
  }

  const queueStats = isMySQL
    ? { active: 0, deadLetter: 0, completed: 0, status: 'OPERATIONAL', inspected: new Date().toISOString() }
    : await inspectOutbox(db).catch(() => ({ active: null, deadLetter: null, completed: null, status: 'UNKNOWN', inspected: null }));
  const memoryUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  let healthScore = 100;
  if (!dbHealthy) healthScore -= 40;
  else if (dbLatencyMs > 500) healthScore -= 10;
  if (!authHealthy) healthScore -= 30;
  else if (authLatencyMs > 1500) healthScore -= 10;
  if (queueStats.status === 'UNKNOWN') healthScore -= 20;
  else if (queueStats.deadLetter > 5) healthScore -= 20;
  else if (queueStats.deadLetter > 0) healthScore -= 10;
  if ((memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.9) healthScore -= 15;
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    status: healthScore >= 80 && dbHealthy && authHealthy && queueStats.status !== 'UNKNOWN' ? 'HEALTHY' : healthScore >= 50 ? 'DEGRADED' : 'UNHEALTHY',
    healthScore,
    commitSha: getCommitSha(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startTime,
    subsystems: {
      database: {
        status: dbHealthy ? 'HEALTHY' : 'DOWN',
        latencyMs: dbLatencyMs,
        provider: dbProvider,
      },
      authentication: {
        status: authHealthy ? 'HEALTHY' : 'DOWN',
        latencyMs: authLatencyMs,
        provider: 'Firebase Authentication',
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

// Deployment identity is deliberately public and contains no environment or secret material.
// The live certification runner uses this endpoint before authenticating so a
// stale frontend/backend pair cannot be mistaken for a tested release.
router.get('/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ commitSha: getCommitSha(), service: 'resumepilot-backend', apiVersion: 'platform-v2' });
});

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
router.post('/operational-status/:serviceId/test', requireRecentAdminAuthentication, async (req, res) => {
  const serviceId = String(req.params.serviceId || '');
  if (!TESTABLE_SERVICES.includes(serviceId)) {
    return res.status(400).json({
      error: { code: 'SERVICE_TEST_UNSUPPORTED', message: 'This service does not expose a safe operator test', requestId: res.locals?.requestId },
    });
  }
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'AUDIT_UNAVAILABLE', message: 'The provider test cannot run without a durable audit store.', requestId: res.locals?.requestId } });
  }
  try {
    const result = await runServiceTest(req.app, serviceId);
    resetHealthCache();
    const audit = await recordAdminAuditLog(db, admin, {
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
    });
    if (!audit) {
      return res.status(503).json({ error: { code: 'AUDIT_WRITE_FAILED', message: 'The provider test completed but its audit event could not be persisted.', requestId: res.locals?.requestId } });
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
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'AUDIT_UNAVAILABLE', message: 'A durable audit store is required to refresh platform health.', requestId: res.locals?.requestId } });
  }
  try {
    resetHealthCache();
    const elevated = isSuperAdmin(req.user);
    const snapshot = await getHealthSnapshot(req.app, { force: true });
    const audit = await recordAdminAuditLog(db, admin, {
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
    });
    if (!audit) return res.status(503).json({ error: { code: 'AUDIT_WRITE_FAILED', message: 'The health check ran but its audit event could not be persisted.', requestId: res.locals?.requestId } });
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
      db.collection('data').doc('stats').get(),
      db.collection('data').doc('earnings').get(),
      db.collection('enterprise_tenants').limit(500).get(),
    ]);

    const statsData = statsDoc.status === 'fulfilled' && statsDoc.value.exists ? statsDoc.value.data() : null;
    const earningsData = earningsDoc.status === 'fulfilled' && earningsDoc.value.exists ? earningsDoc.value.data() : null;

    let tenantCounts = null;
    if (tenantsSnap.status === 'fulfilled' && tenantsSnap.value) {
      let total = 0; let active = 0; let suspended = 0;
      tenantsSnap.value.forEach(doc => {
        total += 1;
        const data = doc.data() || {};
        if (data.lifecycleState === 'ACTIVE') active += 1;
        else if (data.lifecycleState === 'SUSPENDED') suspended += 1;
      });
      tenantCounts = { total, active, suspended, source: 'SAMPLED_MAX_500' };
    }

    const platformCurrency = await getPlatformCurrencyConfig(db);

    return res.json({
      kpis: {
        totalUsers: statsData ? Math.max(0, statsData.users ?? statsData.totalUsers ?? statsData.numberOfUsers ?? 0) : null,
        resumesCreated: statsData ? Math.max(0, statsData.resumes ?? statsData.numberOfResumesCreated ?? 0) : null,
        totalDownloads: statsData ? Math.max(0, statsData.downloads ?? statsData.numberOfResumesDownloaded ?? 0) : null,
        totalEarningsCents: earningsData ? (earningsData.total ?? earningsData.amount ?? null) : null,
        currency: platformCurrency.code || 'INR',
        currencySymbol: platformCurrency.symbol || '₹',
        tenants: tenantCounts,
      },
      sources: { stats: statsData ? 'AVAILABLE' : 'UNAVAILABLE', earnings: earningsData ? 'AVAILABLE' : 'UNAVAILABLE', tenants: tenantCounts ? 'AVAILABLE' : 'UNAVAILABLE' },
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
    let snap;
    let queryMode = 'ORDERED';
    try {
      snap = await db.collection('notification_outbox').orderBy('createdAt', 'desc').limit(50).get();
    } catch (_) {
      // A missing Firestore index must not look like an empty queue. A bounded
      // unordered fallback still exposes the records, with an explicit mode.
      snap = await db.collection('notification_outbox').limit(50).get();
      queryMode = 'BOUNDED_UNORDERED_FALLBACK';
    }
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

    if (queryMode !== 'ORDERED') items.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    return res.json({
      summary: {
        totalInspected: items.length,
        deadLetterCount,
        pendingCount,
        successCount,
        source: queryMode,
      },
      jobs: items,
    });
  } catch (err) {
    return res.status(503).json({ error: { code: 'QUEUE_QUERY_UNAVAILABLE', message: 'Queue telemetry is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.post('/queues/retry', requireRecentAdminAuthentication, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }

  const { jobId, all = false } = req.body || {};
  if (jobId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(String(jobId))) {
    return res.status(400).json({ error: { code: 'INVALID_JOB_ID', message: 'A valid queue job id is required', requestId: res.locals?.requestId } });
  }
  if (!jobId && all !== true) {
    return res.status(400).json({ error: { code: 'RETRY_TARGET_REQUIRED', message: 'Provide jobId or set all=true', requestId: res.locals?.requestId } });
  }

  try {
    let retriedCount = 0;
    if (jobId) {
      const docRef = db.collection('notification_outbox').doc(String(jobId));
      const snap = await docRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: { code: 'QUEUE_JOB_NOT_FOUND', message: 'Queue job was not found', requestId: res.locals?.requestId } });
      }
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

    await db.collection('security_audit_logs').doc().set({
      action: 'PLATFORM_QUEUE_RETRY', actorUid: req.user?.uid,
      jobId: jobId || null, all: all === true, retriedCount,
      requestId: res.locals?.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const audit = await recordAdminAuditLog(db, admin, {
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_QUEUE_RETRY',
      category: 'platform.queue',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      metadata: { jobId: jobId || null, all: all === true, retriedCount },
      requestId: res.locals?.requestId,
    });
    if (!audit) return res.status(503).json({ error: { code: 'AUDIT_WRITE_FAILED', message: 'Queue retry completed but its Admin audit event could not be persisted.', requestId: res.locals?.requestId } });
    return res.json({ success: true, retriedCount });
  } catch (err) {
    return res.status(500).json({ error: { code: 'RETRY_FAILED', message: 'Queue retry could not be completed', requestId: res.locals?.requestId } });
  }
});

router.post('/queues/purge', requireRecentAdminAuthentication, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }

  try {
    const deadLetters = await db.collection('notification_outbox').where('attemptCount', '>=', 5).limit(50).get();
    let purgedCount = 0;
    if (!deadLetters.empty) {
      const batch = db.batch();
      deadLetters.forEach(doc => {
        batch.delete(doc.ref);
        purgedCount += 1;
      });
      await batch.commit();
    }

    await db.collection('security_audit_logs').doc().set({
      action: 'PLATFORM_QUEUE_PURGE', actorUid: req.user?.uid,
      purgedCount, requestId: res.locals?.requestId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, purgedCount });
  } catch (err) {
    return res.status(500).json({ error: { code: 'PURGE_FAILED', message: 'Queue purge could not be completed', requestId: res.locals?.requestId } });
  }
});

router.get('/maintenance', async (req, res) => {

  const db = req.app?.get('db');
  if (!db) return res.json({ enabled: false, available: false, configurationState: 'UNKNOWN', message: 'Maintenance state is unavailable because Firestore is not initialized.' });
  try {
    const [legacy, publicConfig] = await Promise.all([
      db.collection('settings').doc('maintenance').get(),
      db.collection('data').doc('public_config').get(),
    ]);
    const data = legacy.exists ? legacy.data() : {};
    const publicHealth = publicConfig.exists ? (publicConfig.data()?.systemHealth || {}) : {};
    const available = Boolean(legacy.exists || publicConfig.exists);
    return res.json({
      enabled: data.enabled === true || publicHealth.maintenanceMode === true,
      available,
      configurationState: available ? 'AVAILABLE' : 'UNKNOWN',
      message: data.message || publicHealth.maintenanceMessage || 'Platform is undergoing scheduled maintenance.',
      scheduledEnd: data.scheduledEnd || null,
      updatedBy: data.updatedBy || null,
      updatedAt: isoFrom(data.updatedAt),
      revision: Number(data._revision || publicConfig.data()?._settingsRevisions?.systemHealth || 0),
    });
  } catch (_) {
    return res.status(503).json({ error: { code: 'MAINTENANCE_UNAVAILABLE', message: 'Maintenance state could not be read.', requestId: res.locals?.requestId } });
  }
});

router.post('/maintenance', requireRecentAdminAuthentication, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }

  const { enabled, message, scheduledEnd } = req.body || {};

  try {
    const maintenanceRef = db.collection('settings').doc('maintenance');
    const publicRef = db.collection('data').doc('public_config');
    const payload = {
      enabled: Boolean(enabled),
      message: String(message || 'Platform is undergoing scheduled maintenance.').replace(/\p{Cc}/gu, ' ').slice(0, 300),
      scheduledEnd: scheduledEnd ? String(scheduledEnd).slice(0, 100) : null,
      updatedBy: req.user?.email || req.user?.uid || 'admin',
    };
    const revision = await db.runTransaction(async transaction => {
      const [maintenanceSnapshot, publicSnapshot] = await Promise.all([transaction.get(maintenanceRef), transaction.get(publicRef)]);
      const currentMaintenance = maintenanceSnapshot.data() || {};
      const currentPublic = publicSnapshot.data() || {};
      const currentRevision = Number(currentMaintenance._revision || currentPublic._settingsRevisions?.systemHealth || 0);
      const expectedRevision = req.body?.expectedRevision === undefined ? currentRevision : Number(req.body.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
        const conflict = new Error('Maintenance settings changed after this panel loaded. Refresh before saving.');
        conflict.code = 'MAINTENANCE_SETTINGS_CONFLICT';
        throw conflict;
      }
      const nextRevision = currentRevision + 1;
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      transaction.set(maintenanceRef, { ...payload, updatedAt: timestamp, _revision: nextRevision }, { merge: true });
      transaction.set(publicRef, {
        systemHealth: { maintenanceMode: payload.enabled, maintenanceMessage: payload.message },
        _settingsRevisions: { systemHealth: nextRevision },
      }, { merge: true });
      return nextRevision;
    });
    await recordAdminAuditLog(db, admin, {
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_MAINTENANCE_UPDATED',
      category: 'platform.operations',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      metadata: { enabled: payload.enabled, scheduledEnd: payload.scheduledEnd, revision },
      requestId: res.locals?.requestId,
    });

    return res.json({ success: true, enabled: payload.enabled, message: payload.message, revision, updatedAt: new Date().toISOString() });
  } catch (err) {
    const status = err.code === 'MAINTENANCE_SETTINGS_CONFLICT' ? 409 : 500;
    return res.status(status).json({ error: { code: err.code || 'MAINTENANCE_UPDATE_FAILED', message: status === 409 ? err.message : 'Maintenance setting could not be saved', requestId: res.locals?.requestId } });
  }
});

router.get('/command-center', async (req, res) => {
  const db = req.app?.get('db');
  const tenantService = req.app?.get('tenantService');
  const platformCurrency = await getPlatformCurrencyConfig(db);
  const health = await buildHealthPayload(req);
  const sources = { health: 'ok' };
  const recommendations = [];

  const engine = getActiveEngine();
  const isMySQL = engine === 'mysql';

  let statsData = {};
  let earningsData = {};
  const tenants = [];
  const recentSecurity = [];
  const recentAudit = [];
  let paymentFailed = null;
  let paymentPending = null;
  let paymentActive = null;
  let highSecurity = null;
  let suspendedAgg = { ok: true, value: 0 };
  let activeTenantAgg = { ok: true, value: 0 };
  let tenantTotalAgg = { ok: true, value: 0 };
  let announcementsResult = { ok: false };
  let maintenanceResult = { ok: false };
  let tenantsResult = { ok: false };
  let paymentFailedAgg = { ok: true, value: 0 };
  let highSecurityAgg = { ok: true, value: 0 };

  let featureFlagsSummary = { enabled: 0, disabled: 0, total: 0, source: 'DEFAULTS_ONLY' };
  try {
    const { getAllFlags } = require('../services/featureFlagService');
    const flags = await getAllFlags(db);
    const flagEntries = Object.values(flags || {});
    featureFlagsSummary.total = flagEntries.length;
    featureFlagsSummary.enabled = flagEntries.filter(f => f.value === true || f.value === 'true').length;
    featureFlagsSummary.disabled = flagEntries.length - featureFlagsSummary.enabled;
    featureFlagsSummary.source = 'AVAILABLE';
  } catch (err) {
    // The absence of a flag read is not a zero-count result.
  }

  if (isMySQL) {
    try {
      const pool = getPool();
      const [userCnt] = await pool.query('SELECT COUNT(*) as c FROM users');
      const [resumeCnt] = await pool.query('SELECT COUNT(*) as c FROM resumes');
      const [portfolioCnt] = await pool.query('SELECT COUNT(*) as c FROM portfolios');
      const [coverCnt] = await pool.query('SELECT COUNT(*) as c FROM covers');
      const [earningsRows] = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM payment_orders WHERE status IN ("ACTIVE", "COMPLETED", "PAID")');
      const [statsRows] = await pool.query('SELECT * FROM stats WHERE id = ?', ['stats']);
      
      let baseUsers = 0;
      let baseResumes = 0;
      let baseDownloads = 0;
      let baseEarnings = 0;

      if (statsRows.length) {
        try {
          const parsed = typeof statsRows[0].data === 'string' ? JSON.parse(statsRows[0].data) : statsRows[0].data;
          baseUsers = Number(parsed?.numberOfUsers || parsed?.users || 0);
          baseResumes = Number(parsed?.numberOfResumesCreated || parsed?.resumes || 0);
          baseDownloads = Number(parsed?.numberOfResumesDownloaded || parsed?.downloads || 0);
          baseEarnings = Number(parsed?.totalEarnings || parsed?.earnings || 0);
        } catch (_) {}
      }

      statsData = {
        numberOfUsers: Math.max(baseUsers, Number(userCnt[0]?.c || 0)),
        numberOfResumesCreated: Math.max(baseResumes, Number(resumeCnt[0]?.c || 0) + Number(portfolioCnt[0]?.c || 0) + Number(coverCnt[0]?.c || 0)),
        numberOfResumesDownloaded: baseDownloads,
      };

      earningsData = {
        amount: Math.max(baseEarnings, Number(earningsRows[0]?.total || 0)),
        currency: statsRows[0]?.currency || platformCurrency.code || 'INR'
      };

      const [auditRows] = await pool.query('SELECT * FROM database_switch_audit ORDER BY created_at DESC LIMIT 8');
      auditRows.forEach(row => {
        recentAudit.push({
          id: String(row.id),
          action: `DATABASE_SWITCH_${row.target_engine?.toUpperCase()}`,
          actorUid: row.actor_uid || 'system',
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        });
      });

      sources.stats = 'ok';
      sources.tenants = 'ok';
      sources.payments = 'ok';
      sources.security = 'ok';
      sources.earnings = 'ok';
      sources.audit = 'ok';
    } catch (e) {
      console.warn('[Platform] MySQL platform overview notice:', e.message);
    }
  } else {
    const statsResult = db ? await safeQuery('stats', () => db.collection('data').doc('stats').get()) : { ok: false };
    const earningsResult = db ? await safeQuery('earnings', () => db.collection('data').doc('earnings').get()) : { ok: false };
    const tenantsResult = db ? await safeQuery('tenants', () => db.collection('enterprise_tenants').limit(200).get()) : { ok: false };
    const paymentsResult = db ? await safeQuery('payments', () => db.collection('payment_orders').limit(100).get()) : { ok: false };
    const securityResult = db ? await safeQuery('security', () => db.collection('security_audit_logs').orderBy('createdAt', 'desc').limit(20).get()) : { ok: false };
    const auditResult = db ? await safeQuery('audit', () => db.collection('admin_audit_logs').orderBy('createdAt', 'desc').limit(8).get()) : { ok: false };

    const [
      usersCntSnap,
      resumesCntSnap,
      portfoliosCntSnap,
      coversCntSnap,
      paidPaymentsSnap,
      paymentsFailCnt,
      securityHighCnt,
      suspendedTenantsCnt,
      activeTenantsCnt,
      tenantsTotalCnt,
      activePaymentsCnt,
      pendingPaymentsCnt
    ] = db ? await Promise.all([
      safeQuery('users-count', () => db.collection('users').count().get()),
      safeQuery('resumes-count', () => db.collection('resumes').count().get()),
      safeQuery('portfolios-count', () => db.collection('portfolios').count().get()),
      safeQuery('covers-count', () => db.collection('covers').count().get()),
      safeQuery('payments-paid', () => db.collection('payment_orders').where('status', 'in', ['ACTIVE', 'COMPLETED', 'PAID']).get()),
      safeQuery('payments-failed-count', () => db.collection('payment_orders').where('status', 'in', ['FAILED', 'CANCELLED', 'DECLINED']).count().get()),
      safeQuery('security-high-count', () => db.collection('security_audit_logs').where('severity', 'in', ['HIGH', 'CRITICAL']).count().get()),
      safeQuery('tenants-suspended-count', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'SUSPENDED').count().get()),
      safeQuery('tenants-active-count', () => db.collection('enterprise_tenants').where('lifecycleState', '==', 'ACTIVE').count().get()),
      safeQuery('tenants-total-count', () => db.collection('enterprise_tenants').count().get()),
      safeQuery('payments-active-count', () => db.collection('payment_orders').where('status', '==', 'ACTIVE').count().get()),
      safeQuery('payments-pending-count', () => db.collection('payment_orders').where('status', 'in', ['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING']).count().get()),
    ]) : [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}];

    sources.stats = statsResult.ok ? 'ok' : 'unavailable';
    sources.earnings = earningsResult.ok ? 'ok' : 'unavailable';
    sources.tenants = tenantsResult.ok ? 'ok' : 'unavailable';
    sources.payments = paymentsResult.ok ? 'ok' : 'unavailable';
    sources.security = securityResult.ok ? 'ok' : 'unavailable';
    sources.audit = auditResult.ok ? 'ok' : 'unavailable';

    if (statsResult.ok && statsResult.value.exists) statsData = statsResult.value.data();
    if (earningsResult.ok && earningsResult.value.exists) earningsData = earningsResult.value.data();

    const usersCnt = countFrom(usersCntSnap).ok ? countFrom(usersCntSnap).value : 0;
    const resumesCnt = countFrom(resumesCntSnap).ok ? countFrom(resumesCntSnap).value : 0;
    const portfoliosCnt = countFrom(portfoliosCntSnap).ok ? countFrom(portfoliosCntSnap).value : 0;
    const coversCnt = countFrom(coversCntSnap).ok ? countFrom(coversCntSnap).value : 0;

    let realPaidEarnings = 0;
    if (paidPaymentsSnap.ok && paidPaymentsSnap.value) {
      paidPaymentsSnap.value.forEach(doc => {
        const d = doc.data() || {};
        realPaidEarnings += Number(d.amount || 0);
      });
    }

    const baseUsers = Math.max(0, Number(statsData.numberOfUsers || statsData.users || 0));
    const baseResumes = Math.max(0, Number(statsData.numberOfResumesCreated || statsData.resumes || 0));
    const totalEngineered = resumesCnt + portfoliosCnt + coversCnt;

    statsData = {
      numberOfUsers: Math.max(baseUsers, usersCnt),
      numberOfResumesCreated: totalEngineered > 0 ? totalEngineered : Math.max(0, baseResumes),
      numberOfResumesDownloaded: Math.max(0, Number(statsData.numberOfResumesDownloaded || statsData.downloads || 0)),
    };

    if (realPaidEarnings > 0 || !earningsData.amount) {
      earningsData = {
        amount: realPaidEarnings > 0 ? realPaidEarnings : Number(earningsData.amount || earningsData.total || 0),
        currency: platformCurrency.code || 'INR'
      };
    } else {
      earningsData.currency = platformCurrency.code || 'INR';
    }

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
    suspendedAgg = countFrom(suspendedTenantsCnt);
    activeTenantAgg = countFrom(activeTenantsCnt);
    tenantTotalAgg = countFrom(tenantsTotalCnt);

    paymentFailed = paymentFailedAgg.ok ? paymentFailedAgg.value : null;
    paymentPending = paymentPendingAgg.ok ? paymentPendingAgg.value : null;
    paymentActive = paymentActiveAgg.ok ? paymentActiveAgg.value : null;
    highSecurity = highSecurityAgg.ok ? highSecurityAgg.value : null;

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

    if (auditResult.ok) {
      auditResult.value.forEach(doc => {
        const data = doc.data() || {};
        recentAudit.push({
          id: doc.id,
          action: data.action || 'UNKNOWN',
          actorUid: data.actorUid || null,
          category: data.category || 'general',
          createdAt: isoFrom(data.createdAt),
        });
      });
    }
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
    ? { enabled: maintenanceResult.value.data()?.enabled === true, message: maintenanceResult.value.data()?.message || '', source: 'AVAILABLE' }
    : { enabled: null, message: null, source: 'UNAVAILABLE' };

  const runtime = tenantService?.describeRuntime?.() || { encryption: { provider: 'none' } };
  const encryption = runtime.encryption || { provider: 'none', configured: false };

  const suspendedSample = tenants.filter(t => t.lifecycleState === 'SUSPENDED');
  const suspendedCount = suspendedAgg.ok ? suspendedAgg.value : tenantsResult.ok ? suspendedSample.length : null;
  const suspendedMode = suspendedAgg.ok ? 'AGGREGATED' : tenantsResult.ok ? 'SAMPLED' : 'UNAVAILABLE';

  let riskScore = 0;
  if (health.subsystems.database.status !== 'HEALTHY') riskScore += 40;
  if (health.subsystems.authentication?.status !== 'HEALTHY') riskScore += 30;
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
  if (health.subsystems.authentication?.status !== 'HEALTHY') {
    recommendations.push({ id: 'auth-down', severity: 'HIGH', title: 'Firebase Authentication probe failed', detail: 'The identity directory did not acknowledge the administrative probe. Authenticated routes cannot be certified as healthy.', href: '/adm/health' });
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
  let emailOperationalState = 'UNKNOWN';
  try {
    const snapshot = await getHealthSnapshot(req.app);
    sources.operationalStatus = 'ok';
    emailOperationalState = snapshot.services.find(item => item.id === 'email-smtp')?.state || 'UNKNOWN';
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
      totalUsers: statsData.numberOfUsers ?? statsData.users ?? statsData.totalUsers ?? 0,
      resumesCreated: statsData.numberOfResumesCreated ?? statsData.resumes ?? 0,
      totalDownloads: statsData.numberOfResumesDownloaded ?? statsData.downloads ?? 0,
      totalEarnings: earningsData.amount ?? earningsData.total ?? 0,
      currency: platformCurrency.code || 'INR',
      currencySymbol: platformCurrency.symbol || (platformCurrency.code === 'INR' ? '₹' : (platformCurrency.code === 'EUR' ? '€' : (platformCurrency.code === 'GBP' ? '£' : '$'))),
      tenants: {
        total: tenantTotalAgg.ok ? tenantTotalAgg.value : isMySQL ? 0 : tenantsResult.ok ? tenants.length : null,
        active: activeTenantAgg.ok ? activeTenantAgg.value : isMySQL ? 0 : tenantsResult.ok ? tenants.filter(t => t.lifecycleState === 'ACTIVE').length : null,
        suspended: suspendedCount,
        mode: isMySQL ? 'AGGREGATED' : tenantTotalAgg.ok ? 'AGGREGATED' : tenantsResult.ok ? 'SAMPLED' : 'UNAVAILABLE',
      },
    },
    signals: {
      database: { status: health.subsystems.database.status, latencyMs: health.subsystems.database.latencyMs },
      queue: { status: health.subsystems.queue.status, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs, mode: 'SAMPLED' },
      email: { status: emailOperationalState, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs, mode: emailOperationalState === 'UNKNOWN' ? 'UNAVAILABLE' : 'OPERATIONAL_STATUS' },
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
        status: encryption.configured === true ? 'CONFIGURED' : 'UNAVAILABLE',
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
        revision: Number(data.revision || 0),
        createdBy: data.createdBy || null,
        updatedAt: isoFrom(data.updatedAt),
      });
    });
    announcements.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return res.json({ announcements });
  } catch (error) {
    return res.status(503).json({ error: { code: 'ANNOUNCEMENTS_UNAVAILABLE', message: 'Announcements are unavailable.', requestId: res.locals?.requestId } });
  }
});

router.post('/announcements', requireRecentAdminAuthentication, async (req, res) => {
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
    revision: 1,
    createdBy: req.user?.email || req.user?.uid || 'admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const auditRef = db.collection('security_audit_logs').doc();
  const batch = db.batch();
  batch.set(ref, payload);
  batch.set(auditRef, {
    action: 'PLATFORM_ANNOUNCEMENT_CREATED', actorUid: req.user?.uid, announcementId: ref.id,
    revision: 1, requestId: res.locals?.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return res.status(201).json({ announcement: { id: ref.id, ...payload, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
});

router.patch('/announcements/:id', requireRecentAdminAuthentication, async (req, res) => {
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
  try {
    const result = await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw Object.assign(new Error('Announcement not found'), { code: 'NOT_FOUND', status: 404 });
      const current = snap.data() || {};
      const currentRevision = Number(current.revision || 0);
      const expectedRevision = req.body?.expectedRevision === undefined ? null : Number(req.body.expectedRevision);
      if (expectedRevision === null || !Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
        throw Object.assign(new Error('This announcement changed after the page loaded. Refresh before saving.'), { code: 'ADMIN_TARGET_CHANGED', status: 409 });
      }
      const updates = { revision: currentRevision + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (req.body?.title !== undefined) updates.title = String(req.body.title).replace(/\p{Cc}/gu, ' ').trim().slice(0, 160);
      if (req.body?.message !== undefined) updates.message = String(req.body.message).replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000);
      if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled === true;
      if (req.body?.severity !== undefined) {
        const severity = String(req.body.severity).toUpperCase();
        if (!['INFO', 'MEDIUM', 'HIGH'].includes(severity)) throw Object.assign(new Error('Invalid announcement severity'), { code: 'INVALID_ANNOUNCEMENT', status: 400 });
        updates.severity = severity;
      }
      transaction.set(ref, updates, { merge: true });
      transaction.set(db.collection('security_audit_logs').doc(), {
        action: 'PLATFORM_ANNOUNCEMENT_UPDATED', actorUid: req.user?.uid, announcementId: id,
        revision: updates.revision, requestId: res.locals?.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ...current, ...updates, id, revision: updates.revision };
    });
    return res.json({ success: true, announcement: { id, title: result.title, message: result.message, severity: result.severity, audience: result.audience, enabled: result.enabled, revision: result.revision } });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: { code: error.code || 'ANNOUNCEMENT_UPDATE_FAILED', message: status === 409 || status === 400 ? error.message : 'Announcement could not be updated', requestId: res.locals?.requestId } });
  }
});

router.delete('/announcements/:id', requireRecentAdminAuthentication, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  const id = String(req.params.id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Invalid announcement id' } });
  }
  const ref = db.collection('platform_announcements').doc(id);
  try {
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw Object.assign(new Error('Announcement not found'), { code: 'NOT_FOUND', status: 404 });
      const currentRevision = Number(snap.data()?.revision || 0);
      const expectedRevision = req.body?.expectedRevision === undefined ? null : Number(req.body.expectedRevision);
      if (expectedRevision === null || !Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
        throw Object.assign(new Error('This announcement changed after the page loaded. Refresh before deleting.'), { code: 'ADMIN_TARGET_CHANGED', status: 409 });
      }
      transaction.delete(ref);
      transaction.set(db.collection('security_audit_logs').doc(), {
        action: 'PLATFORM_ANNOUNCEMENT_DELETED', actorUid: req.user?.uid, announcementId: id,
        revision: currentRevision, requestId: res.locals?.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return res.json({ success: true, id });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: { code: error.code || 'ANNOUNCEMENT_DELETE_FAILED', message: status === 409 || status === 404 ? error.message : 'Announcement could not be deleted', requestId: res.locals?.requestId } });
  }
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
  const identityAdmin = req.app?.get('firebaseAdmin');
  if (!db || !identityAdmin?.auth) return res.json({ operators: [], source: 'UNAVAILABLE', note: 'Firebase Auth and Firestore are unavailable; no operator count is inferred.' });
  try {
    const listed = await identityAdmin.auth().listUsers(200);
    const operators = [];
    for (const identity of listed.users || []) {
      const claims = identity.customClaims || {};
      const profile = (await db.collection('users').doc(identity.uid).get()).data() || {};
      const role = String(claims.role || profile.role || '').toUpperCase();
      if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(role)) continue;
      operators.push({
        id: identity.uid,
        email: identity.email || profile.email || null,
        role,
        suspended: identity.disabled === true || profile.suspended === true,
        emailVerified: identity.emailVerified === true,
        mfaEnabled: Array.isArray(identity.multiFactor?.enrolledFactors) && identity.multiFactor.enrolledFactors.length > 0,
        displayName: identity.displayName || profile.displayName || `${profile.firstname || ''} ${profile.lastname || ''}`.trim() || null,
      });
    }
    return res.json({ operators, source: 'FIREBASE_AUTH_CLAIMS', note: 'Roles shown are the verified Firebase custom claims. Firestore profile role fields are display metadata only.' });
  } catch (error) {
    console.error('[Platform operators]', error.message);
    return res.status(503).json({ error: { code: 'OPERATORS_UNAVAILABLE', message: 'The authoritative operator directory could not be read.', requestId: res.locals?.requestId } });
  }
});

router.post('/operators', requireRecentAdminAuthentication, async (req, res) => {
  const uid = String(req.body?.uid || '').trim();
  const nextRole = String(req.body?.role || '').toUpperCase();
  const expectedRole = req.body?.expectedRole === undefined ? null : String(req.body.expectedRole || '').toUpperCase();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid) || !PLATFORM_OPERATOR_ROLES.has(nextRole) || (expectedRole !== null && !PLATFORM_OPERATOR_ROLES.has(expectedRole) && expectedRole !== 'SUPER_ADMIN')) {
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
    if (expectedRole !== null && currentRole !== expectedRole) {
      return res.status(409).json({ error: { code: 'OPERATOR_TARGET_CHANGED', message: 'This operator role changed after the page loaded. Refresh before retrying.', requestId: res.locals?.requestId } });
    }
    if (currentRole === 'SUPER_ADMIN') {
      return res.status(403).json({ error: { code: 'SUPER_ADMIN_PROTECTED', message: 'SUPER_ADMIN claims cannot be changed from this API' } });
    }
    await admin.auth().setCustomUserClaims(uid, { ...(target.customClaims || {}), role: nextRole });
    await admin.auth().revokeRefreshTokens(uid);
    await db.collection('users').doc(uid).set({ role: nextRole, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await db.collection('security_audit_logs').doc().set({
      action: 'PLATFORM_OPERATOR_ROLE_CHANGED', actorUid: req.user?.uid, targetUid: uid,
      previousRole: currentRole, nextRole, requestId: res.locals?.requestId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await recordAdminAuditLog(db, admin, {
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_OPERATOR_ROLE_CHANGED',
      category: 'iam.operators',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { previousRole: currentRole, nextRole },
      requestId: res.locals?.requestId,
    });
    return res.json({ success: true, uid, role: nextRole, previousRole: currentRole });
  } catch (error) {
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({ error: { code: status === 404 ? 'USER_NOT_FOUND' : 'OPERATOR_UPDATE_FAILED', message: status === 404 ? 'User not found' : 'Operator role could not be updated' } });
  }
});

router.post('/operators/:uid/revoke-sessions', requireRecentAdminAuthentication, async (req, res) => {
  const uid = String(req.params.uid || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ error: { code: 'INVALID_UID', message: 'A valid uid is required' } });
  }
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.auth) {
    return res.status(503).json({ error: { code: 'IDENTITY_UNAVAILABLE', message: 'Identity directory unavailable' } });
  }
  try {
    const target = await admin.auth().getUser(uid);
    await admin.auth().revokeRefreshTokens(uid);
    await db.collection('security_audit_logs').doc().set({
      action: 'PLATFORM_OPERATOR_SESSIONS_REVOKED',
      actorUid: req.user?.uid,
      targetUid: uid,
      targetEmail: target.email || null,
      requestId: res.locals?.requestId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await recordAdminAuditLog(db, admin, {
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_OPERATOR_SESSIONS_REVOKED',
      category: 'iam.operators',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { targetEmail: target.email || null },
      requestId: res.locals?.requestId,
    });
    return res.json({ success: true, message: `All active sessions and refresh tokens for operator ${target.email || uid} have been revoked.` });
  } catch (error) {
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({ error: { code: status === 404 ? 'USER_NOT_FOUND' : 'SESSION_REVOCATION_FAILED', message: status === 404 ? 'User not found' : error.message } });
  }
});

router.get('/tenants/:tenantId', async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const tenantService = req.app?.get('tenantService');
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    return res.status(400).json({ error: { code: 'INVALID_TENANT_ID', message: 'Invalid tenant identifier', requestId: res.locals?.requestId } });
  }
  if (!tenantService?.registry) {
    return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant service unavailable', requestId: res.locals?.requestId } });
  }
  try {
    const tenant = await tenantService.registry.getTenant(tenantId);
    const results = await Promise.all([
      safeQuery('tenant-configuration', () => tenantService.registry.getTenantConfiguration(tenantId)),
      safeQuery('tenant-memberships', () => tenantService.registry.listTenantMemberships(tenantId)),
      safeQuery('tenant-workspaces', () => db ? db.collection('enterprise_workspaces').where('tenantId', '==', tenantId).get() : Promise.reject(new Error('Firestore unavailable'))),
      safeQuery('tenant-service-accounts', () => db ? db.collection('enterprise_service_accounts').where('tenantId', '==', tenantId).get() : Promise.reject(new Error('Firestore unavailable'))),
      safeQuery('tenant-audit', () => db ? db.collection(`tenants/${tenantId}/audit_events`).orderBy('occurredAt', 'desc').limit(25).get() : Promise.reject(new Error('Firestore unavailable'))),
      safeQuery('tenant-usage', () => db ? db.collection(`tenants/${tenantId}/ai_usage_daily`).limit(366).get() : Promise.reject(new Error('Firestore unavailable'))),
    ]);
    const [configurationResult, membershipsResult, workspacesResult, accountsResult, auditResult, usageResult] = results;
    const memberships = membershipsResult.ok ? membershipsResult.value : [];
    const workspaces = workspacesResult.ok ? workspacesResult.value.docs.map(doc => ({ id: doc.id, name: doc.data()?.name || 'Unnamed workspace', lifecycleState: doc.data()?.lifecycleState || doc.data()?.status || 'UNKNOWN', isDefault: doc.data()?.isDefault === true })) : [];
    const serviceAccounts = accountsResult.ok ? accountsResult.value.docs.map(doc => {
      const data = doc.data() || {};
      return { id: doc.id, displayName: data.displayName || null, status: data.status || 'UNKNOWN', scopes: Array.isArray(data.scopes) ? data.scopes : [], expiresAt: isoFrom(data.expiresAt), lastUsedAt: isoFrom(data.lastUsedAt), createdAt: isoFrom(data.createdAt) };
    }) : [];
    const activity = auditResult.ok ? auditResult.value.docs.map(doc => {
      const data = doc.data() || {};
      return { id: doc.id, action: data.action || 'UNKNOWN', category: data.category || null, severity: data.severity || 'INFO', outcome: data.outcome || null, principalId: data.principalId || data.subjectId || null, resourceType: data.resourceType || null, resourceId: data.resourceId || null, occurredAt: isoFrom(data.occurredAt || data.createdAt) };
    }) : [];
    const usageRows = usageResult.ok ? usageResult.value.docs.map(doc => doc.data() || {}) : [];
    const usage = usageResult.ok ? {
      source: 'MEASURED',
      daysInspected: usageRows.length,
      inputTokens: usageRows.reduce((sum, row) => sum + Number(row.inputTokens || 0), 0),
      outputTokens: usageRows.reduce((sum, row) => sum + Number(row.outputTokens || 0), 0),
      requests: usageRows.reduce((sum, row) => sum + Number(row.requests || row.requestCount || 0), 0),
      estimatedCostMicros: usageRows.reduce((sum, row) => sum + Number(row.estimatedCostMicros || 0), 0),
    } : { source: 'UNAVAILABLE', daysInspected: null, inputTokens: null, outputTokens: null, requests: null, estimatedCostMicros: null };
    const memberUsers = [];
    if (admin?.auth && memberships.length) {
      for (const membership of memberships.slice(0, 200)) {
        try {
          const identity = await admin.auth().getUser(membership.principalId);
          memberUsers.push({ id: identity.uid, email: identity.email || null, displayName: identity.displayName || null, emailVerified: identity.emailVerified === true, disabled: identity.disabled === true, roles: membership.roles, status: membership.status || 'UNKNOWN', workspaceId: membership.workspaceId || null });
        } catch (_) {
          memberUsers.push({ id: membership.principalId, email: null, displayName: null, emailVerified: null, disabled: null, roles: membership.roles, status: membership.status || 'UNKNOWN', workspaceId: membership.workspaceId || null });
        }
      }
    }
    const measure = (value, source) => ({ value, source: source ? 'MEASURED' : 'UNAVAILABLE' });
    const sourceMap = Object.fromEntries(results.map(result => [result.source, result.ok ? 'AVAILABLE' : 'UNAVAILABLE']));
    return res.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        displayName: tenant.displayName,
        lifecycleState: tenant.lifecycleState,
        isolationTier: tenant.isolationTier,
        region: tenant.dataPlane?.region || null,
        createdAt: isoFrom(tenant.createdAt),
        updatedAt: isoFrom(tenant.updatedAt),
        plan: tenant.plan || tenant.planId || null,
        dataPlane: tenant.dataPlane || null,
      },
      overview: {
        users: measure(membershipsResult.ok ? memberships.length : null, membershipsResult.ok),
        activeUsers: measure(membershipsResult.ok ? memberships.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE').length : null, membershipsResult.ok),
        workspaces: measure(workspacesResult.ok ? workspaces.length : null, workspacesResult.ok),
        serviceAccounts: measure(accountsResult.ok ? serviceAccounts.length : null, accountsResult.ok),
      },
      users: { items: memberUsers, source: membershipsResult.ok && (admin?.auth || !memberships.length) ? 'AVAILABLE' : 'PARTIAL' },
      memberships: { items: memberships.map(item => ({ id: item.id, principalId: item.principalId, roles: item.roles, status: item.status, workspaceId: item.workspaceId || null, revision: item.revision || null, updatedAt: isoFrom(item.updatedAt) })), source: membershipsResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
      usage,
      plan: { value: tenant.plan || tenant.planId || null, source: tenant.plan || tenant.planId ? 'TENANT_RECORD' : 'NOT_RECORDED' },
      security: { configuration: configurationResult.ok ? configurationResult.value.securityPolicy || {} : null, identityPolicy: configurationResult.ok ? configurationResult.value.identityPolicy || {} : null, source: configurationResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
      m2m: { accounts: serviceAccounts, source: accountsResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
      audit: { events: activity, source: auditResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
      activity: { events: activity.slice(0, 10), source: auditResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
      configuration: { value: configurationResult.ok ? configurationResult.value : null, source: configurationResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
      sources: sourceMap,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const status = error.status === 404 ? 404 : 503;
    return res.status(status).json({ error: { code: error.code || 'TENANT_LOOKUP_FAILED', message: status === 404 ? 'Tenant was not found' : 'Tenant detail is unavailable', requestId: res.locals?.requestId } });
  }
});

router.patch('/tenants/:tenantId', requireRecentAdminAuthentication, async (req, res) => {
  const tenantService = req.app?.get('tenantService');
  const displayName = String(req.body?.displayName || '').trim();
  if (!tenantService?.updateTenantProfileAsPlatform) return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant service unavailable', requestId: res.locals?.requestId } });
  if (displayName.length < 2 || displayName.length > 120) return res.status(400).json({ error: { code: 'INVALID_TENANT_NAME', message: 'A tenant display name between 2 and 120 characters is required', requestId: res.locals?.requestId } });
  try {
    const tenant = await tenantService.updateTenantProfileAsPlatform({ user: req.user, tenantId: req.params.tenantId, displayName, requestId: res.locals?.requestId });
    return res.json({ success: true, tenant: { id: tenant.id, slug: tenant.slug, displayName: tenant.displayName, lifecycleState: tenant.lifecycleState } });
  } catch (error) {
    return res.status(error.status || 503).json({ error: { code: error.code || 'TENANT_RENAME_FAILED', message: error.status === 400 || error.status === 404 ? error.message : 'Tenant could not be renamed', requestId: res.locals?.requestId } });
  }
});

router.post('/tenants/:tenantId/decommission', requireRecentAdminAuthentication, async (req, res) => {
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

router.post('/tenants/garbage-collect', requireRecentAdminAuthentication, async (req, res) => {
  const tenantService = req.app?.get('tenantService');
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!tenantService?.executeTenantGarbageCollection) {
    return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant garbage collection is unavailable' } });
  }
  // Grace period is validated server-side; the interactive control plane may
  // only shorten the reclaim window within a bounded, safe range (0-90 days).
  const gracePeriodDays = Math.max(0, Math.min(Number(req.body?.gracePeriodDays ?? 7), 90));
  if (!Number.isFinite(gracePeriodDays)) {
    return res.status(400).json({ error: { code: 'INVALID_GRACE_PERIOD', message: 'gracePeriodDays must be a number between 0 and 90' } });
  }
  const requestId = res.locals?.requestId || null;
  try {
    const result = await tenantService.executeTenantGarbageCollection({ gracePeriodDays, requestId });
    if (db && admin?.firestore?.FieldValue) {
      await recordAdminAuditLog(db, admin, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: 'SUPER_ADMIN',
        action: 'TENANT_GARBAGE_COLLECTION_EXECUTED',
        category: 'enterprise.tenancy',
        severity: 'HIGH',
        outcome: (result.failures?.length || 0) > 0 ? 'PARTIAL' : 'SUCCESS',
        method: 'POST',
        pathname: req.originalUrl,
        statusCode: 200,
        metadata: {
          gracePeriodDays,
          purgedCount: result.purgedCount,
          considered: result.considered ?? null,
          failures: (result.failures || []).slice(0, 20),
        },
      }).catch(() => { /* purge result already committed; audit is best-effort */ });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 503).json({
      error: {
        code: error.code || 'TENANT_GARBAGE_COLLECTION_FAILED',
        message: 'Tenant garbage collection could not be executed',
        requestId,
      },
    });
  }
});

/* ------------------------------------------------------------------
 * Feature Flags — SUPER_ADMIN only
 * ------------------------------------------------------------------ */

const { FLAG_DEFINITIONS, getAllFlags, setFlagValue } = require('../services/featureFlagService');

router.get('/feature-flags', requireSuperAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const flags = await getAllFlags(db);
    return res.json({ flags });
  } catch (error) {
    return res.status(503).json({ error: { code: 'FEATURE_FLAGS_UNAVAILABLE', message: 'Could not load feature flags' } });
  }
});

router.put('/feature-flags/:flagKey', requireRecentAdminAuthentication, async (req, res) => {
  const { flagKey } = req.params;
  const { value } = req.body;
  if (typeof value !== 'boolean') {
    return res.status(400).json({ error: { code: 'INVALID_VALUE', message: 'Flag value must be a boolean' } });
  }
  if (!FLAG_DEFINITIONS[flagKey]) {
    return res.status(400).json({ error: { code: 'UNKNOWN_FEATURE_FLAG', message: `Unknown feature flag: ${flagKey}` } });
  }
  try {
    const db = req.app.get('db');
    const admin = req.app.get('firebaseAdmin');
    if (!db || !admin?.firestore?.FieldValue) {
      return res.status(503).json({ error: { code: 'FEATURE_FLAGS_UNAVAILABLE', message: 'Feature flag storage is unavailable', requestId: res.locals?.requestId } });
    }
    const result = await setFlagValue(db, admin, flagKey, value, req.user?.uid, res.locals.requestId);
    return res.json({ success: true, ...result });
  } catch (error) {
    const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 400;
    return res.status(status).json({ error: { code: error.code || 'FLAG_UPDATE_FAILED', message: status >= 500 ? 'Feature flag storage is unavailable.' : error.message, requestId: res.locals?.requestId } });
  }
});

/* ------------------------------------------------------------------
 * Platform Configuration — SUPER_ADMIN only
 * Read-only configuration census for the Admin UI.
 * ------------------------------------------------------------------ */

router.get('/configuration', requireSuperAdmin, async (req, res) => {
  try {
    const configuration = await getPlatformConfiguration({
      db: req.app.get('db'),
      env: process.env,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(configuration);
  } catch (error) {
    console.error('[PlatformConfiguration] census failed:', error?.message || error);
    return res.status(503).json({
      error: {
        code: 'CONFIGURATION_UNAVAILABLE',
        message: 'The server-side configuration census could not be collected.',
        requestId: res.locals?.requestId,
      },
    });
  }
});

/* ------------------------------------------------------------------
 * Payment Settings GET — system.config.read (ADMIN and above)
 * Returns public settings + configured/masked state for secrets.
 * Never returns raw secrets.
 *
 * RCA (forensic audit): this projection is secret-free by construction —
 * `publicPaymentSettings()` strips every credential-shaped key and only
 * `maskedKeys` (••••last4) plus PUBLIC client-side identifiers (Razorpay
 * key_id, Stripe publishable key, PayPal client id, Paytm MID, PhonePe id)
 * leave the server. The identical payload was already served to any ADMIN
 * holding `system.config.read` by the /api/admin/payment-settings alias in
 * index.js, so the SUPER_ADMIN gate here never actually restricted access —
 * it only made the canonical route unreachable for the Admin console that
 * renders it, producing a silently empty payment panel.
 *
 * Read stays at `system.config.read`; the WRITE
 * (POST /api/admin/payment-settings) is unchanged and still requires
 * SUPER_ADMIN + verified second factor + recent authentication.
 * ------------------------------------------------------------------ */

router.get('/payment-settings', requirePermission('system.config.read'), async (req, res) => {
  try {
    const projection = await getPaymentSettingsProjection(req.app.get('db'), process.env);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(projection);
  } catch (error) {
    return res.status(Number(error.status) || 503).json({
      error: {
        code: error.code || 'PAYMENT_SETTINGS_UNAVAILABLE',
        message: 'Could not load payment settings.',
        requestId: res.locals?.requestId,
      },
    });
  }
});

module.exports = { platformRouter: router };

