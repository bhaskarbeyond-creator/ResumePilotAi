'use strict';

/**
 * Authoritative, secret-free platform configuration projection.
 *
 * Configuration has two very different owners in this product:
 *   - infrastructure operators own process environment, deployment identity,
 *     network policy, and secret-manager bindings;
 *   - Super Admins own explicitly approved runtime flags and product settings.
 *
 * This module is intentionally read-only. It never returns credential material,
 * private keys, bearer tokens, passwords, or secret values. It returns enough
 * metadata for the control plane to explain the current value, source, impact,
 * restart requirement, and safe owner of every discovered setting.
 */

const { FLAG_DEFINITIONS, getAllFlags } = require('./featureFlagService');
const { selectPaymentPair } = require('./paymentAdmin');

const FLAG_DESCRIPTIONS = Object.freeze({
  ENTERPRISE_TENANCY_ENABLED: {
    description: 'Enable the Enterprise multi-tenant control plane.',
    impact: 'Enables tenant-aware Enterprise APIs and the Enterprise console. It does not grant any user access; Firebase claims, tenant membership, and policy checks still apply.',
    dependencies: ['Firestore tenant registry', 'Enterprise repository', 'tenant encryption key', 'tenant job signing secret'],
    runtime: 'per-request',
    requiresRestart: false,
    owner: 'SUPER_ADMIN',
  },
  CMS_SCHEDULER_ENABLED: {
    description: 'Enable the scheduled blog publication worker.',
    impact: 'A worker instance polls Firestore and publishes due CMS posts.',
    dependencies: ['Firestore', 'exactly one scheduler worker'],
    runtime: 'startup',
    requiresRestart: true,
    owner: 'SUPER_ADMIN',
  },
  NOTIFICATION_OUTBOX_WORKER_ENABLED: {
    description: 'Enable the in-process notification outbox worker.',
    impact: 'This process claims and dispatches durable email/SMS outbox records.',
    dependencies: ['Firestore notification_outbox', 'SMTP or Twilio configuration'],
    runtime: 'startup',
    requiresRestart: true,
    owner: 'SUPER_ADMIN',
  },
  ENTERPRISE_OUTBOX_WORKER_ENABLED: {
    description: 'Enable the Enterprise durable outbox worker.',
    impact: 'This process claims and processes signed Enterprise job envelopes.',
    dependencies: ['Firestore enterprise_outbox', 'TENANT_JOB_SIGNING_SECRET'],
    runtime: 'startup',
    requiresRestart: true,
    owner: 'SUPER_ADMIN',
  },
  NOTIFICATION_OUTBOX_EXTERNAL_WORKER: {
    description: 'Declare that an external notification worker drains the outbox.',
    impact: 'Changes operational reporting only; it does not create a worker.',
    dependencies: ['External worker deployment'],
    runtime: 'per-request',
    requiresRestart: false,
    owner: 'SUPER_ADMIN',
  },
  PDF_RENDERER_ISOLATED: {
    description: 'Declare that PDF rendering runs in an isolated worker.',
    impact: 'Reports the PDF renderer as isolated only when the deployment actually provides that worker.',
    dependencies: ['Dedicated non-root renderer'],
    runtime: 'per-request',
    requiresRestart: false,
    owner: 'SUPER_ADMIN',
  },
  ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION: {
    description: 'Allow the non-production Firebase credential rotation endpoint.',
    impact: 'High-risk local/staging capability. It is hard-disabled in production and cannot be enabled from this UI.',
    dependencies: ['Firebase Admin SDK', 'deployment secret manager'],
    runtime: 'startup',
    requiresRestart: true,
    owner: 'INFRASTRUCTURE_ONLY',
  },
});

const SECRET_ENVIRONMENT = Object.freeze([
  ['FIREBASE_PRIVATE_KEY', 'Firebase Admin private key', 'firebase'],
  ['FIREBASE_SERVICE_ACCOUNT', 'Legacy Firebase service-account payload', 'firebase'],
  ['GOOGLE_APPLICATION_CREDENTIALS', 'Application Default Credential binding', 'firebase'],
  ['FIREBASE_WEB_API_KEY', 'Firebase Web API key (public but deployment-managed)', 'firebase'],
  ['REDIS_URL', 'Legacy Redis connection binding (not used by this deployment)', 'infrastructure'],
  ['TENANT_REDIS_URL', 'Legacy tenant Redis binding (not used by this deployment)', 'infrastructure'],
  ['ENTERPRISE_REDIS_URL', 'Legacy Enterprise Redis binding (not used by this deployment)', 'infrastructure'],
  ['ENTERPRISE_ENCRYPTION_KEY', 'Enterprise encryption key', 'security'],
  ['ENTERPRISE_ENCRYPTION_KEYS', 'Enterprise versioned encryption keys', 'security'],
  ['TENANT_JOB_SIGNING_SECRET', 'Tenant job envelope signing secret', 'security'],
  ['TENANT_ARTIFACT_SIGNING_SECRET', 'Tenant artifact token signing secret', 'security'],
  ['GEMINI_API_KEY', 'Gemini provider credential', 'ai'],
  ['OPENAI_API_KEY', 'OpenAI provider credential', 'ai'],
  ['NVIDIA_API_KEY', 'NVIDIA provider credential', 'ai'],
  ['GROQ_API_KEY', 'Groq provider credential', 'ai'],
  ['OPENROUTER_API_KEY', 'OpenRouter provider credential', 'ai'],
  ['DEEPSEEK_API_KEY', 'DeepSeek provider credential', 'ai'],
  ['STRIPE_SECRET', 'Stripe server credential', 'payments'],
  ['STRIPE_WEBHOOK_SECRET', 'Stripe webhook signing secret', 'payments'],
  ['PAYPAL_CLIENT_SECRET', 'PayPal client secret', 'payments'],
  ['RAZORPAY_KEY_SECRET', 'Razorpay key secret', 'payments'],
  ['PAYTM_MERCHANT_KEY', 'Paytm merchant key', 'payments'],
  ['PHONEPE_SALT_KEY', 'PhonePe salt key', 'payments'],
  ['SMTP_PASS', 'SMTP password or app key', 'communications'],
  ['FALLBACK_SMTP_PASS', 'Fallback SMTP password or app key', 'communications'],
  ['IMAP_PASS', 'IMAP password or app key', 'communications'],
  ['TWILIO_AUTH_TOKEN', 'Twilio auth token', 'communications'],
  ['LINKEDIN_CLIENT_SECRET', 'LinkedIn OAuth client secret', 'oauth'],
  ['GITHUB_CLIENT_SECRET', 'GitHub OAuth client secret', 'oauth'],
  ['CLOUDFLARE_API_TOKEN', 'Cloudflare API token', 'storage'],
  ['CLOUDFLARE_R2_ACCESS_KEY_ID', 'Cloudflare R2 access key', 'storage'],
  ['CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'Cloudflare R2 secret access key', 'storage'],
  ['CLOUDINARY_API_SECRET', 'Cloudinary API secret (adapter not implemented)', 'storage'],
  ['S3_SECRET_ACCESS_KEY', 'S3 secret access key (adapter not implemented)', 'storage'],
  ['AWS_SECRET_ACCESS_KEY', 'AWS secret access key (adapter not implemented)', 'storage'],
  ['S3_ACCESS_KEY_ID', 'S3 access key identifier (adapter not implemented)', 'storage'],
  ['AWS_ACCESS_KEY_ID', 'AWS access key identifier (adapter not implemented)', 'storage'],
  ['CLOUDINARY_API_KEY', 'Cloudinary API key (adapter not implemented)', 'storage'],
]);

const SAFE_ENVIRONMENT = Object.freeze([
  ['NODE_ENV', 'Runtime environment', 'runtime', false, false],
  ['PORT', 'Backend listening port', 'runtime', false, true],
  ['PROTOCOL', 'Public protocol', 'runtime', false, true],
  ['WEBSITE_NAME', 'Public hostname', 'deployment', false, true],
  ['PUBLIC_APP_URL', 'Canonical public application URL', 'deployment', false, true],
  ['COMMIT_SHA', 'Deployment commit identity override', 'deployment', false, false],
  ['ENTERPRISE_DATA_PROVIDER', 'Enterprise data-plane provider declaration', 'enterprise', false, true],
  ['ENTERPRISE_ENCRYPTION_PROVIDER', 'Enterprise encryption provider declaration', 'security', false, true],
  ['ENTERPRISE_ENCRYPTION_ACTIVE_KEY', 'Active enterprise encryption key version', 'security', false, true],
  ['FIREBASE_PROJECT_ID', 'Firebase project identifier', 'firebase', false, true],
  ['FIREBASE_DATABASE_URL', 'Firebase Realtime Database URL', 'firebase', false, true],
  ['FIREBASE_USE_ADC', 'Use Application Default Credentials', 'firebase', false, true],
  ['FIREBASE_CLIENT_EMAIL', 'Firebase service identity email', 'firebase', false, true],
  ['FIREBASE_STORAGE_BUCKET', 'Firebase Storage bucket', 'storage', false, true],
  ['ENTERPRISE_STORAGE_PROVIDER', 'Enterprise artifact storage adapter', 'storage', false, true],
  ['ENTERPRISE_STORAGE_BUCKET', 'Enterprise artifact storage bucket', 'storage', false, true],
  ['CORS_ALLOWED_ORIGINS', 'Exact browser origin allowlist', 'security', false, true],
  ['TRUST_PROXY_HOPS', 'Trusted reverse-proxy hop count', 'security', false, true],
  ['GLOBAL_RATE_LIMIT_MAX', 'Global API rate-limit maximum', 'security', false, true],
  ['SENSITIVE_AUTH_MAX_AGE_MS', 'Sensitive-operation authentication age', 'security', false, true],
  ['SUPER_ADMIN_MFA_REQUIRED', 'Super Admin MFA policy override', 'security', false, true],
  // Declares whether the Firebase project has the TOTP second-factor provider
  // enabled. Firebase Admin cannot probe this, so the platform reports the
  // declared value and marks it as requiring production verification rather
  // than assuming MFA works.
  ['FIREBASE_TOTP_MFA_ENABLED', 'Firebase TOTP multi-factor provider availability (declared)', 'security', false, true],
  ['AI_BASIC_DAILY_LIMIT', 'Basic account daily AI limit', 'ai', false, true],
  ['AI_PREMIUM_DAILY_LIMIT', 'Premium account daily AI limit', 'ai', false, true],
  ['AI_ADMIN_DAILY_LIMIT', 'Admin account daily AI limit', 'ai', false, true],
  ['AI_BURST_LIMIT', 'AI burst request limit', 'ai', false, true],
  ['AI_BURST_WINDOW_MS', 'AI burst window', 'ai', false, true],
  ['NOTIFICATION_HOURLY_LIMIT', 'Notification hourly limit', 'security', false, true],
  ['CONTACT_HOURLY_LIMIT', 'Contact hourly limit', 'security', false, true],
  ['EXPORT_HOURLY_LIMIT', 'Export hourly limit', 'security', false, true],
  ['SCRAPER_HOURLY_LIMIT', 'Scraper hourly limit', 'security', false, true],
  ['MESSAGING_FIVE_MINUTE_LIMIT', 'Messaging five-minute limit', 'security', false, true],
  ['CMS_SCHEDULER_INTERVAL_MS', 'CMS scheduler interval', 'workers', false, true],
  ['NOTIFICATION_OUTBOX_INTERVAL_MS', 'Notification worker interval', 'workers', false, true],
  ['ENTERPRISE_OUTBOX_INTERVAL_MS', 'Enterprise worker interval', 'workers', false, true],
  ['PLATFORM_HEALTH_CACHE_MS', 'Platform health cache interval', 'workers', false, true],
  ['PLATFORM_HEALTH_MIN_INTERVAL_MS', 'Minimum forced health-check interval', 'workers', false, true],
  ['PUPPETEER_EXECUTABLE_PATH', 'PDF renderer executable binding', 'workers', false, true],
  ['CHROMIUM_PATH', 'PDF renderer executable binding', 'workers', false, true],
  ['PDF_RENDERER_ISOLATED', 'PDF renderer isolation declaration', 'workers', false, true],
  ['CMS_SCHEDULER_ENABLED', 'CMS scheduler enablement', 'workers', false, true],
  ['NOTIFICATION_OUTBOX_WORKER_ENABLED', 'Notification outbox worker enablement', 'workers', false, true],
  ['NOTIFICATION_OUTBOX_EXTERNAL_WORKER', 'External notification worker declaration', 'workers', false, true],
  ['ENTERPRISE_OUTBOX_WORKER_ENABLED', 'Enterprise outbox worker enablement', 'workers', false, true],
  ['ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION', 'Runtime Firebase credential rotation policy', 'security', false, true],
  ['ENTERPRISE_M2M_KEY_RPM', 'Enterprise service-account request budget', 'security', false, true],
  ['PAYPAL_ENV', 'PayPal environment', 'payments', false, true],
  ['PAYTM_ENV', 'Paytm environment', 'payments', false, true],
  ['PAYTM_WEBSITE', 'Paytm website channel', 'payments', false, true],
  ['PAYTM_CHANNEL_ID', 'Paytm channel identifier', 'payments', false, true],
  ['PHONEPE_ENV', 'PhonePe environment', 'payments', false, true],
  ['PHONEPE_SALT_INDEX', 'PhonePe salt index', 'payments', false, true],
  ['RAZORPAY_KEY_ID', 'Razorpay public key identifier', 'payments', false, true],
  ['PAYTM_MID', 'Paytm merchant identifier', 'payments', false, true],
  ['PHONEPE_MERCHANT_ID', 'PhonePe merchant identifier', 'payments', false, true],
  ['PAYPAL_CLIENT_ID', 'PayPal client identifier', 'payments', false, true],
  ['GEMINI_MODEL', 'Gemini model', 'ai', false, true],
  ['OPENAI_MODEL', 'OpenAI model', 'ai', false, true],
  ['NVIDIA_MODEL', 'NVIDIA model', 'ai', false, true],
  ['GROQ_MODEL', 'Groq model', 'ai', false, true],
  ['OPENROUTER_MODEL', 'OpenRouter model', 'ai', false, true],
  ['DEEPSEEK_MODEL', 'DeepSeek model', 'ai', false, true],
  ['SMTP_HOST', 'Primary SMTP host', 'communications', false, true],
  ['SMTP_PORT', 'Primary SMTP port', 'communications', false, true],
  ['SMTP_ENCRYPTION', 'Primary SMTP transport encryption', 'communications', false, true],
  ['SMTP_USER', 'Primary SMTP username', 'communications', false, true],
  ['SMTP_USERNAME', 'Legacy SMTP username alias', 'communications', false, true],
  ['SMTP_ADMIN_EMAIL', 'SMTP administration address alias', 'communications', false, true],
  ['SMTP_SENDER_NAME', 'Primary SMTP sender name', 'communications', false, true],
  ['SMTP_REPLY_TO', 'Primary SMTP reply-to address', 'communications', false, true],
  ['FALLBACK_SMTP_HOST', 'Fallback SMTP host', 'communications', false, true],
  ['FALLBACK_SMTP_PORT', 'Fallback SMTP port', 'communications', false, true],
  ['FALLBACK_SMTP_ENCRYPTION', 'Fallback SMTP encryption', 'communications', false, true],
  ['FALLBACK_SMTP_USER', 'Fallback SMTP username', 'communications', false, true],
  ['IMAP_HOST', 'IMAP host', 'communications', false, true],
  ['IMAP_PORT', 'IMAP port', 'communications', false, true],
  ['IMAP_ENCRYPTION', 'IMAP transport encryption', 'communications', false, true],
  ['IMAP_USER', 'IMAP username', 'communications', false, true],
  ['TWILIO_ACCOUNT_SID', 'Twilio account identifier', 'communications', false, true],
  ['TWILIO_FROM_PHONE', 'Twilio sender number', 'communications', false, true],
  ['ADMIN_EMAIL', 'Operational administration address', 'communications', false, true],
  ['LINKEDIN_CLIENT_ID', 'LinkedIn OAuth client identifier', 'oauth', false, true],
  ['GITHUB_CLIENT_ID', 'GitHub OAuth client identifier', 'oauth', false, true],
  ['CLOUDFLARE_ZONE_ID', 'Cloudflare zone identifier', 'storage', false, true],
]);

function timestampToIso(value) {
  if (!value) return null;
  try {
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch (_) { return null; }
}

function sourceForEnv(env, key, storedPaths = []) {
  if (storedPaths.some(value => value !== undefined && value !== null && value !== '')) return 'firestore';
  if (env[key] !== undefined && String(env[key]).trim() !== '') return 'environment';
  return 'default';
}

function envItem(env, key, label, category, secret, requiresRestart) {
  const configured = secret ? Boolean(env[key] && String(env[key]).trim()) : undefined;
  let value;
  if (secret) value = configured ? 'CONFIGURED' : 'NOT_CONFIGURED';
  else if (key === 'FIREBASE_CLIENT_EMAIL' && env[key]) value = String(env[key]).replace(/^(.{3}).*(@.*)$/, '$1••••$2');
  else if (key === 'FIREBASE_DATABASE_URL' && env[key]) {
    try { const parsed = new URL(String(env[key])); value = `${parsed.protocol}//${parsed.host}`; } catch (_) { value = '[INVALID_URL]'; }
  } else if (key === 'CORS_ALLOWED_ORIGINS' && env[key]) value = String(env[key]).split(',').map(item => item.trim()).filter(Boolean).join(', ');
  else value = env[key] ?? null;
  return {
    key,
    label,
    category,
    value,
    configured,
    source: sourceForEnv(env, key),
    secret,
    editable: false,
    owner: 'INFRASTRUCTURE_ONLY',
    runtime: 'startup',
    requiresRestart,
    description: `${label} is supplied by the deployment environment.`,
    impact: 'Changing this value requires a controlled deployment or secret-manager update.',
    dependencies: [],
    lastChangedAt: null,
    changedBy: null,
    auditEvent: null,
  };
}

function storedItem(key, label, category, { configured = false, source = 'none', value = null, secret = false, editable = false, runtime = 'per-request', requiresRestart = false, description = '', impact = '', dependencies = [], lastChangedAt = null, changedBy = null, auditEvent = null } = {}) {
  return {
    key, label, category, value, configured, source, secret, editable,
    owner: editable ? 'SUPER_ADMIN' : 'INFRASTRUCTURE_ONLY', runtime, requiresRestart,
    description: description || `${label} status is derived from the server-side configuration store.`,
    impact: impact || (editable ? 'Changes are applied according to the runtime field policy.' : 'This setting is not editable through the platform UI.'),
    dependencies, lastChangedAt, changedBy, auditEvent,
  };
}

function configuredValue(...values) {
  return values.some(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function storedField(doc, paths = []) {
  for (const path of paths) {
    let value = doc;
    for (const part of path.split('.')) value = value?.[part];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function flagItem(key, flag, storedFlags) {
  const definition = FLAG_DEFINITIONS[key] || {};
  const description = FLAG_DESCRIPTIONS[key] || {};
  const stored = storedFlags?.[key] || {};
  const changedAt = timestampToIso(stored.changedAt);
  return storedItem(key, definition.description || description.description || key, 'feature-flags', {
    configured: true,
    source: flag.source || 'default',
    value: flag.value === true,
    secret: false,
    editable: description.owner === 'SUPER_ADMIN',
    runtime: description.runtime || (definition.requiresRestart ? 'startup' : 'per-request'),
    // A Firestore override is read at request time for runtime flags. An
    // environment-sourced value cannot change until the process restarts.
    requiresRestart: flag.source === 'environment' ? true : (description.requiresRestart ?? definition.requiresRestart === true),
    description: description.description || definition.description || key,
    impact: description.impact || definition.impact || '',
    dependencies: description.dependencies || definition.dependencies || [],
    lastChangedAt: changedAt,
    changedBy: stored.changedBy || null,
    auditEvent: changedAt ? 'FEATURE_FLAG_CHANGED' : null,
  });
}

async function readDocs(db) {
  if (!db) return { docs: {}, flags: {}, error: 'Firestore is unavailable.', unavailable: [] };
  const paths = {
    payment: 'settings/payment_providers',
    ai: 'settings/ai_providers',
    oauth: 'settings/oauth_providers',
    admin: 'settings/admin_configuration',
    public: 'data/public_config',
    legacy: 'data/system_settings',
    subscriptions: 'data/subscriptions',
    flag: 'settings/feature_flags',
  };
  const unavailable = [];
  const entries = await Promise.all(Object.entries(paths).map(async ([name, path]) => {
    try {
      const snap = await db.doc(path).get();
      return [name, snap.exists ? (snap.data() || {}) : {}];
    } catch (_) {
      unavailable.push(name);
      return [name, null];
    }
  }));
  const docs = Object.fromEntries(entries);
  return { docs, flags: docs.flag || {}, error: unavailable.length ? `Configuration sources unavailable: ${unavailable.join(', ')}` : null, unavailable };
}

/**
 * Return the entire configuration census as a safe control-plane projection.
 * `db` is optional so local diagnostics can still show infrastructure posture.
 */
async function getPlatformConfiguration({ db = null, env = process.env } = {}) {
  const { docs, flags: storedFlags, error, unavailable } = await readDocs(db);
  const allFlags = await getAllFlags(db);
  const groups = { infrastructure: {}, runtime: {}, featureFlags: {}, integrations: {}, workers: {}, security: {}, governance: {} };

  for (const [key, label, category, secret, restart] of SAFE_ENVIRONMENT) {
    const item = envItem(env, key, label, category, secret, restart);
    groups[category === 'workers' ? 'workers' : category === 'security' ? 'security' : category === 'runtime' || category === 'deployment' ? 'runtime' : 'infrastructure'][key] = item;
  }
  for (const [key, label, category] of SECRET_ENVIRONMENT) {
    const item = envItem(env, key, label, category, true, true);
    groups.integrations[key] = item;
  }

  const flagDoc = storedFlags || {};
  for (const [key, flag] of Object.entries(allFlags || {})) {
    groups.featureFlags[key] = flagItem(key, flag, flagDoc);
  }

  const payment = docs.payment || {};
  const publicConfig = docs.public || {};
  const providers = {
    razorpay: { label: 'Razorpay', paths: ['keySecret', 'keyId'], env: ['RAZORPAY_KEY_SECRET', 'RAZORPAY_KEY_ID'], ui: '/adm/settings?tab=subscriptionsSettings' },
    stripe: { label: 'Stripe', paths: ['secretKey'], env: ['STRIPE_SECRET'], ui: '/adm/settings?tab=subscriptionsSettings' },
    paypal: { label: 'PayPal', paths: ['clientSecret', 'clientId'], env: ['PAYPAL_CLIENT_SECRET', 'PAYPAL_CLIENT_ID'], ui: '/adm/settings?tab=subscriptionsSettings' },
    paytm: { label: 'Paytm', paths: ['merchantKey', 'mid'], env: ['PAYTM_MERCHANT_KEY', 'PAYTM_MID'], ui: '/adm/settings?tab=subscriptionsSettings' },
    phonepe: { label: 'PhonePe', paths: ['saltKey', 'merchantId'], env: ['PHONEPE_SALT_KEY', 'PHONEPE_MERCHANT_ID'], ui: '/adm/settings?tab=subscriptionsSettings' },
  };
  for (const [key, meta] of Object.entries(providers)) {
    const doc = payment[key] || {};
    const requiresId = meta.paths.length > 1;
    const pair = selectPaymentPair({
      envId: requiresId ? env[meta.env[1]] : '',
      envSecret: env[meta.env[0]],
      storedId: requiresId ? storedField(doc, [meta.paths[1]]) : '',
      storedSecret: storedField(doc, [meta.paths[0]]),
      requiresId,
    });
    const configured = Boolean(pair.secret && (!requiresId || pair.id));
    const hasAnyCredential = Boolean(pair.id || pair.secret);
    groups.integrations[`payment.${key}`] = storedItem(`payment.${key}`, meta.label, 'payments', {
      configured,
      source: pair.source,
      value: configured ? 'CONFIGURED' : hasAnyCredential ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED',
      secret: false,
      editable: true,
      runtime: 'per-request',
      requiresRestart: false,
      description: `${meta.label} server credential and public checkout identifiers. Secret fields are write-only and never returned.`,
      impact: `Controls ${meta.label} checkout availability and payment verification.`,
      dependencies: [meta.label, 'payment_orders', 'server-side amount/catalog binding'],
      auditEvent: 'PAYMENT_SETTINGS_UPDATED',
      changedBy: null,
      lastChangedAt: null,
    });
    groups.integrations[`payment.${key}.environment`] = storedItem(`payment.${key}.environment`, `${meta.label} environment`, 'payments', {
      configured: true,
      source: env[`${key.toUpperCase()}_ENV`] ? 'environment' : 'default',
      value: env[`${key.toUpperCase()}_ENV`] || (key === 'paypal' ? 'sandbox' : key === 'razorpay' ? (String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_live') ? 'live' : 'test') : 'sandbox'),
      editable: false,
      runtime: 'per-request',
      requiresRestart: true,
      description: `The ${meta.label} provider environment is infrastructure-controlled.`,
      impact: 'Switching between sandbox and production changes the external account receiving payment requests.',
      dependencies: [meta.label],
    });
  }

  const aiDoc = docs.ai || {};
  for (const [provider, envName] of [['gemini', 'GEMINI_API_KEY'], ['openai', 'OPENAI_API_KEY'], ['nvidia', 'NVIDIA_API_KEY'], ['groq', 'GROQ_API_KEY'], ['openrouter', 'OPENROUTER_API_KEY'], ['deepseek', 'DEEPSEEK_API_KEY']]) {
    const stored = storedField(aiDoc, [`${provider}.apiKey`]);
    const configured = configuredValue(stored, env[envName]);
    groups.integrations[`ai.${provider}`] = storedItem(`ai.${provider}`, `${provider} AI provider`, 'ai', {
      configured,
      source: stored ? 'firestore' : env[envName] ? 'environment' : 'none',
      value: configured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      secret: true,
      editable: true,
      runtime: 'per-request',
      requiresRestart: false,
      description: 'Provider credentials are stored server-side. Entering an empty field preserves the existing credential; replacement is explicit.',
      impact: 'Controls whether this provider can be selected by the governed AI runtime.',
      dependencies: ['AI provider API', 'AI governance settings'],
      auditEvent: 'AI_PROVIDER_SETTINGS_UPDATED',
    });
  }

  const oauthDoc = docs.oauth || {};
  const adminSocial = docs.admin?.socialAuth || {};
  const legacySocial = docs.legacy?.socialAuth || {};
  for (const [provider, envPrefix] of [['github', 'GITHUB'], ['linkedin', 'LINKEDIN']]) {
    const storedClientId = storedField(oauthDoc, [`${provider}.clientId`]) || storedField(adminSocial, [`${provider}ClientId`]) || storedField(legacySocial, [`${provider}ClientId`]);
    const storedClientSecret = storedField(oauthDoc, [`${provider}.clientSecret`]) || storedField(adminSocial, [`${provider}ClientSecret`]) || storedField(legacySocial, [`${provider}ClientSecret`]);
    const envClientId = env[`${envPrefix}_CLIENT_ID`];
    const envClientSecret = env[`${envPrefix}_CLIENT_SECRET`];
    const environmentComplete = Boolean(envClientId && envClientSecret);
    const storedComplete = Boolean(storedClientId && storedClientSecret);
    const source = environmentComplete ? 'environment' : storedComplete ? 'firestore' : envClientId || envClientSecret ? 'environment-partial' : storedClientId || storedClientSecret ? 'firestore-partial' : 'none';
    const clientId = source.startsWith('environment') ? envClientId : storedClientId;
    const clientSecret = source.startsWith('environment') ? envClientSecret : storedClientSecret;
    const configured = Boolean(clientId && clientSecret);
    const partial = source.endsWith('partial');
    groups.integrations[`oauth.${provider}`] = storedItem(`oauth.${provider}`, `${provider} OAuth`, 'oauth', {
      configured,
      source,
      value: configured ? 'CONFIGURED' : partial ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED',
      secret: true,
      editable: true,
      runtime: 'per-request',
      requiresRestart: false,
      description: 'OAuth client credentials are server-side. Client IDs may be shown to operators; client secrets remain write-only.',
      impact: `Controls ${provider} sign-in and account linking availability.`,
      dependencies: [`${provider} OAuth application`, 'callback URL allowlist'],
      auditEvent: 'ADMIN_SETTINGS_UPDATED',
    });
  }

  const smtp = docs.admin?.smtp || docs.legacy?.smtp || {};
  const fallback = docs.admin?.fallbackSmtp || docs.legacy?.fallbackSmtp || {};
  const twilio = docs.admin?.twilio || docs.legacy?.twilio || {};
  const smtpPair = selectPaymentPair({ envId: env.SMTP_USER, envSecret: env.SMTP_PASS, storedId: smtp.username, storedSecret: smtp.password });
  const fallbackPair = selectPaymentPair({ envId: env.FALLBACK_SMTP_USER, envSecret: env.FALLBACK_SMTP_PASS, storedId: fallback.username, storedSecret: fallback.password });
  const twilioPair = selectPaymentPair({ envId: env.TWILIO_ACCOUNT_SID, envSecret: env.TWILIO_AUTH_TOKEN, storedId: twilio.accountSid, storedSecret: twilio.authToken });
  const smtpConfigured = Boolean(smtpPair.id && smtpPair.secret && (smtp.host || env.SMTP_HOST));
  const fallbackConfigured = Boolean(fallbackPair.id && fallbackPair.secret);
  const twilioSender = String(twilio.fromPhoneNumber || env.TWILIO_FROM_PHONE || '').trim();
  const twilioConfigured = Boolean(twilioPair.id && twilioPair.secret && twilioSender);
  groups.integrations['smtp.primary'] = storedItem('smtp.primary', 'Primary SMTP', 'communications', {
    configured: smtpConfigured,
    source: smtpPair.source,
    value: smtpConfigured && (smtpPair.source.startsWith('environment') ? configuredValue(env.SMTP_HOST) : configuredValue(smtp.host || env.SMTP_HOST)) ? 'CONFIGURED' : smtpPair.source.endsWith('partial') ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED',
    secret: true, editable: true, runtime: 'per-request', requiresRestart: false,
    description: 'Outbound mail configuration. Empty password fields preserve the current server credential.',
    impact: 'Controls verification, reset, notification, invoice, and alert delivery.',
    dependencies: ['SMTP relay', 'notification outbox'], auditEvent: 'SMTP_SETTINGS_UPDATED',
  });
  groups.integrations['smtp.fallback'] = storedItem('smtp.fallback', 'Fallback SMTP', 'communications', {
    configured: fallbackConfigured,
    source: fallbackPair.source,
    value: fallback.enabled === true ? (fallbackConfigured ? 'CONFIGURED' : fallbackPair.source.endsWith('partial') ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED') : 'DISABLED',
    secret: true, editable: true, runtime: 'per-request', requiresRestart: false,
    description: 'Optional fallback relay used when the primary provider is unavailable.',
    impact: 'Provides a second delivery path; it is not a substitute for a healthy primary relay.',
    dependencies: ['Fallback SMTP relay'], auditEvent: 'SMTP_SETTINGS_UPDATED',
  });
  groups.integrations['twilio'] = storedItem('twilio', 'Twilio SMS', 'communications', {
    configured: twilioConfigured,
    source: twilioPair.source,
    value: twilio.enableSmsAlerts === true ? (twilioConfigured ? 'CONFIGURED' : twilioPair.source.endsWith('partial') ? 'PARTIALLY_CONFIGURED' : 'NOT_CONFIGURED') : 'DISABLED',
    secret: true, editable: true, runtime: 'per-request', requiresRestart: false,
    description: 'SMS alert configuration. Auth tokens are write-only.', impact: 'Controls SMS security and operational notifications.', dependencies: ['Twilio Programmable Messaging'], auditEvent: 'TWILIO_SETTINGS_UPDATED',
  });

  const configuration = {
    generatedAt: new Date().toISOString(),
    sourceStatus: {
      firestore: !db ? 'UNAVAILABLE' : error ? 'PARTIAL' : 'AVAILABLE',
      unavailableDocuments: unavailable || [],
    },
    groups,
    summary: {
      totalItems: Object.values(groups).reduce((sum, group) => sum + Object.keys(group).length, 0),
      secretItems: Object.values(groups).reduce((sum, group) => sum + Object.values(group).filter(item => item.secret).length, 0),
      editableItems: Object.values(groups).reduce((sum, group) => sum + Object.values(group).filter(item => item.editable).length, 0),
      runtimeControlledItems: Object.values(groups).reduce((sum, group) => sum + Object.values(group).filter(item => item.runtime === 'per-request').length, 0),
      restartRequiredItems: Object.values(groups).reduce((sum, group) => sum + Object.values(group).filter(item => item.requiresRestart).length, 0),
    },
    policy: {
      secretsNeverReturned: true,
      infrastructureEditing: 'NOT_SUPPORTED_IN_ADMIN_UI',
      runtimeEditing: 'SUPER_ADMIN_ONLY_WHERE_EXPLICITLY_MARKED',
      enterpriseTenancy: groups.featureFlags.ENTERPRISE_TENANCY_ENABLED || null,
    },
  };
  return configuration;
}

module.exports = { getPlatformConfiguration, FLAG_DESCRIPTIONS, SECRET_ENVIRONMENT, SAFE_ENVIRONMENT, timestampToIso };
