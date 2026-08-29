'use strict';

/**
 * Vendor-neutral structured request observability.
 *
 * Emits one JSON line per completed HTTP request with request-id correlation,
 * latency, status class, and route path. It never logs request query strings,
 * request bodies, authorization headers, cookies, or personally identifiable
 * user identifiers, so diagnostic output stays safe in shared logs.
 */

const SKIP_PATHS = new Set(['/api/healthz', '/api/readyz']);

function formatDuration(start) {
  try {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return Math.round(ms * 10) / 10;
  } catch {
    return 0;
  }
}

function sanitizedEntry(req, res, start, requestId) {
  const status = Number(res.statusCode || 0);
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  return {
    level,
    msg: 'http_request',
    ts: new Date().toISOString(),
    method: String(req.method || '').toUpperCase(),
    path: String(req.path || '/'),
    status,
    durationMs: formatDuration(start),
    requestId: String(requestId || ''),
    authenticated: Boolean(req.user?.uid) || Boolean(req.serviceAuth),
  };
}

function createRequestObservabilityMiddleware({ enabled = true, skipHealth = true } = {}) {
  return function requestObservability(req, res, next) {
    if (!enabled) return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        if (skipHealth && SKIP_PATHS.has(req.path)) return;
        const requestId = res.locals?.requestId || req.get('x-request-id') || '';
        const entry = sanitizedEntry(req, res, start, requestId);
        if (entry.level === 'error') console.error(JSON.stringify(entry));
        else if (entry.level === 'warn') console.warn(JSON.stringify(entry));
        else console.log(JSON.stringify(entry));
      } catch {
        // Logging must never affect the response lifecycle.
      }
    });
    return next();
  };
}

module.exports = {
  createRequestObservabilityMiddleware,
  sanitizedEntry,
};
