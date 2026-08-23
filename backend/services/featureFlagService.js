/**
 * Runtime Feature Flag Service
 * 
 * Reads flags from Firestore `settings/feature_flags` first, falling back to
 * process.env. Every mutation is audited. The service is designed to be used
 * by both the Enterprise feature gate and the new Super Admin Feature Flags UI.
 * 
 * Flags that require a server restart are clearly marked. Toggling them via the
 * API updates the stored value and the audit trail, but the actual runtime
 * behavior only changes after the next restart (for worker-based flags) or
 * immediately (for per-request flags like ENTERPRISE_TENANCY_ENABLED).
 */

const FLAG_DEFINITIONS = {
  ENTERPRISE_TENANCY_ENABLED: {
    description: 'Enable Enterprise multi-tenancy platform',
    impact: 'When enabled, /api/enterprise/* routes become active. When disabled, all Enterprise routes return 404.',
    requiresRestart: false,
    category: 'enterprise',
    securityRisk: 'medium',
    defaultValue: false,
    dependencies: ['Firestore tenant repository', 'Enterprise route middleware'],
  },
  CMS_SCHEDULER_ENABLED: {
    description: 'Enable blog CMS scheduled publishing worker',
    impact: 'When enabled, a background worker polls for scheduled blog posts and publishes them automatically.',
    requiresRestart: true,
    category: 'workers',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: ['Firestore blog collection'],
  },
  NOTIFICATION_OUTBOX_WORKER_ENABLED: {
    description: 'Enable notification outbox local worker',
    impact: 'When enabled, a background worker processes queued notifications (email, SMS) from the outbox.',
    requiresRestart: true,
    category: 'workers',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: ['Firestore notification_outbox collection', 'SMTP/Twilio configuration'],
  },
  ENTERPRISE_OUTBOX_WORKER_ENABLED: {
    description: 'Enable Enterprise durable outbox worker',
    impact: 'When enabled, processes HMAC-signed enterprise job envelopes with dead-letter queue support.',
    requiresRestart: true,
    category: 'enterprise',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: ['TENANT_JOB_SIGNING_SECRET', 'Firestore enterprise_outbox collection'],
  },
  NOTIFICATION_OUTBOX_EXTERNAL_WORKER: {
    description: 'Declare external notification worker',
    impact: 'When true, the platform reports an external worker handles notifications instead of the built-in one.',
    requiresRestart: false,
    category: 'workers',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: [],
  },
  PDF_RENDERER_ISOLATED: {
    description: 'Declare PDF renderer runs in isolated worker',
    impact: 'Reports the PDF rendering subsystem as isolated for security and resource management.',
    requiresRestart: false,
    category: 'services',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: [],
  },
  ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION: {
    description: 'Allow Firebase credential rotation via Admin API',
    impact: 'When enabled (non-production only), Firebase service account credentials can be rotated via the Admin API without redeployment.',
    requiresRestart: false,
    category: 'security',
    securityRisk: 'high',
    defaultValue: false,
    dependencies: ['Firebase Admin SDK'],
  },
};

const FIRESTORE_DOC = 'settings/feature_flags';

function timestampToIso(value) {
  if (!value) return null;
  try {
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch (_) { return null; }
}

// In-memory cache. Refreshed on read if stale, and immediately on write.
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get the Firestore-stored flag overrides.
 * @param {FirebaseFirestore.Firestore} db
 * @returns {Promise<Record<string, { value: boolean, changedAt: any, changedBy: string }>>}
 */
async function _loadFromFirestore(db) {
  if (!db) return {};
  try {
    const doc = await db.doc(FIRESTORE_DOC).get();
    return doc.exists ? (doc.data() || {}) : {};
  } catch {
    return {};
  }
}

/**
 * Get the effective value of a single flag.
 * Priority: Firestore override > process.env > default.
 */
async function getFlagValue(db, flagKey) {
  const def = FLAG_DEFINITIONS[flagKey];
  if (!def) return undefined;

  // Try Firestore first
  if (db) {
    const now = Date.now();
    if (!_cache || (now - _cacheTime) > CACHE_TTL_MS) {
      _cache = await _loadFromFirestore(db);
      _cacheTime = now;
    }
    if (_cache[flagKey] && typeof _cache[flagKey].value === 'boolean') {
      return _cache[flagKey].value;
    }
  }

  // Fallback to process.env
  const envVal = process.env[flagKey];
  if (envVal !== undefined) {
    return String(envVal).toLowerCase() === 'true';
  }

  return def.defaultValue;
}

/**
 * Get all flags with their effective values and metadata.
 * Used by the Super Admin Feature Flags UI.
 */
async function getAllFlags(db) {
  const stored = db ? await _loadFromFirestore(db) : {};
  const result = {};

  for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
    const override = stored[key];
    const envVal = process.env[key];
    let effectiveValue;
    let source;

    if (override && typeof override.value === 'boolean') {
      effectiveValue = override.value;
      source = 'firestore';
    } else if (envVal !== undefined) {
      effectiveValue = String(envVal).toLowerCase() === 'true';
      source = 'environment';
    } else {
      effectiveValue = def.defaultValue;
      source = 'default';
    }

    result[key] = {
      value: effectiveValue,
      source,
      ...def,
      // Environment values are startup-bound even when the same flag supports a
      // Firestore runtime override. The UI must show the effective restart rule.
      requiresRestart: source === 'environment' ? true : def.requiresRestart,
      lastChangedAt: timestampToIso(override?.changedAt),
      lastChangedBy: override?.changedBy || null,
      auditEvent: override?.changedAt ? 'FEATURE_FLAG_CHANGED' : null,
    };
  }

  return result;
}

/**
 * Set a flag value. Audited, SUPER_ADMIN only.
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} admin - Firebase Admin SDK
 * @param {string} flagKey
 * @param {boolean} value
 * @param {string} actorUid
 * @param {string} requestId
 */
async function setFlagValue(db, admin, flagKey, value, actorUid, requestId) {
  const def = FLAG_DEFINITIONS[flagKey];
  if (!def) throw Object.assign(new Error(`Unknown feature flag: ${flagKey}`), { code: 'UNKNOWN_FEATURE_FLAG', status: 400 });
  if (typeof value !== 'boolean') throw Object.assign(new Error('Flag value must be a boolean'), { code: 'INVALID_FLAG_VALUE', status: 400 });
  if (!db || !admin?.firestore?.FieldValue) {
    throw Object.assign(new Error('Feature flag storage is unavailable'), { code: 'FEATURE_FLAGS_UNAVAILABLE', status: 503 });
  }
  if (!actorUid) throw Object.assign(new Error('An authenticated actor is required'), { code: 'AUTH_REQUIRED', status: 401 });

  let previousValue;
  await db.runTransaction(async transaction => {
    const reference = db.doc(FIRESTORE_DOC);
    const snapshot = await transaction.get(reference);
    const stored = snapshot.data() || {};
    const envValue = process.env[flagKey];
    previousValue = stored[flagKey]?.value === true || stored[flagKey]?.value === false
      ? stored[flagKey].value
      : envValue !== undefined ? String(envValue).toLowerCase() === 'true' : def.defaultValue;
    const auditRef = db.collection('security_audit_logs').doc();
    transaction.set(reference, {
      [flagKey]: {
        value,
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        changedBy: actorUid,
      },
    }, { merge: true });
    transaction.set(auditRef, {
      action: 'FEATURE_FLAG_CHANGED',
      flag: flagKey,
      previousValue,
      newValue: value,
      requiresRestart: def.requiresRestart,
      actorUid,
      requestId: requestId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  _cache = null;
  _cacheTime = 0;
  return {
    flag: flagKey,
    value,
    previousValue,
    requiresRestart: def.requiresRestart,
    description: def.description,
    auditEvent: 'FEATURE_FLAG_CHANGED',
  };
}

module.exports = {
  FLAG_DEFINITIONS,
  getFlagValue,
  getAllFlags,
  setFlagValue,
};
