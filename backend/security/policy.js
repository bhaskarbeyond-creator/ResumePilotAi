const { permissionsFor } = require('./auth');
const { satisfies } = require('../services/adminRbac');
const { resolveRoutePermission } = require('./routeManifest');

const ADMIN_PREFIXES = [
  '/admin/',
  '/email/admin/',
  '/platform/'
];

const ADMIN_EXACT = new Set([
  '/admin',
  '/platform',
  '/send-sms',
  '/email/logs',
  '/auth/purge-orphaned-auth',
  '/auth/linkedin/test-credentials',
  '/auth/github/test-credentials',
  '/notify/security-alert',
  '/notify/job-application',
  '/notify/job-status-update',
  '/notify/job-posted'
]);

const VERIFIED_PREFIXES = [
  '/generate-', '/check-grammar', '/ai/', '/live-interview/', '/pay', '/paypal/', '/razorpay/',
  '/paytm/', '/phonepe/', '/export', '/invoice',
  '/linkedin-scraper', '/subscription/', '/account/', '/messages/', '/jobs/', '/job-applications/', '/employer/', '/notify/', '/email/', '/admin/ai', '/platform/'
];

function isAdminPath(pathname) {
  return ADMIN_EXACT.has(pathname) || ADMIN_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function requiresVerifiedEmail(pathname) {
  return VERIFIED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * Permission check for the route policy.
 *
 * Routed through the RBAC resolver's `satisfies` so the action hierarchy applies
 * uniformly: a role holding `payments:manage` passes a `payments.read` gate, and
 * `system.config:write` satisfies the `system.config.read` default that guards
 * every unlisted admin GET. Before REC-005 this compared literal strings, so the
 * hierarchy existed in the data model but not on the request path — which is why
 * ADMIN was refused reads of settings it could already write.
 *
 * @param {object} req
 * @param {string|string[]} permission one permission or an any-of list
 * @returns {boolean}
 */
function hasPermission(req, permission) {
  return satisfies(permissionsFor(req.user), permission);
}

function isReadMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

/**
 * Least-privilege permission for a read of an admin path.
 *
 * Thin adapter over the declarative manifest (`security/routeManifest.js`), kept
 * because callers and tests ask this question by path. The ladder it replaced is
 * gone: it answered "system.config.read" for anything it did not recognise, which
 * made an unlisted route indistinguishable from a restricted one.
 *
 * @param {string} pathname mount-relative path
 * @returns {string|string[]|null} permission(s), or `null` when unconfinable
 */
function resolveAdminReadPermission(pathname) {
  return resolveRoutePermission(pathname, 'GET')?.permission ?? null;
}

/**
 * Least-privilege permission for a mutation of an admin path.
 * @param {string} pathname mount-relative path
 * @returns {string|string[]|null} permission(s), or `null` when unconfinable
 */
function resolveAdminMutationPermission(pathname) {
  return resolveRoutePermission(pathname, 'POST')?.permission ?? null;
}

/**
 * Denial envelope.
 *
 * `success: false` is included so a client can branch on one field for every error the
 * API returns — a handler error, a policy denial and an authentication failure now share
 * a shape. Before this, a client had to check both `response.ok` and whether `success`
 * was present, which is how a 403 came to be read as a successful empty body.
 */
function deny(res, code, message) {
  return res.status(403).json({ success: false, error: { code, message, requestId: res.locals.requestId } });
}

const RECENT_AUTHENTICATION_PATHS = new Set(['/account/delete', '/users-data/mfa/disable']);

/** Route-level authorization policy installed after requireAuth. */
function enforceApiPolicy(req, res, next) {
  const pathname = req.path;
  const read = isReadMethod(req.method);

  if (!read) {
    const elevatedPermission = pathname === '/admin/firebase-service-account'
      ? 'secrets.manage'
      : (pathname.startsWith('/admin/payments/') || pathname === '/admin/payment-settings' || pathname === '/admin/payment/test-provider'
        ? 'payments.manage'
        : (pathname.startsWith('/admin/employer-applications/') ? 'users.update' : null));
    if (elevatedPermission && !hasPermission(req, elevatedPermission)) {
      return deny(res, 'FORBIDDEN', 'Insufficient permission');
    }
  } else if (pathname === '/admin/firebase-service-account' && !hasPermission(req, 'secrets.manage')) {
    return deny(res, 'FORBIDDEN', 'Insufficient permission');
  }

  if (isAdminPath(pathname)) {
    // One engine: the manifest decides the resource/action pair for this path and
    // method. It always returns a rule (the two declared defaults are catch-alls),
    // so `null` here would mean the manifest itself is broken — deny, and say so in
    // the log rather than silently authorising.
    const resolved = resolveRoutePermission(pathname, req.method);
    if (!resolved) {
      console.warn('[Policy] admin.policy.no_rule', JSON.stringify({ pathname, method: req.method }));
      return deny(res, 'FORBIDDEN', 'Insufficient permission');
    }
    if (!hasPermission(req, resolved.permission)) {
      return deny(res, 'FORBIDDEN', 'Insufficient permission');
    }
  }
  if ((requiresVerifiedEmail(pathname) || isAdminPath(pathname)) && !req.user?.emailVerified) {
    return deny(res, 'EMAIL_VERIFICATION_REQUIRED', 'A verified email address is required');
  }
  // Irreversible self-service operations need a recent sign-in. Firebase's
  // verified auth_time (time of the last real sign-in) is the source of truth;
  // iat only reflects when the token was minted or refreshed.
  const requiresRecentAuthentication = RECENT_AUTHENTICATION_PATHS.has(pathname);
  if (requiresRecentAuthentication) {
    const authTime = Number(req.user?.claims?.auth_time || 0) * 1000;
    const maxAgeMs = Number(process.env.SENSITIVE_AUTH_MAX_AGE_MS || 10 * 60 * 1000);
    if (!authTime || Date.now() - authTime > maxAgeMs) {
      return deny(res, 'RECENT_AUTH_REQUIRED', 'Please reauthenticate before this sensitive operation');
    }
  }
  return next();
}

module.exports = {
  enforceApiPolicy,
  isAdminPath,
  requiresVerifiedEmail,
  resolveAdminReadPermission,
  resolveAdminMutationPermission,
};
