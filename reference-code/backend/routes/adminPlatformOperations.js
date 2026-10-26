'use strict';

const express = require('express');
const admin = require('../services/firebaseAdmin');
const {
  requirePermission,
  requireSuperAdmin,
  requireRecentAdminAuthentication,
} = require('../security/auth');
const {
  getPlatformCurrencyConfig,
  setPlatformCurrencyConfig,
  normalizeCurrencyCode,
  formatCurrencyAmount,
} = require('../services/platformCurrency');
const { getGlobalAiDashboardData } = require('../services/adminAiEntitlement');
const { getPool } = require('../database/mysql');
const { resolveAssignableWorkspace } = require('../enterprise/workspaceResolution');

const router = express.Router();
const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function requireTenantService(req) {
  const service = req.app.get('tenantService');
  if (!service?.registry) {
    throw Object.assign(new Error('Tenant control plane is unavailable'), { code: 'TENANT_SERVICE_UNAVAILABLE', status: 503 });
  }
  return service;
}

function assertTenantId(value) {
  const tenantId = String(value || '').trim().toLowerCase();
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw Object.assign(new Error('Invalid tenant identifier'), { code: 'INVALID_TENANT_ID', status: 400 });
  }
  return tenantId;
}

function expectedRevision(body) {
  const revision = Number(body?.expectedRevision);
  if (!Number.isInteger(revision) || revision < 1) {
    throw Object.assign(new Error('Expected configuration revision is required'), { code: 'EXPECTED_REVISION_REQUIRED', status: 428 });
  }
  return revision;
}

function sendTenantError(res, error, fallbackCode, fallbackMessage) {
  const status = error.status || 503;
  return res.status(status).json({
    success: false,
    code: error.code || fallbackCode,
    error: status < 500 ? error.message : fallbackMessage,
    currentRevision: error.currentRevision,
    requestId: res.locals.requestId,
  });
}

// Platform currency has one MariaDB owner and requires optimistic concurrency.
router.get('/platform/currency', requirePermission('system.config.read'), async (_req, res) => {
  try {
    return res.json({ success: true, currency: await getPlatformCurrencyConfig() });
  } catch (_) {
    return res.status(503).json({ success: false, code: 'CURRENCY_UNAVAILABLE', error: 'Currency configuration is unavailable.' });
  }
});

router.put('/platform/currency', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  const { currency, allowMultiCurrency, expectedRevision: revision } = req.body || {};
  if (!currency) {
    return res.status(400).json({ success: false, code: 'CURRENCY_REQUIRED', error: 'Currency code is required.' });
  }
  try {
    const updated = await setPlatformCurrencyConfig({
      currency,
      allowMultiCurrency,
      expectedRevision: revision,
      actorUid: req.user.uid,
      requestId: res.locals.requestId,
    });
    return res.json({ success: true, message: `Platform currency updated to ${updated.code}.`, currency: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'CURRENCY_UPDATE_FAILED', error: error.message });
  }
});

// Subscription data is read exclusively from MariaDB. Database failures are
// surfaced; an empty successful response means the query genuinely found no rows.
router.get('/subscriptions', requirePermission('payments.read'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
  const status = String(req.query?.status || 'all').trim().toUpperCase();
  const allowedStatuses = new Set(['ALL', 'ACTIVE', 'INACTIVE', 'PENDING', 'PAST_DUE', 'CANCELLED', 'REFUNDED', 'FAILED']);
  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ success: false, code: 'INVALID_SUBSCRIPTION_STATUS', error: 'Invalid subscription status filter.' });
  }

  try {
    const pool = getPool();
    const userParams = [];
    let userSql = `SELECT id, email, displayName, firstname, lastname, membership, membershipEnds,
                          paymentStatus, lastPaymentCurrency, updated_at
                   FROM users
                   WHERE deleted_at IS NULL AND membership IN ('Premium', 'Pro', 'Enterprise')`;
    if (status !== 'ALL') {
      userSql += ' AND UPPER(paymentStatus) = ?';
      userParams.push(status);
    }
    userSql += ' ORDER BY updated_at DESC LIMIT ?';
    userParams.push(limit);

    const orderParams = [];
    let orderSql = `SELECT id, uid, plan_id, amount, currency, status, provider,
                           last_payment_gateway, created_at
                    FROM payment_orders`;
    if (status !== 'ALL') {
      orderSql += ' WHERE UPPER(status) = ?';
      orderParams.push(status);
    }
    orderSql += ' ORDER BY created_at DESC LIMIT ?';
    orderParams.push(limit);

    const [[userRows], [orderRows]] = await Promise.all([
      pool.query(userSql, userParams),
      pool.query(orderSql, orderParams),
    ]);
    const subscribers = userRows.map(user => ({
      uid: user.id,
      email: user.email || null,
      displayName: user.displayName || `${user.firstname || ''} ${user.lastname || ''}`.trim() || null,
      membership: user.membership,
      membershipEnds: adminIso(user.membershipEnds),
      paymentStatus: user.paymentStatus,
      currency: normalizeCurrencyCode(user.lastPaymentCurrency || 'INR'),
      updatedAt: adminIso(user.updated_at),
    }));
    const transactions = orderRows.map(order => ({
      id: order.id,
      uid: order.uid || null,
      planId: order.plan_id,
      amount: Number(order.amount || 0),
      currency: normalizeCurrencyCode(order.currency || 'INR'),
      formattedAmount: formatCurrencyAmount(Number(order.amount || 0) / 100, order.currency || 'INR'),
      status: order.status,
      provider: order.provider || order.last_payment_gateway || null,
      createdAt: adminIso(order.created_at),
    }));
    return res.json({
      success: true,
      subscribers,
      transactions,
      totalActiveSubscribers: subscribers.length,
      recentTransactionsCount: transactions.length,
      source: 'mariadb',
    });
  } catch (error) {
    console.error('[Admin subscriptions query]', { code: error.code, requestId: res.locals.requestId });
    return res.status(503).json({ success: false, code: 'SUBSCRIPTION_DATA_UNAVAILABLE', error: 'Subscription data is unavailable.' });
  }
});

router.get('/ai/entitlements', requirePermission('ai.usage.read'), async (_req, res) => {
  try {
    return res.json({ success: true, aiGovernance: await getGlobalAiDashboardData() });
  } catch (error) {
    return res.status(error.status || 503).json({ success: false, code: error.code || 'AI_ENTITLEMENT_DATA_UNAVAILABLE', error: 'AI entitlement data is unavailable.' });
  }
});

router.post('/platform/tenants/:tenantId/members', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  try {
    const tenantId = assertTenantId(req.params.tenantId);
    const service = requireTenantService(req);
    const identityAdmin = req.app.get('firebaseAdmin') || admin;
    const requestedUid = String(req.body?.uid || '').trim();
    const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!requestedUid && !requestedEmail) {
      return res.status(400).json({ success: false, code: 'PRINCIPAL_REQUIRED', error: 'A registered user UID or email is required.' });
    }
    const identity = requestedUid
      ? await identityAdmin.auth().getUser(requestedUid)
      : await identityAdmin.auth().getUserByEmail(requestedEmail);
    if (requestedEmail && identity.email?.toLowerCase() !== requestedEmail) {
      return res.status(400).json({ success: false, code: 'USER_IDENTITY_MISMATCH', error: 'UID and email do not identify the same account.' });
    }
    const tenant = await service.registry.getTenant(tenantId);
    if (String(tenant.lifecycleState || '').toUpperCase() !== 'ACTIVE') {
      throw Object.assign(new Error('This organization is not active. Reactivate it before adding members.'), { code: 'TENANT_INACTIVE', status: 403 });
    }
    // GAP-22: the strict membership contract requires a concrete tenant-owned
    // workspaceId. Resolve the tenant's canonical default workspace here (or
    // validate an explicit, tenant-owned workspaceId) — same boundary as the
    // User 360 tenant assignment route, never inside the registry.
    const workspace = await resolveAssignableWorkspace(service.registry, tenant.id, String(req.body?.workspaceId || '').trim() || null);
    const membership = await service.registry.grantMembership({
      tenantId: tenant.id,
      principalId: identity.uid,
      workspaceId: workspace.id,
      roles: [String(req.body?.role || 'MEMBER').toUpperCase()],
      status: 'ACTIVE',
    });
    return res.status(201).json({
      success: true,
      message: `Member added to ${tenant.displayName} via ${workspace.isDefault ? 'the default workspace' : 'workspace'} "${workspace.name}".`,
      membership,
      workspace: { id: workspace.id, name: workspace.name, isDefault: workspace.isDefault === true, resolution: workspace.resolution },
    });
  } catch (error) {
    return sendTenantError(res, error, 'MEMBER_ADD_FAILED', 'The member could not be added.');
  }
});

router.delete('/platform/tenants/:tenantId/members/:principalId', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  try {
    const tenantId = assertTenantId(req.params.tenantId);
    const principalId = String(req.params.principalId || '').trim();
    if (!principalId) throw Object.assign(new Error('Principal identifier is required'), { code: 'PRINCIPAL_REQUIRED', status: 400 });
    const service = requireTenantService(req);
    await service.registry.getMembership(tenantId, principalId);
    await service.registry.removeTenantMembership({ tenantId, principalId });
    return res.json({ success: true, message: 'Member removed from organization.' });
  } catch (error) {
    return sendTenantError(res, error, 'MEMBER_REMOVE_FAILED', 'The member could not be removed.');
  }
});

router.patch('/platform/tenants/:tenantId/members/:principalId', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  try {
    const tenantId = assertTenantId(req.params.tenantId);
    const principalId = String(req.params.principalId || '').trim();
    if (!principalId) throw Object.assign(new Error('Principal identifier is required'), { code: 'PRINCIPAL_REQUIRED', status: 400 });
    const updated = await requireTenantService(req).registry.updateTenantMembership({
      tenantId,
      principalId,
      roles: req.body?.role ? [String(req.body.role).toUpperCase()] : undefined,
      status: req.body?.status ? String(req.body.status).toUpperCase() : undefined,
    });
    return res.json({ success: true, message: 'Membership updated.', membership: updated });
  } catch (error) {
    return sendTenantError(res, error, 'MEMBER_UPDATE_FAILED', 'The membership could not be updated.');
  }
});

router.patch('/platform/tenants/:tenantId/commercials', requirePermission('system.config.write'), requireRecentAdminAuthentication, requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = assertTenantId(req.params.tenantId);
    const revision = expectedRevision(req.body);
    const service = requireTenantService(req);
    const configuration = await service.registry.updateTenantConfiguration({
      tenantId,
      expectedRevision: revision,
      input: {
        commercials: {
          plan: req.body?.plan,
          seatLimit: Number(req.body?.seatLimit),
          currency: normalizeCurrencyCode(req.body?.currency),
          billingStatus: req.body?.billingStatus,
        },
      },
    });
    return res.json({ success: true, message: 'Tenant commercial settings updated.', commercials: configuration.commercials, revision: configuration.revision });
  } catch (error) {
    return sendTenantError(res, error, 'COMMERCIALS_UPDATE_FAILED', 'Tenant commercial settings could not be updated.');
  }
});

router.patch('/platform/tenants/:tenantId/ai-policy', requirePermission('system.config.write'), requireRecentAdminAuthentication, requireSuperAdmin, async (req, res) => {
  try {
    const tenantId = assertTenantId(req.params.tenantId);
    const revision = expectedRevision(req.body);
    if (req.body?.customProviderKeys && Object.keys(req.body.customProviderKeys).length) {
      throw Object.assign(
        new Error('Dedicated tenant provider credentials are unavailable until the encrypted credential adapter is configured.'),
        { code: 'TENANT_PROVIDER_CREDENTIALS_UNSUPPORTED', status: 501 }
      );
    }
    const service = requireTenantService(req);
    const current = await service.registry.getTenantConfiguration(tenantId);
    const configuration = await service.registry.updateTenantConfiguration({
      tenantId,
      expectedRevision: revision,
      input: {
        aiPolicy: {
          allowedProviders: Array.isArray(req.body?.allowedProviders) ? req.body.allowedProviders : current.aiPolicy.allowedProviders,
          allowedModels: Array.isArray(req.body?.allowedModels) ? req.body.allowedModels : current.aiPolicy.allowedModels,
          primaryModel: req.body?.primaryModel || current.aiPolicy.primaryModel,
        },
        quotaPolicy: {
          ...current.quotaPolicy,
          aiRequestsPerDay: Number(req.body?.dailyLimit),
        },
      },
    });
    return res.json({
      success: true,
      message: 'Tenant AI policy updated.',
      aiPolicy: { ...configuration.aiPolicy, dailyLimit: configuration.quotaPolicy.aiRequestsPerDay, customProviderKeys: {} },
      revision: configuration.revision,
    });
  } catch (error) {
    return sendTenantError(res, error, 'AI_POLICY_UPDATE_FAILED', 'Tenant AI policy could not be updated.');
  }
});

module.exports = { adminPlatformOperationsRouter: router };
