'use strict';

const express = require('express');
const crypto = require('crypto');
const admin = require('../services/firebaseAdmin');
const { permissionsFor } = require('../security/auth');
const { getUserAiEntitlement, setUserAiQuotaOverride, removeUserAiQuotaOverride, resetUserAiQuota } = require('../services/adminAiEntitlement');
const { normalizeCurrencyCode } = require('../services/platformCurrency');
const { recordAdminAuditLog } = require('../security/adminAudit');
const { getRepository } = require('../repositories');
const { getPool } = require('../database/mysql');
const { queueEmail } = require('../services/notificationOutbox');
const { ALERT_TYPES, emitAlert } = require('../database/alerts');
const { resolveAssignableWorkspace } = require('../enterprise/workspaceResolution');

const router = express.Router();

// Attach database repository to request
router.use((req, res, next) => {
  try {
    req.repository = req.repository || getRepository();
    next();
  } catch (_err) {
    return res.status(503).json({ success: false, code: 'APPLICATION_DATABASE_UNAVAILABLE', error: 'Application database unavailable' });
  }
});

const VALID_ROLES = Object.freeze([
  'SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT',
  'ENTERPRISE_ADMIN', 'ENTERPRISE_MEMBER', 'EMPLOYER', 'USER'
]);

function adminIso(value) {
  if (!value) return null;
  try {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch (_) {
    return null;
  }
}

async function identityOrNull(identityAdmin, uid) {
  if (!identityAdmin?.auth) {
    throw Object.assign(new Error('Identity directory unavailable'), { code: 'IDENTITY_DIRECTORY_UNAVAILABLE', status: 503 });
  }
  try {
    return await identityAdmin.auth().getUser(uid);
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// DIR-031 / FP-A17 — User360 account lifecycle (ACTIVE | SUSPENDED | DISABLED)
//
// Ownership of account state in this architecture:
//   * Firebase Authentication owns `disabled`. `requireAuth` verifies every ID
//     token with checkRevoked=true, so disabling an identity and revoking its
//     refresh tokens takes effect on already-issued ID tokens too.
//   * MariaDB owns the application profile. `users.role` / `users.suspended`
//     are legacy columns (profile persistence deliberately does not write
//     them); the supported, relational way to persist which lifecycle level an
//     account sits on is the existing `users.extra_data` JSON column, which is
//     the documented home for fields the fixed user table does not model.
//     No new table or column is invented here.
// ---------------------------------------------------------------------------
const ACCOUNT_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'DISABLED']);
const ACCOUNT_STATUS_METADATA_KEY = 'accountStatus';
const USER_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function parseAccountStatus(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return ACCOUNT_STATUSES.includes(normalized) ? normalized : null;
}

function parseProfileExtra(profile) {
  const raw = profile?.extra_data ?? profile?.extraData ?? profile?.extra_json;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    // A corrupt JSON blob must not be treated as an empty one during a write:
    // callers decide whether they can safely replace it.
    return { __unparsable: true };
  }
}

/**
 * Resolve the lifecycle status of an account from BOTH authoritative stores.
 * Firebase is authoritative for "is this identity able to sign in"; the
 * persisted metadata distinguishes SUSPENDED from DISABLED.
 */
function resolveAccountStatus(identity, profile) {
  const extra = parseProfileExtra(profile);
  const stored = parseAccountStatus(extra[ACCOUNT_STATUS_METADATA_KEY]);
  if (identity?.disabled !== true) {
    // An identity that is enabled is ACTIVE regardless of stale metadata; a
    // stale DISABLED marker must never contradict a live sign-in capability.
    return { status: 'ACTIVE', stored, identityDisabled: false };
  }
  return {
    status: stored === 'DISABLED' ? 'DISABLED' : 'SUSPENDED',
    stored,
    identityDisabled: true,
  };
}

function accountStatusReason(value) {
  if (value === undefined || value === null) return { ok: true, reason: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > 500) return { ok: false };
  return { ok: true, reason: trimmed ? trimmed : null };
}

/**
 * Persist the lifecycle level atomically. Reads the row `FOR UPDATE`, merges
 * the existing extra_data (never discarding unrelated keys) and bumps the
 * revision so concurrent administrative writes are detected rather than
 * silently overwritten. Returns `persisted: false` for identities that have no
 * application profile row yet — in that case Firebase remains the only store,
 * and the caller reports that honestly instead of pretending otherwise.
 */
async function persistAccountStatus({ uid, status, reason, actorUid }) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT revision, suspended, extra_data FROM users WHERE id = ? FOR UPDATE',
      [uid]
    );
    if (!rows.length) {
      await connection.rollback();
      return { persisted: false, reason: 'NO_APPLICATION_PROFILE', previousRevision: null, revision: null, updatedAt: null };
    }
    const row = rows[0];
    const existingExtra = parseProfileExtra({ extra_data: row.extra_data });
    const nextExtra = existingExtra.__unparsable ? {} : existingExtra;
    nextExtra[ACCOUNT_STATUS_METADATA_KEY] = status;
    nextExtra.accountStatusReason = status === 'ACTIVE' ? null : reason;
    nextExtra.accountStatusUpdatedAt = new Date().toISOString();
    nextExtra.accountStatusUpdatedBy = actorUid || null;

    const previousRevision = Number(row.revision || 0);
    const nextRevision = previousRevision + 1;
    const [result] = await connection.query(
      `UPDATE users
          SET suspended = ?, extra_data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND revision = ?`,
      [status === 'ACTIVE' ? 0 : 1, JSON.stringify(nextExtra), nextRevision, uid, previousRevision]
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      const conflict = Object.assign(new Error('The user profile changed while the status was being updated.'), {
        code: 'USER_PROFILE_CONFLICT',
        status: 409,
      });
      throw conflict;
    }
    await connection.commit();
    const [stampRows] = await connection.query('SELECT updated_at FROM users WHERE id = ? LIMIT 1', [uid]);
    return {
      persisted: true,
      reason: null,
      previousRevision,
      revision: nextRevision,
      updatedAt: adminIso(stampRows?.[0]?.updated_at) || new Date().toISOString(),
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

function adminUserProjection(identity, profile = {}, id = identity?.uid || profile?.id || profile?.userId, authoritativeTenants = []) {
  const claims = identity?.customClaims || {};
  const rawRole = String(claims.role || 'USER').toUpperCase();
  const role = VALID_ROLES.includes(rawRole) ? rawRole : 'USER';
  const membershipEnds = adminIso(profile.membershipEnds || profile.membership_ends);
  
  const tenantMemberships = Array.isArray(authoritativeTenants) ? authoritativeTenants : [];
  const primaryMembership = tenantMemberships.find(item => item.isPrimary === true) || tenantMemberships[0];
  const primaryTenant = primaryMembership ? {
    id: primaryMembership.tenantId || primaryMembership.id,
    displayName: primaryMembership.displayName || primaryMembership.tenantName || primaryMembership.name || 'Primary Organization',
    slug: primaryMembership.slug || primaryMembership.tenantSlug || 'primary',
    role: primaryMembership.role || primaryMembership.roles?.[0] || 'ENTERPRISE_MEMBER',
  } : null;

  const displayName = profile.displayName || identity?.displayName || `${profile.firstname || ''} ${profile.lastname || ''}`.trim() || null;

  return {
    id,
    userId: id,
    uid: id,
    email: identity?.email || profile.email || null,
    displayName,
    photoURL: identity?.photoURL || profile.photoUrl || profile.photoURL || profile.avatarUrl || profile.profilePicture || null,
    role,
    isA: ['SUPER_ADMIN', 'ADMIN'].includes(role),
    emailVerified: identity?.emailVerified === true,
    suspended: identity?.disabled === true,
    identityStatus: identity ? 'ACTIVE' : 'MISSING',
    mfaEnabled: Array.isArray(identity?.multiFactor?.enrolledFactors) && identity.multiFactor.enrolledFactors.length > 0,
    membership: profile.membership || 'Basic',
    membershipEnds,
    paymentStatus: profile.paymentStatus || (profile.membership === 'Premium' ? 'ACTIVE' : 'INACTIVE'),
    preferredCurrency: normalizeCurrencyCode(profile.preferredCurrency || profile.currency || 'INR'),
    primaryTenant,
    tenantMemberships,
    tenantCount: tenantMemberships.length,
    aiQuotaOverride: profile.aiQuotaOverride || null,
    revision: Number(profile.revision || 0),
    createdAt: adminIso(profile.createdAt || profile.created_at || identity?.metadata?.creationTime),
    lastLoginAt: adminIso(profile.lastLoginAt || profile.last_login_at || identity?.metadata?.lastSignInTime),
    updatedAt: adminIso(profile.updatedAt || profile.updated_at || identity?.tokensValidAfterTime),
  };
}

// 1. DIRECTORY LISTING WITH PAGINATION & FILTERS (MariaDB application profile)
router.get('/', async (req, res) => {
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  let tenantService = req.app.get('tenantService');
  if (!tenantService) {
    try {
      const { createTenantService } = require('../enterprise/tenantService');
      const { getPool } = require('../database/mysql');
      const { getRepository } = require('../repositories');
      tenantService = createTenantService({ pool: getPool(), admin: identityAdmin, repository: getRepository() });
      req.app.set('tenantService', tenantService);
    } catch (_) {}
  }
  const repo = req.repository || getRepository();
  if (!identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'IDENTITY_DIRECTORY_UNAVAILABLE', error: 'The Firebase Authentication directory is unavailable.' });
  }
  const limit = Math.min(Math.max(Number(req.query?.limit || req.query?.pageSize) || 25, 1), 200);
  const query = String(req.query?.q || req.query?.search || '').trim().toLowerCase();
  const status = String(req.query?.status || 'all').toLowerCase();
  const roleFilter = String(req.query?.role || 'all').toUpperCase();
  const planFilter = String(req.query?.plan || req.query?.subscription || 'all').toUpperCase();
  const tenantFilter = String(req.query?.tenantId || req.query?.tenant || '').trim();
  const pageToken = req.query?.pageToken ? String(req.query.pageToken) : undefined;
  try {
    let identities = [];
    let listedPageToken = null;

    if (query) {
      const foundUids = new Set();
      const directIdentities = [];
      if (query.includes('@')) {
        try {
          const idUser = await identityAdmin.auth().getUserByEmail(query);
          if (idUser) { directIdentities.push(idUser); foundUids.add(idUser.uid); }
        } catch (_) {}
      }
      try {
        const idUser = await identityAdmin.auth().getUser(query);
        if (idUser && !foundUids.has(idUser.uid)) { directIdentities.push(idUser); foundUids.add(idUser.uid); }
      } catch (_) {}

      try {
        const [dbRows] = await getPool().query(
          `SELECT id, email, displayName, firstname, lastname, role FROM users
           WHERE email LIKE ? OR id LIKE ? OR displayName LIKE ? OR firstname LIKE ? OR lastname LIKE ?
           LIMIT ?`,
          [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit]
        );
        for (const row of (dbRows || [])) {
          if (!foundUids.has(row.id)) {
            foundUids.add(row.id);
            try {
              const idUser = await identityOrNull(identityAdmin, row.id);
              if (idUser) directIdentities.push(idUser);
              else directIdentities.push({ uid: row.id, email: row.email, displayName: row.displayName, customClaims: { role: row.role } });
            } catch (_) {
              directIdentities.push({ uid: row.id, email: row.email, displayName: row.displayName, customClaims: { role: row.role } });
            }
          }
        }
      } catch (dbErr) {
        console.warn('[Admin user directory] DB search query notice:', dbErr.message);
      }

      const listed = await identityAdmin.auth().listUsers(limit, pageToken);
      for (const u of (listed.users || [])) {
        if (!foundUids.has(u.uid)) {
          directIdentities.push(u);
          foundUids.add(u.uid);
        }
      }
      identities = directIdentities;
    } else {
      let listed = { users: [] };
      try {
        listed = await identityAdmin.auth().listUsers(limit, pageToken);
      } catch (_) {}
      identities = listed.users || [];
      listedPageToken = listed.pageToken || null;
      if (!identities.length) {
        try {
          const [dbUsers] = await getPool().query('SELECT id, email, displayName, firstname, lastname, role, created_at FROM users ORDER BY created_at DESC LIMIT ?', [limit]);
          identities = (dbUsers || []).map(u => ({ uid: u.id, email: u.email, displayName: u.displayName || `${u.firstname || ''} ${u.lastname || ''}`.trim(), customClaims: { role: u.role } }));
        } catch (_) {}
      }
    }

    const uids = [...new Set(identities.map(identity => String(identity?.uid || '')).filter(Boolean))];

    // A directory page previously issued two MariaDB reads per identity (profile
    // + tenant memberships). At the documented maximum page size that is 400
    // simultaneous acquisitions against a 15-connection pool whose queue limit is
    // 200, which queues or rejects requests and starves user-facing traffic behind
    // an administrative listing. The page is now read in two batched queries, with
    // the per-identity path retained for repositories without a batch reader.
    const loadProfiles = async () => {
      if (uids.length && typeof repo.getUsersByIds === 'function') {
        try {
          const rows = await repo.getUsersByIds(uids);
          return new Map((rows || []).map(row => [String(row?.id ?? row?.userId ?? ''), row]));
        } catch (error) {
          console.warn('[Admin user directory] batch profile read failed, using per-identity read:', error.code || error.message);
        }
      }
      const entries = await Promise.all(uids.map(async uid => [uid, await repo.getUser(uid)]));
      return new Map(entries.filter(([, profile]) => profile));
    };
    const loadMemberships = async () => {
      if (uids.length && typeof tenantService.registry.listMembershipsForPrincipals === 'function') {
        try {
          const grouped = await tenantService.registry.listMembershipsForPrincipals(uids);
          if (grouped instanceof Map) return grouped;
          console.warn('[Admin user directory] batch membership reader returned an unsupported shape; using per-identity read');
        } catch (error) {
          console.warn('[Admin user directory] batch membership read failed, using per-identity read:', error.code || error.message);
        }
      }
      const entries = await Promise.all(uids.map(async uid => [uid, await tenantService.registry.listMemberships(uid)]));
      return new Map(entries);
    };
    const [profilesById, membershipsById] = await Promise.all([loadProfiles(), loadMemberships()]);
    const usersList = identities.map(identity => adminUserProjection(
      identity,
      profilesById.get(String(identity?.uid || '')) || {},
      identity.uid,
      membershipsById.get(identity.uid) || []
    ));
    const filtered = usersList.filter(user => {
      const matchesQuery = !query || [user.id, user.email, user.displayName, user.primaryTenant?.displayName, user.primaryTenant?.slug]
        .some(value => String(value || '').toLowerCase().includes(query));
      const matchesStatus = status === 'all' || (status === 'suspended' && user.suspended) || (status === 'active' && !user.suspended);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesPlan = planFilter === 'ALL' || String(user.membership).toUpperCase() === planFilter;
      const matchesTenant = !tenantFilter || user.primaryTenant?.id === tenantFilter || user.primaryTenant?.slug === tenantFilter
        || user.tenantMemberships.some(tenant => tenant.tenantId === tenantFilter || tenant.id === tenantFilter || tenant.slug === tenantFilter);
      return matchesQuery && matchesStatus && matchesRole && matchesPlan && matchesTenant;
    });
    return res.json({
      success: true, users: filtered, nextPageToken: listedPageToken || null,
      pageSize: limit, filteredCount: filtered.length,
      source: 'FIREBASE_AUTH_IDENTITY_WITH_MARIADB_PROFILE', generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin user directory error]', error.message);
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'Unable to read the identity directory and application profiles.', requestId: res.locals.requestId });
  }
});

router.post('/bulk', async (req, res) => {
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to modify users.' });
  }
  const uids = Array.isArray(req.body?.uids) ? req.body.uids.map(id => String(id).trim()).filter(Boolean) : [];
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!uids.length || uids.length > 100) {
    return res.status(400).json({ success: false, code: 'INVALID_UIDS', error: 'Specify between 1 and 100 user identifiers.' });
  }
  if (!['suspend', 'activate'].includes(action)) {
    return res.status(400).json({ success: false, code: 'INVALID_BULK_ACTION', error: 'Action must be "suspend" or "activate".' });
  }

  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository();
  const willSuspend = action === 'suspend';
  const callerUid = req.user?.uid;
  const results = { succeeded: [], failed: [] };

  for (const uid of uids) {
    if (uid === callerUid) {
      results.failed.push({ uid, error: 'Cannot modify your own account status in bulk operations.' });
      continue;
    }
    try {
      if (identityAdmin?.auth) {
        await identityAdmin.auth().updateUser(uid, { disabled: willSuspend }).catch(() => {});
      }
      const existing = await repo.getUser(uid).catch(() => null);
      if (existing) {
        const expectedRevision = Number(existing.revision || 0);
        await repo.saveUserWithRevisionGuard(uid, { ...existing, suspended: willSuspend }, expectedRevision);
      } else {
        await getPool().query('UPDATE users SET suspended = ?, updated_at = NOW() WHERE id = ?', [willSuspend ? 1 : 0, uid]);
      }
      await recordAdminAuditLog(req, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        action: willSuspend ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        category: 'iam.users',
        severity: 'HIGH',
        method: 'POST',
        pathname: req.originalUrl,
        statusCode: 200,
        resourceType: 'user',
        resourceId: uid,
        metadata: { bulk: true, action },
        requestId: res.locals.requestId,
      });
      results.succeeded.push(uid);
    } catch (err) {
      results.failed.push({ uid, error: err.message || 'Update failed' });
    }
  }

  return res.json({
    success: results.failed.length === 0,
    results,
    summary: { total: uids.length, succeeded: results.succeeded.length, failed: results.failed.length },
  });
});

router.post('/', async (req, res) => {
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository();
  if (!identityAdmin?.auth) return res.status(503).json({ success: false, code: 'IDENTITY_DIRECTORY_UNAVAILABLE', error: 'The Firebase Authentication directory is unavailable.' });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.create')) return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to create users.' });

  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim().slice(0, 120);
  const requestedRole = String(body.role || 'USER').toUpperCase();
  const preferredCurrency = normalizeCurrencyCode(body.preferredCurrency || 'INR');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, code: 'INVALID_EMAIL', error: 'A valid email address is required.' });
  if (!VALID_ROLES.includes(requestedRole)) return res.status(400).json({ success: false, code: 'INVALID_ROLE', error: 'Unsupported role.' });
  if (requestedRole === 'SUPER_ADMIN') return res.status(400).json({ success: false, code: 'SUPER_ADMIN_PROVISION_FORBIDDEN', error: 'SUPER_ADMIN accounts cannot be created from this API.' });
  if (body.tenantId) return res.status(400).json({ success: false, code: 'CREATE_THEN_ASSIGN_TENANT', error: 'Create the identity first, then assign tenant membership separately.' });
  if (body.membership && body.membership !== 'Basic') return res.status(400).json({ success: false, code: 'CREATE_THEN_GRANT_MEMBERSHIP', error: 'Create the identity first, then grant paid membership separately.' });

  const targetUid = `usr_${crypto.randomBytes(16).toString('hex')}`;
  let profilePersisted = false;
  let identityCreated = false;
  let identityProvisioned = false;
  try {
    try {
      await identityAdmin.auth().getUserByEmail(email);
      return res.status(409).json({ success: false, code: 'IDENTITY_ALREADY_EXISTS', error: 'An identity with this email already exists.' });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_PROVISION_REQUESTED',
      category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl, statusCode: 202,
      resourceType: 'user', resourceId: targetUid, metadata: { targetUid, requestedRole }, requestId: res.locals.requestId,
    });
    const profile = await repo.saveUserWithRevisionGuard(targetUid, {
      id: targetUid, email, displayName: displayName || email.split('@')[0], membership: 'Basic',
      membershipEnds: null, paymentStatus: 'INACTIVE', preferredCurrency, invitedBy: req.user?.uid || 'admin',
    }, 0);
    profilePersisted = true;
    const tempPassword = `RP_${crypto.randomBytes(18).toString('base64url')}!Aa1`;
    await identityAdmin.auth().createUser({ uid: targetUid, email, displayName: profile.displayName, password: tempPassword, emailVerified: body.emailVerified === true });
    identityCreated = true;
    await identityAdmin.auth().setCustomUserClaims(targetUid, { role: requestedRole });
    identityProvisioned = true;

    const resetLink = await identityAdmin.auth().generatePasswordResetLink(email);
    const notificationId = await queueEmail(getPool(), {
      eventId: `admin-user-provisioned:${targetUid}`,
      recipient: email,
      templateType: 'password_reset',
      vars: { candidate_name: profile.displayName, user_name: profile.displayName, reset_link: resetLink },
      metadata: { source: 'admin_user_provisioning', targetUid, actorUid: req.user?.uid },
      idempotencyKey: `admin-user-provisioned:${targetUid}`,
      sensitive: true,
    });
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_PROVISIONED',
      category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl,
      resourceType: 'user', resourceId: targetUid,
      metadata: { targetUid, requestedRole, inviteDeliveryState: 'NOTIFICATION_QUEUED', notificationId }, requestId: res.locals.requestId,
    });
    const identity = await identityAdmin.auth().getUser(targetUid);
    return res.status(201).json({
      success: true,
      code: 'USER_PROVISIONED',
      message: 'User provisioned and password-setup email queued for delivery.',
      inviteDeliveryState: 'NOTIFICATION_QUEUED',
      notificationId,
      user: adminUserProjection(identity, profile, targetUid, []),
    });
  } catch (error) {
    if (identityProvisioned) {
      emitAlert(ALERT_TYPES.IDENTITY_PROVISIONING_PARTIAL, { severity: 'HIGH', uid: targetUid, reason: error.code || error.message, message: 'Identity and profile were provisioned, but invitation or final audit follow-up failed.' });
      return res.status(202).json({ success: true, code: 'USER_PROVISIONED_FOLLOWUP_PENDING', message: 'User provisioned; invitation delivery or final audit follow-up requires operator retry.', userId: targetUid });
    }
    const compensationErrors = [];
    if (!identityProvisioned) {
      if (identityCreated) {
        try { await identityAdmin.auth().deleteUser(targetUid); } catch (cleanupError) { compensationErrors.push(`identity:${cleanupError.code || cleanupError.message}`); }
      }
      if (profilePersisted) {
        try { await repo.deleteUser(targetUid); } catch (cleanupError) { compensationErrors.push(`profile:${cleanupError.code || cleanupError.message}`); }
      }
    }
    if (compensationErrors.length) {
      emitAlert(ALERT_TYPES.IDENTITY_PROVISIONING_PARTIAL, { severity: 'CRITICAL', uid: targetUid, reason: compensationErrors.join(', '), message: 'Administrative identity provisioning compensation failed.' });
    }
    console.error('[User create error]', error.message);
    return res.status(error.status || 500).json({ success: false, code: compensationErrors.length ? 'USER_PROVISION_COMPENSATION_FAILED' : (error.code || 'USER_CREATE_FAILED'), error: compensationErrors.length ? 'User provisioning failed and requires operator reconciliation.' : (error.status ? error.message : 'Failed to provision user.'), requestId: res.locals.requestId });
  }
});

// 3. USER 360 COMPREHENSIVE DETAILS (Firebase Authentication identity + MariaDB application data)
router.get('/:uid/details', async (req, res) => {
  const rawId = String(req.params.uid || '').trim();
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');
  const repo = req.repository || getRepository();

  if (!rawId || rawId.length > 128) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  try {
    let identity = null;
    let targetUid = rawId;

    // 1. Resolve identity by UID or email from Firebase Auth
    if (rawId.includes('@')) {
      try {
        identity = await identityAdmin.auth().getUserByEmail(rawId);
        if (identity) targetUid = identity.uid;
      } catch (_) {}
    } else {
      identity = await identityOrNull(identityAdmin, rawId);
    }

    // 2. Resolve application profile from MariaDB (by targetUid or rawId or identity.email)
    let profileResult = await repo.getUser(targetUid).catch(() => null);
    if (!profileResult && rawId !== targetUid) {
      profileResult = await repo.getUser(rawId).catch(() => null);
    }
    if (!profileResult && identity?.email) {
      profileResult = await repo.getUserByEmail(identity.email).catch(() => null);
    }
    if (!profileResult && rawId.includes('@')) {
      profileResult = await repo.getUserByEmail(rawId).catch(() => null);
    }
    if (!profileResult) {
      try {
        const pool = getPool();
        const [directRows] = await pool.query(
          'SELECT * FROM users WHERE id = ? OR email = ? OR id = ? LIMIT 1',
          [targetUid, rawId, identity?.uid || '']
        );
        if (directRows && directRows.length > 0) {
          profileResult = directRows[0];
          if (!targetUid || targetUid === rawId) targetUid = directRows[0].id;
        }
      } catch (_) {}
    }

    // If identity was not found in Firebase Auth, but profile has email, try Firebase by email
    if (!identity && profileResult?.email) {
      try {
        identity = await identityAdmin.auth().getUserByEmail(profileResult.email);
        if (identity && !targetUid) targetUid = identity.uid;
      } catch (_) {}
    }

    const [contentCounts, userResumesRows, userPortfoliosRows, userCoversRows, orders, aiEntitlement, securityLogs, adminLogs] = await Promise.all([
      repo.getUserContentCounts(targetUid).catch(() => ({})),
      getPool().query(
        'SELECT id, title, template, created_at, updated_at FROM resumes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20',
        [targetUid]
      ).catch(() => [[]]),
      getPool().query(
        'SELECT id, title, slug, theme, is_published, created_at, updated_at FROM portfolios WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20',
        [targetUid]
      ).catch(() => [[]]),
      getPool().query(
        'SELECT id, job_title, company_name, created_at, updated_at FROM covers WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20',
        [targetUid]
      ).catch(() => [[]]),
      repo.getUserPaymentOrders(targetUid).catch(() => []),
      getUserAiEntitlement(null, targetUid).catch(() => ({ uid: targetUid, plan: profileResult?.membership || 'Basic', baseQuota: 10, effectiveLimit: 10, usedToday: 0, remainingToday: 10 })),
      repo.getSecurityAuditLogs({ targetUid, limit: 50 }).catch(() => []),
      repo.getAdminAuditLogs({ resourceId: targetUid, limit: 50 }).catch(() => []),
    ]);

    if (!identity && !profileResult) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.', requestId: res.locals.requestId });
    }

    const profile = profileResult || {};
    const baseUser = adminUserProjection(identity, profile, targetUid || rawId);

    // 3. Resolve tenant memberships (graceful degradation if tenant service is offline)
    let detailedTenants = [];
    if (tenantService?.registry) {
      try {
        const memberships = await tenantService.registry.listMemberships(targetUid);
        if (memberships.length) {
          detailedTenants = memberships.map(m => {
            const tId = m.tenantId || m.tenant?.id || m.id;
            const tName = m.displayName || m.tenant?.displayName || tId;
            const tSlug = m.slug || m.tenant?.slug || tId;
            const tRoles = m.roles || m.membership?.roles || ['MEMBER'];
            const tStatus = m.status || m.membership?.status || 'ACTIVE';
            return {
              tenantId: tId,
              id: tId,
              displayName: tName,
              slug: tSlug,
              lifecycleState: m.tenantLifecycleState || m.tenant?.lifecycleState || 'ACTIVE',
              isolationTier: m.isolationTier || m.tenant?.isolationTier || 'STANDARD',
              roles: Array.isArray(tRoles) ? tRoles : [tRoles],
              status: tStatus,
              workspaceId: m.workspaceId || m.membership?.workspaceId || null,
              isPrimary: baseUser.primaryTenant?.id === tId,
            };
          });
        }
      } catch (tenantErr) {
        console.warn('[User 360 tenant resolution warning]', tenantErr.message);
      }
    }

    // 4. Format both durable audit streams.
    const auditLogs = [...(securityLogs || []), ...(adminLogs || [])].map(item => ({
      id: item.id,
      action: item.action || 'ADMIN_ACTION',
      actorUid: item.actorUid || item.actor || 'system',
      category: item.category || 'iam.users',
      severity: item.severity || 'INFO',
      changes: item.changes || null,
      changedFields: item.changedFields || [],
      createdAt: adminIso(item.createdAt),
    }));
    auditLogs.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));

    return res.json({
      success: true,
      user360: {
        identity: baseUser,
        authProviders: identity?.providerData ? identity.providerData.map(p => ({
          providerId: p.providerId,
          uid: p.uid,
          email: p.email,
          displayName: p.displayName,
        })) : [],
        security: {
          mfaEnabled: baseUser.mfaEnabled,
          emailVerified: baseUser.emailVerified,
          suspended: baseUser.suspended,
          disabled: identity?.disabled === true || baseUser.suspended,
          tokensValidAfterTime: identity?.tokensValidAfterTime || null,
          lastSignInTime: identity?.metadata?.lastSignInTime || baseUser.lastLoginAt,
          creationTime: identity?.metadata?.creationTime || baseUser.createdAt,
        },
        tenancy: {
          primaryTenant: baseUser.primaryTenant,
          memberships: detailedTenants,
          totalTenants: detailedTenants.length,
        },
        aiEntitlement,
        billing: {
          membership: baseUser.membership,
          membershipEnds: baseUser.membershipEnds,
          paymentStatus: baseUser.paymentStatus,
          preferredCurrency: baseUser.preferredCurrency,
          orders,
          totalOrders: orders.length,
        },
        content: {
          resumeCount: contentCounts.resumeCount || 0,
          portfolioCount: contentCounts.portfolioCount || 0,
          coverCount: contentCounts.coverCount || 0,
          resumes: (userResumesRows?.[0] || []).map(r => ({
            id: r.id,
            title: r.title || 'Untitled Resume',
            template: r.template || 'classic',
            createdAt: adminIso(r.created_at),
            updatedAt: adminIso(r.updated_at),
          })),
          portfolios: (userPortfoliosRows?.[0] || []).map(p => ({
            id: p.id,
            title: p.title || 'Portfolio',
            slug: p.slug || p.id,
            theme: p.theme || 'modern',
            isPublished: p.is_published === 1,
            createdAt: adminIso(p.created_at),
            updatedAt: adminIso(p.updated_at),
          })),
          covers: (userCoversRows?.[0] || []).map(c => ({
            id: c.id,
            jobTitle: c.job_title || 'Untitled Cover Letter',
            companyName: c.company_name || 'General Application',
            createdAt: adminIso(c.created_at),
            updatedAt: adminIso(c.updated_at),
          })),
        },
        auditTimeline: auditLogs.slice(0, 50),
      }
    });
  } catch (error) {
    console.error('[User 360 error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({ success: false, code: error.code || 'USER_DETAILS_ERROR', error: error.message, requestId: res.locals.requestId });
  }
});

// 3b. GET INDIVIDUAL USER AUDIT TRAIL (Security & Admin logs)
router.get('/:userId/audit', async (req, res) => {
  const targetUid = String(req.params.userId || '').trim();
  if (!targetUid || targetUid.length > 128) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  }
  try {
    const repo = req.repository || getRepository();
    const [securityLogs, adminLogs] = await Promise.all([
      repo.getSecurityAuditLogs({ targetUid, limit: 50 }).catch(() => []),
      repo.getAdminAuditLogs({ resourceId: targetUid, limit: 50 }).catch(() => []),
    ]);
    const events = [...(securityLogs || []), ...(adminLogs || [])].map(item => ({
      id: item.id,
      timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
      type: item.type || item.action || 'SECURITY_EVENT',
      action: item.action || item.type,
      actorUid: item.actorUid || 'SYSTEM',
      actorEmail: item.actorEmail || null,
      ip: item.ip || item.ipAddress || null,
      metadata: item.metadata || {},
    }));
    events.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return res.json({ success: true, events: events.slice(0, 50) });
  } catch (err) {
    console.error('[User audit error]', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to load user audit history' });
  }
});

// 4. GET SINGLE USER PROJECTION (MariaDB application profile)
router.get('/:uid', async (req, res) => {
  const rawId = String(req.params.uid || '').trim();
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository();

  if (!rawId || rawId.length > 128) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  try {
    let identity = null;
    let targetUid = rawId;

    if (rawId.includes('@')) {
      try {
        identity = await identityAdmin.auth().getUserByEmail(rawId);
        if (identity) targetUid = identity.uid;
      } catch (_) {}
    } else {
      identity = await identityOrNull(identityAdmin, rawId);
    }

    let profile = await repo.getUser(targetUid);
    if (!profile && rawId.includes('@')) {
      profile = await repo.getUserByEmail(rawId).catch(() => null);
    }

    if (!identity && !profile?.id && !profile?.userId) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.', requestId: res.locals.requestId });
    }

    return res.json({ success: true, user: adminUserProjection(identity, profile || {}, targetUid) });
  } catch (_error) {
    return res.status(500).json({ success: false, code: 'USER_LOAD_FAILED', error: 'Unable to load user.', requestId: res.locals.requestId });
  }
});

// 4b. PATCH USER (Firebase Authentication identity + MariaDB profile)
router.patch('/:uid', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository();

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  const body = req.body || {};
  const changes = {};
  const expected = {};

  if (body.role !== undefined) {
    const rawRole = String(body.role || 'USER').toUpperCase();
    if (!VALID_ROLES.includes(rawRole)) {
      return res.status(400).json({ success: false, code: 'INVALID_ROLE', error: `Invalid role. Allowed roles: ${VALID_ROLES.join(', ')}.`, requestId: res.locals.requestId });
    }
    if (rawRole === 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, code: 'SUPER_ADMIN_ROLE_FORBIDDEN', error: 'SUPER_ADMIN claims cannot be granted through the Admin API.', requestId: res.locals.requestId });
    }
    if (!callerPermissions.has('*') && !callerPermissions.has('users.roles.manage') && !callerPermissions.has('users.update')) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to change user roles.', requestId: res.locals.requestId });
    }
    changes.role = rawRole;
    if (body.expectedRole !== undefined) expected.role = String(body.expectedRole).toUpperCase();
  }

  if (body.suspended === undefined && body.status !== undefined) {
    body.suspended = String(body.status).toLowerCase() === 'suspended';
  }

  if (body.suspended !== undefined) {
    if (!callerPermissions.has('*') && !callerPermissions.has('users.update')) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to change account status.', requestId: res.locals.requestId });
    }
    changes.suspended = Boolean(body.suspended);
    if (body.expectedSuspended !== undefined) expected.suspended = Boolean(body.expectedSuspended);
  }

  if (body.membership !== undefined) {
    if (!['Basic', 'Premium'].includes(body.membership)) {
      return res.status(400).json({ success: false, code: 'INVALID_MEMBERSHIP', error: 'Membership must be Basic or Premium.', requestId: res.locals.requestId });
    }
    if (!callerPermissions.has('*') && !callerPermissions.has('payments.manage') && !callerPermissions.has('users.update')) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to change subscriptions.', requestId: res.locals.requestId });
    }
    changes.membership = body.membership;
    if (body.expectedMembership !== undefined) expected.membership = body.expectedMembership;
  }

  if (body.durationMonths !== undefined) {
    changes.durationMonths = Math.max(1, Math.min(600, Number(body.durationMonths) || 12));
  }

  if (body.displayName !== undefined) {
    changes.displayName = String(body.displayName).trim().slice(0, 120);
  }

  if (body.preferredCurrency !== undefined) {
    changes.preferredCurrency = normalizeCurrencyCode(body.preferredCurrency);
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ success: false, code: 'NO_CHANGES', error: 'No supported fields were provided for update.', requestId: res.locals.requestId });
  }

  const identityFieldChange = changes.role !== undefined || changes.suspended !== undefined;
  const profileFieldChange = changes.membership !== undefined || changes.displayName !== undefined || changes.preferredCurrency !== undefined;
  if (identityFieldChange && profileFieldChange) {
    return res.status(400).json({ success: false, code: 'CROSS_DOMAIN_UPDATE_REJECTED', error: 'Identity and application-profile fields must be updated in separate requests.' });
  }
  const expectedRevision = req.body?.expectedRevision;
  if (profileFieldChange && expectedRevision !== undefined && expectedRevision !== null && !Number.isInteger(Number(expectedRevision))) {
    return res.status(400).json({ success: false, code: 'PROFILE_REVISION_REQUIRED', error: 'expectedRevision must be an integer when provided for profile updates.' });
  }

  try {
    const identity = await identityOrNull(identityAdmin, uid);
    const profile = (await repo.getUser(uid)) || {};
    if (!identity && !profile.id && !profile.userId) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });
    const claims = identity?.customClaims || {};
    const currentRole = String(claims.role || 'USER').toUpperCase();
    const currentSuspended = identity?.disabled === true;
    const currentMembership = profile.membership || 'Basic';
    if (expected.role !== undefined && expected.role !== currentRole) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This user role changed after the page loaded. Refresh before retrying.' });
    }
    if (expected.suspended !== undefined && expected.suspended !== currentSuspended) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This account status changed after the page loaded. Refresh before retrying.' });
    }
    if (expected.membership !== undefined && expected.membership !== currentMembership) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This membership changed after the page loaded. Refresh before retrying.' });
    }
    const callerPermissions = permissionsFor(req.user);
    const callerIsSuperAdmin = callerPermissions.has('*') || String(req.user?.claims?.role || req.user?.role || '').toUpperCase() === 'SUPER_ADMIN';

    if (currentRole === 'SUPER_ADMIN') {
      if (!callerIsSuperAdmin) {
        return res.status(403).json({ success: false, code: 'SUPER_ADMIN_PROTECTED', error: 'Only SUPER_ADMIN can modify a SUPER_ADMIN account.' });
      }
      if (identityFieldChange && changes.role !== undefined && changes.role !== 'SUPER_ADMIN') {
        return res.status(400).json({ success: false, code: 'SUPER_ADMIN_DEMOTION_PROTECTED', error: 'SUPER_ADMIN role demotion is protected.' });
      }
    }
    if (uid === req.user?.uid && changes.role !== undefined && !['ADMIN', 'SUPER_ADMIN'].includes(changes.role)) {
      return res.status(400).json({ success: false, code: 'SELF_DEMOTION_PROHIBITED', error: 'Self-demotion is prohibited.' });
    }
    const before = {
      role: currentRole, suspended: currentSuspended, membership: currentMembership,
      preferredCurrency: normalizeCurrencyCode(profile.preferredCurrency || 'INR'),
      displayName: profile.displayName || identity?.displayName || null,
    };
    const after = {
      role: changes.role ?? before.role,
      suspended: changes.suspended ?? before.suspended,
      membership: changes.membership ?? before.membership,
      preferredCurrency: changes.preferredCurrency ?? before.preferredCurrency,
      displayName: changes.displayName ?? before.displayName,
    };
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
      action: 'USER_ADMIN_UPDATE_REQUESTED', category: 'iam.users', severity: 'HIGH', outcome: 'SUCCESS',
      method: 'PATCH', pathname: req.originalUrl, statusCode: 202,
      resourceType: 'user', resourceId: uid, metadata: { before, after }, requestId: res.locals.requestId,
    });

    let updatedProfile = profile;
    if (identityFieldChange) {
      if (!identity) return res.status(404).json({ success: false, code: 'IDENTITY_NOT_FOUND', error: 'Firebase Authentication identity not found.' });
      if (changes.suspended !== undefined) await identityAdmin.auth().updateUser(uid, { disabled: changes.suspended });
      if (changes.role !== undefined) {
        const nextClaims = { ...claims, role: changes.role };
        delete nextClaims.permissions;
        await identityAdmin.auth().setCustomUserClaims(uid, nextClaims);
      }
      await identityAdmin.auth().revokeRefreshTokens(uid);
    } else {
      updatedProfile = { ...profile };
      if (changes.displayName !== undefined) updatedProfile.displayName = changes.displayName;
      if (changes.preferredCurrency !== undefined) updatedProfile.preferredCurrency = changes.preferredCurrency;
      if (changes.membership !== undefined) {
        updatedProfile.membership = changes.membership;
        if (changes.membership === 'Premium') {
          const ends = new Date();
          ends.setMonth(ends.getMonth() + (changes.durationMonths ?? 12));
          updatedProfile.membershipEnds = ends.toISOString();
          updatedProfile.paymentStatus = profile.paymentStatus === 'ACTIVE' ? 'ACTIVE' : 'ADMIN_GRANTED';
        } else {
          updatedProfile.membershipEnds = null;
          updatedProfile.paymentStatus = 'INACTIVE';
        }
      }
      const targetRevision = expectedRevision !== undefined && expectedRevision !== null
        ? Number(expectedRevision)
        : Number(profile.revision || 0);
      updatedProfile = await repo.saveUserWithRevisionGuard(uid, updatedProfile, targetRevision);
    }

    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
      action: 'USER_ADMIN_UPDATED', category: 'iam.users', severity: 'HIGH', outcome: 'SUCCESS',
      method: 'PATCH', pathname: req.originalUrl, statusCode: 200,
      resourceType: 'user', resourceId: uid, metadata: { before, after }, requestId: res.locals.requestId,
    });
    const updatedIdentity = await identityOrNull(identityAdmin, uid);
    const freshProfile = profileFieldChange ? (await repo.getUser(uid)) : updatedProfile;
    return res.json({ success: true, message: 'User updated successfully.', user: adminUserProjection(updatedIdentity, freshProfile || {}, uid) });
  } catch (error) {
    console.error('[Admin user PATCH error]', error.message);
    const isDirectoryUnavailable = error.code === 'IDENTITY_DIRECTORY_UNAVAILABLE'
      || error.code === 'APPLICATION_DATABASE_UNAVAILABLE'
      || error.code === 'ECONNREFUSED'
      || error.code === 'PROTOCOL_CONNECTION_LOST'
      || /connect ECONNREFUSED/i.test(error.message);
    if (isDirectoryUnavailable) {
      return res.status(503).json({
        success: false,
        code: 'USER_DIRECTORY_UNAVAILABLE',
        error: 'User directory unavailable.',
        requestId: res.locals.requestId,
      });
    }
    const status = error.status || (error.code === 'auth/user-not-found' ? 404 : 500);
    return res.status(status).json({ success: false, code: error.code || 'USER_UPDATE_FAILED', error: status >= 500 ? 'Unable to update user.' : error.message, requestId: res.locals.requestId });
  }

});

// 4c. ACCOUNT LIFECYCLE MUTATION (/admin/users/:uid/status)
//
// PATCH is the mandate contract (ACTIVE | SUSPENDED | DISABLED + optional
// reason); POST is retained because the previously shipped User 360 client and
// the bulk endpoint already use it. Both funnel through one implementation so
// the two entry points can never disagree about what was persisted.
async function applyAccountStatusChange(req, res, { requestedStatus, reason }) {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository();

  if (!USER_ID_PATTERN.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to change account status.', requestId: res.locals.requestId });
  }
  if (uid === req.user?.uid) {
    return res.status(400).json({
      success: false,
      code: 'SELF_STATUS_CHANGE_FORBIDDEN',
      error: 'Administrators cannot change the lifecycle status of their own account. Ask another administrator.',
      requestId: res.locals.requestId,
    });
  }

  const auditBase = {
    actorUid: req.user?.uid,
    actorEmail: req.user?.email,
    actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
    category: 'iam.users',
    severity: 'HIGH',
    method: req.method,
    pathname: req.originalUrl,
    resourceType: 'user',
    resourceId: uid,
    requestId: res.locals.requestId,
  };

  let identity;
  try {
    identity = await identityOrNull(identityAdmin, uid);
  } catch (error) {
    const unavailable = error?.code === 'IDENTITY_DIRECTORY_UNAVAILABLE';
    return res.status(unavailable ? 503 : 502).json({
      success: false,
      code: unavailable ? 'IDENTITY_DIRECTORY_UNAVAILABLE' : 'IDENTITY_LOOKUP_FAILED',
      error: 'The identity directory could not be reached, so the account status was not changed.',
      requestId: res.locals.requestId,
    });
  }
  if (!identity) {
    return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found in authentication directory.', requestId: res.locals.requestId });
  }

  const responseStatus = 200;
  const profile = await repo.getUser(uid).catch(error => {
    console.warn('[Admin user status] profile read failed:', error?.code || error?.message);
    return null;
  });
  const current = resolveAccountStatus(identity, profile);
  const previousStatus = current.status;
  const identityShouldBeDisabled = requestedStatus !== 'ACTIVE';
  const changed = previousStatus !== requestedStatus || current.identityDisabled !== identityShouldBeDisabled;

  // ---- 1. Identity plane (Firebase owns `disabled`) -------------------------
  let tokensRevoked = false;
  try {
    if (identity?.disabled !== identityShouldBeDisabled) {
      await identityAdmin.auth().updateUser(uid, { disabled: identityShouldBeDisabled });
    }
    if (identityShouldBeDisabled && identity?.disabled !== true) {
      await identityAdmin.auth().revokeRefreshTokens(uid);
      tokensRevoked = true;
    }
  } catch (identityError) {
    // Nothing has been written to MariaDB yet, so the account is unchanged and
    // the operator can retry safely. Never report success here.
    await recordAdminAuditLog(req, {
      ...auditBase,
      action: 'USER_STATUS_UPDATED',
      outcome: 'FAILURE',
      statusCode: 502,
      metadata: {
        attemptedStatus: requestedStatus,
        previousStatus,
        reason,
        stage: 'IDENTITY_SYNC',
        error: identityError?.code || 'IDENTITY_SYNC_FAILED',
        applied: false,
      },
    }).catch(auditError => console.error('[Admin user status] failure audit write failed:', auditError?.code || auditError?.message));
    return res.status(502).json({
      success: false,
      code: 'IDENTITY_SYNC_FAILED',
      error: 'Firebase Authentication rejected the status change. No change was applied.',
      applied: false,
      uid,
      previousStatus,
      requestId: res.locals.requestId,
    });
  }

  // ---- 2. Application profile plane (MariaDB) ------------------------------
  let persistence;
  try {
    persistence = await persistAccountStatus({ uid, status: requestedStatus, reason, actorUid: req.user?.uid });
  } catch (dbError) {
    // The identity plane changed; the profile write did not. Report the real
    // partial state and let the operator retry (the operation is idempotent).
    await recordAdminAuditLog(req, {
      ...auditBase,
      action: 'USER_STATUS_UPDATED',
      outcome: 'PARTIAL_FAILURE',
      statusCode: 502,
      metadata: {
        attemptedStatus: requestedStatus,
        previousStatus,
        reason,
        stage: 'PROFILE_PERSISTENCE',
        identityDisabled: identityShouldBeDisabled,
        tokensRevoked,
        error: dbError?.code || 'PROFILE_PERSISTENCE_FAILED',
        applied: false,
      },
    }).catch(auditError => console.error('[Admin user status] partial-failure audit write failed:', auditError?.code || auditError?.message));
    return res.status(dbError?.code === 'USER_PROFILE_CONFLICT' ? 409 : 502).json({
      success: false,
      code: dbError?.code === 'USER_PROFILE_CONFLICT' ? 'USER_PROFILE_CONFLICT' : 'USER_STATE_PERSISTENCE_FAILED',
      error: dbError?.code === 'USER_PROFILE_CONFLICT'
        ? 'The user profile changed concurrently. Reload the record and retry.'
        : 'Firebase Authentication was updated, but the MariaDB profile could not be persisted. Retry to reconcile.',
      applied: false,
      partial: { identityUpdated: true, profileUpdated: false, identityDisabled: identityShouldBeDisabled, tokensRevoked },
      uid,
      previousStatus,
      requestId: res.locals.requestId,
    });
  }

  const updatedAt = persistence.updatedAt || new Date().toISOString();

  // ---- 3. Audit trail ------------------------------------------------------
  const auditMetadata = {
    previousStatus,
    status: requestedStatus,
    reason,
    changed,
    identityDisabled: identityShouldBeDisabled,
    tokensRevoked,
    profilePersisted: persistence.persisted,
    profileStatusReason: persistence.reason,
    revision: persistence.revision,
  };
  try {
    await recordAdminAuditLog(req, {
      ...auditBase,
      action: 'USER_STATUS_UPDATED',
      outcome: 'SUCCESS',
      statusCode: responseStatus,
      metadata: auditMetadata,
    });
  } catch (auditError) {
    console.error('[Admin user status] audit write failed:', auditError?.code || auditError?.message);
    return res.status(500).json({
      success: false,
      code: 'AUDIT_WRITE_FAILED',
      error: 'The account status was applied, but the administrative audit record could not be stored. This change is NOT fully audited.',
      applied: true,
      uid,
      status: requestedStatus,
      updatedAt,
      audit: { recorded: false },
      requestId: res.locals.requestId,
    });
  }

  const statusLabel = requestedStatus.toLowerCase();
  return res.status(responseStatus).json({
    success: true,
    uid,
    status: requestedStatus,
    updatedAt,
    previousStatus,
    changed,
    message: `User account is now ${statusLabel}.`,
    identity: { disabled: identityShouldBeDisabled, tokensRevoked },
    persistence: {
      profilePersisted: persistence.persisted,
      revision: persistence.revision,
      limitation: persistence.persisted ? null : 'IDENTITY_ONLY_ACCOUNT',
    },
    audit: { recorded: true },
  });
}

// Mandate 11C contract: PATCH /api/admin/users/:uid/status
router.patch('/:uid/status', async (req, res) => {
  const body = req.body || {};
  const requestedStatus = parseAccountStatus(body.status);
  if (!requestedStatus) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ACCOUNT_STATUS',
      error: `status must be one of ${ACCOUNT_STATUSES.join(', ')}.`,
      requestId: res.locals.requestId,
    });
  }
  const parsedReason = accountStatusReason(body.reason);
  if (!parsedReason.ok) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_STATUS_REASON',
      error: 'reason must be a string of at most 500 characters.',
      requestId: res.locals.requestId,
    });
  }
  return applyAccountStatusChange(req, res, { requestedStatus, reason: parsedReason.reason });
});

// Backwards-compatible entry point used by earlier clients (suspended:boolean or
// status:'active'|'suspended').
router.post('/:uid/status', async (req, res) => {
  const body = req.body || {};
  let requestedStatus = parseAccountStatus(body.status);
  if (!requestedStatus && body.suspended !== undefined) {
    if (typeof body.suspended !== 'boolean') {
      return res.status(400).json({ success: false, code: 'INVALID_ACCOUNT_STATUS', error: 'suspended must be a boolean.', requestId: res.locals.requestId });
    }
    requestedStatus = body.suspended ? 'SUSPENDED' : 'ACTIVE';
  }
  if (!requestedStatus) {
    return res.status(400).json({
      success: false,
      code: 'STATUS_REQUIRED',
      error: 'Account status (status: ACTIVE|SUSPENDED|DISABLED or suspended: boolean) is required.',
      requestId: res.locals.requestId,
    });
  }
  const parsedReason = accountStatusReason(body.reason);
  if (!parsedReason.ok) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_STATUS_REASON',
      error: 'reason must be a string of at most 500 characters.',
      requestId: res.locals.requestId,
    });
  }
  return applyAccountStatusChange(req, res, { requestedStatus, reason: parsedReason.reason });
});

// 5. USER TENANT BINDING (ASSIGN TO TENANT)
// GAP-22: the strict registry contract requires a concrete tenant-owned
// workspaceId. The route resolves the tenant's canonical default workspace
// (or an explicit, tenant-owned workspaceId from the request) at this
// abstraction boundary — never by weakening the registry contract, never by
// inventing or arbitrarily picking a workspace.
router.post('/:uid/tenants', async (req, res) => {
  const uid = String(req.params.uid || '');
  const tenantService = req.app.get('tenantService');
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  if (!tenantService?.registry) return res.status(503).json({ success: false, code: 'TENANT_SERVICE_UNAVAILABLE', error: 'Tenant registry unavailable.', requestId: res.locals.requestId });
  const tenantId = String(req.body?.tenantId || '').trim();
  const role = String(req.body?.role || 'MEMBER').toUpperCase();
  const requestedWorkspaceId = String(req.body?.workspaceId || '').trim() || null;
  if (!tenantId) return res.status(400).json({ success: false, code: 'TENANT_ID_REQUIRED', error: 'Tenant identifier is required.', requestId: res.locals.requestId });
  try {
    const tenant = await tenantService.registry.getTenant(tenantId);
    if (String(tenant.lifecycleState || '').toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ success: false, code: 'TENANT_INACTIVE', error: 'This organization is not active. Reactivate it before assigning members.', requestId: res.locals.requestId });
    }
    // Distinguish a fresh assignment from an idempotent re-grant so the UI can
    // state whether the user was already a member instead of implying a no-op.
    const alreadyMember = await tenantService.registry.getMembership(tenant.id, uid)
      .then(() => true)
      .catch(error => {
        if (error?.status === 404 || error?.code === 'TENANT_MEMBERSHIP_NOT_FOUND') return false;
        throw error;
      });
    // Resolve the tenant's canonical/default workspace (or validate an
    // explicitly requested tenant-owned one). Deterministic failure
    // (TENANT_NO_USABLE_WORKSPACE 409 / INVALID_WORKSPACE_ID 400 /
    // WORKSPACE_NOT_FOUND 404) replaces the old invalid-context HTTP 400.
    const workspace = await resolveAssignableWorkspace(tenantService.registry, tenant.id, requestedWorkspaceId);
    const membership = await tenantService.registry.grantMembership({ tenantId: tenant.id, principalId: uid, workspaceId: workspace.id, roles: [role], status: 'ACTIVE' });
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_TENANT_MEMBERSHIP_GRANTED',
      category: 'enterprise.tenancy', severity: 'HIGH', method: 'POST', pathname: req.originalUrl,
      resourceType: 'tenant_membership', resourceId: `${tenant.id}:${uid}`,
      metadata: { tenantId: tenant.id, uid, role, workspaceId: workspace.id, workspaceResolution: workspace.resolution, alreadyMember }, requestId: res.locals.requestId,
    });
    const message = alreadyMember
      ? `User is already a member of ${tenant.displayName}; the existing membership was updated (role: ${role}).`
      : `User assigned to ${tenant.displayName} via ${workspace.isDefault ? 'the default workspace' : 'workspace'} "${workspace.name}".`;
    return res.json({
      success: true,
      message,
      membership,
      workspace: { id: workspace.id, name: workspace.name, isDefault: workspace.isDefault === true, resolution: workspace.resolution },
      alreadyMember,
      source: 'MARIADB_TENANT_REGISTRY',
      requestId: res.locals.requestId,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'TENANT_ASSIGN_FAILED', error: error.status ? error.message : 'Tenant assignment failed.', requestId: res.locals.requestId });
  }
});

// 6. USER TENANT REMOVAL
router.delete('/:uid/tenants/:tenantId', async (req, res) => {
  const uid = String(req.params.uid || '');
  const tenantId = String(req.params.tenantId || '');
  const tenantService = req.app.get('tenantService');
  if (!tenantService?.registry) return res.status(503).json({ success: false, code: 'TENANT_SERVICE_UNAVAILABLE', error: 'Tenant registry unavailable.' });
  try {
    await tenantService.registry.removeTenantMembership({ tenantId, principalId: uid });
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_TENANT_MEMBERSHIP_REMOVED',
      category: 'enterprise.tenancy', severity: 'HIGH', method: 'DELETE', pathname: req.originalUrl,
      resourceType: 'tenant_membership', resourceId: `${tenantId}:${uid}`,
      metadata: { tenantId, uid }, requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: 'User removed from tenant.', source: 'MARIADB_TENANT_REGISTRY' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'TENANT_REMOVE_FAILED', error: error.status ? error.message : 'Tenant removal failed.' });
  }
});

// 7. USER AI ENTITLEMENT CONTROLS
router.get('/:uid/ai-entitlement', async (req, res) => {
  const uid = String(req.params.uid || '');
  const entitlement = await getUserAiEntitlement(null, uid);
  return res.json({ success: true, entitlement });
});

router.put('/:uid/ai-entitlement', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const { dailyLimit, maxTokens, expiresAt, reason } = req.body || {};

  try {
    const updated = await setUserAiQuotaOverride({
      admin: identityAdmin,
      uid,
      dailyLimit,
      maxTokens,
      expiresAt,
      reason,
      actorUid: req.user?.uid || 'admin',
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, entitlement: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'AI_OVERRIDE_FAILED', error: error.message });
  }
});

router.delete('/:uid/ai-entitlement', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  try {
    const updated = await removeUserAiQuotaOverride({
      admin: identityAdmin,
      uid,
      actorUid: req.user?.uid || 'admin',
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, entitlement: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'AI_OVERRIDE_FAILED', error: error.message });
  }
});

router.post('/:uid/ai-quota-reset', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  try {
    const updated = await resetUserAiQuota({
      admin: identityAdmin,
      uid,
      actorUid: req.user?.uid || 'admin',
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: 'AI daily usage quota reset to 0.', deletedCount: Number(updated.usageRowsDeleted || 0), entitlement: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'QUOTA_RESET_FAILED', error: error.message });
  }
});

// 8. SEND PASSWORD RESET
router.post(['/:uid/send-password-reset', '/:uid/password-reset'], async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to trigger password reset.' });
  }
  try {
    const identity = await identityOrNull(identityAdmin, uid);
    if (!identity) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'Identity not found.' });
    if (!identity.email) return res.status(400).json({ success: false, code: 'NO_EMAIL', error: 'Identity has no email address.' });
    const resetLink = await identityAdmin.auth().generatePasswordResetLink(identity.email);
    const linkHash = crypto.createHash('sha256').update(resetLink).digest('hex');
    const notificationId = await queueEmail(getPool(), {
      eventId: `admin-password-reset:${uid}:${linkHash}`,
      recipient: identity.email,
      templateType: 'password_reset',
      vars: { candidate_name: identity.displayName || identity.email, user_name: identity.displayName || identity.email, reset_link: resetLink },
      metadata: { source: 'admin_password_reset', targetUid: uid, actorUid: req.user?.uid },
      idempotencyKey: `admin-password-reset:${linkHash}`,
      sensitive: true,
    });
    await recordAdminAuditLog(req, {
      actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_PASSWORD_RESET_TRIGGERED',
      category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl,
      resourceType: 'user', resourceId: uid, metadata: { targetUid: uid, deliveryState: 'NOTIFICATION_QUEUED', notificationId },
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: 'Password reset email queued for delivery.', deliveryState: 'NOTIFICATION_QUEUED', notificationId });
  } catch (error) {
    console.error('[Admin send-password-reset error]', error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'PASSWORD_RESET_FAILED', error: error.status ? error.message : 'Failed to deliver password reset email.', requestId: res.locals.requestId });
  }
});

// 9. ADMIN FORCE-VERIFY / UNVERIFY EMAIL
router.post('/:uid/verify-email', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to modify email verification status.' });
  const emailVerified = req.body?.emailVerified !== false;
  try {
    const identity = await identityOrNull(identityAdmin, uid);
    if (!identity) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'Identity not found.' });
    await recordAdminAuditLog(req, { actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_EMAIL_VERIFICATION_CHANGE_REQUESTED', category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl, statusCode: 202, resourceType: 'user', resourceId: uid, metadata: { before: identity.emailVerified, after: emailVerified }, requestId: res.locals.requestId });
    await identityAdmin.auth().updateUser(uid, { emailVerified });
    await identityAdmin.auth().revokeRefreshTokens(uid);
    await recordAdminAuditLog(req, { actorUid: req.user?.uid, actorEmail: req.user?.email, action: emailVerified ? 'USER_EMAIL_VERIFIED_BY_ADMIN' : 'USER_EMAIL_UNVERIFIED_BY_ADMIN', category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl, resourceType: 'user', resourceId: uid, metadata: { emailVerified }, requestId: res.locals.requestId });
    return res.json({ success: true, message: `Email verification status updated to ${emailVerified ? 'Verified' : 'Unverified'}.`, emailVerified });
  } catch (error) {
    console.error('[Admin verify-email error]', error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'EMAIL_VERIFY_FAILED', error: error.status ? error.message : 'Failed to update email verification.', requestId: res.locals.requestId });
  }
});

// 10. ADMIN REVOKE ACTIVE SESSIONS & REFRESH TOKENS
//
// Firebase refresh tokens are revoked and `tokensValidAfterTime` is advanced.
// This application verifies every ID token with checkRevoked=true
// (security/auth.js -> admin.auth().verifyIdToken(token, true)), so tokens
// issued before the revocation instant are rejected on their next request —
// the revocation is enforced server-side, not merely advertised.
router.post('/:uid/revoke-sessions', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!USER_ID_PATTERN.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to revoke user sessions.', requestId: res.locals.requestId });
  }
  if (!identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'IDENTITY_DIRECTORY_UNAVAILABLE', error: 'The Firebase Authentication directory is unavailable.', requestId: res.locals.requestId });
  }

  let identity;
  try {
    identity = await identityOrNull(identityAdmin, uid);
  } catch (error) {
    return res.status(502).json({
      success: false,
      code: 'IDENTITY_LOOKUP_FAILED',
      error: 'The identity directory could not be reached, so no sessions were revoked.',
      requestId: res.locals.requestId,
    });
  }
  if (!identity) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'Identity not found.', requestId: res.locals.requestId });

  try {
    await identityAdmin.auth().revokeRefreshTokens(uid);
    const updated = await identityAdmin.auth().getUser(uid);
    const revokedAt = adminIso(updated.tokensValidAfterTime) || new Date().toISOString();
    try {
      await recordAdminAuditLog(req, {
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
        action: 'USER_SESSIONS_REVOKED',
        category: 'iam.users',
        severity: 'HIGH',
        outcome: 'SUCCESS',
        method: req.method,
        pathname: req.originalUrl,
        statusCode: 200,
        resourceType: 'user',
        resourceId: uid,
        metadata: { tokensValidAfterTime: revokedAt, mechanism: 'FIREBASE_REFRESH_TOKEN_REVOCATION', identityCheckRevoked: true },
        requestId: res.locals.requestId,
      });
    } catch (auditError) {
      console.error('[Admin revoke-sessions] audit write failed:', auditError?.code || auditError?.message);
      return res.status(500).json({
        success: false,
        code: 'AUDIT_WRITE_FAILED',
        error: 'Sessions were revoked, but the administrative audit record could not be stored.',
        applied: true,
        uid,
        revokedAt,
        audit: { recorded: false },
        requestId: res.locals.requestId,
      });
    }
    return res.json({
      success: true,
      uid,
      revokedAt,
      message: 'All refresh tokens have been revoked. The user must sign in again.',
      tokensValidAfterTime: revokedAt,
      mechanism: 'FIREBASE_REFRESH_TOKEN_REVOCATION',
    });
  } catch (error) {
    console.error('[Admin revoke-sessions error]', error.message);
    return res.status(error.status || 502).json({
      success: false,
      code: error.code || 'SESSION_REVOKE_FAILED',
      error: error.status && error.status < 500 ? error.message : 'Firebase Authentication could not revoke the refresh tokens; no revocation was confirmed.',
      requestId: res.locals.requestId,
    });
  }
});

// 11. ADMIN RESET / UNENROLL 2FA (MFA RECOVERY)
router.post('/:uid/unenroll-mfa', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to reset MFA.' });
  try {
    const identity = await identityOrNull(identityAdmin, uid);
    if (!identity) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'Identity not found.' });
    const factors = identity.multiFactor?.enrolledFactors || [];
    await recordAdminAuditLog(req, { actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_MFA_UNENROLL_REQUESTED', category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl, statusCode: 202, resourceType: 'user', resourceId: uid, metadata: { enrolledFactorCount: factors.length }, requestId: res.locals.requestId });
    await identityAdmin.auth().updateUser(uid, { multiFactor: { enrolledFactors: [] } });
    await identityAdmin.auth().revokeRefreshTokens(uid);
    await recordAdminAuditLog(req, { actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_MFA_UNENROLLED_BY_ADMIN', category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl, resourceType: 'user', resourceId: uid, metadata: { removedFactorCount: factors.length }, requestId: res.locals.requestId });
    return res.json({ success: true, message: 'All Firebase Authentication MFA factors were removed.', mfaEnabled: false, removedFactorCount: factors.length });
  } catch (error) {
    console.error('[Admin unenroll-mfa error]', error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'MFA_RESET_FAILED', error: error.status ? error.message : 'Failed to unenroll MFA.', requestId: res.locals.requestId });
  }
});

// 12. ADMIN SINGLE USER COMPLETE DATA EXPORT (GDPR / AUDIT)
router.get('/:uid/export', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository();
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.export') && !callerPermissions.has('users.read')) return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to export user data.' });
  try {
    const identity = await identityOrNull(identityAdmin, uid);
    const [profile, resumes, portfolios, covers, favourites, notifications, applications, orders, aiEntitlement] = await Promise.all([
      repo.getUser(uid), repo.getResumes(uid), repo.getPortfolios(uid), repo.getCovers(uid),
      repo.getFavourites(uid), repo.getNotifications(uid), repo.getApplications({ applicantId: uid }),
      repo.getUserPaymentOrders(uid), getUserAiEntitlement(null, uid),
    ]);
    if (!identity && !profile) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });
    const exportBundle = {
      schemaVersion: 1, exportedAt: new Date().toISOString(), requestedBy: req.user?.uid || 'admin',
      identity: identity ? {
        uid: identity.uid, email: identity.email || null, emailVerified: identity.emailVerified === true,
        displayName: identity.displayName || null, disabled: identity.disabled === true,
        providers: (identity.providerData || []).map(provider => ({ providerId: provider.providerId, uid: provider.uid, email: provider.email || null })),
        metadata: identity.metadata || {}, mfaFactors: (identity.multiFactor?.enrolledFactors || []).map(factor => ({ factorId: factor.factorId, uid: factor.uid, displayName: factor.displayName || null, enrollmentTime: factor.enrollmentTime || null })),
      } : null,
      applicationProfile: profile || null,
      resumes, portfolios, coverLetters: covers, favourites, notifications, jobApplications: applications,
      billing: { paymentOrders: orders }, aiEntitlement,
      contentSummary: { resumes: resumes.length, portfolios: portfolios.length, coverLetters: covers.length, favourites: favourites.length, notifications: notifications.length, jobApplications: applications.length, paymentOrders: orders.length },
      limitations: ['Enterprise tenant-scoped resource export requires a tenant-authorized export and is not included in this user-level bundle.'],
    };
    await recordAdminAuditLog(req, { actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_DATA_EXPORTED_BY_ADMIN', category: 'iam.users', severity: 'HIGH', method: 'GET', pathname: req.originalUrl, resourceType: 'user', resourceId: uid, metadata: { targetUid: uid, contentSummary: exportBundle.contentSummary }, requestId: res.locals.requestId });
    return res.json({ success: true, export: exportBundle });
  } catch (error) {
    console.error('[Admin user export error]', error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'USER_EXPORT_FAILED', error: error.status ? error.message : 'Failed to export user data.', requestId: res.locals.requestId });
  }
});

module.exports = {
  adminUsersRouter: router,
  adminUserProjection,
};
