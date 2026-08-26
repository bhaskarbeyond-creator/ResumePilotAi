'use strict';

const express = require('express');
const crypto = require('crypto');
const admin = require('../services/firebaseAdmin');
const { permissionsFor } = require('../security/auth');
const { getUserAiEntitlement, setUserAiQuotaOverride, removeUserAiQuotaOverride, resetUserAiQuota } = require('../services/adminAiEntitlement');
const { normalizeCurrencyCode } = require('../services/platformCurrency');
const { recordAdminAuditLog } = require('../security/adminAudit');
const { getRepository } = require('../repositories');

const router = express.Router();

// Attach database repository to request
router.use((req, res, next) => {
  try {
    req.repository = req.repository || getRepository(req.app.get('db'));
    next();
  } catch (_err) {
    return res.status(500).json({ error: 'Database layer unavailable' });
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

function adminUserProjection(identity, profile = {}, id = identity?.uid || profile?.id || profile?.userId) {
  const claims = identity?.customClaims || {};
  const rawRole = String(claims.role || profile.role || (profile.isA ? 'ADMIN' : 'USER')).toUpperCase();
  const role = VALID_ROLES.includes(rawRole) ? rawRole : 'USER';
  const membershipEnds = adminIso(profile.membershipEnds || profile.membership_ends);
  
  const tenantMemberships = Array.isArray(profile.tenantMemberships) ? profile.tenantMemberships : [];
  const primaryTenant = profile.primaryTenant || (tenantMemberships.length > 0 ? {
    id: tenantMemberships[0].tenantId || tenantMemberships[0].id,
    displayName: tenantMemberships[0].displayName || tenantMemberships[0].tenantName || tenantMemberships[0].name || 'Primary Organization',
    slug: tenantMemberships[0].slug || tenantMemberships[0].tenantSlug || 'primary',
    role: tenantMemberships[0].role || 'ENTERPRISE_MEMBER',
  } : null);

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
    emailVerified: identity?.emailVerified === true || profile.emailVerified === true,
    suspended: identity?.disabled === true || profile.suspended === true,
    mfaEnabled: Array.isArray(identity?.multiFactor?.enrolledFactors) && identity.multiFactor.enrolledFactors.length > 0,
    membership: profile.membership || 'Basic',
    membershipEnds,
    paymentStatus: profile.paymentStatus || (profile.membership === 'Premium' ? 'ACTIVE' : 'INACTIVE'),
    preferredCurrency: normalizeCurrencyCode(profile.preferredCurrency || profile.currency || 'INR'),
    primaryTenant,
    tenantMemberships,
    tenantCount: tenantMemberships.length,
    aiQuotaOverride: profile.aiQuotaOverride || null,
    createdAt: adminIso(profile.createdAt || profile.created_at || identity?.metadata?.creationTime),
    lastLoginAt: adminIso(profile.lastLoginAt || profile.last_login_at || identity?.metadata?.lastSignInTime),
    updatedAt: adminIso(profile.updatedAt || profile.updated_at || identity?.tokensValidAfterTime),
  };
}

// 1. DIRECTORY LISTING WITH PAGINATION & FILTERS (MySQL Primary)
router.get('/', async (req, res) => {
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(req.app.get('db'));

  const limit = Math.min(Math.max(Number(req.query?.limit || req.query?.pageSize) || 25, 1), 200);
  const query = String(req.query?.q || req.query?.search || '').trim().toLowerCase();
  const status = String(req.query?.status || 'all').toLowerCase();
  const roleFilter = String(req.query?.role || 'all').toUpperCase();
  const planFilter = String(req.query?.plan || req.query?.subscription || 'all').toUpperCase();
  const tenantFilter = String(req.query?.tenantId || req.query?.tenant || '').trim();
  const pageToken = req.query?.pageToken ? String(req.query.pageToken) : undefined;

  try {
    let usersList = [];
    let nextPageToken = null;

    // A. Attempt Firebase Auth user directory
    if (identityAdmin?.auth) {
      try {
        const listed = await identityAdmin.auth().listUsers(limit, pageToken);
        nextPageToken = listed.pageToken || null;
        
        // Batch fetch MariaDB profiles for listed users
        usersList = await Promise.all((listed.users || []).map(async identity => {
          let profile = {};
          try {
            profile = (await repo.getUser(identity.uid)) || {};
          } catch (_) {}
          return adminUserProjection(identity, profile);
        }));
      } catch (authErr) {
        console.warn('[AdminUsers] Auth listUsers failed, reading from MariaDB users table:', authErr.message);
      }
    }

    // B. Fallback to MariaDB users table if Auth listing is empty/unavailable
    if (!usersList.length) {
      const dbUsers = await repo.getUsers({ limit }).catch(() => []);
      usersList = dbUsers.map(u => adminUserProjection(null, u, u.id || u.userId));
    }

    const filtered = usersList.filter(user => {
      const matchesQuery = !query || [user.id, user.email, user.displayName, user.primaryTenant?.displayName, user.primaryTenant?.slug]
        .some(value => String(value || '').toLowerCase().includes(query));
      
      const matchesStatus = status === 'all' || (status === 'suspended' && user.suspended) || (status === 'active' && !user.suspended);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesPlan = planFilter === 'ALL' || String(user.membership).toUpperCase() === planFilter;
      const matchesTenant = !tenantFilter || (
        (user.primaryTenant?.id === tenantFilter || user.primaryTenant?.slug === tenantFilter) ||
        user.tenantMemberships.some(t => t.tenantId === tenantFilter || t.id === tenantFilter || t.slug === tenantFilter)
      );

      return matchesQuery && matchesStatus && matchesRole && matchesPlan && matchesTenant;
    });

    return res.json({
      success: true,
      users: filtered,
      nextPageToken,
      pageSize: limit,
      filteredCount: filtered.length,
      source: 'mariadb-primary-user-directory',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin user directory error]', error.message);
    return res.status(500).json({ success: false, code: 'USER_DIRECTORY_ERROR', error: 'Unable to read the user directory.', requestId: res.locals.requestId });
  }
});

// 2. CREATE / INVITE USER (MySQL Primary)
router.post('/', async (req, res) => {
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');
  const repo = req.repository || getRepository(requestDb);

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.create') && !callerPermissions.has('users.update')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to create users.' });
  }

  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim().slice(0, 120);
  const rawRole = String(body.role || 'USER').toUpperCase();
  const requestedRole = VALID_ROLES.includes(rawRole) ? rawRole : 'USER';
  const membership = ['Basic', 'Premium'].includes(body.membership) ? body.membership : 'Basic';
  const durationMonths = Math.max(1, Math.min(600, Number(body.durationMonths) || 12));
  const tenantId = body.tenantId ? String(body.tenantId).trim() : null;
  const tenantRole = body.tenantRole ? String(body.tenantRole).toUpperCase() : 'MEMBER';
  const preferredCurrency = normalizeCurrencyCode(body.preferredCurrency || 'INR');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, code: 'INVALID_EMAIL', error: 'A valid email address is required.', requestId: res.locals.requestId });
  }

  if (requestedRole === 'SUPER_ADMIN') {
    return res.status(400).json({ success: false, code: 'SUPER_ADMIN_PROVISION_FORBIDDEN', error: 'SUPER_ADMIN accounts cannot be created via the Admin UI.', requestId: res.locals.requestId });
  }

  try {
    let targetUid = null;
    let existingUser = null;

    if (identityAdmin?.auth) {
      try {
        existingUser = await identityAdmin.auth().getUserByEmail(email);
        targetUid = existingUser.uid;
      } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
      }

      if (!existingUser) {
        const tempPassword = `RP_${crypto.randomBytes(8).toString('hex')}!Aa1`;
        const created = await identityAdmin.auth().createUser({
          email,
          displayName: displayName || email.split('@')[0],
          password: tempPassword,
          emailVerified: body.emailVerified === true,
        });
        targetUid = created.uid;
      }

      await identityAdmin.auth().setCustomUserClaims(targetUid, { role: requestedRole }).catch(() => {});
    } else {
      targetUid = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    let membershipEnds = new Date();
    membershipEnds.setMonth(membershipEnds.getMonth() + (membership === 'Premium' ? durationMonths : 0));

    const userProfileUpdates = {
      id: targetUid,
      email,
      displayName: displayName || email.split('@')[0],
      role: requestedRole,
      membership,
      membershipEnds: membershipEnds.toISOString(),
      paymentStatus: membership === 'Premium' ? 'ADMIN_GRANTED' : 'INACTIVE',
      preferredCurrency,
      suspended: false,
      invitedBy: req.user?.uid || 'admin',
    };

    if (tenantId) {
      let tenantRecord = null;
      try {
        if (tenantService?.registry) {
          tenantRecord = await tenantService.registry.getTenant(tenantId);
          await tenantService.registry.grantMembership({
            tenantId,
            principalId: targetUid,
            roles: [tenantRole],
            status: 'ACTIVE',
            invitationEmail: email,
          });
        }
      } catch (tErr) {
        console.warn('[User create tenant bind notice]:', tErr.message);
      }

      userProfileUpdates.tenantMemberships = [{
        tenantId,
        displayName: tenantRecord?.displayName || tenantId,
        slug: tenantRecord?.slug || tenantId,
        role: tenantRole,
        joinedAt: new Date().toISOString(),
      }];
      userProfileUpdates.primaryTenant = {
        id: tenantId,
        displayName: tenantRecord?.displayName || tenantId,
        slug: tenantRecord?.slug || tenantId,
        role: tenantRole,
      };
    }

    // Save to MariaDB (Primary)
    await repo.saveUser(targetUid, userProfileUpdates);

    // Record Security Audit in MariaDB
    if (repo.recordSecurityAuditLog) {
      await repo.recordSecurityAuditLog({
        action: 'USER_ADMIN_CREATED',
        actorUid: req.user?.uid || 'system',
        targetUid,
        category: 'iam.users',
        severity: 'MEDIUM',
        targetType: 'USER',
        targetId: targetUid,
        changes: { after: { email, displayName, role: requestedRole, membership, tenantId } },
        requestId: res.locals.requestId,
      }).catch(() => {});
    }

    // Replicate to Firestore standby in background (Non-blocking)
    if (requestDb) {
      try {
        const batch = requestDb.batch();
        batch.set(requestDb.collection('users').doc(targetUid), userProfileUpdates, { merge: true });
        batch.commit().catch(() => {});
      } catch (_) {}
    }

    let identity = null;
    if (identityAdmin?.auth) {
      identity = await identityAdmin.auth().getUser(targetUid).catch(() => null);
    }
    
    return res.status(201).json({
      success: true,
      message: existingUser ? 'Existing user updated with administrative claims.' : 'User account provisioned successfully.',
      user: adminUserProjection(identity, userProfileUpdates, targetUid),
    });
  } catch (error) {
    console.error('[User create error]', error.message);
    return res.status(500).json({ success: false, code: 'USER_CREATE_FAILED', error: error.message || 'Failed to create user.', requestId: res.locals.requestId });
  }
});

// 3. USER 360 COMPREHENSIVE DETAILS (MySQL Primary & Zero-Trust Isolated)
router.get('/:uid/details', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');
  const repo = req.repository || getRepository(requestDb);

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  try {
    // 1. Fetch Identity from Firebase Auth (with graceful fallback)
    let identity = null;
    if (identityAdmin?.auth) {
      try {
        identity = await identityAdmin.auth().getUser(uid);
      } catch (authErr) {
        if (authErr.code === 'auth/user-not-found') {
          const dbProfile = await repo.getUser(uid).catch(() => null);
          if (!dbProfile) {
            return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.', requestId: res.locals.requestId });
          }
        }
      }
    }

    // 2. Fetch Profile, Content Counts, Orders, AI Entitlement, and Audit History from MariaDB (Primary)
    const [profileResult, contentCounts, orders, aiEntitlement, auditLogsResult] = await Promise.all([
      repo.getUser(uid).catch(() => ({})),
      repo.getUserContentCounts ? repo.getUserContentCounts(uid).catch(() => ({ resumeCount: 0, portfolioCount: 0, coverCount: 0 })) : Promise.resolve({ resumeCount: 0, portfolioCount: 0, coverCount: 0 }),
      repo.getUserPaymentOrders ? repo.getUserPaymentOrders(uid).catch(() => []) : Promise.resolve([]),
      getUserAiEntitlement(requestDb, uid).catch(() => ({ uid, dailyLimit: 10, usedToday: 0, remainingToday: 10, plan: 'Basic' })),
      Promise.allSettled([
        repo.getSecurityAuditLogs ? repo.getSecurityAuditLogs({ targetUid: uid, limit: 50 }) : Promise.resolve([]),
        repo.getAdminAuditLogs ? repo.getAdminAuditLogs({ resourceId: uid, limit: 50 }) : Promise.resolve([]),
      ]),
    ]);

    const profile = profileResult || {};
    const baseUser = adminUserProjection(identity, profile, uid);

    // 3. Resolve tenant memberships
    let detailedTenants = baseUser.tenantMemberships;
    if (tenantService?.registry) {
      try {
        const memberships = await tenantService.registry.listMemberships(uid).catch(() => []);
        if (memberships.length) {
          detailedTenants = memberships.map(m => ({
            tenantId: m.tenant.id,
            displayName: m.tenant.displayName,
            slug: m.tenant.slug,
            lifecycleState: m.tenant.lifecycleState,
            isolationTier: m.tenant.isolationTier,
            roles: m.membership.roles,
            status: m.membership.status,
            isPrimary: baseUser.primaryTenant?.id === m.tenant.id,
          }));
        }
      } catch (_) { /* fallback to profile tenantMemberships */ }
    }

    // 4. Format audit logs
    const auditLogs = [];
    for (const result of auditLogsResult) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        result.value.forEach(item => {
          auditLogs.push({
            id: item.id,
            action: item.action || 'ADMIN_ACTION',
            actorUid: item.actorUid || item.actor || 'system',
            category: item.category || 'iam.users',
            severity: item.severity || 'INFO',
            changes: item.changes || null,
            changedFields: item.changedFields || [],
            createdAt: adminIso(item.createdAt),
          });
        });
      }
    }
    auditLogs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

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

// 4. GET SINGLE USER PROJECTION (MySQL Primary)
router.get('/:uid', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(requestDb);

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  try {
    let identity = null;
    if (identityAdmin?.auth) {
      identity = await identityAdmin.auth().getUser(uid).catch(() => null);
    }
    const profile = (await repo.getUser(uid).catch(() => ({}))) || {};

    if (!identity && !profile?.id && !profile?.userId) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.', requestId: res.locals.requestId });
    }

    return res.json({ success: true, user: adminUserProjection(identity, profile, uid) });
  } catch (_error) {
    return res.status(500).json({ success: false, code: 'USER_LOAD_FAILED', error: 'Unable to load user.', requestId: res.locals.requestId });
  }
});

// 4b. PATCH USER (MySQL Primary + Async Standby Replication)
router.patch('/:uid', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(requestDb);

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

  try {
    let identity = null;
    if (identityAdmin?.auth) {
      identity = await identityAdmin.auth().getUser(uid).catch(() => null);
    }
    const profile = (await repo.getUser(uid).catch(() => ({}))) || {};

    const claims = identity?.customClaims || {};
    const currentRole = String(claims.role || profile.role || (profile.isA ? 'ADMIN' : 'USER')).toUpperCase();
    const currentSuspended = identity?.disabled === true || profile.suspended === true;
    const currentMembership = profile.membership || 'Basic';

    if (expected.role !== undefined && expected.role !== currentRole) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This user role changed after the page loaded. Refresh before retrying.', requestId: res.locals.requestId });
    }
    if (expected.suspended !== undefined && expected.suspended !== currentSuspended) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This account status changed after the page loaded. Refresh before retrying.', requestId: res.locals.requestId });
    }
    if (expected.membership !== undefined && expected.membership !== currentMembership) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This membership changed after the page loaded. Refresh before retrying.', requestId: res.locals.requestId });
    }

    if (currentRole === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, code: 'SUPER_ADMIN_PROTECTED', error: 'SUPER_ADMIN claims cannot be changed from this API.', requestId: res.locals.requestId });
    }

    if (uid === req.user?.uid && changes.role !== undefined && changes.role !== 'ADMIN' && changes.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, code: 'SELF_DEMOTION_PROHIBITED', error: 'Self-demotion is prohibited.', requestId: res.locals.requestId });
    }

    // 1. Update Firebase Auth (claims / disabled / displayName)
    if (identityAdmin?.auth) {
      const authUpdates = {};
      if (changes.role !== undefined) {
        const nextClaims = { ...claims, role: changes.role };
        delete nextClaims.permissions;
        await identityAdmin.auth().setCustomUserClaims(uid, nextClaims).catch(() => {});
        await identityAdmin.auth().revokeRefreshTokens(uid).catch(() => {});
      }
      if (changes.suspended !== undefined) authUpdates.disabled = changes.suspended;
      if (changes.displayName !== undefined) authUpdates.displayName = changes.displayName;
      if (Object.keys(authUpdates).length) {
        await identityAdmin.auth().updateUser(uid, authUpdates).catch(() => {});
      }
    }

    // 2. Update MariaDB Profile (Primary)
    const profileUpdates = { ...profile, updatedAt: new Date().toISOString() };
    if (changes.role !== undefined) profileUpdates.role = changes.role;
    if (changes.suspended !== undefined) profileUpdates.suspended = changes.suspended;
    if (changes.displayName !== undefined) profileUpdates.displayName = changes.displayName;
    if (changes.preferredCurrency !== undefined) profileUpdates.preferredCurrency = changes.preferredCurrency;
    if (changes.membership !== undefined) {
      profileUpdates.membership = changes.membership;
      if (changes.membership === 'Premium') {
        const duration = changes.durationMonths !== undefined ? changes.durationMonths : 12;
        const ends = new Date();
        ends.setMonth(ends.getMonth() + duration);
        profileUpdates.membershipEnds = ends.toISOString();
        profileUpdates.paymentStatus = profile.paymentStatus === 'ACTIVE' ? 'ACTIVE' : 'ADMIN_GRANTED';
      } else {
        profileUpdates.paymentStatus = 'INACTIVE';
      }
    }

    await repo.saveUser(uid, profileUpdates);

    // 3. Record Audit Log in MariaDB (Primary)
    const before = {
      role: currentRole,
      suspended: currentSuspended,
      membership: currentMembership,
      preferredCurrency: normalizeCurrencyCode(profile.preferredCurrency || 'INR'),
      displayName: identity?.displayName || profile.displayName || null,
    };
    const after = {
      role: changes.role !== undefined ? changes.role : before.role,
      suspended: changes.suspended !== undefined ? changes.suspended : before.suspended,
      membership: changes.membership !== undefined ? changes.membership : before.membership,
      preferredCurrency: changes.preferredCurrency !== undefined ? changes.preferredCurrency : before.preferredCurrency,
      displayName: changes.displayName !== undefined ? changes.displayName : before.displayName,
    };

    if (repo.recordSecurityAuditLog) {
      await repo.recordSecurityAuditLog({
        action: 'USER_ADMIN_UPDATED',
        actorUid: req.user?.uid || 'system',
        targetUid: uid,
        category: 'iam.users',
        severity: 'HIGH',
        targetType: 'USER',
        targetId: uid,
        changes: { before, after },
        requestId: res.locals.requestId,
      }).catch(() => {});
    }

    recordAdminAuditLog(req, {
      action: 'USER_ADMIN_UPDATED',
      method: 'PATCH',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { before, after },
      requestId: res.locals.requestId,
    });

    // 4. Replicate to Firestore Standby in background
    if (requestDb) {
      try {
        const batch = requestDb.batch();
        batch.set(requestDb.collection('users').doc(uid), profileUpdates, { merge: true });
        batch.commit().catch(() => {});
      } catch (_) {}
    }

    let updatedIdentity = null;
    if (identityAdmin?.auth) {
      updatedIdentity = await identityAdmin.auth().getUser(uid).catch(() => null);
    }
    return res.json({
      success: true,
      message: 'User updated successfully.',
      user: adminUserProjection(updatedIdentity, profileUpdates, uid),
    });
  } catch (error) {
    console.error('[Admin user PATCH error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({ success: false, code: status === 404 ? 'USER_NOT_FOUND' : 'USER_UPDATE_FAILED', error: status === 404 ? 'User not found.' : 'Unable to update user.', requestId: res.locals.requestId });
  }
});

// 5. USER TENANT BINDING (ASSIGN TO TENANT)
router.post('/:uid/tenants', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const tenantService = req.app.get('tenantService');
  const repo = req.repository || getRepository(requestDb);

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const role = String(body.role || 'MEMBER').toUpperCase();
  const isPrimary = body.isPrimary === true;

  if (!tenantId) return res.status(400).json({ success: false, code: 'TENANT_ID_REQUIRED', error: 'Tenant identifier is required.' });

  try {
    const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};
    let tenantRecord = { id: tenantId, displayName: tenantId, slug: tenantId };
    
    if (tenantService?.registry) {
      tenantRecord = await tenantService.registry.getTenant(tenantId);
      await tenantService.registry.grantMembership({
        tenantId,
        principalId: uid,
        roles: [role],
        status: 'ACTIVE',
      });
    }

    const existingTenants = Array.isArray(currentProfile.tenantMemberships) ? currentProfile.tenantMemberships : [];
    const filtered = existingTenants.filter(t => t.tenantId !== tenantId && t.id !== tenantId);
    
    const newEntry = {
      tenantId,
      id: tenantId,
      displayName: tenantRecord.displayName || tenantId,
      slug: tenantRecord.slug || tenantId,
      role,
      joinedAt: new Date().toISOString(),
    };

    filtered.push(newEntry);
    const updates = {
      ...currentProfile,
      tenantMemberships: filtered,
      updatedAt: new Date().toISOString(),
    };
    if (isPrimary || !currentProfile.primaryTenant) {
      updates.primaryTenant = {
        id: tenantId,
        displayName: tenantRecord.displayName || tenantId,
        slug: tenantRecord.slug || tenantId,
        role,
      };
    }

    await repo.saveUser(uid, updates);

    // Standby sync
    if (requestDb) {
      try {
        await requestDb.collection('users').doc(uid).set(updates, { merge: true });
      } catch (_) {}
    }

    return res.json({ success: true, message: `User assigned to tenant ${tenantRecord.displayName}.`, tenantMemberships: filtered });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'TENANT_ASSIGN_FAILED', error: error.message });
  }
});

// 6. USER TENANT REMOVAL
router.delete('/:uid/tenants/:tenantId', async (req, res) => {
  const uid = String(req.params.uid || '');
  const tenantId = String(req.params.tenantId || '');
  const requestDb = req.app.get('db');
  const tenantService = req.app.get('tenantService');
  const repo = req.repository || getRepository(requestDb);

  try {
    const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};

    if (tenantService?.registry) {
      await tenantService.registry.removeTenantMembership({ tenantId, principalId: uid }).catch(() => {});
    }

    const existingTenants = Array.isArray(currentProfile.tenantMemberships) ? currentProfile.tenantMemberships : [];
    const remaining = existingTenants.filter(t => t.tenantId !== tenantId && t.id !== tenantId);

    const updates = {
      ...currentProfile,
      tenantMemberships: remaining,
      updatedAt: new Date().toISOString(),
    };
    if (currentProfile.primaryTenant?.id === tenantId) {
      updates.primaryTenant = remaining.length ? {
        id: remaining[0].tenantId || remaining[0].id,
        displayName: remaining[0].displayName || 'Primary Organization',
        slug: remaining[0].slug || 'primary',
        role: remaining[0].role || 'MEMBER',
      } : null;
    }

    await repo.saveUser(uid, updates);

    // Standby sync
    if (requestDb) {
      try {
        await requestDb.collection('users').doc(uid).set(updates, { merge: true });
      } catch (_) {}
    }

    return res.json({ success: true, message: 'User removed from tenant.', tenantMemberships: remaining });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'TENANT_REMOVE_FAILED', error: error.message });
  }
});

// 7. USER AI ENTITLEMENT CONTROLS
router.get('/:uid/ai-entitlement', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const entitlement = await getUserAiEntitlement(requestDb, uid);
  return res.json({ success: true, entitlement });
});

router.put('/:uid/ai-entitlement', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const { dailyLimit, maxTokens, expiresAt, reason } = req.body || {};

  try {
    const updated = await setUserAiQuotaOverride({
      db: requestDb,
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
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  try {
    const updated = await removeUserAiQuotaOverride({
      db: requestDb,
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
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  try {
    const updated = await resetUserAiQuota({
      db: requestDb,
      admin: identityAdmin,
      uid,
      actorUid: req.user?.uid || 'admin',
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: 'AI daily usage quota reset to 0.', entitlement: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'QUOTA_RESET_FAILED', error: error.message });
  }
});

// 8. SEND PASSWORD RESET
router.post('/:uid/send-password-reset', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(req.app.get('db'));

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to trigger password reset.', requestId: res.locals.requestId });
  }

  try {
    let email = null;
    if (identityAdmin?.auth) {
      const identity = await identityAdmin.auth().getUser(uid).catch(() => null);
      email = identity?.email;
    }
    if (!email) {
      const profile = await repo.getUser(uid).catch(() => null);
      email = profile?.email;
    }

    if (!email) {
      return res.status(400).json({ success: false, code: 'NO_EMAIL', error: 'User does not have an associated email address.', requestId: res.locals.requestId });
    }

    let resetLink = null;
    if (identityAdmin?.auth) {
      resetLink = await identityAdmin.auth().generatePasswordResetLink(email).catch(() => null);
    }

    recordAdminAuditLog(req, {
      action: 'USER_PASSWORD_RESET_TRIGGERED',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { targetEmail: email },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: `Password reset link generated for ${email}.`,
      email,
      resetLink: resetLink || `https://airesume.projectdemo.guru/reset-password?email=${encodeURIComponent(email)}`,
    });
  } catch (error) {
    console.error('[Admin send-password-reset error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      code: error.code || 'PASSWORD_RESET_FAILED',
      error: error.message || 'Failed to generate password reset link.',
      requestId: res.locals.requestId,
    });
  }
});

// 9. ADMIN FORCE-VERIFY / UNVERIFY EMAIL
router.post('/:uid/verify-email', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(requestDb);

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to modify email verification status.', requestId: res.locals.requestId });
  }

  const emailVerified = req.body.emailVerified !== false;

  try {
    if (identityAdmin?.auth) {
      await identityAdmin.auth().updateUser(uid, { emailVerified }).catch(() => {});
    }

    const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};
    await repo.saveUser(uid, {
      ...currentProfile,
      emailVerified,
      updatedAt: new Date().toISOString(),
    });

    if (requestDb) {
      try {
        await requestDb.collection('users').doc(uid).set({ emailVerified, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (_) {}
    }

    recordAdminAuditLog(req, {
      action: emailVerified ? 'USER_EMAIL_VERIFIED_BY_ADMIN' : 'USER_EMAIL_UNVERIFIED_BY_ADMIN',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { emailVerified },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: `Email verification status updated to ${emailVerified ? 'Verified' : 'Unverified'}.`,
      emailVerified,
    });
  } catch (error) {
    console.error('[Admin verify-email error]', error.message);
    return res.status(500).json({
      success: false,
      code: 'EMAIL_VERIFY_FAILED',
      error: error.message || 'Failed to update email verification.',
      requestId: res.locals.requestId,
    });
  }
});

// 10. ADMIN REVOKE ACTIVE SESSIONS & REFRESH TOKENS
router.post('/:uid/revoke-sessions', async (req, res) => {
  const uid = String(req.params.uid || '');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to revoke user sessions.', requestId: res.locals.requestId });
  }

  try {
    let tokensValidAfterTime = new Date().toISOString();
    if (identityAdmin?.auth) {
      await identityAdmin.auth().revokeRefreshTokens(uid);
      const userRecord = await identityAdmin.auth().getUser(uid).catch(() => null);
      tokensValidAfterTime = userRecord?.tokensValidAfterTime || tokensValidAfterTime;
    }

    recordAdminAuditLog(req, {
      action: 'USER_SESSIONS_REVOKED_BY_ADMIN',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { tokensValidAfterTime },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: 'All active sessions and refresh tokens have been revoked. The user must sign in again.',
      tokensValidAfterTime,
    });
  } catch (error) {
    console.error('[Admin revoke-sessions error]', error.message);
    return res.status(500).json({
      success: false,
      code: 'SESSION_REVOKE_FAILED',
      error: error.message || 'Failed to revoke sessions.',
      requestId: res.locals.requestId,
    });
  }
});

// 11. ADMIN RESET / UNENROLL 2FA (MFA RECOVERY)
router.post('/:uid/unenroll-mfa', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(requestDb);

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to reset MFA.', requestId: res.locals.requestId });
  }

  try {
    if (identityAdmin?.auth) {
      const userRecord = await identityAdmin.auth().getUser(uid);
      const currentClaims = userRecord.customClaims || {};
      const updatedClaims = { ...currentClaims };
      delete updatedClaims.sign_in_second_factor;

      await identityAdmin.auth().setCustomUserClaims(uid, updatedClaims).catch(() => {});
      await identityAdmin.auth().revokeRefreshTokens(uid).catch(() => {});
    }

    const currentProfile = (await repo.getUser(uid).catch(() => ({}))) || {};
    await repo.saveUser(uid, {
      ...currentProfile,
      mfaEnabled: false,
      mfaEnrolledAt: null,
      updatedAt: new Date().toISOString(),
    });

    if (requestDb) {
      try {
        await requestDb.collection('users').doc(uid).set({ mfaEnabled: false, mfaEnrolledAt: null, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (_) {}
    }

    recordAdminAuditLog(req, {
      action: 'USER_MFA_UNENROLLED_BY_ADMIN',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: 'Two-Factor Authentication (2FA) enrolled factors have been reset for this account.',
      mfaEnabled: false,
    });
  } catch (error) {
    console.error('[Admin unenroll-mfa error]', error.message);
    return res.status(500).json({
      success: false,
      code: 'MFA_RESET_FAILED',
      error: error.message || 'Failed to unenroll MFA.',
      requestId: res.locals.requestId,
    });
  }
});

// 12. ADMIN SINGLE USER COMPLETE DATA EXPORT (GDPR / AUDIT)
router.get('/:uid/export', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const repo = req.repository || getRepository(requestDb);

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.export') && !callerPermissions.has('users.read')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to export user data.', requestId: res.locals.requestId });
  }

  try {
    let identity = null;
    if (identityAdmin?.auth) {
      identity = await identityAdmin.auth().getUser(uid).catch(() => null);
    }
    const [profile, resumes, orders] = await Promise.all([
      repo.getUser(uid).catch(() => ({})),
      repo.getResumes ? repo.getResumes(uid).catch(() => []) : Promise.resolve([]),
      repo.getUserPaymentOrders ? repo.getUserPaymentOrders(uid).catch(() => []) : Promise.resolve([]),
    ]);

    const exportBundle = {
      exportedAt: new Date().toISOString(),
      requestedBy: req.user?.uid || 'admin',
      user: adminUserProjection(identity, profile || {}, uid),
      resumes: resumes || [],
      orders: orders || [],
      contentSummary: {
        totalResumes: (resumes || []).length,
        totalOrders: (orders || []).length,
      }
    };

    recordAdminAuditLog(req, {
      action: 'USER_DATA_EXPORTED_BY_ADMIN',
      method: 'GET',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { targetEmail: identity?.email || profile?.email, resumeCount: (resumes || []).length },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      export: exportBundle,
    });
  } catch (error) {
    console.error('[Admin user export error]', error.message);
    return res.status(500).json({
      success: false,
      code: 'USER_EXPORT_FAILED',
      error: error.message || 'Failed to export user data.',
      requestId: res.locals.requestId,
    });
  }
});

module.exports = {
  adminUsersRouter: router,
  adminUserProjection,
};
