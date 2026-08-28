'use strict';

/**
 * MariaDB/Firebase-Auth operational health collector.
 *
 * MariaDB is the only application-data plane. Firebase is probed exclusively
 * through the Admin Authentication API. A state is derived from an observation,
 * an explicit disable, or a configuration gap; an unreadable dependency is
 * never promoted to OPERATIONAL. Provider configuration is not described as a
 * live provider test.
 */

const fs = require('fs');
const os = require('os');
const nodemailer = require('nodemailer');
const { getPool, getMigrationStatus } = require('../database/mysql');
const { assertPublicNetworkTarget } = require('../security/network');
const { getOutboxStatus } = require('../enterprise/enterpriseOutbox');

const STATE = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  DISABLED: 'DISABLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  UNKNOWN: 'UNKNOWN',
});

const CONFIG = Object.freeze({
  CONFIGURED: 'CONFIGURED',
  PARTIALLY_CONFIGURED: 'PARTIALLY_CONFIGURED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  DISABLED_BY_CONFIGURATION: 'DISABLED_BY_CONFIGURATION',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNKNOWN: 'UNKNOWN',
});

const GROUP = Object.freeze({ CORE: 'core', INTEGRATIONS: 'integrations', WORKERS: 'workers' });
const SEVERITY_ORDER = Object.freeze({
  [STATE.UNAVAILABLE]: 6,
  [STATE.DEGRADED]: 5,
  [STATE.UNKNOWN]: 4,
  [STATE.NOT_CONFIGURED]: 3,
  [STATE.DISABLED]: 2,
  [STATE.NOT_SUPPORTED]: 1,
  [STATE.OPERATIONAL]: 0,
});

const SNAPSHOT_TTL_MS = Number(process.env.PLATFORM_HEALTH_CACHE_MS || 15_000);
const MIN_FORCED_INTERVAL_MS = Number(process.env.PLATFORM_HEALTH_MIN_INTERVAL_MS || 3_000);
const TEST_RESULT_TTL_MS = 5 * 60_000;
let cachedSnapshot = null;
let cachedAt = 0;
let inFlight = null;
const recentTests = new Map();

function nowIso() { return new Date().toISOString(); }
function truthy(value) { return typeof value === 'string' ? value.trim().length > 0 : Boolean(value); }
function booleanValue(value, fallback = false) {
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  return fallback;
}
function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : fallback; } catch { return fallback; }
}

async function observe(label, probe) {
  const startedAt = Date.now();
  try {
    return { ok: true, value: await probe(), latencyMs: Date.now() - startedAt, label };
  } catch (error) {
    return {
      ok: false, value: null, label,
      error: String(error?.message || error).slice(0, 240),
      code: error?.code ? String(error.code).slice(0, 80) : null,
      latencyMs: Date.now() - startedAt,
    };
  }
}

function categorizeError(message) {
  const value = String(message || '').toLowerCase();
  if (!value) return 'DATA_UNAVAILABLE';
  if (/timeout|etimedout|timed out/.test(value)) return 'TIMEOUT';
  if (/econnrefused|enotfound|eai_again|socket|network|unreachable/.test(value)) return 'NETWORK_UNREACHABLE';
  if (/auth|credential|invalid login|535|password/.test(value)) return 'AUTHENTICATION_REJECTED';
  if (/configuration|not configured|missing|required/.test(value)) return 'CONFIGURATION_MISSING';
  if (/quota|rate limit|429|throttl/.test(value)) return 'RATE_LIMITED';
  if (/permission|forbidden|403/.test(value)) return 'AUTHORIZATION_DENIED';
  if (/not found|404/.test(value)) return 'ROUTE_OR_RESOURCE_MISSING';
  if (/certificate|tls|ssl/.test(value)) return 'TLS_FAILURE';
  if (/index/.test(value)) return 'DATASTORE_INDEX_MISSING';
  return 'PROVIDER_ERROR';
}

function service(descriptor) {
  const state = descriptor.state || STATE.UNKNOWN;
  return Object.freeze({
    id: descriptor.id,
    name: descriptor.name,
    group: descriptor.group || GROUP.CORE,
    state,
    support: descriptor.support || (state === STATE.NOT_SUPPORTED ? 'NOT_SUPPORTED' : 'SUPPORTED'),
    enabled: descriptor.enabled === undefined ? state !== STATE.DISABLED : descriptor.enabled === true,
    configuration: descriptor.configuration || CONFIG.UNKNOWN,
    critical: descriptor.critical === true,
    reason: descriptor.reason || 'No observation is available.',
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
  return states.reduce((worst, candidate) =>
    (SEVERITY_ORDER[candidate] ?? 0) > (SEVERITY_ORDER[worst] ?? 0) ? candidate : worst,
  STATE.OPERATIONAL);
}

function selectCredentialPair({ envId, envSecret, storedId, storedSecret, requiresId = true }) {
  const environment = { id: String(envId || '').trim(), secret: String(envSecret || '').trim() };
  const stored = { id: String(storedId || '').trim(), secret: String(storedSecret || '').trim() };
  const complete = pair => Boolean(pair.secret && (!requiresId || pair.id));
  if (complete(environment)) return { credentialed: true, partial: false, source: 'environment' };
  if (complete(stored)) return { credentialed: true, partial: false, source: 'mariadb' };
  if (environment.id || environment.secret) return { credentialed: false, partial: true, source: 'environment-partial' };
  if (stored.id || stored.secret) return { credentialed: false, partial: true, source: 'mariadb-partial' };
  return { credentialed: false, partial: false, source: 'none' };
}

function resolvePaymentProviders(providerDoc = {}, legacySubscriptions = {}, publicConfig = {}) {
  const publicSubs = publicConfig.subscriptions || {};
  const toggle = (key, fallback = false) => {
    if (publicSubs[key] !== undefined) return publicSubs[key] === true;
    if (legacySubscriptions[key] !== undefined) return legacySubscriptions[key] === true;
    return fallback;
  };
  return {
    stripe: {
      name: 'Stripe',
      ...selectCredentialPair({ envSecret: process.env.STRIPE_SECRET, storedSecret: providerDoc.stripe?.secretKey, requiresId: false }),
      webhook: truthy(process.env.STRIPE_WEBHOOK_SECRET) || truthy(providerDoc.stripe?.webhookSecret),
      adminEnabled: toggle('stripeEnabled', providerDoc.stripe?.enabled === true),
      environment: String(process.env.STRIPE_SECRET || '').startsWith('sk_live') ? 'live' : 'test',
      apis: ['/api/pay', '/api/stripe-webhook'],
    },
    paypal: {
      name: 'PayPal',
      ...selectCredentialPair({ envId: process.env.PAYPAL_CLIENT_ID, envSecret: process.env.PAYPAL_CLIENT_SECRET, storedId: providerDoc.paypal?.clientId, storedSecret: providerDoc.paypal?.clientSecret }),
      adminEnabled: toggle('paypalEnabled', providerDoc.paypal?.enabled === true),
      environment: String(process.env.PAYPAL_ENV || providerDoc.paypal?.environment || 'sandbox').toLowerCase(),
      apis: ['/api/paypal/create-order', '/api/paypal/verify'],
    },
    razorpay: {
      name: 'Razorpay',
      ...selectCredentialPair({ envId: process.env.RAZORPAY_KEY_ID, envSecret: process.env.RAZORPAY_KEY_SECRET, storedId: providerDoc.razorpay?.keyId, storedSecret: providerDoc.razorpay?.keySecret }),
      adminEnabled: toggle('razorpayEnabled', providerDoc.razorpay?.enabled === true),
      environment: String(process.env.RAZORPAY_KEY_ID || providerDoc.razorpay?.keyId || '').startsWith('rzp_live') ? 'live' : 'test',
      apis: ['/api/razorpay/create-order', '/api/razorpay/verify'],
    },
    paytm: {
      name: 'PayTM',
      ...selectCredentialPair({ envId: process.env.PAYTM_MID, envSecret: process.env.PAYTM_MERCHANT_KEY, storedId: providerDoc.paytm?.mid, storedSecret: providerDoc.paytm?.merchantKey }),
      adminEnabled: toggle('paytmEnabled', providerDoc.paytm?.enabled === true),
      environment: String(process.env.PAYTM_ENV || providerDoc.paytm?.environment || 'staging').toLowerCase(),
      apis: ['/api/paytm/initiate-transaction', '/api/paytm/verify'],
    },
    phonepe: {
      name: 'PhonePe',
      ...selectCredentialPair({ envId: process.env.PHONEPE_MERCHANT_ID, envSecret: process.env.PHONEPE_SALT_KEY, storedId: providerDoc.phonepe?.merchantId, storedSecret: providerDoc.phonepe?.saltKey }),
      adminEnabled: toggle('phonepeEnabled', providerDoc.phonepe?.enabled === true),
      environment: String(process.env.PHONEPE_ENV || providerDoc.phonepe?.environment || 'sandbox').toLowerCase(),
      apis: ['/api/phonepe/initiate-payment', '/api/phonepe/status'],
    },
  };
}

function resolveOAuthProviders(oauthDoc = {}, adminConfiguration = {}, systemSettings = {}, publicConfig = {}) {
  const canonical = adminConfiguration.socialAuth || {};
  const legacy = systemSettings.socialAuth || {};
  const modules = publicConfig.modules || {};
  const build = (provider, envPrefix, keyPrefix, moduleKeys) => {
    const pair = selectCredentialPair({
      envId: process.env[`${envPrefix}_CLIENT_ID`], envSecret: process.env[`${envPrefix}_CLIENT_SECRET`],
      storedId: oauthDoc[provider]?.clientId || canonical[`${keyPrefix}ClientId`] || legacy[`${keyPrefix}ClientId`],
      storedSecret: oauthDoc[provider]?.clientSecret || canonical[`${keyPrefix}ClientSecret`] || legacy[`${keyPrefix}ClientSecret`],
    });
    let explicit;
    for (const key of moduleKeys) {
      if (modules[key] !== undefined) { explicit = modules[key] === true; break; }
      if (canonical[key] !== undefined) { explicit = canonical[key] === true; break; }
    }
    return { ...pair, adminEnabled: explicit === undefined ? pair.credentialed : explicit };
  };
  return {
    github: build('github', 'GITHUB', 'github', ['enableGithubAuthModule', 'enableGithubLogin']),
    linkedin: build('linkedin', 'LINKEDIN', 'linkedin', ['enableLinkedinAuthModule', 'enableLinkedinLogin']),
  };
}

function resolveSmtp(systemSettings = {}) {
  const stored = systemSettings.smtp || {};
  const fallback = systemSettings.fallbackSmtp || {};
  const username = process.env.SMTP_USER || stored.username || '';
  const password = process.env.SMTP_PASS || stored.password || '';
  return {
    host: String(process.env.SMTP_HOST || stored.host || '').slice(0, 253),
    port: Number(process.env.SMTP_PORT || stored.port || 0) || null,
    encryption: String(process.env.SMTP_ENCRYPTION || stored.encryption || '').toLowerCase(),
    usernameConfigured: truthy(username), passwordConfigured: truthy(password),
    credentialed: truthy(username) && truthy(password),
    partial: truthy(username) !== truthy(password),
    fallbackEnabled: fallback.enabled === true,
    fallbackCredentialed: truthy(process.env.FALLBACK_SMTP_USER || fallback.username) && truthy(process.env.FALLBACK_SMTP_PASS || fallback.password),
  };
}

function recentTest(id) {
  const result = recentTests.get(id);
  return result && Date.now() - result.recordedAt < TEST_RESULT_TTL_MS ? result : null;
}

function configuredProviderService(id, descriptor, checkedAt) {
  const test = recentTest(id);
  if (descriptor.adminEnabled === false) {
    return service({ id, name: descriptor.name, group: GROUP.INTEGRATIONS, state: STATE.DISABLED, enabled: false,
      configuration: CONFIG.DISABLED_BY_CONFIGURATION, reason: `${descriptor.name} is disabled by platform configuration.`,
      dependency: `${descriptor.name} API`, affectedApis: descriptor.apis, checkedAt });
  }
  if (!descriptor.credentialed) {
    return service({ id, name: descriptor.name, group: GROUP.INTEGRATIONS,
      state: descriptor.partial ? STATE.DEGRADED : STATE.NOT_CONFIGURED,
      configuration: descriptor.partial ? CONFIG.PARTIALLY_CONFIGURED : CONFIG.NOT_CONFIGURED,
      reason: descriptor.partial ? `${descriptor.name} credentials are incomplete.` : `${descriptor.name} credentials are not configured.`,
      dependency: `${descriptor.name} API`, errorCategory: 'CONFIGURATION_MISSING', affectedApis: descriptor.apis, checkedAt });
  }
  return service({ id, name: descriptor.name, group: GROUP.INTEGRATIONS,
    state: test ? (test.passed ? STATE.OPERATIONAL : STATE.UNAVAILABLE) : STATE.UNKNOWN,
    configuration: CONFIG.CONFIGURED,
    reason: test ? test.detail : `${descriptor.name} is configured, but live provider reachability was not exercised by this snapshot.`,
    dependency: `${descriptor.name} API`, retryable: true,
    errorCategory: test?.passed === false ? test.errorCategory : (!test ? 'DATA_UNAVAILABLE' : null),
    affectedApis: descriptor.apis, checkedAt });
}

async function loadMariaSettings(pool) {
  const [rows] = await pool.query('SELECT category, data FROM system_settings');
  const settings = {};
  for (const row of rows) settings[row.category] = parseJson(row.data, {});
  return settings;
}

async function inspectNotificationOutbox(pool) {
  const [rows] = await pool.query('SELECT state, COUNT(*) AS total, MIN(created_at) AS oldest FROM notification_outbox GROUP BY state');
  const counts = {};
  let oldestQueuedAt = null;
  for (const row of rows) {
    counts[row.state] = Number(row.total || 0);
    if (['NOTIFICATION_QUEUED', 'RETRYING', 'PROCESSING'].includes(row.state) && row.oldest) {
      const value = new Date(row.oldest);
      if (!oldestQueuedAt || value < oldestQueuedAt) oldestQueuedAt = value;
    }
  }
  return {
    counts,
    queued: Number(counts.NOTIFICATION_QUEUED || 0) + Number(counts.RETRYING || 0) + Number(counts.PROCESSING || 0),
    delivered: Number(counts.DELIVERED || 0), deadLetter: Number(counts.DEAD_LETTER || 0),
    oldestQueuedAt: oldestQueuedAt ? oldestQueuedAt.toISOString() : null,
  };
}

async function buildServices(app) {
  const checkedAt = nowIso();
  const pool = getPool();
  const identityAdmin = app?.get?.('firebaseAdmin') || null;
  const tenantService = app?.get?.('tenantService') || null;

  const [databaseProbe, settingsProbe, migrationProbe, authProbe, notificationProbe, enterpriseQueueProbe] = await Promise.all([
    observe('mariadb.select1', async () => { const [rows] = await pool.query('SELECT 1 AS alive, VERSION() AS version'); return rows[0]; }),
    observe('mariadb.system_settings', () => loadMariaSettings(pool)),
    observe('mariadb.migrations', () => getMigrationStatus()),
    observe('firebase-auth.listUsers', async () => {
      if (!identityAdmin?.auth) throw Object.assign(new Error('Firebase Authentication Admin adapter is not configured'), { code: 'AUTH_CONFIGURATION_MISSING' });
      return identityAdmin.auth().listUsers(1);
    }),
    observe('mariadb.notification_outbox', () => inspectNotificationOutbox(pool)),
    observe('mariadb.enterprise_outbox', () => getOutboxStatus({ pool, signingSecret: process.env.TENANT_JOB_SIGNING_SECRET || null })),
  ]);

  const settings = settingsProbe.ok ? settingsProbe.value : {};
  const publicConfig = settings.public_config || {};
  const flags = settings.feature_flags || {};
  const flag = (key, fallback = false) => flags[key]?.value === true || flags[key]?.value === false
    ? flags[key].value
    : process.env[key] !== undefined ? booleanValue(process.env[key]) : fallback;
  const enterpriseEnabled = flag('ENTERPRISE_TENANCY_ENABLED', false);
  const notificationWorkerEnabled = flag('NOTIFICATION_OUTBOX_WORKER_ENABLED', false) || flag('NOTIFICATION_OUTBOX_EXTERNAL_WORKER', false);
  const enterpriseWorkerEnabled = flag('ENTERPRISE_OUTBOX_WORKER_ENABLED', false);
  const payments = resolvePaymentProviders(settings.payment_providers, settings.subscriptions, publicConfig);
  const oauth = resolveOAuthProviders(settings.oauth_providers, settings.admin_configuration, settings.system_settings, publicConfig);
  const smtp = resolveSmtp(settings.system_settings);
  const runtime = tenantService?.describeRuntime?.() || {};
  const encryption = runtime.encryption || {};

  const services = [];
  services.push(service({ id: 'backend-api', name: 'Backend API', group: GROUP.CORE, state: STATE.OPERATIONAL,
    configuration: CONFIG.CONFIGURED, critical: true,
    reason: 'The health collector is executing inside the registered Express application.', dependency: 'Express process',
    metrics: { uptimeSeconds: Math.floor(process.uptime()), commitSha: process.env.COMMIT_SHA || process.env.GITHUB_SHA || null }, checkedAt }));
  services.push(service({ id: 'backend-process', name: 'Backend Process', group: GROUP.CORE, state: STATE.OPERATIONAL,
    configuration: CONFIG.CONFIGURED, critical: true, reason: 'Runtime metrics were read from the current process.', dependency: 'Node.js runtime',
    metrics: {
      uptimeSeconds: Math.floor(process.uptime()), nodeVersion: process.version, pid: process.pid, host: os.hostname(),
      loadAverage1m: Number(os.loadavg()[0].toFixed(2)), systemFreeMemMb: Math.round(os.freemem() / 1048576),
      systemTotalMemMb: Math.round(os.totalmem() / 1048576), rssMb: Math.round(process.memoryUsage().rss / 1048576),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
    }, checkedAt }));
  services.push(service({ id: 'database', name: 'MariaDB', group: GROUP.CORE,
    state: databaseProbe.ok ? STATE.OPERATIONAL : STATE.UNAVAILABLE, configuration: CONFIG.CONFIGURED, critical: true,
    reason: databaseProbe.ok ? `SELECT 1 completed in ${databaseProbe.latencyMs}ms.` : `MariaDB probe failed: ${databaseProbe.error}`,
    dependency: 'MariaDB authoritative application-data store', retryable: !databaseProbe.ok,
    errorCategory: databaseProbe.ok ? null : categorizeError(databaseProbe.error),
    remediation: databaseProbe.ok ? '' : 'Restore MariaDB connectivity and verify credentials, TLS, schema, and network policy.',
    affectedFeatures: ['All persisted application data'], affectedApis: ['/api/*'], affectedUiModules: ['/dashboard', '/adm'],
    metrics: { latencyMs: databaseProbe.latencyMs, version: databaseProbe.ok ? databaseProbe.value?.version || null : null },
    testable: true, checkedAt }));
  const migrationCurrent = migrationProbe.ok
    && (migrationProbe.value?.pending?.length || 0) === 0
    && (migrationProbe.value?.mismatches?.length || 0) === 0
    && (migrationProbe.value?.unknownApplied?.length || 0) === 0;
  services.push(service({ id: 'database-migrations', name: 'Database Migrations', group: GROUP.CORE,
    state: !migrationProbe.ok ? STATE.UNKNOWN : migrationCurrent ? STATE.OPERATIONAL : STATE.UNAVAILABLE,
    configuration: migrationProbe.ok ? CONFIG.CONFIGURED : CONFIG.UNKNOWN, critical: true,
    reason: !migrationProbe.ok ? `Migration ledger could not be verified: ${migrationProbe.error}`
      : migrationCurrent ? 'The checksummed migration ledger matches every discovered migration.'
        : `${migrationProbe.value?.pending?.length ?? 'One or more'} migration(s) are pending or inconsistent.`,
    dependency: 'MariaDB schema_migrations ledger', retryable: true,
    errorCategory: !migrationProbe.ok ? categorizeError(migrationProbe.error) : migrationCurrent ? null : 'DATA_UNAVAILABLE',
    metrics: migrationProbe.ok ? { pendingCount: migrationProbe.value?.pending?.length || 0, appliedCount: migrationProbe.value?.applied?.length || 0 } : {}, checkedAt }));
  services.push(service({ id: 'authentication', name: 'Firebase Authentication', group: GROUP.CORE,
    state: authProbe.ok ? STATE.OPERATIONAL : STATE.UNAVAILABLE,
    configuration: identityAdmin?.auth ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED, critical: true,
    reason: authProbe.ok ? `Identity directory listUsers(1) completed in ${authProbe.latencyMs}ms.` : `Identity probe failed: ${authProbe.error}`,
    dependency: 'Firebase Authentication identity directory', retryable: true,
    errorCategory: authProbe.ok ? null : categorizeError(authProbe.error),
    affectedFeatures: ['Sign-in', 'OAuth', 'session verification', 'password reset', 'MFA'], affectedApis: ['/api/auth/*'], affectedUiModules: ['/login'],
    metrics: { latencyMs: authProbe.latencyMs }, testable: true, checkedAt }));
  services.push(service({ id: 'mfa', name: 'Multi-factor Authentication', group: GROUP.CORE,
    state: authProbe.ok ? STATE.OPERATIONAL : STATE.UNAVAILABLE,
    configuration: identityAdmin?.auth ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED, critical: true,
    reason: authProbe.ok ? 'MFA uses the retained Firebase Authentication identity plane; the directory probe succeeded.' : 'MFA cannot be relied on while the identity probe is unavailable.',
    dependency: 'Firebase Authentication MFA', affectedFeatures: ['Privileged authentication'], checkedAt }));

  const tenancyReady = enterpriseEnabled && databaseProbe.ok && runtime.dataPlaneConfigured === true;
  services.push(service({ id: 'enterprise-tenancy', name: 'Enterprise Tenancy', group: GROUP.CORE,
    state: !enterpriseEnabled ? STATE.DISABLED : tenancyReady ? STATE.OPERATIONAL : STATE.UNAVAILABLE,
    enabled: enterpriseEnabled,
    configuration: !enterpriseEnabled ? CONFIG.DISABLED_BY_CONFIGURATION : runtime.dataPlaneConfigured === true ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    critical: enterpriseEnabled,
    reason: !enterpriseEnabled ? 'Enterprise tenancy is disabled by configuration.'
      : tenancyReady ? 'Tenant service reports a configured MariaDB data plane and the database probe succeeded.'
        : 'Enterprise tenancy is enabled, but its MariaDB runtime is not ready.',
    dependency: 'MariaDB tenant repository', retryable: enterpriseEnabled && !tenancyReady,
    errorCategory: enterpriseEnabled && !tenancyReady ? 'CONFIGURATION_MISSING' : null,
    affectedFeatures: ['Tenant isolation', 'workspaces', 'enterprise IAM'], affectedApis: ['/api/enterprise/*'], affectedUiModules: ['/enterprise', '/adm/tenants'], checkedAt }));
  services.push(service({ id: 'enterprise-encryption', name: 'Enterprise Encryption', group: GROUP.CORE,
    state: !enterpriseEnabled ? STATE.DISABLED : encryption.configured === true ? STATE.OPERATIONAL : STATE.UNAVAILABLE,
    enabled: enterpriseEnabled,
    configuration: !enterpriseEnabled ? CONFIG.DISABLED_BY_CONFIGURATION : encryption.configured === true ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    critical: enterpriseEnabled,
    reason: !enterpriseEnabled ? 'Enterprise tenancy is disabled.' : encryption.configured === true ? 'The tenant service reports a configured encryption provider.' : 'Enterprise encryption is not configured.',
    dependency: 'Enterprise envelope-encryption key provider', errorCategory: enterpriseEnabled && encryption.configured !== true ? 'CONFIGURATION_MISSING' : null,
    metrics: { provider: encryption.provider || null, securityLevel: encryption.securityLevel || null }, checkedAt }));

  const notification = notificationProbe.value;
  services.push(service({ id: 'notification-outbox', name: 'Notification Outbox', group: GROUP.WORKERS,
    state: !notificationProbe.ok ? STATE.UNKNOWN : notification.deadLetter > 0 ? STATE.DEGRADED : STATE.OPERATIONAL,
    configuration: notificationProbe.ok ? CONFIG.CONFIGURED : CONFIG.UNKNOWN,
    reason: !notificationProbe.ok ? `Notification outbox could not be inspected: ${notificationProbe.error}`
      : notification.deadLetter > 0 ? `${notification.deadLetter} notification(s) are dead-lettered.` : 'The MariaDB notification outbox was read and has no dead-letter item.',
    dependency: 'MariaDB notification_outbox', retryable: true,
    errorCategory: notificationProbe.ok ? null : categorizeError(notificationProbe.error),
    metrics: notificationProbe.ok ? notification : {}, affectedUiModules: ['/adm/queues'], checkedAt }));
  services.push(service({ id: 'notification-worker', name: 'Notification Worker', group: GROUP.WORKERS,
    state: notificationWorkerEnabled ? STATE.UNKNOWN : STATE.DISABLED, enabled: notificationWorkerEnabled,
    configuration: notificationWorkerEnabled ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION,
    reason: notificationWorkerEnabled ? 'A notification worker is enabled, but no durable heartbeat is recorded; liveness is not inferred.' : 'Notification workers are disabled by configuration.',
    dependency: 'Notification worker heartbeat (not implemented)', errorCategory: notificationWorkerEnabled ? 'DATA_UNAVAILABLE' : null, checkedAt }));
  const enterpriseQueue = enterpriseQueueProbe.value;
  services.push(service({ id: 'enterprise-outbox', name: 'Enterprise Outbox', group: GROUP.WORKERS,
    state: !enterpriseQueueProbe.ok ? STATE.UNKNOWN : enterpriseQueue.deadLetterCount > 0 || !enterpriseQueue.signingConfigured ? STATE.DEGRADED : STATE.OPERATIONAL,
    configuration: !enterpriseQueueProbe.ok ? CONFIG.UNKNOWN : enterpriseQueue.signingConfigured ? CONFIG.CONFIGURED : CONFIG.PARTIALLY_CONFIGURED,
    reason: !enterpriseQueueProbe.ok ? `Enterprise outbox could not be inspected: ${enterpriseQueueProbe.error}`
      : !enterpriseQueue.signingConfigured ? 'The queue is durable, but its signing secret is missing or too short.'
        : enterpriseQueue.deadLetterCount > 0 ? `${enterpriseQueue.deadLetterCount} enterprise job(s) are dead-lettered.` : 'The MariaDB enterprise outbox was read and has no dead-letter item.',
    dependency: 'MariaDB enterprise_outbox', retryable: true,
    errorCategory: enterpriseQueueProbe.ok ? null : categorizeError(enterpriseQueueProbe.error),
    metrics: enterpriseQueueProbe.ok ? { activeQueued: enterpriseQueue.activeQueued, deadLetterCount: enterpriseQueue.deadLetterCount } : {}, checkedAt }));
  services.push(service({ id: 'enterprise-worker', name: 'Enterprise Worker', group: GROUP.WORKERS,
    state: enterpriseWorkerEnabled ? STATE.UNKNOWN : STATE.DISABLED, enabled: enterpriseWorkerEnabled,
    configuration: enterpriseWorkerEnabled ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION,
    reason: enterpriseWorkerEnabled ? 'The enterprise worker is enabled, but no durable heartbeat is recorded; liveness is not inferred.' : 'The enterprise worker is disabled by configuration.',
    dependency: 'Enterprise worker heartbeat (not implemented)', errorCategory: enterpriseWorkerEnabled ? 'DATA_UNAVAILABLE' : null, checkedAt }));

  const smtpTest = recentTest('email-smtp');
  const smtpState = !smtp.credentialed ? (smtp.partial ? STATE.DEGRADED : STATE.NOT_CONFIGURED)
    : smtpTest ? (smtpTest.passed ? STATE.OPERATIONAL : STATE.UNAVAILABLE) : STATE.UNKNOWN;
  services.push(service({ id: 'email-smtp', name: 'Email (SMTP)', group: GROUP.INTEGRATIONS,
    state: smtpState,
    configuration: !smtp.credentialed ? (smtp.partial ? CONFIG.PARTIALLY_CONFIGURED : CONFIG.NOT_CONFIGURED) : CONFIG.CONFIGURED,
    reason: !smtp.credentialed ? (smtp.partial ? 'SMTP credentials are incomplete.' : 'SMTP credentials are not configured in MariaDB or the deployment environment.')
      : smtpTest ? smtpTest.detail : 'SMTP is configured, but a connection/authentication test has not run in the last five minutes.',
    dependency: 'Encrypted SMTP relay', retryable: smtp.credentialed,
    errorCategory: !smtp.credentialed ? 'CONFIGURATION_MISSING' : smtpTest?.passed === false ? smtpTest.errorCategory : (!smtpTest ? 'DATA_UNAVAILABLE' : null),
    affectedFeatures: ['Transactional email', 'notification delivery'], affectedApis: ['/api/email/*'], affectedUiModules: ['/adm/email-logs'],
    metrics: { host: smtp.host || null, port: smtp.port, encryption: smtp.encryption || null, fallbackConfigured: smtp.fallbackEnabled && smtp.fallbackCredentialed },
    testable: true, checkedAt }));

  for (const [key, descriptor] of Object.entries(payments)) services.push(configuredProviderService(`payments-${key}`, descriptor, checkedAt));
  for (const [key, descriptor] of Object.entries(oauth)) services.push(configuredProviderService(`${key}-oauth`, {
    ...descriptor, name: `${key[0].toUpperCase()}${key.slice(1)} OAuth`, apis: [`/api/auth/${key}`],
  }, checkedAt));

  const aiStored = settings.ai_providers || {};
  const aiEnvKeys = ['NVIDIA_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'];
  const configuredAiCount = aiEnvKeys.filter(key => truthy(process.env[key])).length
    + Object.values(aiStored).filter(value => truthy(value?.apiKey || value?.key)).length;
  services.push(service({ id: 'ai-providers', name: 'AI Providers', group: GROUP.INTEGRATIONS,
    state: configuredAiCount > 0 ? STATE.UNKNOWN : STATE.NOT_CONFIGURED,
    configuration: configuredAiCount > 0 ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: configuredAiCount > 0 ? `${configuredAiCount} provider credential source(s) are configured, but no billable inference is run by health collection.` : 'No AI provider credential is configured.',
    dependency: 'Configured AI provider APIs', retryable: false,
    errorCategory: configuredAiCount > 0 ? 'DATA_UNAVAILABLE' : 'CONFIGURATION_MISSING',
    affectedFeatures: ['AI writing', 'grammar', 'resume parsing'], affectedApis: ['/api/generate-*', '/api/ai/*'], affectedUiModules: ['/dashboard'], checkedAt }));

  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '';
  const chromiumPresent = chromiumPath ? fs.existsSync(chromiumPath) : false;
  services.push(service({ id: 'pdf-service', name: 'PDF Renderer', group: GROUP.INTEGRATIONS,
    state: chromiumPresent ? STATE.UNKNOWN : STATE.NOT_CONFIGURED,
    configuration: chromiumPresent ? CONFIG.CONFIGURED : CONFIG.NOT_CONFIGURED,
    reason: chromiumPresent ? 'A renderer executable exists, but no document render is performed by passive health collection.' : 'No configured Chromium renderer executable was found.',
    dependency: 'Chromium/Puppeteer', errorCategory: chromiumPresent ? 'DATA_UNAVAILABLE' : 'CONFIGURATION_MISSING',
    affectedFeatures: ['PDF exports'], affectedApis: ['/api/export*'], checkedAt }));
  services.push(service({ id: 'twilio-sms', name: 'SMS', group: GROUP.INTEGRATIONS,
    state: STATE.NOT_SUPPORTED, support: 'NOT_SUPPORTED', enabled: false, configuration: CONFIG.NOT_APPLICABLE,
    reason: 'No durable SMS delivery adapter is certified in this deployment.', dependency: 'None', checkedAt }));
  const cmsEnabled = flag('CMS_SCHEDULER_ENABLED', false);
  services.push(service({ id: 'cms-scheduler', name: 'CMS Scheduler', group: GROUP.WORKERS,
    state: cmsEnabled ? STATE.UNKNOWN : STATE.DISABLED, enabled: cmsEnabled,
    configuration: cmsEnabled ? CONFIG.CONFIGURED : CONFIG.DISABLED_BY_CONFIGURATION,
    reason: cmsEnabled ? 'The scheduler is enabled, but no durable heartbeat is recorded; liveness is not inferred.' : 'The CMS scheduler is disabled by configuration.',
    dependency: 'CMS scheduler heartbeat (not implemented)', errorCategory: cmsEnabled ? 'DATA_UNAVAILABLE' : null, checkedAt }));

  return {
    services,
    checkedAt,
    sources: {
      mariadb: databaseProbe.ok ? 'ok' : 'unavailable', settings: settingsProbe.ok ? 'ok' : 'unavailable',
      migrations: migrationProbe.ok ? 'ok' : 'unavailable', firebaseAuthentication: authProbe.ok ? 'ok' : 'unavailable',
      notificationOutbox: notificationProbe.ok ? 'ok' : 'unavailable', enterpriseOutbox: enterpriseQueueProbe.ok ? 'ok' : 'unavailable',
    },
  };
}

const MOUNTED_ROUTERS = Object.freeze([
  { prefix: '/api', module: () => require('../routes/ai') },
  { prefix: '/api', module: () => require('../routes/email') },
  { prefix: '/api/email', module: () => require('../routes/email') },
  { prefix: '/api/enterprise/m2m', module: () => require('../routes/enterpriseM2m').enterpriseM2mRouter || require('../routes/enterpriseM2m') },
  { prefix: '/api/enterprise', module: () => require('../routes/enterprise').enterpriseRouter },
  { prefix: '/api/admin', module: () => require('../routes/adminAudit').adminAuditRouter },
  { prefix: '/api/platform', module: () => require('../routes/platform').platformRouter },
]);
const PUBLIC_API_PATHS = new Set([
  '/api/healthz', '/api/health', '/api/readyz', '/healthz', '/readyz', '/health', '/api/platform/version',
  '/api/stripe-webhook', '/api/public-export', '/api/export-render-data', '/api/contact',
  '/api/auth/custom-password-reset', '/api/auth/verify-email-token', '/api/auth/set-user-password',
  '/api/auth/linkedin', '/api/auth/linkedin/callback', '/api/auth/github', '/api/auth/github/callback',
  '/api/auth/oauth/exchange', '/api/service-availability',
]);
const DEPENDENCY_RULES = Object.freeze([
  [/^\/api\/paypal\//, 'payments-paypal'], [/^\/api\/paytm\//, 'payments-paytm'],
  [/^\/api\/phonepe\//, 'payments-phonepe'], [/^\/api\/razorpay\//, 'payments-razorpay'],
  [/^\/api\/(pay|stripe-webhook)/, 'payments-stripe'], [/^\/api\/auth\/github/, 'github-oauth'],
  [/^\/api\/auth\/linkedin/, 'linkedin-oauth'], [/^\/api\/(notify|send-invoice-email)/, 'notification-outbox'],
  [/^\/api\/email/, 'email-smtp'], [/^\/api\/send-email/, 'email-smtp'], [/^\/api\/send-sms/, 'twilio-sms'],
  [/^\/api\/enterprise/, 'enterprise-tenancy'], [/^\/api\/(generate-|check-grammar|ai\/|parse-resume)/, 'ai-providers'],
  [/^\/api\/(export|public-export|export-docx)/, 'pdf-service'], [/^\/api\/(healthz|health|readyz)/, 'backend-api'],
  [/^\/api\/auth\//, 'authentication'],
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
  for (const [pattern, id] of DEPENDENCY_RULES) if (pattern.test(pathname)) return id;
  return null;
}
function collectRoutes(app) {
  const seen = new Set();
  const endpoints = [];
  const addLayerStack = (prefix, stack) => {
    for (const layer of stack || []) {
      if (!layer.route) continue;
      for (const routePath of (Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path])) {
        if (typeof routePath !== 'string') continue;
        const fullPath = `${prefix}${routePath}`.replace(/\/{2,}/g, '/');
        for (const method of Object.keys(layer.route.methods || {})) {
          if (method === '_all') continue;
          const key = `${method.toUpperCase()} ${fullPath}`;
          if (!seen.has(key)) { seen.add(key); endpoints.push({ method: method.toUpperCase(), path: fullPath }); }
        }
      }
    }
  };
  addLayerStack('', (app?.router || app?._router)?.stack);
  for (const mount of MOUNTED_ROUTERS) {
    try { const router = mount.module(); if (router?.stack) addLayerStack(mount.prefix, router.stack); } catch { /* unavailable modules are absent, not invented */ }
  }
  return endpoints.sort((a, b) => a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path));
}

function buildApiMatrix(app, servicesById) {
  const endpoints = collectRoutes(app).map(endpoint => {
    const dependencyId = dependencyFor(endpoint.path);
    const explicit = dependencyId ? servicesById.get(dependencyId) : null;
    const database = servicesById.get('database');
    const authentication = servicesById.get('authentication');
    const requirement = authRequirementFor(endpoint.path);
    const dependencies = explicit ? [explicit] : requirement === 'PUBLIC' ? [servicesById.get('backend-api')] : [database, authentication];
    const states = dependencies.filter(Boolean).map(item => item.state);
    const state = states.length ? worstState(states) : STATE.UNKNOWN;
    return {
      method: endpoint.method, path: endpoint.path, module: moduleForPath(endpoint.path), authentication: requirement,
      dependency: explicit ? explicit.name : requirement === 'PUBLIC' ? 'Backend API' : 'MariaDB + Firebase Authentication',
      dependencyId: dependencyId || (requirement === 'PUBLIC' ? 'backend-api' : 'database'),
      externalDependency: Boolean(explicit && explicit.group === GROUP.INTEGRATIONS), state,
      reason: explicit ? explicit.reason : 'State reflects registered-route dependency posture only; this endpoint was not request-exercised by health collection.',
      verification: 'DEPENDENCY_ONLY_NOT_REQUEST_EXERCISED',
    };
  });
  const counts = endpoints.reduce((all, endpoint) => ({ ...all, [endpoint.state]: (all[endpoint.state] || 0) + 1 }), {});
  return {
    total: endpoints.length, counts,
    operationalOrExpected: endpoints.filter(item => [STATE.OPERATIONAL, STATE.DISABLED, STATE.NOT_CONFIGURED].includes(item.state)).length,
    degraded: endpoints.filter(item => item.state === STATE.DEGRADED).length,
    unavailable: endpoints.filter(item => item.state === STATE.UNAVAILABLE).length,
    unknown: endpoints.filter(item => item.state === STATE.UNKNOWN).length,
    endpoints,
  };
}

function summarize(services) {
  const counts = Object.fromEntries(Object.values(STATE).map(state => [state, 0]));
  for (const item of services) counts[item.state] = (counts[item.state] || 0) + 1;
  const critical = services.filter(item => item.critical);
  let overall = 'OPERATIONAL';
  if (critical.some(item => item.state === STATE.UNAVAILABLE)) overall = 'CRITICAL';
  else if (services.some(item => [STATE.UNAVAILABLE, STATE.DEGRADED].includes(item.state))) overall = 'DEGRADED';
  else if (services.some(item => item.state === STATE.UNKNOWN)) overall = 'PARTIAL';
  return {
    overall,
    indicator: overall === 'CRITICAL' ? 'red' : overall === 'OPERATIONAL' ? 'green' : 'amber',
    counts, total: services.length, worstState: worstState(services.map(item => item.state)),
  };
}

async function computeSnapshot(app) {
  const { services, checkedAt, sources } = await buildServices(app);
  const servicesById = new Map(services.map(item => [item.id, item]));
  return {
    checkedAt, summary: summarize(services), sources, services,
    apiMatrix: buildApiMatrix(app, servicesById),
    groups: {
      [GROUP.CORE]: services.filter(item => item.group === GROUP.CORE).map(item => item.id),
      [GROUP.INTEGRATIONS]: services.filter(item => item.group === GROUP.INTEGRATIONS).map(item => item.id),
      [GROUP.WORKERS]: services.filter(item => item.group === GROUP.WORKERS).map(item => item.id),
    },
  };
}

async function getHealthSnapshot(app, { force = false } = {}) {
  const age = Date.now() - cachedAt;
  if (cachedSnapshot && (force ? age < MIN_FORCED_INTERVAL_MS : age < SNAPSHOT_TTL_MS)) return { ...cachedSnapshot, cached: true, cacheAgeMs: age };
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const snapshot = await computeSnapshot(app);
      cachedSnapshot = snapshot; cachedAt = Date.now();
      return { ...snapshot, cached: false, cacheAgeMs: 0 };
    } finally { inFlight = null; }
  })();
  return inFlight;
}
function resetHealthCache() { cachedSnapshot = null; cachedAt = 0; inFlight = null; }

async function getServiceAvailability(app) {
  const snapshot = await getHealthSnapshot(app);
  const byId = new Map(snapshot.services.map(item => [item.id, item]));
  const usable = id => byId.get(id)?.state === STATE.OPERATIONAL;
  return {
    checkedAt: snapshot.checkedAt,
    auth: { github: usable('github-oauth'), linkedin: usable('linkedin-oauth') },
    payments: {
      stripe: usable('payments-stripe'), paypal: usable('payments-paypal'), razorpay: usable('payments-razorpay'),
      paytm: usable('payments-paytm'), phonepe: usable('payments-phonepe'),
    },
    enterpriseTenancy: usable('enterprise-tenancy'),
  };
}

const TESTABLE_SERVICES = Object.freeze(['database', 'authentication', 'email-smtp']);
async function runServiceTest(app, serviceId) {
  if (!TESTABLE_SERVICES.includes(serviceId)) {
    throw Object.assign(new Error('This service does not expose a safe automated test'), { code: 'SERVICE_TEST_UNSUPPORTED', status: 400 });
  }
  let probe;
  if (serviceId === 'database') {
    probe = await observe('mariadb.test', () => getPool().query('SELECT 1 AS alive'));
  } else if (serviceId === 'authentication') {
    const identityAdmin = app?.get?.('firebaseAdmin');
    probe = await observe('firebase-auth.test', async () => {
      if (!identityAdmin?.auth) throw new Error('Firebase Authentication Admin adapter is not configured');
      return identityAdmin.auth().listUsers(1);
    });
  } else {
    const settingsProbe = await observe('mariadb.smtp-settings', () => loadMariaSettings(getPool()));
    if (!settingsProbe.ok) probe = settingsProbe;
    else {
      const smtp = resolveSmtp(settingsProbe.value.system_settings || {});
      probe = await observe('smtp.verify', async () => {
        if (!smtp.credentialed || !smtp.host || !smtp.port) throw Object.assign(new Error('SMTP configuration is missing'), { code: 'CONFIGURATION_MISSING' });
        if (!['ssl', 'tls', 'starttls'].includes(smtp.encryption)) throw Object.assign(new Error('Encrypted SMTP transport is required'), { code: 'CONFIGURATION_MISSING' });
        const target = await assertPublicNetworkTarget(smtp.host);
        const secure = smtp.encryption === 'ssl' || smtp.port === 465;
        const systemSettings = settingsProbe.value.system_settings || {};
        const stored = systemSettings.smtp || {};
        const transporter = nodemailer.createTransport({
          host: target.addresses[0], port: smtp.port, secure, requireTLS: !secure,
          auth: { user: process.env.SMTP_USER || stored.username, pass: process.env.SMTP_PASS || stored.password },
          tls: { rejectUnauthorized: true, servername: smtp.host, minVersion: 'TLSv1.2' },
          connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
        });
        return transporter.verify();
      });
    }
  }
  const result = {
    serviceId, passed: probe.ok, latencyMs: probe.latencyMs,
    detail: probe.ok ? `${serviceId} non-destructive probe succeeded in ${probe.latencyMs}ms.` : `${serviceId} probe failed: ${probe.error}`,
    errorCategory: probe.ok ? null : categorizeError(probe.error || probe.code),
  };
  recentTests.set(serviceId, { ...result, recordedAt: Date.now() });
  resetHealthCache();
  return result;
}

module.exports = {
  STATE, CONFIG, GROUP, TESTABLE_SERVICES,
  buildApiMatrix, categorizeError, collectRoutes, computeSnapshot, getHealthSnapshot,
  getServiceAvailability, resetHealthCache, runServiceTest, summarize,
  __internal: { resolvePaymentProviders, resolveOAuthProviders, resolveSmtp, dependencyFor, moduleForPath, authRequirementFor, worstState },
};
