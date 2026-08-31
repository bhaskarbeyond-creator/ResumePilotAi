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
const { getPool } = require('../database/mysql');
const { getRepository } = require('../repositories');
const { getPlatformCurrencyConfig } = require('../services/platformCurrency');

const router = express.Router();

let cachedFrontendSha = null;
let frontendShaResolved = false;

/**
 * Frontend build identity, read from the built index.html that the API serves.
 *
 * The backend already reports its own commit SHA; without this the frontend half
 * of a release could only be verified by parsing HTML, which is exactly what
 * happens today and is why a stale CDN bundle can look like a correct deploy.
 * Exposing it over JSON makes the whole release identity checkable by a single
 * unauthenticated request. Returns null (never a guess) when the built file is
 * not deployed alongside the API.
 */
function getFrontendBuildSha() {
  if (frontendShaResolved) return cachedFrontendSha;
  frontendShaResolved = true;
  const candidates = [
    process.env.FRONTEND_INDEX_PATH,
    path.join(__dirname, '..', '..', 'domains', 'airesume.projectdemo.guru', 'public_html', 'index.html'),
    path.join(__dirname, '..', '..', 'public_html', 'index.html'),
    path.join(__dirname, '..', '..', 'dist', 'index.html'),
    path.join(__dirname, '..', 'public_html', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'public_html', 'index.html'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      const match = html.match(/data-build-sha=["']([0-9a-f]{40})["']/i) ||
                    html.match(/name=["']build-sha["']\s+data-build-sha=["']([0-9a-f]{40})["']/i) ||
                    html.match(/name=["']build-sha["']\s+content=["']([0-9a-f]{40})["']/i);
      if (match) {
        cachedFrontendSha = match[1].toLowerCase();
        return cachedFrontendSha;
      }
    } catch (_) { /* ignore and try the next candidate */ }
  }
  return null;
}

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

async function inspectOutbox() {
  const pool = getPool();
  const [notifications, enterprise] = await Promise.all([
    pool.query('SELECT state AS status, COUNT(*) AS total FROM notification_outbox GROUP BY state').then(([rows]) => rows),
    pool.query('SELECT status, COUNT(*) AS total FROM enterprise_outbox GROUP BY status').then(([rows]) => rows),
  ]);
  const stats = { active: 0, deadLetter: 0, completed: 0, status: 'OPERATIONAL', inspected: 0, sources: ['notification_outbox', 'enterprise_outbox'] };
  for (const row of [...notifications, ...enterprise]) {
    const count = Number(row.total || 0);
    stats.inspected += count;
    if (row.status === 'DEAD_LETTER') stats.deadLetter += count;
    else if (['DELIVERED', 'COMPLETED', 'REJECTED', 'SKIPPED_NO_RECIPIENT'].includes(row.status)) stats.completed += count;
    else stats.active += count;
  }
  if (stats.deadLetter > 0) stats.status = 'DEGRADED';
  return stats;
}

async function buildHealthPayload(req) {
  const admin = req.app?.get('firebaseAdmin');
  const tenantService = req.app?.get('tenantService');
  const startTime = Date.now();
  let database = { healthy: false, latencyMs: null, error: null };
  let authentication = { healthy: false, latencyMs: null, error: null };
  let queueStats = { active: null, deadLetter: null, completed: null, status: 'UNKNOWN', inspected: null };

  try {
    const started = Date.now();
    await getPool().query('SELECT 1 AS alive');
    database = { healthy: true, latencyMs: Date.now() - started, error: null };
  } catch (error) {
    database.error = String(error.message || error).slice(0, 200);
  }
  if (admin?.auth) {
    try {
      const started = Date.now();
      await admin.auth().listUsers(1);
      authentication = { healthy: true, latencyMs: Date.now() - started, error: null };
    } catch (error) {
      authentication.error = String(error.message || error).slice(0, 200);
    }
  }
  try { queueStats = await inspectOutbox(); }
  catch (error) { queueStats.error = String(error.message || error).slice(0, 200); }

  const memoryUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  let healthScore = 100;
  if (!database.healthy) healthScore -= 40;
  else if (database.latencyMs > 500) healthScore -= 10;
  if (!authentication.healthy) healthScore -= 30;
  else if (authentication.latencyMs > 1500) healthScore -= 10;
  if (queueStats.status === 'UNKNOWN') healthScore -= 20;
  else if (queueStats.deadLetter > 5) healthScore -= 20;
  else if (queueStats.deadLetter > 0) healthScore -= 10;
  if ((memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.9) healthScore -= 15;
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    status: healthScore >= 80 && database.healthy && authentication.healthy && queueStats.status !== 'UNKNOWN'
      ? 'HEALTHY' : healthScore >= 50 ? 'DEGRADED' : 'UNHEALTHY',
    healthScore,
    scoreMethod: 'rule-based subsystem deductions; not a performance benchmark',
    commitSha: getCommitSha(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startTime,
    subsystems: {
      database: { status: database.healthy ? 'HEALTHY' : 'DOWN', latencyMs: database.latencyMs, provider: 'MariaDB', error: database.error },
      authentication: { status: authentication.healthy ? 'HEALTHY' : 'DOWN', latencyMs: authentication.latencyMs, provider: 'Firebase Authentication', error: authentication.error },
      queue: {
        status: queueStats.status, activeJobs: queueStats.active, deadLetterJobs: queueStats.deadLetter,
        completedJobs: queueStats.completed, inspected: queueStats.inspected, sources: queueStats.sources || [], error: queueStats.error || null,
      },
      runtime: {
        nodeVersion: process.version, platform: process.platform, arch: process.arch, pid: process.pid,
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024), rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        systemFreeMemMb: Math.round(freeMem / 1024 / 1024), systemTotalMemMb: Math.round(totalMem / 1024 / 1024),
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
  const commitSha = getCommitSha();
  const frontendBuildSha = getFrontendBuildSha();
  return res.json({
    commitSha,
    frontendBuildSha,
    service: 'resumepilot-backend',
    apiVersion: 'platform-v2',
    // Aggregated so a caller does not have to infer release alignment by hand.
    releaseIdentity: {
      backendSha: commitSha,
      frontendSha: frontendBuildSha,
      aligned: Boolean(frontendBuildSha) && frontendBuildSha === commitSha,
      verified: Boolean(frontendBuildSha) && frontendBuildSha === commitSha,
    },
  });
});

// Public platform and module configuration (Public, 100% MariaDB-backed)
router.get('/public-config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const repo = getRepository();
  try {
    const [settings, websiteMeta] = await Promise.all([
      repo.getSetting('public_config'),
      repo.getSetting('website_meta'),
    ]);
    if (!settings || typeof settings !== 'object') {
      return res.status(503).json({
        error: { code: 'PUBLIC_CONFIGURATION_NOT_INITIALIZED', message: 'Public configuration is not initialized in MariaDB.', requestId: res.locals?.requestId },
      });
    }
    return res.json({
      ...settings,
      website: websiteMeta && typeof websiteMeta === 'object' ? websiteMeta : undefined,
      _settingsSource: 'mariadb',
    });
  } catch (_error) {
    return res.status(503).json({
      error: { code: 'PUBLIC_CONFIGURATION_UNAVAILABLE', message: 'Public configuration could not be loaded.', requestId: res.locals?.requestId },
    });
  }
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

    const auditRows = await getRepository().getAdminAuditLogs({ limit: 50 });
    const needle = serviceId.replace(/-/g, '');
    const auditEvents = auditRows.filter(data => {
      const haystack = `${data.action || ''} ${data.category || ''} ${data.pathname || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      return haystack.includes(needle) || relatedEndpoints.some(endpoint => String(data.pathname || '').startsWith(endpoint.path.split(':')[0]));
    }).slice(0, 10).map(data => ({
      id: data.id,
      action: data.action || 'UNKNOWN',
      actorEmail: data.actorEmail || null,
      severity: data.severity || 'INFO',
      outcome: data.outcome || null,
      statusCode: data.statusCode ?? null,
      pathname: data.pathname || null,
      createdAt: isoFrom(data.createdAt),
    }));
    const auditSource = 'mariadb';

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
  try {
    const result = await runServiceTest(req.app, serviceId);
    resetHealthCache();
    const audit = await recordAdminAuditLog({
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
  try {
    resetHealthCache();
    const elevated = isSuperAdmin(req.user);
    const snapshot = await getHealthSnapshot(req.app, { force: true });
    const audit = await recordAdminAuditLog({
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

router.get('/overview', async (_req, res) => {
  try {
    const pool = getPool();
    const [[userRows], [resumeRows], [earningsRows], [tenantRows], platformCurrency] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) AS total FROM resumes WHERE deleted_at IS NULL'),
      pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payment_orders WHERE status IN ('ACTIVE', 'COMPLETED', 'PAID')"),
      pool.query("SELECT COUNT(*) AS total, SUM(lifecycleState = 'ACTIVE') AS active, SUM(lifecycleState = 'SUSPENDED') AS suspended FROM enterprise_tenants"),
      getPlatformCurrencyConfig(null),
    ]);
    return res.json({
      kpis: {
        totalUsers: Number(userRows[0]?.total || 0),
        resumesCreated: Number(resumeRows[0]?.total || 0),
        totalDownloads: null,
        totalEarningsCents: Number(earningsRows[0]?.total || 0),
        currency: platformCurrency.code || 'INR',
        currencySymbol: platformCurrency.symbol || '₹',
        tenants: {
          total: Number(tenantRows[0]?.total || 0),
          active: Number(tenantRows[0]?.active || 0),
          suspended: Number(tenantRows[0]?.suspended || 0),
          source: 'MARIADB_AUTHORITATIVE',
        },
      },
      sources: { stats: 'MARIADB', earnings: 'MARIADB', tenants: 'MARIADB', downloads: 'NOT_RECORDED' },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PlatformOverview] Query failed:', error?.message || error);
    return res.status(503).json({ error: { code: 'OVERVIEW_UNAVAILABLE', message: 'Platform overview is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/queues', async (_req, res) => {
  try {
    const pool = getPool();
    const [[notificationRows], [enterpriseRows]] = await Promise.all([
      pool.query(`SELECT id, channel, recipient, template_type, state, attempt_count, last_error, created_at, updated_at
                  FROM notification_outbox ORDER BY created_at DESC LIMIT 50`),
      pool.query(`SELECT id, jobType, tenantId, status, attemptCount, lastError, created_at, updated_at
                  FROM enterprise_outbox ORDER BY created_at DESC LIMIT 50`),
    ]);
    const maskEmail = value => {
      const [local, domain] = String(value || '').split('@');
      return local && domain ? `${local.slice(0, 2)}***@${domain}` : null;
    };
    const jobs = [
      ...notificationRows.map(row => ({
        id: row.id, queue: 'notification', channel: row.channel || 'email', recipient: maskEmail(row.recipient),
        templateType: row.template_type, state: row.state, attemptCount: Number(row.attempt_count || 0),
        lastError: row.last_error ? String(row.last_error).slice(0, 200) : null,
        createdAt: isoFrom(row.created_at), updatedAt: isoFrom(row.updated_at),
      })),
      ...enterpriseRows.map(row => ({
        id: row.id, queue: 'enterprise', channel: 'tenant_job', recipient: `tenant:${String(row.tenantId).slice(0, 8)}…`,
        templateType: row.jobType, state: row.status, attemptCount: Number(row.attemptCount || 0),
        lastError: row.lastError ? String(row.lastError).slice(0, 200) : null,
        createdAt: isoFrom(row.created_at), updatedAt: isoFrom(row.updated_at),
      })),
    ].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    const deadLetterCount = jobs.filter(job => job.state === 'DEAD_LETTER').length;
    const pendingCount = jobs.filter(job => ['NOTIFICATION_QUEUED', 'QUEUED', 'PROCESSING', 'RETRYING'].includes(job.state)).length;
    const successCount = jobs.filter(job => ['DELIVERED', 'COMPLETED', 'REJECTED', 'SKIPPED_NO_RECIPIENT'].includes(job.state)).length;
    return res.json({
      summary: { totalInspected: jobs.length, deadLetterCount, pendingCount, successCount, source: 'MARIADB_OUTBOXES', sampled: true },
      jobs,
    });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'QUEUE_QUERY_UNAVAILABLE', message: 'Queue telemetry is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.post('/queues/retry', requireRecentAdminAuthentication, async (req, res) => {
  const jobId = String(req.body?.jobId || '');
  const queue = String(req.body?.queue || 'notification').toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || queue !== 'notification') {
    return res.status(400).json({
      error: { code: 'INVALID_RETRY_TARGET', message: 'Specify one notification dead-letter job. Enterprise jobs must be replayed from their tenant context.', requestId: res.locals?.requestId },
    });
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `UPDATE notification_outbox
       SET state = 'NOTIFICATION_QUEUED', attempt_count = 0, next_attempt_at = ?,
           last_error = NULL, lease_owner = NULL, lease_expires_at = 0
       WHERE id = ? AND state = 'DEAD_LETTER'`,
      [Date.now(), jobId]
    );
    if (Number(result.affectedRows || 0) !== 1) {
      await connection.rollback();
      return res.status(404).json({ error: { code: 'DEAD_LETTER_NOT_FOUND', message: 'Notification dead-letter job was not found.', requestId: res.locals?.requestId } });
    }
    await connection.query(
      `INSERT INTO admin_audit_logs
       (id, actor_uid, actor_email, actor_role, action, category, severity, outcome, method, pathname, status_code, resource_type, resource_id, metadata, request_id)
       VALUES (?, ?, ?, 'SUPER_ADMIN', 'PLATFORM_QUEUE_RETRY', 'platform.queue', 'HIGH', 'SUCCESS', 'POST', ?, 200, 'notification_job', ?, ?, ?)`,
      [require('crypto').randomUUID(), req.user?.uid || 'unknown', req.user?.email || null,
        req.originalUrl, jobId, JSON.stringify({ queue }), res.locals?.requestId || null]
    );
    await connection.commit();
    return res.json({ success: true, retriedCount: 1, jobId, queue });
  } catch (_error) {
    await connection.rollback().catch(() => {});
    return res.status(503).json({ error: { code: 'RETRY_FAILED', message: 'Queue retry could not be completed.', requestId: res.locals?.requestId } });
  } finally {
    connection.release();
  }
});

router.post('/queues/purge', requireRecentAdminAuthentication, (_req, res) => res.status(410).json({
  error: { code: 'DEAD_LETTER_PURGE_RETIRED', message: 'Dead letters are retained for investigation and may not be bulk-deleted.' },
}));

router.get('/maintenance', async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      "SELECT data, revision, updated_at FROM system_settings WHERE category = 'maintenance'"
    );
    if (!rows.length) {
      return res.json({
        enabled: false, available: true, configurationState: 'DEFAULT',
        message: 'Platform is operating normally.', scheduledEnd: null,
        updatedBy: null, updatedAt: null, revision: 0, source: 'APPLICATION_DEFAULT',
      });
    }
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data || {});
    return res.json({
      enabled: data.enabled === true,
      available: true,
      configurationState: 'AVAILABLE',
      message: data.message || 'Platform is operating normally.',
      scheduledEnd: data.scheduledEnd || null,
      updatedBy: data.updatedBy || null,
      updatedAt: isoFrom(rows[0].updated_at),
      revision: Number(rows[0].revision || 0),
      source: 'MARIADB_SYSTEM_SETTINGS',
    });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'MAINTENANCE_STATUS_UNAVAILABLE', message: 'Maintenance status is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.post('/maintenance', requireRecentAdminAuthentication, async (req, res) => {
  const { enabled, message, scheduledEnd } = req.body || {};
  const expectedRevision = Number(req.body?.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return res.status(400).json({ error: { code: 'EXPECTED_REVISION_REQUIRED', message: 'A non-negative expectedRevision is required.', requestId: res.locals?.requestId } });
  }
  const payload = {
    enabled: enabled === true,
    message: String(message || (enabled ? 'Platform is undergoing scheduled maintenance.' : 'Platform is operating normally.')).replace(/\p{Cc}/gu, ' ').slice(0, 300),
    scheduledEnd: scheduledEnd ? String(scheduledEnd).slice(0, 100) : null,
    updatedBy: req.user?.email || req.user?.uid || 'admin',
  };
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT revision FROM system_settings WHERE category = 'maintenance' FOR UPDATE");
    const currentRevision = Number(rows[0]?.revision || 0);
    if (currentRevision !== expectedRevision) {
      await connection.rollback();
      return res.status(409).json({ error: { code: 'ADMIN_TARGET_CHANGED', message: 'Maintenance settings changed after the page loaded.', requestId: res.locals?.requestId } });
    }
    const nextRevision = currentRevision + 1;
    await connection.query(
      `INSERT INTO system_settings (category, data, revision, updated_at)
       VALUES ('maintenance', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
      [JSON.stringify(payload), nextRevision]
    );
    await connection.query(
      `INSERT INTO admin_audit_logs
       (id, actor_uid, actor_email, actor_role, action, category, severity, outcome, method, pathname, status_code, resource_type, resource_id, metadata, request_id)
       VALUES (?, ?, ?, 'SUPER_ADMIN', 'PLATFORM_MAINTENANCE_UPDATED', 'platform.operations', 'HIGH', 'SUCCESS', 'POST', ?, 200, 'system_setting', 'maintenance', ?, ?)`,
      [require('crypto').randomUUID(), req.user?.uid || 'unknown', req.user?.email || null,
        req.originalUrl, JSON.stringify({ enabled: payload.enabled, scheduledEnd: payload.scheduledEnd, revision: nextRevision }), res.locals?.requestId || null]
    );
    await connection.commit();
    return res.json({ success: true, ...payload, revision: nextRevision, updatedAt: new Date().toISOString() });
  } catch (_error) {
    await connection.rollback().catch(() => {});
    return res.status(503).json({ error: { code: 'MAINTENANCE_UPDATE_FAILED', message: 'Maintenance settings could not be persisted.', requestId: res.locals?.requestId } });
  } finally {
    connection.release();
  }
});

router.get('/command-center', async (req, res) => {
  try {
    const pool = getPool();
    const health = await buildHealthPayload(req);
    const [
      [countRows], [earningsRows], [paymentRows], [securityCountRows], [securityRows],
      [tenantRows], [attentionTenantRows], [auditRows], [announcementRows], [settingRows],
      [statsRows],
      platformCurrency,
    ] = await Promise.all([
      pool.query(`SELECT
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
        (SELECT COUNT(*) FROM resumes WHERE deleted_at IS NULL) AS resumes,
        (SELECT COUNT(*) FROM portfolios) AS portfolios,
        (SELECT COUNT(*) FROM covers) AS covers`),
      pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payment_orders WHERE status IN ('ACTIVE','COMPLETED','PAID')"),
      pool.query('SELECT status, COUNT(*) AS total FROM payment_orders GROUP BY status'),
      pool.query("SELECT COUNT(*) AS total FROM security_audit_logs WHERE severity IN ('HIGH','CRITICAL')"),
      pool.query('SELECT id, action, actor_uid, severity, created_at FROM security_audit_logs ORDER BY created_at DESC LIMIT 6'),
      pool.query(`SELECT COUNT(*) AS total,
        SUM(lifecycleState = 'ACTIVE') AS active,
        SUM(lifecycleState = 'SUSPENDED') AS suspended
        FROM enterprise_tenants`),
      pool.query("SELECT id, displayName, slug, lifecycleState, isolationTier FROM enterprise_tenants WHERE lifecycleState <> 'ACTIVE' ORDER BY updated_at DESC LIMIT 8"),
      pool.query('SELECT id, action, actor_uid, actor_email, category, severity, outcome, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 8'),
      pool.query('SELECT id, title, message, severity, enabled, updated_at FROM platform_announcements WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 5'),
      pool.query("SELECT category, data, revision, updated_at FROM system_settings WHERE category IN ('maintenance','stats')"),
      pool.query("SELECT data FROM stats WHERE id = 'global_stats' LIMIT 1").catch(() => [[]]),
      getPlatformCurrencyConfig(null),
    ]);

    const payments = { failed: 0, pending: 0, active: 0 };
    for (const row of paymentRows) {
      const status = String(row.status || '').toUpperCase();
      const total = Number(row.total || 0);
      if (['FAILED', 'CANCELLED', 'DECLINED'].includes(status)) payments.failed += total;
      else if (['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING'].includes(status)) payments.pending += total;
      else if (['ACTIVE', 'COMPLETED', 'PAID'].includes(status)) payments.active += total;
    }
    const settings = Object.fromEntries(settingRows.map(row => {
      let value = {};
      try { value = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch { value = {}; }
      return [row.category, { ...value, revision: Number(row.revision || 0), updatedAt: isoFrom(row.updated_at) }];
    }));
    const maintenance = settings.maintenance
      ? { enabled: settings.maintenance.enabled === true, message: settings.maintenance.message || '', source: 'MARIADB' }
      : { enabled: false, message: 'Platform is operating normally.', source: 'APPLICATION_DEFAULT' };
    let statsTableData = {};
    if (statsRows && statsRows[0] && statsRows[0].data) {
      try {
        statsTableData = typeof statsRows[0].data === 'string' ? JSON.parse(statsRows[0].data) : (statsRows[0].data || {});
      } catch { statsTableData = {}; }
    }
    const stats = { ...statsTableData, ...(settings.stats || {}) };
    const downloadsVal = stats.downloads ?? stats.documents_downloaded ?? stats.numberOfResumesDownloaded ?? null;
    const totalUsers = Number(countRows[0]?.users || 0);
    const resumesCreated = Number(countRows[0]?.resumes || 0) + Number(countRows[0]?.portfolios || 0) + Number(countRows[0]?.covers || 0);
    const highSecurity = Number(securityCountRows[0]?.total || 0);
    const suspendedCount = Number(tenantRows[0]?.suspended || 0);

    let operationalStatus = null;
    let operationalSource = 'unavailable';
    try {
      const snapshot = await getHealthSnapshot(req.app);
      operationalSource = 'mariadb-and-live-probes';
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
    } catch (error) {
      console.error('[Platform command center] Operational probe failed:', error?.message || error);
    }

    const tenantRuntime = req.app?.get('tenantService')?.describeRuntime?.() || {};
    const encryption = tenantRuntime.encryption || { provider: 'none', configured: false };
    let riskScore = 0;
    if (health.subsystems.database.status !== 'HEALTHY') riskScore += 40;
    if (health.subsystems.authentication.status !== 'HEALTHY') riskScore += 30;
    if (health.subsystems.queue.deadLetterJobs > 0) riskScore += Math.min(25, health.subsystems.queue.deadLetterJobs * 5);
    if (payments.failed > 0) riskScore += Math.min(20, payments.failed * 4);
    if (highSecurity > 0) riskScore += Math.min(20, highSecurity * 5);
    if (suspendedCount > 0) riskScore += 10;
    if (maintenance.enabled) riskScore += 15;
    if (encryption.configured !== true) riskScore += 5;
    riskScore = Math.min(100, riskScore);

    const recommendations = [];
    if (health.subsystems.database.status !== 'HEALTHY') recommendations.push({ id: 'db-down', severity: 'HIGH', title: 'MariaDB probe failed', detail: 'The authoritative application-data store is unavailable.', href: '/adm/operations' });
    if (health.subsystems.authentication.status !== 'HEALTHY') recommendations.push({ id: 'auth-down', severity: 'HIGH', title: 'Firebase Authentication probe failed', detail: 'The retained identity directory did not answer the administrative probe.', href: '/adm/health' });
    if (health.subsystems.queue.deadLetterJobs > 0) recommendations.push({ id: 'dlq', severity: 'HIGH', title: `${health.subsystems.queue.deadLetterJobs} dead-letter job(s)`, detail: 'Inspect failed notification and tenant jobs before individual replay.', href: '/adm/queues' });
    if (payments.failed > 0) recommendations.push({ id: 'payments', severity: 'MEDIUM', title: `${payments.failed} failed payment order(s)`, detail: 'Review the authoritative MariaDB payment ledger.', href: '/adm/settings?tab=ordersManagement' });
    if (highSecurity > 0) recommendations.push({ id: 'security', severity: 'HIGH', title: `${highSecurity} high-severity security event(s)`, detail: 'Inspect the durable security event stream.', href: '/adm/security' });
    if (suspendedCount > 0) recommendations.push({ id: 'suspended-tenants', severity: 'MEDIUM', title: `${suspendedCount} suspended tenant(s)`, detail: 'Confirm that each suspension is still required.', href: '/adm/tenants' });
    if (maintenance.enabled) recommendations.push({ id: 'maintenance', severity: 'HIGH', title: 'Maintenance mode is enabled', detail: maintenance.message, href: '/adm/operations' });
    if (!operationalStatus) recommendations.push({ id: 'health-unavailable', severity: 'HIGH', title: 'Operational probe unavailable', detail: 'No service state is inferred while the collector is unavailable.', href: '/adm/health' });
    if (!recommendations.length) recommendations.push({ id: 'no-observed-alerts', severity: 'INFO', title: 'No alert condition observed', detail: 'Continue monitoring; this is not a certification of untested paths.', href: '/adm/audit-logs' });

    let featureFlags = { enabled: null, disabled: null, total: null, source: 'UNAVAILABLE' };
    try {
      const { getAllFlags } = require('../services/featureFlagService');
      const values = Object.values(await getAllFlags());
      featureFlags = { enabled: values.filter(flag => flag.value === true).length, disabled: values.filter(flag => flag.value !== true).length, total: values.length, source: 'MARIADB' };
    } catch (error) {
      console.error('[Platform command center] Feature flag query failed:', error?.message || error);
    }

    return res.json({
      healthScore: health.healthScore,
      healthScoreMethod: health.scoreMethod,
      status: health.status,
      riskScore,
      riskScoreMethod: 'rule-based observed-signal deductions; not a benchmark',
      commitSha: health.commitSha,
      uptimeSeconds: health.uptimeSeconds,
      subsystems: health.subsystems,
      kpis: {
        totalUsers,
        resumesCreated,
        totalDownloads: Number.isFinite(Number(downloadsVal)) ? Number(downloadsVal) : null,
        totalEarnings: Number(earningsRows[0]?.total || 0) / 100,
        currency: platformCurrency.code || 'INR', currencySymbol: platformCurrency.symbol || '₹',
        tenants: { total: Number(tenantRows[0]?.total || 0), active: Number(tenantRows[0]?.active || 0), suspended: suspendedCount, mode: 'AGGREGATED' },
      },
      signals: {
        database: { status: health.subsystems.database.status, latencyMs: health.subsystems.database.latencyMs },
        queue: { status: health.subsystems.queue.status, deadLetter: health.subsystems.queue.deadLetterJobs, pending: health.subsystems.queue.activeJobs, mode: 'AGGREGATED' },
        payments: { status: payments.failed > 0 ? 'DEGRADED' : 'HEALTHY', ...payments, mode: 'AGGREGATED' },
        security: { status: highSecurity > 0 ? 'ATTENTION' : 'HEALTHY', highSeverity: highSecurity, recentCount: securityRows.length, mode: 'AGGREGATED' },
        encryption: { status: encryption.configured === true ? 'CONFIGURED' : 'UNAVAILABLE', provider: encryption.provider || 'none', securityLevel: encryption.securityLevel || null },
        featureFlags,
        deployment: { status: 'REPORTED', commitSha: health.commitSha, nodeVersion: health.subsystems.runtime.nodeVersion },
      },
      recommendations,
      operationalStatus,
      attentionTenants: attentionTenantRows.map(row => ({ id: row.id, displayName: row.displayName, slug: row.slug, lifecycleState: row.lifecycleState, isolationTier: row.isolationTier })),
      recentAudit: auditRows.map(row => ({ id: row.id, action: row.action, actorUid: row.actor_uid, actorEmail: row.actor_email, category: row.category, severity: row.severity, outcome: row.outcome, createdAt: isoFrom(row.created_at) })),
      recentSecurity: securityRows.map(row => ({ id: row.id, action: row.action, actorUid: row.actor_uid, severity: row.severity, createdAt: isoFrom(row.created_at) })),
      maintenance,
      announcements: announcementRows.map(row => ({ id: row.id, title: row.title, message: row.message, severity: row.severity, enabled: row.enabled === 1 || row.enabled === true, updatedAt: isoFrom(row.updated_at) })),
      sources: { database: 'MARIADB', authentication: 'FIREBASE_AUTH', operationalStatus: operationalSource },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Platform command center] Query failed:', error?.message || error);
    return res.status(503).json({ error: { code: 'COMMAND_CENTER_UNAVAILABLE', message: 'Command center telemetry is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/security-events', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  try {
    const [rows] = await getPool().query(
      `SELECT id, action, actor_uid, actor_email, actor_role, target_uid, category, severity,
              outcome, method, pathname, status_code, ip_address, user_agent, target_type,
              target_id, metadata, request_id, created_at
       FROM security_audit_logs ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    const events = rows.map(row => {
      let metadata = {};
      try {
        const parsed = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        metadata = (parsed && typeof parsed === 'object') ? parsed : {};
      } catch {
        metadata = {};
      }
      return {
        id: row.id,
        action: row.action || 'UNKNOWN',
        actorUid: row.actor_uid || null,
        actorEmail: row.actor_email || metadata.actorEmail || null,
        actorRole: row.actor_role || null,
        targetUid: row.target_uid || null,
        targetType: row.target_type || null,
        targetId: row.target_id || null,
        tenantId: metadata.tenantId || null,
        category: row.category || null,
        severity: row.severity || 'INFO',
        outcome: row.outcome || 'SUCCESS',
        method: row.method || null,
        pathname: row.pathname || metadata.pathname || null,
        statusCode: row.status_code || null,
        ipAddress: row.ip_address || null,
        userAgent: row.user_agent || null,
        requestId: row.request_id || null,
        metadata,
        createdAt: isoFrom(row.created_at),
      };
    });
    return res.json({ events, count: events.length, source: 'MARIADB' });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'SECURITY_EVENTS_UNAVAILABLE', message: 'Security events are unavailable.', requestId: res.locals?.requestId } });
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
  enterpriseObservability.setDurableStore(getPool());
  try {
    const [rows] = await getPool().query('SELECT * FROM enterprise_observability_rollups WHERE id = ?', ['global']);
    return res.json({
      metrics: enterpriseObservability.getMetrics(),
      durableMetrics: rows[0] || null,
      note: 'Percentiles are measured from server request durations in this process; no performance improvement is inferred.',
      commitSha: getCommitSha(), uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'OBSERVABILITY_UNAVAILABLE', message: 'Durable observability metrics are unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/backup-status', async (req, res) => {
  const runtime = req.app?.get('tenantService')?.describeRuntime?.() || {};
  try {
    const [rows] = await getPool().query(
      "SELECT id, actor_email, actor_uid, created_at FROM admin_audit_logs WHERE action = 'TENANT_DATA_EXPORTED' ORDER BY created_at DESC LIMIT 1"
    );
    return res.json({
      capability: {
        provider: 'mariadb-logical-tenant-export',
        available: runtime.dataPlaneConfigured === true,
        restoreModes: ['dry-run', 'apply'],
        scope: 'tenant-portability-not-physical-disaster-recovery',
      },
      lastRecordedExport: rows[0] ? { id: rows[0].id, createdAt: isoFrom(rows[0].created_at), actorEmail: rows[0].actor_email || rows[0].actor_uid || null } : null,
      productionBackupVerification: {
        status: process.env.DB_BACKUP_VERIFIED_AT && process.env.DB_BACKUP_REFERENCE ? 'REPORTED_BY_RELEASE_ENVIRONMENT' : 'NOT_VERIFIED',
        verifiedAt: process.env.DB_BACKUP_VERIFIED_AT || null,
        referenceConfigured: Boolean(process.env.DB_BACKUP_REFERENCE),
      },
    });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'BACKUP_STATUS_UNAVAILABLE', message: 'Backup status is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/payments-health', async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT status, COUNT(*) AS total FROM payment_orders GROUP BY status');
    const counts = { inspected: 0, ACTIVE: 0, FAILED: 0, PENDING: 0, REFUNDED: 0, OTHER: 0 };
    for (const row of rows) {
      const status = String(row.status || '').toUpperCase();
      const total = Number(row.total || 0);
      counts.inspected += total;
      if (['ACTIVE', 'COMPLETED', 'PAID'].includes(status)) counts.ACTIVE += total;
      else if (['FAILED', 'CANCELLED', 'DECLINED'].includes(status)) counts.FAILED += total;
      else if (['PENDING', 'PENDING_PAYMENT', 'PAYMENT_CREATED', 'REFUND_PENDING'].includes(status)) counts.PENDING += total;
      else if (status === 'REFUNDED') counts.REFUNDED += total;
      else counts.OTHER += total;
    }
    return res.json({ counts, status: counts.FAILED > 0 ? 'DEGRADED' : 'HEALTHY', source: 'MARIADB_PAYMENT_LEDGER' });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'PAYMENTS_HEALTH_UNAVAILABLE', message: 'Payment ledger health is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/search', async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 120);
  if (query.length < 2) return res.json({ users: [], tenants: [], query });
  try {
    const like = `%${query.replace(/[%_\\]/g, value => `\\${value}`)}%`;
    const [[users], [tenants]] = await Promise.all([
      getPool().query(
        `SELECT id, email, displayName, firstname, lastname, membership
         FROM users WHERE email LIKE ? ESCAPE '\\\\' OR displayName LIKE ? ESCAPE '\\\\' OR id = ? LIMIT 10`,
        [like, like, query]
      ),
      getPool().query(
        `SELECT id, slug, displayName, lifecycleState, isolationTier
         FROM enterprise_tenants WHERE displayName LIKE ? ESCAPE '\\\\' OR slug LIKE ? ESCAPE '\\\\' OR id = ? LIMIT 10`,
        [like, like, query]
      ),
    ]);
    return res.json({
      query,
      users: users.map(user => ({ id: user.id, email: user.email || null, displayName: user.displayName || `${user.firstname || ''} ${user.lastname || ''}`.trim() || null, membership: user.membership || null })),
      tenants,
      source: 'MARIADB',
    });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'PLATFORM_SEARCH_UNAVAILABLE', message: 'Platform search is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.get('/announcements', async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, title, message, severity, audience, enabled, revision, created_by, updated_at FROM platform_announcements ORDER BY updated_at DESC LIMIT 50'
    );
    const announcements = rows.map(row => ({
      id: row.id,
      title: row.title || '',
      message: row.message || '',
      severity: row.severity || 'INFO',
      audience: row.audience || 'ALL',
      enabled: row.enabled === 1 || row.enabled === true,
      revision: Number(row.revision || 0),
      createdBy: row.created_by || null,
      updatedAt: isoFrom(row.updated_at),
    }));
    return res.json({ announcements, source: 'MARIADB' });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'ANNOUNCEMENTS_UNAVAILABLE', message: 'Announcements are unavailable.', requestId: res.locals?.requestId } });
  }
});

router.post('/announcements', requireRecentAdminAuthentication, async (req, res) => {
  const pool = getPool();
  const title = String(req.body?.title || '').trim().slice(0, 160);
  const message = String(req.body?.message || '').trim().slice(0, 1000);
  if (title.length < 3 || message.length < 3) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Title and message are required' } });
  }
  const id = require('crypto').randomUUID();
  const severity = ['INFO', 'MEDIUM', 'HIGH'].includes(String(req.body?.severity || '').toUpperCase()) ? String(req.body.severity).toUpperCase() : 'INFO';
  const audience = String(req.body?.audience || 'ALL').slice(0, 40);
  const enabled = req.body?.enabled !== false;
  const createdBy = req.user?.email || req.user?.uid || 'admin';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO platform_announcements (id, title, message, severity, audience, enabled, revision, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [id, title, message, severity, audience, enabled ? 1 : 0, createdBy]
    );
    await conn.query(
      `INSERT INTO security_audit_logs (id, action, actor_uid, category, severity, metadata, request_id, created_at)
       VALUES (?, 'PLATFORM_ANNOUNCEMENT_CREATED', ?, 'platform.announcements', 'INFO', ?, ?, NOW())`,
      [require('crypto').randomUUID(), req.user?.uid || 'admin', JSON.stringify({ announcementId: id, revision: 1 }), res.locals?.requestId || null]
    );
    await conn.commit();
  } catch (_err) {
    await conn.rollback().catch(() => {});
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Announcement could not be persisted', requestId: res.locals?.requestId } });
  } finally {
    conn.release();
  }
  return res.status(201).json({ announcement: { id, title, message, severity, audience, enabled, revision: 1, createdBy, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
});

router.patch('/announcements/:id', requireRecentAdminAuthentication, async (req, res) => {
  const pool = getPool();
  const id = String(req.params.id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Invalid announcement id' } });
  }
  const expectedRevision = req.body?.expectedRevision === undefined ? null : Number(req.body.expectedRevision);
  if (expectedRevision === null || !Number.isInteger(expectedRevision)) {
    return res.status(400).json({ error: { code: 'INVALID_REVISION', message: 'expectedRevision is required' } });
  }
  const severityOverride = req.body?.severity !== undefined ? String(req.body.severity).toUpperCase() : null;
  if (severityOverride !== null && !['INFO', 'MEDIUM', 'HIGH'].includes(severityOverride)) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Invalid announcement severity' } });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT id, title, message, severity, audience, enabled, revision FROM platform_announcements WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Announcement not found' } });
    }
    const current = rows[0];
    const currentRevision = Number(current.revision || 0);
    if (expectedRevision !== currentRevision) {
      await conn.rollback();
      return res.status(409).json({ error: { code: 'ADMIN_TARGET_CHANGED', message: 'This announcement changed after the page loaded. Refresh before saving.' } });
    }
    const nextTitle = req.body?.title !== undefined ? String(req.body.title).replace(/\p{Cc}/gu, ' ').trim().slice(0, 160) : current.title;
    const nextMessage = req.body?.message !== undefined ? String(req.body.message).replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000) : current.message;
    const nextEnabled = req.body?.enabled !== undefined ? (req.body.enabled === true) : (current.enabled === 1 || current.enabled === true);
    const nextSeverity = severityOverride || current.severity;
    const nextRevision = currentRevision + 1;
    await conn.query(
      `UPDATE platform_announcements SET title = ?, message = ?, severity = ?, audience = ?, enabled = ?, revision = ?, updated_at = NOW() WHERE id = ?`,
      [nextTitle, nextMessage, nextSeverity, current.audience, nextEnabled ? 1 : 0, nextRevision, id]
    );
    await conn.query(
      `INSERT INTO security_audit_logs (id, action, actor_uid, category, severity, metadata, request_id, created_at)
       VALUES (?, 'PLATFORM_ANNOUNCEMENT_UPDATED', ?, 'platform.announcements', 'INFO', ?, ?, NOW())`,
      [require('crypto').randomUUID(), req.user?.uid || 'admin', JSON.stringify({ announcementId: id, revision: nextRevision }), res.locals?.requestId || null]
    );
    await conn.commit();
    return res.json({ success: true, announcement: { id, title: nextTitle, message: nextMessage, severity: nextSeverity, audience: current.audience, enabled: nextEnabled, revision: nextRevision } });
  } catch (_error) {
    await conn.rollback().catch(() => {});
    return res.status(503).json({ error: { code: 'ANNOUNCEMENT_UPDATE_FAILED', message: 'Announcement could not be updated', requestId: res.locals?.requestId } });
  } finally {
    conn.release();
  }
});

router.delete('/announcements/:id', requireRecentAdminAuthentication, async (req, res) => {
  const pool = getPool();
  const id = String(req.params.id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ error: { code: 'INVALID_ANNOUNCEMENT', message: 'Invalid announcement id' } });
  }
  const expectedRevision = req.body?.expectedRevision === undefined ? null : Number(req.body.expectedRevision);
  if (expectedRevision === null || !Number.isInteger(expectedRevision)) {
    return res.status(400).json({ error: { code: 'INVALID_REVISION', message: 'expectedRevision is required' } });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, revision FROM platform_announcements WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Announcement not found' } });
    }
    const currentRevision = Number(rows[0].revision || 0);
    if (expectedRevision !== currentRevision) {
      await conn.rollback();
      return res.status(409).json({ error: { code: 'ADMIN_TARGET_CHANGED', message: 'This announcement changed after the page loaded. Refresh before deleting.' } });
    }
    await conn.query('DELETE FROM platform_announcements WHERE id = ?', [id]);
    await conn.query(
      `INSERT INTO security_audit_logs (id, action, actor_uid, category, severity, metadata, request_id, created_at)
       VALUES (?, 'PLATFORM_ANNOUNCEMENT_DELETED', ?, 'platform.announcements', 'MEDIUM', ?, ?, NOW())`,
      [require('crypto').randomUUID(), req.user?.uid || 'admin', JSON.stringify({ announcementId: id, revision: currentRevision }), res.locals?.requestId || null]
    );
    await conn.commit();
    return res.json({ success: true, id });
  } catch (_error) {
    await conn.rollback().catch(() => {});
    return res.status(503).json({ error: { code: 'ANNOUNCEMENT_DELETE_FAILED', message: 'Announcement could not be deleted', requestId: res.locals?.requestId } });
  } finally {
    conn.release();
  }
});

async function inspectAttentionSignals() {
  const [[paymentRows], [securityRows], [tenantRows], [maintenanceRows]] = await Promise.all([
    getPool().query("SELECT COUNT(*) AS total FROM payment_orders WHERE status IN ('FAILED','CANCELLED','DECLINED')"),
    getPool().query("SELECT COUNT(*) AS total FROM security_audit_logs WHERE severity IN ('HIGH','CRITICAL')"),
    getPool().query("SELECT COUNT(*) AS total FROM enterprise_tenants WHERE lifecycleState = 'SUSPENDED'"),
    getPool().query("SELECT data FROM system_settings WHERE category = 'maintenance'"),
  ]);
  let maintenance = {};
  if (maintenanceRows[0]) {
    try { maintenance = typeof maintenanceRows[0].data === 'string' ? JSON.parse(maintenanceRows[0].data) : (maintenanceRows[0].data || {}); } catch { maintenance = {}; }
  }
  return {
    paymentFailed: Number(paymentRows[0]?.total || 0),
    highSecurity: Number(securityRows[0]?.total || 0),
    suspendedTenants: Number(tenantRows[0]?.total || 0),
    maintenanceEnabled: maintenance.enabled === true,
  };
}

function attentionItemsFromSignals(health, extras = {}) {
  const items = [];
  if (health.subsystems.database.status !== 'HEALTHY') {
    items.push({ id: 'db-down', severity: 'HIGH', title: 'MariaDB probe failed', href: '/adm/operations', kind: 'health' });
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
  try {
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
  } catch (_error) {
    return res.status(503).json({
      error: { code: 'ATTENTION_SIGNALS_UNAVAILABLE', message: 'Platform attention signals are unavailable.', requestId: res.locals?.requestId },
    });
  }
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

router.get('/enterprise-queue', async (_req, res) => {
  try {
    const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
    const queue = await getOutboxStatus({
      pool: getPool(),
      signingSecret: process.env.TENANT_JOB_SIGNING_SECRET || null,
    });
    return res.json({ queue, note: 'Global MariaDB enterprise-outbox posture. Tenant-scoped replay remains in the Enterprise console.' });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'ENTERPRISE_QUEUE_UNAVAILABLE', message: 'Enterprise queue telemetry is unavailable.', requestId: res.locals?.requestId } });
  }
});

const PLATFORM_OPERATOR_ROLES = new Set(['ADMIN', 'SUPPORT', 'USER']);

router.get('/operators', async (req, res) => {
  const identityAdmin = req.app?.get('firebaseAdmin');
  if (!identityAdmin?.auth) {
    return res.status(503).json({ error: { code: 'IDENTITY_UNAVAILABLE', message: 'Identity directory unavailable.', requestId: res.locals?.requestId } });
  }
  try {
    const operators = [];
    let pageToken;
    do {
      const page = await identityAdmin.auth().listUsers(200, pageToken);
      for (const identity of page.users || []) {
        const role = String(identity.customClaims?.role || '').toUpperCase();
        if (!['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(role)) continue;
        operators.push({
          id: identity.uid,
          email: identity.email || null,
          role,
          suspended: identity.disabled === true,
          emailVerified: identity.emailVerified === true,
          mfaEnabled: Array.isArray(identity.multiFactor?.enrolledFactors) && identity.multiFactor.enrolledFactors.length > 0,
          displayName: identity.displayName || null,
        });
      }
      pageToken = page.pageToken;
      if (operators.length >= 500) break;
    } while (pageToken);
    return res.json({ operators: operators.slice(0, 500), source: 'FIREBASE_AUTH_IDENTITY', truncated: Boolean(pageToken) });
  } catch (_error) {
    return res.status(503).json({ error: { code: 'OPERATOR_DIRECTORY_UNAVAILABLE', message: 'Operator directory is unavailable.', requestId: res.locals?.requestId } });
  }
});

router.post('/operators', requireRecentAdminAuthentication, async (req, res) => {
  const uid = String(req.body?.uid || '').trim();
  const nextRole = String(req.body?.role || '').toUpperCase();
  const expectedRole = req.body?.expectedRole === undefined ? null : String(req.body.expectedRole || '').toUpperCase();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid) || !PLATFORM_OPERATOR_ROLES.has(nextRole) || (expectedRole !== null && !PLATFORM_OPERATOR_ROLES.has(expectedRole) && expectedRole !== 'SUPER_ADMIN')) {
    return res.status(400).json({ error: { code: 'INVALID_OPERATOR', message: 'A valid uid and role of ADMIN, SUPPORT, or USER is required' } });
  }
  const admin = req.app?.get('firebaseAdmin');
  if (!admin?.auth) {
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
    await recordAdminAuditLog({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_OPERATOR_ROLE_CHANGE_REQUESTED',
      category: 'iam.operators',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      method: 'POST', pathname: req.originalUrl, statusCode: 202,
      resourceType: 'firebase_auth_user', resourceId: uid,
      metadata: { previousRole: currentRole, nextRole }, requestId: res.locals?.requestId,
    });
    await admin.auth().setCustomUserClaims(uid, { ...(target.customClaims || {}), role: nextRole });
    await admin.auth().revokeRefreshTokens(uid);
    await recordAdminAuditLog({
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
  const admin = req.app?.get('firebaseAdmin');
  if (!admin?.auth) {
    return res.status(503).json({ error: { code: 'IDENTITY_UNAVAILABLE', message: 'Identity directory unavailable' } });
  }
  try {
    const target = await admin.auth().getUser(uid);
    await recordAdminAuditLog({
      actorUid: req.user?.uid, actorEmail: req.user?.email, actorRole: 'SUPER_ADMIN',
      action: 'PLATFORM_OPERATOR_SESSION_REVOCATION_REQUESTED', category: 'iam.operators',
      severity: 'HIGH', outcome: 'SUCCESS', method: 'POST', pathname: req.originalUrl,
      statusCode: 202, resourceType: 'firebase_auth_user', resourceId: uid,
      metadata: {}, requestId: res.locals?.requestId,
    });
    await admin.auth().revokeRefreshTokens(uid);
    await recordAdminAuditLog({
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
  const admin = req.app?.get('firebaseAdmin');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    return res.status(400).json({ error: { code: 'INVALID_TENANT_ID', message: 'Invalid tenant identifier', requestId: res.locals?.requestId } });
  }
  if (!tenantService?.registry) {
    return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant service unavailable', requestId: res.locals?.requestId } });
  }
  try {
    const tenant = await tenantService.registry.getTenant(tenantId);
    const configurationResult = await safeQuery('tenant-configuration', () => tenantService.registry.getTenantConfiguration(tenantId));
    const membershipsResult = await safeQuery('tenant-memberships', () => tenantService.registry.listTenantMemberships(tenantId));
    const workspacesResult = await safeQuery('tenant-workspaces', () => tenantService.registry.listWorkspaces(tenantId, { includeArchived: true }));
    const accountsResult = await safeQuery('tenant-service-accounts', () => tenantService.serviceAccountStore ? tenantService.serviceAccountStore.list({ tenantId }) : Promise.resolve([]));
    const auditResult = await safeQuery('tenant-audit', () => tenantService.repository ? tenantService.repository.listAuditEvents({ tenantId, principalId: req.user?.uid || 'admin', workspaceScope: 'TENANT' }, { limit: 25 }) : Promise.resolve([]));
    const usageResult = await safeQuery('tenant-usage', () => tenantService.repository ? tenantService.repository.getAiUsageSummary({ tenantId, principalId: req.user?.uid || 'admin', workspaceScope: 'TENANT' }, { days: 366 }) : Promise.resolve([]));

    const results = [configurationResult, membershipsResult, workspacesResult, accountsResult, auditResult, usageResult];
    const memberships = membershipsResult.ok ? membershipsResult.value : [];
    const workspaces = workspacesResult.ok ? workspacesResult.value.map(w => ({ id: w.id, name: w.name || 'Unnamed workspace', lifecycleState: w.lifecycleState || 'ACTIVE', isDefault: w.isDefault === true })) : [];
    const serviceAccounts = accountsResult.ok ? accountsResult.value.map(sa => ({ id: sa.id, displayName: sa.displayName || null, status: sa.status || 'ACTIVE', scopes: Array.isArray(sa.scopes) ? sa.scopes : [], expiresAt: sa.expiresAt, lastUsedAt: sa.lastUsedAt, createdAt: sa.createdAt })) : [];
    const activity = auditResult.ok ? auditResult.value.map(evt => ({ id: evt.id, action: evt.action || 'UNKNOWN', category: evt.category || null, severity: evt.severity || 'INFO', outcome: evt.outcome || null, principalId: evt.actorPrincipalId || evt.principalId || null, resourceType: evt.resourceType || null, resourceId: evt.resourceId || null, occurredAt: evt.occurredAt || evt.createdAt || null })) : [];
    const usageRows = usageResult.ok ? (Array.isArray(usageResult.value) ? usageResult.value : []) : [];
    const usage = usageResult.ok ? {
      source: 'MEASURED',
      daysInspected: usageRows.length,
      inputTokens: usageRows.reduce((sum, row) => sum + Number(row.promptTokens || 0), 0),
      outputTokens: usageRows.reduce((sum, row) => sum + Number(row.completionTokens || 0), 0),
      requests: usageRows.reduce((sum, row) => sum + Number(row.requestCount || row.requests || 0), 0),
      estimatedCostMicros: 0,
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
    } else {
      memberships.forEach(m => memberUsers.push({ id: m.principalId, email: null, displayName: null, roles: m.roles, status: m.status, workspaceId: m.workspaceId || null }));
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
      // Full workspace inventory (id/name/lifecycle/isDefault only) so the
      // Admin Console can show which canonical workspace a tenant assignment
      // will bind before submitting (GAP-22). Measured from the registry,
      // never assumed.
      workspaces: { items: workspaces, source: workspacesResult.ok ? 'AVAILABLE' : 'UNAVAILABLE' },
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
    await recordAdminAuditLog({
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
    await recordAdminAuditLog({
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
      });
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

router.get('/feature-flags', requireSuperAdmin, async (_req, res) => {
  try {
    const flags = await getAllFlags();
    return res.json({ flags });
  } catch (_error) {
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
    // MySQL-backed: flags persist in system_settings with a durable audit event.
    const result = await setFlagValue(flagKey, value, req.user?.uid, res.locals.requestId);
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
    const configuration = await getPlatformConfiguration({ env: process.env });
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
    const projection = await getPaymentSettingsProjection(process.env);
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

