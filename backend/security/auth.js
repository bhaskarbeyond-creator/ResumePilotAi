const crypto = require('crypto');
const admin = require('../services/firebaseAdmin');

// ---------------------------------------------------------------------------
// Non-production identity verifier (certification/E2E harness only).
//
// Production identity is Firebase Auth: ID tokens are verified against
// Google's public keys via the Admin SDK. Acceptance environments that have
// no network path to Google (and no Firebase credentials) can enable a
// strictly local HMAC verifier with TEST_AUTH_HMAC_SECRET. Tokens then use
// the explicit `rptest.` prefix; anything else still goes to Firebase.
//
// Hard fail-closed guarantees:
//   - In NODE_ENV=production the verifier is inert regardless of env vars.
//   - Unsigned/malformed/expired rptest tokens are rejected.
//   - Regular bearer tokens are NEVER verified locally.
// ---------------------------------------------------------------------------
function testVerifierEnabled() {
  return process.env.NODE_ENV !== 'production'
    && typeof process.env.TEST_AUTH_HMAC_SECRET === 'string'
    && process.env.TEST_AUTH_HMAC_SECRET.length >= 16;
}

function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyLocalTestToken(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3 || parts[0] !== 'rptest') throw new Error('Invalid test token');
  const secret = process.env.TEST_AUTH_HMAC_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(parts[1]).digest('hex');
  if (!timingSafeEqualHex(expected, parts[2])) throw new Error('Bad test token signature');
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch (_e) { throw new Error('Bad test token payload'); }
  if (!payload || typeof payload.uid !== 'string' || payload.uid.length === 0 || payload.uid.length > 128) {
    throw new Error('Test token missing uid');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(payload.exp || 0) > 0 && Number(payload.exp) < nowSec) throw new Error('Test token expired');
  return {
    uid: payload.uid,
    email: payload.email || null,
    email_verified: payload.email_verified !== false,
    auth_time: Number(payload.auth_time || nowSec),
    role: payload.role || null,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : undefined,
    // Second-factor signal is part of the identity surface (MFA enforcement).
    sign_in_second_factor: payload.sign_in_second_factor === true,
    ...(payload.firebase && typeof payload.firebase === 'object' ? { firebase: payload.firebase } : {}),
  };
}

function issueLocalTestToken(payload, secret = process.env.TEST_AUTH_HMAC_SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `rptest.${body}.${sig}`;
}

const PERMISSIONS = Object.freeze({
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users.read', 'users.create', 'users.update', 'users.delete', 'users.roles.manage',
    'tenants.read', 'tenants.write', 'tenants.manage',
    'email.template.manage', 'email.logs.read',
    'payments.manage', 'payments.read',
    'notifications.send',
    'ai.entitlements.manage', 'ai.usage.read',
    'audit.read', 'security.read',
    'tickets.manage'
  ],
  AUDITOR: [
    'users.read', 'tenants.read', 'email.logs.read',
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

let verifyToken = async token => {
  // Explicit non-production harness tokens (see header comment). In production
  // this branch is inert and every token is verified against Firebase.
  if (testVerifierEnabled() && String(token).startsWith('rptest.')) {
    return verifyLocalTestToken(token);
  }
  return admin.auth().verifyIdToken(token, true);
};
let lookupUser = uid => admin.auth().getUser(uid);

async function requireAuth(req, res, next) {
  if (req.user) return next();
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
    const required = Array.isArray(permission) ? permission : [permission];
    if (!permissions.has('*') && !required.some(p => permissions.has(p))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: res.locals?.requestId } });
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
  if (!req.user) {
    return requireAuth(req, res, () => requireSuperAdmin(req, res, next));
  }
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
  if (!req.user) {
    return requireAuth(req, res, () => requireRecentAdminAuthentication(req, res, next));
  }
  // This middleware guards SUPER-ADMIN-ONLY credential/destructive mutations.
  // It enforces three checks:
  //   1. Caller MUST be a super admin (role = SUPER_ADMIN or * permission).
  //   2. When super-admin MFA is enabled (prod default, or flag set), caller
  //      MUST have completed a second factor.
  //   3. When running in production (or REQUIRE_RECENT_AUTH_IN_TEST=true),
  //      authentication must have happened within SENSITIVE_AUTH_MAX_AGE_MS
  //      (default 10 minutes).
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Super admin permission required', requestId: res.locals?.requestId },
    });
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
  const shouldEnforceRecentAuth = process.env.NODE_ENV === 'production' || process.env.REQUIRE_RECENT_AUTH_IN_TEST === 'true';
  if (!shouldEnforceRecentAuth) return next();
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
  // Non-production certification harness helpers (inert in NODE_ENV=production).
  issueLocalTestToken,
  testVerifierEnabled,
};


