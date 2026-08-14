const { permissionsFor } = require('./auth');

const ADMIN_PREFIXES = [
  '/admin/',
  '/test-grant-admin',
  '/test-create-candidate-subscription'
];

const ADMIN_EXACT = new Set([
  '/admin',
  '/send-sms',
  '/invoice',
  '/invoice/generate',
  '/auth/purge-orphaned-auth',
  '/auth/linkedin/test-credentials',
  '/auth/github/test-credentials',
  '/test-ai-config',
  '/email/logs', '/logs',
  '/email/resend', '/resend',
  '/email/templates', '/templates',
  '/send-email', '/email/send-email',
  '/notify/security-alert',
  '/notify/job-application',
  '/notify/job-status-update',
  '/notify/job-posted'
]);

const VERIFIED_PREFIXES = [
  '/generate-', '/check-grammar', '/ai/', '/pay', '/paypal/', '/razorpay/',
  '/paytm/', '/phonepe/', '/export', '/invoice', '/send-invoice-email',
  '/linkedin-scraper', '/subscription/', '/account/', '/notify/'
];

const RECENT_AUTH_PATHS = new Set([
  '/admin/firebase-service-account',
  '/admin/delete-user',
  '/auth/purge-orphaned-auth',
  '/test-grant-admin'
]);

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

/** Route-level authorization policy installed after requireAuth. */
function enforceApiPolicy(req, res, next) {
  const pathname = req.path;
  const elevatedPermission = pathname === '/test-grant-admin'
    ? 'users.roles.manage'
    : (pathname === '/admin/firebase-service-account'
      ? 'secrets.manage'
      : (pathname.startsWith('/admin/payments/')
        ? 'payments.manage'
        : (pathname.startsWith('/admin/employer-applications/') ? 'users.update' : null)));
  if (elevatedPermission && !hasPermission(req, elevatedPermission)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: res.locals.requestId } });
  }
  if (isAdminPath(pathname) && !hasPermission(req, 'system.config.write')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: res.locals.requestId } });
  }
  if (requiresVerifiedEmail(pathname) && !req.user?.emailVerified) {
    return res.status(403).json({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'A verified email address is required', requestId: res.locals.requestId } });
  }
  if (RECENT_AUTH_PATHS.has(pathname) || pathname === '/account/delete'
      || pathname.startsWith('/admin/users/') || pathname.startsWith('/admin/payments/')
      || pathname.startsWith('/admin/employer-applications/')
      || ['/admin/ai-settings', '/admin/save-smtp', '/admin/test-connection'].includes(pathname)) {
    const authTime = Number(req.user?.claims?.auth_time || 0) * 1000;
    const maxAgeMs = Number(process.env.SENSITIVE_AUTH_MAX_AGE_MS || 10 * 60 * 1000);
    if (!authTime || Date.now() - authTime > maxAgeMs) {
      return res.status(403).json({ error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation', requestId: res.locals.requestId } });
    }
  }
  return next();
}

module.exports = { enforceApiPolicy, isAdminPath, requiresVerifiedEmail };
