'use strict';

const crypto = require('crypto');
const { getRepository } = require('../repositories');

const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|accesskey|token|privatekey|credential|keysecret|card|cvv|authorization|cookie|session)/i;
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk_(?:live|test)_|nvapi-|rzp_(?:live|test)_|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_|xox[baprs]-|cfut_|AKIA)[A-Za-z0-9_.-]{8,}/i,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

function sanitizeAuditValue(key, value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY_PATTERN.test(String(key))) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value))) return '[REDACTED]';
    if (value.length > 1000) return value.slice(0, 1000) + '…[TRUNCATED]';
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item, idx) => sanitizeAuditValue(String(idx), item, depth + 1));
  }
  if (typeof value === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        cleaned[k] = sanitizeAuditValue(k, v, depth + 1);
      }
    }
    return cleaned;
  }
  return String(value);
}

function deriveAction(method, pathname, body = {}) {
  const normMethod = String(method || 'GET').toUpperCase();
  const path = String(pathname || '').toLowerCase();

  if (body?.action && typeof body.action === 'string' && /^[A-Z0-9_]{3,80}$/.test(body.action)) {
    return body.action;
  }

  if (path.includes('/ai-settings') || path.includes('/ai/quota')) return `${normMethod}_AI_SETTINGS`;
  if (path.includes('/ai/test-provider')) return 'TEST_AI_PROVIDER';
  if (path.includes('/ai/fetch-models')) return 'FETCH_AI_MODELS';
  if (path.includes('/ai/reset-quota')) return 'RESET_AI_QUOTA';
  if (path.includes('/system-health-settings')) return 'UPDATE_SYSTEM_HEALTH_SETTINGS';
  if (path.includes('/health-summary')) return 'READ_HEALTH_SUMMARY';
  if (path.includes('/payment-settings') || path.includes('/payment/test-provider')) return `${normMethod}_PAYMENT_SETTINGS`;
  if (path.includes('/payments/refund')) return 'PROCESS_PAYMENT_REFUND';
  if (path.includes('/coupons')) return `${normMethod}_COUPON`;
  if (path.includes('/firebase-service-account')) return `${normMethod}_FIREBASE_CREDENTIALS`;
  if (path.includes('/settings/')) return `UPDATE_SETTINGS_${path.split('/settings/')[1]?.toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'GENERAL'}`;
  if (path.includes('/gdpr-settings')) return 'UPDATE_GDPR_SETTINGS';
  if (path.includes('/twilio-settings')) return `${normMethod}_TWILIO_SETTINGS`;
  if (path.includes('/employer-applications/')) return `${normMethod}_EMPLOYER_APPLICATION`;
  if (path.includes('/users/')) return `${normMethod}_USER_PROFILE`;
  if (path.includes('/delete-user') || path.includes('/purge-orphaned-auth')) return 'DELETE_USER_ACCOUNT';
  if (path.includes('/companies/')) return `${normMethod}_COMPANY`;
  if (path.includes('/jobs/')) return `${normMethod}_JOB_POSTING`;
  if (path.includes('/blog/')) return `${normMethod}_BLOG_CONTENT`;
  if (path.includes('/pages/')) return `${normMethod}_CUSTOM_PAGE`;
  if (path.includes('/trusted-by')) return `${normMethod}_TRUSTED_BY_LOGO`;
  if (path.includes('/reviews')) return `${normMethod}_CUSTOMER_REVIEW`;
  if (path.includes('/ads')) return `${normMethod}_AD_BANNER`;
  if (path.includes('/website-meta')) return 'UPDATE_WEBSITE_META';
  if (path.includes('/landing-content')) return 'UPDATE_LANDING_CONTENT';
  if (path.includes('/platform/tenants') && path.includes('decommission')) return 'DECOMMISSION_PLATFORM_TENANT';
  if (path.includes('/platform/tenants')) return `${normMethod}_PLATFORM_TENANT`;
  if (path.includes('/platform/announcements')) return `${normMethod}_PLATFORM_ANNOUNCEMENT`;
  if (path.includes('/platform/operators')) return `${normMethod}_PLATFORM_OPERATOR`;
  if (path.includes('/platform/maintenance')) return `${normMethod}_PLATFORM_MAINTENANCE`;
  if (path.includes('/platform/queues')) return `${normMethod}_PLATFORM_QUEUE`;
  if (path.includes('/audit-logs')) return 'READ_AUDIT_LOGS';
  
  return `${normMethod}_${path.replace(/^\/api\//, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase().slice(0, 60)}`;
}

function deriveCategory(pathname) {
  const path = String(pathname || '').toLowerCase();
  if (path.includes('/ai')) return 'ai.governance';
  if (path.includes('/payment') || path.includes('/coupon')) return 'billing.payments';
  if (path.includes('/user') || path.includes('/auth') || path.includes('/employer-application')) return 'iam.users';
  if (path.includes('/system-health') || path.includes('/health')) return 'platform.health';
  if (path.includes('/firebase') || path.includes('/security') || path.includes('/audit')) return 'platform.security';
  if (path.includes('/blog') || path.includes('/page') || path.includes('/review') || path.includes('/trusted-by') || path.includes('/ad')) return 'content.media';
  if (path.includes('/platform/tenant') || path.includes('/enterprise')) return 'enterprise.tenancy';
  return 'system.configuration';
}

function deriveSeverity(method, pathname, statusCode) {
  const status = Number(statusCode) || 200;
  if (status >= 500) return 'HIGH';
  if (status === 401 || status === 403) return 'MEDIUM';
  const normMethod = String(method || '').toUpperCase();
  const path = String(pathname || '').toLowerCase();
  if (normMethod === 'DELETE' || path.includes('delete') || path.includes('purge') || path.includes('refund')) {
    return 'HIGH';
  }
  if (path.includes('firebase-service-account') || path.includes('security') || path.includes('suspend') || path.includes('decommission') || path.includes('/platform/operators') || path.includes('/platform/maintenance')) {
    return 'HIGH';
  }
  if (normMethod === 'POST' || normMethod === 'PUT' || normMethod === 'PATCH') {
    return 'MEDIUM';
  }
  return 'INFO';
}

async function recordAdminAuditLog(arg1, arg2, arg3) {
  let db = null;
  let admin = null;
  let event = {};
  let repo = null;

  if (arg1 && typeof arg1 === 'object' && (arg1.app || arg1.originalUrl || arg1.headers)) {
    const req = arg1;
    event = arg2 || {};
    db = req.app?.get('db');
    admin = req.app?.get('firebaseAdmin');
    repo = req.repository;
  } else {
    db = arg1;
    admin = arg2;
    event = arg3 || {};
  }

  if (!event || typeof event !== 'object') event = {};

  try {
    const id = event.id || crypto.randomUUID();
    const docData = {
      id,
      actorUid: event.actorUid || 'anonymous',
      actorEmail: event.actorEmail || null,
      actorRole: event.actorRole || 'ADMIN',
      action: event.action || 'UNKNOWN_ACTION',
      category: event.category || 'system.general',
      severity: event.severity || 'INFO',
      outcome: event.outcome || ((Number(event.statusCode) || 200) < 400 ? 'SUCCESS' : 'FAILURE'),
      method: event.method || 'GET',
      pathname: event.pathname || '',
      statusCode: Number(event.statusCode) || 200,
      durationMs: Number(event.durationMs) || 0,
      requestId: event.requestId || null,
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent ? String(event.userAgent).slice(0, 200) : null,
      resourceType: event.resourceType || null,
      resourceId: event.resourceId || null,
      metadata: sanitizeAuditValue('metadata', event.metadata || {}),
      occurredAt: event.occurredAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // 1. Primary write to MariaDB repository
    try {
      const activeRepo = repo || (db && typeof db.recordAdminAuditLog === 'function' ? db : null) || getRepository(db);
      if (activeRepo && typeof activeRepo.recordAdminAuditLog === 'function') {
        await activeRepo.recordAdminAuditLog(docData);
      }
    } catch (_) {}

    // 2. Standby replica write to Firestore
    if (db && typeof db.collection === 'function') {
      try {
        const collectionRef = db.collection('admin_audit_logs');
        if (collectionRef && typeof collectionRef.doc === 'function') {
          const docRef = collectionRef.doc(id);
          if (docRef && typeof docRef.set === 'function') {
            docRef.set({
              ...docData,
              createdAt: admin?.firestore?.FieldValue ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
            }).catch(() => {});
          }
        }
      } catch (_) {}
    }

    return docData;
  } catch (_err) {
    return null;
  }
}

function createAdminAuditMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    const originalEnd = res.end;

    res.end = function (...args) {
      originalEnd.apply(res, args);

      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const isSensitiveRead = req.path.includes('/audit-logs') || req.path.includes('/firebase-service-account');

      if (isMutation || isSensitiveRead) {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode;

        const action = deriveAction(req.method, req.path, req.body);
        const category = deriveCategory(req.path);
        const severity = deriveSeverity(req.method, req.path, statusCode);
        const outcome = statusCode < 400 ? 'SUCCESS' : statusCode === 403 ? 'DENIED' : 'FAILURE';

        const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null;
        const ipAddress = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : null;

        recordAdminAuditLog(req, {
          actorUid: req.user?.uid || 'unauthenticated',
          actorEmail: req.user?.email || null,
          actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
          action,
          category,
          severity,
          outcome,
          method: req.method,
          pathname: req.originalUrl || req.path,
          statusCode,
          durationMs,
          requestId: res.locals?.requestId || null,
          ipAddress,
          userAgent: req.get('user-agent'),
          metadata: {
            params: req.params,
            query: req.query,
            body: sanitizeAuditValue('body', req.body || {}),
          },
        }).catch(() => {});
      }
    };

    next();
  };
}

async function queryAdminAuditLogs(dbOrRepo, options = {}) {
  const limitCount = Math.min(Math.max(Number(options.limit) || 50, 1), 200);

  // 1. If explicitly passed a repository with getAdminAuditLogs:
  if (dbOrRepo && typeof dbOrRepo.getAdminAuditLogs === 'function') {
    try {
      const logs = await dbOrRepo.getAdminAuditLogs({
        limit: limitCount,
        actorUid: options.actorUid,
        resourceId: options.resourceId,
        category: options.category,
        severity: options.severity,
        outcome: options.outcome,
        action: options.action,
      });

      let filteredLogs = logs;
      const search = String(options.search || '').trim().toLowerCase();
      if (search) {
        filteredLogs = logs.filter(log => {
          const searchable = [
            log.id, log.actorUid, log.actorEmail, log.actorRole,
            log.action, log.category, log.severity, log.outcome,
            log.method, log.pathname, log.resourceType, log.resourceId,
            log.requestId, log.ipAddress, JSON.stringify(log.metadata || '')
          ].join(' ').toLowerCase();
          return searchable.includes(search);
        });
      }

      return {
        logs: filteredLogs,
        count: filteredLogs.length,
        hasMore: logs.length === limitCount,
        source: 'mariadb-primary',
      };
    } catch (_) {}
  }

  // 2. If passed a Firestore collection/query (real or mock):
  if (dbOrRepo && typeof dbOrRepo.collection === 'function') {
    const db = dbOrRepo;
    const search = String(options.search || '').trim().toLowerCase().slice(0, 200);
    const filterValues = {
      actorUid: options.actorUid ? String(options.actorUid) : '',
      action: options.action ? String(options.action).toUpperCase() : '',
      category: options.category ? String(options.category).toLowerCase() : '',
      severity: options.severity ? String(options.severity).toUpperCase() : '',
      outcome: options.outcome ? String(options.outcome).toUpperCase() : '',
    };
    const hasFilter = Boolean(search || Object.values(filterValues).some(Boolean));
    const searchScanLimit = hasFilter ? Math.min(Math.max(limitCount * 20, 500), 2000) : limitCount;
    let query = db.collection('admin_audit_logs');
    if (typeof query.orderBy === 'function') {
      query = query.orderBy('createdAt', 'desc');
    }
    if (typeof query.limit === 'function') {
      query = query.limit(searchScanLimit);
    }

    if (options.startAfterDocId && typeof db.collection('admin_audit_logs').doc === 'function') {
      const startDoc = await db.collection('admin_audit_logs').doc(String(options.startAfterDocId)).get().catch(() => null);
      if (startDoc?.exists && typeof query.startAfter === 'function') {
        query = query.startAfter(startDoc);
      }
    }

    let snapshot;
    try {
      snapshot = await query.get();
    } catch (err) {
      const isQuotaOrUnavailable = String(err?.message || '').includes('RESOURCE_EXHAUSTED') ||
                                   String(err?.message || '').includes('Quota exceeded') ||
                                   String(err?.message || '').includes('UNAVAILABLE') ||
                                   err?.code === 8 || err?.code === 14 || err?.code === 'resource-exhausted';
      if (isQuotaOrUnavailable) {
        return {
          logs: [],
          count: 0,
          hasMore: false,
          degraded: true,
          quotaLimited: true,
          reason: 'STANDBY_FIRESTORE_QUOTA_LIMITED',
          message: 'Standby audit event store read limit reached.',
        };
      }
      throw err;
    }

    const logs = [];
    if (snapshot && typeof snapshot.forEach === 'function') {
      snapshot.forEach(doc => {
        const data = (typeof doc.data === 'function' ? doc.data() : doc.data) || {};
        const safe = sanitizeAuditValue('record', data) || {};
        const log = {
          id: doc.id,
          ...safe,
          createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : (data.occurredAt || data.createdAt || null),
        };
        if (filterValues.actorUid && log.actorUid !== filterValues.actorUid) return;
        if (filterValues.action && String(log.action || '').toUpperCase() !== filterValues.action) return;
        if (filterValues.category && String(log.category || '').toLowerCase() !== filterValues.category) return;
        if (filterValues.severity && String(log.severity || '').toUpperCase() !== filterValues.severity) return;
        if (filterValues.outcome && String(log.outcome || '').toUpperCase() !== filterValues.outcome) return;
        if (search) {
          const searchable = [
            log.id, log.actorUid, log.actorEmail, log.actorRole,
            log.action, log.category, log.severity, log.outcome,
            log.method, log.pathname, log.resourceType, log.resourceId,
            log.requestId, log.ipAddress, JSON.stringify(log.metadata || '')
          ].join(' ').toLowerCase();
          if (!searchable.includes(search)) return;
        }
        logs.push(log);
      });
    }

    const scannedCount = snapshot?.docs?.length || snapshot?.size || logs.length;
    return {
      logs: logs.slice(0, limitCount),
      count: Math.min(logs.length, limitCount),
      hasMore: hasFilter ? logs.length > limitCount || scannedCount === searchScanLimit : logs.length === limitCount,
      ...(hasFilter ? { searchWindow: scannedCount, searchTruncated: scannedCount === searchScanLimit } : {}),
      source: 'firestore',
    };
  }

  // 3. Global Repository fallback
  try {
    const repo = getRepository();
    if (repo && typeof repo.getAdminAuditLogs === 'function') {
      const logs = await repo.getAdminAuditLogs({ limit: limitCount });
      return { logs, count: logs.length, hasMore: false, source: 'mariadb-primary' };
    }
  } catch (_) {}

  return { logs: [], count: 0, hasMore: false, source: 'none' };
}

module.exports = {
  recordAdminAuditLog,
  createAdminAuditMiddleware,
  queryAdminAuditLogs,
  deriveAction,
  deriveCategory,
  deriveSeverity,
  sanitizeAuditValue,
};
