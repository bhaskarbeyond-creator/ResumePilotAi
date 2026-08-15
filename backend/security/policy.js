const { permissionsFor } = require('./auth');

const ADMIN_PREFIXES = [
  '/admin/',
  '/email/admin/'
];

const ADMIN_EXACT = new Set([
  '/admin',
  '/send-sms',
  '/invoice',
  '/invoice/generate',
  '/auth/purge-orphaned-auth',
  '/auth/linkedin/test-credentials',
  '/auth/github/test-credentials',
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
  '/linkedin-scraper', '/subscription/', '/account/', '/messages/', '/jobs/', '/job-applications/', '/employer/', '/notify/', '/admin/ai'
];

const RECENT_AUTH_PATHS = new Set([
  '/admin/delete-user',
  '/send-sms',
  '/admin/system-health-settings',
  '/auth/purge-orphaned-auth',
  '/auth/linkedin/test-credentials',
  '/auth/github/test-credentials'
]);

// The email router retains these historical /api/admin aliases for compatibility in
// addition to its canonical /api/email/admin namespace. Both paths must receive the
// same recent-auth policy so an alias can never bypass the canonical middleware.
const LEGACY_EMAIL_ADMIN_PATHS = new Set([
  '/admin/circuit-breaker-status',
  '/admin/reset-circuit-breaker',
  '/admin/save-template-customization',
  '/admin/custom-templates',
  '/admin/test-connection',
  '/admin/settings',
  '/admin/save-smtp',
  '/admin/test-imap'
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
  const elevatedPermission = pathname === '/admin/firebase-service-account'
    ? 'secrets.manage'
    : (pathname.startsWith('/admin/payments/') || pathname === '/admin/payment-settings' || pathname === '/admin/payment/test-provider'
      ? 'payments.manage'
      : (pathname.startsWith('/admin/employer-applications/') ? 'users.update' : null));
  if (elevatedPermission && !hasPermission(req, elevatedPermission)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: res.locals.requestId } });
  }
  if (isAdminPath(pathname) && !hasPermission(req, 'system.config.write')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: res.locals.requestId } });
  }
  if ((requiresVerifiedEmail(pathname) || isAdminPath(pathname)) && !req.user?.emailVerified) {
    return res.status(403).json({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'A verified email address is required', requestId: res.locals.requestId } });
  }
  if (RECENT_AUTH_PATHS.has(pathname) || LEGACY_EMAIL_ADMIN_PATHS.has(pathname) || (['/admin/firebase-service-account', '/admin/twilio-settings'].includes(pathname) && req.method !== 'GET') || pathname === '/account/delete'
      || pathname.startsWith('/admin/users/') || pathname.startsWith('/admin/payments/')
      || pathname.startsWith('/admin/employer-applications/') || pathname.startsWith('/admin/settings/')
      || pathname.startsWith('/admin/jobs/') || pathname.startsWith('/admin/companies/')
      || pathname.startsWith('/admin/reviews') || pathname === '/admin/global-rating'
      || pathname.startsWith('/admin/trusted-by') || pathname.startsWith('/admin/ads') || pathname.startsWith('/admin/blog') || pathname === '/admin/landing-content'
      || pathname.startsWith('/email/admin/')
      || (pathname === '/admin/ai-settings' && req.method !== 'GET')
      || ['/admin/ai/test-provider', '/admin/payment/test-provider', '/admin/payment-settings', '/admin/save-smtp', '/admin/test-connection'].includes(pathname)) {
    const authTime = Number(req.user?.claims?.auth_time || 0) * 1000;
    const maxAgeMs = Number(process.env.SENSITIVE_AUTH_MAX_AGE_MS || 10 * 60 * 1000);
    if (!authTime || Date.now() - authTime > maxAgeMs) {
      return res.status(403).json({ error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation', requestId: res.locals.requestId } });
    }
  }
  return next();
}

module.exports = { enforceApiPolicy, isAdminPath, requiresVerifiedEmail };
