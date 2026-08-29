/**
 * Runtime Feature Flag Service
 *
 * Reads flag overrides from MySQL `system_settings` (category
 * 'feature_flags') first, falling back to process.env, then defaults.
 * MySQL/MariaDB is the authoritative store — the service has no dependency on
 * any external secondary database. Every mutation is audited. The service is
 * used by both the Enterprise feature gate and the Super Admin Feature Flags UI.
 *
 * Flags that require a server restart are clearly marked. Toggling them via the
 * API updates the stored value and the audit trail, but the actual runtime
 * behavior only changes after the next restart (for worker-based flags) or
 * immediately (for per-request flags like ENTERPRISE_TENANCY_ENABLED).
 */

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const FLAGS_CATEGORY = 'feature_flags';

const FLAG_DEFINITIONS = {
  ENTERPRISE_TENANCY_ENABLED: {
    description: 'Enable Enterprise multi-tenancy platform',
    impact: 'When enabled, /api/enterprise/* routes become active. When disabled, all Enterprise routes return 404.',
    requiresRestart: false,
    category: 'enterprise',
    securityRisk: 'medium',
    defaultValue: false,
    dependencies: ['Enterprise tenant repository', 'Enterprise route middleware'],
  },
  CMS_SCHEDULER_ENABLED: {
    description: 'Enable blog CMS scheduled publishing worker',
    impact: 'When enabled, a background worker polls for scheduled blog posts and publishes them automatically.',
    requiresRestart: true,
    category: 'workers',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: ['MariaDB blog table'],
  },
  NOTIFICATION_OUTBOX_WORKER_ENABLED: {
    description: 'Enable notification outbox local worker',
    impact: 'When enabled, a background worker processes queued notifications (email, SMS) from the MariaDB outbox.',
    requiresRestart: true,
    category: 'workers',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: ['MariaDB notification_outbox table', 'SMTP/Twilio configuration'],
  },
  ENTERPRISE_OUTBOX_WORKER_ENABLED: {
    description: 'Enable Enterprise durable outbox worker',
    impact: 'When enabled, processes HMAC-signed enterprise job envelopes with dead-letter queue support.',
    requiresRestart: true,
    category: 'enterprise',
    securityRisk: 'low',
    defaultValue: false,
    dependencies: ['TENANT_JOB_SIGNING_SECRET'],
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
    dependencies: ['Firebase Admin SDK (identity only)'],
  },
};

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
 * Load the MySQL-stored flag overrides from system_settings.
 * @returns {Promise<Record<string, { value: boolean, changedAt: any, changedBy: string }>>}
 */
async function _loadFromMysql() {
  const [rows] = await getPool().query(
    'SELECT data FROM system_settings WHERE category = ?',
    [FLAGS_CATEGORY]
  );
  if (!rows.length) return {};
  const parsed = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data || {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Get the effective value of a single flag.
 * Priority: MySQL override > process.env > default.
 */
async function getFlagValue(flagKey) {
  const def = FLAG_DEFINITIONS[flagKey];
  if (!def) return undefined;

  const now = Date.now();
  if (!_cache || (now - _cacheTime) > CACHE_TTL_MS) {
    try {
      _cache = await _loadFromMysql();
      _cacheTime = now;
    } catch (_) {
      if (!_cache) _cache = {};
    }
  }
  if (_cache && _cache[flagKey] && typeof _cache[flagKey].value === 'boolean') {
    return _cache[flagKey].value;
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
async function getAllFlags() {
  const stored = await _loadFromMysql();
  const result = {};

  for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
    const override = stored[key];
    const envVal = process.env[key];
    let effectiveValue;
    let source;

    if (override && typeof override.value === 'boolean') {
      effectiveValue = override.value;
      source = 'mysql';
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
      // Environment values are startup-bound even when the same flag supports
      // a MySQL runtime override. The UI must show the effective restart rule.
      requiresRestart: source === 'environment' ? true : def.requiresRestart,
      lastChangedAt: timestampToIso(override?.changedAt),
      lastChangedBy: override?.changedBy || null,
      auditEvent: override?.changedAt ? 'FEATURE_FLAG_CHANGED' : null,
    };
  }

  return result;
}

/**
 * Set a flag value. Audited, SUPER_ADMIN only. MySQL/MariaDB is the
 * authoritative store; the flag override and its audit event commit in ONE
 * transaction.
 */
async function setFlagValue(flagKey, value, actorUid, requestId) {
  const def = FLAG_DEFINITIONS[flagKey];
  if (!def) throw Object.assign(new Error(`Unknown feature flag: ${flagKey}`), { code: 'UNKNOWN_FEATURE_FLAG', status: 400 });
  if (typeof value !== 'boolean') throw Object.assign(new Error('Flag value must be a boolean'), { code: 'INVALID_FLAG_VALUE', status: 400 });
  if (!actorUid) throw Object.assign(new Error('An authenticated actor is required'), { code: 'AUTH_REQUIRED', status: 401 });

  const pool = getPool();
  const conn = await pool.getConnection();
  let previousValue;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT data, revision FROM system_settings WHERE category = ? FOR UPDATE',
      [FLAGS_CATEGORY]
    );
    const stored = rows.length
      ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data || {}))
      : {};
    const envValue = process.env[flagKey];
    previousValue = stored[flagKey]?.value === true || stored[flagKey]?.value === false
      ? stored[flagKey].value
      : envValue !== undefined ? String(envValue).toLowerCase() === 'true' : def.defaultValue;

    const nextStored = {
      ...stored,
      [flagKey]: { value, changedAt: new Date().toISOString(), changedBy: actorUid },
    };
    const currentRevision = Number(rows[0]?.revision || 0);
    await conn.query(
      `INSERT INTO system_settings (category, data, revision, updated_at) VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE data = VALUES(data), revision = VALUES(revision), updated_at = NOW()`,
      [FLAGS_CATEGORY, JSON.stringify(nextStored), currentRevision + 1]
    );
    // Durable security audit event in the SAME transaction.
    await conn.query(
      `INSERT INTO security_audit_logs (id, action, actor_uid, category, severity, metadata, request_id, created_at)
       VALUES (?, 'FEATURE_FLAG_CHANGED', ?, 'platform.flags', 'MEDIUM', ?, ?, NOW())`,
      [
        crypto.randomUUID(),
        actorUid,
        JSON.stringify({ flag: flagKey, previousValue, newValue: value, requiresRestart: def.requiresRestart }),
        requestId || null,
      ]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw Object.assign(new Error('Feature flag storage is unavailable'), { code: 'FEATURE_FLAGS_UNAVAILABLE', status: 503, cause: err });
  } finally {
    conn.release();
  }

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
