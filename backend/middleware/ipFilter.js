'use strict';

/**
 * Module 5: IP Access Control & Automated Jail Middleware (FP-A07)
 * Intercepts requests, evaluates CIDR/IP blacklist and jail status,
 * and returns 403 Forbidden for restricted IP addresses.
 */

const { isIpBlocked, normalizeIp } = require('../services/ipAccessService');

function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (first) return normalizeIp(first);
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

async function ipFilter(req, res, next) {
  // Liveness / readiness bypass
  const path = req.path || '';
  if (path === '/health' || path === '/api/health' || path === '/favicon.ico') {
    return next();
  }

  const clientIp = extractClientIp(req);
  req.clientIp = clientIp;

  try {
    const check = await isIpBlocked(clientIp);
    if (check.blocked) {
      return res.status(403).json({
        error: {
          code: 'IP_ACCESS_DENIED',
          message: 'Access from your IP address has been restricted by platform security policy.',
          clientIp,
          ruleType: check.rule?.ruleType || 'DENY',
          expiresAt: check.rule?.expiresAt || null,
          requestId: res.locals?.requestId,
        },
      });
    }
    return next();
  } catch (error) {
    // Fail OPEN on filter execution errors so that network outages don't brick the application
    console.error('[IpFilter] Error checking IP status:', error?.message);
    return next();
  }
}

module.exports = {
  extractClientIp,
  ipFilter,
};
