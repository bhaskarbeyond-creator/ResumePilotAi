const admin = require('../services/firebaseAdmin');

const PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users.read', 'users.create', 'users.update', 'users.delete', 'users.roles.manage',
    'tenants.read', 'tenants.write', 'tenants.manage',
    'email.template.manage', 'email.logs.read',
    'system.config.read', 'system.config.write',
    'payments.manage', 'payments.read',
    'notifications.send',
    'ai.entitlements.manage', 'ai.usage.read',
    'audit.read', 'security.read'
  ],
  AUDITOR: [
    'users.read', 'tenants.read', 'email.logs.read', 'system.config.read',
    'payments.read', 'ai.usage.read', 'audit.read', 'security.read'
  ],
  SUPPORT: [
    'users.read', 'email.logs.read', 'tenants.read', 'tickets.manage'
  ],
  ENTERPRISE_ADMIN: [
    'tenant.members.manage', 'tenant.roles.manage', 'tenant.ai.policy',
    'tenant.billing.view', 'tenant.audit.read', 'tenant.workspaces.manage',
    'workspace.read', 'workspace.manage', 'workspace.members.manage'
  ],
  ENTERPRISE_MEMBER: [
    'tenant.resumes.write', 'tenant.interviews.execute', 'tenant.ai.consume', 'workspace.read'
  ],
  EMPLOYER: [
    'jobs.manage', 'applications.review', 'candidates.contact'
  ],
  USER: [
    'resumes.manage', 'coverletters.manage', 'interviews.execute', 'subscription.self'
  ]
});

function unauthorized(res, code = 'AUTH_REQUIRED') {
  return res.status(401).json({ error: { code, message: 'Authentication required', requestId: res.locals.requestId } });
}

let verifyToken = token => admin.auth().verifyIdToken(token, true);
let lookupUser = uid => admin.auth().getUser(uid);

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]{1,8192})$/i.exec(header);
  if (!match) return unauthorized(res);
  try {
    const decoded = await verifyToken(match[1]);
    let emailVerified = decoded.email_verified === true;

    // Real-time verification fallback: If client JWT was minted prior to verification,
    // check live Firebase Auth record so verified users are not blocked by token cache lag.
    if (!emailVerified && decoded.uid && typeof lookupUser === 'function') {
      try {
        const userRecord = await lookupUser(decoded.uid);
        if (userRecord?.emailVerified === true) {
          emailVerified = true;
        }
      } catch (_) {
        // Non-fatal: preserve token-derived state
      }
    }

    req.user = Object.freeze({ uid: decoded.uid, email: decoded.email || null, emailVerified, claims: decoded });
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
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_TEST_AUTH_VERIFIER !== 'true') throw new Error('Test verifier injection is disabled outside tests');
  verifyToken = verifier;
}

function setUserLookupForTests(lookup) {
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_TEST_AUTH_VERIFIER !== 'true') throw new Error('Test lookup injection is disabled outside tests');
  lookupUser = lookup;
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

/**
 * High-impact control-plane mutations need both the Super Admin role and a
 * recently refreshed Firebase session. Firebase's verified auth_time is the
 * server-side source of truth; no client-provided timestamp is accepted.
 *
 * Test doubles historically omit auth_time. They remain usable in NODE_ENV=test
 * unless REQUIRE_RECENT_AUTH_IN_TEST=true is explicitly set, while production
 * always fails closed when the claim is absent or older than the configured
 * window.
 */
function requireRecentAdminAuthentication(req, res, next) {
  const superAdminResult = requireSuperAdmin(req, res, () => {});
  if (superAdminResult) return superAdminResult;
  const shouldEnforce = process.env.NODE_ENV === 'production' || process.env.REQUIRE_RECENT_AUTH_IN_TEST === 'true';
  if (!shouldEnforce) return next();
  const authTimeSeconds = Number(req.user?.claims?.auth_time || 0);
  const maxAgeMs = Number(process.env.SENSITIVE_AUTH_MAX_AGE_MS || 10 * 60 * 1000);
  const ageMs = authTimeSeconds > 0 ? Date.now() - authTimeSeconds * 1000 : Infinity;
  if (!authTimeSeconds || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return res.status(403).json({
      error: {
        code: 'RECENT_AUTH_REQUIRED',
        message: 'Reauthenticate before changing platform credentials or executing this destructive operation.',
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
  requireRecentAdminAuthentication,
  requireRecentAuth: requireRecentAdminAuthentication,
  isSuperAdmin,
  hasSecondFactor,
  superAdminMfaEnforced,
  permissionsFor,
  setTokenVerifierForTests,
  setUserLookupForTests,
};


