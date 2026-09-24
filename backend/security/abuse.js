const crypto = require('crypto');
const { resolveEffectiveEntitlement } = require('./entitlements');

let injectedCounterStore = null;

function counterStore() {
  if (injectedCounterStore) return injectedCounterStore;
  if (process.env.DEGRADED_MODE_REPOSITORY === 'inmemory' && process.env.NODE_ENV !== 'production') {
    const { InMemoryCounterStore } = require('./inMemoryCounterStore');
    injectedCounterStore = new InMemoryCounterStore();
    return injectedCounterStore;
  }
  const { MySqlAtomicCounterStore } = require('../enterprise/mysqlAtomicCounterStore');
  injectedCounterStore = new MySqlAtomicCounterStore({ pool: require('../database/mysql').getPool() });
  return injectedCounterStore;
}

function configureAbuseCounterStoreForTests(store = null) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Rate-limit store injection is forbidden in production');
  }
  injectedCounterStore = store;
}

function identityKey(req) {
  return req.user?.uid || req.ip || 'unknown';
}

/** Every account/IP burst limit is an atomic MariaDB counter across instances. */
function accountRateLimit({ namespace, limit, windowMs }) {
  const boundedLimit = Number(limit);
  const boundedWindow = Number(windowMs);
  if (!/^[a-z0-9:-]{1,64}$/i.test(namespace) || !Number.isSafeInteger(boundedLimit) || boundedLimit < 1
    || !Number.isSafeInteger(boundedWindow) || boundedWindow < 1000) {
    throw new Error(`Invalid durable rate-limit configuration: ${namespace}`);
  }
  return async (req, res, next) => {
    try {
      const result = await counterStore().increment(`consumer-rate:${namespace}:${identityKey(req)}`, { ttlMs: boundedWindow });
      const count = Number(result.count);
      const resetAt = Number(result.expiresAt);
      res.setHeader('RateLimit-Limit', String(boundedLimit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, boundedLimit - count)));
      res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      if (count > boundedLimit) {
        res.setHeader('Retry-After', String(Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))));
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: res.locals.requestId } });
      }
      return next();
    } catch (error) {
      console.error('[Rate limit store]', error.message);
      return res.status(503).json({ error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Request admission is temporarily unavailable', requestId: res.locals.requestId } });
    }
  };
}

const aiAccountLimiter = accountRateLimit({
  namespace: 'ai',
  limit: Number(process.env.AI_BURST_LIMIT || 12),
  windowMs: Number(process.env.AI_BURST_WINDOW_MS || 60_000)
});

const notificationAccountLimiter = accountRateLimit({
  namespace: 'notification',
  limit: Number(process.env.NOTIFICATION_HOURLY_LIMIT || 8),
  windowMs: 60 * 60 * 1000
});

const exportAccountLimiter = accountRateLimit({
  namespace: 'document-export',
  limit: Number(process.env.EXPORT_HOURLY_LIMIT || 20),
  windowMs: 60 * 60 * 1000
});

const scraperAccountLimiter = accountRateLimit({
  namespace: 'job-scraper',
  limit: Number(process.env.SCRAPER_HOURLY_LIMIT || 2),
  windowMs: 60 * 60 * 1000
});

const contactAccountLimiter = accountRateLimit({
  namespace: 'contact',
  limit: Number(process.env.CONTACT_HOURLY_LIMIT || 3),
  windowMs: 60 * 60 * 1000
});

const messagingAccountLimiter = accountRateLimit({
  namespace: 'messaging',
  limit: Number(process.env.MESSAGING_FIVE_MINUTE_LIMIT || 30),
  windowMs: 5 * 60 * 1000
});

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Durable daily AI quota — MySQL authoritative.
 * The MySQL row lock (SELECT ... FOR UPDATE) prevents concurrent requests
 * bypassing the counter. A request is charged before provider invocation
 * (including provider errors). MariaDB is the only quota ledger; failures fail closed.
 */
async function enforceDailyAiQuota(req, res, next) {
  try {
    const uidHash = crypto.createHash('sha256').update(req.user.uid).digest('hex').slice(0, 40);
    const day = dayKey();
    const pool = require('../database/mysql').getPool();
    let limit = Number(process.env.AI_BASIC_DAILY_LIMIT || 10);
    let count = 0;
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [userRows] = await conn.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
        const userData = userRows[0] || {};
        const [quotaRows] = await conn.query("SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1");
        const quotaConfig = quotaRows[0]
          ? (typeof quotaRows[0].data === 'string' ? JSON.parse(quotaRows[0].data) : quotaRows[0].data)
          : {};
        const entitlement = resolveEffectiveEntitlement(userData, {
          userClaims: req.user || {},
          tenantData: req.tenantContext?.tenant || null,
          quotaConfig,
        });
        limit = entitlement.dailyLimit;
        const [rows] = await conn.query(
          'SELECT count FROM ai_usage WHERE day_key = ? AND uid_hash = ? FOR UPDATE',
          [day, uidHash]
        );
        count = rows.length ? Number(rows[0].count || 0) + 1 : 1;
        if (count > limit) {
          const error = new Error('AI_DAILY_QUOTA_EXCEEDED');
          error.status = 429;
          throw error;
        }
        await conn.query(
          `INSERT INTO ai_usage (day_key, uid_hash, uid, email, count, limit_used, last_used_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE count = VALUES(count), email = VALUES(email), limit_used = VALUES(limit_used), last_used_at = CURRENT_TIMESTAMP`,
          [day, uidHash, req.user.uid, String(req.user?.email || '').slice(0, 255), count, limit]
        );
        await conn.commit();
        break;
      } catch (err) {
        try { await conn.rollback(); } catch { /* broken connection */ }
        const isDeadlock = err?.code === 'ER_LOCK_DEADLOCK' || err?.errno === 1213 || (err?.message && err.message.includes('Deadlock'));
        if (isDeadlock && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 25 * attempts + Math.floor(Math.random() * 25)));
          continue;
        }
        throw err;
      } finally {
        conn.release();
      }
    }
    res.setHeader('X-AI-Daily-Limit', String(limit));
    res.setHeader('X-AI-Daily-Remaining', String(Math.max(0, limit - count)));
    return next();
  } catch (error) {
    if (error.status === 429 || error.message === 'AI_DAILY_QUOTA_EXCEEDED') {
      return res.status(429).json({ error: { code: 'AI_DAILY_QUOTA_EXCEEDED', message: 'Daily AI quota reached', requestId: res.locals.requestId } });
    }
    console.error('[AI quota]', error.message);
    return res.status(503).json({ error: { code: 'AI_QUOTA_UNAVAILABLE', message: 'AI service is temporarily unavailable', requestId: res.locals.requestId } });
  }
}

/** Normal users may only trigger notifications to the email in their verified token. */
function bindNotificationRecipient(req, res, next) {
  const ownEmail = String(req.user?.email || '').trim().toLowerCase();
  if (!ownEmail) return res.status(403).json({ error: { code: 'VERIFIED_EMAIL_REQUIRED', message: 'Verified email required', requestId: res.locals.requestId } });
  const fields = ['to', 'toEmail', 'customerEmail', 'userEmail', 'applicantEmail', 'employerEmail'];
  for (const field of fields) {
    if (req.body?.[field] && String(req.body[field]).trim().toLowerCase() !== ownEmail) {
      return res.status(403).json({ error: { code: 'RECIPIENT_MISMATCH', message: 'Notification recipient must match the authenticated account', requestId: res.locals.requestId } });
    }
  }
  // Handlers have several legacy field names. Force all user-facing variants to the token email.
  if (req.body) {
    for (const field of fields) if (field in req.body) req.body[field] = ownEmail;
  }
  return next();
}

module.exports = {
  accountRateLimit,
  configureAbuseCounterStoreForTests,
  aiAccountLimiter,
  notificationAccountLimiter,
  exportAccountLimiter,
  scraperAccountLimiter,
  contactAccountLimiter,
  messagingAccountLimiter,
  enforceDailyAiQuota,
  bindNotificationRecipient,
};
