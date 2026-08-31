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
  const tenantService = req.app.get('tenantService');
  const repo = req.repository || getRepository();
  if (!identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'IDENTITY_DIRECTORY_UNAVAILABLE', error: 'The Firebase Authentication directory is unavailable.' });
  }
  if (!tenantService?.registry) {
    return res.status(503).json({ success: false, code: 'TENANT_SERVICE_UNAVAILABLE', error: 'The tenant registry is unavailable.' });
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
      const listed = await identityAdmin.auth().listUsers(limit, pageToken);
      identities = listed.users || [];
      listedPageToken = listed.pageToken || null;
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

    // Direct lookup by email if rawId has '@', else lookup by UID
    if (rawId.includes('@')) {
      try {
        identity = await identityAdmin.auth().getUserByEmail(rawId);
        if (identity) targetUid = identity.uid;
      } catch (_) {}
    } else {
      identity = await identityOrNull(identityAdmin, rawId);
    }

    // 2. Fetch Profile, Content Counts, Orders, AI Entitlement, and Audit History from MariaDB
    let profileResult = await repo.getUser(targetUid);
    if (!profileResult && rawId.includes('@')) {
      profileResult = await repo.getUserByEmail(rawId).catch(() => null);
    }

    const [contentCounts, orders, aiEntitlement, securityLogs, adminLogs] = await Promise.all([
      repo.getUserContentCounts(targetUid).catch(() => ({})),
      repo.getUserPaymentOrders(targetUid).catch(() => []),
      getUserAiEntitlement(null, targetUid).catch(() => ({ uid: targetUid, plan: 'Basic', baseQuota: 10, effectiveLimit: 10, usedToday: 0, remainingToday: 10 })),
      repo.getSecurityAuditLogs({ targetUid, limit: 50 }).catch(() => []),
      repo.getAdminAuditLogs({ resourceId: targetUid, limit: 50 }).catch(() => []),
    ]);

    if (!identity && !profileResult) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.', requestId: res.locals.requestId });
    }

    const profile = profileResult || {};
    const baseUser = adminUserProjection(identity, profile, targetUid);

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
  if (profileFieldChange && !Number.isInteger(Number(expectedRevision))) {
    return res.status(400).json({ success: false, code: 'PROFILE_REVISION_REQUIRED', error: 'expectedRevision is required for profile updates.' });
  }

  try {
    const identity = await identityOrNull(identityAdmin, uid);
    const profile = (await repo.getUser(uid)) || {};
    if (!identity && !profile.id) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });
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
    if (currentRole === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, code: 'SUPER_ADMIN_PROTECTED', error: 'SUPER_ADMIN identities cannot be changed from this API.' });
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
      updatedProfile = await repo.saveUserWithRevisionGuard(uid, updatedProfile, Number(expectedRevision));
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
router.post('/:uid/revoke-sessions', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to revoke user sessions.' });
  try {
    const identity = await identityOrNull(identityAdmin, uid);
    if (!identity) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'Identity not found.' });
    await identityAdmin.auth().revokeRefreshTokens(uid);
    const updated = await identityAdmin.auth().getUser(uid);
    await recordAdminAuditLog(req, { actorUid: req.user?.uid, actorEmail: req.user?.email, action: 'USER_SESSIONS_REVOKED_BY_ADMIN', category: 'iam.users', severity: 'HIGH', method: 'POST', pathname: req.originalUrl, resourceType: 'user', resourceId: uid, metadata: { tokensValidAfterTime: updated.tokensValidAfterTime }, requestId: res.locals.requestId });
    return res.json({ success: true, message: 'All refresh tokens have been revoked. The user must sign in again.', tokensValidAfterTime: updated.tokensValidAfterTime });
  } catch (error) {
    console.error('[Admin revoke-sessions error]', error.message);
    return res.status(error.status || 500).json({ success: false, code: error.code || 'SESSION_REVOKE_FAILED', error: error.status ? error.message : 'Failed to revoke sessions.', requestId: res.locals.requestId });
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
