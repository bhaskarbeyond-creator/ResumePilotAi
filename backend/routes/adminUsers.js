'use strict';

const express = require('express');
const crypto = require('crypto');
const admin = require('../services/firebaseAdmin');
const { isSuperAdmin, permissionsFor } = require('../security/auth');
const { getUserAiEntitlement, setUserAiQuotaOverride, removeUserAiQuotaOverride, resetUserAiQuota } = require('../services/adminAiEntitlement');
const { normalizeCurrencyCode } = require('../services/platformCurrency');
const { recordAdminAuditLog } = require('../security/adminAudit');

const router = express.Router();

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

function adminUserProjection(identity, profile = {}, id = identity?.uid) {
  const claims = identity?.customClaims || {};
  const rawRole = String(claims.role || profile.role || (profile.isA ? 'ADMIN' : 'USER')).toUpperCase();
  const role = VALID_ROLES.includes(rawRole) ? rawRole : 'USER';
  const membershipEnds = adminIso(profile.membershipEnds);
  
  const tenantMemberships = Array.isArray(profile.tenantMemberships) ? profile.tenantMemberships : [];
  const primaryTenant = profile.primaryTenant || (tenantMemberships.length > 0 ? {
    id: tenantMemberships[0].tenantId || tenantMemberships[0].id,
    displayName: tenantMemberships[0].displayName || tenantMemberships[0].tenantName || tenantMemberships[0].name || 'Primary Organization',
    slug: tenantMemberships[0].slug || tenantMemberships[0].tenantSlug || 'primary',
    role: tenantMemberships[0].role || 'ENTERPRISE_MEMBER',
  } : null);

  return {
    id,
    userId: id,
    uid: id,
    email: identity?.email || profile.email || null,
    displayName: identity?.displayName || profile.displayName || `${profile.firstname || ''} ${profile.lastname || ''}`.trim() || null,
    photoURL: identity?.photoURL || profile.photoURL || profile.profilePicture || null,
    role,
    isA: ['SUPER_ADMIN', 'ADMIN'].includes(role),
    emailVerified: identity?.emailVerified === true,
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
    createdAt: adminIso(profile.createdAt || identity?.metadata?.creationTime),
    lastLoginAt: adminIso(profile.lastLoginAt || identity?.metadata?.lastSignInTime),
    updatedAt: adminIso(profile.updatedAt || identity?.tokensValidAfterTime),
  };
}

// 1. DIRECTORY LISTING WITH PAGINATION & FILTERS
router.get('/', async (req, res) => {
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'User directory unavailable.', requestId: res.locals.requestId });
  }

  const limit = Math.min(Math.max(Number(req.query?.limit || req.query?.pageSize) || 25, 1), 200);
  const query = String(req.query?.q || req.query?.search || '').trim().toLowerCase();
  const status = String(req.query?.status || 'all').toLowerCase();
  const roleFilter = String(req.query?.role || 'all').toUpperCase();
  const planFilter = String(req.query?.plan || req.query?.subscription || 'all').toUpperCase();
  const tenantFilter = String(req.query?.tenantId || req.query?.tenant || '').trim();
  const pageToken = req.query?.pageToken ? String(req.query.pageToken) : undefined;

  try {
    const listed = await identityAdmin.auth().listUsers(limit, pageToken);
    
    // Batch fetch Firestore profiles for the listed users
    const profiles = await Promise.all((listed.users || []).map(async identity => {
      try {
        const snap = await requestDb.collection('users').doc(identity.uid).get();
        return { identity, profile: snap.exists ? (snap.data() || {}) : {} };
      } catch (_) {
        return { identity, profile: {} };
      }
    }));

    const projected = profiles.map(({ identity, profile }) => adminUserProjection(identity, profile));

    const filtered = projected.filter(user => {
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
      nextPageToken: listed.pageToken || null,
      pageSize: limit,
      filteredCount: filtered.length,
      source: 'firebase-auth-plus-firestore-profile',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin user directory]', error.message);
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'Unable to read the authoritative user directory.', requestId: res.locals.requestId });
  }
});

// 2. CREATE / INVITE USER
router.post('/', async (req, res) => {
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');

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

  // Validate input deterministically before any dependency availability check.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, code: 'INVALID_EMAIL', error: 'A valid email address is required.', requestId: res.locals.requestId });
  }

  if (requestedRole === 'SUPER_ADMIN') {
    return res.status(400).json({ success: false, code: 'SUPER_ADMIN_PROVISION_FORBIDDEN', error: 'SUPER_ADMIN accounts cannot be created via the Admin UI.', requestId: res.locals.requestId });
  }

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'User directory unavailable.', requestId: res.locals.requestId });
  }

  try {
    let targetUid = null;
    let existingUser = null;

    try {
      existingUser = await identityAdmin.auth().getUserByEmail(email);
      targetUid = existingUser.uid;
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    // Create user in Firebase Auth if not already existing
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

    // Assign custom claims
    await identityAdmin.auth().setCustomUserClaims(targetUid, { role: requestedRole });

    const now = identityAdmin.firestore.FieldValue.serverTimestamp();
    let membershipEnds = new Date();
    membershipEnds.setMonth(membershipEnds.getMonth() + (membership === 'Premium' ? durationMonths : 0));

    const userProfileUpdates = {
      email,
      displayName: displayName || email.split('@')[0],
      role: requestedRole,
      membership,
      membershipEnds,
      paymentStatus: membership === 'Premium' ? 'ADMIN_GRANTED' : 'INACTIVE',
      preferredCurrency,
      suspended: false,
      updatedAt: now,
      createdAt: existingUser ? undefined : now,
      invitedBy: req.user.uid,
    };

    // If tenantId was specified, bind user to tenant
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

    const batch = requestDb.batch();
    batch.set(requestDb.collection('users').doc(targetUid), userProfileUpdates, { merge: true });
    batch.set(requestDb.collection('security_audit_logs').doc(), {
      action: 'USER_ADMIN_CREATED',
      actorUid: req.user.uid,
      targetUid,
      category: 'iam.users',
      severity: 'MEDIUM',
      targetType: 'USER',
      targetId: targetUid,
      changes: {
        after: { email, displayName, role: requestedRole, membership, tenantId },
      },
      requestId: res.locals.requestId,
      createdAt: now,
    });
    await batch.commit();

    const identity = await identityAdmin.auth().getUser(targetUid);
    const userDoc = await requestDb.collection('users').doc(targetUid).get();
    
    return res.status(201).json({
      success: true,
      message: existingUser ? 'Existing user updated with administrative claims.' : 'User account provisioned successfully.',
      user: adminUserProjection(identity, userDoc.data() || {}),
    });
  } catch (error) {
    console.error('[User create error]', error.message);
    return res.status(500).json({ success: false, code: 'USER_CREATE_FAILED', error: error.message || 'Failed to create user.', requestId: res.locals.requestId });
  }
});

// 3. USER 360 COMPREHENSIVE DETAILS
router.get('/:uid/details', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }
  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'User directory unavailable.', requestId: res.locals.requestId });
  }

  try {
    const [identity, profileSnap, aiEntitlement, auditEventsResult, ordersSnap, resumesSnap] = await Promise.all([
      identityAdmin.auth().getUser(uid),
      requestDb.collection('users').doc(uid).get(),
      getUserAiEntitlement(requestDb, uid),
      Promise.allSettled([
        requestDb.collection('security_audit_logs').where('targetUid', '==', uid).limit(50).get(),
        requestDb.collection('admin_audit_logs').where('resourceId', '==', uid).limit(50).get(),
      ]),
      requestDb.collection('orders').where('uid', '==', uid).limit(20).get().catch(() => ({ docs: [] })),
      requestDb.collection('resumes').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
    ]);

    const profile = profileSnap.exists ? (profileSnap.data() || {}) : {};
    const baseUser = adminUserProjection(identity, profile);

    // Resolve tenant memberships in detail
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

    // Format audit events
    const auditLogs = [];
    for (const result of auditEventsResult) {
      if (result.status === 'fulfilled') {
        result.value.docs.forEach(doc => {
          const d = doc.data() || {};
          auditLogs.push({
            id: doc.id,
            action: d.action || 'ADMIN_ACTION',
            actorUid: d.actorUid || d.actor || 'system',
            category: d.category || 'iam.users',
            severity: d.severity || 'INFO',
            changes: d.changes || null,
            changedFields: d.changedFields || [],
            createdAt: adminIso(d.createdAt || d.occurredAt),
          });
        });
      }
    }
    auditLogs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    // Orders summary
    const orders = ordersSnap.docs.map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        planId: data.planId || data.plan || 'monthly',
        amount: data.amount,
        currency: data.currency || baseUser.preferredCurrency,
        status: data.status || 'COMPLETED',
        paymentType: data.paymentType || data.provider || 'Gateway',
        createdAt: adminIso(data.createdAt || data.date),
      };
    });

    return res.json({
      success: true,
      user360: {
        identity: baseUser,
        authProviders: identity.providerData.map(p => ({
          providerId: p.providerId,
          uid: p.uid,
          email: p.email,
          displayName: p.displayName,
        })),
        security: {
          mfaEnabled: baseUser.mfaEnabled,
          emailVerified: baseUser.emailVerified,
          suspended: baseUser.suspended,
          disabled: identity.disabled === true,
          tokensValidAfterTime: identity.tokensValidAfterTime,
          lastSignInTime: identity.metadata?.lastSignInTime,
          creationTime: identity.metadata?.creationTime,
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
          resumeCount: resumesSnap.docs.length,
        },
        auditTimeline: auditLogs.slice(0, 50),
      }
    });
  } catch (error) {
    console.error('[User 360 error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 503;
    return res.status(status).json({ success: false, code: error.code || 'USER_DETAILS_UNAVAILABLE', error: error.message, requestId: res.locals.requestId });
  }
});

// 4. GET SINGLE USER PROJECTION
router.get('/:uid', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  if (!requestDb || !identityAdmin?.auth) return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'User directory unavailable.', requestId: res.locals.requestId });
  try {
    const [identity, profileSnapshot] = await Promise.all([identityAdmin.auth().getUser(uid), requestDb.collection('users').doc(uid).get()]);
    const profile = profileSnapshot.exists ? (profileSnapshot.data() || {}) : {};
    return res.json({ success: true, user: adminUserProjection(identity, profile) });
  } catch (error) {
    return res.status(error.code === 'auth/user-not-found' ? 404 : 503).json({ success: false, code: error.code === 'auth/user-not-found' ? 'USER_NOT_FOUND' : 'USER_DIRECTORY_UNAVAILABLE', error: error.code === 'auth/user-not-found' ? 'User not found.' : 'Unable to load user.', requestId: res.locals.requestId });
  }
});

// 4b. PATCH USER — server-authoritative admin mutation surface used by the
// Users Manager & User 360 (suspension, role, membership, duration, currency,
// display name). Fails closed on role escalation, stale-target drift, and
// SUPER_ADMIN targets.
router.patch('/:uid', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  const body = req.body || {};
  const changes = {};
  const expected = {};

  // Role — only admins with role-management authority may mutate roles.
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

  // Suspension — reflects into Firebase Auth `disabled` so enforcement is server-side.
  if (body.suspended !== undefined) {
    if (!callerPermissions.has('*') && !callerPermissions.has('users.update')) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to change account status.', requestId: res.locals.requestId });
    }
    changes.suspended = Boolean(body.suspended);
    if (body.expectedSuspended !== undefined) expected.suspended = Boolean(body.expectedSuspended);
  }

  // Membership / subscription — entitlement propagation happens here.
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

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'User directory unavailable.', requestId: res.locals.requestId });
  }

  try {
    const [identity, profileSnap] = await Promise.all([
      identityAdmin.auth().getUser(uid),
      requestDb.collection('users').doc(uid).get(),
    ]);
    const profile = profileSnap.exists ? (profileSnap.data() || {}) : {};
    const claims = identity.customClaims || {};
    const currentRole = String(claims.role || profile.role || (profile.isA ? 'ADMIN' : 'USER')).toUpperCase();
    const currentSuspended = identity.disabled === true || profile.suspended === true;
    const currentMembership = profile.membership || 'Basic';

    // Stale-target detection: the caller must confirm the last-known state.
    if (expected.role !== undefined && expected.role !== currentRole) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This user role changed after the page loaded. Refresh before retrying.', requestId: res.locals.requestId });
    }
    if (expected.suspended !== undefined && expected.suspended !== currentSuspended) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This account status changed after the page loaded. Refresh before retrying.', requestId: res.locals.requestId });
    }
    if (expected.membership !== undefined && expected.membership !== currentMembership) {
      return res.status(409).json({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This membership changed after the page loaded. Refresh before retrying.', requestId: res.locals.requestId });
    }

    // SUPER_ADMIN_PROTECTED — SUPER_ADMIN claims cannot be changed from this API.
    if (currentRole === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, code: 'SUPER_ADMIN_PROTECTED', error: 'SUPER_ADMIN claims cannot be changed from this API.', requestId: res.locals.requestId });
    }

    // Self-demotion is prohibited; a platform operator cannot remove their own authority.
    if (uid === req.user?.uid && changes.role !== undefined && changes.role !== 'ADMIN' && changes.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, code: 'SELF_DEMOTION_PROHIBITED', error: 'Self-demotion is prohibited.', requestId: res.locals.requestId });
    }

    const authUpdates = {};
    if (changes.role !== undefined) {
      // Role is the single source of truth for permissions. Per-user permission
      // overrides are intentionally reset so stale grants cannot survive a demotion.
      const nextClaims = { ...claims, role: changes.role };
      delete nextClaims.permissions;
      await identityAdmin.auth().setCustomUserClaims(uid, nextClaims);
      await identityAdmin.auth().revokeRefreshTokens(uid).catch(() => {});
    }
    if (changes.suspended !== undefined) authUpdates.disabled = changes.suspended;
    if (changes.displayName !== undefined) authUpdates.displayName = changes.displayName;
    if (Object.keys(authUpdates).length) {
      await identityAdmin.auth().updateUser(uid, authUpdates);
    }

    const now = identityAdmin.firestore.FieldValue.serverTimestamp();
    const profileUpdates = { updatedAt: now };
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
        profileUpdates.membershipEnds = ends;
        profileUpdates.paymentStatus = profile.paymentStatus === 'ACTIVE' ? 'ACTIVE' : 'ADMIN_GRANTED';
      } else {
        profileUpdates.paymentStatus = 'INACTIVE';
      }
    }

    const before = {
      role: currentRole,
      suspended: currentSuspended,
      membership: currentMembership,
      preferredCurrency: normalizeCurrencyCode(profile.preferredCurrency || 'INR'),
      displayName: identity.displayName || profile.displayName || null,
    };
    const after = {
      role: changes.role !== undefined ? changes.role : before.role,
      suspended: changes.suspended !== undefined ? changes.suspended : before.suspended,
      membership: changes.membership !== undefined ? changes.membership : before.membership,
      preferredCurrency: changes.preferredCurrency !== undefined ? changes.preferredCurrency : before.preferredCurrency,
      displayName: changes.displayName !== undefined ? changes.displayName : before.displayName,
    };

    const batch = requestDb.batch();
    batch.set(requestDb.collection('users').doc(uid), profileUpdates, { merge: true });
    batch.set(requestDb.collection('security_audit_logs').doc(), {
      action: 'USER_ADMIN_UPDATED',
      actorUid: req.user.uid,
      targetUid: uid,
      category: 'iam.users',
      severity: 'HIGH',
      targetType: 'USER',
      targetId: uid,
      changes: { before, after },
      requestId: res.locals.requestId,
      createdAt: now,
    });
    await batch.commit();

    await recordAdminAuditLog(requestDb, identityAdmin, {
      actorUid: req.user.uid,
      actorEmail: req.user.email || null,
      actorRole: isSuperAdmin(req.user) ? 'SUPER_ADMIN' : 'ADMIN',
      action: 'USER_ADMIN_UPDATED',
      category: 'iam.users',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      method: 'PATCH',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { before, after },
      requestId: res.locals.requestId,
    });

    const updatedIdentity = await identityAdmin.auth().getUser(uid);
    const updatedProfileSnap = await requestDb.collection('users').doc(uid).get();
    return res.json({
      success: true,
      message: 'User updated successfully.',
      user: adminUserProjection(updatedIdentity, updatedProfileSnap.data() || {}),
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
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.' });
  if (!requestDb || !identityAdmin?.auth) return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.' });

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const role = String(body.role || 'MEMBER').toUpperCase();
  const isPrimary = body.isPrimary === true;

  if (!tenantId) return res.status(400).json({ success: false, code: 'TENANT_ID_REQUIRED', error: 'Tenant identifier is required.' });

  try {
    const userDocRef = requestDb.collection('users').doc(uid);
    const userSnap = await userDocRef.get();
    if (!userSnap.exists) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });
    
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

    const currentProfile = userSnap.data() || {};
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
      tenantMemberships: filtered,
      updatedAt: identityAdmin.firestore.FieldValue.serverTimestamp(),
    };
    if (isPrimary || !currentProfile.primaryTenant) {
      updates.primaryTenant = {
        id: tenantId,
        displayName: tenantRecord.displayName || tenantId,
        slug: tenantRecord.slug || tenantId,
        role,
      };
    }

    await userDocRef.set(updates, { merge: true });
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
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const tenantService = req.app.get('tenantService');

  if (!requestDb || !identityAdmin?.auth) return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.' });

  try {
    const userDocRef = requestDb.collection('users').doc(uid);
    const userSnap = await userDocRef.get();
    if (!userSnap.exists) return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'User not found.' });

    if (tenantService?.registry) {
      await tenantService.registry.removeTenantMembership({ tenantId, principalId: uid }).catch(() => {});
    }

    const currentProfile = userSnap.data() || {};
    const existingTenants = Array.isArray(currentProfile.tenantMemberships) ? currentProfile.tenantMemberships : [];
    const remaining = existingTenants.filter(t => t.tenantId !== tenantId && t.id !== tenantId);

    const updates = {
      tenantMemberships: remaining,
      updatedAt: identityAdmin.firestore.FieldValue.serverTimestamp(),
    };
    if (currentProfile.primaryTenant?.id === tenantId) {
      updates.primaryTenant = remaining.length ? {
        id: remaining[0].tenantId || remaining[0].id,
        displayName: remaining[0].displayName || 'Primary Organization',
        slug: remaining[0].slug || 'primary',
        role: remaining[0].role || 'MEMBER',
      } : null;
    }

    await userDocRef.set(updates, { merge: true });
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
      actorUid: req.user.uid,
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
      actorUid: req.user.uid,
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
      actorUid: req.user.uid,
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: 'AI daily usage quota reset to 0.', entitlement: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'QUOTA_RESET_FAILED', error: error.message });
  }
});

router.post('/:uid/send-password-reset', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to trigger password reset.', requestId: res.locals.requestId });
  }

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.', requestId: res.locals.requestId });
  }

  try {
    const identity = await identityAdmin.auth().getUser(uid);
    if (!identity.email) {
      return res.status(400).json({ success: false, code: 'NO_EMAIL', error: 'User does not have an associated email address.', requestId: res.locals.requestId });
    }

    const resetLink = await identityAdmin.auth().generatePasswordResetLink(identity.email);

    // Record in security audit logs
    const now = identityAdmin.firestore.FieldValue.serverTimestamp();
    await requestDb.collection('security_audit_logs').doc().set({
      action: 'USER_PASSWORD_RESET_TRIGGERED',
      actorUid: req.user.uid,
      targetUid: uid,
      targetEmail: identity.email,
      category: 'iam.users.security',
      severity: 'HIGH',
      targetType: 'USER',
      targetId: uid,
      requestId: res.locals.requestId,
      createdAt: now,
    });

    recordAdminAuditLog(req, {
      action: 'USER_PASSWORD_RESET_TRIGGERED',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { targetEmail: identity.email },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: `Password reset link generated for ${identity.email}.`,
      email: identity.email,
      resetLink,
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

// 10. ADMIN FORCE-VERIFY / UNVERIFY EMAIL
router.post('/:uid/verify-email', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to modify email verification status.', requestId: res.locals.requestId });
  }

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.', requestId: res.locals.requestId });
  }

  const emailVerified = req.body.emailVerified !== false;

  try {
    const updatedUser = await identityAdmin.auth().updateUser(uid, { emailVerified });
    await requestDb.collection('users').doc(uid).set({
      emailVerified,
      updatedAt: identityAdmin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    recordAdminAuditLog(req, {
      action: emailVerified ? 'USER_EMAIL_VERIFIED_BY_ADMIN' : 'USER_EMAIL_UNVERIFIED_BY_ADMIN',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { emailVerified, email: updatedUser.email },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: `Email verification status updated to ${emailVerified ? 'Verified' : 'Unverified'}.`,
      emailVerified,
    });
  } catch (error) {
    console.error('[Admin verify-email error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      code: error.code || 'EMAIL_VERIFY_FAILED',
      error: error.message || 'Failed to update email verification.',
      requestId: res.locals.requestId,
    });
  }
});

// 11. ADMIN REVOKE ACTIVE SESSIONS & REFRESH TOKENS
router.post('/:uid/revoke-sessions', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to revoke user sessions.', requestId: res.locals.requestId });
  }

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.', requestId: res.locals.requestId });
  }

  try {
    await identityAdmin.auth().revokeRefreshTokens(uid);
    const userRecord = await identityAdmin.auth().getUser(uid);

    recordAdminAuditLog(req, {
      action: 'USER_SESSIONS_REVOKED_BY_ADMIN',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { tokensValidAfterTime: userRecord.tokensValidAfterTime },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: 'All active sessions and refresh tokens have been revoked. The user must sign in again.',
      tokensValidAfterTime: userRecord.tokensValidAfterTime,
    });
  } catch (error) {
    console.error('[Admin revoke-sessions error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      code: error.code || 'SESSION_REVOKE_FAILED',
      error: error.message || 'Failed to revoke sessions.',
      requestId: res.locals.requestId,
    });
  }
});

// 12. ADMIN RESET / UNENROLL 2FA (MFA RECOVERY)
router.post('/:uid/unenroll-mfa', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.update') && !callerPermissions.has('users.security.manage')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to reset MFA.', requestId: res.locals.requestId });
  }

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.', requestId: res.locals.requestId });
  }

  try {
    const userRecord = await identityAdmin.auth().getUser(uid);
    const currentClaims = userRecord.customClaims || {};
    const updatedClaims = { ...currentClaims };
    delete updatedClaims.sign_in_second_factor;

    await identityAdmin.auth().setCustomUserClaims(uid, updatedClaims);
    await requestDb.collection('users').doc(uid).set({
      mfaEnabled: false,
      mfaEnrolledAt: null,
      updatedAt: identityAdmin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Also revoke tokens to force fresh re-authentication
    await identityAdmin.auth().revokeRefreshTokens(uid).catch(() => {});

    recordAdminAuditLog(req, {
      action: 'USER_MFA_UNENROLLED_BY_ADMIN',
      method: 'POST',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { targetEmail: userRecord.email },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      message: 'Two-Factor Authentication (2FA) enrolled factors have been reset for this account.',
      mfaEnabled: false,
    });
  } catch (error) {
    console.error('[Admin unenroll-mfa error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      code: error.code || 'MFA_RESET_FAILED',
      error: error.message || 'Failed to unenroll MFA.',
      requestId: res.locals.requestId,
    });
  }
});

// 13. ADMIN SINGLE USER COMPLETE DATA EXPORT (GDPR / AUDIT)
router.get('/:uid/export', async (req, res) => {
  const uid = String(req.params.uid || '');
  const requestDb = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user identifier.', requestId: res.locals.requestId });
  }

  const callerPermissions = permissionsFor(req.user);
  if (!callerPermissions.has('*') && !callerPermissions.has('users.export') && !callerPermissions.has('users.read')) {
    return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Insufficient permission to export user data.', requestId: res.locals.requestId });
  }

  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', error: 'Service unavailable.', requestId: res.locals.requestId });
  }

  try {
    const [identity, profileSnap, resumesSnap, ordersSnap] = await Promise.all([
      identityAdmin.auth().getUser(uid),
      requestDb.collection('users').doc(uid).get(),
      requestDb.collection('resumes').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
      requestDb.collection('orders').where('uid', '==', uid).get().catch(() => ({ docs: [] })),
    ]);

    const profile = profileSnap.exists ? (profileSnap.data() || {}) : {};
    const resumes = resumesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const exportBundle = {
      exportedAt: new Date().toISOString(),
      requestedBy: req.user.uid,
      user: adminUserProjection(identity, profile),
      resumes,
      orders,
      contentSummary: {
        totalResumes: resumes.length,
        totalOrders: orders.length,
      }
    };

    recordAdminAuditLog(req, {
      action: 'USER_DATA_EXPORTED_BY_ADMIN',
      method: 'GET',
      pathname: req.originalUrl,
      statusCode: 200,
      resourceType: 'user',
      resourceId: uid,
      metadata: { targetEmail: identity.email, resumeCount: resumes.length },
      requestId: res.locals.requestId,
    });

    return res.json({
      success: true,
      export: exportBundle,
    });
  } catch (error) {
    console.error('[Admin user export error]', error.message);
    const status = error.code === 'auth/user-not-found' ? 404 : 500;
    return res.status(status).json({
      success: false,
      code: error.code || 'USER_EXPORT_FAILED',
      error: error.message || 'Failed to export user data.',
      requestId: res.locals.requestId,
    });
  }
});

module.exports = {
  adminUsersRouter: router,
  adminUserProjection,
};


