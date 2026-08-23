'use strict';

/**
 * Platform operational health engine.
 *
 * Every descriptor returned by this module is derived from a real runtime
 * observation: an environment/Firestore configuration read, a Firestore probe,
 * a durable-outbox inspection, or an explicit provider test the operator
 * requested. Nothing here is hardcoded to "healthy", no counter is invented,
 * and an unreadable source is reported as UNKNOWN rather than zero.
 *
 * Secrets are never returned. Only booleans ("configured"), non-secret
 * hostnames, provider environment names, and counts cross the boundary.
 */

const os = require('os');
const fs = require('fs');

/** Operational states surfaced to the Admin console. */
const STATE = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  DISABLED: 'DISABLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  UNKNOWN: 'UNKNOWN',
});

/** Configuration postures, kept distinct from runtime state on purpose. */
const CONFIG = Object.freeze({
  CONFIGURED: 'CONFIGURED',
  PARTIALLY_CONFIGURED: 'PARTIALLY_CONFIGURED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  DISABLED_BY_CONFIGURATION: 'DISABLED_BY_CONFIGURATION',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNKNOWN: 'UNKNOWN',
});

const GROUP = Object.freeze({
  CORE: 'core',
  INTEGRATIONS: 'integrations',
  WORKERS: 'workers',
});

const SEVERITY_ORDER = Object.freeze({
  [STATE.UNAVAILABLE]: 5,
  [STATE.DEGRADED]: 4,
  [STATE.UNKNOWN]: 3,
  [STATE.NOT_CONFIGURED]: 2,
  [STATE.DISABLED]: 1,
  [STATE.NOT_SUPPORTED]: 0,
  [STATE.OPERATIONAL]: 0,
});

const SNAPSHOT_TTL_MS = Number(process.env.PLATFORM_HEALTH_CACHE_MS || 15_000);
const MIN_FORCED_INTERVAL_MS = Number(process.env.PLATFORM_HEALTH_MIN_INTERVAL_MS || 3_000);

let cachedSnapshot = null;
let cachedAt = 0;
let inFlight = null;

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────────── */

function nowIso() {
  return new Date().toISOString();
}

function truthy(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function envFlag(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

/** Runs a probe and never throws; the failure itself becomes observable data. */
async function observe(label, fn) {
  const startedAt = Date.now();
  try {
    const value = await fn();
    return { ok: true, label, value, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      label,
      error: String(error?.message || error).slice(0, 240),
      code: error?.code ? String(error.code).slice(0, 80) : null,
      latencyMs: Date.now() - startedAt,
    };
  }
}

function docData(result) {
  if (!result?.ok || !result.value || typeof result.value.data !== 'function') return null;
  return result.value.exists === false ? {} : (result.value.data() || {});
}

/** Normalizes a descriptor, filling defaults so the UI never has to guess. */
function service(descriptor) {
  const state = descriptor.state || STATE.UNKNOWN;
  return Object.freeze({
    id: descriptor.id,
    name: descriptor.name,
    group: descriptor.group,
    state,
    support: descriptor.support || (state === STATE.NOT_SUPPORTED ? 'NOT_SUPPORTED' : 'SUPPORTED'),
    enabled: descriptor.enabled === undefined ? state !== STATE.DISABLED : descriptor.enabled === true,
    configuration: descriptor.configuration || CONFIG.UNKNOWN,
    critical: descriptor.critical === true,
    reason: descriptor.reason || '',
    dependency: descriptor.dependency || 'None',
    retryable: descriptor.retryable === true,
    errorCategory: descriptor.errorCategory || null,
    remediation: descriptor.remediation || '',
    affectedFeatures: descriptor.affectedFeatures || [],
    affectedApis: descriptor.affectedApis || [],
    affectedUiModules: descriptor.affectedUiModules || [],
    metrics: descriptor.metrics || {},
    testable: descriptor.testable === true,
    checkedAt: descriptor.checkedAt || nowIso(),
    docsHref: descriptor.docsHref || null,
  });
}

function worstState(states) {
  let worst = STATE.OPERATIONAL;
  for (const candidate of states) {
    if ((SEVERITY_ORDER[candidate] ?? 0) > (SEVERITY_ORDER[worst] ?? 0)) worst = candidate;
  }
  return worst;
}

/* ────────────────────────────────────────────────────────────────────────────
   Configuration resolution (no secret values leave this module)
   ──────────────────────────────────────────────────────────────────────────── */

function resolvePaymentProviders(providerDoc, legacySubscriptions, publicConfig) {
  const stored = providerDoc || {};
  const legacy = legacySubscriptions || {};
  const publicSubs = publicConfig?.subscriptions || {};

  const toggle = (key, fallback) => {
    if (publicSubs[key] !== undefined) return publicSubs[key] === true;
    if (legacy[key] !== undefined) return legacy[key] === true;
    return fallback;
  };

  return {
    stripe: {
      name: 'Stripe',
      credentialed: truthy(stored.stripe?.secretKey) || truthy(process.env.STRIPE_SECRET),
      webhook: truthy(process.env.STRIPE_WEBHOOK_SECRET),
      adminEnabled: toggle('stripeEnabled', true),
      environment: String(process.env.STRIPE_SECRET || '').startsWith('sk_live') ? 'live' : 'test',
      apis: ['/api/pay', '/api/stripe-webhook'],
    },
    paypal: {
      name: 'PayPal',
      credentialed: (truthy(stored.paypal?.clientId) && truthy(stored.paypal?.clientSecret))
        || (truthy(process.env.PAYPAL_CLIENT_ID) && truthy(process.env.PAYPAL_CLIENT_SECRET))
        || (truthy(legacy.paypalClientId) && truthy(legacy.paypalClientSecret)),
      partial: truthy(stored.paypal?.clientId) || truthy(process.env.PAYPAL_CLIENT_ID) || truthy(legacy.paypalClientId),
      adminEnabled: toggle('paypalEnabled', true),
      environment: String(process.env.PAYPAL_ENV || stored.paypal?.environment || 'sandbox').toLowerCase(),
      apis: ['/api/paypal/create-order', '/api/paypal/verify'],
    },
    razorpay: {
      name: 'Razorpay',
      credentialed: (truthy(stored.razorpay?.keyId) && truthy(stored.razorpay?.keySecret))
        || (truthy(process.env.RAZORPAY_KEY_ID) && truthy(process.env.RAZORPAY_KEY_SECRET)),
      partial: truthy(stored.razorpay?.keyId) || truthy(process.env.RAZORPAY_KEY_ID),
      adminEnabled: toggle('razorpayEnabled', true),
      environment: String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live') ? 'live' : 'test',
      apis: ['/api/razorpay/create-order', '/api/razorpay/verify'],
    },
    paytm: {
      name: 'PayTM',
      credentialed: (truthy(stored.paytm?.mid) && truthy(stored.paytm?.merchantKey))
        || (truthy(process.env.PAYTM_MID) && truthy(process.env.PAYTM_MERCHANT_KEY))
        || (truthy(legacy.paytmMid) && truthy(legacy.paytmMerchantKey)),
      partial: truthy(stored.paytm?.mid) || truthy(process.env.PAYTM_MID) || truthy(legacy.paytmMid),
      adminEnabled: toggle('paytmEnabled', false),
      environment: String(process.env.PAYTM_ENV || 'staging').toLowerCase(),
      apis: ['/api/paytm/initiate-transaction', '/api/paytm/verify'],
    },
    phonepe: {
      name: 'PhonePe',
      credentialed: (truthy(stored.phonepe?.merchantId) && truthy(stored.phonepe?.saltKey))
        || (truthy(process.env.PHONEPE_MERCHANT_ID) && truthy(process.env.PHONEPE_SALT_KEY))
        || (truthy(legacy.phonepeId) && truthy(legacy.phonepeSaltKey)),
      partial: truthy(stored.phonepe?.merchantId) || truthy(process.env.PHONEPE_MERCHANT_ID) || truthy(legacy.phonepeId),
      adminEnabled: toggle('phonepeEnabled', false),
      environment: String(process.env.PHONEPE_ENV || 'sandbox').toLowerCase(),
      apis: ['/api/phonepe/initiate-payment', '/api/phonepe/status'],
    },
  };
}

function resolveOAuthProviders(oauthDoc, adminConfiguration, legacySystemSettings, publicConfig) {
  const secrets = oauthDoc || {};
  const canonical = adminConfiguration?.socialAuth || {};
  const legacy = legacySystemSettings?.socialAuth || {};
  const modules = publicConfig?.modules || {};

  const build = (provider, envPrefix, legacyPrefix, moduleKeys) => {
    const clientId = secrets[provider]?.clientId || canonical[`${legacyPrefix}ClientId`] || legacy[`${legacyPrefix}ClientId`] || process.env[`${envPrefix}_CLIENT_ID`] || '';
    const clientSecret = secrets[provider]?.clientSecret || canonical[`${legacyPrefix}ClientSecret`] || legacy[`${legacyPrefix}ClientSecret`] || process.env[`${envPrefix}_CLIENT_SECRET`] || '';
    let adminEnabled = true;
    for (const key of moduleKeys) {
      if (modules[key] !== undefined) { adminEnabled = modules[key] === true; break; }
      if (canonical[key] !== undefined) { adminEnabled = canonical[key] === true; break; }
    }
    return {
      credentialed: truthy(clientId) && truthy(clientSecret),
      partial: truthy(clientId) || truthy(clientSecret),
      adminEnabled,
    };
  };

  return {
    github: build('github', 'GITHUB', 'github', ['enableGithubAuthModule', 'enableGithubLogin']),
    linkedin: build('linkedin', 'LINKEDIN', 'linkedin', ['enableLinkedinAuthModule', 'enableLinkedinLogin']),
  };
}

function resolveSmtp(emailConfig) {
  const smtp = emailConfig?.smtp || {};
  const fallback = emailConfig?.fallbackSmtp || {};
  return {
    host: String(smtp.host || '').slice(0, 120),
    port: Number(smtp.port) || null,
    encryption: String(smtp.encryption || '').toLowerCase() || null,
    credentialed: truthy(smtp.username) && truthy(smtp.password),
    partial: truthy(smtp.username) || truthy(smtp.password),
    fallbackEnabled: fallback.enabled === true,
    fallbackCredentialed: truthy(fallback.username) && truthy(fallback.password),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Outbox / queue inspection
   ──────────────────────────────────────────────────────────────────────────── */

const OUTBOX_SAMPLE_LIMIT = 200;

async function inspectNotificationOutbox(db) {
  if (!db) return { available: false, reason: 'Firestore is unavailable, so the outbox cannot be inspected.' };
  const snapshot = await db.collection('notification_outbox').limit(OUTBOX_SAMPLE_LIMIT).get();
  const stats = {
    available: true,
    inspected: 0,
    queued: 0,
    delivered: 0,
    deadLetter: 0,
    retrying: 0,
    lastErrorCategory: null,
    oldestQueuedAt: null,
  };
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    stats.inspected += 1;
    const attempts = Number(data.attemptCount || 0);
    if (data.state === 'DEAD_LETTER' || attempts >= 5) {
      stats.deadLetter += 1;
      if (data.lastError && !stats.lastErrorCategory) stats.lastErrorCategory = categorizeError(String(data.lastError));
    } else if (data.providerAccepted === true) {
      stats.delivered += 1;
    } else {
      stats.queued += 1;
      if (attempts > 0) stats.retrying += 1;
      const created = data.createdAt?.toDate?.();
      if (created && (!stats.oldestQueuedAt || created < stats.oldestQueuedAt)) stats.oldestQueuedAt = created;
    }
  });
  if (stats.oldestQueuedAt) stats.oldestQueuedAt = stats.oldestQueuedAt.toISOString();
  return stats;
}

/** Maps a provider failure string onto a stable, secret-free error category. */
function categorizeError(message) {
  const value = String(message || '').toLowerCase();
  if (/timeout|etimedout|timed out/.test(value)) return 'TIMEOUT';
  if (/econnrefused|enotfound|eai_again|socket|network|unreachable/.test(value)) return 'NETWORK_UNREACHABLE';
  if (/auth|credential|invalid login|535|password/.test(value)) return 'AUTHENTICATION_REJECTED';
  if (/quota|rate limit|429|throttl/.test(value)) return 'RATE_LIMITED';
  if (/permission|forbidden|403/.test(value)) return 'AUTHORIZATION_DENIED';
  if (/not found|404/.test(value)) return 'ROUTE_OR_RESOURCE_MISSING';
  if (/certificate|tls|ssl/.test(value)) return 'TLS_FAILURE';
  if (/index/.test(value)) return 'DATASTORE_INDEX_MISSING';
  return 'PROVIDER_ERROR';
}

/* ────────────────────────────────────────────────────────────────────────────
   Snapshot construction
   ──────────────────────────────────────────────────────────────────────────── */

async function loadEmailConfig(db) {
  // Loaded lazily so the health module never participates in a require cycle.
  const emailRoutes = require('../routes/email');
  if (typeof emailRoutes.getEmailConfig !== 'function') throw new Error('Email configuration resolver is unavailable');
  return emailRoutes.getEmailConfig(db);
}

async function buildServices(app) {
  const db = app?.get?.('db') || null;
  const admin = app?.get?.('firebaseAdmin') || null;
  const tenantService = app?.get?.('tenantService') || null;
  const checkedAt = nowIso();

  const enterpriseEnabled = String(process.env.ENTERPRISE_TENANCY_ENABLED || '').toLowerCase() === 'true';

  const [
    firestorePing,
    authProbe,
    paymentDoc,
    oauthDoc,
    adminConfigDoc,
    publicConfigDoc,
    legacySystemDoc,
    legacySubscriptionsDoc,
    maintenanceDoc,
    outbox,
    emailConfig,
    enterpriseOutbox,
  ] = await Promise.all([
    observe('firestore.ping', async () => {
      if (!db) throw Object.assign(new Error('Firestore client is not initialized'), { code: 'FIRESTORE_UNINITIALIZED' });
      await db.collection('settings').doc('system_ping_check').set(
        { lastPing: admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date() },
        { merge: true },
      );
      return true;
    }),
    observe('auth.probe', async () => {
      if (!admin?.auth) throw Object.assign(new Error('Firebase Admin auth is not initialized'), { code: 'AUTH_UNINITIALIZED' });
      const result = await admin.auth().listUsers(1);
      return { reachable: true, sampled: Array.isArray(result?.users) ? result.users.length : 0 };
    }),
    observe('settings.payment_providers', () => (db ? db.collection('settings').doc('payment_providers').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('settings.oauth_providers', () => (db ? db.collection('settings').doc('oauth_providers').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('settings.admin_configuration', () => (db ? db.collection('settings').doc('admin_configuration').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('data.public_config', () => (db ? db.collection('data').doc('public_config').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('data.system_settings', () => (db ? db.collection('data').doc('system_settings').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('data.subscriptions', () => (db ? db.collection('data').doc('subscriptions').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('settings.maintenance', () => (db ? db.collection('settings').doc('maintenance').get() : Promise.reject(new Error('Firestore unavailable')))),
    observe('notification_outbox', () => inspectNotificationOutbox(db)),
    observe('email.config', () => loadEmailConfig(db)),
    observe('enterprise.outbox', async () => {
      const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');
      return getOutboxStatus({ db, admin, signingSecret: process.env.TENANT_JOB_SIGNING_SECRET || null });
    }),
  ]);

  const publicConfig = docData(publicConfigDoc) || {};
  const payments = resolvePaymentProviders(docData(paymentDoc), docData(legacySubscriptionsDoc), publicConfig);
  const oauth = resolveOAuthProviders(docData(oauthDoc), docData(adminConfigDoc), docData(legacySystemDoc), publicConfig);
  const smtp = emailConfig.ok ? resolveSmtp(emailConfig.value) : null;
  const maintenance = docData(maintenanceDoc) || {};
  const maintenanceEnabled = maintenance.enabled === true || publicConfig?.systemHealth?.maintenanceMode === true;
  const enterpriseRuntime = tenantService?.describeRuntime ? tenantService.describeRuntime() : null;
  const outboxStats = outbox.ok ? outbox.value : { available: false };
  const services = [];

  /* ── Core platform ─────────────────────────────────────────────────────── */

  const memory = process.memoryUsage();
  const heapRatio = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0;
  services.push(service({
    id: 'backend-api',
    name: 'Backend API',
    group: GROUP.CORE,
    critical: true,
    state: heapRatio > 0.95 ? STATE.DEGRADED : STATE.OPERATIONAL,
    configuration: CONFIG.CONFIGURED,
    reason: heapRatio > 0.95
      ? 'The API process is serving requests but heap utilisation is above 95%.'
      : 'This response was produced by the API process, so the HTTP surface is serving requests.',
    dependency: 'Node.js runtime',
    remediation: heapRatio > 0.95 ? 'Inspect memory pressure and restart the PM2 process during a maintenance window.' : '',
    metrics: {
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      rssMb: Math.round(memory.rss / 1024 / 1024),
    },
    affectedFeatures: ['Every authenticated API call'],
    affectedUiModules: ['/adm', '/enterprise', '/dashboard'],
    lastCheckedAt: checkedAt,
  }));

  const firebaseConfigured = Boolean(db && admin);
  services.push(service({
    id: 'firebase',
    name: 'Firebase',
    group: GROUP.CORE,
    critical: true,
    state: firebaseConfigured ? STATE.OPERATIONAL : STATE.UNAVAILABLE,
    configuration: firebaseConfigured ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: firebaseConfigured
      ? 'The Firebase Admin SDK is initialised with project credentials in this process.'
      : 'The Firebase Admin SDK is not initialised, so no server-side Firebase call can succeed.',
    dependency: 'Firebase Admin credentials (Workload Identity or service account)',
    retryable: false,
    errorCategory: firebaseConfigured ? null : 'CONFIGURATION_MISSING',
    remediation: firebaseConfigured ? '' : 'Provide FIREBASE_USE_ADC or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY to the backend and restart the process.',
    affectedFeatures: ['Authentication', 'All persistence', 'Admin console data'],
    affectedApis: ['/api/admin/*', '/api/platform/*', '/api/enterprise/*'],
    affectedUiModules: ['/adm', '/enterprise', '/dashboard'],
    metrics: { projectConfigured: firebaseConfigured },
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'firestore',
    name: 'Firestore',
    group: GROUP.CORE,
    critical: true,
    state: firestorePing.ok ? (firestorePing.latencyMs > 1500 ? STATE.DEGRADED : STATE.OPERATIONAL) : STATE.UNAVAILABLE,
    configuration: firebaseConfigured ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: firestorePing.ok
      ? (firestorePing.latencyMs > 1500
        ? `A write probe succeeded but took ${firestorePing.latencyMs}ms, which is above the 1500ms threshold.`
        : `A write probe to settings/system_ping_check succeeded in ${firestorePing.latencyMs}ms.`)
      : `A write probe to settings/system_ping_check failed: ${firestorePing.error}`,
    dependency: 'Google Cloud Firestore',
    retryable: true,
    testable: true,
    errorCategory: firestorePing.ok ? null : categorizeError(firestorePing.error),
    remediation: firestorePing.ok ? '' : 'Verify Firestore rules, quota, and the service account IAM bindings for this project.',
    affectedFeatures: ['Resumes', 'Users', 'Audit logs', 'Settings', 'Enterprise tenancy'],
    affectedApis: ['/api/admin/*', '/api/platform/*'],
    affectedUiModules: ['/adm', '/dashboard'],
    metrics: { latencyMs: firestorePing.ok ? firestorePing.latencyMs : null, provider: 'Google Cloud Firestore' },
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'authentication',
    name: 'Authentication',
    group: GROUP.CORE,
    critical: true,
    state: authProbe.ok ? STATE.OPERATIONAL : (firebaseConfigured ? STATE.DEGRADED : STATE.UNAVAILABLE),
    configuration: firebaseConfigured ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: authProbe.ok
      ? `Firebase Identity responded to a directory probe in ${authProbe.latencyMs}ms.`
      : `The Firebase Identity directory probe failed: ${authProbe.error}`,
    dependency: 'Firebase Authentication',
    retryable: true,
    testable: true,
    errorCategory: authProbe.ok ? null : categorizeError(authProbe.error),
    remediation: authProbe.ok ? '' : 'Confirm the service account holds the Firebase Authentication Admin role and that the Identity Toolkit API is enabled.',
    affectedFeatures: ['Sign-in', 'Admin console access', 'Token verification', 'Custom claims'],
    affectedApis: ['/api/auth/*', 'Every authenticated route'],
    affectedUiModules: ['/login', '/adm', '/enterprise'],
    metrics: { latencyMs: authProbe.ok ? authProbe.latencyMs : null, mfaRequiredForSuperAdmin: process.env.SUPER_ADMIN_MFA_REQUIRED === 'false' ? false : (process.env.SUPER_ADMIN_MFA_REQUIRED === 'true' || process.env.NODE_ENV === 'production') },
    lastCheckedAt: checkedAt,
  }));

  const encryption = enterpriseRuntime?.encryption || null;
  const encryptionConfigured = encryption?.configured === true;
  services.push(service({
    id: 'encryption',
    name: 'Encryption',
    group: GROUP.CORE,
    critical: enterpriseEnabled,
    state: encryptionConfigured ? STATE.OPERATIONAL : (enterpriseEnabled ? STATE.UNAVAILABLE : STATE.NOT_CONFIGURED),
    configuration: encryptionConfigured ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    enabled: encryptionConfigured,
    reason: encryptionConfigured
      ? `Envelope encryption is active using the ${encryption.provider} provider (${encryption.securityLevel}).`
      : 'No enterprise encryption key is configured; encrypted resource writes fail closed.',
    dependency: 'ENTERPRISE_ENCRYPTION_KEY / ENTERPRISE_ENCRYPTION_KEYS',
    retryable: false,
    errorCategory: encryptionConfigured ? null : 'CONFIGURATION_MISSING',
    remediation: encryptionConfigured ? '' : 'Generate a 32-byte base64 key and set ENTERPRISE_ENCRYPTION_KEY, then restart the backend.',
    affectedFeatures: ['Enterprise resource payload encryption', 'Tenant data at rest'],
    affectedApis: ['/api/enterprise/resources', '/api/platform/encryption'],
    affectedUiModules: ['/enterprise', '/adm/operations'],
    metrics: {
      provider: encryption?.provider || 'none',
      securityLevel: encryption?.securityLevel || 'ENCRYPTION_UNAVAILABLE_FAIL_CLOSED',
      activeVersion: encryption?.activeVersion || null,
    },
    lastCheckedAt: checkedAt,
  }));

  const tenancyConfigured = enterpriseRuntime?.dataPlaneConfigured === true;
  services.push(service({
    id: 'enterprise-tenancy',
    name: 'Enterprise Tenancy',
    group: GROUP.CORE,
    critical: false,
    state: !enterpriseEnabled
      ? STATE.DISABLED
      : (tenancyConfigured ? STATE.OPERATIONAL : STATE.UNAVAILABLE),
    enabled: enterpriseEnabled,
    configuration: !enterpriseEnabled
      ? CONFIG.DISABLED_BY_CONFIGURATION
      : (tenancyConfigured ? CONFIG.CONFIGURED : CONFIG.PARTIALLY_CONFIGURED),
    reason: !enterpriseEnabled
      ? 'ENTERPRISE_TENANCY_ENABLED is false, so every /api/enterprise route intentionally answers 404. This is a deliberate rollout gate, not an outage.'
      : (tenancyConfigured
        ? `The tenant control plane is live on the ${enterpriseRuntime.dataProvider} data provider.`
        : `Enterprise tenancy is enabled but the data plane is not constructed: ${enterpriseRuntime?.error || 'repository unavailable'}`),
    dependency: 'ENTERPRISE_TENANCY_ENABLED + Firestore tenant repository',
    retryable: false,
    errorCategory: !enterpriseEnabled ? null : (tenancyConfigured ? null : 'CONFIGURATION_MISSING'),
    remediation: !enterpriseEnabled
      ? 'Set ENTERPRISE_TENANCY_ENABLED=true (backend) and VITE_ENTERPRISE_TENANCY_ENABLED=true (frontend) once the rollout gates are approved.'
      : (tenancyConfigured ? '' : 'Provide the Firestore tenant repository configuration and the enterprise encryption key, then restart the backend.'),
    affectedFeatures: ['Tenant provisioning', 'Workspaces', 'Tenant memberships', 'Tenant audit'],
    affectedApis: ['/api/enterprise/platform/tenants', '/api/enterprise/tenants', '/api/enterprise/memberships'],
    affectedUiModules: ['/adm/tenants', '/enterprise'],
    metrics: {
      dataProvider: enterpriseRuntime?.dataProvider || 'unavailable',
      dataPlaneConfigured: tenancyConfigured,
      quotaStore: enterpriseRuntime?.quotaStore || 'unavailable',
    },
    lastCheckedAt: checkedAt,
  }));

  const consumerBlocked = maintenanceEnabled;
  services.push(service({
    id: 'consumer-platform',
    name: 'Consumer Platform',
    group: GROUP.CORE,
    critical: true,
    state: !firebaseConfigured ? STATE.UNAVAILABLE : (consumerBlocked ? STATE.DEGRADED : STATE.OPERATIONAL),
    configuration: CONFIG.CONFIGURED,
    reason: !firebaseConfigured
      ? 'The consumer product depends on Firebase, which is not initialised.'
      : (consumerBlocked
        ? 'Maintenance mode is enabled, so non-admin visitors are shown the maintenance banner instead of the product.'
        : 'Maintenance mode is off and the consumer data plane is reachable.'),
    dependency: 'Firebase + maintenance flag',
    retryable: false,
    remediation: consumerBlocked ? 'Disable maintenance mode in Platform Operations when the window closes.' : '',
    affectedFeatures: ['Resume builder', 'Portfolio', 'Job tracker', 'Checkout'],
    affectedApis: ['/api/export', '/api/generate-resume'],
    affectedUiModules: ['/dashboard', '/build-resume'],
    metrics: { maintenanceMode: maintenanceEnabled },
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'admin-platform',
    name: 'Admin Platform',
    group: GROUP.CORE,
    critical: true,
    state: firestorePing.ok && authProbe.ok ? STATE.OPERATIONAL : (firebaseConfigured ? STATE.DEGRADED : STATE.UNAVAILABLE),
    configuration: CONFIG.CONFIGURED,
    reason: firestorePing.ok && authProbe.ok
      ? 'Administrative reads verified Firestore and the identity directory during this check.'
      : 'One or more administrative dependencies (Firestore, identity directory) failed their probe.',
    dependency: 'Firestore + Firebase Authentication custom claims',
    retryable: true,
    affectedFeatures: ['Users manager', 'Settings', 'Audit trail', 'Queue monitor'],
    affectedApis: ['/api/admin/*', '/api/platform/*'],
    affectedUiModules: ['/adm'],
    metrics: { rbacModel: 'Firebase custom claims (ADMIN / SUPER_ADMIN / SUPPORT)' },
    lastCheckedAt: checkedAt,
  }));

  const mfaEnforced = process.env.SUPER_ADMIN_MFA_REQUIRED === 'false'
    ? false
    : (process.env.SUPER_ADMIN_MFA_REQUIRED === 'true' || process.env.NODE_ENV === 'production');
  services.push(service({
    id: 'super-admin-platform',
    name: 'Super Admin Platform',
    group: GROUP.CORE,
    critical: true,
    state: firestorePing.ok && authProbe.ok ? STATE.OPERATIONAL : (firebaseConfigured ? STATE.DEGRADED : STATE.UNAVAILABLE),
    configuration: CONFIG.CONFIGURED,
    reason: firestorePing.ok && authProbe.ok
      ? `Super Admin control-plane dependencies responded. Destructive operations ${mfaEnforced ? 'require' : 'do not currently require'} a second factor.`
      : 'Super Admin control-plane dependencies did not all respond to their probes.',
    dependency: 'Firebase Authentication second factor + Firestore',
    retryable: true,
    affectedFeatures: ['Tenant decommission', 'Operator role changes', 'Maintenance mode', 'DLQ replay'],
    affectedApis: ['/api/platform/operators', '/api/platform/maintenance', '/api/platform/tenants/:id/decommission'],
    affectedUiModules: ['/adm/operators', '/adm/operations', '/adm/tenants'],
    metrics: { mfaEnforced },
    lastCheckedAt: checkedAt,
  }));

  /* ── External integrations ─────────────────────────────────────────────── */

  const emailAffectedFeatures = [
    'Password reset emails',
    'Email verification',
    'Job application notifications',
    'Security alerts',
    'Invoice delivery',
  ];
  const emailAffectedApis = [
    '/api/email/send-email',
    '/api/notify/user-signup',
    '/api/notify/job-application',
    '/api/notify/security-alert',
    '/api/send-invoice-email',
  ];

  if (!emailConfig.ok) {
    services.push(service({
      id: 'email-smtp',
      name: 'Email / SMTP',
      group: GROUP.INTEGRATIONS,
      critical: true,
      state: STATE.UNKNOWN,
      configuration: CONFIG.UNKNOWN,
      reason: `The SMTP configuration could not be read: ${emailConfig.error}`,
      dependency: 'SMTP relay',
      retryable: true,
      testable: true,
      errorCategory: categorizeError(emailConfig.error),
      remediation: 'Check the backend email configuration source (Firestore data/system_settings or the local mail config file).',
      affectedFeatures: emailAffectedFeatures,
      affectedApis: emailAffectedApis,
      affectedUiModules: ['/adm/settings?tab=emailSettings'],
      lastCheckedAt: checkedAt,
    }));
  } else {
    const deadLetters = outboxStats.available ? outboxStats.deadLetter : null;
    let emailState = STATE.OPERATIONAL;
    let emailReason = `SMTP credentials are configured for ${smtp.host}:${smtp.port} over ${smtp.encryption}. No dead-letter deliveries were found in the inspected outbox sample.`;
    let emailCategory = null;
    if (!smtp.credentialed) {
      emailState = smtp.partial ? STATE.DEGRADED : STATE.NOT_CONFIGURED;
      emailReason = smtp.partial
        ? 'SMTP is partially configured: a username or password is missing, so authenticated delivery will fail.'
        : 'No SMTP credentials are configured, so outbound mail cannot be delivered.';
      emailCategory = 'CONFIGURATION_MISSING';
    } else if (deadLetters === null) {
      emailState = STATE.UNKNOWN;
      emailReason = 'SMTP credentials are configured but the notification outbox could not be inspected, so delivery health is unknown.';
      emailCategory = 'DATA_UNAVAILABLE';
    } else if (deadLetters > 0) {
      emailState = STATE.DEGRADED;
      emailReason = `SMTP credentials are configured but ${deadLetters} notification(s) exhausted their retries in the inspected sample of ${outboxStats.inspected}.`;
      emailCategory = outboxStats.lastErrorCategory || 'PROVIDER_ERROR';
    }
    services.push(service({
      id: 'email-smtp',
      name: 'Email / SMTP',
      group: GROUP.INTEGRATIONS,
      critical: true,
      state: emailState,
      configuration: smtp.credentialed ? CONFIG.CONFIGURED : (smtp.partial ? CONFIG.PARTIALLY_CONFIGURED : CONFIG.NOT_CONFIGURED),
      enabled: smtp.credentialed,
      reason: emailReason,
      dependency: `SMTP relay (${smtp.host || 'not set'})`,
      retryable: true,
      testable: true,
      errorCategory: emailCategory,
      remediation: emailState === STATE.OPERATIONAL
        ? ''
        : (smtp.credentialed
          ? 'Run the SMTP connection test, then replay dead-letter notifications from the Queue & DLQ monitor.'
          : 'Add the SMTP host, port, username, and password in Admin → Settings → Email & SMTP.'),
      affectedFeatures: emailAffectedFeatures,
      affectedApis: emailAffectedApis,
      affectedUiModules: ['/adm/settings?tab=emailSettings', '/adm/queues'],
      metrics: {
        host: smtp.host || null,
        port: smtp.port,
        encryption: smtp.encryption,
        credentialsConfigured: smtp.credentialed,
        fallbackRelayEnabled: smtp.fallbackEnabled,
        fallbackRelayConfigured: smtp.fallbackCredentialed,
        deadLetterSample: deadLetters,
      },
      lastCheckedAt: checkedAt,
    }));
  }

  const dispatcherWorkerLocal = envFlag('NOTIFICATION_OUTBOX_WORKER_ENABLED');
  const dispatcherWorkerExternal = envFlag('NOTIFICATION_OUTBOX_EXTERNAL_WORKER');
  const dispatcherRunning = dispatcherWorkerLocal || dispatcherWorkerExternal;
  let dispatcherState = STATE.DISABLED;
  let dispatcherReason = 'No notification outbox worker is enabled in this deployment, so queued notifications are stored durably but never dispatched.';
  if (dispatcherRunning && !outboxStats.available) {
    dispatcherState = STATE.UNKNOWN;
    dispatcherReason = 'A notification worker is declared but the outbox could not be inspected, so dispatch health is unknown.';
  } else if (dispatcherRunning && outboxStats.deadLetter > 0) {
    dispatcherState = STATE.DEGRADED;
    dispatcherReason = `The dispatcher is enabled but ${outboxStats.deadLetter} notification(s) reached the dead-letter state in the inspected sample.`;
  } else if (dispatcherRunning) {
    dispatcherState = STATE.OPERATIONAL;
    dispatcherReason = `The ${dispatcherWorkerLocal ? 'in-process' : 'external'} notification worker is enabled and no dead letters were found in the inspected sample.`;
  }
  services.push(service({
    id: 'notification-dispatcher',
    name: 'Notification Dispatcher',
    group: GROUP.INTEGRATIONS,
    critical: false,
    state: dispatcherState,
    enabled: dispatcherRunning,
    configuration: dispatcherRunning ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION,
    reason: dispatcherReason,
    dependency: 'Firestore notification_outbox + SMTP',
    retryable: dispatcherRunning,
    errorCategory: dispatcherState === STATE.DEGRADED ? (outboxStats.lastErrorCategory || 'PROVIDER_ERROR') : null,
    remediation: dispatcherRunning
      ? 'Replay dead letters from the Queue & DLQ monitor after confirming the SMTP provider test passes.'
      : 'Set NOTIFICATION_OUTBOX_WORKER_ENABLED=true on a worker-capable instance, or declare NOTIFICATION_OUTBOX_EXTERNAL_WORKER=true.',
    affectedFeatures: ['Transactional email delivery', 'Retry and dead-letter handling'],
    affectedApis: ['/api/notify/*', '/api/platform/queues'],
    affectedUiModules: ['/adm/queues'],
    metrics: {
      localWorkerEnabled: dispatcherWorkerLocal,
      externalWorkerDeclared: dispatcherWorkerExternal,
      queued: outboxStats.available ? outboxStats.queued : null,
      delivered: outboxStats.available ? outboxStats.delivered : null,
      deadLetter: outboxStats.available ? outboxStats.deadLetter : null,
      inspected: outboxStats.available ? outboxStats.inspected : null,
    },
    lastCheckedAt: checkedAt,
  }));

  const oauthDescriptors = [
    {
      id: 'github-oauth', name: 'GitHub OAuth', key: 'github',
      apis: ['/api/auth/github', '/api/auth/github/callback', '/api/auth/oauth/exchange'],
      features: ['Continue with GitHub sign-in', 'GitHub account linking'],
      ui: ['/login', '/register', '/adm/settings?tab=socialAuthSettings'],
      envHint: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET',
    },
    {
      id: 'linkedin-oauth', name: 'LinkedIn OAuth', key: 'linkedin',
      apis: ['/api/auth/linkedin', '/api/auth/linkedin/callback', '/api/auth/oauth/exchange'],
      features: ['Continue with LinkedIn sign-in', 'LinkedIn account linking'],
      ui: ['/login', '/register', '/adm/settings?tab=socialAuthSettings'],
      envHint: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET',
    },
  ];
  for (const descriptor of oauthDescriptors) {
    const provider = oauth[descriptor.key];
    let state = STATE.OPERATIONAL;
    let reason = 'Client credentials are configured and the provider is enabled, so the redirect flow is available.';
    let configuration = CONFIG.CONFIGURED;
    let category = null;
    if (!provider.adminEnabled) {
      state = STATE.DISABLED;
      configuration = CONFIG.DISABLED_BY_CONFIGURATION;
      reason = 'The provider is switched off in Admin → Settings → Social Sign-On, so the button is intentionally hidden from the sign-in UI.';
    } else if (!provider.credentialed) {
      state = STATE.NOT_CONFIGURED;
      configuration = provider.partial ? CONFIG.PARTIALLY_CONFIGURED : CONFIG.NOT_CONFIGURED;
      reason = provider.partial
        ? 'Only one half of the OAuth client credential pair is present, so the authorization redirect will fail with 503.'
        : 'No OAuth client credentials are configured, so the provider endpoint answers 503 and the button is hidden.';
      category = 'CONFIGURATION_MISSING';
    }
    services.push(service({
      id: descriptor.id,
      name: descriptor.name,
      group: GROUP.INTEGRATIONS,
      critical: false,
      state,
      enabled: provider.adminEnabled,
      configuration,
      reason,
      dependency: `${descriptor.name} authorization server`,
      retryable: false,
      errorCategory: category,
      remediation: state === STATE.OPERATIONAL
        ? ''
        : (provider.adminEnabled
          ? `Add ${descriptor.envHint} (or the equivalent Firestore oauth_providers entry) and restart the backend.`
          : 'Enable the provider in Admin → Settings → Social Sign-On & OAuth if it should be offered to users.'),
      affectedFeatures: descriptor.features,
      affectedApis: descriptor.apis,
      affectedUiModules: descriptor.ui,
      metrics: { credentialsConfigured: provider.credentialed, providerEnabled: provider.adminEnabled },
      lastCheckedAt: checkedAt,
    }));
  }

  for (const [key, provider] of Object.entries(payments)) {
    let state = STATE.OPERATIONAL;
    let configuration = CONFIG.CONFIGURED;
    let reason = `Credentials are configured (${provider.environment} environment) and the gateway is enabled for checkout.`;
    let category = null;
    if (!provider.adminEnabled) {
      state = STATE.DISABLED;
      configuration = provider.credentialed ? CONFIG.DISABLED_BY_CONFIGURATION : CONFIG.NOT_CONFIGURED;
      reason = provider.credentialed
        ? 'The gateway is credentialed but switched off for checkout, so it is intentionally hidden from the payment UI.'
        : 'The gateway is switched off for checkout and has no credentials configured.';
    } else if (!provider.credentialed) {
      state = STATE.NOT_CONFIGURED;
      configuration = provider.partial ? CONFIG.PARTIALLY_CONFIGURED : CONFIG.NOT_CONFIGURED;
      reason = provider.partial
        ? 'The gateway is enabled but only part of its credential pair is present, so order creation returns 503.'
        : 'The gateway is enabled for checkout but no credentials are configured, so order creation returns 503.';
      category = 'CONFIGURATION_MISSING';
    }
    services.push(service({
      id: `payments-${key}`,
      name: provider.name,
      group: GROUP.INTEGRATIONS,
      critical: false,
      state,
      enabled: provider.adminEnabled,
      configuration,
      reason,
      dependency: `${provider.name} payment gateway`,
      retryable: false,
      errorCategory: category,
      remediation: state === STATE.OPERATIONAL
        ? ''
        : (provider.adminEnabled
          ? `Add the ${provider.name} credentials in Admin → Settings → Subscriptions & Gateways.`
          : `Enable ${provider.name} in Admin → Settings → Subscriptions & Gateways if it should be offered at checkout.`),
      affectedFeatures: [`${provider.name} checkout`, 'Subscription upgrades', 'Invoice generation'],
      affectedApis: provider.apis,
      affectedUiModules: ['/plans', '/adm/settings?tab=subscriptionsSettings'],
      metrics: {
        credentialsConfigured: provider.credentialed,
        gatewayEnabled: provider.adminEnabled,
        environment: provider.environment,
        webhookSecretConfigured: provider.webhook === undefined ? null : provider.webhook,
      },
      lastCheckedAt: checkedAt,
    }));
  }

  const twilio = docData(adminConfigDoc)?.twilio || {};
  const twilioLegacy = docData(legacySystemDoc)?.twilio || {};
  const twilioCredentialed = truthy(twilio.accountSid || process.env.TWILIO_ACCOUNT_SID || twilioLegacy.accountSid)
    && truthy(twilio.authToken || process.env.TWILIO_AUTH_TOKEN || twilioLegacy.authToken);
  const twilioEnabled = twilio.enableSmsAlerts !== undefined ? twilio.enableSmsAlerts === true : twilioLegacy.enableSmsAlerts === true;
  services.push(service({
    id: 'twilio-sms',
    name: 'Twilio SMS',
    group: GROUP.INTEGRATIONS,
    critical: false,
    state: !twilioEnabled ? STATE.DISABLED : (twilioCredentialed ? STATE.OPERATIONAL : STATE.NOT_CONFIGURED),
    enabled: twilioEnabled,
    configuration: twilioCredentialed
      ? (twilioEnabled ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION)
      : CONFIG.NOT_CONFIGURED,
    reason: !twilioEnabled
      ? 'SMS alerts are switched off in Admin → Settings → Twilio SMS, so no message is dispatched.'
      : (twilioCredentialed
        ? 'Twilio credentials and a sender number are configured and SMS alerts are enabled.'
        : 'SMS alerts are enabled but the Twilio Account SID, Auth Token, or sender number is missing.'),
    dependency: 'Twilio Programmable Messaging',
    retryable: false,
    errorCategory: twilioEnabled && !twilioCredentialed ? 'CONFIGURATION_MISSING' : null,
    remediation: twilioEnabled && !twilioCredentialed
      ? 'Add the Account SID, Auth Token, and E.164 sender number in Admin → Settings → Twilio SMS.'
      : '',
    affectedFeatures: ['SMS security alerts'],
    affectedApis: ['/api/send-sms'],
    affectedUiModules: ['/adm/settings?tab=twilioSmsSettings'],
    metrics: { credentialsConfigured: twilioCredentialed, smsAlertsEnabled: twilioEnabled },
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'naukri-ingestion',
    name: 'Naukri Job Ingestion',
    group: GROUP.INTEGRATIONS,
    critical: false,
    state: STATE.NOT_CONFIGURED,
    enabled: false,
    configuration: CONFIG.NOT_CONFIGURED,
    reason: 'No Naukri ingestion credential or partner feed is configured. /api/jobs/naukri deliberately answers 501 rather than returning fabricated listings.',
    dependency: 'Naukri partner feed',
    retryable: false,
    errorCategory: 'CONFIGURATION_MISSING',
    remediation: 'Configure a licensed Naukri partner feed before enabling job ingestion. No demo listings are generated.',
    affectedFeatures: ['External job ingestion'],
    affectedApis: ['/api/jobs/naukri'],
    affectedUiModules: ['/adm/settings?tab=jobScraperSettings', '/adm/jobs-manager'],
    metrics: { documentedResponse: '501 SCRAPER_NOT_CONFIGURED' },
    lastCheckedAt: checkedAt,
  }));

  const cloudflareConfigured = truthy(process.env.CLOUDFLARE_API_TOKEN) || truthy(process.env.CLOUDFLARE_ZONE_ID);
  services.push(service({
    id: 'cloudflare',
    name: 'Cloudflare',
    group: GROUP.INTEGRATIONS,
    critical: false,
    state: cloudflareConfigured ? STATE.OPERATIONAL : STATE.NOT_SUPPORTED,
    support: cloudflareConfigured ? 'SUPPORTED' : 'NOT_SUPPORTED',
    enabled: cloudflareConfigured,
    configuration: cloudflareConfigured ? CONFIG.CONFIGURED : CONFIG.NOT_APPLICABLE,
    reason: cloudflareConfigured
      ? 'Cloudflare API credentials are present in the backend environment.'
      : 'This deployment does not integrate with the Cloudflare API. Edge caching and DNS, if used, are managed outside the application.',
    dependency: 'Cloudflare API',
    retryable: false,
    remediation: '',
    affectedFeatures: [],
    affectedApis: [],
    affectedUiModules: [],
    metrics: { integrationPresent: cloudflareConfigured },
    lastCheckedAt: checkedAt,
  }));

  const aiProviders = [
    ['gemini', 'Google Gemini', 'GEMINI_API_KEY'],
    ['openai', 'OpenAI', 'OPENAI_API_KEY'],
    ['nvidia', 'NVIDIA NIM', 'NVIDIA_API_KEY'],
    ['groq', 'Groq', 'GROQ_API_KEY'],
    ['openrouter', 'OpenRouter', 'OPENROUTER_API_KEY'],
    ['deepseek', 'DeepSeek', 'DEEPSEEK_API_KEY'],
  ];
  const configuredAi = aiProviders.filter(([key, , envKey]) => truthy(process.env[envKey]) || truthy(docData(adminConfigDoc)?.ai?.[key]?.apiKey));
  services.push(service({
    id: 'ai-providers',
    name: 'AI Providers',
    group: GROUP.INTEGRATIONS,
    critical: false,
    state: configuredAi.length > 0 ? STATE.OPERATIONAL : STATE.NOT_CONFIGURED,
    enabled: configuredAi.length > 0,
    configuration: configuredAi.length > 0 ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: configuredAi.length > 0
      ? `${configuredAi.length} of ${aiProviders.length} supported AI providers hold a server-side API key.`
      : 'No AI provider API key is configured, so generation endpoints fall back to deterministic non-AI behaviour or return 503.',
    dependency: 'Third-party AI inference APIs',
    retryable: true,
    testable: true,
    errorCategory: configuredAi.length > 0 ? null : 'CONFIGURATION_MISSING',
    remediation: configuredAi.length > 0 ? '' : 'Add at least one provider key in Admin → Settings → AI & Gemini.',
    affectedFeatures: ['Resume generation', 'Summary rewriting', 'Interview coach', 'Cover letters', 'ATS scoring'],
    affectedApis: ['/api/generate-resume', '/api/generate-summary', '/api/ai/*'],
    affectedUiModules: ['/build-resume', '/adm/settings?tab=aiSettings'],
    metrics: {
      configuredProviders: configuredAi.map(([, label]) => label),
      supportedProviders: aiProviders.map(([, label]) => label),
    },
    lastCheckedAt: checkedAt,
  }));

  /* ── Workers & infrastructure ──────────────────────────────────────────── */

  const load = os.loadavg?.() || [0, 0, 0];
  services.push(service({
    id: 'backend-process',
    name: 'PM2 / Backend Process',
    group: GROUP.WORKERS,
    critical: true,
    state: STATE.OPERATIONAL,
    configuration: CONFIG.CONFIGURED,
    reason: `Process ${process.pid} has been serving for ${Math.floor(process.uptime())}s. Process liveness alone is not treated as platform health.`,
    dependency: 'PM2 process manager',
    retryable: false,
    affectedFeatures: ['All backend processing'],
    affectedApis: [],
    affectedUiModules: [],
    metrics: {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      platform: process.platform,
      arch: process.arch,
      loadAverage1m: Math.round(load[0] * 100) / 100,
      systemFreeMemMb: Math.round(os.freemem() / 1024 / 1024),
      systemTotalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    },
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'notification-outbox',
    name: 'Notification Outbox',
    group: GROUP.WORKERS,
    critical: false,
    state: !outboxStats.available
      ? STATE.UNKNOWN
      : (outboxStats.deadLetter > 0 ? STATE.DEGRADED : STATE.OPERATIONAL),
    configuration: CONFIG.CONFIGURED,
    reason: !outboxStats.available
      ? `The durable outbox could not be inspected: ${outbox.ok ? outboxStats.reason : outbox.error}`
      : (outboxStats.deadLetter > 0
        ? `${outboxStats.deadLetter} of ${outboxStats.inspected} inspected notifications exhausted their retries.`
        : `${outboxStats.inspected} notification(s) inspected; none exhausted their retries.`),
    dependency: 'Firestore notification_outbox collection',
    retryable: true,
    errorCategory: outboxStats.available && outboxStats.deadLetter > 0 ? (outboxStats.lastErrorCategory || 'PROVIDER_ERROR') : (outboxStats.available ? null : 'DATA_UNAVAILABLE'),
    remediation: outboxStats.available && outboxStats.deadLetter > 0 ? 'Open the Queue & DLQ monitor and replay the dead-letter jobs after the provider test passes.' : '',
    affectedFeatures: ['Transactional email durability'],
    affectedApis: ['/api/platform/queues', '/api/platform/queues/retry'],
    affectedUiModules: ['/adm/queues'],
    metrics: outboxStats.available
      ? { inspected: outboxStats.inspected, queued: outboxStats.queued, delivered: outboxStats.delivered, deadLetter: outboxStats.deadLetter, retrying: outboxStats.retrying, oldestQueuedAt: outboxStats.oldestQueuedAt }
      : {},
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'queue',
    name: 'Queue',
    group: GROUP.WORKERS,
    critical: false,
    state: !outboxStats.available
      ? STATE.UNKNOWN
      : (outboxStats.queued > 0 && !dispatcherRunning ? STATE.DEGRADED : STATE.OPERATIONAL),
    configuration: CONFIG.CONFIGURED,
    reason: !outboxStats.available
      ? 'Queue depth could not be read from Firestore.'
      : (outboxStats.queued > 0 && !dispatcherRunning
        ? `${outboxStats.queued} job(s) are queued but no dispatcher worker is enabled to drain them.`
        : `${outboxStats.queued} job(s) are currently queued for delivery.`),
    dependency: 'Firestore durable queue',
    retryable: true,
    errorCategory: outboxStats.available ? null : 'DATA_UNAVAILABLE',
    remediation: outboxStats.available && outboxStats.queued > 0 && !dispatcherRunning
      ? 'Enable a notification outbox worker so queued jobs are dispatched.'
      : '',
    affectedFeatures: ['Asynchronous notification delivery'],
    affectedApis: ['/api/platform/queues'],
    affectedUiModules: ['/adm/queues'],
    metrics: outboxStats.available ? { queued: outboxStats.queued, retrying: outboxStats.retrying } : {},
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'dlq',
    name: 'Dead Letter Queue',
    group: GROUP.WORKERS,
    critical: false,
    state: !outboxStats.available
      ? STATE.UNKNOWN
      : (outboxStats.deadLetter > 0 ? STATE.DEGRADED : STATE.OPERATIONAL),
    configuration: CONFIG.CONFIGURED,
    reason: !outboxStats.available
      ? 'Dead-letter depth could not be read from Firestore.'
      : (outboxStats.deadLetter > 0
        ? `${outboxStats.deadLetter} job(s) are parked in the dead-letter state and require an operator decision.`
        : 'No jobs are parked in the dead-letter state in the inspected sample.'),
    dependency: 'Firestore durable queue',
    retryable: true,
    errorCategory: outboxStats.available && outboxStats.deadLetter > 0 ? (outboxStats.lastErrorCategory || 'PROVIDER_ERROR') : (outboxStats.available ? null : 'DATA_UNAVAILABLE'),
    remediation: outboxStats.available && outboxStats.deadLetter > 0 ? 'Replay or reject the parked jobs from the Queue & DLQ monitor.' : '',
    affectedFeatures: ['Failed notification recovery'],
    affectedApis: ['/api/platform/queues/retry'],
    affectedUiModules: ['/adm/queues'],
    metrics: outboxStats.available ? { deadLetter: outboxStats.deadLetter, sampleSize: outboxStats.inspected } : {},
    lastCheckedAt: checkedAt,
  }));

  const entQueue = enterpriseOutbox.ok ? enterpriseOutbox.value : null;
  let enterpriseOutboxState = STATE.UNKNOWN;
  let enterpriseOutboxReason = `The enterprise outbox status could not be read: ${enterpriseOutbox.error || 'unknown error'}`;
  if (!enterpriseEnabled) {
    enterpriseOutboxState = STATE.DISABLED;
    enterpriseOutboxReason = 'Enterprise tenancy is disabled, so no tenant job is produced or consumed.';
  } else if (entQueue) {
    if (!entQueue.configured) {
      enterpriseOutboxState = STATE.UNAVAILABLE;
      enterpriseOutboxReason = 'The enterprise durable outbox is not configured because Firestore is unavailable to this process.';
    } else if (!entQueue.signingConfigured) {
      enterpriseOutboxState = STATE.DEGRADED;
      enterpriseOutboxReason = 'The enterprise outbox is durable but TENANT_JOB_SIGNING_SECRET is missing or shorter than 32 bytes, so job envelopes cannot be signed.';
    } else if (entQueue.deadLetterCount > 0) {
      enterpriseOutboxState = STATE.DEGRADED;
      enterpriseOutboxReason = `${entQueue.deadLetterCount} enterprise job(s) are in the dead-letter state.`;
    } else {
      enterpriseOutboxState = STATE.OPERATIONAL;
      enterpriseOutboxReason = `The enterprise durable outbox is online with ${entQueue.activeQueued} active job(s) and no dead letters.`;
    }
  }
  services.push(service({
    id: 'enterprise-outbox',
    name: 'Enterprise Outbox',
    group: GROUP.WORKERS,
    critical: false,
    state: enterpriseOutboxState,
    enabled: enterpriseEnabled,
    configuration: !enterpriseEnabled ? CONFIG.DISABLED_BY_CONFIGURATION : (entQueue?.configured ? CONFIG.CONFIGURED : CONFIG.PARTIALLY_CONFIGURED),
    reason: enterpriseOutboxReason,
    dependency: 'Firestore enterprise outbox + TENANT_JOB_SIGNING_SECRET',
    retryable: enterpriseEnabled,
    errorCategory: enterpriseOutboxState === STATE.DEGRADED ? 'CONFIGURATION_MISSING' : null,
    remediation: enterpriseOutboxState === STATE.DEGRADED
      ? 'Set a 32-byte TENANT_JOB_SIGNING_SECRET, or replay the parked tenant jobs from the Enterprise console.'
      : '',
    affectedFeatures: ['Tenant background jobs', 'Tenant exports'],
    affectedApis: ['/api/platform/enterprise-queue', '/api/enterprise/jobs'],
    affectedUiModules: ['/adm/operations', '/enterprise'],
    metrics: entQueue ? { engine: entQueue.engine, status: entQueue.status, activeQueued: entQueue.activeQueued, deadLetterCount: entQueue.deadLetterCount, signingConfigured: entQueue.signingConfigured } : {},
    lastCheckedAt: checkedAt,
  }));

  const enterpriseWorkerEnabled = envFlag('ENTERPRISE_OUTBOX_WORKER_ENABLED');
  const anyWorkerEnabled = enterpriseWorkerEnabled || dispatcherWorkerLocal;
  services.push(service({
    id: 'background-workers',
    name: 'Background Workers',
    group: GROUP.WORKERS,
    critical: false,
    state: anyWorkerEnabled ? STATE.OPERATIONAL : STATE.DISABLED,
    enabled: anyWorkerEnabled,
    configuration: anyWorkerEnabled ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION,
    reason: anyWorkerEnabled
      ? `In-process workers enabled: ${[enterpriseWorkerEnabled && 'enterprise outbox', dispatcherWorkerLocal && 'notification outbox'].filter(Boolean).join(', ')}.`
      : 'No in-process background worker is enabled on this instance. Queues stay durable but are drained elsewhere or not at all.',
    dependency: 'Backend worker flags',
    retryable: false,
    remediation: anyWorkerEnabled ? '' : 'Enable ENTERPRISE_OUTBOX_WORKER_ENABLED / NOTIFICATION_OUTBOX_WORKER_ENABLED on a worker-capable instance.',
    affectedFeatures: ['Queue draining', 'Retry scheduling'],
    affectedApis: [],
    affectedUiModules: ['/adm/queues'],
    metrics: { enterpriseOutboxWorker: enterpriseWorkerEnabled, notificationOutboxWorker: dispatcherWorkerLocal },
    lastCheckedAt: checkedAt,
  }));

  const schedulerEnabled = envFlag('CMS_SCHEDULER_ENABLED');
  services.push(service({
    id: 'scheduled-jobs',
    name: 'Scheduled Jobs',
    group: GROUP.WORKERS,
    critical: false,
    state: schedulerEnabled ? (firebaseConfigured ? STATE.OPERATIONAL : STATE.UNAVAILABLE) : STATE.DISABLED,
    enabled: schedulerEnabled,
    configuration: schedulerEnabled ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION,
    reason: schedulerEnabled
      ? (firebaseConfigured
        ? `The CMS publication scheduler runs every ${Math.max(60_000, Math.min(Number(process.env.CMS_SCHEDULER_INTERVAL_MS) || 300_000, 3_600_000)) / 1000}s on this instance.`
        : 'The CMS scheduler is enabled but Firebase is unavailable, so scheduled publication cannot run.')
      : 'The CMS publication scheduler is disabled, so scheduled blog posts stay unpublished until an admin publishes them.',
    dependency: 'CMS_SCHEDULER_ENABLED + Firestore',
    retryable: schedulerEnabled,
    remediation: schedulerEnabled ? '' : 'Enable CMS_SCHEDULER_ENABLED on exactly one worker-capable instance to publish due posts automatically.',
    affectedFeatures: ['Scheduled blog publication'],
    affectedApis: ['/api/admin/blog/publish-due'],
    affectedUiModules: ['/adm/blog-management'],
    metrics: { schedulerEnabled, intervalMs: Number(process.env.CMS_SCHEDULER_INTERVAL_MS) || 300_000 },
    lastCheckedAt: checkedAt,
  }));

  services.push(service({
    id: 'cache',
    name: 'Cache',
    group: GROUP.WORKERS,
    critical: false,
    state: STATE.NOT_SUPPORTED,
    support: 'NOT_SUPPORTED',
    enabled: false,
    configuration: CONFIG.NOT_APPLICABLE,
    reason: 'No external cache tier (Redis or Memcached) is deployed. The enterprise runtime derives deterministic cache keys but Firestore remains the system of record, so there is no cache to be healthy or unhealthy.',
    dependency: 'None',
    retryable: false,
    remediation: '',
    affectedFeatures: [],
    affectedApis: [],
    affectedUiModules: [],
    metrics: { keyDerivation: 'in-process (tenantCache)', externalCacheTier: false },
    lastCheckedAt: checkedAt,
  }));

  const storageProvider = String(process.env.ENTERPRISE_STORAGE_PROVIDER || 'firebase-storage');
  const storageBucket = process.env.ENTERPRISE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '';
  const storageSupported = storageProvider === 'firebase-storage';
  services.push(service({
    id: 'object-storage',
    name: 'Object Storage',
    group: GROUP.WORKERS,
    critical: false,
    state: !storageSupported
      ? STATE.NOT_SUPPORTED
      : (truthy(storageBucket) && firebaseConfigured ? STATE.OPERATIONAL : STATE.NOT_CONFIGURED),
    support: storageSupported ? 'SUPPORTED' : 'NOT_SUPPORTED',
    enabled: storageSupported && truthy(storageBucket),
    configuration: truthy(storageBucket) ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: !storageSupported
      ? `ENTERPRISE_STORAGE_PROVIDER is set to "${storageProvider}", which is an extension point with no implemented adapter; artifact writes fail closed.`
      : (truthy(storageBucket) && firebaseConfigured
        ? 'Firebase Storage is selected and a bucket is configured for tenant artifacts.'
        : 'Firebase Storage is selected but no bucket is configured, so artifact persistence fails closed.'),
    dependency: 'Firebase Storage / Google Cloud Storage',
    retryable: false,
    errorCategory: storageSupported && !truthy(storageBucket) ? 'CONFIGURATION_MISSING' : null,
    remediation: storageSupported && !truthy(storageBucket)
      ? 'Set ENTERPRISE_STORAGE_BUCKET to the project storage bucket and restart the backend.'
      : '',
    affectedFeatures: ['Tenant artifact export', 'Signed artifact downloads'],
    affectedApis: ['/api/enterprise/artifacts'],
    affectedUiModules: ['/enterprise'],
    metrics: { provider: storageProvider, bucketConfigured: truthy(storageBucket) },
    lastCheckedAt: checkedAt,
  }));

  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '';
  let chromiumPresent = null;
  if (chromiumPath) {
    try { chromiumPresent = fs.existsSync(chromiumPath); } catch { chromiumPresent = null; }
  }
  const pdfIsolated = envFlag('PDF_RENDERER_ISOLATED');
  services.push(service({
    id: 'pdf-service',
    name: 'PDF Export Service',
    group: GROUP.WORKERS,
    critical: false,
    state: chromiumPresent === false ? STATE.UNAVAILABLE : (pdfIsolated ? STATE.OPERATIONAL : STATE.DEGRADED),
    enabled: true,
    configuration: chromiumPath ? CONFIG.CONFIGURED : CONFIG.PARTIALLY_CONFIGURED,
    reason: chromiumPresent === false
      ? 'The configured Chromium executable path does not exist on this host, so PDF export cannot render.'
      : (pdfIsolated
        ? 'PDF rendering is declared to run in an isolated non-root worker.'
        : 'PDF rendering runs in the API process. PDF_RENDERER_ISOLATED is false, so renders are not sandboxed in a dedicated worker.'),
    dependency: 'Headless Chromium',
    retryable: true,
    errorCategory: chromiumPresent === false ? 'CONFIGURATION_MISSING' : (pdfIsolated ? null : 'HARDENING_GAP'),
    remediation: chromiumPresent === false
      ? 'Install Chromium on the host or correct PUPPETEER_EXECUTABLE_PATH.'
      : (pdfIsolated ? '' : 'Deploy the renderer in a dedicated non-root sandboxed worker and set PDF_RENDERER_ISOLATED=true.'),
    affectedFeatures: ['Resume PDF export', 'Invoice PDF'],
    affectedApis: ['/api/export', '/api/public-export'],
    affectedUiModules: ['/build-resume', '/dashboard'],
    metrics: { isolatedWorkerDeclared: pdfIsolated, executablePathConfigured: Boolean(chromiumPath) },
    lastCheckedAt: checkedAt,
  }));

  return { services, checkedAt, sources: buildSources({ firestorePing, authProbe, outbox, emailConfig, enterpriseOutbox, publicConfigDoc, paymentDoc, oauthDoc }) };
}

function buildSources(results) {
  const map = {};
  for (const [key, result] of Object.entries(results)) {
    map[key] = result?.ok ? 'ok' : 'unavailable';
  }
  return map;
}

/* ────────────────────────────────────────────────────────────────────────────
   API health matrix — derived from the live Express routing table
   ──────────────────────────────────────────────────────────────────────────── */

const MOUNTED_ROUTERS = Object.freeze([
  { prefix: '/api', module: () => require('../routes/ai'), name: 'ai' },
  { prefix: '/api', module: () => require('../routes/email'), name: 'email' },
  { prefix: '/api/email', module: () => require('../routes/email'), name: 'email' },
  { prefix: '/api/enterprise/m2m', module: () => require('../routes/enterpriseM2m').enterpriseM2mRouter || require('../routes/enterpriseM2m'), name: 'enterprise' },
  { prefix: '/api/enterprise', module: () => require('../routes/enterprise').enterpriseRouter, name: 'enterprise' },
  { prefix: '/api/admin', module: () => require('../routes/adminAudit').adminAuditRouter, name: 'admin' },
  { prefix: '/api/platform', module: () => require('../routes/platform').platformRouter, name: 'platform' },
]);

const PUBLIC_API_PATHS = new Set([
  '/api/healthz', '/api/health', '/api/readyz', '/healthz', '/readyz', '/health',
  '/api/stripe-webhook', '/api/public-export', '/api/export-render-data', '/api/contact',
  '/api/auth/custom-password-reset', '/api/auth/verify-email-token', '/api/auth/set-user-password',
  '/api/auth/linkedin', '/api/auth/linkedin/callback', '/api/auth/github', '/api/auth/github/callback',
  '/api/auth/oauth/exchange', '/api/service-availability',
]);

/** Maps an endpoint path onto the health service it functionally depends on. */
const DEPENDENCY_RULES = Object.freeze([
  [/^\/api\/paypal\//, 'payments-paypal'],
  [/^\/api\/paytm\//, 'payments-paytm'],
  [/^\/api\/phonepe\//, 'payments-phonepe'],
  [/^\/api\/razorpay\//, 'payments-razorpay'],
  [/^\/api\/(pay|stripe-webhook)/, 'payments-stripe'],
  [/^\/api\/auth\/github/, 'github-oauth'],
  [/^\/api\/auth\/linkedin/, 'linkedin-oauth'],
  [/^\/api\/(notify|send-invoice-email)/, 'notification-dispatcher'],
  [/^\/api\/email/, 'email-smtp'],
  [/^\/api\/send-email/, 'email-smtp'],
  [/^\/api\/send-sms/, 'twilio-sms'],
  [/^\/api\/jobs\/naukri/, 'naukri-ingestion'],
  [/^\/api\/linkedin-scraper/, 'naukri-ingestion'],
  [/^\/api\/enterprise/, 'enterprise-tenancy'],
  [/^\/api\/(generate-|check-grammar|ai\/|parse-resume)/, 'ai-providers'],
  [/^\/api\/(export|public-export|export-docx)/, 'pdf-service'],
  [/^\/api\/(healthz|health|readyz)/, 'backend-api'],
]);

function moduleForPath(pathname) {
  if (pathname.startsWith('/api/platform')) return 'platform';
  if (pathname.startsWith('/api/admin')) return 'admin';
  if (pathname.startsWith('/api/enterprise')) return 'enterprise';
  if (pathname.startsWith('/api/auth')) return 'auth';
  if (pathname.startsWith('/api/email') || pathname.startsWith('/api/notify') || pathname.startsWith('/api/send-email')) return 'notifications';
  if (/^\/api\/(pay|paypal|paytm|phonepe|razorpay|stripe|invoice|subscription|coupon)/.test(pathname)) return 'billing';
  if (/^\/api\/(generate-|check-grammar|ai\/|parse-resume)/.test(pathname)) return 'ai';
  if (/^\/api\/(export|public-export|export-docx)/.test(pathname)) return 'export';
  if (/^\/api\/(jobs|job-applications|employer)/.test(pathname)) return 'jobs';
  if (/^\/api\/(messages|contact)/.test(pathname)) return 'messaging';
  if (/^\/api\/(healthz|health|readyz)/.test(pathname)) return 'health';
  if (pathname.startsWith('/api/account') || pathname.startsWith('/api/profile')) return 'account';
  return 'core';
}

function authRequirementFor(pathname) {
  if (PUBLIC_API_PATHS.has(pathname)) return 'PUBLIC';
  if (pathname.startsWith('/api/platform') || pathname.startsWith('/api/admin')) return 'ADMIN';
  if (pathname.startsWith('/api/enterprise/m2m')) return 'SERVICE_KEY';
  if (pathname.startsWith('/api/enterprise')) return 'TENANT_MEMBER';
  return 'AUTHENTICATED';
}

function dependencyFor(pathname) {
  for (const [pattern, id] of DEPENDENCY_RULES) {
    if (pattern.test(pathname)) return id;
  }
  return null;
}

function collectRoutes(app) {
  const seen = new Set();
  const endpoints = [];

  const addLayerStack = (prefix, stack) => {
    for (const layer of stack || []) {
      if (!layer.route) continue;
      const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const routePath of routePaths) {
        if (typeof routePath !== 'string') continue;
        const fullPath = `${prefix}${routePath}`.replace(/\/{2,}/g, '/');
        for (const method of Object.keys(layer.route.methods || {})) {
          if (method === '_all') continue;
          const key = `${method.toUpperCase()} ${fullPath}`;
          if (seen.has(key)) continue;
          seen.add(key);
          endpoints.push({ method: method.toUpperCase(), path: fullPath });
        }
      }
    }
  };

  const appRouter = app?.router || app?._router;
  addLayerStack('', appRouter?.stack);

  for (const mount of MOUNTED_ROUTERS) {
    let router = null;
    try { router = mount.module(); } catch { router = null; }
    if (router?.stack) addLayerStack(mount.prefix, router.stack);
  }

  endpoints.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
  return endpoints;
}

/**
 * Endpoint state is inferred from the dependency the endpoint actually calls.
 * An endpoint whose provider is intentionally switched off is DISABLED, not broken.
 */
function buildApiMatrix(app, servicesById) {
  const endpoints = collectRoutes(app).map(endpoint => {
    const dependencyId = dependencyFor(endpoint.path);
    const dependency = dependencyId ? servicesById.get(dependencyId) : null;
    let state = STATE.OPERATIONAL;
    let reason = 'The route is registered and depends only on core platform services that passed their probe.';

    const core = servicesById.get('backend-api');
    const firestore = servicesById.get('firestore');
    if (core?.state === STATE.UNAVAILABLE) {
      state = STATE.UNAVAILABLE;
      reason = 'The API process is not serving requests.';
    } else if (dependency) {
      state = dependency.state === STATE.NOT_SUPPORTED ? STATE.DISABLED : dependency.state;
      reason = dependency.reason;
    } else if (firestore && firestore.state !== STATE.OPERATIONAL && authRequirementFor(endpoint.path) !== 'PUBLIC') {
      state = firestore.state === STATE.UNAVAILABLE ? STATE.UNAVAILABLE : STATE.DEGRADED;
      reason = firestore.reason;
    }

    return {
      method: endpoint.method,
      path: endpoint.path,
      module: moduleForPath(endpoint.path),
      authentication: authRequirementFor(endpoint.path),
      dependency: dependency ? dependency.name : 'Core platform',
      dependencyId: dependencyId || null,
      externalDependency: Boolean(dependency && dependency.group === GROUP.INTEGRATIONS),
      state,
      reason,
    };
  });

  const counts = endpoints.reduce((accumulator, endpoint) => {
    accumulator[endpoint.state] = (accumulator[endpoint.state] || 0) + 1;
    return accumulator;
  }, {});

  return {
    total: endpoints.length,
    counts,
    operationalOrExpected: endpoints.filter(item => item.state === STATE.OPERATIONAL || item.state === STATE.DISABLED || item.state === STATE.NOT_CONFIGURED).length,
    degraded: endpoints.filter(item => item.state === STATE.DEGRADED).length,
    unavailable: endpoints.filter(item => item.state === STATE.UNAVAILABLE).length,
    endpoints,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Snapshot assembly
   ──────────────────────────────────────────────────────────────────────────── */

function summarize(services) {
  const counts = {
    [STATE.OPERATIONAL]: 0,
    [STATE.DEGRADED]: 0,
    [STATE.UNAVAILABLE]: 0,
    [STATE.DISABLED]: 0,
    [STATE.NOT_CONFIGURED]: 0,
    [STATE.NOT_SUPPORTED]: 0,
    [STATE.UNKNOWN]: 0,
  };
  for (const item of services) counts[item.state] = (counts[item.state] || 0) + 1;

  const criticalStates = services.filter(item => item.critical).map(item => item.state);
  const criticalUnavailable = criticalStates.includes(STATE.UNAVAILABLE);
  const anyDegraded = services.some(item => item.state === STATE.DEGRADED);
  const anyUnknown = services.some(item => item.state === STATE.UNKNOWN);

  let overall = 'OPERATIONAL';
  if (criticalUnavailable) overall = 'CRITICAL';
  else if (services.some(item => item.state === STATE.UNAVAILABLE) || anyDegraded) overall = 'DEGRADED';
  else if (anyUnknown) overall = 'PARTIAL';

  const indicator = overall === 'CRITICAL' ? 'red' : overall === 'OPERATIONAL' ? 'green' : 'amber';

  return { overall, indicator, counts, total: services.length, worstState: worstState(services.map(item => item.state)) };
}

async function computeSnapshot(app) {
  const { services, checkedAt, sources } = await buildServices(app);
  const servicesById = new Map(services.map(item => [item.id, item]));
  const apiMatrix = buildApiMatrix(app, servicesById);
  const summary = summarize(services);

  return {
    checkedAt,
    summary,
    sources,
    services,
    apiMatrix,
    groups: {
      [GROUP.CORE]: services.filter(item => item.group === GROUP.CORE).map(item => item.id),
      [GROUP.INTEGRATIONS]: services.filter(item => item.group === GROUP.INTEGRATIONS).map(item => item.id),
      [GROUP.WORKERS]: services.filter(item => item.group === GROUP.WORKERS).map(item => item.id),
    },
  };
}

/**
 * Returns a snapshot, reusing the cached one inside the TTL so the dashboard's
 * auto-refresh cannot hammer Firestore or third-party providers.
 */
async function getHealthSnapshot(app, { force = false } = {}) {
  const age = Date.now() - cachedAt;
  const usableCache = cachedSnapshot && (force ? age < MIN_FORCED_INTERVAL_MS : age < SNAPSHOT_TTL_MS);
  if (usableCache) return { ...cachedSnapshot, cached: true, cacheAgeMs: age };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const snapshot = await computeSnapshot(app);
      cachedSnapshot = snapshot;
      cachedAt = Date.now();
      return { ...snapshot, cached: false, cacheAgeMs: 0 };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function resetHealthCache() {
  cachedSnapshot = null;
  cachedAt = 0;
  inFlight = null;
}

/** Public, secret-free availability projection used by the consumer UI. */
async function getServiceAvailability(app) {
  const snapshot = await getHealthSnapshot(app);
  const byId = new Map(snapshot.services.map(item => [item.id, item]));
  const usable = id => {
    const entry = byId.get(id);
    return Boolean(entry && entry.state === STATE.OPERATIONAL);
  };
  return {
    checkedAt: snapshot.checkedAt,
    auth: {
      github: usable('github-oauth'),
      linkedin: usable('linkedin-oauth'),
    },
    payments: {
      stripe: usable('payments-stripe'),
      paypal: usable('payments-paypal'),
      razorpay: usable('payments-razorpay'),
      paytm: usable('payments-paytm'),
      phonepe: usable('payments-phonepe'),
    },
    enterpriseTenancy: usable('enterprise-tenancy'),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Operator-initiated provider tests (safe, read-only reachability checks)
   ──────────────────────────────────────────────────────────────────────────── */

const TESTABLE_SERVICES = Object.freeze(['firestore', 'authentication', 'email-smtp', 'ai-providers']);

async function runServiceTest(app, serviceId) {
  const db = app?.get?.('db') || null;
  const admin = app?.get?.('firebaseAdmin') || null;

  if (!TESTABLE_SERVICES.includes(serviceId)) {
    const error = new Error('This service does not expose a safe operator test');
    error.status = 400;
    error.code = 'SERVICE_TEST_UNSUPPORTED';
    throw error;
  }

  if (serviceId === 'firestore') {
    const probe = await observe('firestore.test', async () => {
      if (!db) throw new Error('Firestore client is not initialized');
      await db.collection('settings').doc('system_ping_check').set(
        { lastPing: admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date() },
        { merge: true },
      );
      return true;
    });
    return {
      serviceId,
      passed: probe.ok,
      latencyMs: probe.latencyMs,
      detail: probe.ok ? `Write probe succeeded in ${probe.latencyMs}ms.` : `Write probe failed: ${probe.error}`,
      errorCategory: probe.ok ? null : categorizeError(probe.error),
    };
  }

  if (serviceId === 'authentication') {
    const probe = await observe('auth.test', async () => {
      if (!admin?.auth) throw new Error('Firebase Admin auth is not initialized');
      await admin.auth().listUsers(1);
      return true;
    });
    return {
      serviceId,
      passed: probe.ok,
      latencyMs: probe.latencyMs,
      detail: probe.ok ? `Identity directory responded in ${probe.latencyMs}ms.` : `Identity directory probe failed: ${probe.error}`,
      errorCategory: probe.ok ? null : categorizeError(probe.error),
    };
  }

  if (serviceId === 'email-smtp') {
    const probe = await observe('smtp.verify', async () => {
      const config = await loadEmailConfig(db);
      const smtp = config?.smtp || {};
      if (!truthy(smtp.username) || !truthy(smtp.password)) {
        throw Object.assign(new Error('SMTP credentials are not configured'), { code: 'CONFIGURATION_MISSING' });
      }
      const nodemailer = require('nodemailer');
      const { assertPublicNetworkTarget } = require('../security/network');
      const target = await assertPublicNetworkTarget(smtp.host);
      const transporter = nodemailer.createTransport({
        host: target.addresses[0],
        port: Number(smtp.port),
        secure: smtp.encryption === 'ssl' || Number(smtp.port) === 465,
        auth: { user: smtp.username, pass: smtp.password },
        tls: { rejectUnauthorized: true, servername: smtp.host },
        connectionTimeout: 5000,
        greetingTimeout: 4000,
        socketTimeout: 8000,
      });
      // verify() authenticates without sending mail, so this stays a safe probe.
      await transporter.verify();
      transporter.close?.();
      return true;
    });
    return {
      serviceId,
      passed: probe.ok,
      latencyMs: probe.latencyMs,
      detail: probe.ok
        ? `SMTP handshake and authentication succeeded in ${probe.latencyMs}ms. No message was sent.`
        : `SMTP verification failed: ${probe.error}`,
      errorCategory: probe.ok ? null : categorizeError(probe.error),
    };
  }

  // ai-providers: configuration reachability only; no paid inference call is made.
  const configured = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY']
    .filter(name => truthy(process.env[name]));
  return {
    serviceId,
    passed: configured.length > 0,
    latencyMs: 0,
    detail: configured.length > 0
      ? `${configured.length} provider key(s) are present in the backend environment. No billable inference call was made by this test.`
      : 'No AI provider key is present in the backend environment.',
    errorCategory: configured.length > 0 ? null : 'CONFIGURATION_MISSING',
  };
}

module.exports = {
  STATE,
  CONFIG,
  GROUP,
  TESTABLE_SERVICES,
  buildApiMatrix,
  categorizeError,
  collectRoutes,
  computeSnapshot,
  getHealthSnapshot,
  getServiceAvailability,
  resetHealthCache,
  runServiceTest,
  summarize,
  __internal: { resolvePaymentProviders, resolveOAuthProviders, resolveSmtp, dependencyFor, moduleForPath, authRequirementFor, worstState },
};
