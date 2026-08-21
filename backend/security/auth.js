const admin = require('../services/firebaseAdmin');

const PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users.read', 'users.update', 'users.delete', 'email.template.manage',
    'email.logs.read', 'system.config.read', 'system.config.write', 'payments.manage',
    'notifications.send'
  ],
  SUPPORT: ['users.read', 'email.logs.read']
});

function unauthorized(res, code = 'AUTH_REQUIRED') {
  return res.status(401).json({ error: { code, message: 'Authentication required', requestId: res.locals.requestId } });
}

let verifyToken = token => admin.auth().verifyIdToken(token, true);

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]{1,8192})$/i.exec(header);
  if (!match) return unauthorized(res);
  try {
    const decoded = await verifyToken(match[1]);
    req.user = Object.freeze({ uid: decoded.uid, email: decoded.email || null, emailVerified: decoded.email_verified === true, claims: decoded });
    return next();
  } catch (_) {
    return unauthorized(res, 'INVALID_AUTH_TOKEN');
  }
}

function requireVerifiedEmail(req, res, next) {
  if (!req.user?.emailVerified) return res.status(403).json({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'A verified email address is required', requestId: res.locals.requestId } });
  return next();
}

function permissionsFor(user) {
  const role = String(user?.claims?.role || '').toUpperCase();
  const declared = Array.isArray(user?.claims?.permissions)
    ? user.claims.permissions.filter(value => typeof value === 'string' && value.length <= 100)
    : [];
  return new Set([...(PERMISSIONS[role] || []), ...declared]);
}

function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = permissionsFor(req.user);
    if (!permissions.has('*') && !permissions.has(permission)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: res.locals.requestId } });
    }
    return next();
  };
}

function setTokenVerifierForTests(verifier) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test verifier injection is disabled outside tests');
  verifyToken = verifier;
}

function isSuperAdmin(user) {
  const role = String(user?.claims?.role || '').toUpperCase();
  const permissions = permissionsFor(user);
  return role === 'SUPER_ADMIN' || permissions.has('*');
}

function hasSecondFactor(user) {
  const claims = user?.claims || {};
  return Boolean(claims.firebase?.sign_in_second_factor || claims.sign_in_second_factor);
}

function superAdminMfaEnforced() {
  if (process.env.SUPER_ADMIN_MFA_REQUIRED === 'false') return false;
  if (process.env.SUPER_ADMIN_MFA_REQUIRED === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Super admin permission required', requestId: res.locals?.requestId } });
  }
  if (superAdminMfaEnforced() && !hasSecondFactor(req.user)) {
    return res.status(403).json({
      error: {
        code: 'SUPER_ADMIN_MFA_REQUIRED',
        message: 'Super Admin destructive operations require a second authentication factor. Enroll TOTP MFA and sign in again.',
        requestId: res.locals?.requestId,
      },
    });
  }
  return next();
}

const requireAdmin = requirePermission('system.config.write');
module.exports = {
  requireAuth,
  requireVerifiedEmail,
  requirePermission,
  requireAdmin,
  requireSuperAdmin,
  isSuperAdmin,
  hasSecondFactor,
  superAdminMfaEnforced,
  permissionsFor,
  setTokenVerifierForTests,
};


