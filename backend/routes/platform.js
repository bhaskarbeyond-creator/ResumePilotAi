'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { requirePermission, requireSuperAdmin } = require('../security/auth');
const { recordAdminAuditLog } = require('../security/adminAudit');

const router = express.Router();

function apiError(res, error, fallbackCode, fallbackMessage) {
  const status = [400, 403, 404, 409, 422, 429, 503].includes(Number(error?.status))
    ? Number(error.status)
    : 503;
  return res.status(status).json({
    error: {
      code: error?.code || fallbackCode,
      // Never place internal Firestore/provider errors in a platform response.
      message: status < 500 && error?.message ? error.message : fallbackMessage,
      requestId: res.locals?.requestId,
    },
  });
}

async function recordPlatformAction(req, res, { action, severity = 'HIGH', resourceType = null, resourceId = null, metadata = {} }) {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  const event = await recordAdminAuditLog(db, admin, {
    actorUid: req.user?.uid,
    actorEmail: req.user?.email,
    actorRole: String(req.user?.claims?.role || 'SUPER_ADMIN').toUpperCase(),
    action,
    category: 'platform.control-plane',
    severity,
    outcome: 'SUCCESS',
    method: req.method,
    pathname: req.originalUrl || req.path,
    statusCode: res.statusCode || 200,
    durationMs: 0,
    requestId: res.locals?.requestId,
    resourceType,
    resourceId,
    metadata,
  });
  if (event) res.locals.adminAuditRecorded = true;
  return event;
}

function requiredTenantConfirmation(req, tenant, verb) {
  const expected = `${verb} ${tenant.slug}`;
  const supplied = String(req.body?.confirmation || '').trim();
  if (supplied !== expected) {
    const error = new Error(`Type “${expected}” to confirm this tenant lifecycle action.`);
    error.code = 'CONFIRMATION_REQUIRED';
    error.status = 422;
    throw error;
  }
}

function platformTenantView(tenant) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    displayName: tenant.displayName,
    lifecycleState: tenant.lifecycleState,
    isolationTier: tenant.isolationTier,
    region: tenant.dataPlane?.region || null,
    dataPlaneType: tenant.dataPlane?.type || null,
    createdAt: tenant.createdAt || null,
    updatedAt: tenant.updatedAt || null,
  };
}

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
  const tenantService = req.app?.get('tenantService');

  const startTime = Date.now();
  let dbHealthy = false;
  let dbLatencyMs = null;

  if (db) {
    try {
      const pingStart = Date.now();
      // Diagnostics must never mutate tenant/platform state. A bounded read is
      // enough to prove Firestore reachability without leaving health-check data.
      await db.collection('settings').limit(1).get();
      dbLatencyMs = Date.now() - pingStart;
      dbHealthy = true;
    } catch (err) {
      console.warn('[PlatformHealth] DB probe warning:', err.message);
    }
  }

  // Queue telemetry is either observed, degraded, or unavailable. It is never
  // represented as a healthy zero when Firestore cannot be queried.
  let queueStats = {
    active: null,
    deadLetter: null,
    completed: null,
    status: db ? 'UNAVAILABLE' : 'UNAVAILABLE',
  };
  if (db) {
    try {
      queueStats = { active: 0, deadLetter: 0, completed: 0, status: 'HEALTHY' };
      const outboxSnap = await db.collection('notification_outbox').limit(100).get();
      outboxSnap.forEach(doc => {
        const data = doc.data() || {};
        if (data.state === 'DEAD_LETTER' || data.attemptCount >= 5) queueStats.deadLetter += 1;
        else if (data.providerAccepted === true) queueStats.completed += 1;
        else queueStats.active += 1;
      });
      if (queueStats.deadLetter > 0) queueStats.status = 'DEGRADED';
    } catch (err) {
      console.warn('[PlatformHealth] Queue probe warning:', err.message);
    }
  }

  // System & Memory stats
  const memoryUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  // Compute a score only from observed signals. A core dependency outage is
  // explicitly UNAVAILABLE instead of being rounded into a deceptively healthy
  // aggregate.
  let healthScore = 100;
  if (!dbHealthy) healthScore = null;
  else {
    if (dbLatencyMs > 500) healthScore -= 10;
    if (queueStats.status === 'UNAVAILABLE') healthScore -= 10;
    else if (queueStats.deadLetter > 5) healthScore -= 20;
    else if (queueStats.deadLetter > 0) healthScore -= 10;
    if ((memoryUsage.heapUsed / memoryUsage.heapTotal) > 0.9) healthScore -= 15;
    healthScore = Math.max(0, Math.min(100, healthScore));
  }

  const platformStatus = !dbHealthy
    ? 'UNAVAILABLE'
    : queueStats.status === 'UNAVAILABLE' || healthScore < 80
      ? 'DEGRADED'
      : 'HEALTHY';

  const responseData = {
    status: platformStatus,
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

    const statsAvailable = statsDoc.status === 'fulfilled' && statsDoc.value.exists;
    const earningsAvailable = earningsDoc.status === 'fulfilled' && earningsDoc.value.exists;
    const statsData = statsAvailable ? statsDoc.value.data() : null;
    const earningsData = earningsAvailable ? earningsDoc.value.data() : null;

    let tenantCounts = null;
    if (tenantsSnap.status === 'fulfilled' && tenantsSnap.value) {
      tenantCounts = { total: 0, active: 0, suspended: 0 };
      tenantsSnap.value.forEach(doc => {
        tenantCounts.total += 1;
        const data = doc.data() || {};
        if (data.lifecycleState === 'ACTIVE') tenantCounts.active += 1;
        else if (data.lifecycleState === 'SUSPENDED') tenantCounts.suspended += 1;
      });
    }

    return res.json({
      kpis: {
        totalUsers: statsData?.users ?? statsData?.totalUsers ?? null,
        resumesCreated: statsData?.resumes ?? null,
        totalDownloads: statsData?.downloads ?? null,
        totalEarningsCents: earningsData?.total ?? earningsData?.amount ?? null,
        currency: earningsData?.currency || null,
        tenants: tenantCounts,
      },
      availability: {
        stats: statsAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        earnings: earningsAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        tenants: tenantCounts ? 'AVAILABLE' : 'UNAVAILABLE',
        recentUsers: recentUsersSnap.status === 'fulfilled' ? 'AVAILABLE' : 'UNAVAILABLE',
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
    console.error('[PlatformQueues] Query failed:', err.message);
    return res.status(503).json({ error: { code: 'QUEUE_QUERY_FAILED', message: 'Queue telemetry is currently unavailable.', requestId: res.locals?.requestId } });
  }
});

/**
 * Retry failed / dead-letter queue items (Requires Super Admin)
 */
router.post('/queues/retry', requireSuperAdmin, async (req, res) => {
  const db = req.app?.get('db');
  const admin = req.app?.get('firebaseAdmin');
  if (!db || !admin?.firestore?.FieldValue || !admin?.firestore?.Timestamp) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Queue storage is unavailable', requestId: res.locals?.requestId } });
  }

  const { jobId, all = false } = req.body || {};
  const normalizedJobId = jobId === null || jobId === undefined ? '' : String(jobId);
  if ((normalizedJobId && !/^[A-Za-z0-9_-]{1,128}$/.test(normalizedJobId)) || (Boolean(normalizedJobId) === Boolean(all))) {
    return res.status(400).json({ error: { code: 'INVALID_REPLAY_REQUEST', message: 'Specify exactly one dead-letter job or the bounded replay-all action.', requestId: res.locals?.requestId } });
  }

  try {
    const update = {
      state: 'NOTIFICATION_QUEUED',
      attemptCount: 0,
      nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now()),
      lastError: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    let retriedCount = 0;
    let replayedIds = [];

    if (normalizedJobId) {
      if (String(req.body?.confirmation || '').trim() !== `REPLAY ${normalizedJobId}`) {
        return res.status(422).json({ error: { code: 'CONFIRMATION_REQUIRED', message: `Type “REPLAY ${normalizedJobId}” to confirm this dead-letter replay.`, requestId: res.locals?.requestId } });
      }
      const docRef = db.collection('notification_outbox').doc(normalizedJobId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'The queue job was not found.', requestId: res.locals?.requestId } });
      }
      const current = snap.data() || {};
      const isDeadLetter = current.state === 'DEAD_LETTER' || Number(current.attemptCount || 0) >= 5;
      if (!isDeadLetter) {
        return res.status(409).json({ error: { code: 'JOB_NOT_DEAD_LETTER', message: 'Only dead-letter jobs can be replayed.', requestId: res.locals?.requestId } });
      }
      await docRef.update(update);
      retriedCount = 1;
      replayedIds = [normalizedJobId];
    } else {
      if (String(req.body?.confirmation || '').trim() !== 'REPLAY ALL DEAD LETTERS') {
        return res.status(422).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Type “REPLAY ALL DEAD LETTERS” to confirm this bounded replay.', requestId: res.locals?.requestId } });
      }
      // Historical jobs may carry either the explicit DLQ state or only the
      // terminal attempt count. Read both shapes and de-duplicate safely.
      const [stateMarked, attemptMarked] = await Promise.all([
        db.collection('notification_outbox').where('state', '==', 'DEAD_LETTER').limit(20).get(),
        db.collection('notification_outbox').where('attemptCount', '>=', 5).limit(20).get(),
      ]);
      const deadLetters = new Map();
      for (const doc of [...stateMarked.docs, ...attemptMarked.docs]) {
        if (deadLetters.size < 20) deadLetters.set(doc.id, doc);
      }
      if (!deadLetters.size) {
        return res.status(409).json({ error: { code: 'NO_DEAD_LETTERS', message: 'There are no dead-letter jobs to replay.', requestId: res.locals?.requestId } });
      }
      const batch = db.batch();
      for (const doc of deadLetters.values()) {
        batch.update(doc.ref, update);
        replayedIds.push(doc.id);
      }
      await batch.commit();
      retriedCount = replayedIds.length;
    }

    await recordPlatformAction(req, res, {
      action: normalizedJobId ? 'PLATFORM_QUEUE_JOB_REPLAYED' : 'PLATFORM_QUEUE_DEAD_LETTERS_REPLAYED',
      resourceType: normalizedJobId ? 'notification_outbox_event' : 'notification_outbox_batch',
      resourceId: normalizedJobId || null,
      metadata: { retriedCount, replayedIds },
    });
    return res.json({ success: true, retriedCount, replayedIds });
  } catch (err) {
    console.error('[PlatformQueueReplay]', err.message);
    return apiError(res, err, 'RETRY_FAILED', 'The queue replay could not be completed.');
  }
});

/**
 * Platform tenant registry adapter.
 *
 * /adm is a global control plane and must not call feature-gated /enterprise
 * URLs. These routes are mounted independently so an operator sees a truthful
 * unavailable state rather than an unexplained "API route not found" response
 * while tenancy rollout is disabled. Mutations deliberately require a
 * SUPER_ADMIN server claim; the browser role is only a convenience for hiding
 * controls and is never authoritative.
 */
router.get('/tenants', requireSuperAdmin, async (req, res) => {
  const service = req.app?.get('tenantService');
  if (!service) return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant control-plane service is unavailable.', requestId: res.locals?.requestId } });
  try {
    const tenants = await service.listPlatformTenants({ user: req.user, limit: req.query?.limit });
    return res.json({ tenants: tenants.map(platformTenantView), count: tenants.length });
  } catch (error) {
    return apiError(res, error, 'PLATFORM_TENANTS_UNAVAILABLE', 'The tenant registry is unavailable.');
  }
});

router.post('/tenants', requireSuperAdmin, async (req, res) => {
  const service = req.app?.get('tenantService');
  if (!service) return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant control-plane service is unavailable.', requestId: res.locals?.requestId } });
  try {
    const result = await service.provisionTenant({ user: req.user, input: req.body || {}, requestId: res.locals?.requestId });
    res.status(201);
    await recordPlatformAction(req, res, {
      action: 'PLATFORM_TENANT_PROVISIONED',
      resourceType: 'tenant',
      resourceId: result.tenant.id,
      metadata: { slug: result.tenant.slug, isolationTier: result.tenant.isolationTier, workspaceId: result.workspace?.id || null },
    });
    return res.status(201).json({ tenant: platformTenantView(result.tenant), workspace: result.workspace ? { id: result.workspace.id, name: result.workspace.name } : null });
  } catch (error) {
    return apiError(res, error, 'TENANT_PROVISIONING_FAILED', 'The tenant could not be provisioned.');
  }
});

router.get('/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  const service = req.app?.get('tenantService');
  if (!service) return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant control-plane service is unavailable.', requestId: res.locals?.requestId } });
  try {
    const tenant = await service.getPlatformTenant({ user: req.user, tenantId: req.params.tenantId });
    return res.json({ tenant: platformTenantView(tenant) });
  } catch (error) {
    return apiError(res, error, 'TENANT_NOT_FOUND', 'The tenant could not be loaded.');
  }
});

router.patch('/tenants/:tenantId', requireSuperAdmin, async (req, res) => {
  const service = req.app?.get('tenantService');
  if (!service) return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant control-plane service is unavailable.', requestId: res.locals?.requestId } });
  try {
    const tenant = await service.updateTenantProfileAsPlatform({
      user: req.user,
      tenantId: req.params.tenantId,
      displayName: req.body?.displayName,
      requestId: res.locals?.requestId,
    });
    await recordPlatformAction(req, res, {
      action: 'PLATFORM_TENANT_PROFILE_UPDATED',
      resourceType: 'tenant', resourceId: tenant.id,
      metadata: { displayName: tenant.displayName },
    });
    return res.json({ tenant: platformTenantView(tenant) });
  } catch (error) {
    return apiError(res, error, 'TENANT_PROFILE_UPDATE_FAILED', 'The tenant profile could not be updated.');
  }
});

async function transitionTenant(req, res, nextState, confirmationVerb, action) {
  const service = req.app?.get('tenantService');
  if (!service) return res.status(503).json({ error: { code: 'TENANT_CONTROL_PLANE_UNAVAILABLE', message: 'Tenant control-plane service is unavailable.', requestId: res.locals?.requestId } });
  try {
    const current = await service.getPlatformTenant({ user: req.user, tenantId: req.params.tenantId });
    requiredTenantConfirmation(req, current, confirmationVerb);
    const tenant = await service.setTenantLifecycleAsPlatform({
      user: req.user,
      tenantId: req.params.tenantId,
      nextState,
      requestId: res.locals?.requestId,
    });
    await recordPlatformAction(req, res, {
      action,
      resourceType: 'tenant', resourceId: tenant.id,
      metadata: { from: current.lifecycleState, to: tenant.lifecycleState, slug: tenant.slug },
    });
    return res.json({ tenant: platformTenantView(tenant) });
  } catch (error) {
    return apiError(res, error, 'TENANT_LIFECYCLE_UPDATE_FAILED', 'The tenant lifecycle action could not be completed.');
  }
}

router.post('/tenants/:tenantId/suspend', requireSuperAdmin, (req, res) => transitionTenant(req, res, 'SUSPENDED', 'SUSPEND', 'PLATFORM_TENANT_SUSPENDED'));
router.post('/tenants/:tenantId/reactivate', requireSuperAdmin, (req, res) => transitionTenant(req, res, 'ACTIVE', 'REACTIVATE', 'PLATFORM_TENANT_REACTIVATED'));
router.post('/tenants/:tenantId/decommission', requireSuperAdmin, (req, res) => transitionTenant(req, res, 'DELETING', 'DECOMMISSION', 'PLATFORM_TENANT_DECOMMISSION_STARTED'));

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
