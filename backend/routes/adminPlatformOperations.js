'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const admin = require('../services/firebaseAdmin');
const {
  requirePermission,
  requireSuperAdmin,
  requireRecentAdminAuthentication,
  permissionsFor,
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
const { getRepository } = require('../repositories');
const { recordAdminAuditLog } = require('../security/adminAudit');
const { queueEmail } = require('../services/notificationOutbox');

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
                          paymentStatus, lastPaymentCurrency, paymentGraceUntil, paymentGraceStartedAt,
                          renewalFailedAt, updated_at
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
      // DIR-022 / AC-4: the operator needs to see WHICH accounts are inside a
      // renewal recovery window, and until when, to triage a support ticket.
      paymentGraceUntil: adminIso(user.paymentGraceUntil),
      paymentGraceStartedAt: adminIso(user.paymentGraceStartedAt),
      renewalFailedAt: adminIso(user.renewalFailedAt),
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

/* ------------------------------------------------------------------
 * DIR-022 / AC-5 — 1-click "Reconcile User Entitlements"
 * ------------------------------------------------------------------
 *
 * AUTHORISATION (two independent gates, both required):
 *   - requirePermission('payments.manage'): this WRITES entitlement state, so a
 *     read-only payments auditor must not be able to trigger it.
 *   - requireRecentAdminAuthentication: it changes what a customer is paying
 *     for, so a stale stolen session must not be enough.
 *
 * The endpoint never fabricates an outcome. It probes the gateway and reports
 * what the gateway said; when the gateway cannot be reached it returns
 * `reconciled: false` with a reason and changes nothing, rather than guessing.
 */
router.post('/subscriptions/:uid/reconcile', requirePermission('payments.manage'), requireRecentAdminAuthentication, async (req, res) => {
  // Operators hold a support ticket with an EMAIL, not an internal uid, so an
  // address is accepted too. Resolution is server-side only: the client never
  // chooses which account to touch beyond naming it.
  const rawTarget = String(req.params.uid || '').trim();
  if (!rawTarget || rawTarget.length > 255) {
    return res.status(400).json({ success: false, code: 'INVALID_SUBSCRIPTION_UID', error: 'A valid subscription owner id or email is required.' });
  }
  try {
    const { reconcileUserSubscription } = require('../services/subscriptionReconciler');
    const { getRepository } = require('../repositories');
    const repository = getRepository();

    const targetAccount = rawTarget.includes('@')
      ? await repository.getUserByEmail(rawTarget.toLowerCase())
      : await repository.getUser(rawTarget);
    if (!targetAccount) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', error: 'No subscription owner matches that identifier.' });
    }

    // Credentials are resolved here and passed straight through. They are never
    // echoed into the response and never written to the audit trail (INV-2).
    const credentials = {};
    const razorpayKeys = await resolveRazorpayKeysForReconciliation();
    if (razorpayKeys?.keyId && razorpayKeys?.keySecret) {
      credentials.keyId = razorpayKeys.keyId;
      credentials.keySecret = razorpayKeys.keySecret;
    }
    const stripeClient = await resolveStripeClientForReconciliation();
    if (stripeClient) credentials.stripeClient = stripeClient;

    const outcome = await reconcileUserSubscription({
      uid: targetAccount.id,
      repository,
      credentials,
      actor: req.user.uid,
      actorRole: 'ADMIN',
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      // `reconciled: false` is a SUCCESSFUL audit: it means the platform asked
      // the gateway and is honestly reporting that it has no correction to make
      // (or could not verify). Only a genuine failure returns a non-2xx status.
      reconciled: outcome.reconciled,
      changed: outcome.changed,
      uid: outcome.uid,
      fromStatus: outcome.fromStatus,
      toStatus: outcome.toStatus,
      observation: outcome.observation,
      reason: outcome.reason,
      gracePeriodMs: outcome.gracePeriodMs,
      audit: outcome.audit,
      requestId: res.locals.requestId,
    });
  } catch (error) {
    console.error('[Admin subscription reconcile]', { code: error.code, requestId: res.locals.requestId });
    return res.status(error.status || 503).json({
      success: false,
      code: error.code || 'SUBSCRIPTION_RECONCILIATION_UNAVAILABLE',
      error: 'Subscription reconciliation is unavailable.',
      requestId: res.locals.requestId,
    });
  }
});

/**
 * Resolves the complete Razorpay credential pair for a reconciliation probe.
 * Mirrors the checkout resolution order (deployment secret first, then the
 * Admin-managed MariaDB secret) so the probe authenticates exactly like
 * checkout does, and never a half-configured mix of the two.
 */
async function resolveRazorpayKeysForReconciliation() {
  const { getPaymentSettingsProjection } = require('../services/paymentAdmin');
  const envKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const envKeySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (envKeyId && envKeySecret) return { keyId: envKeyId, keySecret: envKeySecret };
  try {
    const settings = await getPaymentSettingsProjection();
    const razorpay = settings?.providers?.razorpay || settings?.razorpay || {};
    if (razorpay.keyId && razorpay.keySecret) {
      return { keyId: razorpay.keyId, keySecret: razorpay.keySecret };
    }
  } catch (_) {
    // Falls through to "no credentials", which the reconciler reports honestly.
  }
  return null;
}

async function resolveStripeClientForReconciliation() {
  const envSecret = String(process.env.STRIPE_SECRET || '').trim();
  if (!envSecret) return null;
  try {
    const Stripe = require('stripe');
    return Stripe(envSecret);
  } catch (_) {
    return null;
  }
}

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
    const service = requireTenantService(req);
    const registry = service.registry;
    const current = await registry.getTenantConfiguration(tenantId);

    // Persist BYOK credentials via the AES-256-GCM encrypted credential store.
    // customProviderKeys is intentionally NOT stored in the aiPolicy — it lives
    // only in the encrypted enterprise_tenant_credentials table. When present,
    // we delegate to setTenantCredentials/deleteTenantCredentials per provider.
    const customProviderKeys = (req.body && typeof req.body.customProviderKeys === 'object' && req.body.customProviderKeys) || {};
    const credentialResults = [];
    for (const [providerId, value] of Object.entries(customProviderKeys)) {
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        // Empty/null value => delete the stored credential (clear BYOK key)
        await registry.deleteTenantCredentials({ tenantId, providerId });
        credentialResults.push({ providerId, action: 'deleted' });
      } else {
        const credentials = typeof value === 'object' ? value : { apiKey: String(value) };
        await registry.setTenantCredentials({ tenantId, providerId, credentials });
        credentialResults.push({ providerId, action: 'stored' });
      }
    }

    const configuration = await registry.updateTenantConfiguration({
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
      credentials: credentialResults,
      revision: configuration.revision,
    });
  } catch (error) {
    return sendTenantError(res, error, 'AI_POLICY_UPDATE_FAILED', 'Tenant AI policy could not be updated.');
  }
});

/**
 * POST /api/platform/tenants/:tenantId/ai-keys/test
 * Test tenant BYOK credentials against the provider's live API.
 * Super Admin only - requires system.config.write + recent admin auth.
 */
router.post('/platform/tenants/:tenantId/ai-keys/test', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  try {
    const tenantId = assertTenantId(req.params.tenantId);
    const { providerId, model } = req.body || {};

    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ success: false, code: 'PROVIDER_ID_REQUIRED', error: 'providerId is required.' });
    }

    const service = requireTenantService(req);
    const registry = service.registry;

    // Check if tenant has credentials for this provider
    const credentials = await registry.getTenantCredentials({ tenantId, providerId });
    if (!credentials) {
      return res.status(404).json({ success: false, code: 'CREDENTIALS_NOT_FOUND', error: 'No credentials found for this provider.' });
    }

    // Test the credentials using FreeLLMAPI health probe
    const { probeProviderConnection } = require('../freellmapi/services/health');
    const providerMeta = require('../freellmapi/providers/registry').getProviderMeta(providerId);
    const targetModel = model || providerMeta?.defaultModel;

    const start = Date.now();
    let success = false;
    let latencyMs = null;
    let errorCode = null;
    let errorMessage = null;
    let modelTested = targetModel;

    try {
      const result = await probeProviderConnection({
        providerId,
        apiKey: credentials.apiKey || credentials.key,
        baseUrl: credentials.baseUrl,
        model: targetModel,
      });
      success = result.ok === true;
      latencyMs = result.latencyMs || (Date.now() - start);
      if (!success) {
        errorCode = result.code || 'TEST_FAILED';
        errorMessage = result.error || 'Provider test failed';
      }
      modelTested = result.model || targetModel;
    } catch (err) {
      latencyMs = Date.now() - start;
      success = false;
      errorCode = err.code || 'TEST_ERROR';
      errorMessage = err.message || 'Provider test encountered an error';
    }

    // Record test result in database
    const pool = getPool();
    await pool.query(
      `INSERT INTO enterprise_tenant_credential_tests (tenantId, providerId, testedAt, testedBy, success, latencyMs, errorCode, errorMessage, modelTested)
       VALUES (?, ?, NOW(6), ?, ?, ?, ?, ?, ?)`,
      [tenantId, providerId, req.user.uid, success, latencyMs, errorCode, errorMessage, modelTested]
    );

    return res.json({
      success,
      latencyMs,
      errorCode,
      errorMessage,
      modelTested,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin tenant AI key test]', { code: error.code, requestId: res.locals.requestId });
    return res.status(error.status || 503).json({
      success: false,
      code: error.code || 'AI_KEY_TEST_FAILED',
      error: 'AI key test is unavailable.',
      requestId: res.locals.requestId,
    });
  }
});

/**
 * GET /api/platform/status
 * Returns platform-wide AI status for a tenant (dedicated BYOK vs shared gateway).
 * Super Admin only - requires system.config.read.
 */
router.get('/platform/status', requirePermission('system.config.read'), requireRecentAdminAuthentication, async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (!tenantId || typeof tenantId !== 'string') {
      return res.status(400).json({ success: false, code: 'TENANT_ID_REQUIRED', error: 'tenantId query parameter is required.' });
    }

    const service = requireTenantService(req);
    const registry = service.registry;

    const credentials = await registry.listTenantCredentialProviders({ tenantId });
    const hasDedicatedBYOK = credentials.length > 0;

    return res.json({
      success: true,
      hasDedicatedBYOK,
      credentialCount: credentials.length,
      providers: credentials.map(c => c.providerId),
    });
  } catch (error) {
    console.error('[Admin platform AI status]', { code: error.code, requestId: res.locals.requestId });
    return res.status(error.status || 503).json({
      success: false,
      code: error.code || 'PLATFORM_STATUS_FAILED',
      error: 'Platform status is unavailable.',
      requestId: res.locals.requestId,
    });
  }
});

/* ------------------------------------------------------------------
 * Runtime Feature Flag Operations (/api/admin/operations/feature-flags)
 * Generic read/write for flags registered in featureFlagService.
 * (F-24: the former ai_settings_v2_enabled flag was removed — it was a
 * dead switch that gated no engine behaviour.)
 * ------------------------------------------------------------------ */
const {
  FLAG_DEFINITIONS,
  getAllFlags,
  getFlagValue,
  setFlagValue,
} = require('../services/featureFlagService');

router.get('/operations/feature-flags', requireSuperAdmin, async (_req, res) => {
  try {
    const flags = await getAllFlags();
    return res.json({ success: true, flags });
  } catch (_error) {
    return res.status(503).json({
      success: false,
      error: { code: 'FEATURE_FLAGS_UNAVAILABLE', message: 'Could not load feature flags', requestId: res.locals?.requestId },
    });
  }
});

router.get('/operations/feature-flags/:flagKey', requirePermission(['ai.usage.read', 'system.config.read']), async (req, res) => {
  const { flagKey } = req.params;
  if (!FLAG_DEFINITIONS[flagKey]) {
    return res.status(404).json({
      success: false,
      error: { code: 'UNKNOWN_FEATURE_FLAG', message: `Unknown feature flag: ${flagKey}`, requestId: res.locals?.requestId },
    });
  }
  try {
    const flags = await getAllFlags();
    const entry = flags[flagKey];
    const value = entry ? entry.value : await getFlagValue(flagKey);
    return res.json({ success: true, flag: flagKey, value, metadata: entry || null });
  } catch (_error) {
    return res.status(503).json({
      success: false,
      error: { code: 'FEATURE_FLAGS_UNAVAILABLE', message: 'Could not load feature flag', requestId: res.locals?.requestId },
    });
  }
});

router.put('/operations/feature-flags/:flagKey', requireRecentAdminAuthentication, async (req, res) => {
  const { flagKey } = req.params;
  const { value } = req.body || {};
  if (typeof value !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_VALUE', message: 'Flag value must be a boolean', requestId: res.locals?.requestId },
    });
  }
  if (!FLAG_DEFINITIONS[flagKey]) {
    return res.status(400).json({
      success: false,
      error: { code: 'UNKNOWN_FEATURE_FLAG', message: `Unknown feature flag: ${flagKey}`, requestId: res.locals?.requestId },
    });
  }
  try {
    const result = await setFlagValue(flagKey, value, req.user?.uid, res.locals?.requestId);
    return res.json({ success: true, ...result });
  } catch (error) {
    const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 400;
    return res.status(status).json({
      success: false,
      error: {
        code: error.code || 'FLAG_UPDATE_FAILED',
        message: status >= 500 ? 'Feature flag storage is unavailable.' : error.message,
        requestId: res.locals?.requestId,
      },
    });
  }
});

/* ==================================================================
 * Mandate 11C — Employer verification, marketplace moderation and
 * platform operational integrity.
 *
 * Every handler below:
 *   - is gated by the same permission model the global API policy applies
 *     (security/policy.js) plus an explicit route-level permission;
 *   - validates and bounds every client-supplied value;
 *   - reads and writes the authoritative MariaDB schema
 *     (companies / jobs / canonical_documents) with parameterized SQL;
 *   - records an attributable administrative audit event for every attempt;
 *   - never reports success for work that did not actually happen.
 * ================================================================== */

const ENTITY_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const EMPLOYER_DECISIONS = Object.freeze(['APPROVED', 'REJECTED']);
const COMPANY_REVIEW_STATUSES = Object.freeze(['pending', 'submitted', 'in_review', 'under_review']);
const COMPANY_DECIDED_STATUSES = Object.freeze(['approved', 'rejected']);
const MODERATION_TARGETS = Object.freeze(['active', 'flagged', 'archived']);
const MAX_MODERATION_NOTES = 500;
const MAX_DECISION_REASON = 500;

function boundedLimit(value, fallback = 50, maximum = 200) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function safeJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function boundedText(value, maximum) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maximum);
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function auditContext(req) {
  return {
    actorUid: req.user?.uid || 'unknown',
    actorEmail: req.user?.email || null,
    actorRole: String(req.user?.claims?.role || 'ADMIN').toUpperCase(),
    category: 'admin.governance',
    method: req.method,
    pathname: req.originalUrl,
    requestId: resRequestId(req),
  };
}

function resRequestId(req) {
  return req?.res?.locals?.requestId || null;
}

/**
 * AUDIT INTEGRITY STATEMENT (Mandate 11C §11.3)
 *
 * `recordAdminAuditLog` writes an append-only row to `admin_audit_logs`
 * (actor, action, category, severity, outcome, resource, metadata, timestamp).
 * That is a durable, attributable audit trail — it is NOT a cryptographically
 * tamper-evident log. The table has no hash-chain columns, the shared audit
 * service accepts no MAC/key, and this module is not authorized to add a
 * migration or a key-management path in order to invent one.
 *
 * Therefore nothing here labels an audit row as signed, chained or
 * tamper-proof. Achieving that property requires (a) new schema
 * (`prev_hash`/`entry_hash` or a signature column), and (b) a key-management
 * decision for the signing key. Both are outside the authorized file set; see
 * the delivery report for the explicit BLOCKED entry.
 */
async function writeAudit(req, event) {
  return recordAdminAuditLog(req, { ...auditContext(req), ...event });
}

// --------------------------------------------------------------------------
// Employer applications (companies + submitted application records)
// --------------------------------------------------------------------------

function mapCompanyApplication(row) {
  const extra = safeJsonObject(row.extra_json);
  const status = String(row.status || extra.status || 'pending').toLowerCase();
  return {
    id: row.id,
    source: 'COMPANY_PROFILE',
    ownerUid: row.owner_id || null,
    companyName: row.name || extra.companyName || extra.name || '',
    // `companies.name` is the company name column; `companyName` is only a
    // presentation alias for the admin queue, never a second stored field.
    website: row.website || extra.website || null,
    location: row.location || extra.location || null,
    industry: row.industry || extra.industry || null,
    companySize: row.size || extra.size || null,
    companyDescription: row.description || extra.description || null,
    status: status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'PENDING',
    storedStatus: status,
    verified: row.verified === 1 || row.verified === true,
    submittedAt: isoOrNull(row.created_at || row.updated_at),
    decidedAt: isoOrNull(extra.reviewedAt || extra.decidedAt),
    decisionReason: extra.rejectionReason || extra.decisionReason || null,
    contactEmail: extra.contactEmail || extra.email || null,
    contactPerson: extra.contactPerson || extra.contactName || null,
    contactPersonTitle: extra.contactPersonTitle || null,
    contactPhone: extra.contactPhone || extra.phone || null,
    taxId: extra.taxId || extra.gstin || null,
    linkedinProfile: extra.linkedinProfile || null,
    revision: Number(row.revision || 0) || null,
  };
}

function mapSubmittedApplication(row) {
  const payload = safeJsonObject(row.payload);
  const status = String(payload.status || 'pending').toLowerCase();
  return {
    id: row.entity_id,
    source: 'APPLICATION_SUBMISSION',
    ownerUid: payload.userId || payload.uid || null,
    companyName: payload.companyName || payload.company || payload.name || '',
    website: payload.website || null,
    location: payload.location || payload.address || null,
    industry: payload.industry || null,
    companySize: payload.companySize || payload.size || null,
    companyDescription: payload.companyDescription || payload.description || null,
    status: status === 'approved' || status === 'active' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'PENDING',
    storedStatus: status,
    verified: status === 'approved' || status === 'active',
    submittedAt: isoOrNull(payload.submittedAt || row.created_at || row.updated_at),
    decidedAt: isoOrNull(payload.reviewedAt),
    decisionReason: payload.rejectionReason || null,
    contactEmail: payload.contactEmail || payload.email || null,
    contactPerson: payload.contactPerson || payload.contactName || null,
    contactPersonTitle: payload.contactPersonTitle || null,
    contactPhone: payload.contactPhone || payload.phone || null,
    taxId: payload.taxId || payload.gstin || null,
    linkedinProfile: payload.linkedinProfile || null,
    revision: null,
  };
}

function redactSensitiveApplicationFields(application) {
  const redacted = { ...application };
  delete redacted.taxId;
  delete redacted.contactEmail;
  delete redacted.contactPerson;
  delete redacted.contactPhone;
  return redacted;
}

/** A reviewer must hold write authority to see applicant tax/contact data. */
function canReadSensitiveApplicationData(user) {
  const permissions = permissionsFor(user);
  return permissions.has('*') || permissions.has('users.update') || permissions.has('users.roles.manage');
}

async function loadEmployerApplications({ limit, statusFilter }) {
  const pool = getPool();
  const wantsAll = statusFilter === 'all';
  const statuses = wantsAll
    ? [...COMPANY_REVIEW_STATUSES, ...COMPANY_DECIDED_STATUSES]
    : (statusFilter === 'approved' || statusFilter === 'rejected' ? [statusFilter] : [...COMPANY_REVIEW_STATUSES]);
  const placeholders = statuses.map(() => '?').join(',');
  const [companyRows] = await pool.query(
    `SELECT id, owner_id, name, website, location, industry, size, description,
            verified, status, revision, extra_json, created_at, updated_at
       FROM companies
      WHERE LOWER(status) IN (${placeholders})
      ORDER BY created_at DESC
      LIMIT ?`,
    [...statuses, limit]
  );
  const [documentRows] = await pool.query(
    `SELECT entity_id, payload, created_at, updated_at
       FROM canonical_documents
      WHERE entity_type = 'employer_applications' AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT ?`,
    [limit]
  );
  const all = [
    ...(companyRows || []).map(mapCompanyApplication),
    ...(documentRows || []).map(mapSubmittedApplication),
  ];
  const applications = all.filter(application => {
    if (wantsAll) return true;
    if (statusFilter === 'approved') return application.status === 'APPROVED';
    if (statusFilter === 'rejected') return application.status === 'REJECTED';
    return application.status === 'PENDING';
  });
  applications.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  return applications.slice(0, limit);
}

async function locateEmployerApplication(id) {
  const pool = getPool();
  const [documentRows] = await pool.query(
    `SELECT entity_id, payload, created_at, updated_at
       FROM canonical_documents
      WHERE entity_type = 'employer_applications' AND entity_id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
  if (documentRows && documentRows.length) {
    return { kind: 'SUBMISSION', application: mapSubmittedApplication(documentRows[0]), row: documentRows[0] };
  }
  const [companyRows] = await pool.query(
    `SELECT id, owner_id, name, website, location, industry, size, description,
            verified, status, revision, extra_json, created_at, updated_at
       FROM companies
      WHERE id = ?
      LIMIT 1`,
    [id]
  );
  if (companyRows && companyRows.length) {
    return { kind: 'COMPANY', application: mapCompanyApplication(companyRows[0]), row: companyRows[0] };
  }
  return null;
}

function decisionEmail({ decision, companyName, reason }) {
  const safeName = String(companyName || 'your organization').slice(0, 160);
  if (decision === 'APPROVED') {
    return {
      subject: `Employer verification approved — ${safeName}`,
      body: `<p>Hello,</p><p>The employer verification for <strong>${safeName}</strong> has been <strong>approved</strong> on IME365. The verified employer badge is now active and hiring tools are enabled for the account.</p><p>— IME365 Platform Operations</p>`,
    };
  }
  const reasonLine = reason ? `<p><strong>Reason:</strong> ${String(reason).slice(0, MAX_DECISION_REASON)}</p>` : '';
  return {
    subject: `Employer verification update — ${safeName}`,
    body: `<p>Hello,</p><p>The employer verification for <strong>${safeName}</strong> was <strong>not approved</strong>.</p>${reasonLine}<p>You may correct the submitted details and re-apply.</p><p>— IME365 Platform Operations</p>`,
  };
}

/**
 * Durable enqueue of the decision notification. `queueEmail` writes a row to
 * `notification_outbox` inside its own MariaDB transaction, so success here
 * means the message is durably queued — NOT that the provider accepted it.
 */
async function enqueueEmployerDecisionNotice({ application, decision, reason }) {
  const recipient = String(application.contactEmail || '').trim().toLowerCase();
  if (!recipient) return { state: 'NO_RECIPIENT', note: 'The application has no contact email on record; no notification was queued.' };
  if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(recipient)) {
    return { state: 'INVALID_RECIPIENT', note: 'The stored contact email is not a deliverable address; no notification was queued.' };
  }
  const { subject, body } = decisionEmail({ decision, companyName: application.companyName, reason });
  const eventId = `employer-application:${application.id}:${decision.toLowerCase()}`;
  try {
    const notificationId = await queueEmail(getPool(), {
      eventId,
      recipient,
      templateType: 'default',
      vars: { company_name: String(application.companyName || '').slice(0, 160) },
      metadata: { customSubject: subject, customBody: body, source: 'admin_employer_verification' },
      idempotencyKey: eventId,
    });
    return { state: 'QUEUED', notificationId, deliveryContract: 'DURABLE_OUTBOX_ENQUEUE', note: 'Queued in the transactional outbox; provider delivery is asynchronous.' };
  } catch (error) {
    return { state: 'NOT_QUEUED', errorCode: error?.code || 'NOTIFICATION_ENQUEUE_FAILED', note: 'The notification could not be durably queued.' };
  }
}

async function syncEmployerClaim({ ownerUid, enabled, req }) {
  const identityAdmin = req.app.get('firebaseAdmin') || admin;
  if (!ownerUid) return { state: 'SKIPPED', reason: 'NO_OWNER_IDENTITY' };
  if (!identityAdmin?.auth) return { state: 'UNAVAILABLE', reason: 'IDENTITY_DIRECTORY_UNAVAILABLE' };
  try {
    const identity = await identityAdmin.auth().getUser(ownerUid);
    await identityAdmin.auth().setCustomUserClaims(ownerUid, { ...(identity.customClaims || {}), employer: enabled });
    await identityAdmin.auth().revokeRefreshTokens(ownerUid);
    return { state: 'UPDATED', employer: enabled };
  } catch (error) {
    return { state: 'FAILED', errorCode: error?.code || 'CLAIM_SYNC_FAILED' };
  }
}

router.get('/employer-applications', requirePermission(['users.read', 'system.config.read']), async (req, res) => {
  const limit = boundedLimit(req.query?.limit, 50);
  const statusFilter = String(req.query?.status || 'pending').trim().toLowerCase();
  if (!['pending', 'approved', 'rejected', 'all'].includes(statusFilter)) {
    return res.status(400).json({ success: false, code: 'INVALID_APPLICATION_STATUS', error: 'status must be pending, approved, rejected or all.', requestId: res.locals.requestId });
  }
  try {
    const applications = await loadEmployerApplications({ limit, statusFilter });
    const privileged = canReadSensitiveApplicationData(req.user);
    const projected = privileged ? applications : applications.map(redactSensitiveApplicationFields);
    return res.json({
      success: true,
      applications: projected,
      count: projected.length,
      sources: { companies: 'MARIADB_COMPANIES', submissions: 'MARIADB_CANONICAL_DOCUMENTS' },
      restricted: privileged ? null : ['taxId', 'contactEmail', 'contactPerson', 'contactPhone'],
    });
  } catch (error) {
    console.error('[Admin employer applications] read failed:', error?.code || error?.message);
    return res.status(503).json({
      success: false,
      code: 'EMPLOYER_APPLICATIONS_UNAVAILABLE',
      error: 'Employer applications are temporarily unavailable.',
      requestId: res.locals.requestId,
    });
  }
});

router.post('/employer-applications/:id/verify', requirePermission('users.update'), async (req, res) => {
  const id = String(req.params.id || '');
  if (!ENTITY_ID_PATTERN.test(id)) {
    return res.status(400).json({ success: false, code: 'INVALID_APPLICATION_ID', error: 'Invalid application identifier.', requestId: res.locals.requestId });
  }
  const body = req.body || {};
  const decision = String(body.decision || '').trim().toUpperCase();
  if (!EMPLOYER_DECISIONS.includes(decision)) {
    return res.status(400).json({ success: false, code: 'INVALID_DECISION', error: 'decision must be APPROVED or REJECTED.', requestId: res.locals.requestId });
  }
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    return res.status(400).json({ success: false, code: 'INVALID_REASON', error: 'reason must be a string.', requestId: res.locals.requestId });
  }
  const reason = boundedText(body.reason, MAX_DECISION_REASON);
  if (String(body.reason || '').trim().length > MAX_DECISION_REASON) {
    return res.status(400).json({ success: false, code: 'INVALID_REASON', error: `reason must be at most ${MAX_DECISION_REASON} characters.`, requestId: res.locals.requestId });
  }
  if (decision === 'REJECTED' && !reason) {
    return res.status(400).json({ success: false, code: 'REJECTION_REASON_REQUIRED', error: 'A rejection reason is required and is recorded in the audit trail.', requestId: res.locals.requestId });
  }

  const pool = getPool();
  let target;
  try {
    target = await locateEmployerApplication(id);
  } catch (error) {
    console.error('[Admin employer verify] lookup failed:', error?.code || error?.message);
    return res.status(503).json({ success: false, code: 'EMPLOYER_APPLICATION_LOOKUP_FAILED', error: 'The employer application store is temporarily unavailable.', requestId: res.locals.requestId });
  }
  if (!target) {
    return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', error: 'Employer application not found.', requestId: res.locals.requestId });
  }
  const { application } = target;
  if (application.ownerUid && application.ownerUid === req.user?.uid) {
    return res.status(400).json({ success: false, code: 'SELF_REVIEW_FORBIDDEN', error: 'Administrators cannot review their own employer application.', requestId: res.locals.requestId });
  }
  if (application.status !== 'PENDING') {
    // A decided record is not eligible for another decision. Silent overwrites
    // by a second administrator are exactly what this guard exists to prevent.
    return res.status(409).json({
      success: false,
      code: 'APPLICATION_ALREADY_DECIDED',
      error: `This application has already been ${application.status.toLowerCase()} and is no longer eligible for review.`,
      status: application.status,
      requestId: res.locals.requestId,
    });
  }

  const approved = decision === 'APPROVED';
  const nextCompanyStatus = approved ? 'approved' : 'rejected';
  const nowIso = new Date().toISOString();
  let revisionResult = null;
  try {
    if (target.kind === 'COMPANY') {
      const extra = safeJsonObject(target.row.extra_json);
      const nextExtra = {
        ...extra,
        decision,
        reviewedBy: req.user?.uid || null,
        reviewedAt: nowIso,
        rejectionReason: approved ? null : reason,
      };
      const [result] = await pool.query(
        `UPDATE companies
            SET verified = ?, status = ?, extra_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND revision = ?`,
        [approved ? 1 : 0, nextCompanyStatus, JSON.stringify(nextExtra), id, Number(target.row.revision || 1)]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        return res.status(409).json({
          success: false,
          code: 'APPLICATION_CHANGED',
          error: 'This application changed after it was loaded. Refresh the queue before reviewing it.',
          requestId: res.locals.requestId,
        });
      }
      revisionResult = Number(target.row.revision || 1) + 1;
    } else {
      const payload = safeJsonObject(target.row.payload);
      if (payload.status && String(payload.status).toLowerCase() !== 'pending') {
        return res.status(409).json({
          success: false,
          code: 'APPLICATION_ALREADY_DECIDED',
          error: 'This application was already reviewed by another administrator.',
          status: String(payload.status).toUpperCase(),
          requestId: res.locals.requestId,
        });
      }
      const nextPayload = {
        ...payload,
        status: approved ? 'approved' : 'rejected',
        reviewedBy: req.user?.uid || null,
        reviewedAt: nowIso,
        ...(reason ? { rejectionReason: approved ? null : reason } : {}),
      };
      const [result] = await pool.query(
        `UPDATE canonical_documents
            SET payload = ?, updated_at = CURRENT_TIMESTAMP
          WHERE entity_type = 'employer_applications' AND entity_id = ? AND deleted_at IS NULL
            AND (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status')) IS NULL
                 OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status'))) = 'pending')`,
        [JSON.stringify(nextPayload), id]
      );
      if (Number(result?.affectedRows || 0) !== 1) {
        return res.status(409).json({
          success: false,
          code: 'APPLICATION_ALREADY_DECIDED',
          error: 'This application was reviewed by another administrator while you were deciding.',
          requestId: res.locals.requestId,
        });
      }
    }
  } catch (error) {
    console.error('[Admin employer verify] persistence failed:', error?.code || error?.message);
    return res.status(503).json({
      success: false,
      code: 'EMPLOYER_APPLICATION_UPDATE_FAILED',
      error: 'The verification decision could not be persisted. No decision was recorded.',
      requestId: res.locals.requestId,
    });
  }

  const claim = await syncEmployerClaim({ ownerUid: application.ownerUid, enabled: approved, req });
  const notification = await enqueueEmployerDecisionNotice({ application, decision, reason });
  const warnings = [];
  if (claim.state === 'FAILED' || claim.state === 'UNAVAILABLE') {
    warnings.push(`Employer claim sync did not complete (${claim.state}${claim.errorCode ? `: ${claim.errorCode}` : ''}). The recorded decision stands; retry the claim sync.`);
  }
  if (notification.state === 'NOT_QUEUED') {
    warnings.push('The decision notification could not be queued. No email will be delivered for this decision.');
  }

  try {
    await writeAudit(req, {
      action: 'EMPLOYER_APPLICATION_VERIFIED',
      category: 'iam.users',
      severity: 'HIGH',
      outcome: warnings.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS',
      statusCode: 200,
      resourceType: 'employer_application',
      resourceId: id,
      metadata: {
        decision,
        source: target.kind,
        previousStatus: application.status,
        reason: approved ? null : reason,
        companyName: String(application.companyName || '').slice(0, 160),
        ownerUid: application.ownerUid || null,
        verificationPersisted: true,
        revision: revisionResult,
        claimSync: claim.state,
        notification: notification.state,
      },
    });
  } catch (auditError) {
    console.error('[Admin employer verify] audit write failed:', auditError?.code || auditError?.message);
    return res.status(500).json({
      success: false,
      code: 'AUDIT_WRITE_FAILED',
      error: 'The decision was persisted, but the administrative audit record could not be stored. This change is NOT fully audited.',
      applied: true,
      decision,
      warnings,
      requestId: res.locals.requestId,
    });
  }

  return res.json({
    success: true,
    id,
    decision,
    status: decision,
    verified: approved,
    source: target.kind,
    decidedAt: nowIso,
    reason: approved ? null : reason,
    claimSync: claim,
    notification,
    warnings,
  });
});

// --------------------------------------------------------------------------
// Job marketplace moderation & anti-spam
// --------------------------------------------------------------------------

function mapModerationJob(row) {
  const extra = safeJsonObject(row.extra_json);
  const moderation = safeJsonObject(extra.moderation);
  const status = String(row.status || 'pending').trim().toLowerCase();
  const isSpam = moderation.isSpam === true || status === 'flagged';
  return {
    id: row.id,
    employerId: row.employer_id || null,
    title: row.title || '',
    company: row.company_name || '',
    location: row.location || null,
    status,
    isSpam,
    publiclyVisible: status === 'active',
    notes: moderation.notes || null,
    moderatedAt: moderation.moderatedAt || null,
    moderatedBy: moderation.moderatedBy || null,
    postedAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
    expiresAt: isoOrNull(row.expires_at),
    revision: Number(row.revision || 0) || null,
  };
}

async function listJobsForModeration({ statusFilter, search, limit, queueOnly }) {
  const pool = getPool();
  const params = [];
  let where = 'WHERE 1=1';
  if (queueOnly) {
    // The marketplace lifecycle is established by resilientMutations.createJob:
    // employer submissions start as `pending`; `flagged` holds are the
    // anti-spam queue. Both need an administrator decision.
    where += " AND LOWER(status) IN ('pending','flagged')";
  } else if (statusFilter && statusFilter !== 'all') {
    where += ' AND LOWER(status) = ?';
    params.push(statusFilter);
  }
  if (search) {
    where += ' AND (title LIKE ? OR company_name LIKE ? OR location LIKE ? OR id LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const [rows] = await pool.query(
    `SELECT id, employer_id, title, company_name, location, status, revision,
            extra_json, created_at, updated_at, expires_at
       FROM jobs
       ${where}
      ORDER BY created_at DESC
      LIMIT ?`,
    [...params, limit]
  );
  return (rows || []).map(mapModerationJob);
}

router.get('/jobs/pending-moderation', requirePermission(['users.read', 'tickets.manage']), async (req, res) => {
  const limit = boundedLimit(req.query?.limit, 100);
  try {
    const jobs = await listJobsForModeration({ queueOnly: true, limit });
    return res.json({
      success: true,
      jobs,
      count: jobs.length,
      queue: 'PENDING_AND_FLAGGED',
      source: 'MARIADB_JOBS',
    });
  } catch (error) {
    console.error('[Admin jobs queue] read failed:', error?.code || error?.message);
    return res.status(503).json({ success: false, code: 'JOBS_UNAVAILABLE', error: 'The job moderation queue is temporarily unavailable.', requestId: res.locals.requestId });
  }
});

router.get('/jobs', requirePermission(['users.read', 'tickets.manage']), async (req, res) => {
  const limit = boundedLimit(req.query?.limit, 100);
  const statusFilter = String(req.query?.status || 'all').trim().toLowerCase();
  if (statusFilter !== 'all' && !MODERATION_TARGETS.includes(statusFilter) && !['pending', 'draft', 'closed', 'expired'].includes(statusFilter)) {
    return res.status(400).json({ success: false, code: 'INVALID_JOB_STATUS', error: 'Unsupported job status filter.', requestId: res.locals.requestId });
  }
  const search = boundedText(req.query?.search || req.query?.q, 120);
  try {
    const jobs = await listJobsForModeration({ statusFilter, search, limit });
    return res.json({ success: true, jobs, count: jobs.length, source: 'MARIADB_JOBS' });
  } catch (error) {
    console.error('[Admin jobs] read failed:', error?.code || error?.message);
    return res.status(503).json({ success: false, code: 'JOBS_UNAVAILABLE', error: 'The job directory is temporarily unavailable.', requestId: res.locals.requestId });
  }
});

/**
 * Marketplace cache invalidation.
 *
 * Job discovery is served from MariaDB on every request (repository.getJobs sets
 * the publicOnly predicate; the route also sets Cache-Control). There is no
 * application-level job cache to purge, so this helper reports exactly what it
 * invalidated instead of claiming a cache was cleared.
 */
function invalidateMarketplaceCaches() {
  const invalidated = [];
  const unsupported = [
    { layer: 'marketplace-job-listings', reason: 'Job discovery has no application cache: MariaDB is authoritative and public responses set Cache-Control.' },
  ];
  try {
    const platformHealth = require('../services/platformHealth');
    if (typeof platformHealth.resetHealthCache === 'function') {
      platformHealth.resetHealthCache();
      invalidated.push({ layer: 'platform-health-snapshot', entriesCleared: null });
    }
  } catch (error) {
    return { invalidated, unsupported, error: error?.code || 'CACHE_INVALIDATION_FAILED' };
  }
  return { invalidated, unsupported, error: null };
}

router.post('/jobs/:id/moderate', requirePermission('system.config.write'), async (req, res) => {
  const jobId = String(req.params.id || '');
  if (!ENTITY_ID_PATTERN.test(jobId)) {
    return res.status(400).json({ success: false, code: 'INVALID_JOB_ID', error: 'Invalid job identifier.', requestId: res.locals.requestId });
  }
  const body = req.body || {};
  const requestedStatus = String(body.status || '').trim().toLowerCase();
  if (!MODERATION_TARGETS.includes(requestedStatus)) {
    return res.status(400).json({ success: false, code: 'INVALID_MODERATION_STATUS', error: 'status must be active, flagged or archived.', requestId: res.locals.requestId });
  }
  if (body.isSpam !== undefined && typeof body.isSpam !== 'boolean') {
    return res.status(400).json({ success: false, code: 'INVALID_SPAM_FLAG', error: 'isSpam must be a boolean when provided.', requestId: res.locals.requestId });
  }
  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
    return res.status(400).json({ success: false, code: 'INVALID_MODERATION_NOTES', error: 'notes must be a string.', requestId: res.locals.requestId });
  }
  if (String(body.notes || '').trim().length > MAX_MODERATION_NOTES) {
    return res.status(400).json({ success: false, code: 'INVALID_MODERATION_NOTES', error: `notes must be at most ${MAX_MODERATION_NOTES} characters.`, requestId: res.locals.requestId });
  }
  const notes = boundedText(body.notes, MAX_MODERATION_NOTES);
  const isSpam = body.isSpam === undefined ? requestedStatus === 'flagged' : body.isSpam;

  const pool = getPool();
  const connection = await pool.getConnection().catch(error => {
    console.error('[Admin job moderation] pool acquisition failed:', error?.code || error?.message);
    return null;
  });
  if (!connection) {
    return res.status(503).json({ success: false, code: 'JOB_MODERATION_UNAVAILABLE', error: 'The job store is temporarily unavailable.', requestId: res.locals.requestId });
  }

  let committed = null;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT id, employer_id, title, company_name, status, revision, extra_json FROM jobs WHERE id = ? FOR UPDATE',
      [jobId]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', error: 'Job not found.', requestId: res.locals.requestId });
    }
    const current = mapModerationJob(rows[0]);
    const allowedFrom = current.status === 'archived' ? ['active'] : ['active', 'flagged', 'archived'];
    const allowed = current.status === requestedStatus
      || ['pending', 'active', 'flagged', 'archived'].includes(current.status) && allowedFrom.includes(requestedStatus);
    if (!allowed) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: 'UNSAFE_MODERATION_TRANSITION',
        error: `A job in "${current.status}" cannot be moved to "${requestedStatus}".`,
        currentStatus: current.status,
        requestId: res.locals.requestId,
      });
    }

    const extra = safeJsonObject(rows[0].extra_json);
    const moderatedAt = new Date().toISOString();
    const moderation = {
      state: isSpam ? 'SPAM' : requestedStatus === 'active' ? 'CLEARED' : 'SUPPRESSED',
      isSpam,
      status: requestedStatus,
      notes: notes || null,
      moderatedAt,
      moderatedBy: req.user?.uid || null,
    };
    const nextExtra = { ...extra, moderation };
    const nextRevision = Number(rows[0].revision || 0) + 1;
    const [result] = await connection.query(
      `UPDATE jobs
          SET status = ?, extra_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND revision = ?`,
      [requestedStatus, JSON.stringify(nextExtra), nextRevision, jobId, Number(rows[0].revision || 0)]
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: 'JOB_CHANGED',
        error: 'This job changed while it was being moderated. Reload the queue and retry.',
        requestId: res.locals.requestId,
      });
    }
    await connection.commit();
    committed = { current, moderation, nextRevision, employerId: rows[0].employer_id };
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error('[Admin job moderation] persistence failed:', error?.code || error?.message);
    return res.status(503).json({ success: false, code: 'JOB_MODERATION_FAILED', error: 'The moderation decision could not be persisted. No change was applied.', requestId: res.locals.requestId });
  } finally {
    connection.release();
  }

  const cache = invalidateMarketplaceCaches();
  const warnings = [];
  if (cache.error) warnings.push('The moderation decision was stored, but cache invalidation reported an error. Public discovery reads MariaDB directly, so the change is still effective.');
  if (isSpam && requestedStatus === 'active') warnings.push('isSpam was true while the job was restored to active; the spam flag was cleared as part of the decision.');

  try {
    await writeAudit(req, {
      action: 'JOB_MODERATION_ACTION',
      category: 'employer.recruitment',
      severity: 'HIGH',
      outcome: warnings.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS',
      statusCode: 200,
      resourceType: 'job',
      resourceId: jobId,
      metadata: {
        previousStatus: committed.current.status,
        status: requestedStatus,
        isSpam,
        notes: notes || null,
        revision: committed.nextRevision,
        employerId: committed.employerId || null,
        publicVisibility: requestedStatus === 'active' ? 'VISIBLE' : 'SUPPRESSED',
        cacheInvalidated: cache.invalidated.map(entry => entry.layer),
      },
    });
  } catch (auditError) {
    console.error('[Admin job moderation] audit write failed:', auditError?.code || auditError?.message);
    return res.status(500).json({
      success: false,
      code: 'AUDIT_WRITE_FAILED',
      error: 'The moderation decision was persisted, but the administrative audit record could not be stored.',
      applied: true,
      job: { id: jobId, status: requestedStatus, isSpam },
      requestId: res.locals.requestId,
    });
  }

  return res.json({
    success: true,
    changed: committed.current.status !== requestedStatus || committed.current.isSpam !== isSpam,
    job: {
      id: jobId,
      status: requestedStatus,
      isSpam,
      notes: notes || null,
      moderatedAt: committed.moderation.moderatedAt,
      moderatedBy: committed.moderation.moderatedBy,
      revision: committed.nextRevision,
      publiclyVisible: requestedStatus === 'active',
    },
    cache: { invalidated: cache.invalidated, unsupported: cache.unsupported },
    warnings,
  });
});

// --------------------------------------------------------------------------
// Operational integrity: backup, cache clearing, live telemetry
// --------------------------------------------------------------------------

const BACKUP_MIN_TIMEOUT_MS = 30_000;
const BACKUP_MAX_TIMEOUT_MS = 15 * 60 * 1000;
let backupInFlight = null;

function backupScriptPath() {
  const override = String(process.env.DR_BACKUP_SCRIPT_PATH || '').trim();
  if (override) return path.resolve(override);
  return path.resolve(__dirname, '..', '..', 'scripts', 'dr-backup-run.mjs');
}

function backupTimeoutMs() {
  const configured = Number(process.env.DR_BACKUP_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured < BACKUP_MIN_TIMEOUT_MS) return 5 * 60 * 1000;
  return Math.min(configured, BACKUP_MAX_TIMEOUT_MS);
}

function runBackupScript({ scriptPath, timeoutMs }) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [scriptPath],
      { cwd: path.resolve(__dirname, '..', '..'), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: process.env, windowsHide: true },
      (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') })
    );
  });
}

/** Extract the last JSON object emitted by the DR runner (stdout or stderr). */
function parseBackupReport(...sources) {
  for (const raw of sources) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const candidates = [text];
    const firstBrace = text.indexOf('{');
    if (firstBrace > 0) candidates.push(text.slice(firstBrace));
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_error) { /* try the next candidate */ }
    }
  }
  return null;
}

function redactProcessOutput(value, maximum = 400) {
  let text = String(value || '');
  const repoRoot = path.resolve(__dirname, '..', '..');
  text = text.split(repoRoot).join('<app>');
  text = text.replace(/password\s*=\s*\S+/gi, 'password=[REDACTED]');
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, maximum);
}

async function sha256OfFile(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

router.post('/operations/backup', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  if (backupInFlight) {
    return res.status(409).json({
      success: false,
      code: 'BACKUP_ALREADY_RUNNING',
      error: 'A database backup is already in progress.',
      startedAt: backupInFlight.startedAt,
      requestId: res.locals.requestId,
    });
  }
  const scriptPath = backupScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return res.status(501).json({
      success: false,
      code: 'BACKUP_SYSTEM_UNAVAILABLE',
      error: 'No verified backup subsystem is installed on this host, so no backup was produced.',
      requestId: res.locals.requestId,
    });
  }

  const startedAt = new Date().toISOString();
  backupInFlight = { startedAt };
  let outcome;
  try {
    outcome = await runBackupScript({ scriptPath, timeoutMs: backupTimeoutMs() });
  } finally {
    backupInFlight = null;
  }

  const { error, stdout, stderr } = outcome;
  const report = parseBackupReport(stdout, stderr);
  const backupStep = report?.steps?.backup || null;
  const verifyStep = report?.steps?.verify || null;
  const reportSucceeded = report
    && ['SUCCESS', 'SUCCESS_WITH_WARNINGS'].includes(String(report.status || ''))
    && backupStep?.ok === true
    && verifyStep?.ok !== false;

  let failureCode = null;
  let failureMessage = null;
  if (error?.killed || error?.signal === 'SIGTERM') {
    failureCode = 'BACKUP_TIMEOUT';
    failureMessage = 'The backup run exceeded the configured time budget and was terminated. No verified artifact was confirmed.';
  } else if (!report) {
    failureCode = 'BACKUP_REPORT_UNREADABLE';
    failureMessage = 'The backup subsystem did not return a verifiable report, so no backup can be confirmed.';
  } else if (!reportSucceeded) {
    failureCode = 'BACKUP_FAILED';
    failureMessage = 'The backup subsystem reported a failure; no verified backup was produced.';
  } else if (!backupStep?.file) {
    failureCode = 'BACKUP_ARTIFACT_MISSING';
    failureMessage = 'The backup subsystem reported success without naming an artifact.';
  } else if (!fs.existsSync(backupStep.file)) {
    failureCode = 'BACKUP_ARTIFACT_MISSING';
    failureMessage = 'The backup subsystem reported success, but the artifact does not exist on disk.';
  }

  if (failureCode) {
    await writeAudit(req, {
      action: 'PLATFORM_DATABASE_BACKUP',
      category: 'platform.health',
      severity: 'HIGH',
      outcome: 'FAILURE',
      statusCode: failureCode === 'BACKUP_TIMEOUT' ? 504 : 502,
      resourceType: 'platform_database',
      resourceId: null,
      metadata: {
        failureCode,
        reportStatus: report?.status || null,
        subsystemError: redactProcessOutput(report?.error || stderr),
        durationMs: report?.durationMs ?? null,
      },
    }).catch(auditError => console.error('[Admin backup] failure audit write failed:', auditError?.code || auditError?.message));
    return res.status(failureCode === 'BACKUP_TIMEOUT' ? 504 : 502).json({
      success: false,
      code: failureCode,
      error: failureMessage,
      subsystem: report ? { status: report.status, error: redactProcessOutput(report.error || '') || null } : null,
      startedAt,
      requestId: res.locals.requestId,
    });
  }

  // Verify the artifact independently of the subsystem's own claims.
  let sizeBytes = 0;
  let checksum = null;
  try {
    sizeBytes = fs.statSync(backupStep.file).size;
    checksum = await sha256OfFile(backupStep.file);
  } catch (artifactError) {
    return res.status(502).json({
      success: false,
      code: 'BACKUP_ARTIFACT_UNREADABLE',
      error: 'The backup artifact could not be read back for verification, so the backup is not confirmed.',
      requestId: res.locals.requestId,
    });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return res.status(502).json({
      success: false,
      code: 'BACKUP_ARTIFACT_EMPTY',
      error: 'The backup artifact is empty, so it is not a usable backup.',
      requestId: res.locals.requestId,
    });
  }
  if (backupStep.sha256 && String(backupStep.sha256).toLowerCase() !== checksum) {
    return res.status(502).json({
      success: false,
      code: 'BACKUP_CHECKSUM_MISMATCH',
      error: 'The backup checksum does not match the subsystem manifest; the artifact is not trusted.',
      requestId: res.locals.requestId,
    });
  }

  const finishedAt = new Date().toISOString();
  const artifactName = path.basename(backupStep.file);
  const warnings = Array.isArray(report.warnings) ? report.warnings.map(warning => redactProcessOutput(warning, 300)) : [];

  try {
    await writeAudit(req, {
      action: 'PLATFORM_DATABASE_BACKUP',
      category: 'platform.health',
      severity: 'HIGH',
      outcome: warnings.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS',
      statusCode: 200,
      resourceType: 'platform_database',
      resourceId: artifactName,
      metadata: {
        artifact: artifactName,
        sizeBytes,
        sha256: checksum,
        encrypted: Boolean(backupStep.encrypted),
        compressed: Boolean(backupStep.compressed),
        tables: backupStep.tables ?? null,
        rows: backupStep.rows ?? null,
        verification: verifyStep?.ok === true ? 'STRUCTURAL_VERIFIED' : 'UNVERIFIED',
        durationMs: report.durationMs ?? null,
      },
    });
  } catch (auditError) {
    console.error('[Admin backup] audit write failed:', auditError?.code || auditError?.message);
    return res.status(500).json({
      success: false,
      code: 'AUDIT_WRITE_FAILED',
      error: 'The backup completed, but the administrative audit record could not be stored.',
      applied: true,
      backupId: artifactName,
      requestId: res.locals.requestId,
    });
  }

  return res.json({
    success: true,
    backupId: artifactName,
    timestamp: finishedAt,
    startedAt,
    sizeBytes,
    artifact: { name: artifactName, sizeBytes, sha256: checksum, encrypted: Boolean(backupStep.encrypted), compressed: Boolean(backupStep.compressed) },
    subsystem: { status: report.status, verification: verifyStep?.ok === true ? 'STRUCTURAL_VERIFIED' : 'UNVERIFIED', recoveryPoints: report.recoveryPoints ?? null },
    warnings,
  });
});

router.post('/operations/cache-clear', requirePermission('system.config.write'), requireRecentAdminAuthentication, async (req, res) => {
  const layers = [];
  const unsupported = [
    { layer: 'feature-flag-overrides', reason: 'featureFlagService holds a process-local cache without an exported invalidation hook; it self-expires within 30 seconds.' },
    { layer: 'marketplace-job-listings', reason: 'Job discovery is read from MariaDB per request; there is no application cache to purge.' },
  ];
  let clearedEntries = 0;
  let failures = 0;

  try {
    const platformHealth = require('../services/platformHealth');
    platformHealth.resetHealthCache();
    layers.push({ layer: 'platform-health-snapshot', status: 'CLEARED', entriesCleared: null, note: 'Snapshot invalidated; the module does not track an entry count.' });
  } catch (error) {
    failures += 1;
    layers.push({ layer: 'platform-health-snapshot', status: 'FAILED', entriesCleared: null, errorCode: error?.code || 'HEALTH_CACHE_CLEAR_FAILED' });
  }

  try {
    const engine = require('../freellmapi');
    const before = Number(engine?.getEngineStatus?.().cacheEntries ?? 0);
    engine.clearCache();
    const after = Number(engine?.getEngineStatus?.().cacheEntries ?? 0);
    const cleared = Number.isFinite(before) && Number.isFinite(after) && before >= after ? before - after : null;
    if (cleared !== null) clearedEntries += cleared;
    layers.push({ layer: 'ai-engine-prompt-cache', status: 'CLEARED', entriesCleared: cleared });
  } catch (error) {
    failures += 1;
    layers.push({ layer: 'ai-engine-prompt-cache', status: 'FAILED', entriesCleared: null, errorCode: error?.code || 'ENGINE_CACHE_CLEAR_FAILED' });
  }

  const timestamp = new Date().toISOString();
  const outcome = failures === 0 ? 'SUCCESS' : failures === layers.length ? 'FAILURE' : 'PARTIAL_FAILURE';
  try {
    await writeAudit(req, {
      action: 'PLATFORM_CACHE_CLEARED',
      category: 'platform.health',
      severity: 'MEDIUM',
      outcome,
      statusCode: failures === 0 ? 200 : 502,
      resourceType: 'platform_cache',
      resourceId: null,
      metadata: { layers: layers.map(layer => ({ layer: layer.layer, status: layer.status })), clearedEntries, failures, unsupported: unsupported.map(entry => entry.layer) },
    });
  } catch (auditError) {
    console.error('[Admin cache-clear] audit write failed:', auditError?.code || auditError?.message);
    return res.status(500).json({
      success: false,
      code: 'AUDIT_WRITE_FAILED',
      error: 'Cache clearing ran, but the administrative audit record could not be stored.',
      clearedEntries,
      layers,
      requestId: res.locals.requestId,
    });
  }

  return res.status(failures === 0 ? 200 : 502).json({
    success: failures === 0,
    clearedEntries,
    timestamp,
    layers,
    unsupported,
    result: outcome,
    requestId: res.locals.requestId,
  });
});

async function probeDatabaseHealth(timeoutMs = 2500) {
  const startedAt = Date.now();
  let timer = null;
  try {
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Database health check timed out'), { code: 'DB_HEALTH_TIMEOUT' })), timeoutMs);
    });
    const query = getPool().query('SELECT 1 AS alive');
    const [rows] = await Promise.race([query, timeout]);
    return {
      reachable: Boolean(rows?.[0]?.alive === 1 || rows?.[0]?.alive === true || rows?.[0]?.alive === '1'),
      latencyMs: Date.now() - startedAt,
      timedOut: false,
      errorCode: null,
    };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      timedOut: error?.code === 'DB_HEALTH_TIMEOUT',
      errorCode: String(error?.code || 'DB_HEALTH_CHECK_FAILED').slice(0, 80),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function poolTelemetry() {
  try {
    const pool = getPool();
    const core = pool?.pool || pool;
    const limit = Number(core?.config?.connectionLimit);
    const open = Number(core?._allConnections?.length);
    const free = Number(core?._freeConnections?.length);
    const queued = Number(core?._connectionQueue?.length);
    return {
      connectionLimit: Number.isFinite(limit) ? limit : null,
      openConnections: Number.isFinite(open) ? open : null,
      idleConnections: Number.isFinite(free) ? free : null,
      queuedRequests: Number.isFinite(queued) ? queued : null,
    };
  } catch (_error) {
    return null;
  }
}

router.get('/operations/system-status', requirePermission(['system.config.read', 'system.config.write']), async (_req, res) => {
  const memory = process.memoryUsage();
  const database = await probeDatabaseHealth();
  let aiPromptCacheEntries = null;
  try {
    const engine = require('../freellmapi');
    const entries = Number(engine?.getEngineStatus?.().cacheEntries);
    aiPromptCacheEntries = Number.isFinite(entries) ? entries : null;
  } catch (_error) {
    aiPromptCacheEntries = null;
  }

  const status = database.reachable ? 'HEALTHY' : 'DEGRADED';
  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    status,
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
    },
    database: {
      reachable: database.reachable,
      latencyMs: database.latencyMs,
      timedOut: database.timedOut,
      errorCode: database.errorCode,
    },
    pool: poolTelemetry(),
    caches: { aiPromptCacheEntries },
    limitations: database.reachable ? [] : ['The MariaDB health probe did not succeed, so the platform is reported as degraded rather than healthy.'],
    requestId: res.locals.requestId,
  });
});

module.exports = { adminPlatformOperationsRouter: router };
