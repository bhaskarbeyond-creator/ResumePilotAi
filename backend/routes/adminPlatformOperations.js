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

module.exports = { adminPlatformOperationsRouter: router };
