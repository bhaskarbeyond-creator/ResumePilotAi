'use strict';

/**
 * Administrative outbox control plane — mounted at `/api/admin/system/outbox`.
 *
 *   POST /process   run ONE bounded batch and report exact counts
 *   GET  /stats     persisted PENDING / DELIVERED / DEAD_LETTER counts
 *
 * Authorization: administrator only. `system.config.write` is required to make
 * the worker run (a state-changing operator action) and
 * `system.config.read` / `system.config.write` to read statistics; the same
 * mapping is enforced independently in `security/policy.js`.
 *
 * Both endpoints are deliberately body-free on the response side: no message
 * bodies, recipients, stack traces or driver errors are ever returned, and
 * `/process` reports counts rather than per-message detail.
 */

const express = require('express');
const { requireAuth, requirePermission } = require('../security/auth');
const worker = require('../services/outboxWorker');
const { getPool } = require('../database/mysql');

const router = express.Router();

function requestId(res) {
  return res.locals?.requestId;
}

function respondError(res, error, fallback) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  const declared = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,48}$/.test(error.code) ? error.code : null;
  // Never echo a raw driver/transport code on a 5xx.
  const code = status < 500 || ['INVALID_BATCH_SIZE', 'OUTBOX_POOL_REQUIRED'].includes(declared)
    ? (declared || 'OUTBOX_REQUEST_REJECTED')
    : 'OUTBOX_OPERATION_FAILED';
  if (status >= 500) console.error('[outbox-admin]', code, error?.message || error);
  return res.status(status).json({
    success: false,
    error: {
      code,
      message: status >= 500 && !['OUTBOX_POOL_REQUIRED','INVALID_BATCH_SIZE'].includes(code)
        ? 'The notification outbox is temporarily unavailable.'
        : (error?.message || fallback),
      requestId: requestId(res),
    },
  });
}

router.post('/process', requireAuth, requirePermission('system.config.write'), async (req, res) => {
  try {
    const batchSize = req.body?.batchSize === undefined
      ? worker.DEFAULT_BATCH_SIZE
      : worker.normalizeBatchSize(req.body.batchSize);
    const outcome = await worker.processPendingOutboxMessages({
      pool: getPool(),
      batchSize,
      workerId: `admin-${req.user.uid}-${Date.now()}`,
    });
    return res.json({
      success: true,
      processed: outcome.processed,
      successes: outcome.successes,
      failures: outcome.failures,
      batchSize: outcome.batchSize,
    });
  } catch (error) {
    return respondError(res, error, 'The outbox batch could not be processed.');
  }
});

router.get('/stats', requireAuth, requirePermission(['system.config.read', 'system.config.write']), async (req, res) => {
  try {
    const stats = await worker.getOutboxStats({ pool: getPool() });
    return res.json({
      success: true,
      pending: stats.pending,
      delivered: stats.delivered,
      deadLetter: stats.deadLetter,
      total: stats.total,
      states: stats.states,
      maxAttempts: stats.maxAttempts,
    });
  } catch (error) {
    return respondError(res, error, 'Outbox statistics are unavailable.');
  }
});

module.exports = { outboxAdminRouter: router };
