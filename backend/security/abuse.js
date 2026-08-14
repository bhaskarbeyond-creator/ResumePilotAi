const crypto = require('crypto');

const buckets = new Map();

function identityKey(req) {
  return req.user?.uid || req.ip || 'unknown';
}

/** Lightweight per-account limiter. Production should additionally use a shared Redis store. */
function accountRateLimit({ namespace, limit, windowMs }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${namespace}:${identityKey(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: res.locals.requestId } });
    }
    return next();
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

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Durable daily AI quota. The transaction prevents concurrent requests bypassing the
 * counter. A request is charged before provider invocation (including provider errors).
 */
async function enforceDailyAiQuota(req, res, next) {
  const db = req.app.get('db');
  if (!db) {
    return res.status(503).json({ error: { code: 'AI_QUOTA_UNAVAILABLE', message: 'AI service is temporarily unavailable', requestId: res.locals.requestId } });
  }
  try {
    const uidHash = crypto.createHash('sha256').update(req.user.uid).digest('hex').slice(0, 40);
    const ref = db.collection('ai_usage').doc(`${dayKey()}_${uidHash}`);
    const userSnap = await db.collection('users').doc(req.user.uid).get();
    const tier = String(userSnap.data()?.membership || 'Basic').toLowerCase();
    const limit = tier === 'premium'
      ? Number(process.env.AI_PREMIUM_DAILY_LIMIT || 100)
      : Number(process.env.AI_BASIC_DAILY_LIMIT || 10);
    let count = 0;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      count = Number(snap.data()?.count || 0) + 1;
      if (count > limit) {
        const error = new Error('AI_DAILY_QUOTA_EXCEEDED');
        error.status = 429;
        throw error;
      }
      tx.set(ref, {
        uid: req.user.uid,
        day: dayKey(),
        count,
        limit,
        updatedAt: new Date()
      }, { merge: true });
    });
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
  aiAccountLimiter,
  notificationAccountLimiter,
  exportAccountLimiter,
  scraperAccountLimiter,
  contactAccountLimiter,
  enforceDailyAiQuota,
  bindNotificationRecipient,
  _buckets: buckets
};
