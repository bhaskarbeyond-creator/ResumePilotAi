const { permissionsFor } = require('./auth');

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
  '/generate-', '/check-grammar', '/ai/', '/pay', '/paypal/', '/razorpay/',
  '/paytm/', '/phonepe/', '/export', '/invoice',
  '/linkedin-scraper', '/subscription/', '/account/', '/messages/', '/jobs/', '/job-applications/', '/employer/', '/notify/', '/email/', '/admin/ai', '/platform/'
];

function isAdminPath(pathname) {
  return ADMIN_EXACT.has(pathname) || ADMIN_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function requiresVerifiedEmail(pathname) {
  return VERIFIED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function hasPermission(req, permission) {
  const permissions = permissionsFor(req.user);
  return permissions.has('*') || permissions.has(permission);
}

function isReadMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

function isSupportDeskPath(pathname) {
  return pathname === '/admin/support' || pathname.startsWith('/admin/support/');
}

/** Least-privilege GET/HEAD/OPTIONS map for admin aliases. Mutations stay write-gated. */
function resolveAdminReadPermission(pathname) {
  if (pathname === '/admin/firebase-service-account') return 'secrets.manage';
  if (pathname.startsWith('/platform/operational-status') || pathname === '/platform/health-indicator') return 'security.read';
  if (pathname === '/admin/users' || pathname.startsWith('/admin/users/')) return 'users.read';
  if (pathname === '/email/logs') return 'email.logs.read';
  if (pathname === '/admin/payment-settings' || pathname === '/platform/payment-settings') return 'payments.read';
  if (isSupportDeskPath(pathname)) return 'tickets.manage';
  return 'system.config.read';
}

function resolveAdminMutationPermission(pathname) {
  if (isSupportDeskPath(pathname)) return 'tickets.manage';
  return 'system.config.write';
}

function deny(res, code, message) {
  return res.status(403).json({ error: { code, message, requestId: res.locals.requestId } });
}

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
    const required = read ? resolveAdminReadPermission(pathname) : resolveAdminMutationPermission(pathname);
    // Mutations on ordinary admin paths still require system.config.write.
    // Help-desk mutations use tickets.manage so SUPPORT can reply without config write.
    if (required === 'system.config.write' && !hasPermission(req, 'system.config.write')) {
      return deny(res, 'FORBIDDEN', 'Insufficient permission');
    }
    if (required !== 'system.config.write' && !hasPermission(req, required)) {
      return deny(res, 'FORBIDDEN', 'Insufficient permission');
    }
  }
  if ((requiresVerifiedEmail(pathname) || isAdminPath(pathname)) && !req.user?.emailVerified) {
    return deny(res, 'EMAIL_VERIFICATION_REQUIRED', 'A verified email address is required');
  }
  const requiresRecentAuthentication = pathname === '/account/delete';
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
