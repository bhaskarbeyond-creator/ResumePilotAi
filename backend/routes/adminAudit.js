'use strict';

const express = require('express');
const { queryAdminAuditLogs } = require('../security/adminAudit');
const { requirePermission } = require('../security/auth');
const { getRepository } = require('../repositories');

const router = express.Router();

router.use(requirePermission('system.config.read'));

router.get('/audit-logs', async (req, res) => {
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
    const result = await queryAdminAuditLogs(getRepository(), {
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
    console.error('[AdminAuditRoute] Audit query failed:', { code: error.code, requestId: res.locals?.requestId });
    return res.status(error.status || 503).json({
      error: {
        code: error.code || 'AUDIT_QUERY_FAILED',
        message: error.status && error.status < 500 ? error.message : 'Administrative audit records are unavailable.',
        requestId: res.locals?.requestId,
      },
    });
  }
});

router.get('/audit-logs/stats', async (_req, res) => {
  try {
    const logs = await getRepository().getAdminAuditLogs({ limit: 200 });
    let highSeverityCount = 0;
    let failureCount = 0;
    const categoryCounts = {};
    const actorCounts = {};

    for (const log of logs) {
      if (['HIGH', 'CRITICAL'].includes(log.severity)) highSeverityCount += 1;
      if (log.outcome === 'FAILURE' || (log.statusCode && log.statusCode >= 400)) failureCount += 1;
      const category = log.category || 'general';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      const actor = log.actorEmail || log.actorUid || 'unknown';
      actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    }

    return res.json({
      sampleSize: logs.length,
      highSeverityCount,
      failureCount,
      successRate: logs.length ? Math.round(((logs.length - failureCount) / logs.length) * 100) : null,
      categoryCounts,
      topActors: Object.entries(actorCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([actor, count]) => ({ actor, count })),
      source: 'mariadb',
    });
  } catch (error) {
    console.error('[AdminAuditRoute] Audit statistics failed:', { code: error.code, requestId: res.locals?.requestId });
    return res.status(503).json({
      error: {
        code: 'AUDIT_STATS_UNAVAILABLE',
        message: 'Administrative audit statistics are unavailable.',
        requestId: res.locals?.requestId,
      },
    });
  }
});

router.get('/audit-logs/:id', async (req, res) => {
  const logId = String(req.params.id || '').trim();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(logId)) {
    return res.status(400).json({ error: { code: 'INVALID_AUDIT_ID', message: 'Invalid audit record ID.', requestId: res.locals?.requestId } });
  }
  try {
    const record = await getRepository().getAdminAuditLog(logId);
    if (!record) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audit record not found.', requestId: res.locals?.requestId } });
    }
    return res.json(record);
  } catch (error) {
    console.error('[AdminAuditRoute] Audit detail failed:', { code: error.code, requestId: res.locals?.requestId });
    return res.status(503).json({
      error: { code: 'AUDIT_QUERY_FAILED', message: 'Administrative audit record is unavailable.', requestId: res.locals?.requestId },
    });
  }
});

module.exports = { adminAuditRouter: router };
