'use strict';

const crypto = require('crypto');

const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|token|privatekey|credential|keysecret|card|cvv|authorization|cookie|session)/i;

function sanitizeAuditValue(key, value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY_PATTERN.test(String(key))) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
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
  if (path === '/api/admin/users' && normMethod === 'POST') return 'USER_PROVISIONED';
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
  if (path.includes('/platform/tenants')) return `${normMethod}_PLATFORM_TENANT`;
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
  if (path.includes('firebase-service-account') || path.includes('security') || path.includes('suspend')) {
    return 'HIGH';
  }
  if (normMethod === 'POST' || normMethod === 'PUT' || normMethod === 'PATCH') {
    return 'MEDIUM';
  }
  return 'INFO';
}

async function recordAdminAuditLog(db, admin, event) {
  if (!db || !admin?.firestore?.FieldValue) {
    console.warn('[AdminAudit] Firestore DB not available, skipping audit log write');
    return null;
  }
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
      outcome: event.outcome || (event.statusCode < 400 ? 'SUCCESS' : 'FAILURE'),
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const collectionRef = db.collection('admin_audit_logs');
    if (!collectionRef || typeof collectionRef.doc !== 'function') return null;
    const docRef = collectionRef.doc(id);
    if (!docRef || typeof docRef.set !== 'function') return null;

    await docRef.set(docData);

    // Also mirror HIGH / CRITICAL events to global security_audit_logs
    if (['HIGH', 'CRITICAL'].includes(docData.severity)) {
      try {
        const secCol = db.collection('security_audit_logs');
        if (secCol && typeof secCol.doc === 'function') {
          const secDoc = secCol.doc();
          if (secDoc && typeof secDoc.set === 'function') {
            await secDoc.set({
              action: docData.action,
              actorUid: docData.actorUid,
              actorEmail: docData.actorEmail,
              category: docData.category,
              severity: docData.severity,
              pathname: docData.pathname,
              requestId: docData.requestId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      } catch (mirrorErr) {
        console.warn('[AdminAudit] Error mirroring to security_audit_logs:', mirrorErr.message);
      }
    }

    return docData;
  } catch (err) {
    console.error('[AdminAudit] Failed to record admin audit log:', err);
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
        // A route may synchronously write a richer domain audit record before
        // responding. Do not duplicate that success record with a generic
        // middleware event; denied/failed requests still flow through here.
        if (res.locals?.adminAuditRecorded === true) return;
        const db = req.app?.get('db');
        const admin = req.app?.get('firebaseAdmin');
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode;

        const action = deriveAction(req.method, req.path, req.body);
        const category = deriveCategory(req.path);
        const severity = deriveSeverity(req.method, req.path, statusCode);
        const outcome = statusCode < 400 ? 'SUCCESS' : statusCode === 403 ? 'DENIED' : 'FAILURE';

        const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null;
        const ipAddress = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : null;

        recordAdminAuditLog(db, admin, {
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
        }).catch((err) => {
          console.warn('[AdminAuditMiddleware] Async log error:', err.message);
        });
      }
    };

    next();
  };
}

async function queryAdminAuditLogs(db, options = {}) {
  if (!db) {
    throw Object.assign(new Error('Database unavailable'), { status: 503 });
  }

  const limitCount = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  let query = db.collection('admin_audit_logs');

  if (options.actorUid) {
    query = query.where('actorUid', '==', String(options.actorUid));
  }
  if (options.action) {
    query = query.where('action', '==', String(options.action).toUpperCase());
  }
  if (options.category) {
    query = query.where('category', '==', String(options.category).toLowerCase());
  }
  if (options.severity) {
    query = query.where('severity', '==', String(options.severity).toUpperCase());
  }
  if (options.outcome) {
    query = query.where('outcome', '==', String(options.outcome).toUpperCase());
  }

  query = query.orderBy('createdAt', 'desc').limit(limitCount);

  if (options.startAfterDocId) {
    const startDoc = await db.collection('admin_audit_logs').doc(String(options.startAfterDocId)).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }

  const snapshot = await query.get();
  const logs = [];
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    logs.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.occurredAt || null,
    });
  });

  return {
    logs,
    count: logs.length,
    hasMore: logs.length === limitCount,
  };
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
