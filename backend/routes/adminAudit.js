'use strict';

const express = require('express');
const { queryAdminAuditLogs } = require('../security/adminAudit');
const { requirePermission } = require('../security/auth');
const { getRepository } = require('../repositories');

const router = express.Router();

const CSV_HEADER = [
  'id', 'createdAt', 'actorUid', 'actorEmail', 'actorRole', 'action', 'category',
  'severity', 'outcome', 'method', 'pathname', 'statusCode', 'requestId', 'metadata',
];

function csvEscape(value) {
  const string = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(string)) {
    return '"' + string.replace(/"/g, '""') + '"';
  }
  return string;
}

function auditLogToCsvRow(log) {
  return CSV_HEADER.map(field => {
    let value;
    switch (field) {
      case 'metadata': value = JSON.stringify(log?.metadata || {}); break;
      default: value = log?.[field] ?? '';
    }
    return csvEscape(value);
  }).join(',');
}

// Audit log reads require audit.read (AUDITOR/ADMIN/SUPER_ADMIN) or
// admin.audit.read — NOT system.config.read, which would incorrectly block
// AUDITOR/SUPPORT. Super admin holds '*' and passes either check.
// Per-route middleware avoids imposing a blanket requirement on later routers
// that share the /api/admin mount point.
router.get('/audit-logs', requirePermission(['admin.audit.read', 'audit.read']), async (req, res) => {
  try {
    const rawLimit = req.query.limit == null ? 50 : parseInt(req.query.limit, 10);
    const rawOffset = req.query.offset == null ? 0 : parseInt(req.query.offset, 10);
    const limitCount = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const offsetCount = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const result = await queryAdminAuditLogs(getRepository(), {
      limit: limitCount,
      offset: offsetCount,
      actorUid: req.query.actorUid ? String(req.query.actorUid) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      category: req.query.category ? String(req.query.category) : undefined,
      severity: req.query.severity ? String(req.query.severity) : undefined,
      outcome: req.query.outcome ? String(req.query.outcome) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      startAfterDocId: req.query.startAfterDocId ? String(req.query.startAfterDocId) : undefined,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
    });

    if (String(req.query.format || '').toLowerCase() === 'csv') {
      const lines = [CSV_HEADER.map(csvEscape).join(',')];
      for (const log of result.logs) lines.push(auditLogToCsvRow(log));
      const body = lines.join('\n') + '\n';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
      return res.send(body);
    }

    return res.json({
      logs: result.logs,
      count: result.logs.length,
      offset: result.offset ?? offsetCount,
      limit: result.limit ?? limitCount,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor || null,
      source: result.source || 'mariadb',
    });
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

router.get('/audit-logs/stats', requirePermission(['admin.audit.read', 'audit.read']), async (_req, res) => {
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

router.get('/audit-logs/:id', requirePermission(['admin.audit.read', 'audit.read']), async (req, res) => {
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
