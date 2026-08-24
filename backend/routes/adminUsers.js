'use strict';

const express = require('express');
const crypto = require('crypto');
const admin = require('../services/firebaseAdmin');
const { requireAuth, requirePermission, requireSuperAdmin, isSuperAdmin, permissionsFor } = require('../security/auth');
const { getUserAiEntitlement, setUserAiQuotaOverride, removeUserAiQuotaOverride, resetUserAiQuota } = require('../services/adminAiEntitlement');
const { getPlatformCurrencyConfig, normalizeCurrencyCode } = require('../services/platformCurrency');

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
  
  if (!requestDb || !identityAdmin?.auth) {
    return res.status(503).json({ success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'User directory unavailable.', requestId: res.locals.requestId });
  }

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
    return res.status(400).json({ success: false, code: 'INVALID_EMAIL', error: 'A valid email address is required.' });
  }

  if (requestedRole === 'SUPER_ADMIN') {
    return res.status(400).json({ success: false, code: 'SUPER_ADMIN_PROVISION_FORBIDDEN', error: 'SUPER_ADMIN accounts cannot be created via the Admin UI.' });
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

module.exports = {
  adminUsersRouter: router,
  adminUserProjection,
};
