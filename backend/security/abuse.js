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

/**
 * DIR-040: emits the standard RateLimit header family required by the
 * directive. Both the older draft-6 shape (separate RateLimit-Limit /
 * RateLimit-Remaining / RateLimit-Reset) and the current draft-7/8 shape
 * (a single RateLimit-Policy header carrying the quota, remaining and reset)
 * are written, so clients and intermediaries on either spec parse correctly.
 *
 * `resetAt` is an absolute epoch-millisecond instant; the drafts require the
 * delay in SECONDS until the window resets, which is what we emit for Reset and
 * for Retry-After. A reset in the past would be meaningless to a client, so the
 * value is floored at 0.
 */
function applyRateLimitHeaders(res, limit, count, resetAtMs) {
  const remaining = Math.max(0, limit - count);
  const resetSeconds = Math.max(0, Math.ceil((resetAtMs - Date.now()) / 1000));
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
  res.setHeader('RateLimit-Policy', `${limit};w=${Math.ceil((resetAtMs - Date.now()) / 60000)};q=${remaining};r=${resetSeconds}`);
  return resetSeconds;
}

/**
 * Every account/IP burst limit is an atomic MariaDB counter across instances.
 *
 * `failClosed` decides what happens when the durable store cannot be reached:
 *   - true  (default, and every pre-existing limiter): respond 503. Correct for a
 *            SPEND budget such as AI inference, exports or contact submits —
 *            if the counter is unknown, admitting the request would let an
 *            attacker exceed a budget that exists precisely to cap cost.
 *   - false: admit the request. Only ever used by the DIR-040 COARSE tiers,
 *            which are a second line of defence layered ON TOP OF the always
 *            available in-memory global limiter. Failing those closed would let
 *            a brief MariaDB blip return 503 for EVERY /api request, converting
 *            a database hiccup into a total API outage and — worse — pre-empting
 *            the routes' own deliberate fail-closed contracts (a route that is
 *            supposed to answer 403 FORBIDDEN or 503 DATABASE_UNAVAILABLE would
 *            instead receive RATE_LIMIT_UNAVAILABLE and leak a false cause).
 *            Losing a coarse budget during an outage is the lesser risk: the
 *            per-instance global limiter and the spend limiters still apply.
 */
function accountRateLimit({ namespace, limit, windowMs, failClosed = true }) {
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
      const resetSeconds = applyRateLimitHeaders(res, boundedLimit, count, resetAt);
      if (count > boundedLimit) {
        res.setHeader('Retry-After', String(resetSeconds));
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: res.locals.requestId } });
      }
      return next();
    } catch (error) {
      // Only the error MESSAGE is logged: it is a driver/transport string and
      // never carries credentials, keeping the zero-plaintext-secret invariant.
      console.error('[Rate limit store]', namespace, error.message);
      if (!failClosed) {
        // Deliberately emit no RateLimit-* headers: this response was NOT
        // measured against a quota, so advertising one would be a false claim.
        return next();
      }
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

/**
 * DIR-054: the MUTATION budget for messaging.
 *
 * Raised from 30 to 150 per five minutes. The 30 ceiling was never a mutation
 * budget in practice: `app.use('/api/messages', messagingAccountLimiter)` applied
 * it to the passive unread-badge reads too, so four dashboard components polling
 * every 15 seconds (16 req/min) exhausted it in under two minutes and every later
 * tick returned 429 — the console storm this directive exists to kill. Mutations
 * are now measured separately from reads (see messagingReadAccountLimiter below),
 * and 150 keeps a real anti-abuse ceiling on send/create/read-cursor traffic
 * (30 messages per minute per account) while leaving legitimate use untouched.
 */
const messagingAccountLimiter = accountRateLimit({
  namespace: 'messaging',
  limit: Number(process.env.MESSAGING_FIVE_MINUTE_LIMIT || 150),
  windowMs: 5 * 60 * 1000
});

/**
 * DIR-054: the READ-ONLY budget for messaging — GET/HEAD only, which in practice
 * means `GET /api/messages/conversations`, the unread-badge projection.
 *
 * 300 per five minutes (60/min) is a deliberate, generous ceiling: a single
 * shared 15-second poller costs 20 requests per five minutes per open tab, so the
 * budget absorbs ~15 concurrently open tabs before it can ever bind. It is
 * therefore a real defence-in-depth limit against a runaway loop or a scraper,
 * but it can no longer be tripped by the application's own polling cadence.
 *
 * failClosed:false — see accountRateLimit. This tier is stacked on top of the
 * always-available in-memory global limiter and the account-keyed general API
 * tier, so a brief MariaDB blip must not convert a passive badge read into a 503
 * for the whole messaging surface. The route's own fail-closed module gate and
 * the mutation limiter (which stays failClosed:true) are unaffected.
 */
const messagingReadAccountLimiter = accountRateLimit({
  namespace: 'messaging-read',
  limit: Number(process.env.MESSAGING_READ_FIVE_MINUTE_LIMIT || 300),
  windowMs: 5 * 60 * 1000,
  failClosed: false
});

/**
 * DIR-040: whether the automated test environment is in effect.
 *
 * Every other limiter in this file (and in index.js) lifts its ceiling under
 * NODE_ENV=test so certification suites that provision many accounts and crawl
 * 286 endpoints are not throttled. The DIR-040 tiers MUST follow the same
 * convention or the certification/E2E suites start receiving 429s they cannot
 * act on.
 */
const IS_TEST_ENV = process.env.NODE_ENV === 'test';

/**
 * DIR-040: liveness and readiness probes must never be throttled and must never
 * depend on the MariaDB counter store being reachable.
 *
 * `accountRateLimit` fails CLOSED with 503 when the store is unreachable. That is
 * correct for a spend/burst budget, but wiring the coarse tiers ahead of
 * /healthz, /health and /readyz would break the controlled-degradation contract:
 * a MySQL outage must still report liveness, and deploy/DR automation polls these
 * endpoints. They are also plain infrastructure probes with no attacker value,
 * so exempting them costs nothing and preserves the mysql-outage certification.
 */
const INFRA_PROBE_PATHS = new Set([
  '/healthz', '/health', '/health/databases', '/readyz',
  '/platform/version', '/service-availability', '/platform/public-config',
]);

function isInfraProbe(req) {
  return INFRA_PROBE_PATHS.has(req.path);
}

/**
 * DIR-040: public browse/search budget — 60 requests/minute keyed by IP, since
 * an anonymous visitor has no identity token to key on.
 *
 * failClosed:false — see accountRateLimit. This tier is coarse defence-in-depth
 * stacked on the always-available global limiter, so it must never turn a
 * MariaDB blip into a 503 for the whole API.
 */
const publicBrowseAccountLimiter = accountRateLimit({
  namespace: 'public-browse',
  limit: IS_TEST_ENV
    ? Number(process.env.PUBLIC_BROWSE_MINUTE_LIMIT_TEST || 100000)
    : Number(process.env.PUBLIC_BROWSE_MINUTE_LIMIT || 60),
  windowMs: 60_000,
  failClosed: false
});

/**
 * DIR-040: general API budget — 120 requests/minute. Keyed by the authenticated
 * uid when present, falling back to the IP, so one noisy tenant member cannot
 * exhaust a shared NAT's budget while leaving other users unaffected.
 *
 * failClosed:false for the same reason as the browse tier above.
 */
const generalApiAccountLimiter = accountRateLimit({
  namespace: 'general-api',
  limit: IS_TEST_ENV
    ? Number(process.env.GENERAL_API_MINUTE_LIMIT_TEST || 100000)
    : Number(process.env.GENERAL_API_MINUTE_LIMIT || 120),
  windowMs: 60_000,
  failClosed: false
});

/**
 * DIR-040 invariant 1: rate limiting must never lock a verified SuperAdmin out
 * of legitimate management work. Authenticated SuperAdmins therefore bypass the
 * coarse per-tier budgets. This can only ever REDUCE restriction — the bypass
 * is keyed off the verified token claims, never off a client-supplied header or
 * body field, so it cannot be self-asserted.
 */
function superAdminExemption(req) {
  if (!req || !req.user) return false;
  try {
    const { isSuperAdmin } = require('./auth');
    return Boolean(isSuperAdmin(req.user));
  } catch (_) {
    return false;
  }
}

/**
 * Wraps a durable limiter so that (a) infrastructure probes always pass through
 * untouched, and (b) verified SuperAdmins skip the coarse budget.
 *
 * NOTE ON ORDERING: the SuperAdmin exemption only has an effect when req.user is
 * already populated. index.js therefore installs the DIR-040 tiers AFTER
 * requireAuth, which is also what makes the "per user token" keying in the
 * directive real rather than a comment.
 */
function withCoarseTierBypass(middleware) {
  return function bypassingTierLimiter(req, res, next) {
    if (isInfraProbe(req)) return next();
    if (superAdminExemption(req)) return next();
    return middleware(req, res, next);
  };
}

const publicBrowseLimiter = withCoarseTierBypass(publicBrowseAccountLimiter);
const generalApiLimiter = withCoarseTierBypass(generalApiAccountLimiter);

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
    if (injectedCounterStore) {
      const uidHash = crypto.createHash('sha256').update(req.user.uid).digest('hex').slice(0, 40);
      const day = dayKey();
      const limit = Number(process.env.AI_BASIC_DAILY_LIMIT || 100);
      const resCount = await injectedCounterStore.increment(`ai-quota:${day}:${uidHash}`, { ttlMs: 86400000 });
      const count = Number(resCount?.count || 1);
      if (count > limit) {
        const error = new Error('AI_DAILY_QUOTA_EXCEEDED');
        error.status = 429;
        throw error;
      }
      res.setHeader('X-AI-Daily-Limit', String(limit));
      res.setHeader('X-AI-Daily-Remaining', String(Math.max(0, limit - count)));
      return next();
    }
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
  applyRateLimitHeaders,
  configureAbuseCounterStoreForTests,
  aiAccountLimiter,
  notificationAccountLimiter,
  exportAccountLimiter,
  scraperAccountLimiter,
  contactAccountLimiter,
  messagingAccountLimiter,
  messagingReadAccountLimiter,
  publicBrowseAccountLimiter,
  publicBrowseLimiter,
  generalApiAccountLimiter,
  generalApiLimiter,
  superAdminExemption,
  withCoarseTierBypass,
  isInfraProbe,
  INFRA_PROBE_PATHS,
  IS_TEST_ENV,
  enforceDailyAiQuota,
  bindNotificationRecipient,
};
