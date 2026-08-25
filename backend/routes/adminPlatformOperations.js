'use strict';

const express = require('express');
const admin = require('../services/firebaseAdmin');
const { requireAuth, requirePermission, requireSuperAdmin, requireRecentAdminAuthentication, isSuperAdmin } = require('../security/auth');
const { getPlatformCurrencyConfig, setPlatformCurrencyConfig, normalizeCurrencyCode, formatCurrencyAmount } = require('../services/platformCurrency');
const { getGlobalAiDashboardData } = require('../services/adminAiEntitlement');

const router = express.Router();

function adminIso(value) {
  if (!value) return null;
  try {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch (_) {
    return null;
  }
}

// 1. PLATFORM CURRENCY CONFIGURATION
router.get('/platform/currency', async (req, res) => {
  const db = req.app.get('db');
  const currencyConfig = await getPlatformCurrencyConfig(db);
  return res.json({ success: true, currency: currencyConfig });
});

router.put('/platform/currency', requireAuth, requireRecentAdminAuthentication, async (req, res) => {
  const db = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const { currency, allowMultiCurrency } = req.body || {};

  if (!currency) {
    return res.status(400).json({ success: false, code: 'CURRENCY_REQUIRED', error: 'Currency code is required' });
  }

  try {
    const updated = await setPlatformCurrencyConfig({
      db,
      admin: identityAdmin,
      currency,
      allowMultiCurrency,
      actorUid: req.user.uid,
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: `Platform currency updated to ${updated.code}.`, currency: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'CURRENCY_UPDATE_FAILED', error: error.message });
  }
});

// 2. ACTIVE SUBSCRIPTIONS & LIFECYCLE MANAGEMENT
router.get('/subscriptions', requirePermission('payments.read'), async (req, res) => {
  const db = req.app.get('db');
  const statusFilter = String(req.query?.status || 'all').toLowerCase();
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);

  if (!db) {
    return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', error: 'Database unavailable' });
  }

  try {
    // Query recent orders and active subscribers
    const [ordersSnap, usersSnap] = await Promise.all([
      db.collection('orders').orderBy('createdAt', 'desc').limit(limit).get().catch(() => ({ docs: [] })),
      db.collection('users').where('membership', '==', 'Premium').limit(limit).get().catch(() => ({ docs: [] })),
    ]);

    const activeSubscribers = usersSnap.docs.map(doc => {
      const data = doc.data() || {};
      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        membership: data.membership || 'Premium',
        membershipEnds: adminIso(data.membershipEnds),
        paymentStatus: data.paymentStatus || 'ACTIVE',
        currency: normalizeCurrencyCode(data.preferredCurrency || data.currency || 'INR'),
        updatedAt: adminIso(data.updatedAt),
      };
    });

    const transactions = ordersSnap.docs.map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        uid: data.uid || null,
        userEmail: data.userEmail || data.email || null,
        planId: data.planId || data.plan || 'monthly',
        amount: data.amount,
        currency: normalizeCurrencyCode(data.currency || 'INR'),
        formattedAmount: formatCurrencyAmount((data.amount || 0) / 100, data.currency || 'INR'),
        status: data.status || 'COMPLETED',
        provider: data.paymentType || data.provider || 'Gateway',
        createdAt: adminIso(data.createdAt || data.date),
      };
    });

    return res.json({
      success: true,
      subscribers: activeSubscribers,
      transactions,
      totalActiveSubscribers: activeSubscribers.length,
      recentTransactionsCount: transactions.length,
    });
  } catch (error) {
    console.error('[Admin subscriptions query]', error.message);
    return res.status(500).json({ success: false, code: 'SUBSCRIPTIONS_UNAVAILABLE', error: error.message });
  }
});

// 3. AI ENTITLEMENTS GLOBAL DASHBOARD
router.get('/ai/entitlements', requirePermission('ai.usage.read'), async (req, res) => {
  const db = req.app.get('db');
  const data = await getGlobalAiDashboardData(db);
  return res.json({ success: true, aiGovernance: data });
});

// 4. TENANT 360 MEMBER MANAGEMENT
router.post('/platform/tenants/:tenantId/members', requireRecentAdminAuthentication, async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const tenantService = req.app.get('tenantService');
  const db = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;

  if (!tenantService?.registry) {
    return res.status(503).json({ success: false, code: 'TENANT_SERVICE_UNAVAILABLE', error: 'Tenant service unavailable' });
  }

  const { email, uid, role, workspaceId } = req.body || {};
  let principalId = uid ? String(uid).trim() : null;

  try {
    if (!principalId && email) {
      const existing = await identityAdmin.auth().getUserByEmail(String(email).trim().toLowerCase());
      principalId = existing.uid;
    }
    if (!principalId) {
      return res.status(400).json({ success: false, code: 'PRINCIPAL_REQUIRED', error: 'User UID or registered email is required' });
    }

    const membership = await tenantService.registry.grantMembership({
      tenantId,
      principalId,
      workspaceId: workspaceId || null,
      roles: [String(role || 'MEMBER').toUpperCase()],
      status: 'ACTIVE',
      invitationEmail: email || null,
    });

    // Synchronize user document tenantMemberships
    if (db) {
      const userRef = db.collection('users').doc(principalId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const profile = userSnap.data() || {};
        const tenants = Array.isArray(profile.tenantMemberships) ? profile.tenantMemberships : [];
        const tenantRecord = await tenantService.registry.getTenant(tenantId).catch(() => ({ displayName: tenantId, slug: tenantId }));
        const updated = tenants.filter(t => t.tenantId !== tenantId);
        updated.push({
          tenantId,
          displayName: tenantRecord.displayName,
          slug: tenantRecord.slug,
          role: String(role || 'MEMBER').toUpperCase(),
          joinedAt: new Date().toISOString(),
        });
        await userRef.set({ tenantMemberships: updated }, { merge: true });
      }
    }

    return res.status(201).json({ success: true, message: 'Member added to organization.', membership });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'MEMBER_ADD_FAILED', error: error.message });
  }
});

router.delete('/platform/tenants/:tenantId/members/:principalId', requireRecentAdminAuthentication, async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const principalId = String(req.params.principalId || '').trim();
  const tenantService = req.app.get('tenantService');
  const db = req.app.get('db');

  if (!tenantService?.registry) {
    return res.status(503).json({ success: false, code: 'TENANT_SERVICE_UNAVAILABLE', error: 'Tenant service unavailable' });
  }

  try {
    await tenantService.registry.removeTenantMembership({ tenantId, principalId });

    if (db) {
      const userRef = db.collection('users').doc(principalId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const profile = userSnap.data() || {};
        const tenants = Array.isArray(profile.tenantMemberships) ? profile.tenantMemberships : [];
        const updated = tenants.filter(t => t.tenantId !== tenantId);
        await userRef.set({ tenantMemberships: updated }, { merge: true });
      }
    }

    return res.json({ success: true, message: 'Member removed from organization.' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'MEMBER_REMOVE_FAILED', error: error.message });
  }
});

router.patch('/platform/tenants/:tenantId/members/:principalId', requireRecentAdminAuthentication, async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const principalId = String(req.params.principalId || '').trim();
  const tenantService = req.app.get('tenantService');
  const { role, status } = req.body || {};

  if (!tenantService?.registry) {
    return res.status(503).json({ success: false, code: 'TENANT_SERVICE_UNAVAILABLE', error: 'Tenant service unavailable' });
  }

  try {
    const updated = await tenantService.registry.updateTenantMembership({
      tenantId,
      principalId,
      roles: role ? [String(role).toUpperCase()] : null,
      status: status ? String(status).toUpperCase() : null,
    });
    return res.json({ success: true, message: 'Membership updated.', membership: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'MEMBER_UPDATE_FAILED', error: error.message });
  }
});

// 5. TENANT COMMERCIALS & PLAN BINDING
router.patch('/platform/tenants/:tenantId/commercials', requireRecentAdminAuthentication, requireSuperAdmin, async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const db = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const { plan, seatLimit, currency, billingStatus } = req.body || {};

  if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', error: 'Database unavailable' });

  try {
    const tenantRef = db.collection('enterprise_tenants').doc(tenantId);
    const snap = await tenantRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, code: 'TENANT_NOT_FOUND', error: 'Tenant not found' });

    const updates = {
      plan: plan || 'Enterprise Standard',
      seatLimit: Number(seatLimit) || 50,
      currency: normalizeCurrencyCode(currency || 'INR'),
      billingStatus: billingStatus || 'ACTIVE',
      updatedAt: identityAdmin.firestore.FieldValue.serverTimestamp(),
    };

    await tenantRef.set(updates, { merge: true });
    return res.json({ success: true, message: 'Tenant commercial settings updated.', commercials: updates });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'COMMERCIALS_UPDATE_FAILED', error: error.message });
  }
});

// 6. TENANT AI POLICY & QUOTA BUCKETS
router.patch('/platform/tenants/:tenantId/ai-policy', requireRecentAdminAuthentication, requireSuperAdmin, async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const db = req.app.get('db');
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  const { dailyLimit, allowedProviders, allowedModels, primaryModel, customProviderKeys } = req.body || {};

  if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', error: 'Database unavailable' });

  try {
    const tenantRef = db.collection('enterprise_tenants').doc(tenantId);
    const snap = await tenantRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, code: 'TENANT_NOT_FOUND', error: 'Tenant not found' });

    const existingPolicy = snap.data()?.aiPolicy || {};
    const existingKeys = existingPolicy.customProviderKeys || {};
    
    // Merge new custom keys, keeping existing ones if blank
    const updatedCustomKeys = { ...existingKeys };
    if (customProviderKeys && typeof customProviderKeys === 'object') {
      for (const [provider, keyVal] of Object.entries(customProviderKeys)) {
        if (keyVal === '__REMOVE__') {
          delete updatedCustomKeys[provider];
        } else if (typeof keyVal === 'string' && keyVal.trim().length > 0) {
          updatedCustomKeys[provider] = keyVal.trim();
        }
      }
    }

    const aiPolicy = {
      dailyLimit: Math.max(10, Math.min(500000, Number(dailyLimit) || 5000)),
      allowedProviders: Array.isArray(allowedProviders) ? allowedProviders : (existingPolicy.allowedProviders || ['gemini', 'nvidia', 'openai']),
      allowedModels: Array.isArray(allowedModels) ? allowedModels : (existingPolicy.allowedModels || []),
      primaryModel: primaryModel ? String(primaryModel).trim() : (existingPolicy.primaryModel || 'meta/llama-3.2-11b-vision-instruct'),
      customProviderKeys: updatedCustomKeys,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.uid,
    };

    await tenantRef.set({ aiPolicy }, { merge: true });
    
    // Return sanitized policy with keys masked
    const sanitizedCustomKeys = Object.fromEntries(
      Object.entries(updatedCustomKeys).map(([p, k]) => [p, k ? `${k.slice(0, 4)}...${k.slice(-4)}` : ''])
    );

    return res.json({
      success: true,
      message: 'Tenant AI policy & dedicated provider keys updated.',
      aiPolicy: { ...aiPolicy, customProviderKeys: sanitizedCustomKeys }
    });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'AI_POLICY_UPDATE_FAILED', error: error.message });
  }
});


module.exports = {
  adminPlatformOperationsRouter: router,
};
