'use strict';

const express = require('express');
const { queryAdminAuditLogs, sanitizeAuditValue } = require('../security/adminAudit');
const { requirePermission } = require('../security/auth');

const router = express.Router();

router.use(requirePermission('system.config.read'));

router.get('/audit-logs', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Firestore database unavailable', requestId: res.locals?.requestId } });
  }

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

    const result = await queryAdminAuditLogs(db, {
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
    console.error('[AdminAuditRoute] Error fetching audit logs:', error);
    return res.status(error.status || 500).json({
      error: {
        code: error.code || 'AUDIT_QUERY_FAILED',
        message: error.message || 'Failed to query admin audit logs',
        requestId: res.locals?.requestId,
      },
    });
  }
});

router.get('/audit-logs/stats', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', requestId: res.locals?.requestId } });
  }

  try {
    // Read the most recent 200 logs to compute live aggregates without heavy scan
    const snapshot = await db.collection('admin_audit_logs').orderBy('createdAt', 'desc').limit(200).get();
    let totalRecent = 0;
    let highSeverityCount = 0;
    let failureCount = 0;
    const categoryCounts = {};
    const actorCounts = {};

    snapshot.forEach(doc => {
      const data = doc.data() || {};
      totalRecent += 1;
      if (['HIGH', 'CRITICAL'].includes(data.severity)) highSeverityCount += 1;
      if (data.outcome === 'FAILURE' || data.statusCode >= 400) failureCount += 1;
      const cat = data.category || 'general';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      const actor = data.actorEmail || data.actorUid || 'unknown';
      actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    });

    return res.json({
      sampleSize: totalRecent,
      highSeverityCount,
      failureCount,
      successRate: totalRecent > 0 ? Math.round(((totalRecent - failureCount) / totalRecent) * 100) : null,
      categoryCounts,
      topActors: Object.entries(actorCounts).map(([actor, count]) => ({ actor, count })).slice(0, 10),
    });
  } catch (error) {
    console.error('[AdminAuditRoute] Error computing stats:', error);
    return res.status(500).json({ error: { code: 'STATS_ERROR', message: 'Failed to compute audit statistics', requestId: res.locals?.requestId } });
  }
});

router.get('/audit-logs/:id', async (req, res) => {
  const db = req.app?.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', requestId: res.locals?.requestId } });
  }

  try {
    const doc = await db.collection('admin_audit_logs').doc(String(req.params.id)).get();
    if (!doc.exists) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audit record not found', requestId: res.locals?.requestId } });
    }

    const data = doc.data() || {};
    const safe = sanitizeAuditValue('record', data) || {};
    return res.json({
      id: doc.id,
      ...safe,
      createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.occurredAt || null,
    });
  } catch (error) {
    return res.status(500).json({ error: { code: 'QUERY_FAILED', message: error.message, requestId: res.locals?.requestId } });
  }
});

module.exports = { adminAuditRouter: router };
