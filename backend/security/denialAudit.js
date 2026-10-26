'use strict';

/**
 * Denial auditing that can never mask the denial itself.
 *
 * ## Why this exists
 *
 * `recordAdminAuditLog` throws when the audit store is unavailable — correct for
 * a state-changing operation, where "no record" must mean "no change" (REC-015).
 * It is wrong for a *denial*: the action did not happen, so the request's
 * correct answer is `403`, and turning that into a `503` would replace a precise
 * security signal with an infrastructure error.
 *
 * This helper therefore attempts the audit row, logs a structured warning when
 * that is impossible, and always returns normally. The trade-off is explicit and
 * deliberate: a denial that cannot be recorded is still delivered, and its
 * absence from the trail is observable through the `admin.audit.denial_unrecorded`
 * log line and the `admin_audit_write_failures` counter (REC-025).
 *
 * ## Contract
 *
 * - Never throws.
 * - Never mutates the request or response.
 * - Emits exactly one structured log line on failure, none on success.
 *
 * @module security/denialAudit
 */

const { recordAdminAuditLog } = require('./adminAudit');

/**
 * Record a denial, tolerating an unavailable audit store.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{action?: string, code?: string, resourceType?: string,
 *          resourceId?: string, metadata?: object, severity?: string}} event
 * @returns {Promise<{recorded: boolean}>} `recorded:false` when the store was unavailable
 */
async function recordDenialAudit(req, res, event = {}) {
  try {
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      action: event.action || 'ADMIN_ACTION_DENIED',
      category: event.category || 'iam.users',
      severity: event.severity || 'HIGH',
      method: req.method,
      pathname: req.originalUrl,
      statusCode: 403,
      resourceType: event.resourceType || 'user',
      resourceId: event.resourceId,
      metadata: { ...(event.metadata || {}), code: event.code },
      requestId: res.locals?.requestId,
    });
    return { recorded: true };
  } catch (error) {
    // Structured, greppable, and never a bare swallow: the reason is retained.
    console.warn('[AdminAudit] admin.audit.denial_unrecorded', JSON.stringify({
      action: event.action || 'ADMIN_ACTION_DENIED',
      code: event.code || null,
      reason: String(error?.code || error?.message || error),
      requestId: res.locals?.requestId || null,
    }));
    return { recorded: false };
  }
}

module.exports = { recordDenialAudit };
