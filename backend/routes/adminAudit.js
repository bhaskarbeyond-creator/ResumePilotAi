'use strict';

const express = require('express');
const { queryAdminAuditLogs, sanitizeAuditValue } = require('../security/adminAudit');
const { requirePermission } = require('../security/auth');
const { getRepository } = require('../repositories');

const router = express.Router();

router.use(requirePermission('system.config.read'));

// Attach repository
router.use((req, res, next) => {
  try {
    req.repository = req.repository || getRepository(req.app?.get('db'));
    next();
  } catch (_) {
    next();
  }
});

router.get('/audit-logs', async (req, res) => {
  const db = req.app?.get('db');

  try {
    const {
      limit = 50,
      actorUid,
      action,
      category,
      severity,
      outcome,
      search,
      startAfterDocId,
    } = req.query;

    const result = await queryAdminAuditLogs(req.repository || db, {
      limit: parseInt(limit, 10) || 50,
      actorUid: actorUid ? String(actorUid) : undefined,
      action: action ? String(action) : undefined,
      category: category ? String(category) : undefined,
      severity: severity ? String(severity) : undefined,
      outcome: outcome ? String(outcome) : undefined,
      search: search ? String(search) : undefined,
      startAfterDocId: startAfterDocId ? String(startAfterDocId) : undefined,
    });

    return res.json(result);
  } catch (error) {
    const isQuotaOrUnavailable = String(error?.message || '').includes('RESOURCE_EXHAUSTED') ||
                                 String(error?.message || '').includes('Quota exceeded') ||
                                 String(error?.message || '').includes('UNAVAILABLE') ||
                                 error?.code === 8 || error?.code === 14 || error?.code === 'resource-exhausted';
    if (isQuotaOrUnavailable) {
      return res.json({
        logs: [],
        count: 0,
        hasMore: false,
        degraded: true,
        quotaLimited: true,
        reason: 'STANDBY_FIRESTORE_QUOTA_LIMITED',
        message: 'Standby audit event store read limit reached. Real-time audit recording is active in the primary database.',
      });
    }
    console.error('[AdminAuditRoute] Error fetching audit logs:', error);
    return res.status(error.status || 500).json({
      error: {
        code: error.code || 'AUDIT_QUERY_FAILED',
        message: 'Failed to query admin audit logs',
        requestId: res.locals?.requestId,
      },
    });
  }
});

router.get('/audit-logs/stats', async (req, res) => {
  const repo = req.repository || getRepository(req.app?.get('db'));

  try {
    let logs = [];
    if (repo && typeof repo.getAdminAuditLogs === 'function') {
      logs = await repo.getAdminAuditLogs({ limit: 200 }).catch(() => []);
    }

    // Fallback to Firestore if empty and db is available
    if (!logs.length && req.app?.get('db')) {
      try {
        const snap = await req.app.get('db').collection('admin_audit_logs').orderBy('createdAt', 'desc').limit(200).get();
        logs = snap.docs.map(d => d.data());
      } catch (_) {}
    }

    let totalRecent = logs.length;
    let highSeverityCount = 0;
    let failureCount = 0;
    const categoryCounts = {};
    const actorCounts = {};

    logs.forEach(log => {
      if (['HIGH', 'CRITICAL'].includes(log.severity)) highSeverityCount += 1;
      if (log.outcome === 'FAILURE' || (log.statusCode && log.statusCode >= 400)) failureCount += 1;
      const cat = log.category || 'general';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      const actor = log.actorEmail || log.actorUid || 'unknown';
      actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    });

    return res.json({
      sampleSize: totalRecent,
      highSeverityCount,
      failureCount,
      successRate: totalRecent > 0 ? Math.round(((totalRecent - failureCount) / totalRecent) * 100) : 100,
      categoryCounts,
      topActors: Object.entries(actorCounts).map(([actor, count]) => ({ actor, count })).slice(0, 10),
    });
  } catch (error) {
    console.error('[AdminAuditRoute] Error computing stats:', error);
    return res.json({
      sampleSize: 0,
      highSeverityCount: 0,
      failureCount: 0,
      successRate: 100,
      categoryCounts: {},
      topActors: [],
    });
  }
});

router.get('/audit-logs/:id', async (req, res) => {
  const repo = req.repository || getRepository(req.app?.get('db'));
  const logId = String(req.params.id);

  try {
    // 1. Try MariaDB
    if (repo && typeof repo.getAdminAuditLogs === 'function') {
      const logs = await repo.getAdminAuditLogs({ limit: 1, action: undefined });
      const found = logs.find(l => l.id === logId);
      if (found) return res.json(found);
    }

    // 2. Try Firestore
    const db = req.app?.get('db');
    if (db && typeof db.collection === 'function') {
      const doc = await db.collection('admin_audit_logs').doc(logId).get();
      if (doc.exists) {
        const data = doc.data() || {};
        const safe = sanitizeAuditValue('record', data) || {};
        return res.json({
          id: doc.id,
          ...safe,
          createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.occurredAt || null,
        });
      }
    }

    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audit record not found', requestId: res.locals?.requestId } });
  } catch (error) {
    return res.status(500).json({ error: { code: 'QUERY_FAILED', message: 'Failed to retrieve audit record', requestId: res.locals?.requestId } });
  }
});

module.exports = { adminAuditRouter: router };
